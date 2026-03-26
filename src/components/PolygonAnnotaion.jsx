import { useState, useRef, useCallback, useEffect } from "react";

const COLORS = ["#FF3B5C", "#0A84FF", "#30D158", "#FF9F0A", "#BF5AF2", "#4ECDC4"];

function dist(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

export default function PolygonAnnotator() {
  const canvasRef    = useRef(null);
  const fileInputRef = useRef(null);

  const [image, setImage]               = useState(null);
  const [imgTransform, setImgTransform] = useState({ x: 0, y: 0, scale: 1 });
  const [polygons, setPolygons]         = useState([]);
  const [currentPts, setCurrentPts]     = useState([]);
  const [mousePos, setMousePos]         = useState(null);
  const [colorIdx, setColorIdx]         = useState(0);
  const [hovering, setHovering]         = useState(false);
  const [selectedId, setSelectedId]     = useState(null);

  const activeColor = COLORS[colorIdx % COLORS.length];
  const CW = 900, CH = 560;

  // ── Load image ────────────────────────────────────────────────────────
  const loadImage = useCallback((src) => {
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setPolygons([]);
      setCurrentPts([]);
      setSelectedId(null);
      const scale = Math.min(CW / img.width, CH / img.height, 1);
      setImgTransform({
        x: (CW - img.width * scale) / 2,
        y: (CH - img.height * scale) / 2,
        scale,
      });
    };
    img.src = src;
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => loadImage(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (ev) => loadImage(ev.target.result);
      reader.readAsDataURL(file);
    }
  };

  // ── Coordinate helpers ────────────────────────────────────────────────
  // canvas px → image px
  const toImg = useCallback((cx, cy) => ({
    x: (cx - imgTransform.x) / imgTransform.scale,
    y: (cy - imgTransform.y) / imgTransform.scale,
  }), [imgTransform]);

  // image px → canvas px
  const toCvs = useCallback((ix, iy) => ({
    x: ix * imgTransform.scale + imgTransform.x,
    y: iy * imgTransform.scale + imgTransform.y,
  }), [imgTransform]);

  const getCanvasPos = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  // ── Draw ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, CW, CH);

    // Image
    if (image) {
      const { x, y, scale } = imgTransform;
      ctx.drawImage(image, x, y, image.width * scale, image.height * scale);
      ctx.strokeStyle = "#2a3040";
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      ctx.strokeRect(x, y, image.width * scale, image.height * scale);
    }

    // Completed polygons (stored in image-space)
    polygons.forEach((poly) => {
      if (poly.pts.length < 2) return;
      const cp = poly.pts.map((p) => toCvs(p.x, p.y));
      ctx.beginPath();
      ctx.moveTo(cp[0].x, cp[0].y);
      cp.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.fillStyle = poly.color + "30";
      ctx.fill();
      ctx.strokeStyle = selectedId === poly.id ? "#fff" : poly.color;
      ctx.lineWidth = selectedId === poly.id ? 2.5 : 1.8;
      ctx.setLineDash([]);
      ctx.stroke();
      cp.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = poly.color;
        ctx.fill();
      });
      if (poly.label) {
        const cx = cp.reduce((s, p) => s + p.x, 0) / cp.length;
        const cy = cp.reduce((s, p) => s + p.y, 0) / cp.length;
        ctx.font = "bold 12px 'Courier New', monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = "#00000099";
        ctx.fillText(poly.label, cx + 1, cy + 5);
        ctx.fillStyle = poly.color;
        ctx.fillText(poly.label, cx, cy + 4);
      }
    });

    // In-progress polygon
    if (currentPts.length > 0) {
      const cp = currentPts.map((p) => toCvs(p.x, p.y));
      ctx.beginPath();
      ctx.moveTo(cp[0].x, cp[0].y);
      cp.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.strokeStyle = activeColor;
      ctx.lineWidth = 1.8;
      ctx.setLineDash([6, 4]);
      ctx.stroke();

      if (mousePos) {
        ctx.beginPath();
        ctx.moveTo(cp[cp.length - 1].x, cp[cp.length - 1].y);
        ctx.lineTo(mousePos.x, mousePos.y);
        ctx.strokeStyle = activeColor + "88";
        ctx.lineWidth = 1.4;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
      }

      if (currentPts.length >= 2 && mousePos) {
        ctx.beginPath();
        ctx.moveTo(cp[0].x, cp[0].y);
        cp.forEach((p) => ctx.lineTo(p.x, p.y));
        ctx.lineTo(mousePos.x, mousePos.y);
        ctx.closePath();
        ctx.fillStyle = activeColor + "18";
        ctx.fill();
      }

      cp.forEach((p, i) => {
        const isFirst = i === 0;
        const r = hovering && isFirst ? 8 : 4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = hovering && isFirst ? "#fff" : activeColor;
        ctx.fill();
        if (hovering && isFirst) {
          ctx.strokeStyle = activeColor;
          ctx.lineWidth = 2;
          ctx.setLineDash([]);
          ctx.stroke();
        }
      });

      ctx.setLineDash([]);
    }
  }, [polygons, currentPts, mousePos, activeColor, hovering, selectedId, image, imgTransform, toCvs]);

  // ── Mouse handlers ────────────────────────────────────────────────────
  const handleMouseMove = useCallback((e) => {
    const pos = getCanvasPos(e);
    setMousePos(pos);
    if (currentPts.length >= 3) {
      const f = toCvs(currentPts[0].x, currentPts[0].y);
      setHovering(dist(pos.x, pos.y, f.x, f.y) < 12);
    } else {
      setHovering(false);
    }
  }, [currentPts, toCvs]);

  const closePoly = useCallback(() => {
    if (currentPts.length < 3) return;
    const id = `poly_${Date.now()}`;
    setPolygons((prev) => [...prev, { id, pts: currentPts, color: activeColor, label: `P${prev.length + 1}` }]);
    setCurrentPts([]);
    setHovering(false);
    setColorIdx((i) => i + 1);
  }, [currentPts, activeColor]);

  const handleClick = useCallback((e) => {
    if (e.detail === 2) return;
    if (!image) return;
    const canvasPos = getCanvasPos(e);
    if (currentPts.length >= 3 && hovering) { closePoly(); return; }
    setCurrentPts((prev) => [...prev, toImg(canvasPos.x, canvasPos.y)]);
  }, [image, currentPts, hovering, closePoly, toImg]);

  const handleDblClick = useCallback(() => closePoly(), [closePoly]);
  const handleMouseLeave = () => setMousePos(null);

  // ── Keyboard shortcuts ────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") { setCurrentPts([]); setHovering(false); }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        setPolygons((prev) => prev.filter((p) => p.id !== selectedId));
        setSelectedId(null);
      }
      if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
        setCurrentPts((prev) => prev.slice(0, -1));
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId]);

  const isDrawing = currentPts.length > 0;

  // ── Export ────────────────────────────────────────────────────────────
  const handleExport = () => {
    if (!image) return;
    const out = polygons.map((poly) => ({
      id: poly.id, label: poly.label, color: poly.color,
      points_px: poly.pts,
      points_norm: poly.pts.map((p) => ({
        x: +(p.x / image.width).toFixed(4),
        y: +(p.y / image.height).toFixed(4),
      })),
    }));
    const a = document.createElement("a");
    a.href = "data:application/json," + encodeURIComponent(JSON.stringify(out, null, 2));
    a.download = "annotations.json";
    a.click();
  };

  // ── UI ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#0e1117", display: "flex", flexDirection: "column", fontFamily: "'Courier New', monospace", color: "#e0e0e0" }}>
      {/* Header */}
      <div style={{ padding: "10px 20px", borderBottom: "1px solid #1e2430", display: "flex", alignItems: "center", gap: 14, background: "#12161f" }}>
        <span style={{ fontSize: 16, color: activeColor, fontWeight: "bold", letterSpacing: 2 }}>⬡ POLYGON ANNOTATOR</span>
        <div style={{ flex: 1 }} />
        {image && <span style={{ fontSize: 11, color: "#455" }}>{image.width}×{image.height}px</span>}
        <span style={{ fontSize: 11, color: "#555" }}>
          {polygons.length} polygon{polygons.length !== 1 ? "s" : ""}
          {isDrawing && <span style={{ color: activeColor }}> · pt {currentPts.length}</span>}
        </span>
        <button onClick={() => fileInputRef.current.click()} style={{ ...btnS, background: "#1e2a3a", color: "#0A84FF" }}>
          {image ? "Change Image" : "Upload Image"}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: "none" }} />
        {isDrawing && (
          <button onClick={() => { setCurrentPts([]); setHovering(false); }} style={{ ...btnS, background: "#1e2430", color: "#aaa" }}>Cancel (Esc)</button>
        )}
        {polygons.length > 0 && (
          <button onClick={() => { setPolygons([]); setSelectedId(null); }} style={{ ...btnS, background: "#2a1a1a", color: "#FF3B5C" }}>Clear All</button>
        )}
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Canvas */}
        <div style={{ flex: 1, position: "relative", background: "#181c27" }}
          onDrop={handleDrop} onDragOver={(e) => e.preventDefault()}>
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.05, pointerEvents: "none" }}>
            <defs>
              <pattern id="g" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#4488ff" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#g)" />
          </svg>

          <canvas
            ref={canvasRef} width={CW} height={CH}
            onClick={handleClick} onDoubleClick={handleDblClick}
            onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}
            style={{
              display: "block", position: "relative", zIndex: 1,
              cursor: !image ? "default" : isDrawing ? (hovering ? "pointer" : "crosshair") : "default",
            }}
          />

          {!image && (
            <div onClick={() => fileInputRef.current.click()} style={{
              position: "absolute", inset: 0, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 2,
              border: "2px dashed #2a3550", margin: 40, borderRadius: 12,
            }}>
              <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.3 }}>🖼</div>
              <div style={{ fontSize: 14, letterSpacing: 2, color: "#3a4a6a" }}>CLICK OR DROP IMAGE HERE</div>
              <div style={{ fontSize: 11, marginTop: 6, color: "#2a3045" }}>PNG · JPG · WEBP</div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ width: 220, background: "#12161f", borderLeft: "1px solid #1e2430", display: "flex", flexDirection: "column", fontSize: 11 }}>
          {/* Shortcuts */}
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #1e2430" }}>
            <div style={{ color: "#3a4a6a", marginBottom: 8, letterSpacing: 1 }}>SHORTCUTS</div>
            {[["Click","Add point"],["1st point","Close polygon"],["Dbl-click","Close polygon"],["Ctrl+Z","Undo pt"],["Esc","Cancel"],["Del","Delete selected"]].map(([k, d]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                <span style={{ color: "#6a7a9a", fontWeight: "bold" }}>{k}</span>
                <span style={{ color: "#445" }}>{d}</span>
              </div>
            ))}
          </div>

          {/* Color */}
          <div style={{ padding: "14px 16px", borderBottom: "1px solid #1e2430" }}>
            <div style={{ color: "#3a4a6a", marginBottom: 8, letterSpacing: 1 }}>ACTIVE COLOR</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {COLORS.map((c, i) => (
                <div key={c} onClick={() => setColorIdx(i)} style={{
                  width: 24, height: 24, borderRadius: 5, background: c, cursor: "pointer",
                  border: colorIdx % COLORS.length === i ? "2px solid #fff" : "2px solid transparent",
                  opacity: colorIdx % COLORS.length === i ? 1 : 0.45,
                  transition: "all .15s",
                }} />
              ))}
            </div>
          </div>

          {/* Polygon list */}
          <div style={{ padding: "14px 16px", flex: 1, overflowY: "auto" }}>
            <div style={{ color: "#3a4a6a", marginBottom: 8, letterSpacing: 1 }}>POLYGONS</div>
            {polygons.length === 0 && (
              <div style={{ color: "#2a3045", lineHeight: 1.5 }}>
                {image ? "Click the image to start annotating" : "Upload an image first"}
              </div>
            )}
            {polygons.map((poly) => (
              <div key={poly.id} onClick={() => setSelectedId(selectedId === poly.id ? null : poly.id)}
                style={{
                  padding: "6px 8px", marginBottom: 4, borderRadius: 4, cursor: "pointer",
                  border: `1px solid ${selectedId === poly.id ? poly.color : "#1e2430"}`,
                  background: selectedId === poly.id ? poly.color + "18" : "#0e1117",
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: poly.color, flexShrink: 0 }} />
                <span style={{ color: "#aaa", flex: 1 }}>{poly.label}</span>
                <span style={{ color: "#3a4a6a" }}>{poly.pts.length}pt</span>
                <span onClick={(e) => { e.stopPropagation(); setPolygons((p) => p.filter((x) => x.id !== poly.id)); if (selectedId === poly.id) setSelectedId(null); }}
                  style={{ color: "#FF3B5C66", cursor: "pointer" }}>✕</span>
              </div>
            ))}
          </div>

          {/* Export */}
          {polygons.length > 0 && (
            <div style={{ padding: "12px 16px", borderTop: "1px solid #1e2430" }}>
              <button onClick={handleExport} style={{ ...btnS, width: "100%", background: "#1e2a1e", color: "#30D158" }}>
                Export JSON
              </button>
              <div style={{ color: "#2a3a2a", marginTop: 6, lineHeight: 1.5 }}>
                Saves pixel coords + normalized 0–1 coords
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const btnS = {
  padding: "5px 12px", borderRadius: 4, border: "1px solid #2a3040",
  cursor: "pointer", fontSize: 11, fontFamily: "'Courier New', monospace", letterSpacing: 1,
};