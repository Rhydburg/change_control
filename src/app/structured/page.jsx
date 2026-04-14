'use client'
import { useState, useRef } from "react";

const PHARMA_PROMPT = `You are a pharmaceutical regulatory expert specializing in Change Control documentation for artwork. 

You will receive TWO artwork images:
1. PREVIOUS/CURRENT artwork (old version)
2. NEW/REVISED artwork (new version)

Compare both artworks carefully and identify ALL visible differences. Then generate a Change Control entry as valid JSON ONLY — no markdown, no backticks, no preamble.

Return exactly this structure:
{
  "productName": "product name from artwork",
  "packType": "CARTON or TUBE or LABEL etc.",
  "currentDocNo": "spec/doc number from old artwork",
  "newDocNo": "spec/doc number from new artwork",
  "currentState": ["observation 1 about old artwork", "observation 2", "..."],
  "newSuggestedState": ["change 1 in new artwork", "change 2", "..."],
  "scientificRationale": "regulatory/quality reason for these changes",
  "impactedDocuments": ["Specification", "BPR", "SOP", "Label - list relevant ones"],
  "changeType": "Minor or Major or Critical",
  "riskLevel": "Low or Medium or High",
  "regulatoryImpact": "Yes - reason, or No - reason"
}`;

function UploadBox({ label, image, onChange, accent }) {
  const ref = useRef();
  const read = (file) => {
    const r = new FileReader();
    r.onload = (e) => onChange({ dataUrl: e.target.result, base64: e.target.result.split(",")[1], mime: file.type });
    r.readAsDataURL(file);
  };
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: accent, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div
        onClick={() => ref.current.click()}
        onDrop={(e) => { e.preventDefault(); e.dataTransfer.files[0] && read(e.dataTransfer.files[0]); }}
        onDragOver={(e) => e.preventDefault()}
        style={{
          border: `2px dashed ${image ? accent : "#d1d5db"}`,
          borderRadius: 10, minHeight: 160, cursor: "pointer",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: image ? "flex-start" : "center",
          background: image ? "transparent" : "#f9fafb", overflow: "hidden", position: "relative", transition: "border-color 0.2s",
        }}
      >
        <input ref={ref} type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => e.target.files[0] && read(e.target.files[0])} />
        {image ? (
          <>
            <img src={image.dataUrl} alt={label} style={{ width: "100%", maxHeight: 200, objectFit: "contain" }} />
            <div style={{ position: "absolute", bottom: 6, right: 8, fontSize: 11, background: "#fff", padding: "2px 8px", borderRadius: 4, color: "#6b7280", border: "1px solid #e5e7eb" }}>click to change</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.3 }}>🖼</div>
            <div style={{ fontSize: 13, color: "#9ca3af" }}>Click or drag & drop</div>
          </>
        )}
      </div>
    </div>
  );
}

function Pill({ text, map }) {
  const colors = { Minor: "#d1fae5:#065f46", Major: "#fef3c7:#92400e", Critical: "#fee2e2:#991b1b", Low: "#d1fae5:#065f46", Medium: "#fef3c7:#92400e", High: "#fee2e2:#991b1b", Yes: "#fef3c7:#92400e", No: "#d1fae5:#065f46" };
  const key = Object.keys(colors).find(k => (text || "").startsWith(k)) || "";
  const [bg, fg] = (colors[key] || "#e0e7ff:#3730a3").split(":");
  return <span style={{ background: bg, color: fg, fontSize: 11, padding: "2px 10px", borderRadius: 20, fontWeight: 600 }}>{text}</span>;
}

function Row({ label, children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "190px 1fr", borderBottom: "1px solid #f3f4f6" }}>
      <div style={{ padding: "10px 14px", background: "#f9fafb", fontSize: 12, fontWeight: 600, color: "#6b7280", borderRight: "1px solid #f3f4f6" }}>{label}</div>
      <div style={{ padding: "10px 14px", fontSize: 13, color: "#111827", lineHeight: 1.7 }}>{children}</div>
    </div>
  );
}

export default function App() {
  const [prev, setPrev] = useState(null);
  const [next, setNext] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [ccNo, setCcNo] = useState("");
  const [initiator, setInitiator] = useState("");
  const [dept, setDept] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

  const generate = async () => {
    if (!prev || !next) { setError("Please upload both artworks first."); return; }
    setError(""); setLoading(true); setResult(null);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: PHARMA_PROMPT,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: "IMAGE 1 — PREVIOUS artwork:" },
              { type: "image", source: { type: "base64", media_type: prev.mime, data: prev.base64 } },
              { type: "text", text: "IMAGE 2 — NEW artwork:" },
              { type: "image", source: { type: "base64", media_type: next.mime, data: next.base64 } },
              { type: "text", text: "Compare and return JSON only. No markdown." }
            ]
          }]
        })
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      const raw = (data.content || []).map(b => b.text || "").join("").replace(/```json|```/g, "").trim();
      setResult(JSON.parse(raw));
    } catch (e) {
      setError("Error: " + e.message);
    }
    setLoading(false);
  };

  const inputStyle = { padding: "8px 10px", fontSize: 13, border: "1px solid #d1d5db", borderRadius: 6, width: "100%", boxSizing: "border-box", outline: "none", fontFamily: "inherit" };
  const labelStyle = { fontSize: 11, color: "#6b7280", display: "block", marginBottom: 5, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" };

  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", maxWidth: 860, margin: "0 auto", paddingBottom: 48, color: "#111827" }}>
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #1e3a5f 0%, #185FA5 100%)", borderRadius: 12, padding: "20px 24px", marginBottom: 20, color: "#fff" }}>
        <div style={{ fontSize: 11, opacity: 0.7, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>Rhydburg Pharmaceuticals — QA / Regulatory</div>
        <div style={{ fontSize: 20, fontWeight: 600 }}>Artwork Change Control — AI Entry Generator</div>
        <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>Form No: RHP-CC-ART-01 | Upload both artworks → AI compares → CC form auto-filled</div>
      </div>

      {/* Meta */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 18 }}>
        {[
          { label: "CC Number", val: ccNo, set: setCcNo, ph: "CC-2024-001" },
          { label: "Initiator Name", val: initiator, set: setInitiator, ph: "Your name" },
          { label: "Department", val: dept, set: setDept, ph: "QA / R&D / RA" },
          { label: "Date", val: date, set: setDate, type: "date" },
        ].map(f => (
          <div key={f.label}>
            <label style={labelStyle}>{f.label}</label>
            <input type={f.type || "text"} value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.ph} style={inputStyle} />
          </div>
        ))}
      </div>

      {/* Upload */}
      <div style={{ display: "flex", gap: 14, marginBottom: 16 }}>
        <UploadBox label="Current / Previous Artwork" image={prev} onChange={setPrev} accent="#dc2626" />
        <UploadBox label="New / Revised Artwork" image={next} onChange={setNext} accent="#16a34a" />
      </div>

      {error && <div style={{ background: "#fee2e2", color: "#991b1b", padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 12 }}>{error}</div>}

      <button
        onClick={generate}
        disabled={loading || !prev || !next}
        style={{
          width: "100%", padding: "12px", fontSize: 14, fontWeight: 600,
          background: loading || !prev || !next ? "#e5e7eb" : "#185FA5",
          color: loading || !prev || !next ? "#9ca3af" : "#fff",
          border: "none", borderRadius: 8, cursor: loading || !prev || !next ? "not-allowed" : "pointer",
          marginBottom: 24, transition: "all 0.2s",
        }}
      >
        {loading ? "⏳  AI artworks compare kar raha hai — please wait..." : "Compare Artworks & Generate Change Control Entry →"}
      </button>

      {result && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#185FA5" }}>Generated Change Control Entry</div>
            <div style={{ display: "flex", gap: 6 }}>
              <Pill text={result.changeType} /><Pill text={result.riskLevel} />
            </div>
          </div>

          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ background: "#1e3a5f", color: "#fff", padding: "10px 16px", display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 600 }}>
              <span>Change Control Form — Artwork Revision</span>
              <span style={{ fontWeight: 400, fontSize: 12, opacity: 0.8 }}>CC No: {ccNo || "—"}  |  Date: {date}  |  Initiator: {initiator || "—"}</span>
            </div>

            <Row label="Product Name">{result.productName}</Row>
            <Row label="Pack Type">{result.packType}</Row>
            <Row label="Department / Initiator">{[initiator, dept].filter(Boolean).join(" / ") || "—"}</Row>
            <Row label="Change Type">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Pill text={result.changeType} />
                <span style={{ fontSize: 12, color: "#6b7280" }}>Risk:</span>
                <Pill text={result.riskLevel} />
              </div>
            </Row>

            <div style={{ display: "grid", gridTemplateColumns: "190px 1fr 1fr", borderBottom: "1px solid #f3f4f6" }}>
              <div style={{ padding: "10px 14px", background: "#f9fafb", fontSize: 12, fontWeight: 600, color: "#6b7280", borderRight: "1px solid #f3f4f6" }}>Document Numbers</div>
              <div style={{ padding: "10px 14px", fontSize: 13, borderRight: "1px solid #f3f4f6" }}><span style={{ color: "#6b7280", fontSize: 11 }}>Current: </span>{result.currentDocNo || "—"}</div>
              <div style={{ padding: "10px 14px", fontSize: 13 }}><span style={{ color: "#6b7280", fontSize: 11 }}>New: </span>{result.newDocNo || "—"}</div>
            </div>

            <Row label="Current / Previous State">
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {(result.currentState || []).map((s, i) => <li key={i} style={{ color: "#dc2626", marginBottom: 4 }}>{s}</li>)}
              </ul>
            </Row>

            <Row label="New Suggested State">
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {(result.newSuggestedState || []).map((s, i) => <li key={i} style={{ color: "#16a34a", marginBottom: 4 }}>{s}</li>)}
              </ul>
            </Row>

            <Row label="Scientific Rationale">{result.scientificRationale}</Row>

            <Row label="Regulatory Impact">
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                <Pill text={(result.regulatoryImpact || "").startsWith("Yes") ? "Yes" : "No"} />
                <span style={{ fontSize: 12, color: "#374151" }}>{result.regulatoryImpact}</span>
              </div>
            </Row>

            <Row label="Documents to Revise">
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(result.impactedDocuments || []).map((d, i) =>
                  <span key={i} style={{ background: "#dbeafe", color: "#1e40af", fontSize: 11, padding: "3px 10px", borderRadius: 20, fontWeight: 600 }}>{d}</span>
                )}
              </div>
            </Row>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
              {["Prepared By", "Reviewed By (QA)", "Approved By"].map((role, i) => (
                <div key={role} style={{ padding: "14px 16px", borderRight: i < 2 ? "1px solid #f3f4f6" : "none" }}>
                  <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 30, fontWeight: 600, textTransform: "uppercase" }}>{role}</div>
                  <div style={{ borderTop: "1px solid #d1d5db", paddingTop: 5, fontSize: 11, color: "#d1d5db" }}>Signature / Date</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
            {[{ label: "Previous Artwork", img: prev, c: "#dc2626", bg: "#fee2e2" }, { label: "New Artwork", img: next, c: "#16a34a", bg: "#d1fae5" }].map(({ label, img, c, bg }) => (
              <div key={label} style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
                <div style={{ background: bg, color: c, fontSize: 11, fontWeight: 600, padding: "5px 10px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
                {img && <img src={img.dataUrl} alt={label} style={{ width: "100%", display: "block", maxHeight: 180, objectFit: "contain" }} />}
              </div>
            ))}
          </div>

          <div style={{ textAlign: "center", marginTop: 12, fontSize: 11, color: "#9ca3af" }}>
            AI-generated entry — Please review before official submission | Rhydburg Pharmaceuticals QA
          </div>
        </div>
      )}
    </div>
  );
}