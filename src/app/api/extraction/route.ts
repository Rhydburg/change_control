/* eslint-disable @typescript-eslint/no-explicit-any */
export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { randomUUID } from "crypto";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
// Flash: supports thinkingBudget:0 (thinking fully disabled) — fast, good for text extraction
const FLASH_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`;
// Pro: thinking always on — accurate, used only for comparison
const PRO_URL   = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_API_KEY}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry<T>(fn: () => Promise<T>, label: string, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try { return await fn(); }
    catch (err: unknown) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const transient = ["fetch failed","UND_ERR_SOCKET","ECONNRESET","ECONNREFUSED","other side closed"].some(s => msg.includes(s));
      if (!transient || i === attempts) throw err;
      const delay = 1000 * 2 ** (i - 1);
      console.warn(`[${label}] attempt ${i} failed, retrying in ${delay}ms`);
      await sleep(delay);
    }
  }
  throw lastErr;
}

// ─── Gemini Files API ─────────────────────────────────────────────────────────

async function uploadFileToGemini(file: File) {
  const startRes = await withRetry(() => fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": file.size.toString(),
        "X-Goog-Upload-Header-Content-Type": file.type || "application/octet-stream",
      },
      body: JSON.stringify({ file: { displayName: `${Date.now()}-${file.name}` } }),
    }
  ), `upload-start:${file.name}`);

  if (!startRes.ok) throw new Error(`Upload start failed: ${await startRes.text()}`);
  const uploadUrl = startRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) throw new Error("Missing Gemini upload URL");

  const buffer = Buffer.from(await file.arrayBuffer());
  const uploadRes = await withRetry(() => fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": buffer.length.toString(),
      "Content-Type": file.type || "application/octet-stream",
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: buffer,
  }), `upload-finalize:${file.name}`);

  if (!uploadRes.ok) throw new Error(`Upload finalize failed: ${await uploadRes.text()}`);
  const uploaded = await uploadRes.json();
  const fileName = uploaded?.file?.name;
  const fileUri  = uploaded?.file?.uri;
  if (!fileName || !fileUri) throw new Error("Gemini upload returned no name/uri");
  return { fileName, fileUri, mimeType: file.type || "application/octet-stream" };
}

async function waitForGeminiFileActive(fileName: string) {
  for (let i = 0; i < 24; i++) {
    const res = await withRetry(
      () => fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${GEMINI_API_KEY}`),
      `poll:${fileName}`
    );
    if (!res.ok) throw new Error(`File poll failed: ${await res.text()}`);
    const data  = await res.json();
    const state = (data?.state ?? data?.file?.state ?? "").toUpperCase();
    if (state === "ACTIVE") return;
    if (state === "FAILED") throw new Error("Gemini file processing failed");
    await sleep(2500);
  }
  throw new Error("Timed out waiting for Gemini file");
}

// ─── Gemini generate ──────────────────────────────────────────────────────────
// Two variants:
//   callGeminiExtract  — thinkingBudget:0 (thinking OFF, fast ~15s, no reasoning needed for copy-paste extraction)
//   callGeminiCompare  — thinkingBudget default (thinking ON, slower, reasoning needed for accurate diff)

async function callGeminiExtract(parts: object[]): Promise<string> {
  const res = await withRetry(() => fetch(FLASH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      generationConfig: {
        temperature: 0.0,
        topK: 1,
        topP: 0.1,
        maxOutputTokens: 65536,
        thinkingConfig: { thinkingBudget: 0 },  // Flash supports full disable — extraction needs no reasoning
      },
      contents: [{ role: "user", parts }],
    }),
  }), "gemini-extract");

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Gemini extract failed (${res.status})`);
  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) throw new Error(data?.error?.message || "Gemini extract returned empty response");
  return text;
}

async function callGeminiCompare(parts: object[]): Promise<string> {
  const res = await withRetry(() => fetch(PRO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      generationConfig: {
        temperature: 0.0,
        topK: 1,
        topP: 0.1,
        maxOutputTokens: 65536,
        // thinking enabled (default) — comparison needs reasoning to detect subtle diffs
      },
      contents: [{ role: "user", parts }],
    }),
  }), "gemini-compare");

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Gemini compare failed (${res.status})`);
  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) throw new Error(data?.error?.message || "Gemini compare returned empty response");
  return text;
}


// ─── Extraction prompt ────────────────────────────────────────────────────────
// Uses a FIXED TEMPLATE — the model fills in content under predefined section headers.
// This ensures both files always produce identical section names for reliable comparison.
// The model CANNOT create new sections or rename sections.

const EXTRACTION_PROMPT = `You are a pharmaceutical artwork text extractor.

Fill in the FIXED TEMPLATE below with ALL visible text from this pharmaceutical artwork PDF.

STRICT RULES — violating any of these is a critical failure:
1. VERBATIM ONLY — copy every character exactly as printed. Do NOT rephrase, summarize, or paraphrase.
2. DO NOT INVENT — never fill in text from pharmaceutical knowledge. Only write what is clearly visible.
3. DO NOT SKIP — every visible character must appear somewhere in the output. Nothing may be omitted.
4. UNREADABLE — for any text you cannot clearly read, write: [UNREADABLE: brief location description]
5. NOT PRESENT — if an entire section does not exist in the document, write: [NOT PRESENT]
6. SECTION NAMES — output EXACTLY the section headers shown in the template below, unchanged. Do NOT create new sections or rename sections.
7. MERGE SIDE PANELS — all carton side panels, spine, top, bottom text goes under the single "CARTON: ALL SIDE + SPINE PANELS" section, regardless of how many physical faces exist.
8. TABLE FORMAT — for specification tables, write each row as:   Field Name: Value
9. COLOR SWATCHES — do NOT extract visual color swatches/blocks as separate rows. The spec table contains a "Pantone No." text row — extract only that row. If you see printed colored squares/rectangles alongside the Pantone names, those are visual swatches; ignore them as visual elements and do NOT create entries like "PANTONE 151 C: [Color Block]". Only the text Pantone No. row matters.

FIXED TEMPLATE — fill in each section:

=== SPEC TABLE: CARTON ===
[Copy every row from the carton technical specification table verbatim as Field Name: Value]

=== CARTON: FRONT PANEL ===
[All text visible on the carton front face, verbatim]

=== CARTON: BACK PANEL ===
[All text visible on the carton back face, verbatim]

=== CARTON: ALL SIDE + SPINE PANELS ===
[ALL text from ALL carton side panels, spine, top, bottom faces combined. Normalize rotated text to reading direction. Include everything.]

=== SPEC TABLE: FOIL / LABEL / BLISTER ===
[Copy every row from the foil/label/blister technical specification table verbatim as Field Name: Value. If not present, write [NOT PRESENT]]

=== FOIL / LABEL / BLISTER ===
[All text visible on the foil strip, blister pack, or primary label — verbatim. Include rotated text normalized to reading direction. If not present, write [NOT PRESENT]]

=== SPEC TABLE: PACKING INSERT ===
[Copy every row from the packing insert header/specification table verbatim as Field Name: Value. If not present, write [NOT PRESENT]]

=== PACKING INSERT: BODY ===
[All body text of the packing insert/leaflet verbatim. If not present, write [NOT PRESENT]]

Output the filled template now.`.trim();

// ─── Comparison prompt ────────────────────────────────────────────────────────

function buildComparisonPrompt(text1: string, text2: string): string {
  return `You are a strict pharmaceutical regulatory expert preparing an Artwork Change Control comparison.

You will receive structured text extracted from two pharmaceutical artwork files (organized by section).

STRICT ANTI-HALLUCINATION RULES:
1. Use ONLY the extracted text provided below. Do NOT use pharmaceutical knowledge or training data.
2. VERBATIM — copy field values exactly as they appear. Do NOT rephrase or summarize.
3. ONLY DIFFERENCES — omit all content that is identical in both files.
4. [UNREADABLE] rule — if EITHER file has [UNREADABLE] for a field, SKIP that field. Do NOT flag it as a difference.
5. ABSENT field rule — if a field clearly exists in one file but is clearly absent in the other (not unreadable), mark the absent side as "Not mentioned".
6. File 1 = CURRENT / PREVIOUS column always. File 2 = NEW / REVISED column always.
7. Cross-component rule — if the same change appears in multiple components (e.g. item code changes on CARTON and FOIL), report it for EACH component separately.
8. Do NOT invent, assume, or fill in any value not explicitly present in the extracted text.
9. NO SUMMARIES EVER — even for very long sections (e.g. PACKING INSERT BODY), you MUST quote the specific lines that differ verbatim. Do NOT write a paragraph describing what changed. Do NOT write a summary of the content. If two long blocks of text are different but you cannot identify the specific line-level differences, write: [PACKING INSERT BODY CHANGED — compare manually] and move on. Never write a narrative summary.

COMPONENT LABELS — normalize visible section names to these:
- Technical Specification Table, Spec Table → [TECH TABLE]
- Carton Front/Back/Side/Top/Bottom, Mono Carton → [CARTON]
- Foil Strip, Alu-Alu, Blister, Aluminium Strip → [FOIL]
- Label Front/Back, Primary Label, Tube → [LABEL]
- Package Insert, Packing Insert, Leaflet → [PACKING INSERT]

OUTPUT — exactly two things in this order:
1. <!-- REASONING: one-line summary of all changes found -->
2. The HTML table below — 3 rows only.

<table style="width:100%; border-collapse:collapse; border:1px solid #000; font-family:Arial,sans-serif; font-size:13px;">
  <tr style="background:#f0f0f0;">
    <td colspan="3" style="padding:10px; font-weight:bold; border:1px solid #000;">CL#### — DOC CODE — PRODUCT NAME</td>
  </tr>
  <tr style="background:#e8e8e8;">
    <td style="padding:8px; border:1px solid #000; font-weight:bold; width:33%;">Current / Previous State</td>
    <td style="padding:8px; border:1px solid #000; font-weight:bold; width:33%;">New / Revised State</td>
    <td style="padding:8px; border:1px solid #000; font-weight:bold; width:34%;">Scientific Rationale</td>
  </tr>
  <tr>
    <td style="padding:8px; border:1px solid #000; vertical-align:top;">
      <strong style="font-weight:bold;">[CARTON]</strong><br>
      1. [verbatim old value]<br>
      2. [verbatim old value]<br>
      <br>
      <strong style="font-weight:bold;">[FOIL]</strong><br>
      1. [verbatim old value]
    </td>
    <td style="padding:8px; border:1px solid #000; vertical-align:top;">
      <strong style="font-weight:bold;">[CARTON]</strong><br>
      1. [verbatim new value]<br>
      2. [verbatim new value]<br>
      <br>
      <strong style="font-weight:bold;">[FOIL]</strong><br>
      1. [verbatim new value]
    </td>
    <td style="padding:8px; border:1px solid #000; vertical-align:top;">
      Regulatory rationale for all changes...
    </td>
  </tr>
</table>

FORMATTING RULES:
- ALL styling INLINE only. NO <style> tags. NO external CSS.
- Use <br> to separate list items. Do NOT use <ul> or <ol>.
- Number every difference within a component: 1., 2., 3.
- Bold every component name: <strong style="font-weight:bold;">[COMPONENT]</strong>
- Separate components with <br><br> inside a cell.
- EXACTLY 3 ROWS TOTAL in the table.

=== EXTRACTED TEXT — FILE 1 (Current/Previous) ===

${text1}

=== EXTRACTED TEXT — FILE 2 (New/Revised) ===

${text2}

Provide the HTML comparison output now.`.trim();
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const sessionId = randomUUID().slice(0, 8);
  const log = createLogger(`extraction-${sessionId}`);

  log.info(`=== Session ${sessionId} started at ${new Date().toISOString()} ===`);

  try {
    // 1. Parse form
    const formData = await req.formData();
    const file1 = formData.get("file1") as File | null;
    const file2 = formData.get("file2") as File | null;

    if (!file1 || !file2) {
      log.error("Missing file1 or file2");
      return NextResponse.json({ error: "Missing files" }, { status: 400 });
    }

    log.info(`file1: "${file1.name}" | ${(file1.size / 1024 / 1024).toFixed(2)} MB`);
    log.info(`file2: "${file2.name}" | ${(file2.size / 1024 / 1024).toFixed(2)} MB`);

    // 2. Upload both files to Gemini (parallel)
    log.info("Uploading both files to Gemini Files API (parallel)…");
    const [up1, up2] = await Promise.all([
      uploadFileToGemini(file1),
      uploadFileToGemini(file2),
    ]);
    log.info(`file1 URI: ${up1.fileUri}`);
    log.info(`file2 URI: ${up2.fileUri}`);

    // 3. Wait for both to be ACTIVE (parallel)
    log.info("Waiting for files to become ACTIVE…");
    await Promise.all([
      waitForGeminiFileActive(up1.fileName).then(() => log.info("file1 → ACTIVE")),
      waitForGeminiFileActive(up2.fileName).then(() => log.info("file2 → ACTIVE")),
    ]);

    // 4. Extract structured text from both files (parallel — thinking OFF for speed)
    log.info("Extracting structured text (parallel, thinking disabled)…");
    const t4 = Date.now();
    const [text1, text2] = await Promise.all([
      callGeminiExtract([
        { text: EXTRACTION_PROMPT },
        { file_data: { mime_type: up1.mimeType, file_uri: up1.fileUri } },
      ]),
      callGeminiExtract([
        { text: EXTRACTION_PROMPT },
        { file_data: { mime_type: up2.mimeType, file_uri: up2.fileUri } },
      ]),
    ]);
    log.info(`Extraction done in ${((Date.now() - t4) / 1000).toFixed(1)}s — file1: ${text1.length} chars | file2: ${text2.length} chars`);

    // Log full extracted texts
    log.info(`\n${"─".repeat(60)}\nEXTRACTED — FILE 1: ${file1.name}\n${"─".repeat(60)}\n${text1}\n${"─".repeat(60)}`);
    log.info(`\n${"─".repeat(60)}\nEXTRACTED — FILE 2: ${file2.name}\n${"─".repeat(60)}\n${text2}\n${"─".repeat(60)}`);

    // 5. Compare extracted texts (text-only, no PDFs — thinking ON for accuracy)
    log.info("Running comparison on extracted texts (thinking enabled)…");
    const t5 = Date.now();
    const rawComparison = await callGeminiCompare([{ text: buildComparisonPrompt(text1, text2) }]);
    log.info(`Comparison done in ${((Date.now() - t5) / 1000).toFixed(1)}s`);

    const comparison = rawComparison
      .replace(/```html/gi, "")
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    // Log final comparison HTML
    log.info(`\n${"─".repeat(60)}\nCOMPARISON RESULT\n${"─".repeat(60)}\n${comparison}\n${"─".repeat(60)}`);
    log.info(`=== Session ${sessionId} complete ===`);

    return NextResponse.json({ comparison, files: [up1.fileUri, up2.fileUri] });

  } catch (err: any) {
    log.error(`Fatal: ${err?.message || err}`);
    console.error("[extraction]", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}