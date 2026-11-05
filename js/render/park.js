// Der Freizeitpark rund um die leere Baufläche.
import * as THREE from 'three';
import { toon, castAll } from './toon.js';
import { makePerson, walkPose } from './figures.js';
import { PLOT, START } from '../logic/track.js';

export function buildPark(scene) {
  const updaters = [];
  const root = new THREE.Group();
  scene.add(root);

  // Wiese
  const grass = new THREE.Mesh(new THREE.CircleGeometry(220, 48), toon('#7ed957'));
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  root.add(grass);

  // Baufläche (Sand) mit Zaun
  const pw = PLOT.maxX - PLOT.minX, pd = PLOT.maxZ - PLOT.minZ;
  const cx = (PLOT.maxX + PLOT.minX) / 2, cz = (PLOT.maxZ + PLOT.minZ) / 2;
  const plot = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), toon('#f2e3b3'));
  plot.rotation.x = -Math.PI / 2;
  plot.position.set(cx, 0.03, cz);
  plot.receiveShadow = true;
  root.add(plot);
  // Raster auf der Baufläche
  const grid = new THREE.GridHelper(Math.max(pw, pd), Math.max(pw, pd) / 4, 0xd9c48f, 0xd9c48f);
  grid.position.set(cx, 0.05, cz);
  grid.scale.set(pw / Math.max(pw, pd), 1, pd / Math.max(pw, pd));
  root.add(grid);

  // Zaun: Pfosten (instanziert) + Seil
  const posts = [];
  const step = 4;
  for (let x = PLOT.minX; x <= PLOT.maxX; x += step) { posts.push([x, PLOT.minZ - 1]); posts.push([x, PLOT.maxZ + 1]); }
  for (let z = PLOT.minZ; z <= PLOT.maxZ; z += step) { posts.push([PLOT.minX - 1, z]); posts.push([PLOT.maxX + 1, z]); }
  const postMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.12, 1.2, 6), toon('#ff6b6b'), posts.length);
  const m = new THREE.Matrix4();
  posts.forEach(([x, z], i) => { m.makeTranslation(x, 0.6, z); postMesh.setMatrixAt(i, m); });
  root.add(postMesh);
  const ropeMat = toon('#ffd166');
  const rope = (x1, z1, x2, z2) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const r = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.08), ropeMat);
    r.position.set((x1 + x2) / 2, 1.0, (z1 + z2) / 2);
    r.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
    root.add(r);
  };
  rope(PLOT.minX - 1, PLOT.minZ - 1, PLOT.maxX + 1, PLOT.minZ - 1);
  rope(PLOT.minX - 1, PLOT.maxZ + 1, PLOT.maxX + 1, PLOT.maxZ + 1);
  rope(PLOT.minX - 1, PLOT.minZ - 1, PLOT.minX - 1, PLOT.maxZ + 1);
  rope(PLOT.maxX + 1, PLOT.minZ - 1, PLOT.maxX + 1, PLOT.maxZ + 1);

  // Wege rund um die Baufläche
  const pathMat = toon('#d6c6a5');
  const pathW = 5;
  const addPath = (x, z, w, d) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), pathMat);
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, 0.04, z);
    p.receiveShadow = true;
    root.add(p);
  };
  const ox = 4.5;
  addPath(cx, PLOT.minZ - ox, pw + 2 * ox + pathW, pathW);
  addPath(cx, PLOT.maxZ + ox, pw + 2 * ox + pathW, pathW);
  addPath(PLOT.minX - ox, cz, pathW, pd + 2 * ox);
  addPath(PLOT.maxX + ox, cz, pathW, pd + 2 * ox);
  addPath(0, PLOT.minZ - 20, pathW, 30); // zum Eingang

  root.add(makeStation());
  root.add(makeEntrance(0, PLOT.minZ - 34));

  // Riesenrad
  const wheel = makeFerrisWheel();
  wheel.group.position.set(PLOT.maxX + 26, 0, 6);
  root.add(wheel.group);
  updaters.push((dt) => wheel.update(dt));
  // Karussell
  const caro = makeCarousel();
  caro.group.position.set(PLOT.minX - 22, 0, 8);
  root.add(caro.group);
  updaters.push((dt) => caro.update(dt));
  // Buden
  root.add(makeStall(PLOT.maxX + 14, PLOT.minZ - 14, '#ff70a6', 'EIS'));
  root.add(makeStall(PLOT.minX - 14, PLOT.minZ - 14, '#70d6ff', 'POMMES'));
  root.add(makeStall(PLOT.minX - 14, PLOT.maxZ + 14, '#ffd670', 'ZUCKERWATTE'));

  // Bäume außerhalb der Baufläche und Wege
  const rnd = mulberry(7);
  for (let i = 0; i < 90; i++) {
    const a = rnd() * Math.PI * 2, r = 60 + rnd() * 90;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) < 4 && z < -40 && z > -80) continue;
    root.add(makeTree(x, z, rnd));
  }
  // Wolken
  const clouds = new THREE.Group();
  for (let i = 0; i < 12; i++) {
    const c = makeCloud(rnd);
    c.position.set((rnd() - 0.5) * 300, 45 + rnd() * 25, (rnd() - 0.5) * 300);
    clouds.add(c);
  }
  root.add(clouds);
  updaters.push((dt) => {
    clouds.children.forEach((c) => { c.position.x += dt * 1.5; if (c.position.x > 160) c.position.x = -160; });
  });

  // Spazierende Besucher
  const walkers = makeWalkers(root, 14, rnd);
  updaters.push((dt, t) => walkers.update(dt, t));

  return { update: (dt, t) => updaters.forEach((u) => u(dt, t)) };
}

function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function textSprite(text, color = '#fff', bg = '#e63946', scale = 1) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = 'bold 64px Fredoka, "Comic Sans MS", sans-serif';
  const w = Math.ceil(ctx.measureText(text).width) + 60;
  c.width = w; c.height = 100;
  ctx.font = 'bold 64px Fredoka, "Comic Sans MS", sans-serif';
  ctx.fillStyle = bg;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(4, 4, w - 8, 92, 30); else ctx.rect(4, 4, w - 8, 92);
  ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = '#222'; ctx.stroke();
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, 54);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry((w / 100) * scale, scale), mat);
  return mesh;
}

function makeStation() {
  const g = new THREE.Group();
  const [sx, sy, sz] = START.pos;
  // Bahnsteig auf der Außenseite (-z)
  const plat = new THREE.Mesh(new THREE.BoxGeometry(12, sy - 0.1, 2.6), toon('#adb5bd'));
  plat.position.set(sx + 6, (sy - 0.1) / 2, sz - 2.2);
  g.add(plat);
  const base = new THREE.Mesh(new THREE.BoxGeometry(12, sy - 0.4, 1.6), toon('#868e96'));
  base.position.set(sx + 6, (sy - 0.4) / 2, sz);
  g.add(base);
  // Säulen + gestreiftes Dach
  for (const x of [0.5, 6, 11.5]) for (const z of [-3.3, 1.3]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3.6, 8), toon('#ffffff'));
    col.position.set(sx + x, sy + 1.8, sz + z);
    g.add(col);
  }
  const stripes = ['#e63946', '#ffffff'];
  for (let i = 0; i < 8; i++) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 5.6), toon(stripes[i % 2]));
    r.position.set(sx + 0.75 + i * 1.5, sy + 3.75, sz - 1);
    r.rotation.x = 0.08;
    g.add(r);
  }
  const sign = textSprite('BAHNHOF', '#fff', '#e63946', 1.1);
  sign.position.set(sx + 6, sy + 4.6, sz - 3.6);
  sign.rotation.y = Math.PI;
  g.add(sign);
  // Warteschlangen-Gitter
  for (let i = 0; i < 4; i++) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(10, 0.08, 0.08), toon('#495057'));
    rail.position.set(sx + 6, 0.9, sz - 5 - i * 1.2);
    g.add(rail);
  }
  castAll(g, true, true);
  return g;
}

function makeEntrance(x, z) {
  const g = new THREE.Group();
  for (const sx of [-6, 6]) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.2, 9, 12), toon('#8338ec'));
    tower.position.set(x + sx, 4.5, z);
    g.add(tower);
    const top = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.5, 12), toon('#ffbe0b'));
    top.position.set(x + sx, 10.2, z);
    g.add(top);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(12, 1.6, 0.8), toon('#ff006e'));
  beam.position.set(x, 8, z);
  g.add(beam);
  const sign = textSprite('COASTER PARK', '#fff', '#ff006e', 1.6);
  sign.position.set(x, 8, z + 0.45);
  g.add(sign);
  const sign2 = sign.clone();
  sign2.position.z = z - 0.45;
  sign2.rotation.y = Math.PI;
  g.add(sign2);
  castAll(g, true, false);
  return g;
}

function makeFerrisWheel() {
  const group = new THREE.Group();
  const R = 13;
  for (const sz of [-1.5, 1.5]) {
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 16, 8), toon('#ced4da'));
      leg.position.set(sx * 4, 7.2, sz);
      leg.rotation.z = sx * 0.25;
      group.add(leg);
    }
  }
  const wheel = new THREE.Group();
  wheel.position.set(0, 15, 0);
  group.add(wheel);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.3, 8, 48), toon('#ff595e'));
  wheel.add(rim);
  const rim2 = rim.clone(); rim2.position.z = 1.2; wheel.add(rim2);
  rim.position.z = -1.2;
  const colors = ['#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ff924c', '#f15bb5'];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.15, R, 0.15), toon('#ffffff'));
    spoke.position.set(Math.cos(a) * R / 2, Math.sin(a) * R / 2, 0);
    spoke.rotation.z = a - Math.PI / 2;
    wheel.add(spoke);
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.4, 10), toon(colors[i % colors.length]));
    cab.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
    cab.rotation.x = Math.PI / 2;
    wheel.add(cab);
  }
  castAll(group, true, false);
  let ang = 0;
  return {
    group,
    update(dt) {
      ang += dt * 0.12;
      wheel.rotation.z = ang;
    },
  };
}

function makeCarousel() {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 0.6, 24), toon('#ffffff'));
  base.position.y = 0.3;
  group.add(base);
  const spin = new THREE.Group();
  group.add(spin);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 6, 12), toon('#ffbe0b'));
  pole.position.y = 3;
  spin.add(pole);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(9, 3.5, 24), toon('#ff006e'));
  roof.position.y = 7.6;
  spin.add(roof);
  const horses = [];
  const colors = ['#ffffff', '#ffd6a5', '#caffbf', '#9bf6ff', '#bdb2ff', '#ffc6ff'];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const h = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1, 4, 8), toon(colors[i % colors.length]));
    body.rotation.x = Math.PI / 2;
    h.add(body);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.7, 0.5), toon(colors[i % colors.length]));
    head.position.set(0, 0.4, 0.75);
    h.add(head);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5, 6), toon('#ffd700'));
    rod.position.y = 1;
    h.add(rod);
    h.position.set(Math.cos(a) * 6, 2, Math.sin(a) * 6);
    h.rotation.y = -a;
    spin.add(h);
    horses.push({ h, a });
  }
  castAll(group, true, false);
  let t = 0;
  return {
    group,
    update(dt) {
      t += dt;
      spin.rotation.y = t * 0.6;
      horses.forEach(({ h, a }) => { h.position.y = 2 + Math.sin(t * 2 + a * 2) * 0.5; });
    },
  };
}

function makeStall(x, z, color, text) {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(4, 2.4, 3), toon('#ffffff'));
  box.position.y = 1.2;
  g.add(box);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 1.6, 4), toon(color));
  roof.position.y = 3.2;
  roof.rotation.y = Math.PI / 4;
  g.add(roof);
  const sign = textSprite(text, '#fff', color, 0.8);
  sign.position.set(0, 2, 1.55);
  g.add(sign);
  g.position.set(x, 0, z);
  g.lookAt(0, 0, 0);
  castAll(g, true, false);
  return g;
}

function makeTree(x, z, rnd) {
  const g = new THREE.Group();
  const h = 2 + rnd() * 2;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, h, 6), toon('#8d6346'));
  trunk.position.y = h / 2;
  g.add(trunk);
  const greens = ['#2d6a4f', '#40916c', '#52b788', '#74c69d'];
  if (rnd() < 0.5) {
    const crown = new THREE.Mesh(new THREE.SphereGeometry(1.8 + rnd(), 10, 8), toon(greens[Math.floor(rnd() * 4)]));
    crown.position.y = h + 1.3;
    g.add(crown);
  } else {
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(2.2 - i * 0.5, 2.2, 8), toon(greens[Math.floor(rnd() * 4)]));
      c.position.y = h + i * 1.3;
      g.add(c);
    }
  }
  g.position.set(x, 0, z);
  castAll(g, true, false);
  return g;
}

function makeCloud(rnd) {
  const g = new THREE.Group();
  const mat = toon('#ffffff');
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(2 + rnd() * 2.5, 10, 8), mat);
    s.position.set(i * 2.5 - 5, rnd() * 1.5, rnd() * 2);
    g.add(s);
  }
  return g;
}

function makeWalkers(root, count, rnd) {
  // Rundweg um die Baufläche
  const ox = 4.5;
  const x0 = PLOT.minX - ox, x1 = PLOT.maxX + ox, z0 = PLOT.minZ - ox, z1 = PLOT.maxZ + ox;
  const loop = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  const segLens = loop.map((p, i) => { const q = loop[(i + 1) % 4]; return Math.hypot(q[0] - p[0], q[1] - p[1]); });
  const total = segLens.reduce((a, b) => a + b, 0);
  const walkers = [];
  for (let i = 0; i < count; i++) {
    const p = makePerson();
    p.group.scale.setScalar(0.9 + rnd() * 0.3);
    root.add(p.group);
    walkers.push({ p, d: rnd() * total, speed: (0.9 + rnd() * 0.8) * (rnd() < 0.5 ? 1 : -1), off: (rnd() - 0.5) * 3 });
  }
  return {
    update(dt, t) {
      for (const w of walkers) {
        w.d = (w.d + w.speed * dt + total) % total;
        let d = w.d, i = 0;
        while (d > segLens[i]) { d -= segLens[i]; i++; }
        const a = loop[i], b = loop[(i + 1) % 4];
        const f = d / segLens[i];
        const dx = (b[0] - a[0]) / segLens[i], dz = (b[1] - a[1]) / segLens[i];
        const x = a[0] + (b[0] - a[0]) * f - dz * w.off, z = a[1] + (b[1] - a[1]) * f + dx * w.off;
        w.p.group.position.set(x, 0.42, z);
        w.p.group.rotation.y = Math.atan2(dx * Math.sign(w.speed), dz * Math.sign(w.speed));
        walkPose(w.p, t * Math.abs(w.speed) + w.off);
      }
    },
  };
}

export { textSprite };
