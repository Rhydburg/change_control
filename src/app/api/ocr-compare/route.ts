/**
 * POST /api/ocr-compare
 *
 * Phase 2: Take pre-extracted text from Phase 1 and send to Gemini for
 * pharmaceutical artwork comparison. Returns HTML comparison result.
 *
 * Body (JSON): { text1: string, text2: string, fileName1?: string, fileName2?: string, sessionId?: string }
 * Returns: { comparison: string (HTML) }
 */

export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import { randomUUID } from "crypto";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_API_KEY}`;

export async function POST(req: Request) {
  const sessionId = randomUUID().slice(0, 8);
  const log = createLogger(`compare-${sessionId}`);

  log.info(`=== OCR Compare Session ${sessionId} started ===`);
  log.info(`Request received at ${new Date().toISOString()}`);

  try {
    // ── Step 1: Parse JSON body ───────────────────────────────────────────
    log.step("STEP 1", "Parsing request body");

    const body = await req.json();
    const { text1, text2, fileName1 = "File 1", fileName2 = "File 2" } = body as {
      text1: string;
      text2: string;
      fileName1?: string;
      fileName2?: string;
      sessionId?: string;
    };

    if (!text1 || !text2) {
      log.error("Missing text1 or text2 in request body");
      return NextResponse.json({ error: "Missing extracted text" }, { status: 400 });
    }

    log.info(`text1 length: ${text1.length} chars (${fileName1})`);
    log.info(`text2 length: ${text2.length} chars (${fileName2})`);
    log.step("STEP 1 DONE", "Request body parsed");

    // ── Step 2: Build Gemini prompt ───────────────────────────────────────
    log.step("STEP 2", "Building Gemini comparison prompt");

    const prompt = `You are a strict, literal pharmaceutical regulatory expert preparing an Artwork Change Control comparison.

The text below was OCR-extracted from two pharmaceutical artwork PDF files. Use ONLY this extracted text — do not invent or assume data.

CRITICAL ANTI-HALLUCINATION RULES:
- VERBATIM EXTRACTION ONLY: Copy text exactly as it appears. Do NOT summarize or paraphrase.
- DO NOT INVENT DATA: If a field is missing in one file, output "Not mentioned".
- Compare ONLY DIFFERENCES. Ignore and omit identical content.
- Keep File 1 data in CURRENT column, File 2 data in NEW column ALWAYS.

ALIGNMENT & NORMALIZATION RULES:
1. MASTER INVENTORY: Identify every component in EITHER file and compare side-by-side.
2. COMPONENT NORMALIZATION:
   - Map 'Mono Carton', 'Box', 'Outer Packaging' to [CARTON].
   - Map 'Tube', 'Primary Label' to [LABEL].
   - Map 'Alu-Alu', 'Blister', 'Aluminium Strip' to [FOIL].
   - Map 'Package Insert', 'Leaflet' to [PACKING INSERT].
3. Use the 'Component' field within embedded technical spec tables as primary anchor.

OUTPUT STRUCTURE:
1. An HTML comment block <!-- REASONING: brief diff summary -->
2. The final HTML Table.

<output_format>
<table style="width:100%; border-collapse:collapse; border:1px solid #000; font-family:Arial,sans-serif; font-size:13px;">
  <tr style="background:#f0f0f0;">
    <td colspan="3" style="padding:10px; font-weight:bold; border:1px solid #000;">CL#### - DOCUMENT_CODE - PRODUCT NAME</td>
  </tr>
  <tr style="background:#e8e8e8;">
    <td style="padding:8px; border:1px solid #000; font-weight:bold; width:33%;">Current / Previous State</td>
    <td style="padding:8px; border:1px solid #000; font-weight:bold; width:33%;">New / Revised State</td>
    <td style="padding:8px; border:1px solid #000; font-weight:bold; width:34%;">Scientific Rationale</td>
  </tr>
  <tr>
    <td style="padding:8px; border:1px solid #000; vertical-align:top;">[CARTON]<br>1. [diff]<br><br>[FOIL]<br>1. [diff]</td>
    <td style="padding:8px; border:1px solid #000; vertical-align:top;">[CARTON]<br>1. [diff]<br><br>[FOIL]<br>1. [diff]</td>
    <td style="padding:8px; border:1px solid #000; vertical-align:top;">Scientific rationale...</td>
  </tr>
</table>
</output_format>

FORMATTING RULES:
1. ALL styling INLINE only. NO <style> tags.
2. Use <br> to separate items. Do NOT use <ul> or <ol>.
3. Numbered lists (1., 2., 3.) within columns.
4. Bold component names: <strong style="font-weight:bold;">[CARTON]</strong>.
5. EXACTLY 3 ROWS TOTAL (header + column-names + data).

---

=== EXTRACTED TEXT — FILE 1 (Current/Previous): ${fileName1} ===

${text1}

---

=== EXTRACTED TEXT — FILE 2 (New/Revised): ${fileName2} ===

${text2}

---

Provide the HTML comparison output now.`.trim();

    log.info(`Prompt length: ${prompt.length} chars`);
    log.step("STEP 2 DONE", "Prompt built");

    // ── Step 3: Call Gemini ───────────────────────────────────────────────
    log.step("STEP 3", "Calling Gemini 2.5 Pro for comparison");

    const geminiRes = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        generationConfig: {
          temperature: 0.0,
          topK: 1,
          topP: 0.1,
        },
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
      }),
    });

    const aiData = await geminiRes.json();

    if (!geminiRes.ok) {
      const errMsg = aiData?.error?.message || "Gemini request failed";
      log.error(`Gemini API error: ${errMsg}`);
      return NextResponse.json({ error: errMsg, details: aiData }, { status: geminiRes.status });
    }

    log.info("Gemini API call succeeded");
    log.step("STEP 3 DONE", "Gemini response received");

    // ── Step 4: Extract and sanitize response ─────────────────────────────
    log.step("STEP 4", "Extracting HTML from Gemini response");

    const rawText: string =
      aiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    if (!rawText) {
      log.error("Gemini returned empty response");
      throw new Error(aiData?.error?.message || "No response from Gemini");
    }

    const comparison = rawText
      .replace(/```html/gi, "")
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    log.info(`Comparison HTML length: ${comparison.length} chars`);
    log.step("STEP 4 DONE", "Comparison HTML ready");

    // ── Done ──────────────────────────────────────────────────────────────
    log.info(`=== Session ${sessionId} completed successfully ===`);

    return NextResponse.json({ comparison, sessionId, logFile: log.logFile });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`Fatal error: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
