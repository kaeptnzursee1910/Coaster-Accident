// Kleine Cartoon-Figuren und Achterbahnwagen.
import * as THREE from 'three';
import { toon, toonUnique, castAll } from './toon.js';

const SKINS = ['#ffd7b5', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffe0bd'];
const SHIRTS = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ff924c', '#f15bb5', '#00bbf9'];
const HAIR = ['#3d2b1f', '#8b5a2b', '#f4d03f', '#1c1c1c', '#c0392b', '#bdc3c7'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const geo = {
  body: new THREE.CapsuleGeometry(0.26, 0.32, 4, 10),
  head: new THREE.SphereGeometry(0.27, 16, 12),
  hair: new THREE.SphereGeometry(0.28, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
  eye: new THREE.SphereGeometry(0.045, 8, 6),
  limb: new THREE.CapsuleGeometry(0.075, 0.3, 3, 6),
  mouth: new THREE.TorusGeometry(0.07, 0.018, 6, 12, Math.PI),
  star: (() => {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.05 : 0.12, a = (i / 10) * Math.PI * 2;
      if (i === 0) s.moveTo(Math.sin(a) * r, Math.cos(a) * r); else s.lineTo(Math.sin(a) * r, Math.cos(a) * r);
    }
    return new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false });
  })(),
};

// Erstellt eine Figur. Ursprung = Hüfte. Blickrichtung +z.
export function makePerson(opts = {}) {
  const g = new THREE.Group();
  const shirt = opts.shirt || pick(SHIRTS);
  const skin = opts.skin || pick(SKINS);
  const hair = opts.hair || pick(HAIR);
  const skinMat = toonUnique(skin);

  const body = new THREE.Mesh(geo.body, toon(shirt));
  body.position.y = 0.35;
  g.add(body);

  const headPivot = new THREE.Group();
  headPivot.position.y = 0.9;
  g.add(headPivot);
  const head = new THREE.Mesh(geo.head, skinMat);
  headPivot.add(head);
  const hairM = new THREE.Mesh(geo.hair, toon(hair));
  hairM.position.y = 0.03;
  hairM.rotation.x = -0.25;
  headPivot.add(hairM);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(geo.eye, toon('#1a1a1a'));
    eye.position.set(0.09 * sx, 0.04, 0.24);
    headPivot.add(eye);
  }
  const mouth = new THREE.Mesh(geo.mouth, toon('#7a1f1f'));
  mouth.position.set(0, -0.08, 0.245);
  mouth.rotation.z = Math.PI;
  headPivot.add(mouth);

  const arms = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.3 * sx, 0.58, 0);
    const arm = new THREE.Mesh(geo.limb, skinMat);
    arm.position.y = -0.2;
    pivot.add(arm);
    pivot.rotation.z = 0.25 * sx;
    g.add(pivot);
    arms.push(pivot);
  }
  const legs = [];
  for (const sx of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(0.12 * sx, 0.08, 0);
    const leg = new THREE.Mesh(geo.limb, toon(opts.pants || '#34495e'));
    leg.position.y = -0.22;
    pivot.add(leg);
    g.add(pivot);
    legs.push(pivot);
  }
  castAll(g, true, false);
  return { group: g, head: headPivot, headMesh: head, skinMat, skin: new THREE.Color(skin), mouth, arms, legs };
}

// Sitzpose: Beine nach vorne
export function sit(person) {
  person.legs.forEach((l) => { l.rotation.x = -Math.PI / 2; });
}

// Laufanimation
export function walkPose(person, t) {
  const a = Math.sin(t * 8) * 0.6;
  person.legs[0].rotation.x = a; person.legs[1].rotation.x = -a;
  person.arms[0].rotation.x = -a * 0.8; person.arms[1].rotation.x = a * 0.8;
}

// Kreisende Sterne über dem Kopf (nach Unfall)
export function makeDizzyStars() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(geo.star, toon('#ffd60a'));
    const a = (i / 3) * Math.PI * 2;
    m.position.set(Math.cos(a) * 0.35, 0, Math.sin(a) * 0.35);
    g.add(m);
  }
  return g;
}

const carGeo = {
  body: new THREE.BoxGeometry(1.35, 0.5, 1.9),
  nose: new THREE.CylinderGeometry(0.68, 0.68, 0.5, 16, 1, false, 0, Math.PI),
  seat: new THREE.BoxGeometry(1.15, 0.5, 0.18),
  wheel: new THREE.CylinderGeometry(0.16, 0.16, 0.12, 10),
  bar: new THREE.TorusGeometry(0.22, 0.04, 6, 12, Math.PI),
  stripe: new THREE.BoxGeometry(1.37, 0.12, 1.5),
};

// Wagen mit 2 Sitzplätzen; Ursprung = Schienenmitte, +z = Fahrtrichtung.
export function makeCar(color, isFront) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(carGeo.body, toon(color));
  body.position.y = 0.45;
  g.add(body);
  const stripe = new THREE.Mesh(carGeo.stripe, toon('#ffffff'));
  stripe.position.set(0, 0.55, 0);
  g.add(stripe);
  if (isFront) {
    const nose = new THREE.Mesh(carGeo.nose, toon(color));
    nose.rotation.y = -Math.PI / 2;
    nose.position.set(0, 0.45, 0.95);
    nose.scale.set(1, 1, 0.55);
    g.add(nose);
  }
  const seat = new THREE.Mesh(carGeo.seat, toon('#2b2d42'));
  seat.position.set(0, 0.95, -0.55);
  g.add(seat);
  for (const sx of [-1, 1]) for (const sz of [-0.65, 0.65]) {
    const w = new THREE.Mesh(carGeo.wheel, toon('#444'));
    w.rotation.z = Math.PI / 2;
    w.position.set(0.55 * sx, 0.12, sz);
    g.add(w);
  }
  // Mitfahrer-Plätze
  const seats = [new THREE.Vector3(-0.3, 0.55, -0.15), new THREE.Vector3(0.3, 0.55, -0.15)];
  const bars = [];
  for (const s of seats) {
    const bar = new THREE.Mesh(carGeo.bar, toon('#f1c40f'));
    bar.position.set(s.x, 0.85, 0.25);
    bar.rotation.y = Math.PI / 2;
    bar.rotation.z = Math.PI / 2;
    g.add(bar);
    bars.push(bar);
  }
  castAll(g, true, false);
  return { group: g, seats, bars };
}
