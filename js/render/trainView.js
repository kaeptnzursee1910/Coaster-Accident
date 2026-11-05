// Darstellung des Zuges mit Fahrgästen, inklusive Cartoon-Unfall.
import * as THREE from 'three';
import { makeCar, makePerson, sit, makeDizzyStars } from './figures.js';
import { toonUnique } from './toon.js';
import { textSprite } from './park.js';
import { sampleAt } from '../logic/track.js';
import { CARS } from '../logic/ride.js';

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const CAR_COLORS = ['#ef476f', '#118ab2', '#ffd166'];
const GREEN = new THREE.Color('#7bd389');

export class TrainView {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.cars = [];
    this.riders = [];
    this.debris = [];
    this.effects = [];
  }

  // Neuer Zug mit Fahrgästen (guests: [{name,type}])
  reset(guests) {
    this.clear();
    for (let i = 0; i < CARS; i++) {
      const car = makeCar(CAR_COLORS[i % CAR_COLORS.length], i === 0);
      this.group.add(car.group);
      this.cars.push(car);
      car.seats.forEach((seatPos, j) => {
        const guest = guests[i * 2 + j];
        if (!guest) return;
        const person = makePerson();
        person.group.scale.setScalar(guest.type === 'kid' ? 0.75 : 0.9);
        sit(person);
        person.group.position.copy(seatPos);
        car.group.add(person.group);
        this.riders.push({ person, guest, car: i, armUp: 0, free: null });
      });
    }
    this.crashed = false;
    this.crashTime = 0;
  }

  clear() {
    for (const c of this.cars) this.group.remove(c.group);
    for (const r of this.riders) if (r.free) this.scene.remove(r.person.group);
    for (const d of this.debris) this.scene.remove(d.obj);
    for (const e of this.effects) this.scene.remove(e.obj);
    this.cars = []; this.riders = []; this.debris = []; this.effects = [];
  }

  // Zug an Position der Fahrt setzen
  place(ride, track) {
    const carS = ride.carS();
    const m = new THREE.Matrix4();
    carS.forEach((s, i) => {
      const smp = sampleAt(track.path, s);
      const car = this.cars[i];
      m.makeBasis(V(smp.left), V(smp.up), V(smp.T));
      car.group.quaternion.setFromRotationMatrix(m);
      car.group.position.copy(V(smp.p)).addScaledVector(V(smp.up), 0.1);
    });
  }

  // Animation der Fahrgäste (Arme hoch bei Abfahrten, grün bei zu viel G)
  animateRiders(ride, dt, t) {
    const excited = ride.nG < 0.55 || Math.abs(ride.v) > 13;
    for (const r of this.riders) {
      if (r.free) continue;
      const wantUp = (excited && r.guest.type !== 'careful') || (r.guest.type === 'daredevil' && Math.abs(ride.v) > 8) ? 1 : 0;
      r.armUp += (wantUp - r.armUp) * Math.min(1, dt * 5);
      const wobble = Math.sin(t * 14 + r.car) * 0.15 * r.armUp;
      r.person.arms[0].rotation.z = -0.25 - r.armUp * 2.6 + wobble;
      r.person.arms[1].rotation.z = 0.25 + r.armUp * 2.6 - wobble;
      const sick = Math.min(1, Math.max(0, (ride.nG - 3.5) / 2));
      r.person.skinMat.color.copy(r.person.skin).lerp(GREEN, sick);
      r.person.head.rotation.x = -Math.min(0.5, Math.max(-0.3, (ride.nG - 1) * 0.12));
      r.person.mouth.scale.y = 1 + r.armUp * 1.5;
    }
  }

  // Unfall starten: Wagen und Fahrgäste fliegen frei weiter
  startCrash(ride, track) {
    this.crashed = true;
    this.crashTime = 0;
    const T = V(ride.crash.T), U = V(ride.crash.up);
    const speed = Math.max(4, Math.abs(ride.v));
    const base = T.clone().multiplyScalar(speed * Math.sign(ride.v || 1)).addScaledVector(U, 2.5);
    this.cars.forEach((car, i) => {
      const vel = base.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 3));
      const spin = new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
      this.debris.push({ obj: car.group, vel, spin, delay: i * 0.08, rest: false });
    });
    // Fahrgäste lösen sich kurz danach
    this.riders.forEach((r, i) => {
      r.releaseAt = 0.15 + Math.random() * 0.3;
      r.vel = base.clone().multiplyScalar(0.8).add(new THREE.Vector3((Math.random() - 0.5) * 6, 5 + Math.random() * 5, (Math.random() - 0.5) * 6));
      r.spin = new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
    });
    const p = V(ride.crash.p);
    const bang = textSprite(pickBang(), '#fff', '#ff006e', 2.4);
    bang.position.copy(p).add(new THREE.Vector3(0, 3, 0));
    this.scene.add(bang);
    this.effects.push({ obj: bang, life: 2.5, kind: 'bang' });
    this.puff(p, 6);
  }

  puff(p, n) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.4 + Math.random() * 0.4, 8, 6), toonUnique('#f8f9fa', { transparent: true, opacity: 0.9 }));
      m.position.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2));
      this.scene.add(m);
      const life = 0.7 + Math.random() * 0.5;
      this.effects.push({ obj: m, life, maxLife: life, kind: 'puff', vel: new THREE.Vector3((Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3) });
    }
  }

  updateCrash(dt, camera) {
    this.crashTime += dt;
    const g = 9.81;
    const step = (o, vel, spin, groundY) => {
      vel.y -= g * dt;
      o.position.addScaledVector(vel, dt);
      o.rotation.x += spin.x * dt; o.rotation.y += spin.y * dt; o.rotation.z += spin.z * dt;
      if (o.position.y < groundY) {
        o.position.y = groundY;
        if (!o.userData.landed && Math.abs(vel.y) > 2) { this.puff(o.position, 2); o.userData.landed = true; }
        vel.y = Math.abs(vel.y) * 0.35;
        vel.x *= 0.6; vel.z *= 0.6;
        spin.multiplyScalar(0.5);
        if (vel.length() < 0.8) { vel.set(0, 0, 0); spin.set(0, 0, 0); return true; }
      }
      return false;
    };
    for (const d of this.debris) {
      if (d.rest) continue;
      if (this.crashTime < d.delay) continue;
      // Wagen aus der Gruppe lösen und frei fliegen lassen
      d.rest = step(d.obj, d.vel, d.spin, 0.4);
      if (d.rest) { d.obj.rotation.x = 0; d.obj.rotation.z = Math.PI * (Math.random() < 0.5 ? 0 : 1) * 0.5; }
    }
    for (const r of this.riders) {
      if (!r.free && this.crashTime >= r.releaseAt) {
        const g2 = r.person.group;
        g2.updateWorldMatrix(true, false);
        const wp = new THREE.Vector3(), wq = new THREE.Quaternion(), ws = new THREE.Vector3();
        g2.matrixWorld.decompose(wp, wq, ws);
        g2.parent.remove(g2);
        g2.position.copy(wp); g2.quaternion.copy(wq); g2.scale.copy(ws);
        this.scene.add(g2);
        r.free = { rest: false, stars: null };
        r.person.legs.forEach((l) => { l.rotation.x = 0; });
      }
      if (r.free && !r.free.rest) {
        r.person.arms[0].rotation.z = -2.6 + Math.sin(this.crashTime * 30) * 0.5;
        r.person.arms[1].rotation.z = 2.6 - Math.sin(this.crashTime * 30) * 0.5;
        r.free.rest = step(r.person.group, r.vel, r.spin, 0.25);
        if (r.free.rest) {
          // flach auf dem Rücken liegen, Sterne über dem Kopf
          r.person.group.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
          const stars = makeDizzyStars();
          stars.position.copy(r.person.group.position).add(new THREE.Vector3(0, 1.0, 0));
          this.scene.add(stars);
          this.effects.push({ obj: stars, life: 99, kind: 'stars' });
        }
      }
    }
    for (const e of this.effects) {
      e.life -= dt;
      if (e.kind === 'puff') {
        e.obj.position.addScaledVector(e.vel, dt);
        e.obj.scale.multiplyScalar(1 + dt * 0.6);
        e.obj.material.opacity = Math.max(0, (e.life / e.maxLife) * 0.85);
      } else if (e.kind === 'stars') {
        e.obj.rotation.y += dt * 4;
      } else if (e.kind === 'bang') {
        const s = 1 + Math.sin(Math.min(1, (2.5 - e.life) * 4) * Math.PI) * 0.3;
        e.obj.scale.setScalar(s);
        if (camera) e.obj.quaternion.copy(camera.quaternion);
      }
      if (e.life <= 0 && e.obj.visible) {
        e.obj.visible = false;
        if (e.kind === 'puff') { e.obj.geometry.dispose(); e.obj.material.dispose(); }
      }
    }
  }

  // Mittelpunkt des Geschehens (für die Kamera)
  focus() {
    if (!this.cars.length) return new THREE.Vector3();
    return this.cars[0].group.position.clone();
  }
}

function pickBang() {
  const a = ['BUMM!', 'KRACH!', 'AUTSCH!', 'RUMMS!', 'OH NEIN!'];
  return a[Math.floor(Math.random() * a.length)];
}
