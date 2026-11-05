// 3D-Modell der Strecke: Schienen, Schwellen, Schrauben, Stützen, Kette, Bremsen.
import * as THREE from 'three';
import { toon, shade } from './toon.js';
import { PIECES, SUPPORTS } from '../logic/pieces.js';

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_CYL = new THREE.CylinderGeometry(1, 1, 1, 8);
const BOLT = new THREE.SphereGeometry(1, 6, 4);
const BOLT_COLORS = { cheap: '#8d5524', standard: '#adb5bd', premium: '#ffd60a' };
const WOOD = '#a86b3c', WOOD_DARK = '#7f4f24', STEEL_SUPPORT = '#8fa3b8';

class Batch {
  constructor() { this.items = []; }
  add(m) { this.items.push(m.clone()); }
  mesh(geo, mat) {
    if (!this.items.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, this.items.length);
    this.items.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = true;
    im.receiveShadow = true;
    return im;
  }
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const Y = new THREE.Vector3(0, 1, 0);

function basisMatrix(p, L, U, T, sx, sy, sz) {
  tmpM.makeBasis(V(L).multiplyScalar(sx), V(U).multiplyScalar(sy), V(T).multiplyScalar(sz));
  tmpM.setPosition(p);
  return tmpM;
}
// Balken zwischen zwei Punkten (Einheitsquader/-zylinder entlang y)
function beamMatrix(a, b, t) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  tmpQ.setFromUnitVectors(Y, dir.normalize());
  tmpM.compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), tmpQ, new THREE.Vector3(t, len, t));
  return tmpM;
}

export function buildTrackMesh(track) {
  const group = new THREE.Group();
  const geos = [];
  const batches = {
    tiesSteel: new Batch(), tiesWood: new Batch(), bolts: new Batch(), brakes: new Batch(),
    postsSteel: new Batch(), postsWood: new Batch(), braces: new Batch(), connectors: new Batch(),
  };

  const tube = (points, radius, color) => {
    if (points.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    const g = new THREE.TubeGeometry(curve, Math.max(2, points.length * 2), radius, 6, false);
    geos.push(g);
    const m = new THREE.Mesh(g, toon(color));
    m.castShadow = true;
    group.add(m);
  };

  const segments = track.built.map((b) => ({ samples: b.samples, piece: b.piece }));
  if (track.closer) {
    const last = track.pieces[track.pieces.length - 1];
    segments.push({ samples: track.closer.samples, piece: { type: 'closer', material: last.material, color: last.color } });
  }

  // Durchgehende Schienen: gleiche Farbe + Material werden zu einem Rohr verbunden (keine Nahtstellen)
  const runs = [];
  for (const seg of segments) {
    const last = runs[runs.length - 1];
    if (last && last.material === seg.piece.material && last.color === seg.piece.color) {
      last.samples.push(...seg.samples.slice(1));
    } else {
      runs.push({ material: seg.piece.material, color: seg.piece.color, samples: seg.samples.slice() });
    }
  }
  const offR = (s, l, u) => V(s.p).addScaledVector(V(s.left), l).addScaledVector(V(s.up), u);
  for (const run of runs) {
    const wood = run.material === 'wood';
    const color = run.color;
    const sub = run.samples.filter((_, i) => i % 2 === 0 || i === run.samples.length - 1);
    tube(sub.map((s) => offR(s, 0.5, 0)), wood ? 0.07 : 0.09, wood ? shade(color, 0.85) : color);
    tube(sub.map((s) => offR(s, -0.5, 0)), wood ? 0.07 : 0.09, wood ? shade(color, 0.85) : color);
    if (wood) {
      tube(sub.map((s) => offR(s, 0.5, -0.17)), 0.12, WOOD_DARK);
      tube(sub.map((s) => offR(s, -0.5, -0.17)), 0.12, WOOD_DARK);
    } else {
      tube(sub.map((s) => offR(s, 0, -0.45)), 0.17, shade(color, 0.7));
    }
  }

  for (const seg of segments) {
    const { samples, piece } = seg;
    const def = PIECES[piece.type] || {};
    const wood = piece.material === 'wood';
    const sub = samples.filter((_, i) => i % 2 === 0 || i === samples.length - 1);
    const off = (s, l, u) => V(s.p).addScaledVector(V(s.left), l).addScaledVector(V(s.up), u);

    if (piece.chain) tube(sub.map((s) => off(s, 0, -0.02)), 0.05, '#2b2b2b');

    // Schwellen, Schrauben, Bremsen
    const tieEvery = wood ? 2 : 4; // Stützpunkte (à 0,25 m)
    samples.forEach((s, i) => {
      if (i % tieEvery !== 0) return;
      const P = V(s.p);
      if (wood) {
        batches.tiesWood.add(basisMatrix(off(s, 0, -0.3), s.left, s.up, sDir(samples, i), 1.5, 0.09, 0.22));
      } else {
        batches.tiesSteel.add(basisMatrix(off(s, 0, -0.12), s.left, s.up, sDir(samples, i), 1.1, 0.09, 0.12));
        batches.connectors.add(beamMatrix(off(s, 0, -0.12), off(s, 0, -0.42), 0.09));
      }
      for (const side of [-0.5, 0.5]) {
        const b = off(s, side, wood ? -0.25 : -0.12);
        tmpM.compose(b, tmpQ.identity(), new THREE.Vector3(0.07, 0.07, 0.07));
        batches.bolts.add(tmpM);
      }
      if (def.brake && i % 2 === 0) {
        batches.brakes.add(basisMatrix(P, s.left, s.up, sDir(samples, i), 0.07, 0.25, 0.5));
      }
    });
    if (piece.type === 'closer') {
      samples.forEach((s, i) => {
        if (s.brake && i % 4 === 0) batches.brakes.add(basisMatrix(V(s.p), s.left, s.up, sDir(samples, i), 0.07, 0.25, 0.5));
      });
    }
  }

  // Stützen entlang des Fahrwegs
  const spacing = SUPPORTS[track.settings.supports].spacing;
  const pts = track.path.pts;
  let next = 13;
  for (const s of pts) {
    if (s.s < next) continue;
    next = s.s + spacing;
    if (s.up[1] < 0.35 || s.p[1] < 1.3 || s.station) continue;
    const wood = s.material === 'wood';
    const bottom = V(s.p).addScaledVector(V(s.up), wood ? -0.3 : -0.55);
    const h = bottom.y;
    if (h < 0.3) continue;
    if (!wood) {
      tmpM.compose(new THREE.Vector3(bottom.x, h / 2, bottom.z), tmpQ.identity(), new THREE.Vector3(0.2, h, 0.2));
      batches.postsSteel.add(tmpM);
      // Fuß
      tmpM.compose(new THREE.Vector3(bottom.x, 0.15, bottom.z), tmpQ.identity(), new THREE.Vector3(0.45, 0.3, 0.45));
      batches.postsSteel.add(tmpM);
    } else {
      const Lh = new THREE.Vector3(s.left[0], 0, s.left[2]).normalize().multiplyScalar(0.75);
      const a = new THREE.Vector3(bottom.x, 0, bottom.z).add(Lh);
      const b = new THREE.Vector3(bottom.x, 0, bottom.z).sub(Lh);
      for (const base of [a, b]) {
        tmpM.compose(new THREE.Vector3(base.x, h / 2, base.z), tmpQ.identity(), new THREE.Vector3(0.22, h, 0.22));
        batches.postsWood.add(tmpM);
      }
      batches.braces.add(beamMatrix(new THREE.Vector3(a.x, h, a.z), new THREE.Vector3(b.x, h, b.z), 0.16));
      for (let y = 0; y + 0.5 < h; y += 3) {
        const y2 = Math.min(h, y + 3);
        batches.braces.add(beamMatrix(new THREE.Vector3(a.x, y, a.z), new THREE.Vector3(b.x, y2, b.z), 0.1));
        batches.braces.add(beamMatrix(new THREE.Vector3(b.x, y, b.z), new THREE.Vector3(a.x, y2, a.z), 0.1));
      }
    }
  }

  const add = (m) => { if (m) group.add(m); };
  add(batches.tiesSteel.mesh(UNIT_BOX, toon('#e9ecef')));
  add(batches.connectors.mesh(UNIT_CYL, toon('#ced4da')));
  add(batches.tiesWood.mesh(UNIT_BOX, toon(WOOD)));
  add(batches.bolts.mesh(BOLT, toon(BOLT_COLORS[track.settings.bolts])));
  add(batches.brakes.mesh(UNIT_BOX, toon('#ffbe0b')));
  add(batches.postsSteel.mesh(UNIT_CYL, toon(STEEL_SUPPORT)));
  add(batches.postsWood.mesh(UNIT_BOX, toon(WOOD)));
  add(batches.braces.mesh(UNIT_BOX, toon(WOOD_DARK)));

  group.userData.dispose = () => geos.forEach((g) => g.dispose());
  return group;
}

function sDir(samples, i) {
  const a = samples[Math.max(0, i - 1)].p, b = samples[Math.min(samples.length - 1, i + 1)].p;
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l = Math.hypot(d[0], d[1], d[2]) || 1;
  return [d[0] / l, d[1] / l, d[2] / l];
}

// Pfeil am Streckenende: zeigt, wo das nächste Teil angebaut wird.
export function makeEndMarker() {
  const g = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 12), toon('#06d6a0', { transparent: true, opacity: 0.9 }));
  cone.rotation.x = Math.PI / 2;
  cone.position.z = 1.4;
  g.add(cone);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.12, 8, 24), toon('#06d6a0'));
  g.add(ring);
  return g;
}

// Zielmarkierung: Hier muss die Strecke zum Bahnhof zurückkommen.
export function makeTargetMarker() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 6), toon('#ffffff'));
  pole.position.y = 1.5;
  g.add(pole);
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.8, 1.2), toon('#ff006e'));
  flag.position.set(0, 2.6, 0.6);
  g.add(flag);
  return g;
}
