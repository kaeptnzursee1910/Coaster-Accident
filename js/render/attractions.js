// Weitere Attraktionen im Hintergrund des Parks: Freifallturm, zwei Achterbahnen,
// Piratenschiff und Kettenkarussell – alle mit Fahrgästen und animiert.
import * as THREE from 'three';
import { toon, castAll } from './toon.js';
import { makePerson, sit } from './figures.js';
import { textSprite } from './park.js';
import { TrainView } from './trainView.js';
import { buildTrackMesh } from './trackMesh.js';
import { generatePiece } from '../logic/pieces.js';
import { buildPath, sampleAt } from '../logic/track.js';
import { makeGuests } from '../logic/rating.js';
import { dot } from '../logic/vec.js';

const G = 9.81;

export function buildAttractions(scene) {
  const updaters = [];
  const blockers = []; // Bereiche, in denen keine Bäume stehen sollen: {x, z, r}
  const add = (a) => { if (a.update) updaters.push(a.update); blockers.push(...a.blockers); };

  add(makeDropTower(scene, -74, -42));
  add(makePirateShip(scene, 76, -36));
  add(makeChainSwing(scene, -72, 74));
  add(makeBackgroundCoaster(scene, {
    name: 'DONNERBLITZ', color: '#3a86ff', material: 'steel', carColors: ['#ffbe0b', '#ff006e', '#3a86ff'],
    start: { pos: [-27, 2, 84], yaw: 90, pitch: 0 },
    seq: ['S', 'S', 'loop', 'Lup', 'Lup', 'LS', 'LS', 'LS', 'LS', 'LS', 'LS', 'Ldown', 'Ldown', 'right', 'S', 'S', 'right',
      'down', 'down', 'S', 'S', 'S', 'S', 'S', 'S', 'up', 'up', 'loop', 'S', 'S', 'right', 'S', 'S', 'right'],
    sign: [0, 6, 78],
  }));
  add(makeBackgroundCoaster(scene, {
    name: 'HOLZWURM', color: '#c1121f', material: 'wood', carColors: ['#8338ec', '#06d6a0', '#ffd166'],
    start: { pos: [126, 2, -42], yaw: 0, pitch: 0 },
    seq: ['S', 'S', 'Lup', 'Lup', 'LS', 'LS', 'LS', 'LS', 'Ldown', 'Ldown', 'down', 'down', 'up', 'up', 'up', 'up', 'down', 'down',
      'right', 'right', 'up', 'up', 'down', 'down', 'down', 'down', 'S', 'S', 'S', 'S', 'up', 'up', 'down', 'down', 'up', 'up',
      'S', 'S', 'right', 'right'],
    sign: [130, 6, -48],
  }));

  return { update: (dt, t) => updaters.forEach((u) => u(dt, t)), blockers };
}

function sign(scene, text, color, x, y, z, rotY = 0) {
  const s = textSprite(text, '#fff', color, 1.4);
  s.position.set(x, y, z);
  s.rotation.y = rotY;
  scene.add(s);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, y, 6), toon('#ffffff'));
  pole.position.set(x, y / 2, z - 0.05);
  scene.add(pole);
}

function pad(scene, x, z, r) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 32), toon('#d6c6a5'));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.035, z);
  m.receiveShadow = true;
  scene.add(m);
}

function rider(opts = {}) {
  const p = makePerson(opts);
  p.group.scale.setScalar(0.85);
  return p;
}

// ---------- Freifallturm ----------
function makeDropTower(scene, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  scene.add(g);
  pad(scene, x, z, 9);
  const H = 48;
  const colors = ['#ff006e', '#ffffff'];
  for (let i = 0; i < 8; i++) {
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, H / 8, 16), toon(colors[i % 2]));
    seg.position.y = H / 16 + (i * H) / 8;
    g.add(seg);
  }
  const cap = new THREE.Mesh(new THREE.ConeGeometry(2.2, 3, 16), toon('#ffbe0b'));
  cap.position.y = H + 1.5;
  g.add(cap);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.5, 1.2, 20), toon('#8338ec'));
  base.position.y = 0.6;
  g.add(base);
  // Gondel mit Sitzen rundherum
  const gondola = new THREE.Group();
  g.add(gondola);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 0.8, 20, 1, true), toon('#ffbe0b', { side: THREE.DoubleSide }));
  gondola.add(ring);
  const riders = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.3), toon('#2b2d42'));
    seat.position.set(Math.sin(a) * 2.9, 0.2, Math.cos(a) * 2.9);
    seat.rotation.y = a;
    gondola.add(seat);
    const r = rider();
    r.group.position.set(Math.sin(a) * 3.25, -0.1, Math.cos(a) * 3.25);
    r.group.rotation.y = a;
    r.legs.forEach((l) => { l.rotation.x = -0.3; });
    gondola.add(r.group);
    riders.push(r);
  }
  castAll(g, true, false);
  sign(scene, 'FREIFALL', '#ff006e', x + 7, 5, z + 6, Math.PI * 0.75);

  // Zyklus: warten – hochziehen – oben warten – freier Fall – bremsen
  const BOTTOM = 1.6, TOP = H - 4;
  let phase = 'wait', time = 0, y = BOTTOM, v = 0;
  return {
    blockers: [{ x, z, r: 10 }],
    update(dt) {
      time += dt;
      let arms = 0;
      if (phase === 'wait' && time > 4) { phase = 'up'; time = 0; }
      else if (phase === 'up') {
        y = BOTTOM + (TOP - BOTTOM) * Math.min(1, time / 12);
        gondola.rotation.y += dt * 0.25;
        if (time >= 12) { phase = 'top'; time = 0; }
      } else if (phase === 'top' && time > 2.5) { phase = 'fall'; time = 0; v = 0; }
      else if (phase === 'fall') {
        v += G * dt; y -= v * dt; arms = 1;
        if (y < 14) phase = 'brake';
      } else if (phase === 'brake') {
        v = Math.max(1.5, v - 30 * dt); y = Math.max(BOTTOM, y - v * dt); arms = 0.6;
        if (y <= BOTTOM + 0.01) { phase = 'wait'; time = 0; }
      }
      gondola.position.y = y;
      for (const r of riders) {
        const target = arms;
        r.arms[0].rotation.z += ((-0.25 - target * 2.6) - r.arms[0].rotation.z) * Math.min(1, dt * 6);
        r.arms[1].rotation.z += ((0.25 + target * 2.6) - r.arms[1].rotation.z) * Math.min(1, dt * 6);
      }
    },
  };
}

// ---------- Piratenschiff ----------
function makePirateShip(scene, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  scene.add(g);
  pad(scene, x, z, 18);
  const AXLE = 13;
  // A-Gestell
  for (const sz of [-3.2, 3.2]) for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 14.5, 8), toon('#495057'));
    leg.position.set(sx * 3.4, AXLE / 2, sz);
    leg.rotation.z = sx * 0.5;
    g.add(leg);
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 7.4, 10), toon('#adb5bd'));
  axle.rotation.x = Math.PI / 2;
  axle.position.y = AXLE;
  g.add(axle);
  const swing = new THREE.Group();
  swing.position.y = AXLE;
  g.add(swing);
  for (const sz of [-1.6, 1.6]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.4, 9, 0.4), toon('#adb5bd'));
    arm.position.set(0, -4.5, sz);
    swing.add(arm);
  }
  const ship = new THREE.Group();
  ship.position.y = -10;
  swing.add(ship);
  // Rumpf: halber Zylinder (Rundung nach unten) + abgerundeter Bug und Heck
  const hullMat = toon('#8d5524', { side: THREE.DoubleSide });
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 15, 20, 1, true, Math.PI, Math.PI), hullMat);
  hull.rotation.z = Math.PI / 2;
  ship.add(hull);
  for (const sx of [-1, 1]) {
    const end = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), hullMat);
    end.scale.set(1.3, 1, 1);
    end.position.x = sx * 7.5;
    ship.add(end);
  }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(15, 0.3, 5.2), toon('#c68642'));
  deck.position.y = 0.05;
  ship.add(deck);
  for (const sx of [-1, 1]) {
    const cap = new THREE.Mesh(new THREE.CircleGeometry(2.6, 16, -Math.PI / 2, Math.PI), toon('#c68642', { side: THREE.DoubleSide }));
    cap.rotation.x = -Math.PI / 2;
    cap.rotation.z = sx > 0 ? 0 : Math.PI;
    cap.scale.set(1.3, 1, 1);
    cap.position.set(sx * 7.5, 0.06, 0);
    ship.add(cap);
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 7, 8), toon('#5c3d2e'));
  mast.position.y = 3.6;
  ship.add(mast);
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 3.6), toon('#f8f9fa', { side: THREE.DoubleSide }));
  sail.position.set(0, 4.2, 0.3);
  ship.add(sail);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1), toon('#1d1d2c', { side: THREE.DoubleSide }));
  flag.position.set(0.8, 6.6, 0);
  ship.add(flag);
  const riders = [];
  for (let row = -2; row <= 2; row++) for (const sz of [-1.4, 1.4]) {
    const r = rider();
    sit(r);
    r.group.position.set(row * 2.8, 0.55, sz);
    r.group.rotation.y = sz > 0 ? Math.PI : 0;
    ship.add(r.group);
    riders.push(r);
  }
  castAll(g, true, false);
  sign(scene, 'PIRATENSCHIFF', '#1d1d2c', x - 12, 5, z + 12, -Math.PI * 0.75);

  let t = 0;
  return {
    blockers: [{ x, z, r: 19 }],
    update(dt) {
      t += dt;
      const cycle = t % 40;
      const amp = cycle < 30 ? Math.min(1, cycle / 12) : Math.max(0, (40 - cycle) / 10);
      const ang = amp * 1.15 * Math.sin(t * 0.9);
      swing.rotation.z = ang;
      const scream = Math.abs(ang) > 0.8 ? 1 : 0;
      for (const r of riders) {
        r.arms[0].rotation.z += ((-0.25 - scream * 2.6) - r.arms[0].rotation.z) * Math.min(1, dt * 5);
        r.arms[1].rotation.z += ((0.25 + scream * 2.6) - r.arms[1].rotation.z) * Math.min(1, dt * 5);
      }
    },
  };
}

// ---------- Kettenkarussell ----------
function makeChainSwing(scene, x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  scene.add(g);
  pad(scene, x, z, 14);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1, 11, 12), toon('#06d6a0'));
  pole.position.y = 5.5;
  g.add(pole);
  const top = new THREE.Group();
  top.position.y = 11;
  g.add(top);
  const crown = new THREE.Mesh(new THREE.ConeGeometry(6.5, 3, 24), toon('#ffbe0b'));
  crown.position.y = 1.8;
  top.add(crown);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(6.2, 6.2, 0.5, 24), toon('#ff006e'));
  top.add(disc);
  const hangers = [];
  const colors = ['#3a86ff', '#ff006e', '#8338ec', '#fb5607'];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const hinge = new THREE.Group();
    hinge.position.set(Math.cos(a) * 5.6, 0, Math.sin(a) * 5.6);
    hinge.rotation.y = -a;
    top.add(hinge);
    const tilt = new THREE.Group();
    hinge.add(tilt);
    for (const off of [-0.35, 0.35]) {
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 5.5, 4), toon('#adb5bd'));
      chain.position.set(0, -2.75, off);
      tilt.add(chain);
    }
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 1), toon(colors[i % 4]));
    seat.position.y = -5.6;
    tilt.add(seat);
    const r = rider();
    sit(r);
    r.group.position.set(-0.05, -5.35, 0);
    r.group.rotation.y = -Math.PI / 2;
    tilt.add(r.group);
    hangers.push({ tilt, r });
  }
  castAll(g, true, false);
  sign(scene, 'KETTENFLIEGER', '#06d6a0', x + 10, 5, z - 10, Math.PI * 0.25);

  let t = 0, spin = 0, ang = 0;
  return {
    blockers: [{ x, z, r: 15 }],
    update(dt) {
      t += dt;
      const cycle = t % 30;
      const target = cycle < 22 ? 1.6 : 0;
      spin += (target - spin) * Math.min(1, dt * 0.35);
      ang += spin * dt;
      top.rotation.y = ang;
      top.position.y = 11 + Math.min(1, spin / 1.6) * 1.5;
      const lean = Math.atan((spin * spin * 8) / G);
      for (const h of hangers) {
        h.tilt.rotation.z = lean;
        h.r.arms[0].rotation.z = -0.25 - lean * 1.2;
        h.r.arms[1].rotation.z = 0.25 + lean * 1.2;
      }
    },
  };
}

// ---------- Hintergrund-Achterbahn ----------
// seq-Kürzel: S = Gerade, LS/Lup/Ldown = mit Kettenlift, sonst Bauteilname.
function makeBackgroundCoaster(scene, cfg) {
  const typeOf = { S: 'straight', LS: 'straight', Lup: 'up', Ldown: 'down' };
  let state = { pos: cfg.start.pos.slice(), yaw: cfg.start.yaw, pitch: cfg.start.pitch };
  const built = [];
  for (const code of cfg.seq) {
    const type = typeOf[code] || code;
    const gen = generatePiece(type, state);
    built.push({ ...gen, piece: { type, material: cfg.material, color: cfg.color, chain: code.startsWith('L') } });
    state = gen.end;
  }
  const fake = { built, closer: null, pieces: built.map((b) => b.piece), settings: { bolts: 'standard', supports: 'normal' } };
  const path = buildPath(fake);
  const pts = path.pts;
  path.length = pts[pts.length - 1].s + Math.hypot(...[0, 1, 2].map((i) => pts[0].p[i] - pts[pts.length - 1].p[i]));
  path.closed = true;
  fake.path = path;
  const mesh = buildTrackMesh(fake);
  scene.add(mesh);

  // Bahnsteig am Start
  const [sx, sy, sz] = cfg.start.pos;
  const yaw = (cfg.start.yaw * Math.PI) / 180;
  const plat = new THREE.Mesh(new THREE.BoxGeometry(2.6, sy, 9), toon('#adb5bd'));
  plat.position.set(sx + Math.sin(yaw) * 4 + Math.cos(yaw) * 2.2, sy / 2, sz + Math.cos(yaw) * 4 - Math.sin(yaw) * 2.2);
  plat.rotation.y = yaw;
  castAll(plat, true, true);
  scene.add(plat);
  sign(scene, cfg.name, cfg.color, cfg.sign[0], cfg.sign[1], cfg.sign[2], Math.PI);

  // Zug mit Fahrgästen
  const tv = new TrainView(scene);
  tv.reset(makeGuests(6));
  const topY = Math.max(...pts.map((p) => p.p[1])) + 0.6;
  const ride = {
    s: 6, v: 4, nG: 1,
    carS() { return [this.s, this.s - 2.5, this.s - 5]; },
  };
  const trackRef = { path };

  // Bäume aus dem Grundriss heraushalten
  const blockers = [];
  for (let i = 0; i < pts.length; i += 24) blockers.push({ x: pts[i].p[0], z: pts[i].p[2], r: 7 });

  return {
    blockers,
    update(dt, t) {
      const smp = sampleAt(path, ride.s);
      let v = smp.chain ? 4 : Math.sqrt(Math.max(16, 2 * G * (topY - smp.p[1]))) * 0.93;
      ride.v += (v - ride.v) * Math.min(1, dt * 4);
      ride.s = (ride.s + ride.v * dt) % path.length;
      const v2 = ride.v * ride.v;
      const nG = dot([smp.k[0] * v2 / G, smp.k[1] * v2 / G + 1, smp.k[2] * v2 / G], smp.up);
      ride.nG += (nG - ride.nG) * Math.min(1, dt * 8);
      tv.place(ride, trackRef);
      tv.animateRiders(ride, dt, t);
    },
  };
}
