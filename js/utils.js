// ─── SUPERNAT · math helpers ───────────────────────────────────────────────
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 1, b) =>
  b === undefined ? Math.random() * a : a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const chance = (p) => Math.random() < p;
export const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};
export const angleTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
export function norm(x, y) {
  const l = Math.hypot(x, y);
  return l > 1e-5 ? [x / l, y / l] : [0, 0];
}
