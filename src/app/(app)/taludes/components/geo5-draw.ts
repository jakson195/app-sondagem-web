import type { AnalysisResult, ProfilePoint, SlipCircle, SliceData, SoilLayer, WaterTable } from "./stability-engine";
import { exportProfileY, getSlipArcSegment } from "./stability-engine";

export type CanvasViewport = {
  pad: { l: number; r: number; t: number; b: number };
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  plotW: number;
  plotH: number;
};

export function buildViewport(
  profile: ProfilePoint[],
  width: number,
  height: number,
): CanvasViewport {
  const pad = { l: 58, r: 24, t: 28, b: 46 };
  const xs = profile.map((p) => p.x);
  const ys = profile.map((p) => p.y);
  const xMin = Math.min(...xs) - 2;
  const xMax = Math.max(...xs) + 2;
  const yMin = Math.min(...ys) - 3;
  const yMax = Math.max(...ys) + 8;
  return {
    pad,
    xMin,
    xMax,
    yMin,
    yMax,
    plotW: width - pad.l - pad.r,
    plotH: height - pad.t - pad.b,
  };
}

export function worldToCanvas(wx: number, wy: number, vp: CanvasViewport) {
  const { pad, xMin, xMax, yMin, yMax, plotW, plotH } = vp;
  return {
    cx: pad.l + ((wx - xMin) / (xMax - xMin)) * plotW,
    cy: pad.t + ((yMax - wy) / (yMax - yMin)) * plotH,
  };
}

function surfacePoints(profile: ProfilePoint[], x1: number, x2: number, step = 0.2): ProfilePoint[] {
  const pts: ProfilePoint[] = [];
  for (let x = x1; x <= x2 + step / 2; x += step) {
    pts.push({ x, y: exportProfileY(profile, x) });
  }
  return pts;
}

function drawGrid(ctx: CanvasRenderingContext2D, vp: CanvasViewport, W: number, H: number) {
  const { pad, xMin, xMax, yMin, yMax } = vp;
  ctx.fillStyle = "#f3f1eb";
  ctx.fillRect(pad.l, pad.t, W - pad.l - pad.r, H - pad.t - pad.b);

  const xSpan = xMax - xMin;
  const ySpan = yMax - yMin;
  const xStep = xSpan > 80 ? 10 : xSpan > 40 ? 5 : 2;
  const yStep = ySpan > 40 ? 5 : 2;

  ctx.strokeStyle = "rgba(120,120,120,.18)";
  ctx.lineWidth = 1;
  for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
    const { cx } = worldToCanvas(x, 0, vp);
    ctx.beginPath();
    ctx.moveTo(cx, pad.t);
    ctx.lineTo(cx, H - pad.b);
    ctx.stroke();
  }
  for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
    const { cy } = worldToCanvas(0, y, vp);
    ctx.beginPath();
    ctx.moveTo(pad.l, cy);
    ctx.lineTo(W - pad.r, cy);
    ctx.stroke();
  }

  ctx.strokeStyle = "#555";
  ctx.lineWidth = 1.2;
  ctx.strokeRect(pad.l, pad.t, W - pad.l - pad.r, H - pad.t - pad.b);
}

function drawLayers(
  ctx: CanvasRenderingContext2D,
  vp: CanvasViewport,
  layers: SoilLayer[],
  profile: ProfilePoint[],
  W: number,
) {
  const { pad, xMin, xMax, yMax, yMin } = vp;
  const layerTops = [yMax];
  let cum = yMax;
  for (const l of layers) {
    cum -= l.thickness;
    layerTops.push(cum);
  }

  for (let li = 0; li < layers.length; li++) {
    const l = layers[li];
    const yTop = layerTops[li];
    const yBot = layerTops[li + 1] ?? yMin - 5;
    const { cy: cyTop } = worldToCanvas(xMin, yTop, vp);
    const { cy: cyBot } = worldToCanvas(xMin, yBot, vp);

    ctx.fillStyle = l.color + "55";
    ctx.fillRect(pad.l, cyTop, W - pad.l - pad.r, cyBot - cyTop);

    ctx.strokeStyle = l.color;
    ctx.setLineDash([6, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.l, cyBot);
    ctx.lineTo(W - pad.r, cyBot);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#333";
    ctx.font = "10px Segoe UI, Arial, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(l.name, pad.l + 4, cyTop + 12);
  }

  void xMax;
}

function drawWaterTable(
  ctx: CanvasRenderingContext2D,
  vp: CanvasViewport,
  profile: ProfilePoint[],
  waterTable: WaterTable,
  W: number,
  H: number,
) {
  if (waterTable.points.length < 2) return;
  const { pad, xMin, xMax, yMin } = vp;
  const topPts = surfacePoints(profile, xMin, xMax, 0.5);
  const wtPts = surfacePoints(waterTable.points, xMin, xMax, 0.5);

  ctx.beginPath();
  for (let i = 0; i < wtPts.length; i++) {
    const { cx, cy } = worldToCanvas(wtPts[i].x, wtPts[i].y, vp);
    i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
  }
  for (let i = topPts.length - 1; i >= 0; i--) {
    const { cx, cy } = worldToCanvas(topPts[i].x, Math.min(topPts[i].y, wtPts[Math.min(i, wtPts.length - 1)].y), vp);
    ctx.lineTo(cx, cy);
  }
  ctx.closePath();
  ctx.fillStyle = "rgba(56,132,210,.22)";
  ctx.fill();

  ctx.beginPath();
  for (let i = 0; i < wtPts.length; i++) {
    const { cx, cy } = worldToCanvas(wtPts[i].x, wtPts[i].y, vp);
    i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
  }
  ctx.strokeStyle = "#2563eb";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "#2563eb";
  ctx.font="bold 10px Segoe UI, Arial, sans-serif";
  ctx.textAlign = "left";
  const labelPt = wtPts[Math.floor(wtPts.length / 2)];
  const { cx, cy } = worldToCanvas(labelPt.x, labelPt.y, vp);
  ctx.fillText("NA", cx + 4, cy - 4);

  void H;
  void yMin;
  void pad;
}

function drawSlopeBody(ctx: CanvasRenderingContext2D, vp: CanvasViewport, profile: ProfilePoint[], W: number, H: number) {
  const { pad, xMin, xMax, yMin } = vp;
  ctx.beginPath();
  for (let i = 0; i < profile.length; i++) {
    const { cx, cy } = worldToCanvas(profile[i].x, profile[i].y, vp);
    i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
  }
  const { cx: cxR, cy: cyBot } = worldToCanvas(xMax, yMin - 2, vp);
  const { cx: cxL } = worldToCanvas(xMin, yMin - 2, vp);
  ctx.lineTo(cxR, cyBot);
  ctx.lineTo(cxL, cyBot);
  ctx.closePath();
  ctx.fillStyle = "rgba(180,130,70,.18)";
  ctx.fill();
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2.2;
  ctx.stroke();

  void pad;
  void H;
}

function drawSlicePolygons(
  ctx: CanvasRenderingContext2D,
  vp: CanvasViewport,
  profile: ProfilePoint[],
  circle: SlipCircle,
  slices: SliceData[],
) {
  slices.forEach((s, idx) => {
    const x1 = s.x - s.b / 2;
    const x2 = s.x + s.b / 2;
    const surf = surfacePoints(profile, x1, x2, Math.max(0.15, s.b / 4));
    const arc: ProfilePoint[] = [];
    for (let x = x2; x >= x1 - 0.01; x -= Math.max(0.15, s.b / 4)) {
      const dx = x - circle.cx;
      if (Math.abs(dx) > circle.r) continue;
      const y = circle.cy - Math.sqrt(circle.r * circle.r - dx * dx);
      arc.push({ x, y });
    }
    if (surf.length < 2 || arc.length < 2) return;

    ctx.beginPath();
    surf.forEach((p, i) => {
      const { cx, cy } = worldToCanvas(p.x, p.y, vp);
      i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
    });
    arc.forEach((p) => {
      const { cx, cy } = worldToCanvas(p.x, p.y, vp);
      ctx.lineTo(cx, cy);
    });
    ctx.closePath();
    ctx.fillStyle = idx % 2 === 0 ? "rgba(255,220,120,.35)" : "rgba(255,245,190,.25)";
    ctx.fill();
    ctx.strokeStyle = "rgba(100,80,40,.35)";
    ctx.lineWidth = 0.8;
    ctx.stroke();

    const midSurf = surf[Math.floor(surf.length / 2)];
    const { cx, cy } = worldToCanvas(midSurf.x, midSurf.y, vp);
    ctx.fillStyle = "#444";
    ctx.font = "bold 9px Segoe UI, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(String(idx + 1), cx, cy - 5);
  });
}

function drawSlipSurface(
  ctx: CanvasRenderingContext2D,
  vp: CanvasViewport,
  profile: ProfilePoint[],
  circle: SlipCircle,
  fsColor: string,
  fs?: number,
) {
  const segment = getSlipArcSegment(profile, circle);
  if (!segment) return;

  ctx.beginPath();
  segment.arcPoints.forEach((p, i) => {
    const { cx, cy } = worldToCanvas(p.x, p.y, vp);
    i === 0 ? ctx.moveTo(cx, cy) : ctx.lineTo(cx, cy);
  });
  ctx.strokeStyle = fsColor;
  ctx.lineWidth = 3;
  ctx.stroke();

  const { cx: ex, cy: ey } = worldToCanvas(segment.xEntry, exportProfileY(profile, segment.xEntry), vp);
  const { cx: xx, cy: xy } = worldToCanvas(segment.xExit, exportProfileY(profile, segment.xExit), vp);
  for (const [px, py] of [[ex, ey], [xx, xy]]) {
    ctx.beginPath();
    ctx.arc(px, py, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.strokeStyle = fsColor;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const mid = segment.arcPoints[Math.floor(segment.arcPoints.length / 2)];
  const { cx, cy } = worldToCanvas(mid.x, mid.y, vp);
  if (fs !== undefined) {
    const label = `Fs = ${fs.toFixed(3)}`;
    ctx.font = "bold 13px Segoe UI, Arial, sans-serif";
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.strokeStyle = fsColor;
    ctx.lineWidth = 1.5;
    ctx.fillRect(cx - tw / 2 - 6, cy - 24, tw + 12, 18);
    ctx.strokeRect(cx - tw / 2 - 6, cy - 24, tw + 12, 18);
    ctx.fillStyle = fsColor;
    ctx.textAlign = "center";
    ctx.fillText(label, cx, cy - 10);
  }
}

function drawCircleConstruction(
  ctx: CanvasRenderingContext2D,
  vp: CanvasViewport,
  circle: SlipCircle,
  showFullCircle: boolean,
) {
  const { cx, cy } = worldToCanvas(circle.cx, circle.cy, vp);
  const scaleX = vp.plotW / (vp.xMax - vp.xMin);
  const cr = circle.r * scaleX;

  if (showFullCircle) {
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(180,60,60,.25)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.strokeStyle = "#888";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 8, cy);
  ctx.lineTo(cx + 8, cy);
  ctx.moveTo(cx, cy - 8);
  ctx.lineTo(cx, cy + 8);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fillStyle = "#c0392b";
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = "#555";
  ctx.font = "9px Segoe UI, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`C (${circle.cx.toFixed(1)}, ${circle.cy.toFixed(1)})`, cx + 8, cy - 8);
  ctx.fillText(`R = ${circle.r.toFixed(1)} m`, cx + 8, cy + 4);
}

function drawAxes(ctx: CanvasRenderingContext2D, vp: CanvasViewport, W: number, H: number) {
  const { pad, xMin, xMax, yMin, yMax } = vp;
  ctx.fillStyle = "#333";
  ctx.font = "10px Segoe UI, Arial, sans-serif";

  ctx.textAlign = "right";
  const yStep = yMax - yMin > 40 ? 5 : 2;
  for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
    const { cy } = worldToCanvas(0, y, vp);
    ctx.fillText(y.toFixed(0), pad.l - 6, cy + 3);
  }

  ctx.textAlign = "center";
  const xStep = xMax - xMin > 80 ? 10 : xMax - xMin > 40 ? 5 : 2;
  for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
    const { cx } = worldToCanvas(x, 0, vp);
    ctx.fillText(x.toFixed(0), cx, H - pad.b + 14);
  }

  ctx.font = "bold 11px Segoe UI, Arial, sans-serif";
  ctx.fillText("Distância (m)", pad.l + (W - pad.l - pad.r) / 2, H - 8);
  ctx.save();
  ctx.translate(14, pad.t + (H - pad.t - pad.b) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Cota (m)", 0, 0);
  ctx.restore();
}

export function drawGeo5SlopeScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  opts: {
    profile: ProfilePoint[];
    layers: SoilLayer[];
    waterTable: WaterTable | null;
    circle: SlipCircle | null;
    result: AnalysisResult | null;
    fsColor: string;
    showSlices: boolean;
    showFullCircle: boolean;
    editPoints: boolean;
  },
) {
  const { profile, layers, waterTable, circle, result, fsColor, showSlices, showFullCircle, editPoints } = opts;
  ctx.clearRect(0, 0, width, height);
  const vp = buildViewport(profile, width, height);
  const W = width;
  const H = height;

  drawGrid(ctx, vp, W, H);
  drawLayers(ctx, vp, layers, profile, W);
  if (waterTable) drawWaterTable(ctx, vp, profile, waterTable, W, H);
  drawSlopeBody(ctx, vp, profile, W, H);

  if (circle && result?.slices && showSlices) {
    drawSlicePolygons(ctx, vp, profile, circle, result.slices);
  }

  if (circle) {
    drawCircleConstruction(ctx, vp, circle, showFullCircle);
    drawSlipSurface(ctx, vp, profile, circle, fsColor, result?.fs);
  }

  if (editPoints) {
    for (const p of profile) {
      const { cx, cy } = worldToCanvas(p.x, p.y, vp);
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = "#e67e22";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  drawAxes(ctx, vp, W, H);
}

export function canvasWorldFromEvent(
  ex: number,
  ey: number,
  canvas: HTMLCanvasElement,
  profile: ProfilePoint[],
): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  const vp = buildViewport(profile, canvas.width, canvas.height);
  const px = ((ex - r.left) / r.width) * canvas.width;
  const py = ((ey - r.top) / r.height) * canvas.height;
  const wx = vp.xMin + ((px - vp.pad.l) / vp.plotW) * (vp.xMax - vp.xMin);
  const wy = vp.yMax - ((py - vp.pad.t) / vp.plotH) * (vp.yMax - vp.yMin);
  return { x: wx, y: wy };
}
