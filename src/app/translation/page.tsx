"use client";

import { useState, useRef, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────
type FileSlot = {
  file: File | null;
  preview: string | null;
};

// ─── Supported languages ─────────────────────────────────
const LANGUAGES = [
  "English",
  "Arabic",
  "French",
  "German",
  "Spanish",
  "Portuguese",
  "Chinese (Simplified)",
  "Chinese (Traditional)",
  "Japanese",
  "Korean",
  "Hindi",
  "Urdu",
  "Russian",
  "Italian",
  "Dutch",
  "Turkish",
  "Thai",
  "Vietnamese",
  "Indonesian",
  "Malay",
];

// ─── Icons ────────────────────────────────────────────────
const UploadIcon = () => (
  <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
  </svg>
);

const TranslateIcon = () => (
  <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12.87 15.07l-2.54-2.51.03-.03A17.52 17.52 0 0014.07 6H17V4h-7V2H8v2H1v2h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/>
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

const CopyIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </svg>
);

const DownloadIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
  </svg>
);

// ─── Drop Zone ────────────────────────────────────────────
function DropZone({
  slot,
  onChange,
  onClear,
}: {
  slot: FileSlot;
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <label
          style={{
            fontSize: "0.8125rem",
            fontWeight: 600,
            color: "var(--text-secondary)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          Artwork File
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
                    top: 6, right: 6,
                    background: "white", border: "none", borderRadius: "50%",
                    width: 26, height: 26,
                    display: "flex", alignItems: "center", justifyContent: "center",
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
                  display: "flex", alignItems: "center", gap: "0.75rem",
                  padding: "1rem", background: "white", borderRadius: 10,
                  marginBottom: "0.75rem",
                }}
              >
                <div style={{ color: "var(--primary)", flexShrink: 0 }}>
                  <FileIcon />
                </div>
                <span
                  style={{
                    fontSize: "0.85rem", fontWeight: 500, color: "var(--text-primary)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                >
                  {slot.file.name}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); onClear(); }}
                  style={{
                    marginLeft: "auto", background: "none", border: "none",
                    cursor: "pointer", color: "var(--text-muted)", flexShrink: 0,
                    display: "flex", alignItems: "center",
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
              position: "relative", zIndex: 1,
              display: "flex", flexDirection: "column", alignItems: "center",
              gap: "0.6rem", color: "var(--text-muted)", padding: "1rem 0",
            }}
          >
            <div
              style={{
                width: 52, height: 52, borderRadius: "50%",
                background: "var(--primary-ultralight)",
                display: "flex", alignItems: "center", justifyContent: "center",
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

// ─── Processing Steps ─────────────────────────────────────
const STEPS = [
  { label: "Uploading file to AI…", icon: "📤" },
  { label: "Processing artwork…", icon: "🔍" },
  { label: "Extracting text…", icon: "📝" },
  { label: "Categorizing content…", icon: "📂" },
  { label: "Translating…", icon: "🌐" },
  { label: "Generating report…", icon: "📄" },
];

// ─── Main Page ────────────────────────────────────────────
export default function TranslationPage() {
  const [slot, setSlot] = useState<FileSlot>({ file: null, preview: null });
  const [targetLang, setTargetLang] = useState("English");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [copied, setCopied] = useState(false);
  const stepIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const handleFileChange = (file: File) => {
    const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    if (slot.preview) URL.revokeObjectURL(slot.preview);
    setSlot({ file, preview });
    setResult(null);
    setError(null);
  };

  const handleClear = () => {
    if (slot.preview) URL.revokeObjectURL(slot.preview);
    setSlot({ file: null, preview: null });
  };

  const handleTranslate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slot.file) return;

    setLoading(true);
    setResult(null);
    setError(null);
    setCurrentStep(0);

    // Animate through steps
    let step = 0;
    stepIntervalRef.current = setInterval(() => {
      step = Math.min(step + 1, STEPS.length - 1);
      setCurrentStep(step);
    }, 4000);

    const formData = new FormData();
    formData.append("file", slot.file);
    formData.append("targetLanguage", targetLang);

    try {
      const res = await fetch("/api/translate", { method: "POST", body: formData });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data.translation);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      if (stepIntervalRef.current) clearInterval(stepIntervalRef.current);
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!result) return;
    const blob = new Blob([`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Translation Report</title></head><body>${result}</body></html>`], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `translation-report-${slot.file?.name || "artwork"}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
              width: 30, height: 30, borderRadius: 8,
              background: "linear-gradient(135deg, var(--primary), var(--primary-light))",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
              <path d="M12 2l2.09 6.26L21 10l-6.91 1.74L12 22l-2.09-8.26L3 12l6.91-1.74L12 2z"/>
            </svg>
          </div>
          <a href="/" style={{ textDecoration: "none", color: "inherit" }}>
            <span style={{ fontWeight: 700, fontSize: "1rem", letterSpacing: "-0.01em" }}>
              ArtLens
            </span>
          </a>
          <span style={{
            fontSize: "0.7rem", color: "var(--text-muted)", fontWeight: 500,
            padding: "2px 8px", background: "var(--primary-ultralight)", borderRadius: 6,
            marginLeft: 4,
          }}>
            Translation
          </span>
        </div>
        <span className="badge badge-primary">
          <TranslateIcon />
          AI Translator
        </span>
      </header>

      {/* ── Main ── */}
      <main
        style={{
          flex: 1,
          width: "100%",
          maxWidth: 780,
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
            Translate artwork text
            <br />
            <span style={{ color: "var(--primary)" }}>with AI precision</span>
          </h1>
          <p
            style={{
              fontSize: "clamp(0.875rem, 3vw, 1rem)",
              color: "var(--text-secondary)",
              maxWidth: 480,
              margin: "0 auto",
              lineHeight: 1.65,
            }}
          >
            Upload any pharmaceutical artwork — get every piece of text extracted,
            categorized, and translated into your target language.
          </p>
        </div>

        {/* Upload & Settings Card */}
        <div className="card animate-fade-in" style={{ animationDelay: "0.1s" }}>
          <div
            style={{
              background: "linear-gradient(135deg, var(--primary-ultralight) 0%, white 100%)",
              padding: "1.25rem 1.5rem 0.5rem",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <p style={{
              fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)",
              letterSpacing: "0.04em", textTransform: "uppercase",
            }}>
              Step 1 — Upload &amp; Configure
            </p>
          </div>

          <form onSubmit={handleTranslate} style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <DropZone slot={slot} onChange={handleFileChange} onClear={handleClear} />

            {/* Language selector */}
            <div>
              <label
                style={{
                  fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)",
                  letterSpacing: "0.04em", textTransform: "uppercase",
                  display: "block", marginBottom: "0.5rem",
                }}
              >
                Target Language
              </label>
              <div style={{ position: "relative" }}>
                <select
                  value={targetLang}
                  onChange={(e) => setTargetLang(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.75rem 1rem",
                    fontSize: "0.9375rem",
                    fontWeight: 500,
                    color: "var(--text-primary)",
                    background: "var(--surface)",
                    border: "2px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    cursor: "pointer",
                    outline: "none",
                    fontFamily: "'Inter', sans-serif",
                    appearance: "none",
                    WebkitAppearance: "none",
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 5l3 3 3-3' stroke='%236b6882' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 1rem center",
                    paddingRight: "2.5rem",
                    transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "var(--primary)";
                    e.currentTarget.style.boxShadow = "0 0 0 4px var(--primary-ultralight)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "var(--border)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang} value={lang}>{lang}</option>
                  ))}
                </select>
              </div>
              <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>
                Non-target-language text will be translated. Target-language text is kept as-is.
              </p>
            </div>

            {/* Loading progress */}
            {loading && (
              <div style={{
                display: "flex", flexDirection: "column", gap: "0.75rem",
                background: "var(--primary-ultralight)", borderRadius: "var(--radius-sm)",
                padding: "1.25rem",
              }}>
                <div className="progress-bar"><div className="progress-bar-fill" /></div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {STEPS.map((s, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex", alignItems: "center", gap: "0.5rem",
                        fontSize: "0.8rem",
                        fontWeight: i === currentStep ? 600 : 400,
                        color: i < currentStep
                          ? "#1a8536"
                          : i === currentStep
                            ? "var(--primary)"
                            : "var(--text-muted)",
                        opacity: i > currentStep ? 0.5 : 1,
                        transition: "all 0.3s ease",
                      }}
                    >
                      <span style={{ width: 20, textAlign: "center" }}>
                        {i < currentStep ? "✓" : s.icon}
                      </span>
                      {s.label}
                      {i === currentStep && (
                        <span className="spinner" style={{
                          width: 12, height: 12,
                          borderColor: "rgba(108,71,255,0.2)",
                          borderTopColor: "var(--primary)",
                          borderWidth: 2,
                          marginLeft: 4,
                        }} />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={!slot.file || loading}
              className="btn-primary"
              style={{ marginTop: "0.25rem" }}
            >
              {loading ? (
                <>
                  <span className="spinner" />
                  Translating…
                </>
              ) : (
                <>
                  <TranslateIcon />
                  Extract &amp; Translate Artwork
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
              <p style={{
                fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-secondary)",
                letterSpacing: "0.04em", textTransform: "uppercase",
              }}>
                Step 2 — {error ? "Error" : "Translation Report"}
              </p>

              {result && (
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    onClick={handleCopy}
                    style={{
                      background: "none",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      padding: "0.25rem 0.65rem",
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      color: copied ? "#1a8536" : "var(--text-secondary)",
                      cursor: "pointer",
                      letterSpacing: "0.02em",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      transition: "all 0.2s ease",
                    }}
                  >
                    <CopyIcon />
                    {copied ? "Copied!" : "Copy HTML"}
                  </button>
                  <button
                    onClick={handleDownload}
                    style={{
                      background: "none",
                      border: "1px solid var(--border)",
                      borderRadius: 6,
                      padding: "0.25rem 0.65rem",
                      fontSize: "0.72rem",
                      fontWeight: 600,
                      color: "var(--text-secondary)",
                      cursor: "pointer",
                      letterSpacing: "0.02em",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      transition: "all 0.2s ease",
                    }}
                  >
                    <DownloadIcon />
                    Download
                  </button>
                </div>
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
                <div
                  style={{
                    background: "var(--surface)",
                    borderRadius: "var(--radius)",
                    border: "1px solid var(--border)",
                    padding: "1.75rem",
                    boxShadow: "var(--shadow-sm)",
                    animation: "fadeInUp 0.4s ease",
                    overflow: "auto",
                  }}
                  dangerouslySetInnerHTML={{ __html: result || "" }}
                />
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
        ArtLens · Artwork Translation · Built with Next.js &amp; Gemini AI
      </footer>
    </div>
  );
}