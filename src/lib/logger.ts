/**
 * logger.ts — Server-side logger for the Mistral OCR pipeline.
 * Writes log files to /logs/ocr/ and auto-deletes oldest when count > 6.
 */

import fs from "fs";
import path from "path";

const LOG_DIR = path.join(process.cwd(), "logs", "ocr");
const MAX_LOGS = 6;

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function pruneOldLogs() {
  const files = fs
    .readdirSync(LOG_DIR)
    .filter((f) => f.endsWith(".log"))
    .map((f) => ({
      name: f,
      mtime: fs.statSync(path.join(LOG_DIR, f)).mtime.getTime(),
    }))
    .sort((a, b) => a.mtime - b.mtime); // oldest first

  while (files.length >= MAX_LOGS) {
    const oldest = files.shift()!;
    fs.unlinkSync(path.join(LOG_DIR, oldest.name));
  }
}

export function createLogger(sessionId: string) {
  ensureLogDir();
  pruneOldLogs();

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const logFile = path.join(LOG_DIR, `ocr-${timestamp}-${sessionId}.log`);
  const lines: string[] = [];

  function write(level: "INFO" | "STEP" | "WARN" | "ERROR", msg: string) {
    const line = `[${new Date().toISOString()}] [${level}] ${msg}`;
    lines.push(line);
    // Append immediately so it survives mid-request crashes
    fs.appendFileSync(logFile, line + "\n", "utf8");
  }

  return {
    info: (msg: string) => write("INFO", msg),
    step: (step: string, detail?: string) =>
      write("STEP", detail ? `${step} — ${detail}` : step),
    warn: (msg: string) => write("WARN", msg),
    error: (msg: string) => write("ERROR", msg),
    logFile,
    dump: () => lines.join("\n"),
  };
}
