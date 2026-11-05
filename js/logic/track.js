// Die Strecke: Liste der Bauteile, Prüfung, Kosten, Schließen und der fertige Fahrweg.
import { PIECES, MATERIALS, BOLTS, SUPPORTS, generatePiece, STEP, CHAIN_COST } from './pieces.js';
import { add, sub, mul, dot, cross, norm, len, dist, forward, clamp } from './vec.js';

// Baufläche im Freizeitpark (x/z in Metern)
export const PLOT = { minX: -40, maxX: 40, minZ: -31, maxZ: 45, maxY: 55, minY: 0.6 };
export const START = { pos: [-24, 1.2, -27], yaw: 90, pitch: 0 };
export const START_BUDGET = 30000;
const CLOSE_COST_PER_M = 90;

export class Track {
  constructor() {
    this.pieces = [{ type: 'station', material: 'steel', color: '#ff4d6d' }];
    this.settings = { bolts: 'standard', supports: 'normal' };
    this.closed = false;
    this.closer = null; // Stützpunkte des automatisch erzeugten Schlussstücks
    this.income = 0;
    this.rebuild();
  }

  // --- Speichern / Laden ---
  toJSON() {
    return { pieces: this.pieces, settings: this.settings, closed: this.closed, income: this.income };
  }
  static fromJSON(data) {
    const t = new Track();
    try {
      if (!data || !Array.isArray(data.pieces) || data.pieces[0]?.type !== 'station') return t;
      t.pieces = data.pieces.filter((p) => PIECES[p.type] && MATERIALS[p.material]);
      if (data.settings && BOLTS[data.settings.bolts] && SUPPORTS[data.settings.supports]) t.settings = { ...data.settings };
      t.income = Number(data.income) || 0;
      t.rebuild();
      if (data.closed) t.close();
    } catch (e) { /* kaputter Spielstand: neu anfangen */ }
    return t;
  }

  // Berechnet alle Bauteile neu (nach Änderungen).
  rebuild() {
    let state = { pos: START.pos.slice(), yaw: START.yaw, pitch: START.pitch };
    this.built = [];
    for (const piece of this.pieces) {
      const g = generatePiece(piece.type, state);
      this.built.push({ ...g, piece });
      state = g.end;
    }
    this.endState = state;
    this.path = buildPath(this);
  }

  get endPos() { return this.endState.pos; }

  pieceCost(type, material, chain = false) {
    const def = PIECES[type];
    const s = this.settings;
    const base = def.cost + (chain ? CHAIN_COST : 0);
    return Math.round(base * MATERIALS[material].costFactor * BOLTS[s.bolts].costFactor * SUPPORTS[s.supports].costFactor);
  }
  closerCost() {
    if (!this.closer) return 0;
    const s = this.settings;
    return Math.round(this.closer.length * CLOSE_COST_PER_M * BOLTS[s.bolts].costFactor * SUPPORTS[s.supports].costFactor);
  }
  totalCost() {
    let c = 0;
    for (const p of this.pieces) c += this.pieceCost(p.type, p.material, p.chain);
    return c + this.closerCost();
  }
  get money() { return START_BUDGET + this.income - this.totalCost(); }

  // Prüft, ob ein Bauteil an das Streckenende passt.
  canAdd(type, material = 'steel', chain = false) {
    const def = PIECES[type];
    if (this.closed) return { ok: false, reason: 'Die Strecke ist geschlossen. Öffne sie mit ↶ Rückgängig.' };
    const pitch = this.endState.pitch;
    if (def.flatOnly && Math.abs(pitch) > 0.1) return { ok: false, reason: `${def.name} geht nur auf flacher Strecke.` };
    if (def.maxPitch !== undefined && Math.abs(pitch) > def.maxPitch + 0.1) return { ok: false, reason: 'Zu steil für eine Kurve.' };
    if (def.dPitch && !def.flatOnly) {
      const np = pitch + def.dPitch;
      if (Math.abs(np) > 75.1) return { ok: false, reason: 'Steiler geht es nicht!' };
    }
    if (chain && def.noChain) return { ok: false, reason: `${def.name} geht nicht mit Kettenlift.` };
    const cost = this.pieceCost(type, material, chain);
    if (cost > this.money) return { ok: false, reason: `Nicht genug Geld (${cost.toLocaleString('de-DE')} € nötig).` };
    const g = generatePiece(type, this.endState);
    const bad = checkSamples(g.samples);
    if (bad) return { ok: false, reason: bad };
    return { ok: true, cost };
  }

  add(type, material, color, chain = false) {
    const check = this.canAdd(type, material, chain);
    if (!check.ok) return check;
    this.pieces.push({ type, material, color, chain: !!chain });
    this.rebuild();
    return check;
  }

  undo() {
    if (this.closed) { this.open(); return true; }
    if (this.pieces.length <= 1) return false;
    this.pieces.pop();
    this.rebuild();
    return true;
  }

  reset() {
    this.pieces = [this.pieces[0]];
    this.open();
    this.rebuild();
  }

  open() {
    this.closed = false;
    this.closer = null;
    this.rebuild();
  }

  // Prüft, ob sich die Strecke automatisch schließen lässt (ohne etwas zu ändern).
  canClose() {
    if (this.closed) return { ok: false, reason: 'Die Strecke ist schon geschlossen.' };
    if (this.pieces.length < 4) return { ok: false, reason: 'Baue erst ein paar Teile mehr.' };
    const key = JSON.stringify([this.endState, this.settings, this.income, this.pieces.length]);
    if (this._closeCache && this._closeCache.key === key) return this._closeCache.res;
    const c = makeCloser(this.endState);
    let res;
    if (!c.ok) res = c;
    else {
      const cost = Math.round(c.length * CLOSE_COST_PER_M * BOLTS[this.settings.bolts].costFactor * SUPPORTS[this.settings.supports].costFactor);
      res = cost > this.money
        ? { ok: false, reason: `Nicht genug Geld zum Schließen (${cost.toLocaleString('de-DE')} €).` }
        : { ok: true, cost, closer: c };
    }
    this._closeCache = { key, res };
    return res;
  }

  // Verbindet das Ende automatisch mit dem Bahnhof.
  tryClose() {
    const res = this.canClose();
    if (!res.ok) return res;
    this.closer = res.closer;
    this.closed = true;
    this.path = buildPath(this);
    return { ok: true, cost: res.cost };
  }
  close() { return this.tryClose(); }

  setSetting(key, value) {
    const old = this.settings[key];
    this.settings[key] = value;
    if (this.money < 0) {
      this.settings[key] = old;
      return { ok: false, reason: 'Dafür reicht das Geld nicht.' };
    }
    return { ok: true };
  }

  // Kennzahlen für Bewertung
  info() {
    const types = new Set(this.pieces.map((p) => p.type));
    const colors = new Set(this.pieces.slice(1).map((p) => p.color));
    const mats = this.pieces.slice(1).map((p) => p.material);
    const woodShare = mats.length ? mats.filter((m) => m === 'wood').length / mats.length : 0;
    const woodInversions = this.pieces.filter((p) => p.material === 'wood' && PIECES[p.type].inversion).length;
    const brakeIdx = this.pieces.map((p) => p.type).lastIndexOf('brake');
    const hasBrake = brakeIdx > 0;
    return {
      length: this.path.length,
      pieceCount: this.pieces.length - 1,
      uniqueTypes: types.size - 1,
      colorCount: colors.size,
      materialMix: new Set(mats).size > 1,
      woodShare,
      woodInversions,
      hasBrake,
      inversions: this.pieces.filter((p) => PIECES[p.type].inversion).length,
    };
  }
}

// Prüft Stützpunkte auf Boden, Grenzen und Kreuzungen mit dem Bahnhof.
function checkSamples(samples) {
  for (const s of samples) {
    const [x, y, z] = s.p;
    if (y < PLOT.minY) return 'Da würde die Bahn in den Boden fahren! Erst hoch bauen.';
    if (y > PLOT.maxY) return 'Zu hoch – höher erlaubt das Bauamt nicht.';
    if (x < PLOT.minX || x > PLOT.maxX || z < PLOT.minZ || z > PLOT.maxZ) return 'Das ragt aus der Baufläche heraus.';
    // Nicht durch den Bahnhof bauen
    if (z > START.pos[2] - 2.5 && z < START.pos[2] + 2.5 && x > START.pos[0] - 1 && x < START.pos[0] + 11.5 && y < 4.5) return 'Da steht der Bahnhof im Weg.';
  }
  return null;
}

// Verbindet das Ende automatisch mit dem Bahnhof (Kurve – Gerade – Kurve, "Dubins-Pfad").
function makeCloser(endState) {
  const d = dist(endState.pos, START.pos);
  if (d < 3) return { ok: false, reason: 'Das Ende ist zu nah am Bahnhof – baue noch etwas weiter.' };
  if (Math.abs(endState.pitch) > 50.1) return { ok: false, reason: 'Das Ende ist zu steil. Mach es erst flacher.' };
  let best = null, reason = 'Kein Platz für den Rückweg. Bau das Ende näher an die linke Seite des Bahnhofs.';
  for (const R of [9, 7.5, 6]) {
    for (const plan of dubinsPlans(endState, START, R)) {
      const c = closerFromPlan(endState, plan, R);
      if (c.ok) { if (!best || c.length < best.length) best = c; }
      else reason = c.reason;
    }
    if (best) break;
  }
  return best || { ok: false, reason };
}

const wrap360 = (a) => ((a % 360) + 360) % 360;
const headingOf = (dx, dz) => (Math.atan2(dx, dz) * 180) / Math.PI;

// 2D-Integration eines Plans [{turn:'L'|'R'|'S', amount}] in der x/z-Ebene.
function integrate2D(x, z, yaw, plan, R, step = STEP) {
  const pts = [[x, z]];
  for (const seg of plan) {
    const segLen = seg.turn === 'S' ? seg.amount : ((seg.amount * Math.PI) / 180) * R;
    const n = Math.max(1, Math.ceil(segLen / step));
    const ds = segLen / n;
    for (let i = 0; i < n; i++) {
      const dyaw = seg.turn === 'L' ? (ds / R) * 180 / Math.PI : seg.turn === 'R' ? -(ds / R) * 180 / Math.PI : 0;
      const ym = (yaw + dyaw / 2) * Math.PI / 180;
      x += Math.sin(ym) * ds; z += Math.cos(ym) * ds;
      yaw += dyaw;
      pts.push([x, z]);
    }
  }
  return { pts, x, z, yaw };
}

function dubinsPlans(from, to, R) {
  const [x0, , z0] = from.pos, [x1, , z1] = to.pos;
  const side = (yaw, t) => { // Kreismittelpunkt-Richtung
    const y = yaw * Math.PI / 180;
    const L = [Math.cos(y), -Math.sin(y)];
    return t === 'L' ? L : [-L[0], -L[1]];
  };
  const plans = [];
  for (const a of ['L', 'R']) for (const b of ['L', 'R']) {
    const s0 = side(from.yaw, a), s1 = side(to.yaw, b);
    const c0 = [x0 + s0[0] * R, z0 + s0[1] * R], c1 = [x1 + s1[0] * R, z1 + s1[1] * R];
    const dx = c1[0] - c0[0], dz = c1[1] - c0[1];
    const D = Math.hypot(dx, dz);
    const cand = [];
    if (a === b) cand.push({ phi: headingOf(dx, dz), S: D });
    else if (D >= 2 * R) {
      const S = Math.sqrt(D * D - 4 * R * R);
      const off = Math.asin((2 * R) / D) * 180 / Math.PI;
      cand.push({ phi: headingOf(dx, dz) + off, S }, { phi: headingOf(dx, dz) - off, S });
    }
    for (const { phi, S } of cand) {
      const t1 = a === 'L' ? wrap360(phi - from.yaw) : wrap360(from.yaw - phi);
      const t2 = b === 'L' ? wrap360(to.yaw - phi) : wrap360(phi - to.yaw);
      const plan = [{ turn: a, amount: t1 }, { turn: 'S', amount: S }, { turn: b, amount: t2 }];
      const r = integrate2D(x0, z0, from.yaw, plan, R, 0.5);
      if (Math.hypot(r.x - x1, r.z - z1) < 0.4) plans.push(plan);
    }
  }
  return plans;
}

function closerFromPlan(endState, plan, R) {
  const r2 = integrate2D(endState.pos[0], endState.pos[2], endState.yaw, plan, R);
  const flat = r2.pts;
  const cum = [0];
  for (let i = 1; i < flat.length; i++) cum.push(cum[i - 1] + Math.hypot(flat[i][0] - flat[i - 1][0], flat[i][1] - flat[i - 1][1]));
  const Lh = cum[cum.length - 1];
  if (Lh > 260) return { ok: false, reason: 'Der Rückweg wäre viel zu lang. Bau das Ende näher zum Bahnhof.' };
  // Höhenverlauf: weicher Übergang von Endhöhe/-neigung zur Bahnhofshöhe
  const y0 = endState.pos[1], y1 = START.pos[1];
  const m0 = Math.tan(endState.pitch * Math.PI / 180) * Lh;
  const pts = flat.map(([x, z], i) => {
    const u = cum[i] / Lh, u2 = u * u, u3 = u2 * u;
    const y = y0 * (2 * u3 - 3 * u2 + 1) + m0 * (u3 - 2 * u2 + u) + y1 * (-2 * u3 + 3 * u2);
    return [x, y, z];
  });
  pts[pts.length - 1] = START.pos.slice();
  let length = 0;
  const samples = [];
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) length += dist(pts[i], pts[i - 1]);
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const T = norm(sub(b, a));
    const L = norm(cross([0, 1, 0], T));
    const U = cross(T, L);
    samples.push({ p: pts[i], up: U, left: L, T });
  }
  for (let i = 2; i < pts.length - 2; i++) {
    const t = norm(sub(pts[i + 2], pts[i - 2]));
    if (Math.abs(t[1]) > 0.75) return { ok: false, reason: 'Der Rückweg wäre zu steil. Bau näher oder niedriger zum Bahnhof.' };
  }
  bankCloser(samples, length);
  const nn = samples.length;
  const bad = checkSamples(samples.slice(2, nn - Math.ceil(13 / STEP)));
  if (bad) return { ok: false, reason: 'Kein Platz für den Rückweg: ' + bad };
  if (samples.some((s) => s.p[1] < PLOT.minY)) return { ok: false, reason: 'Der Rückweg ginge durch den Boden.' };
  return { ok: true, samples, length };
}

// Neigt das Schlussstück in Kurven und setzt eine Bremse vor dem Bahnhof.
function bankCloser(samples, length) {
  const n = samples.length;
  const raw = samples.map((s, i) => {
    const a = samples[Math.max(0, i - 2)].T, b = samples[Math.min(n - 1, i + 2)].T;
    const turn = a[2] * b[0] - a[0] * b[2]; // y-Anteil von a × b
    const k = turn / (4 * STEP);
    return clamp(Math.atan((10 * 10 * k) / 9.81), -1.0, 1.0);
  });
  const w = 12;
  samples.forEach((s, i) => {
    let sum = 0, c = 0;
    for (let j = i - w; j <= i + w; j++) if (j >= 0 && j < n) { sum += raw[j]; c++; }
    const edge = Math.min(i, n - 1 - i) * STEP;
    const r = (sum / c) * clamp(edge / 4, 0, 1);
    const U = s.up, L = s.left;
    s.up = add(mul(U, Math.cos(r)), mul(L, Math.sin(r)));
    s.left = add(mul(L, Math.cos(r)), mul(U, -Math.sin(r)));
    s.brake = i * STEP > length - 14;
  });
}

// Baut den durchgehenden Fahrweg (gleichmäßige Stützpunkte mit Tangente, Krümmung, Flags).
export function buildPath(track) {
  const pts = [];
  const pushSamples = (samples, info) => {
    samples.forEach((s, i) => {
      if (pts.length && i === 0) return; // Übergänge nicht doppelt
      pts.push({ p: s.p, up: s.up, left: s.left, ...info, brake: info.brake || !!s.brake });
    });
  };
  track.built.forEach((b, idx) => {
    const def = PIECES[b.piece.type];
    pushSamples(b.samples, {
      piece: idx,
      material: b.piece.material,
      station: !!def.station,
      chain: !!(def.chain || b.piece.chain),
      brake: !!def.brake,
    });
  });
  if (track.closer) {
    pushSamples(track.closer.samples, { piece: -1, material: 'steel', station: false, chain: false, brake: false });
    pts.pop(); // letzter Punkt == Bahnhofsanfang
  }
  const closed = !!track.closer;
  const n = pts.length;
  // Bogenlänge
  let s = 0;
  for (let i = 0; i < n; i++) {
    if (i > 0) s += dist(pts[i].p, pts[i - 1].p);
    pts[i].s = s;
  }
  const length = closed ? s + dist(pts[n - 1].p, pts[0].p) : s;
  const idx = (i) => (closed ? (i + n) % n : clamp(i, 0, n - 1));
  // Tangenten
  for (let i = 0; i < n; i++) {
    const a = pts[idx(i - 1)].p, b = pts[idx(i + 1)].p;
    pts[i].T = norm(sub(b, a));
    // Up orthogonalisieren
    const U = pts[i].up;
    const Uo = norm(sub(U, mul(pts[i].T, dot(U, pts[i].T))));
    pts[i].up = Uo;
    pts[i].left = cross(Uo, pts[i].T);
  }
  // Krümmungsvektor dT/ds
  for (let i = 0; i < n; i++) {
    const a = pts[idx(i - 1)], b = pts[idx(i + 1)];
    let ds = b.s - a.s;
    if (closed && ds <= 0) ds += length;
    pts[i].k = ds > 1e-6 ? mul(sub(b.T, a.T), 1 / ds) : [0, 0, 0];
  }
  return { pts, length, closed, step: STEP };
}

// Liefert interpolierte Werte an Bogenposition s.
export function sampleAt(path, s) {
  const { pts, length, closed } = path;
  const n = pts.length;
  if (closed) s = ((s % length) + length) % length;
  else s = clamp(s, 0, pts[n - 1].s);
  // binäre Suche
  let lo = 0, hi = n - 1;
  if (closed && s >= pts[n - 1].s) {
    const a = pts[n - 1], b = pts[0];
    const t = (s - a.s) / (length - a.s || 1);
    return mix(a, b, t);
  }
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].s <= s) lo = mid; else hi = mid;
  }
  const a = pts[lo], b = pts[hi];
  const t = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
  return mix(a, b, t);
}

function mix(a, b, t) {
  const l = (x, y) => [x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t];
  const near = t < 0.5 ? a : b;
  const T = norm(l(a.T, b.T));
  const U0 = l(a.up, b.up);
  const U = norm(sub(U0, mul(T, dot(U0, T))));
  return {
    p: l(a.p, b.p), T, up: U, left: cross(U, T), k: l(a.k, b.k),
    material: near.material, station: near.station, chain: near.chain, brake: near.brake, piece: near.piece,
  };
}

export { len };
