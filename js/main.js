// Coaster Accident – Hauptprogramm: Szene, Bedienung, Spielablauf.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';
import { Track, START, PLOT, sampleAt } from './logic/track.js';
import { PIECES, BUILD_ORDER, MATERIALS, BOLTS, SUPPORTS, COLORS } from './logic/pieces.js';
import { Ride, CRASH_TEXT } from './logic/ride.js';
import { rateRide, makeGuests, guestVerdict, CRITERIA, PERSONALITIES } from './logic/rating.js';
import { buildPark } from './render/park.js';
import { buildTrackMesh, makeEndMarker, makeTargetMarker } from './render/trackMesh.js';
import { TrainView } from './render/trainView.js';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'coaster-accident-save-v1';
const euro = (n) => `${Math.round(n).toLocaleString('de-DE')} €`;
const isTouch = matchMedia('(pointer: coarse)').matches;

// ---------- Szene ----------
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isTouch || devicePixelRatio < 2 });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.75 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const outline = new OutlineEffect(renderer, { defaultThickness: 0.0035, defaultColor: [0.11, 0.11, 0.17] });

const scene = new THREE.Scene();
scene.background = new THREE.Color('#8fd3ff');
scene.fog = new THREE.Fog('#8fd3ff', 140, 330);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 800);
camera.position.set(-38, 58, -78);

scene.add(new THREE.HemisphereLight('#ffffff', '#7ed957', 1.4));
const sun = new THREE.DirectionalLight('#fff4d6', 2.2);
sun.position.set(-40, 80, -30);
sun.castShadow = true;
sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 10, far: 220 });
sun.shadow.bias = -0.0008;
sun.target.position.set(0, 0, 8);
scene.add(sun, sun.target);

const controls = new OrbitControls(camera, canvas);
controls.target.set(-2, 0, 4);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.48;
controls.minDistance = 6;
controls.maxDistance = 200;
controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

// Schrift für Schilder laden (max. 1,5 s warten)
try { await Promise.race([document.fonts.load('bold 64px Fredoka'), new Promise((r) => setTimeout(r, 1500))]); } catch (e) { /* egal */ }
const park = buildPark(scene);

// ---------- Spielstand ----------
let track = loadTrack();
let lastRating = loadLastRating();
let trackGroup = null;
const endMarker = makeEndMarker();
const targetMarker = makeTargetMarker();
scene.add(endMarker, targetMarker);
targetMarker.position.set(START.pos[0] - 5, 0, START.pos[2]);

const ui = { material: 'steel', color: COLORS[0], chain: false };
let mode = 'build'; // build | ride | result
let ride = null, guests = [], rideEndTimer = 0, camMode = 'follow';
let camGoal = null;
const trainView = new TrainView(scene);

function loadTrack() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) return Track.fromJSON(JSON.parse(raw).track);
  } catch (e) { /* ignorieren */ }
  return new Track();
}
function loadLastRating() {
  try { return JSON.parse(localStorage.getItem(SAVE_KEY))?.lastRating ?? null; } catch (e) { return null; }
}
function save() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ track: track.toJSON(), lastRating })); } catch (e) { /* voll/privat */ }
}

function rebuildTrack() {
  if (trackGroup) { scene.remove(trackGroup); trackGroup.userData.dispose(); }
  trackGroup = buildTrackMesh(track);
  scene.add(trackGroup);
  const e = track.endState;
  endMarker.position.set(e.pos[0], e.pos[1], e.pos[2]);
  endMarker.rotation.set(0, 0, 0);
  endMarker.rotation.order = 'YXZ';
  endMarker.rotation.y = (e.yaw * Math.PI) / 180;
  endMarker.rotation.x = (-e.pitch * Math.PI) / 180;
  endMarker.visible = !track.closed && mode === 'build';
  targetMarker.visible = !track.closed && mode === 'build';
  save();
  refreshUI();
}

// ---------- Oberfläche ----------
function toast(msg, ms = 2600) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), ms);
}
function buzz(ms) { try { navigator.vibrate?.(ms); } catch (e) { /* egal */ } }

const pieceButtons = {};
function buildPieceBar() {
  const bar = $('pieces');
  for (const type of BUILD_ORDER) {
    const def = PIECES[type];
    const b = document.createElement('button');
    b.className = 'piece';
    b.innerHTML = `<span class="ico">${def.icon}</span><span class="lbl">${def.name}</span><span class="sub"></span>`;
    b.addEventListener('click', () => addPiece(type));
    bar.appendChild(b);
    pieceButtons[type] = b;
  }
}

function buildSeg(el, options, current, onPick) {
  el.innerHTML = '';
  for (const [key, o] of Object.entries(options)) {
    const b = document.createElement('button');
    b.textContent = `${o.icon} ${o.name}`;
    b.className = key === current() ? 'active' : '';
    b.addEventListener('click', () => { onPick(key); buildSeg(el, options, current, onPick); });
    el.appendChild(b);
  }
}

function buildPanel() {
  buildSeg($('segMaterial'), MATERIALS, () => ui.material, (k) => { ui.material = k; refreshUI(); });
  buildSeg($('segBolts'), BOLTS, () => track.settings.bolts, (k) => {
    const r = track.setSetting('bolts', k);
    if (!r.ok) toast(r.reason);
    rebuildTrack();
    buildPanel();
  });
  buildSeg($('segSupports'), SUPPORTS, () => track.settings.supports, (k) => {
    const r = track.setSetting('supports', k);
    if (!r.ok) toast(r.reason);
    rebuildTrack();
    buildPanel();
  });
  const sw = $('swatches');
  sw.innerHTML = '';
  for (const c of COLORS) {
    const b = document.createElement('button');
    b.className = 'swatch' + (c === ui.color ? ' active' : '');
    b.style.background = c;
    b.addEventListener('click', () => { ui.color = c; buildPanel(); });
    sw.appendChild(b);
  }
}

function refreshUI() {
  const money = track.money;
  $('money').textContent = euro(money);
  $('money').parentElement.classList.toggle('bad', money < 1000);
  $('length').textContent = `${Math.round(track.path.length)} m`;
  $('lastRating').textContent = lastRating ? `${lastRating.toFixed(1)}` : '–';
  $('matSummary').textContent = MATERIALS[ui.material].name;
  for (const type of BUILD_ORDER) {
    const b = pieceButtons[type];
    const check = track.canAdd(type, ui.material, ui.chain && !PIECES[type].noChain);
    b.classList.toggle('disabled', !check.ok);
    b.querySelector('.sub').textContent = euro(track.pieceCost(type, ui.material, ui.chain && !PIECES[type].noChain));
    b.dataset.reason = check.ok ? '' : check.reason;
  }
  const chainBtn = $('btnChain');
  chainBtn.classList.toggle('on', ui.chain);
  chainBtn.querySelector('.sub').textContent = ui.chain ? 'an' : 'aus';
  const close = $('btnClose');
  if (track.closed) {
    close.innerHTML = '<span>✅</span> Geschlossen';
    close.classList.add('disabled');
  } else {
    const c = track.canClose();
    close.innerHTML = c.ok ? `<span>🔗</span> Schließen <small>(${euro(c.cost)})</small>` : '<span>🔗</span> Schließen';
    close.classList.toggle('disabled', !c.ok);
  }
  $('btnRide').classList.toggle('pulse', track.closed);
}

function addPiece(type) {
  if (mode !== 'build') return;
  const chain = ui.chain && !PIECES[type].noChain;
  const r = track.add(type, ui.material, ui.color, chain);
  if (!r.ok) { toast(r.reason); buzz(30); return; }
  if (ui.chain && PIECES[type].noChain) toast(`${PIECES[type].name}: ohne Kettenlift gebaut.`);
  buzz(10);
  rebuildTrack();
  const e = track.endState.pos;
  camGoal = new THREE.Vector3(e[0], Math.max(2, e[1] * 0.7), e[2]);
}

// ---------- Fahrt ----------
function startRide() {
  if (mode === 'ride') return;
  if (track.pieces.length < 2) { toast('Baue zuerst ein paar Teile!'); return; }
  if (!track.closed) toast('⚠️ Die Strecke ist offen – das wird wohl krachen…', 3000);
  guests = makeGuests(6);
  ride = new Ride(track);
  trainView.reset(guests);
  trainView.place(ride, track);
  mode = 'ride';
  rideEndTimer = 0;
  setMode();
}

function stopRide() {
  mode = 'build';
  ride = null;
  parkTrain();
  setMode();
}

function parkTrain() {
  guests = makeGuests(6);
  trainView.reset(guests);
  trainView.place(new Ride(track), track);
}

function setMode() {
  const building = mode === 'build';
  $('buildbar').classList.toggle('hidden', !building);
  $('topbar').querySelector('.top-actions').classList.toggle('hidden', !building);
  $('rideHud').classList.toggle('hidden', mode !== 'ride');
  $('result').classList.toggle('hidden', mode !== 'result');
  $('matPanel').classList.remove('open');
  endMarker.visible = building && !track.closed;
  targetMarker.visible = building && !track.closed;
  controls.enabled = building || camMode === 'orbit' || mode === 'result';
  if (building) camera.up.set(0, 1, 0);
  $('camName').textContent = { follow: 'Verfolgen', pov: 'Mitfahren', orbit: 'Frei' }[camMode];
  refreshUI();
}

function cycleCam() {
  camMode = { follow: 'pov', pov: 'orbit', orbit: 'follow' }[camMode];
  camera.up.set(0, 1, 0);
  setMode();
}

function stars(n) {
  const full = Math.round(n);
  return `<span class="stars">${'★'.repeat(full)}<span class="off">${'★'.repeat(5 - full)}</span></span>`;
}

const FACES = { 5: '🤩', 4: '😄', 3: '🙂', 2: '😕', 1: '😵' };
const TYPE_ICON = { daredevil: '😎', careful: '🧐', normal: '🙂', kid: '🧒' };

function showResult() {
  const res = rateRide(ride, track);
  const verdicts = guests.map((g) => ({ g, ...guestVerdict(g, res) }));
  const avg = verdicts.reduce((a, v) => a + v.stars, 0) / verdicts.length;
  lastRating = avg;

  let moneyLine;
  if (ride.status === 'crashed') {
    const fine = Math.min(1500, Math.max(0, track.money));
    track.income -= fine;
    moneyLine = `🚑 Schadenersatz: −${euro(fine)}`;
  } else {
    const earned = Math.round(avg * avg * 40 * guests.length);
    track.income += earned;
    moneyLine = `🎟️ Ticketeinnahmen: +${euro(earned)}`;
  }

  $('resTitle').textContent = ride.status === 'crashed' ? '💥 Unfall!' : ride.status === 'stuck' ? '😬 Steckengeblieben' : '🎉 Fahrt beendet!';
  $('resReason').textContent = ride.status === 'crashed' ? CRASH_TEXT[ride.crash.reason] : '';
  $('resStars').innerHTML = stars(avg);
  $('resAvg').textContent = `${avg.toFixed(1)} / 5`;
  $('resCriteria').innerHTML = CRITERIA.map((c) => `<span>${c.icon} ${c.name}</span>${stars(res.scores[c.key])}`).join('');
  $('resGuests').innerHTML = verdicts.map((v) => `
    <div class="guest">
      <span class="face">${FACES[v.stars]}</span>
      <span class="who">${TYPE_ICON[v.g.type]} <b>${v.g.name}</b> <small>(${PERSONALITIES[v.g.type].name})</small><q>${v.comment}</q></span>
      ${stars(v.stars)}
    </div>`).join('');
  const st = ride.stats;
  const facts = `🏁 Spitze ${Math.round(st.maxSpeed * 3.6)} km/h · ⛰️ ${Math.round(st.maxHeight)} m · 💪 ${st.maxG.toFixed(1)} g · 🔄 ${st.inversions} Überschläge · ⏱️ ${Math.round(st.duration)} s`;
  $('resNotes').innerHTML = `<div>${facts}</div>` + res.notes.map((n) => `<div>💡 ${n}</div>`).join('');
  $('resMoney').textContent = moneyLine;
  mode = 'result';
  save();
  setMode();
}

// ---------- Kamera ----------
const tmpV = new THREE.Vector3();
function updateCamera(dt) {
  if (mode === 'build') {
    if (camGoal) {
      const delta = tmpV.subVectors(camGoal, controls.target).multiplyScalar(Math.min(1, dt * 3));
      controls.target.add(delta);
      camera.position.add(delta);
      if (delta.lengthSq() < 0.0004) camGoal = null;
    }
    return;
  }
  if (!ride) return;
  if (trainView.crashed && mode === 'ride') {
    // Kamera fliegt zum Unfallort
    const f = trainView.focus();
    controls.target.lerp(f, Math.min(1, dt * 3));
    const away = tmpV.subVectors(camera.position, f);
    away.y = 0;
    if (away.lengthSq() < 0.01) away.set(1, 0, 0);
    away.normalize().multiplyScalar(16);
    const want = f.clone().add(away).add(new THREE.Vector3(0, 8, 0));
    camera.position.lerp(want, Math.min(1, dt * 1.5));
    camera.up.set(0, 1, 0);
    camera.lookAt(controls.target);
    return;
  }
  if (camMode === 'orbit' || mode === 'result') {
    controls.target.lerp(trainView.focus(), Math.min(1, dt * 2));
    return;
  }
  const smp = sampleAt(track.path, ride.s);
  const P = new THREE.Vector3(...smp.p), T = new THREE.Vector3(...smp.T), U = new THREE.Vector3(...smp.up);
  if (camMode === 'pov') {
    camera.position.copy(P).addScaledVector(U, 1.6).addScaledVector(T, 1.4);
    camera.up.lerp(U, Math.min(1, dt * 8)).normalize();
    camera.lookAt(tmpV.copy(P).addScaledVector(T, 12).addScaledVector(U, 1.0));
  } else {
    const flatT = new THREE.Vector3(T.x, 0, T.z);
    if (flatT.lengthSq() < 0.01) flatT.set(1, 0, 0);
    flatT.normalize();
    const want = P.clone().addScaledVector(flatT, -11).add(new THREE.Vector3(0, 6, 0));
    want.y = Math.max(want.y, 2);
    camera.position.lerp(want, Math.min(1, dt * 2.5));
    camera.up.set(0, 1, 0);
    camera.lookAt(P);
    controls.target.copy(P);
  }
}

// ---------- Ereignisse ----------
$('btnUndo').addEventListener('click', () => { if (track.undo()) { rebuildTrack(); buzz(10); } });
let resetArmed = 0;
$('btnReset').addEventListener('click', () => {
  if (track.pieces.length <= 1) return;
  if (Date.now() - resetArmed > 3000) {
    resetArmed = Date.now();
    toast('🗑️ Nochmal tippen, um die ganze Strecke abzureißen (Geld zurück).', 3000);
    return;
  }
  resetArmed = 0;
  track.reset(); rebuildTrack(); parkTrain();
  toast('Strecke abgerissen.');
});
$('btnHelp').addEventListener('click', () => $('help').classList.remove('hidden'));
$('btnHelpClose').addEventListener('click', () => { $('help').classList.add('hidden'); try { localStorage.setItem('coaster-help-seen', '1'); } catch (e) { /* */ } });
$('btnChain').addEventListener('click', () => { ui.chain = !ui.chain; refreshUI(); toast(ui.chain ? '⛓️ Kettenlift an: neue Teile ziehen den Zug hoch.' : 'Kettenlift aus.'); });
$('btnMat').addEventListener('click', () => $('matPanel').classList.toggle('open'));
$('btnClose').addEventListener('click', () => {
  const r = track.tryClose();
  if (!r.ok) { toast(r.reason, 3500); buzz(30); return; }
  toast(`🔗 Geschlossen! (${euro(r.cost)}) Jetzt: Fahrt!`);
  rebuildTrack();
  parkTrain();
});
$('btnRide').addEventListener('click', startRide);
$('btnStop').addEventListener('click', stopRide);
$('btnCam').addEventListener('click', cycleCam);
$('btnAgain').addEventListener('click', () => { mode = 'build'; startRide(); });
$('btnBuild').addEventListener('click', () => { stopRide(); });
canvas.addEventListener('pointerdown', () => $('matPanel').classList.remove('open'));

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 70 : 55;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ---------- Hauptschleife ----------
const clock = new THREE.Clock();
let time = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  time += dt;
  park.update(dt, time);
  endMarker.children[1].rotation.z += dt;
  endMarker.children[0].position.z = 1.4 + Math.sin(time * 4) * 0.25;
  targetMarker.rotation.y = Math.sin(time * 2) * 0.3;

  if (mode === 'ride' && ride) {
    if (ride.status === 'running') {
      ride.step(dt);
      const smp = sampleAt(track.path, ride.s);
      $('hudSpeed').textContent = Math.round(Math.abs(ride.v) * 3.6);
      $('hudHeight').textContent = Math.round(smp.p[1]);
      $('hudG').textContent = ride.nG.toFixed(1);
      const load = Math.max(0, Math.min(1, ride.nG / ride.capacityAt(smp)));
      const bar = $('hudLoad');
      bar.style.width = `${Math.round(load * 100)}%`;
      bar.style.background = load > 0.85 ? '#ef476f' : load > 0.65 ? '#ffd166' : '#06d6a0';
    }
    if (ride.status === 'crashed' && !trainView.crashed) {
      trainView.place(ride, track);
      trainView.startCrash(ride, track);
      $('rideHud').classList.add('hidden');
      buzz([80, 40, 120]);
    }
    if (trainView.crashed) trainView.updateCrash(dt, camera);
    else {
      trainView.place(ride, track);
      trainView.animateRiders(ride, dt, time);
    }
    if (ride.status !== 'running') {
      rideEndTimer += dt;
      if (rideEndTimer > (ride.status === 'crashed' ? 3.8 : 1.2)) showResult();
    }
  } else if (mode === 'result' && trainView.crashed) {
    trainView.updateCrash(dt, camera);
  }

  updateCamera(dt);
  if (controls.enabled && !(trainView.crashed && mode === 'ride')) controls.update();
  outline.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---------- Start ----------
buildPieceBar();
buildPanel();
resize();
rebuildTrack();
parkTrain();
setMode();
$('loading').classList.add('hidden');
try { if (!localStorage.getItem('coaster-help-seen')) $('help').classList.remove('hidden'); } catch (e) { $('help').classList.remove('hidden'); }
requestAnimationFrame(frame);

// Für Tests/Neugierige
window.coaster = { get track() { return track; }, get ride() { return ride; }, startRide, addPiece, rebuild: rebuildTrack, PLOT };
