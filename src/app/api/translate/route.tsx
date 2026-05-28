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

// ─── Translation Prompt ───────────────────────────────────────────────────────

function buildTranslationPrompt(fileName: string, targetLanguage: string): string {
  return `You are a pharmaceutical regulatory expert and expert translator. You are given a pharmaceutical artwork PDF file.

FILE: ${fileName}
TARGET LANGUAGE FOR TRANSLATION: ${targetLanguage}

══════════════════════════════════════════
TASK — EXTRACT, CATEGORIZE, AND TRANSLATE ALL TEXT
══════════════════════════════════════════

Read the ENTIRE artwork file and extract ALL visible text. Organize the text into the following FIXED categories/sections. For each section that exists in the artwork, extract every single piece of text verbatim.

CATEGORIES:
  [SPEC TABLE: CARTON]         ← technical specification table for carton (dimensions, doc no., item code, Pantone, etc.)
  [CARTON: FRONT PANEL]        ← front face text of the carton
  [CARTON: BACK PANEL]         ← back face text of the carton
  [CARTON: ALL SIDES]          ← ALL side panels + spine + top + bottom MERGED into one block
  [SPEC TABLE: FOIL/LABEL]     ← technical spec table for foil/label/blister (if present)
  [FOIL / LABEL]               ← foil strip / blister / primary label text (if present)
  [SPEC TABLE: PACKING INSERT] ← packing insert header/spec table (if present)
  [PACKING INSERT: BODY]       ← packing insert full body text (if present)
  [BARCODE / QR]               ← any barcode numbers, QR code references
  [REGULATORY MARKS]           ← regulatory symbols, CE marks, recycling symbols descriptions
  [OTHER]                      ← any text that doesn't fit the above categories

EXTRACTION RULES:
1. VERBATIM — read every character exactly as printed. Do NOT rephrase or guess.
2. MERGE SIDE PANELS — all carton side faces go under [CARTON: ALL SIDES].
3. NO COLOR SWATCHES — extract the "Pantone No." text row from spec tables but NOT color blocks/squares.
4. ITEM CODES — read alphanumeric codes exactly as printed (O vs 0 can look similar — read as printed).
5. UNREADABLE — if you genuinely cannot read a section, note it as [UNREADABLE: location].
6. NOT PRESENT — if a section does not exist, note it as [NOT PRESENT].
7. ALL LANGUAGES — extract text in ALL languages exactly as written.

══════════════════════════════════════════
TRANSLATION RULES
══════════════════════════════════════════

After extracting all text:

1. IDENTIFY the language of each text block. If the text is already in ${targetLanguage}, keep it as-is.
2. TRANSLATE all text that is NOT in ${targetLanguage} into ${targetLanguage}.
3. For MIXED-LANGUAGE text (e.g., a sentence with both English and Arabic), translate only the non-${targetLanguage} portions.
4. PRESERVE all numbers, codes, item numbers, document numbers, registration numbers, barcodes, and Pantone references exactly as-is — do NOT translate these.
5. PRESERVE all brand names, product names, and company names exactly as-is.
6. PHARMACEUTICAL ACCURACY — use correct pharmaceutical/medical terminology in translations.
7. For each translated block, note the ORIGINAL LANGUAGE in parentheses.

══════════════════════════════════════════
OUTPUT FORMAT — HTML
══════════════════════════════════════════

Output a single, well-structured HTML document. ALL styling must be INLINE (no <style> tags, no external CSS).

The HTML structure must be:

1. A HEADER section with:
   - File name
   - Total sections found
   - Languages detected

2. For EACH category that exists, output a SECTION containing:
   a. A section header with the category name
   b. A two-column table:
      - Column 1: "Original Text" — the verbatim extracted text
      - Column 2: "Translated (${targetLanguage})" — the translated text
      - If the original is already in ${targetLanguage}, the translated column should show "— Same as original —"
   c. A small label under the section indicating the detected source language(s)

3. A FOOTER with:
   - Summary of languages detected
   - Total text blocks translated
   - Note: "AI-generated translation — verify with qualified translator before regulatory submission"

USE THIS EXACT HTML TEMPLATE STRUCTURE:

<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 960px; margin: 0 auto; color: #1a1523;">

  <!-- Header -->
  <div style="background: linear-gradient(135deg, #6c47ff 0%, #8a6bff 100%); border-radius: 12px; padding: 24px 28px; margin-bottom: 24px; color: #fff;">
    <div style="font-size: 11px; opacity: 0.7; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 4px;">Artwork Translation Report</div>
    <div style="font-size: 20px; font-weight: 700;">FILE_NAME_HERE</div>
    <div style="display: flex; gap: 16px; margin-top: 12px; font-size: 12px; opacity: 0.85;">
      <span>📄 Sections: COUNT</span>
      <span>🌐 Languages: LANGUAGES_LIST</span>
      <span>🔄 Target: ${targetLanguage}</span>
    </div>
  </div>

  <!-- For EACH category section -->
  <div style="background: #fff; border: 1px solid #e8e4ff; border-radius: 12px; margin-bottom: 16px; overflow: hidden; box-shadow: 0 1px 3px rgba(108,71,255,0.08);">
    <div style="background: linear-gradient(135deg, #f0ecff 0%, #fff 100%); padding: 12px 20px; border-bottom: 1px solid #e8e4ff;">
      <span style="font-weight: 700; font-size: 14px; color: #6c47ff;">[CATEGORY NAME]</span>
      <span style="float: right; font-size: 11px; color: #6b6882; font-weight: 500;">Source: LANGUAGE_NAME</span>
    </div>
    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
      <tr style="background: #f8f7ff;">
        <th style="padding: 10px 16px; text-align: left; font-weight: 600; color: #6b6882; border-bottom: 1px solid #e8e4ff; width: 50%;">Original Text</th>
        <th style="padding: 10px 16px; text-align: left; font-weight: 600; color: #6b6882; border-bottom: 1px solid #e8e4ff; width: 50%;">Translated (${targetLanguage})</th>
      </tr>
      <!-- One row per text block -->
      <tr>
        <td style="padding: 10px 16px; border-bottom: 1px solid #f0ecff; vertical-align: top; line-height: 1.6;">ORIGINAL_TEXT_HERE</td>
        <td style="padding: 10px 16px; border-bottom: 1px solid #f0ecff; vertical-align: top; line-height: 1.6;">TRANSLATED_TEXT_HERE</td>
      </tr>
    </table>
  </div>
  <!-- End of section -->

  <!-- Footer -->
  <div style="background: #f8f7ff; border: 1px solid #e8e4ff; border-radius: 10px; padding: 16px 20px; margin-top: 8px; font-size: 12px; color: #6b6882;">
    <div style="display: flex; gap: 20px; margin-bottom: 8px;">
      <span><strong>Languages Detected:</strong> LANGUAGES</span>
      <span><strong>Sections Translated:</strong> COUNT</span>
    </div>
    <div style="font-style: italic; color: #a09cb8; font-size: 11px;">⚠️ AI-generated translation — verify with a qualified translator before regulatory submission.</div>
  </div>
</div>

CRITICAL RULES:
- ALL styling INLINE only. NO <style> tags.
- Use <br> to separate lines within table cells.
- Output raw HTML only — no markdown, no code fences.
- Preserve ALL original text verbatim in the "Original Text" column.
- Be extremely accurate with pharmaceutical terminology.
- If a section is [NOT PRESENT], do NOT include it in the output.
- DO NOT invent or fabricate any text. Only extract what is actually visible.

Now read the file and produce the translation report.`.trim();
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const sessionId = randomUUID().slice(0, 8);
  const log = createLogger(`translate-${sessionId}`);

  log.info(`=== Translation session ${sessionId} started at ${new Date().toISOString()} ===`);

  try {
    // 1. Parse form
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const targetLanguage = (formData.get("targetLanguage") as string) || "English";

    if (!file) {
      log.error("Missing file");
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    log.info(`file: "${file.name}" | ${(file.size / 1024 / 1024).toFixed(2)} MB`);
    log.info(`target language: ${targetLanguage}`);

    // 2. Upload file to Gemini
    log.info("Uploading file to Gemini…");
    const uploaded = await uploadFileToGemini(file);
    log.info(`file URI: ${uploaded.fileUri}`);

    // 3. Wait for file to be ACTIVE
    log.info("Waiting for file to become ACTIVE…");
    await waitForGeminiFileActive(uploaded.fileName);
    log.info("file → ACTIVE");

    // 4. Single Gemini call — file + translation prompt
    log.info("Running Gemini translation call…");
    const t = Date.now();
    const rawResult = await callGemini([
      { text: buildTranslationPrompt(file.name, targetLanguage) },
      { file_data: { mime_type: uploaded.mimeType, file_uri: uploaded.fileUri } },
    ]);
    log.info(`Gemini call done in ${((Date.now() - t) / 1000).toFixed(1)}s`);

    // 5. Clean up result — strip markdown fences if any
    const translationHtml = rawResult
      .replace(/```html/gi, "")
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    log.info(`\n${"─".repeat(60)}\nTRANSLATION RESULT\n${"─".repeat(60)}\n${translationHtml.slice(0, 500)}…\n${"─".repeat(60)}`);
    log.info(`=== Translation session ${sessionId} complete ===`);

    return NextResponse.json({
      translation: translationHtml,
      fileName: file.name,
      targetLanguage,
      fileUri: uploaded.fileUri,
    });

  } catch (err: any) {
    log.error(`Fatal: ${err?.message || err}`);
    console.error("[translate]", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}
