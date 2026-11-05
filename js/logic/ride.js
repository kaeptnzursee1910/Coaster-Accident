// Fahrphysik: Zug auf der Strecke, G-Kräfte, Unfälle, Statistiken.
import { sampleAt } from './track.js';
import { MATERIALS, BOLTS, SUPPORTS } from './pieces.js';
import { dot } from './vec.js';

const G = 9.81;
export const CARS = 3;
export const CAR_SPACING = 2.5;
const START_S = 9.5;
const STATION_SPEED = 3;
const CHAIN_SPEED = 3.5;
const BRAKE_SPEED = 5;

export class Ride {
  constructor(track) {
    this.track = track;
    this.path = track.path;
    this.s = START_S;
    this.v = 0;
    this.lap = 0;
    this.time = 0;
    this.status = 'running'; // running | done | crashed | stuck
    this.crash = null;
    this.nG = 1; this.lG = 0;
    this.maxProgress = this.s;
    this.lastProgressTime = 0;
    this.slowTime = 0;
    this.arrivalSpeed = null;
    this.stats = {
      maxSpeed: 0, maxHeight: 0, maxG: 1, minG: 1, maxLat: 0,
      airtime: 0, inversions: 0, duration: 0, maxLoadRatio: 0,
    };
    this._inAir = false; this._inverted = false;
    const st = track.settings;
    this.boltCap = BOLTS[st.bolts].capacity;
    this.supportCap = SUPPORTS[st.supports].capacity;
  }

  // Bogenpositionen aller Wagen (vorne zuerst)
  carS() {
    const out = [];
    for (let i = 0; i < CARS; i++) out.push(this.s - i * CAR_SPACING);
    return out;
  }

  capacityAt(smp) {
    let cap = MATERIALS[smp.material].capacity * this.boltCap * this.supportCap;
    if (smp.material === 'wood' && smp.up[1] < 0) cap *= 0.55; // Holz kopfüber ist heikel
    return cap;
  }

  step(dt) {
    if (this.status !== 'running') return;
    const sub = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / sub;
    for (let i = 0; i < sub && this.status === 'running'; i++) this._step(h);
  }

  _step(dt) {
    const path = this.path;
    const front = sampleAt(path, this.s);
    // Schwerkraft verteilt über alle Wagen
    let slope = 0, chain = false, brake = false;
    for (const cs of this.carS()) {
      const smp = sampleAt(path, cs);
      slope += smp.T[1];
      if (smp.chain) chain = true;
      if (smp.brake) brake = true;
    }
    slope /= CARS;
    const mu = MATERIALS[front.material].friction;
    let a = -G * slope - Math.sign(this.v) * (mu * G + 0.0011 * this.v * this.v);
    this.v += a * dt;

    const inStation = front.station;
    if (inStation && this.lap === 0 && this.s < 13 && this.v < STATION_SPEED) this.v = STATION_SPEED;
    if (chain && this.v < CHAIN_SPEED) this.v = CHAIN_SPEED;
    if (brake && this.v > BRAKE_SPEED) this.v = Math.max(BRAKE_SPEED, this.v - 9 * dt);

    // Einfahrt in den Bahnhof nach der Runde: abbremsen bis zum Halt
    if (this.lap === 1 && inStation) {
      if (this.arrivalSpeed === null) this.arrivalSpeed = Math.abs(this.v);
      const rest = START_S - this.s;
      if (rest <= 0.05) { this.v = 0; this.s = START_S; this.finish('done'); return; }
      const vt = Math.sqrt(2 * 4 * rest) + 0.4;
      if (this.v > vt) this.v = vt;
      if (this.v < 1) this.v = 1;
    }

    this.s += this.v * dt;
    this.time += dt;

    if (path.closed) {
      if (this.s >= path.length) { this.s -= path.length; this.lap = 1; }
    } else if (this.s >= path.pts[path.pts.length - 1].s) {
      // offenes Ende: der Zug fliegt raus!
      const end = sampleAt(path, this.s);
      this.crashNow('end', end);
      return;
    }

    // G-Kräfte (geglättet)
    const smp = sampleAt(path, this.s);
    const v2 = this.v * this.v;
    const felt = [smp.k[0] * v2 / G, smp.k[1] * v2 / G + 1, smp.k[2] * v2 / G];
    const nG = dot(felt, smp.up), lG = dot(felt, smp.left);
    const alpha = Math.min(1, dt / 0.09);
    this.nG += (nG - this.nG) * alpha;
    this.lG += (lG - this.lG) * alpha;

    // Statistik
    const st = this.stats;
    const speed = Math.abs(this.v);
    st.maxSpeed = Math.max(st.maxSpeed, speed);
    st.maxHeight = Math.max(st.maxHeight, smp.p[1]);
    st.duration = this.time;
    if (this.time > 0.6 && !smp.station) {
      st.maxG = Math.max(st.maxG, this.nG);
      st.minG = Math.min(st.minG, this.nG);
      if (Math.abs(this.lG) > st.maxLat) { st.maxLat = Math.abs(this.lG); st.maxLatPiece = smp.piece; }
      st.maxLoadRatio = Math.max(st.maxLoadRatio, this.nG / this.capacityAt(smp));
    }
    const air = this.nG < 0.25 && smp.up[1] > 0;
    if (air && !this._inAir) st.airtime++;
    this._inAir = air;
    const inv = smp.up[1] < -0.5;
    if (inv && !this._inverted) st.inversions++;
    this._inverted = inv;

    // Unfälle prüfen
    if (this.time > 0.6 && !smp.station) {
      if (Math.abs(this.lG) > 3.2) return this.crashNow('lateral', smp);
      if (this.nG < -1.8) return this.crashNow('lift', smp);
      if (this.nG > this.capacityAt(smp)) return this.crashNow('break', smp);
      if (smp.up[1] < -0.2 && speed < 1.2) return this.crashNow('hang', smp);
    }

    // Steckengeblieben?
    if (this.lap === 0) {
      if (this.s > this.maxProgress + 0.5) { this.maxProgress = this.s; this.lastProgressTime = this.time; }
      if (this.time - this.lastProgressTime > 10) return this.finish('stuck');
    }
    if (speed < 0.3 && !smp.station && !chain) {
      this.slowTime += dt;
      if (this.slowTime > 3) return this.finish('stuck');
    } else this.slowTime = 0;
    if (this.time > 300) this.finish('stuck');
  }

  crashNow(reason, smp) {
    this.crash = { reason, s: this.s, p: smp.p, T: smp.T, up: smp.up, v: this.v, material: smp.material };
    this.finish('crashed');
  }

  finish(status) {
    this.status = status;
    this.stats.duration = this.time;
  }
}

export const CRASH_TEXT = {
  end: 'Die Strecke war nicht fertig – der Zug ist einfach rausgeflogen!',
  lateral: 'Viel zu schnell in die Kurve – der Zug ist entgleist!',
  lift: 'Der Zug ist über die Kuppe abgehoben!',
  break: 'Die Schienen haben nachgegeben! Zu viel Druck für Material, Schrauben oder Stützen.',
  hang: 'Der Zug blieb kopfüber hängen – alle sind rausgepurzelt!',
};
