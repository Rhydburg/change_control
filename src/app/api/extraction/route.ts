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
- Compare ONLY DIFFERENCES. DO NOT include matching/identical content.
- Keep File 1 data in CURRENT column, File 2 data in NEW column ALWAYS.
- ALL content must be in NUMBERED LIST format (1., 2., 3., etc.).
- Use ONLY inline styles (style="...") - NO <style> tags.
- If a field is identical in both files, DO NOT list it anywhere.
- If a field exists only in one file, show it only in that column and mark other as "Not mentioned".
- ONE ROW ONLY for all data and differences combined.
- Don't create any more rows then mentioned. 
- Last Row contains all the differences.

INPUT: 2 pharmaceutical artwork files (Current/Previous and New/Revised)

OUTPUT STRUCTURE:

MAIN COMPARISON TABLE (inline styled):

ROW 1 (Title Row - full width):
- Span all columns: "CL#### - DOCUMENT_CODE - PRODUCT NAME" Show document code, product name in this row.

ROW 2 (Column Headers):
- Column 1: "Current / Previous State"
- Column 2: "New / Revised State"  
- Column 3: "Scientific Rationale"

ROW 3 (Single Data Row - ALL differences combined):
- Column 1: ONE paragraph with NUMBERED LIST of ALL differences from File 1
  Include: all file details + all content differences that differ from File 2
  Format: "1. [detail/difference]<br>2. [detail/difference]<br>3. [detail/difference]<br>..."
  
- Column 2: ONE paragraph with NUMBERED LIST of ALL differences from File 2
  Include: all file details + all content differences that differ from File 1
  Format: "1. [detail/difference]<br>2. [detail/difference]<br>3. [detail/difference]<br>..."
  
- Column 3: Complete scientific rationale explaining all changes

CRITICAL COMPARISON LOGIC:
1. Read both files completely
2. For EVERY field/detail, compare them
3. If IDENTICAL → DO NOT include in either column
4. If DIFFERENT → Include in both columns showing the difference
5. If EXISTS ONLY IN FILE 1 → Show in Column 1 only, Column 2 = "Not mentioned"
6. If EXISTS ONLY IN FILE 2 → Show in Column 2 only, Column 1 = "Not mentioned"

FORMATTING RULES:
1. Use <br> to separate numbered items
2. Format ONLY: "1. text<br>2. text<br>3. text"
3. Do NOT use HTML lists (<ul> or <ol>)
4. Do NOT use section breaks or multiple rows
5. All styling INLINE only
6. Table with clear borders and padding
7. EXACTLY 3 ROWS TOTAL: 1) Title, 2) Headers, 3) All Data
8. Any Data from File 1 should not be mentioned in second column and any Data from File 2 should not be mentioned in first column. 

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