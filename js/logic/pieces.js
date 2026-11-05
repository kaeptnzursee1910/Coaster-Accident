// Alle Bauteile der Achterbahn und wie ihre Bahnkurve berechnet wird.
import { add, mul, cross, forward, leftOf, smooth, DEG } from './vec.js';

export const STEP = 0.25; // Abstand der Stützpunkte in Metern

// Werkstoffe für die Schienen
export const MATERIALS = {
  steel: { name: 'Stahl', icon: '🔩', costFactor: 1.0, capacity: 6.6, friction: 0.012, rattle: 0 },
  wood: { name: 'Holz', icon: '🪵', costFactor: 0.75, capacity: 4.8, friction: 0.02, rattle: 1 },
};

// Schrauben-Qualität (wirkt auf Belastbarkeit, Sicherheit und Preis)
export const BOLTS = {
  cheap: { name: 'Billig', icon: '🟤', capacity: 0.78, costFactor: 0.85, safetyPenalty: 1.5 },
  standard: { name: 'Standard', icon: '⚪', capacity: 1.0, costFactor: 1.0, safetyPenalty: 0.4 },
  premium: { name: 'Premium', icon: '🟡', capacity: 1.18, costFactor: 1.2, safetyPenalty: 0 },
};

// Stützen-Abstand
export const SUPPORTS = {
  wide: { name: 'Weit', icon: '↔️', spacing: 7, capacity: 0.86, costFactor: 0.85, safetyPenalty: 1.0 },
  normal: { name: 'Normal', icon: '⏸️', spacing: 4.5, capacity: 1.0, costFactor: 1.0, safetyPenalty: 0.3 },
  dense: { name: 'Eng', icon: '🦯', spacing: 2.8, capacity: 1.12, costFactor: 1.25, safetyPenalty: 0 },
};

export const COLORS = ['#ff4d6d', '#ffb703', '#3a86ff', '#2ec4b6', '#8338ec', '#fb5607', '#f8f9fa', '#06d6a0'];

// Bauteile. dYaw/dPitch in Grad, lateral = seitlicher Versatz, roll = Drehung um die Fahrtrichtung.
export const PIECES = {
  station: { name: 'Bahnhof', icon: '🚉', len: 12, cost: 0, station: true, hidden: true },
  straight: { name: 'Gerade', icon: '⬆️', len: 4, cost: 300 },
  left: { name: 'Kurve links', icon: '↰', len: (Math.PI / 2) * 12, dYaw: 90, bank: 65, ease: 1, cost: 500, maxPitch: 50 },
  right: { name: 'Kurve rechts', icon: '↱', len: (Math.PI / 2) * 12, dYaw: -90, bank: -65, ease: 1, cost: 500, maxPitch: 50 },
  up: { name: 'Hoch', icon: '↗️', len: 5, dPitch: 25, cost: 400 },
  down: { name: 'Runter', icon: '↘️', len: 5, dPitch: -25, cost: 400 },
  loop: { name: 'Looping', icon: '➰', len: 40, dPitch: 360, lateral: 3, teardrop: 0.7, cost: 2500, flatOnly: true, inversion: true, noChain: true },
  corkscrew: { name: 'Schraube', icon: '🌀', len: 16, roll: 360, heart: 1.1, cost: 2000, flatOnly: true, inversion: true, noChain: true },
  brake: { name: 'Bremse', icon: '🛑', len: 4, brake: true, cost: 600, noChain: true },
};

export const BUILD_ORDER = ['straight', 'left', 'right', 'up', 'down', 'loop', 'corkscrew', 'brake'];
export const CHAIN_COST = 250; // Aufpreis pro Teil mit Kettenlift

// Berechnet die Stützpunkte eines Bauteils ab einem Startzustand {pos, yaw, pitch}.
export function generatePiece(type, state) {
  const def = PIECES[type];
  const n = Math.max(2, Math.ceil(def.len / STEP));
  const ds = def.len / n;
  const dYaw = def.dYaw || 0;
  const dPitch = def.dPitch || 0;
  const L0 = leftOf(state.yaw);
  const pitchAt = (t) => {
    if (def.teardrop) {
      const a = def.teardrop;
      return state.pitch + dPitch * (t - (a * Math.sin(2 * Math.PI * t)) / (2 * Math.PI));
    }
    return state.pitch + dPitch * t;
  };
  const e = def.ease || 0;
  const yawAt = (t) => state.yaw + dYaw * (t - (e * Math.sin(2 * Math.PI * t)) / (2 * Math.PI));

  const samples = [];
  let base = state.pos.slice();
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (i > 0) {
      const tm = (i - 0.5) / n;
      base = add(base, mul(forward(yawAt(tm), pitchAt(tm)), ds));
    }
    const yaw = yawAt(t), pitch = pitchAt(t);
    const f = forward(yaw, pitch);
    const L = leftOf(yaw);
    const U = cross(f, L);
    let roll = 0;
    if (def.bank) roll = (def.bank * (1 - Math.cos(2 * Math.PI * t))) / 2; // beginnt und endet flach
    if (def.roll) roll = def.roll * smooth(t);
    const r = roll * DEG;
    const Ur = add(mul(U, Math.cos(r)), mul(L, Math.sin(r)));
    const Lr = add(mul(L, Math.cos(r)), mul(U, -Math.sin(r)));
    let p = base;
    if (def.lateral) p = add(p, mul(L0, def.lateral * smooth(t)));
    if (def.heart) p = add(p, mul(add(U, mul(Ur, -1)), def.heart));
    samples.push({ p, up: Ur, left: Lr });
  }
  let endPitch = state.pitch + dPitch;
  if (Math.abs(endPitch) >= 360) endPitch -= 360 * Math.sign(endPitch);
  return {
    samples,
    end: { pos: samples[samples.length - 1].p.slice(), yaw: state.yaw + dYaw, pitch: endPitch },
  };
}
