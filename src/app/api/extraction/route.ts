/* eslint-disable @typescript-eslint/no-explicit-any */
export const runtime = "nodejs";

import { NextResponse } from "next/server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadFileToGemini(file: File) {
  const startRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Upload-Protocol": "resumable",
        "X-Goog-Upload-Command": "start",
        "X-Goog-Upload-Header-Content-Length": file.size.toString(),
        "X-Goog-Upload-Header-Content-Type":
          file.type || "application/octet-stream",
      },
      body: JSON.stringify({
        file: {
          displayName: `${Date.now()}-${file.name}`,
        },
      }),
    }
  );

  if (!startRes.ok) {
    const errText = await startRes.text();
    throw new Error(`Gemini start upload failed: ${errText}`);
  }

  const uploadUrl = startRes.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    throw new Error("Missing Gemini upload URL");
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": buffer.length.toString(),
      "Content-Type": file.type || "application/octet-stream",
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: buffer,
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Gemini finalize upload failed: ${errText}`);
  }

  const uploaded = await uploadRes.json();
  const fileName = uploaded?.file?.name;
  const fileUri = uploaded?.file?.uri;

  if (!fileName || !fileUri) {
    throw new Error("Gemini upload did not return file name or uri");
  }

  return { fileName, fileUri, mimeType: file.type || "application/octet-stream" };
}

async function waitForGeminiFileActive(fileName: string) {
  for (let i = 0; i < 24; i++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${GEMINI_API_KEY}`
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini get file failed: ${errText}`);
    }

    const data = await res.json();
    const state = data?.state?.toUpperCase?.() || data?.file?.state?.toUpperCase?.();

    if (state === "ACTIVE") {
      return data;
    }

    if (state === "FAILED") {
      throw new Error("Gemini file processing failed");
    }

    await sleep(2500);
  }

  throw new Error("Timed out waiting for Gemini file processing");
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file1 = formData.get("file1") as File | null;
    const file2 = formData.get("file2") as File | null;

    if (!file1 || !file2) {
      return NextResponse.json({ error: "Missing files" }, { status: 400 });
    }

    const uploaded1 = await uploadFileToGemini(file1);
    const uploaded2 = await uploadFileToGemini(file2);

    await waitForGeminiFileActive(uploaded1.fileName);
    await waitForGeminiFileActive(uploaded2.fileName);

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `You are a pharmaceutical regulatory expert preparing Artwork Change Control comparison output.

CRITICAL RULES:
- Extract EXACTLY what is visible. Do NOT infer missing information.
- Compare ONLY DIFFERENCES. Do NOT include matching/identical content.
- Keep File 1 data in CURRENT column, File 2 data in NEW column ALWAYS.
- ALL content must be in NUMBERED LIST format (1., 2., 3., etc.).
- Use ONLY inline styles (style="...") - NO <style> tags.
- If a field is identical in both files, DO NOT list it anywhere - completely remove it.
- If a field exists only in one file, show it only in that column and mark other as "Not mentioned".
- ONE ROW ONLY for all data and differences combined.
- Work with ALL languages - do not assume English only. Extract and compare text regardless of language.
- Don't create any more rows than mentioned. 
- Last Row contains all the differences organized by artwork component.

**TEXT EXTRACTION RULES (CRITICAL):**
- Extract ALL text visible in the artwork, including text that is rotated, upside-down, or at angles
- When extracting rotated text:
  a. Read the text as if it were rotated back to normal orientation
  b. Normalize it - write it in standard reading format (left-to-right, top-to-bottom)
  c. Example: If text is rotated 180°, read it correctly and write it normally in output
  d. Example: If text is rotated 90°, read it correctly and write it normally in output
- NEVER output garbled, mirrored, or reversed characters
- Always present extracted text in clean, readable, normalized format
- Do NOT skip rotated text - capture it but normalize the output
- Never Mentions words like Rotated text, Upside-down text, etc. 

INPUT: 2 pharmaceutical artwork files (Current/Previous and New/Revised)

OUTPUT STRUCTURE:

MAIN COMPARISON TABLE (inline styled):

ROW 1 (Title Row - full width):
- Span all columns: "CL#### - DOCUMENT_CODE - PRODUCT NAME" (Show document code, product name in this row)

ROW 2 (Column Headers):
- Column 1: "Current / Previous State"
- Column 2: "New / Revised State"  
- Column 3: "Scientific Rationale"

ROW 3 (Single Data Row - ALL differences combined by component):
- Column 1: ONE paragraph with NUMBERED LIST of ALL differences from File 1, ORGANIZED BY ARTWORK COMPONENT
  Structure within column: 
  [CARTON]<br>1. [difference]<br>2. [difference]<br><br>[FOIL]<br>1. [difference]<br>2. [difference]<br><br>[LABEL]<br>1. [difference]<br>2. [difference]<br><br>[PACKING INSERT]<br>1. [difference]<br>2. [difference]
  Include only components that have differences
  Include rotated text but normalized
  
- Column 2: ONE paragraph with NUMBERED LIST of ALL differences from File 2, ORGANIZED BY ARTWORK COMPONENT
  Structure within column:
  [CARTON]<br>1. [difference]<br>2. [difference]<br><br>[FOIL]<br>1. [difference]<br>2. [difference]<br><br>[LABEL]<br>1. [difference]<br>2. [difference]<br><br>[PACKING INSERT]<br>1. [difference]<br>2. [difference]
  Include only components that have differences
  Include rotated text but normalized
  
- Column 3: Complete scientific rationale explaining all changes, organized by component

ARTWORK COMPONENTS TO IDENTIFY:
- CARTON: Carton/Box/Packaging artwork details (product name, composition, dosage, manufacturer info, etc.) - may include rotated text
- FOIL: Foil/Blister pack details (strip information, batch numbers, etc.) - may include rotated text
- LABEL: Label details (text, colors, fonts, positioning) - may include rotated text
- PACKING INSERT: Packing insert/Instructions for use details - may include rotated text
- Other relevant components visible in artwork

CRITICAL COMPARISON LOGIC:
1. Read both files completely - extract ALL text including rotated/angled text
2. When you encounter rotated text:
   - Mentally rotate/straighten it to understand what it says
   - Write the normalized, readable version in the output
   - Do NOT write it in the rotated/garbled format
3. Identify which component (CARTON, FOIL, LABEL, PACKING INSERT, etc.) each detail belongs to
4. For EVERY field/detail in each component:
   a. If File 1 value = File 2 value (EXACT match including language/font/spacing) → DELETE from both columns (do not list)
   b. If File 1 value ≠ File 2 value → KEEP in both columns (list both with the difference)
   c. If field exists ONLY in File 1 → KEEP in Column 1 only, Column 2 = "Not mentioned"
   d. If field exists ONLY in File 2 → KEEP in Column 2 only, Column 1 = "Not mentioned"
5. Organize all differences by their artwork component
6. Handle all languages equally - compare text character-by-character regardless of language
7. Include rotated text in comparisons but always present it in normalized readable format

COMPARISON FILTERING RULES:
- Compare values EXACTLY: same text, same position, same formatting = IDENTICAL (remove)
- Different text in any language = DIFFERENT (keep both)
- Different formatting/color/position = DIFFERENT (keep both)
- Different font/size = DIFFERENT (keep both)
- Do NOT list identical items even if they appear in different languages - compare actual values
- Rotated text that reads the same when normalized = IDENTICAL (remove)
- Rotated text that reads differently when normalized = DIFFERENT (keep both)

FORMATTING RULES:
1. Use <br> to separate items and components
2. Use double <br><br> to separate different components
3. Format: "[COMPONENT_NAME]<br>1. text<br>2. text<br><br>[NEXT_COMPONENT]<br>1. text"
4. Do NOT use HTML lists (<ul> or <ol>)
5. All styling INLINE only
6. Bold component names for clarity: <strong style="font-weight:bold;">CARTON</strong>
7. Table with clear borders and padding
8. EXACTLY 3 ROWS TOTAL: 1) Title, 2) Headers, 3) All Data
9. Any Data from File 1 should not be mentioned in second column and any Data from File 2 should not be mentioned in first column.
10. ALWAYS output text in clean, readable, normalized format - never show garbled characters

OUTPUT: Return ONLY valid HTML. No markdown. No explanations. No metadata.
`.trim(),
                },
                {
                  file_data: {
                    mime_type: uploaded1.mimeType,
                    file_uri: uploaded1.fileUri,
                  },
                },
                {
                  file_data: {
                    mime_type: uploaded2.mimeType,
                    file_uri: uploaded2.fileUri,
                  },
                },
              ],
            },
          ],
        }),
      }
    );

    const aiData = await geminiRes.json();

    if (!geminiRes.ok) {
      return NextResponse.json(
        {
          error: aiData?.error?.message || "Gemini request failed",
          details: aiData,
        },
        { status: geminiRes.status }
      );
    }

    const response = aiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!response) {
      throw new Error(aiData?.error?.message || "No response from Gemini");
    }

    const comparison = response
      .replace(/```html/gi, "")
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    console.log(comparison);
    return NextResponse.json({
      comparison,
      files: [uploaded1.fileUri, uploaded2.fileUri],
    });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json(
      { error: error?.message || "Internal server error" },
      { status: 500 }
    );
  }
}