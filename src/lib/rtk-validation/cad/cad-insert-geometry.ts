import type { CadVertex } from "./types";

export function circleVertices(center: CadVertex, radius: number, segments = 32): CadVertex[] {
  const r = Math.max(radius, 0.001);
  return Array.from({ length: segments }, (_, i) => {
    const a = (i / segments) * Math.PI * 2;
    return {
      x: center.x + r * Math.cos(a),
      y: center.y + r * Math.sin(a),
      z: center.z,
    };
  });
}

function circleFrom3(a: CadVertex, b: CadVertex, c: CadVertex): { center: CadVertex; radius: number } | null {
  const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
  if (Math.abs(d) < 1e-12) return null;
  const ux =
    ((a.x ** 2 + a.y ** 2) * (b.y - c.y) + (b.x ** 2 + b.y ** 2) * (c.y - a.y) + (c.x ** 2 + c.y ** 2) * (a.y - b.y)) / d;
  const uy =
    ((a.x ** 2 + a.y ** 2) * (c.x - b.x) + (b.x ** 2 + b.y ** 2) * (a.x - c.x) + (c.x ** 2 + c.y ** 2) * (b.x - a.x)) / d;
  const center = { x: ux, y: uy, z: a.z };
  return { center, radius: Math.hypot(a.x - ux, a.y - uy) };
}

export function arcVertices(a: CadVertex, b: CadVertex, c: CadVertex, segments = 24): CadVertex[] | null {
  const fit = circleFrom3(a, b, c);
  if (!fit) return [a, b, c];
  const ang = (p: CadVertex) => Math.atan2(p.y - fit.center.y, p.x - fit.center.x);
  let a0 = ang(a);
  let a1 = ang(b);
  let a2 = ang(c);
  const ccw = (a2 - a0 + Math.PI * 4) % (Math.PI * 2);
  const mid = (a1 - a0 + Math.PI * 4) % (Math.PI * 2);
  const sweep = mid <= ccw ? ccw : ccw - Math.PI * 2;
  return Array.from({ length: segments + 1 }, (_, i) => {
    const t = a0 + (sweep * i) / segments;
    return {
      x: fit.center.x + fit.radius * Math.cos(t),
      y: fit.center.y + fit.radius * Math.sin(t),
      z: a.z,
    };
  });
}
