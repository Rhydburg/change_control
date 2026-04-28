/**
 * mistral-ocr.ts — Shared Mistral OCR helper functions.
 *
 * Strategy for large files (1–50 MB):
 *   1. Upload the file via Mistral Files API (multipart/form-data).
 *   2. Short delay then fetch signed URL (Mistral files are available immediately).
 *   3. Call mistral-ocr-latest with document_url.
 *   4. Collect all page markdown into one string.
 */



/* eslint-disable @typescript-eslint/no-explicit-any */

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY!;
const BASE = "https://api.mistral.ai/v1";

// ─── Upload ────────────────────────────────────────────────────────────────

export async function uploadFileToMistral(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<string> {
  // Build multipart body manually — Mistral Files API requires multipart/form-data
  const boundary = `----MistralBoundary${Date.now()}`;

  // Build the multipart body as a Buffer to handle binary data correctly
  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="purpose"\r\n\r\nocr\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    "utf8"
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  const body = Buffer.concat([header, fileBuffer, footer]);

  const res = await fetch(`${BASE}/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MISTRAL_API_KEY}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": body.length.toString(),
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mistral file upload failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  if (!data.id) throw new Error("Mistral upload returned no file id");
  return data.id as string;
}

// ─── Small delay helper ───────────────────────────────────────────────────
// Mistral OCR files are immediately accessible after upload — no polling needed.
// A short fixed delay avoids race conditions on very large files.

export async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Get signed URL for file (needed for OCR) ──────────────────────────────

export async function getMistralFileUrl(fileId: string): Promise<string> {
  const res = await fetch(`${BASE}/files/${fileId}/url`, {
    method: "GET",
    headers: { Authorization: `Bearer ${MISTRAL_API_KEY}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mistral get file URL failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  if (!data.url) throw new Error("Mistral returned no signed URL");
  return data.url as string;
}

// ─── Run OCR ──────────────────────────────────────────────────────────────

export async function runMistralOCR(signedUrl: string): Promise<string> {
  const res = await fetch(`${BASE}/ocr`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MISTRAL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "mistral-ocr-latest",
      document: {
        type: "document_url",
        document_url: signedUrl,
      },
      include_image_base64: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Mistral OCR failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  // Collect all pages' markdown
  const pages: any[] = data.pages ?? [];
  if (pages.length === 0) {
    // Some versions return content directly
    const text = data.text ?? data.content ?? "";
    return text as string;
  }

  return pages
    .map((p: any) => {
      const pageText = p.markdown ?? p.text ?? "";
      return `### Page ${p.index ?? p.page_num ?? "?"}\n\n${pageText}`;
    })
    .join("\n\n---\n\n");
}

// ─── Delete file after use ────────────────────────────────────────────────

export async function deleteMistralFile(fileId: string): Promise<void> {
  await fetch(`${BASE}/files/${fileId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${MISTRAL_API_KEY}` },
  }).catch(() => {/* best-effort */});
}
