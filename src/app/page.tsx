"use client";

import { useState, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────
type FileSlot = {
  file: File | null;
  preview: string | null;
};

// ─── Icons (inline SVG to keep it dependency-free) ────────
const UploadIcon = () => (
  <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
  </svg>
);

const SparkleIcon = () => (
  <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 2l2.09 6.26L21 10l-6.91 1.74L12 22l-2.09-8.26L3 12l6.91-1.74L12 2z"/>
  </svg>
);

const CrossIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const FileIcon = () => (
  <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  </svg>
);

// ─── Drop Zone Component ───────────────────────────────────
function DropZone({
  slot,
  index,
  onChange,
  onClear,
}: {
  slot: FileSlot;
  index: number;
  onChange: (file: File) => void;
  onClear: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) onChange(file);
    },
    [onChange]
  );

  const isImage = slot.file?.type.startsWith("image/");
  const label = index === 0 ? "First" : "Second";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label
          style={{
            fontSize: "0.8125rem",
            fontWeight: 600,
            color: "var(--text-secondary)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {label} Artwork
        </label>
        {slot.file && (
          <span className="badge badge-success">
            <svg width="10" height="10" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
            </svg>
            Ready
          </span>
        )}
      </div>
      <div
        className={`drop-zone${dragging ? " active" : ""}${slot.file ? " filled" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !slot.file && inputRef.current?.click()}
        style={{ minHeight: 160 }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="*/*"
          style={{ pointerEvents: slot.file ? "none" : "auto" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onChange(file);
          }}
        />

        {slot.file ? (
          <div style={{ position: "relative", zIndex: 1 }}>
            {isImage && slot.preview ? (
              <div style={{ position: "relative" }}>
                <img
                  src={slot.preview}
                  alt="Preview"
                  style={{
                    width: "100%",
                    height: 140,
                    objectFit: "cover",
                    borderRadius: 10,
                    display: "block",
                    marginBottom: "0.75rem",
                  }}
                />
                <button
                  onClick={(e) => { e.stopPropagation(); onClear(); }}
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    background: "white",
                    border: "none",
                    borderRadius: "50%",
                    width: 26,
                    height: 26,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                    color: "var(--text-secondary)",
                  }}
                >
                  <CrossIcon />
                </button>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.75rem",
                  padding: "1rem",
                  background: "white",
                  borderRadius: 10,
                  marginBottom: "0.75rem",
                }}
              >
                <div style={{ color: "var(--primary)", flexShrink: 0 }}>
                  <FileIcon />
                </div>
                <span
                  style={{
                    fontSize: "0.85rem",
                    fontWeight: 500,
                    color: "var(--text-primary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {slot.file.name}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); onClear(); }}
                  style={{
                    marginLeft: "auto",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "var(--text-muted)",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <CrossIcon />
                </button>
              </div>
            )}
            <p style={{ fontSize: "0.78rem", color: "var(--primary)", fontWeight: 500 }}>
              Click or drop to replace
            </p>
          </div>
        ) : (
          <div
            style={{
              position: "relative",
              zIndex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.6rem",
              color: "var(--text-muted)",
              padding: "1rem 0",
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                background: "var(--primary-ultralight)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--primary)",
                animation: dragging ? "pulse-ring 1s ease infinite" : "none",
              }}
            >
              <UploadIcon />
            </div>
            <div>
              <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                Drop file here or <span style={{ color: "var(--primary)" }}>browse</span>
              </p>
              <p style={{ fontSize: "0.75rem", marginTop: "0.2rem" }}>
                Any format – images, PDFs, docs…
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────
export default function Home() {
  const [slots, setSlots] = useState<[FileSlot, FileSlot]>([
    { file: null, preview: null },
    { file: null, preview: null },
  ]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (index: 0 | 1, file: File) => {
    const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    setSlots((prev) => {
      const next: [FileSlot, FileSlot] = [...prev] as [FileSlot, FileSlot];
      if (next[index].preview) URL.revokeObjectURL(next[index].preview!);
      next[index] = { file, preview };
      return next;
    });
    setResult(null);
    setError(null);
  };

  const handleClear = (index: 0 | 1) => {
    setSlots((prev) => {
      const next: [FileSlot, FileSlot] = [...prev] as [FileSlot, FileSlot];
      if (next[index].preview) URL.revokeObjectURL(next[index].preview!);
      next[index] = { file: null, preview: null };
      return next;
    });
  };

  const handleCompare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slots[0].file || !slots[1].file) return;

    setLoading(true);
    setResult(null);
    setError(null);

    const formData = new FormData();
    formData.append("file1", slots[0].file);
    formData.append("file2", slots[1].file);

    try {
      const res = await fetch("/api/compare", { method: "POST", body: formData });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data.comparison);
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const bothReady = slots[0].file && slots[1].file;

  return (
    <div
      style={{
        minHeight: "100svh",
        display: "flex",
        flexDirection: "column",
        background: "var(--surface-alt)",
      }}
    >
      {/* ── Top bar ── */}
      <header
        style={{
          background: "white",
          borderBottom: "1px solid var(--border)",
          padding: "0 max(1.25rem, env(safe-area-inset-left))",
          height: 58,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          position: "sticky",
          top: 0,
          zIndex: 100,
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: "linear-gradient(135deg, var(--primary), var(--primary-light))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
              <path d="M12 2l2.09 6.26L21 10l-6.91 1.74L12 22l-2.09-8.26L3 12l6.91-1.74L12 2z"/>
            </svg>
          </div>
          <span style={{ fontWeight: 700, fontSize: "1rem", letterSpacing: "-0.01em" }}>
            ArtLens
          </span>
        </div>
        <span className="badge badge-primary">
          <SparkleIcon />
          AI Powered
        </span>
      </header>

      {/* ── Main ── */}
      <main
        style={{
          flex: 1,
          width: "100%",
          maxWidth: 680,
          margin: "0 auto",
          padding: "2rem 1.25rem 4rem",
          display: "flex",
          flexDirection: "column",
          gap: "2rem",
        }}
      >
        {/* Hero */}
        <div className="animate-fade-in" style={{ textAlign: "center", paddingTop: "0.5rem" }}>
          <h1
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "clamp(1.75rem, 6vw, 2.5rem)",
              fontWeight: 700,
              lineHeight: 1.2,
              letterSpacing: "-0.02em",
              color: "var(--text-primary)",
              marginBottom: "0.75rem",
            }}
          >
            Compare any two artworks
            <br />
            <span style={{ color: "var(--primary)" }}>with AI insight</span>
          </h1>
          <p
            style={{
              fontSize: "clamp(0.875rem, 3vw, 1rem)",
              color: "var(--text-secondary)",
              maxWidth: 460,
              margin: "0 auto",
              lineHeight: 1.65,
            }}
          >
            Upload any two files — images, PDFs, documents — and get a detailed
            side-by-side AI analysis in seconds.
          </p>
        </div>

        {/* Upload Card */}
        <div className="card animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <div
            style={{
              background: "linear-gradient(135deg, var(--primary-ultralight) 0%, white 100%)",
              padding: "1.25rem 1.5rem 0.5rem",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <p style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Step 1 — Upload Files
            </p>
          </div>

          <form onSubmit={handleCompare} style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <DropZone slot={slots[0]} index={0} onChange={(f) => handleFileChange(0, f)} onClear={() => handleClear(0)} />

            <div className="vs-divider">VS</div>

            <DropZone slot={slots[1]} index={1} onChange={(f) => handleFileChange(1, f)} onClear={() => handleClear(1)} />

            {/* Loading progress */}
            {loading && (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <div className="progress-bar"><div className="progress-bar-fill" /></div>
                <p style={{ fontSize: "0.78rem", color: "var(--primary)", textAlign: "center", fontWeight: 500 }}>
                  Uploading &amp; analysing…
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={!bothReady || loading}
              className="btn-primary"
              style={{ marginTop: "0.25rem" }}
            >
              {loading ? (
                <>
                  <span className="spinner" />
                  Analysing…
                </>
              ) : (
                <>
                  <SparkleIcon />
                  Compare Artworks
                </>
              )}
            </button>
          </form>
        </div>

        {/* Result Card */}
        {(result || error) && (
          <div className="card animate-fade-in" style={{ animationDelay: "0s" }}>
            <div
              style={{
                background: error
                  ? "linear-gradient(135deg, #fff5f5 0%, white 100%)"
                  : "linear-gradient(135deg, var(--primary-ultralight) 0%, white 100%)",
                padding: "1.25rem 1.5rem 0.5rem",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <p style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                Step 2 — {error ? "Error" : "AI Analysis"}
              </p>
              {result && (
                <button
                  onClick={() => navigator.clipboard.writeText(result)}
                  style={{
                    background: "none",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    padding: "0.2rem 0.6rem",
                    fontSize: "0.72rem",
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                    letterSpacing: "0.02em",
                  }}
                >
                  Copy
                </button>
              )}
            </div>

            <div style={{ padding: "1.5rem" }}>
              {error ? (
                <div
                  style={{
                    background: "#fff5f5",
                    border: "1px solid #ffd5d5",
                    borderRadius: 10,
                    padding: "1rem 1.25rem",
                    color: "#c0392b",
                    fontSize: "0.875rem",
                    fontWeight: 500,
                  }}
                >
                  ⚠️ {error}
                </div>
              ) : (
                <div className="result-block">{result}</div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer
        style={{
          textAlign: "center",
          padding: "1.25rem",
          paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
          fontSize: "0.75rem",
          color: "var(--text-muted)",
          borderTop: "1px solid var(--border)",
          background: "white",
        }}
      >
        ArtLens · Built with Next.js &amp; OpenRouter
      </footer>
    </div>
  );
}
