/* eslint-disable @typescript-eslint/no-explicit-any */
export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { randomUUID } from "crypto";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${GEMINI_API_KEY}`;

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

// ─── Gemini call ──────────────────────────────────────────────────────────────

async function callGemini(parts: object[]): Promise<string> {
  const res = await withRetry(() => fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      generationConfig: { temperature: 0.0, topK: 1, topP: 0.1, maxOutputTokens: 65536 },
      contents: [{ role: "user", parts }],
    }),
  }), "gemini");

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Gemini failed (${res.status})`);
  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) throw new Error(data?.error?.message || "Gemini returned empty response");
  return text;
}

// ─── Prompt ───────────────────────────────────────────────────────────────────
// Single call: both PDFs provided simultaneously.
// Incorporates all lessons from the multi-call experiment:
//   • Fixed section template → consistent structure, no layout ambiguity
//   • No color swatch entries → no [Color Block] false positives
//   • Merge all side panels → no cross-panel "not mentioned" false positives
//   • No summaries ever → verbatim diffs or [COMPARE MANUALLY] flag
//   • [UNREADABLE] skip rule → no extraction gaps causing false differences
//   • Cross-component reporting → same change listed per component
//   • Item code rule → treat O and 0 as the same character to avoid false code diffs

function buildPrompt(file1Name: string, file2Name: string): string {
  return `You are a pharmaceutical regulatory expert performing an Artwork Change Control comparison.

You are given TWO pharmaceutical artwork PDF files:
- FILE 1 (CURRENT / PREVIOUS): ${file1Name}
- FILE 2 (NEW / REVISED): ${file2Name}

══════════════════════════════════════════
STEP 1 — EXTRACT TEXT FROM BOTH FILES
══════════════════════════════════════════

For EACH file, read ALL visible text and mentally organize it into this FIXED structure:

  [SPEC TABLE: CARTON]       ← technical spec table for carton
  [CARTON: FRONT PANEL]      ← front face text
  [CARTON: BACK PANEL]       ← back face text
  [CARTON: ALL SIDES]        ← ALL side panels + spine + top + bottom MERGED into one block
  [SPEC TABLE: FOIL/LABEL]   ← technical spec table for foil/label/blister (if present)
  [FOIL / LABEL]             ← foil strip / blister / primary label text (if present)
  [SPEC TABLE: PACKING INSERT] ← packing insert header table (if present)
  [PACKING INSERT: BODY]     ← packing insert full body text (if present)

EXTRACTION RULES (apply to BOTH files):
1. VERBATIM — read every character exactly as printed. Do NOT rephrase or guess.
2. MERGE SIDE PANELS — all carton side faces (regardless of how many) go under [CARTON: ALL SIDES].
3. NO COLOR SWATCHES — extract the "Pantone No." text row from the spec table. Do NOT extract printed color blocks/squares as separate entries. No "[Color Block]" entries.
4. ITEM CODES — when reading alphanumeric codes (e.g. ROPSP2218-01), the letter O and digit 0 look similar in pharmaceutical fonts. Read them as printed; do not substitute one for the other.
5. UNREADABLE — if you genuinely cannot read a section, note it as [UNREADABLE: location] for that section.
6. NOT PRESENT — if a section does not exist in that file, note it as [NOT PRESENT].

══════════════════════════════════════════
STEP 2 — COMPARE AND OUTPUT DIFFERENCES
══════════════════════════════════════════

After reading both files, compare them section by section.

COMPARISON RULES:
1. ONLY DIFFERENCES — list only content that differs between the two files. Omit identical content.
2. VERBATIM VALUES — copy the exact text that differs. Do NOT rephrase, summarize, or describe.
3. [UNREADABLE] SKIP — if EITHER file has [UNREADABLE] for a field, SKIP that field entirely. Do not flag it as a difference.
4. ABSENT FIELD — if a specific field is clearly present in one file and clearly absent (not unreadable) in the other, write the field value in the column where it exists, and "Not mentioned" in the column where it is absent.
5. ABSENT COMPONENT — if an ENTIRE section/component (e.g. [FOIL], [PACKING INSERT]) is [NOT PRESENT] in one file:
   - In the column where the component EXISTS: write its actual text content verbatim, exactly as you would for any other field.
   - In the column where it is [NOT PRESENT]: write exactly: "Component not included in this artwork file."
   - Do NOT write invented descriptions like "Foil/Tube artwork component is present." or any similar summary. Only verbatim content or the exact phrase above.
6. CROSS-COMPONENT — if the same change appears in multiple components (e.g. item code updated on both CARTON and FOIL), report it for EACH component separately.
7. NO SUMMARIES EVER — even for long sections like PACKING INSERT BODY, quote only the specific lines that differ verbatim. Do NOT write a descriptive paragraph.
8. ITEM CODES — if two codes differ only by O/0 substitution (e.g. R0PSP vs ROPSP), treat them as IDENTICAL — do NOT flag as a difference.
9. NO INVENTION — do NOT use pharmaceutical knowledge to fill in or interpret any value.

COMPONENT LABELS to use in output:
  [TECH TABLE]         for spec tables
  [CARTON]             for carton panels and sides
  [FOIL]               for foil/blister/label
  [PACKING INSERT]     for packing insert

══════════════════════════════════════════
STEP 3 — OVERALL CONFIDENCE RATING
══════════════════════════════════════════

After identifying all differences, assess your overall confidence in the accuracy of this comparison.

Rate every difference you identified as HIGH, MEDIUM, or LOW (for internal counting only — do NOT output badges):
  HIGH   — complete sentence/paragraph change, whole component absent/present, registration number added, clear large-text difference
  MEDIUM — 1–5 word difference in regulatory text, formatting/punctuation difference, structurally ambiguous field
  LOW    — 1–2 character difference in any alphanumeric code (item code, doc no., reg no., barcode) — high OCR confusion risk

Output this count as a comment (it will be stripped before display):
  <!-- CONFIDENCE_SUMMARY: {"high": N, "medium": N, "low": N} -->

══════════════════════════════════════════
STEP 4 — DESIGN / VISUAL DIFFERENCES
══════════════════════════════════════════

Look at BOTH files visually (not just the text) and identify any DESIGN or VISUAL differences:

  • PANTONE / COLOUR — Has a colour scheme changed? Are Pantone references different on the artwork itself (not just in the spec table)?
  • LOGO — Is the company/brand logo visually different? Different version, position, size, or style?
  • LAYOUT / ARRANGEMENT — Has the position of any major text block or graphic moved noticeably?
  • GRAPHIC ELEMENTS — Are there new borders, boxes, icons, symbols, or decorative elements added or removed?
  • BACKGROUND — Has the background colour or pattern changed?
  • FONT STYLE — Is there a visible font weight or style change (e.g., from regular to bold) on any prominent text?

If you observe NO design differences, output exactly: [NO DESIGN DIFFERENCES OBSERVED]
Do NOT guess or invent. Only report what is clearly visible.

══════════════════════════════════════════
OUTPUT FORMAT
══════════════════════════════════════════

Output exactly FOUR things in this order:

1. <!-- REASONING: one-line summary of all differences found -->

2. <!-- CONFIDENCE_SUMMARY: {"high": N, "medium": N, "low": N} -->

3. HTML comparison table (4 rows, inline styles only, no <style> tags).
   NOTE: The first header row must contain EXACTLY the placeholder text {{CONFIDENCE_BADGE}} — the backend will replace it with the actual percentage.

<table style="width:100%; border-collapse:collapse; border:1px solid #000; font-family:Arial,sans-serif; font-size:13px;">
  <tr style="background:#f0f0f0;">
    <td colspan="3" style="padding:10px; font-weight:bold; border:1px solid #000;">CL#### — DOC CODE — PRODUCT NAME {{CONFIDENCE_BADGE}}</td>
  </tr>
  <tr style="background:#e8e8e8;">
    <td style="padding:8px; border:1px solid #000; font-weight:bold; width:33%;">Current / Previous State</td>
    <td style="padding:8px; border:1px solid #000; font-weight:bold; width:33%;">New / Revised State</td>
    <td style="padding:8px; border:1px solid #000; font-weight:bold; width:34%;">Scientific Rationale</td>
  </tr>
  <tr>
    <td style="padding:8px; border:1px solid #000; vertical-align:top;">
      [text differences — current / previous values verbatim]
    </td>
    <td style="padding:8px; border:1px solid #000; vertical-align:top;">
      [text differences — new / revised values verbatim]
    </td>
    <td style="padding:8px; border:1px solid #000; vertical-align:top;">
      Regulatory rationale for all changes...
    </td>
  </tr>
  <tr style="background:#fdf4ff;">
    <td style="padding:8px; border:1px solid #000; vertical-align:top;">
      <strong style="font-weight:bold;">[DESIGN / VISUAL]</strong><br>
      [design observations from FILE 1 — what was present before]
    </td>
    <td style="padding:8px; border:1px solid #000; vertical-align:top;">
      <strong style="font-weight:bold;">[DESIGN / VISUAL]</strong><br>
      [design observations from FILE 2 — what changed]
    </td>
    <td style="padding:8px; border:1px solid #000; vertical-align:top; font-style:italic; color:#6b21a8; font-size:0.8rem;">
      Design differences are AI-observed from visual inspection. Colour accuracy and subtle layout shifts may not be fully reliable — manual visual verification recommended.
    </td>
  </tr>
</table>

FORMATTING RULES:
- ALL styling INLINE only. NO <style> tags.
- Use <br> to separate items within a cell.
- Number every difference: 1., 2., 3.
- Bold every component label: <strong style="font-weight:bold;">[COMPONENT]</strong>
- Blank line between components: <br><br>
- EXACTLY 4 ROWS in the table (header, column headers, text diffs, design diffs).
- NO markdown. Output raw HTML only.
- Do NOT put {{CONFIDENCE_BADGE}} anywhere except the first header <td>.

Now read FILE 1 and FILE 2, then output the comparison.`.trim();
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
    log.info("Uploading both files to Gemini (parallel)…");
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

    // 4. Single Gemini call — both files + full prompt
    log.info("Running single Gemini call (extract + compare)…");
    const t = Date.now();
    const rawResult = await callGemini([
      { text: buildPrompt(file1.name, file2.name) },
      { file_data: { mime_type: up1.mimeType, file_uri: up1.fileUri } },
      { file_data: { mime_type: up2.mimeType, file_uri: up2.fileUri } },
    ]);
    log.info(`Gemini call done in ${((Date.now() - t) / 1000).toFixed(1)}s`);

    // Parse confidence summary from the model's output comment
    const confidenceSummary = { high: 0, medium: 0, low: 0 };
    const confMatch = rawResult.match(/<!--\s*CONFIDENCE_SUMMARY:\s*(\{[^}]+\})\s*-->/);
    if (confMatch) {
      try {
        const parsed = JSON.parse(confMatch[1]);
        confidenceSummary.high   = Number(parsed.high   ?? 0);
        confidenceSummary.medium = Number(parsed.medium ?? 0);
        confidenceSummary.low    = Number(parsed.low    ?? 0);
      } catch { /* ignore parse errors */ }
    }
    log.info(`Confidence summary — HIGH: ${confidenceSummary.high} | MEDIUM: ${confidenceSummary.medium} | LOW (manual): ${confidenceSummary.low}`);
    if (confidenceSummary.low > 0) {
      log.info(`⚠ ${confidenceSummary.low} item(s) flagged LOW confidence — strict manual verification required`);
    }

    // Compute overall confidence % from parsed summary and inject into header row
    const total = confidenceSummary.high + confidenceSummary.medium + confidenceSummary.low;
    const overallPct = total === 0 ? 100 : Math.round((confidenceSummary.high * 100 + confidenceSummary.medium * 50) / total);
    const pctColor = overallPct >= 80 ? "#065f46" : overallPct >= 50 ? "#92400e" : "#991b1b";
    const pctBg    = overallPct >= 80 ? "#d1fae5" : overallPct >= 50 ? "#fef3c7" : "#fee2e2";
    const pctBorder= overallPct >= 80 ? "#059669" : overallPct >= 50 ? "#d97706" : "#dc2626";
    const confidenceBadgeHtml = `<span style="float:right;padding:2px 10px;border-radius:5px;background:${pctBg};color:${pctColor};border:1px solid ${pctBorder};font-size:0.78rem;font-weight:700;">${overallPct}% confidence</span>`;
    log.info(`Overall confidence score: ${overallPct}% (HIGH: ${confidenceSummary.high}, MEDIUM: ${confidenceSummary.medium}, LOW: ${confidenceSummary.low})`);

    // Strip CONFIDENCE_SUMMARY comment, inject confidence badge, clean markdown artifacts
    const comparison = rawResult
      .replace(/<!--\s*CONFIDENCE_SUMMARY:[^-]*-->/gi, "")
      .replace("{{CONFIDENCE_BADGE}}", confidenceBadgeHtml)
      .replace(/```html/gi, "")
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    log.info(`\n${"─".repeat(60)}\nCOMPARISON RESULT\n${"─".repeat(60)}\n${comparison}\n${"─".repeat(60)}`);
    log.info(`=== Session ${sessionId} complete ===`);

    return NextResponse.json({ comparison, confidenceSummary, files: [up1.fileUri, up2.fileUri] });

  } catch (err: any) {
    log.error(`Fatal: ${err?.message || err}`);
    console.error("[extraction]", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}