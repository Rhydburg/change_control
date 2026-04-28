"use client";

import { useState, useRef, useCallback } from "react";
import DOMPurify from "isomorphic-dompurify";

// ── Types ──────────────────────────────────────────────────────────────────
type Phase = "idle" | "ocr" | "compare" | "done" | "error";

type StepLog = {
  id: number;
  phase: "OCR" | "COMPARE";
  text: string;
  type: "step" | "info" | "error" | "done";
};

// ── Icons ──────────────────────────────────────────────────────────────────
const UploadIcon = () => (
  <svg width="26" height="26" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
  </svg>
);

const FileIcon = () => (
  <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  </svg>
);

const XIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

// ── DropZone ───────────────────────────────────────────────────────────────
function DropZone({
  label,
  file,
  onChange,
  onClear,
  disabled,
}: {
  label: string;
  file: File | null;
  onChange: (f: File) => void;
  onClear: () => void;
  disabled: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDrag(false);
      const f = e.dataTransfer.files?.[0];
      if (f) onChange(f);
    },
    [onChange]
  );

  return (
    <div style={{ flex: 1 }}>
      <p style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#a78bfa", marginBottom: "0.5rem" }}>
        {label}
      </p>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        onClick={() => !file && !disabled && ref.current?.click()}
        style={{
          border: `2px dashed ${drag ? "#7c3aed" : file ? "#6d28d9" : "#3b1f6e"}`,
          borderRadius: 14,
          background: file ? "rgba(109,40,217,0.12)" : drag ? "rgba(124,58,237,0.08)" : "rgba(15,10,40,0.6)",
          padding: "1.25rem",
          minHeight: 130,
          cursor: file || disabled ? "default" : "pointer",
          transition: "all 0.2s ease",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "0.5rem",
          position: "relative",
        }}
      >
        <input
          ref={ref}
          type="file"
          accept="application/pdf,image/*"
          style={{ display: "none" }}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onChange(f); }}
          disabled={disabled}
        />
        {file ? (
          <>
            <div style={{ color: "#a78bfa" }}><FileIcon /></div>
            <span style={{ fontSize: "0.82rem", fontWeight: 600, color: "#e2d9ff", textAlign: "center", wordBreak: "break-all" }}>
              {file.name}
            </span>
            <span style={{ fontSize: "0.72rem", color: "#7c6aaa" }}>
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </span>
            {!disabled && (
              <button
                onClick={(e) => { e.stopPropagation(); onClear(); }}
                style={{ position: "absolute", top: 8, right: 8, background: "rgba(124,58,237,0.2)", border: "none", borderRadius: "50%", width: 24, height: 24, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#a78bfa" }}
              >
                <XIcon />
              </button>
            )}
          </>
        ) : (
          <>
            <div style={{ color: "#6d28d9" }}><UploadIcon /></div>
            <p style={{ fontSize: "0.82rem", color: "#7c6aaa", textAlign: "center" }}>
              Drop PDF or click to browse
            </p>
            <p style={{ fontSize: "0.7rem", color: "#4c3d7a" }}>Supports 1 MB – 50 MB</p>
          </>
        )}
      </div>
    </div>
  );
}

// ── Step Log Entry ─────────────────────────────────────────────────────────
function LogEntry({ log }: { log: StepLog }) {
  const colors: Record<StepLog["type"], string> = {
    step:  "#818cf8",
    info:  "#94a3b8",
    done:  "#34d399",
    error: "#f87171",
  };
  const icons: Record<StepLog["type"], string> = {
    step: "⟳",
    info: "·",
    done: "✓",
    error: "✗",
  };
  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", animation: "fadeSlideIn 0.3s ease" }}>
      <span style={{ color: colors[log.type], fontWeight: 700, fontSize: "0.8rem", flexShrink: 0 }}>
        [{log.phase}] {icons[log.type]}
      </span>
      <span style={{ fontSize: "0.8rem", color: colors[log.type], lineHeight: 1.5 }}>{log.text}</span>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function OcrComparePage() {
  const [file1, setFile1] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [logs, setLogs] = useState<StepLog[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const logId = useRef(0);

  function addLog(phase: "OCR" | "COMPARE", text: string, type: StepLog["type"] = "info") {
    const entry: StepLog = { id: logId.current++, phase, text, type };
    setLogs((prev) => [...prev, entry]);
    setTimeout(() => logRef.current?.scrollTo({ top: 9999, behavior: "smooth" }), 50);
  }

  async function handleRun() {
    if (!file1 || !file2) return;
    setLogs([]);
    setResult(null);
    setError(null);
    setPhase("ocr");

    // ── Phase 1: OCR Extraction ──────────────────────────────────────────
    addLog("OCR", "Starting Mistral OCR extraction…", "step");
    addLog("OCR", `File 1: ${file1.name} (${(file1.size / 1024 / 1024).toFixed(2)} MB)`, "info");
    addLog("OCR", `File 2: ${file2.name} (${(file2.size / 1024 / 1024).toFixed(2)} MB)`, "info");
    addLog("OCR", "Uploading files to Mistral Files API…", "step");

    const fd = new FormData();
    fd.append("file1", file1);
    fd.append("file2", file2);

    let text1 = "", text2 = "", fname1 = file1.name, fname2 = file2.name;

    try {
      const ocrRes = await fetch("/api/ocr-extract", { method: "POST", body: fd });
      const ocrData = await ocrRes.json();

      if (!ocrRes.ok || ocrData.error) {
        throw new Error(ocrData.error || "OCR extraction failed");
      }

      text1 = ocrData.text1;
      text2 = ocrData.text2;
      fname1 = ocrData.fileName1 || file1.name;
      fname2 = ocrData.fileName2 || file2.name;

      addLog("OCR", `File 1 OCR done — ${text1.length.toLocaleString()} chars extracted`, "done");
      addLog("OCR", `File 2 OCR done — ${text2.length.toLocaleString()} chars extracted`, "done");
      addLog("OCR", "Phase 1 complete ✓", "done");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog("OCR", `Error: ${msg}`, "error");
      setError(msg);
      setPhase("error");
      return;
    }

    // ── Phase 2: Gemini Compare ──────────────────────────────────────────
    setPhase("compare");
    addLog("COMPARE", "Sending extracted text to Gemini 2.5 Pro…", "step");
    addLog("COMPARE", "Building pharmaceutical comparison prompt…", "info");

    try {
      const cmpRes = await fetch("/api/ocr-compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text1, text2, fileName1: fname1, fileName2: fname2 }),
      });
      const cmpData = await cmpRes.json();

      if (!cmpRes.ok || cmpData.error) {
        throw new Error(cmpData.error || "Comparison failed");
      }

      addLog("COMPARE", "Gemini response received", "info");
      addLog("COMPARE", `HTML comparison generated — ${cmpData.comparison.length.toLocaleString()} chars`, "done");
      addLog("COMPARE", "Phase 2 complete ✓", "done");

      setResult(cmpData.comparison);
      setPhase("done");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog("COMPARE", `Error: ${msg}`, "error");
      setError(msg);
      setPhase("error");
    }
  }

  const busy = phase === "ocr" || phase === "compare";
  const bothReady = !!file1 && !!file2;

  const phaseLabel: Record<Phase, string> = {
    idle: "Ready",
    ocr: "Phase 1 — Mistral OCR",
    compare: "Phase 2 — Gemini Compare",
    done: "Complete",
    error: "Error",
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0a0618; }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:0.6} 50%{opacity:1} }
        .spinner { width:16px;height:16px;border:2px solid rgba(167,139,250,0.3);border-top-color:#a78bfa;border-radius:50%;animation:spin 0.7s linear infinite;flex-shrink:0; }
        .phase-pill { display:inline-flex;align-items:center;gap:0.4rem;padding:0.25rem 0.75rem;border-radius:999px;font-size:0.7rem;font-weight:700;letter-spacing:0.05em;text-transform:uppercase; }
        .copy-btn { background:rgba(109,40,217,0.2);border:1px solid #4c1d95;color:#a78bfa;border-radius:8px;padding:0.3rem 0.8rem;font-size:0.72rem;font-weight:600;cursor:pointer;transition:background 0.2s; }
        .copy-btn:hover { background:rgba(109,40,217,0.4); }
      `}</style>

      <div style={{ minHeight: "100svh", background: "linear-gradient(135deg, #0a0618 0%, #0f0a2e 50%, #0a0618 100%)", fontFamily: "'Inter', system-ui, sans-serif", color: "#e2d9ff" }}>

        {/* Header */}
        <header style={{ borderBottom: "1px solid #1e1456", padding: "0 1.5rem", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(10,6,24,0.8)", backdropFilter: "blur(10px)", position: "sticky", top: 0, zIndex: 100 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#7c3aed,#4f46e5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/></svg>
            </div>
            <span style={{ fontWeight: 800, fontSize: "0.95rem", letterSpacing: "-0.01em" }}>ArtLens <span style={{ color: "#7c3aed" }}>OCR</span></span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span className="phase-pill" style={{ background: phase === "done" ? "rgba(52,211,153,0.15)" : phase === "error" ? "rgba(248,113,113,0.15)" : "rgba(124,58,237,0.15)", color: phase === "done" ? "#34d399" : phase === "error" ? "#f87171" : "#a78bfa", border: `1px solid ${phase === "done" ? "#059669" : phase === "error" ? "#dc2626" : "#4c1d95"}` }}>
              {busy && <span className="spinner" />}
              {phaseLabel[phase]}
            </span>
            <a href="/" style={{ fontSize: "0.75rem", color: "#6d5aaa", textDecoration: "none", padding: "0.25rem 0.6rem", border: "1px solid #2a1d5e", borderRadius: 8 }}>← Classic</a>
          </div>
        </header>

        <main style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1.25rem 4rem" }}>

          {/* Hero */}
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <h1 style={{ fontSize: "clamp(1.6rem,5vw,2.2rem)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.2, marginBottom: "0.6rem" }}>
              Mistral OCR + <span style={{ background: "linear-gradient(90deg,#7c3aed,#818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Gemini Compare</span>
            </h1>
            <p style={{ color: "#7c6aaa", fontSize: "0.9rem", maxWidth: 480, margin: "0 auto" }}>
              Phase 1 extracts text via Mistral OCR. Phase 2 sends extracted text to Gemini for pharmaceutical change-control comparison.
            </p>
          </div>

          {/* Upload Card */}
          <div style={{ background: "rgba(15,10,40,0.7)", border: "1px solid #1e1456", borderRadius: 20, marginBottom: "1.5rem", overflow: "hidden" }}>
            <div style={{ padding: "1rem 1.25rem 0.75rem", borderBottom: "1px solid #1e1456", background: "rgba(124,58,237,0.06)" }}>
              <p style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#6d28d9" }}>Step 1 — Upload PDFs</p>
            </div>
            <div style={{ padding: "1.25rem" }}>
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                <DropZone label="Current / Previous Artwork" file={file1} onChange={setFile1} onClear={() => { setFile1(null); setResult(null); setError(null); }} disabled={busy} />
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 32, alignSelf: "center", paddingTop: 24 }}>
                  <span style={{ fontWeight: 900, fontSize: "0.75rem", color: "#3b1f6e" }}>VS</span>
                </div>
                <DropZone label="New / Revised Artwork" file={file2} onChange={setFile2} onClear={() => { setFile2(null); setResult(null); setError(null); }} disabled={busy} />
              </div>

              <button
                onClick={handleRun}
                disabled={!bothReady || busy}
                style={{ marginTop: "1.25rem", width: "100%", padding: "0.875rem", background: bothReady && !busy ? "linear-gradient(135deg,#7c3aed,#4f46e5)" : "rgba(109,40,217,0.15)", border: "1px solid #4c1d95", borderRadius: 12, color: bothReady && !busy ? "white" : "#4c3d7a", fontWeight: 700, fontSize: "0.9rem", cursor: bothReady && !busy ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", transition: "all 0.2s", boxShadow: bothReady && !busy ? "0 4px 20px rgba(124,58,237,0.35)" : "none" }}
              >
                {busy ? (
                  <><span className="spinner" />{phase === "ocr" ? "Extracting text via OCR…" : "Comparing with Gemini…"}</>
                ) : (
                  <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>Run OCR + Compare</>
                )}
              </button>
            </div>
          </div>

          {/* Live Log Panel */}
          {logs.length > 0 && (
            <div style={{ background: "rgba(5,3,18,0.9)", border: "1px solid #1e1456", borderRadius: 16, marginBottom: "1.5rem", overflow: "hidden" }}>
              <div style={{ padding: "0.75rem 1.25rem", borderBottom: "1px solid #1e1456", display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: busy ? "#7c3aed" : phase === "done" ? "#34d399" : "#f87171", animation: busy ? "pulse 1s ease infinite" : "none", display: "inline-block" }} />
                <p style={{ fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#6d28d9" }}>Live Process Log</p>
              </div>
              <div ref={logRef} style={{ padding: "1rem 1.25rem", maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.35rem", fontFamily: "'Fira Code', 'Courier New', monospace" }}>
                {logs.map((l) => <LogEntry key={l.id} log={l} />)}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid #7f1d1d", borderRadius: 14, padding: "1rem 1.25rem", marginBottom: "1.5rem", color: "#fca5a5", fontSize: "0.875rem" }}>
              ⚠️ {error}
            </div>
          )}

          {/* Result */}
          {result && (
            <div style={{ background: "rgba(15,10,40,0.7)", border: "1px solid #1e1456", borderRadius: 20, overflow: "hidden" }}>
              <div style={{ padding: "1rem 1.25rem 0.75rem", borderBottom: "1px solid #1e1456", background: "rgba(52,211,153,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <p style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#34d399" }}>
                  ✓ Comparison Result
                </p>
                <button className="copy-btn" onClick={() => navigator.clipboard.writeText(result)}>Copy HTML</button>
              </div>
              <div style={{ padding: "1.5rem", background: "white", borderRadius: "0 0 20px 20px" }}>
                <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(result, { USE_PROFILES: { html: true } }) }} />
              </div>
            </div>
          )}

        </main>
      </div>
    </>
  );
}
