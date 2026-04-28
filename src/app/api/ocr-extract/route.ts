/**
 * POST /api/ocr-extract
 *
 * Phase 1: Upload both PDFs to Mistral Files API, run OCR, return extracted text.
 *
 * Accepts: multipart/form-data  { file1: File, file2: File }
 * Returns: { text1: string, text2: string, logFile: string }
 *
 * Large-file strategy:
 *   - Files are read into Buffers and uploaded to Mistral Files API.
 *   - After upload, a brief delay is used (no polling needed — files are immediately accessible).
 *   - maxDuration is set to 300s to handle large PDFs.
 */

export const runtime = "nodejs";
// Max duration 300 s — needed for large file uploads + OCR processing
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { createLogger } from "@/lib/logger";
import {
  uploadFileToMistral,
  getMistralFileUrl,
  runMistralOCR,
  deleteMistralFile,
  sleep,
} from "@/lib/mistral-ocr";
import { randomUUID } from "crypto";

export async function POST(req: Request) {
  const sessionId = randomUUID().slice(0, 8);
  const log = createLogger(sessionId);

  log.info(`=== OCR Extract Session ${sessionId} started ===`);
  log.info(`Request received at ${new Date().toISOString()}`);

  try {
    // ── Step 1: Parse multipart form ─────────────────────────────────────
    log.step("STEP 1", "Parsing multipart form data");

    const formData = await req.formData();
    const file1 = formData.get("file1") as File | null;
    const file2 = formData.get("file2") as File | null;

    if (!file1 || !file2) {
      log.error("Missing file1 or file2 in form data");
      return NextResponse.json({ error: "Missing files" }, { status: 400 });
    }

    log.info(`file1: "${file1.name}" size=${(file1.size / 1024 / 1024).toFixed(2)} MB type=${file1.type}`);
    log.info(`file2: "${file2.name}" size=${(file2.size / 1024 / 1024).toFixed(2)} MB type=${file2.type}`);
    log.step("STEP 1 DONE", "Files parsed successfully");

    // ── Step 2: Read files into buffers ───────────────────────────────────
    log.step("STEP 2", "Reading files into memory buffers");
    const [buf1, buf2] = await Promise.all([
      file1.arrayBuffer().then((ab) => Buffer.from(ab)),
      file2.arrayBuffer().then((ab) => Buffer.from(ab)),
    ]);
    log.info(`Buffers ready — buf1: ${buf1.length} bytes, buf2: ${buf2.length} bytes`);
    log.step("STEP 2 DONE", "File buffers ready");

    // ── Step 3: Upload both files to Mistral Files API ────────────────────
    log.step("STEP 3", "Uploading files to Mistral Files API");

    const mime1 = file1.type || "application/pdf";
    const mime2 = file2.type || "application/pdf";

    const [fileId1, fileId2] = await Promise.all([
      uploadFileToMistral(buf1, file1.name, mime1),
      uploadFileToMistral(buf2, file2.name, mime2),
    ]);

    log.info(`Mistral fileId1: ${fileId1}`);
    log.info(`Mistral fileId2: ${fileId2}`);
    log.step("STEP 3 DONE", "Both files uploaded to Mistral");

    // ── Step 4: Brief delay to ensure files are accessible ────────────────
    log.step("STEP 4", "Waiting 1 s for Mistral file availability");
    await sleep(1000);
    log.info(`fileId1 (${fileId1}) ready`);
    log.info(`fileId2 (${fileId2}) ready`);
    log.step("STEP 4 DONE", "Files accessible");

    // ── Step 5: Get signed URLs ───────────────────────────────────────────
    log.step("STEP 5", "Fetching signed URLs from Mistral");

    const [signedUrl1, signedUrl2] = await Promise.all([
      getMistralFileUrl(fileId1),
      getMistralFileUrl(fileId2),
    ]);

    log.info("Signed URL 1 obtained");
    log.info("Signed URL 2 obtained");
    log.step("STEP 5 DONE", "Signed URLs ready");

    // ── Step 6: Run OCR on both files ─────────────────────────────────────
    log.step("STEP 6", "Running Mistral OCR on both files");

    const [text1, text2] = await Promise.all([
      runMistralOCR(signedUrl1).then((t) => {
        log.info(`OCR file1 complete — ${t.length} chars extracted`);
        return t;
      }),
      runMistralOCR(signedUrl2).then((t) => {
        log.info(`OCR file2 complete — ${t.length} chars extracted`);
        return t;
      }),
    ]);

    log.step("STEP 6 DONE", "OCR extraction complete for both files");

    // ── Step 7: Cleanup — delete uploaded files from Mistral ──────────────
    log.step("STEP 7", "Deleting uploaded files from Mistral (cleanup)");
    await Promise.all([
      deleteMistralFile(fileId1).then(() => log.info(`Deleted Mistral file ${fileId1}`)),
      deleteMistralFile(fileId2).then(() => log.info(`Deleted Mistral file ${fileId2}`)),
    ]);
    log.step("STEP 7 DONE", "Cleanup complete");

    // ── Done ──────────────────────────────────────────────────────────────
    log.info(`=== Session ${sessionId} completed successfully ===`);

    return NextResponse.json({
      text1,
      text2,
      fileName1: file1.name,
      fileName2: file2.name,
      sessionId,
      logFile: log.logFile,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error(`Fatal error: ${message}`);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
