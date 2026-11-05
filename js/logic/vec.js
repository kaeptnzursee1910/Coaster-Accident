// Kleine Vektor-Helfer für die Spiellogik (unabhängig von Three.js, damit testbar).
export const v3 = (x = 0, y = 0, z = 0) => [x, y, z];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
export const lerp = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
export const dist = (a, b) => len(sub(a, b));
export const DEG = Math.PI / 180;
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const smooth = (t) => t * t * (3 - 2 * t);

// Fahrtrichtung aus Gier (yaw) und Neigung (pitch) in Grad.
// yaw 0 = +z, positiver yaw dreht nach links (Richtung +x).
export function forward(yaw, pitch) {
  const y = yaw * DEG, p = pitch * DEG;
  return [Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)];
}
// Horizontaler Links-Vektor (immer senkrecht zur Fahrtrichtung).
export function leftOf(yaw) {
  const y = yaw * DEG;
  return [Math.cos(y), 0, -Math.sin(y)];
}
