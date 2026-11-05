// Bewertung der Fahrt durch die Fahrgäste (1–5 Sterne je Kriterium).
import { BOLTS, SUPPORTS } from './pieces.js';
import { clamp } from './vec.js';

export const CRITERIA = [
  { key: 'thrill', name: 'Nervenkitzel', icon: '😱' },
  { key: 'comfort', name: 'Komfort', icon: '🛋️' },
  { key: 'safety', name: 'Sicherheit', icon: '🦺' },
  { key: 'look', name: 'Optik & Länge', icon: '🎨' },
];

export const PERSONALITIES = {
  daredevil: { name: 'Draufgänger', weights: { thrill: 0.5, comfort: 0.1, safety: 0.15, look: 0.25 } },
  careful: { name: 'Vorsichtig', weights: { thrill: 0.1, comfort: 0.35, safety: 0.4, look: 0.15 } },
  normal: { name: 'Normal', weights: { thrill: 0.3, comfort: 0.3, safety: 0.2, look: 0.2 } },
  kid: { name: 'Kind', weights: { thrill: 0.35, comfort: 0.25, safety: 0.1, look: 0.3 } },
};

const NAMES = ['Lena', 'Ben', 'Mia', 'Paul', 'Emma', 'Noah', 'Lina', 'Elias', 'Hanna', 'Finn', 'Sophie', 'Leon', 'Ida', 'Jonas', 'Ella', 'Theo', 'Oma Gerda', 'Opa Kurt'];

export function makeGuests(count, rnd = Math.random) {
  const keys = Object.keys(PERSONALITIES);
  const used = new Set();
  const guests = [];
  for (let i = 0; i < count; i++) {
    let name;
    do { name = NAMES[Math.floor(rnd() * NAMES.length)]; } while (used.has(name) && used.size < NAMES.length);
    used.add(name);
    guests.push({ name, type: keys[Math.floor(rnd() * keys.length)] });
  }
  return guests;
}

// Berechnet die Kriterien aus Fahrtstatistik und Streckeninfo.
export function rateRide(ride, track) {
  const st = ride.stats;
  const info = track.info();
  const s = track.settings;
  const crashed = ride.status === 'crashed';
  const stuck = ride.status === 'stuck';
  const notes = [];

  // Nervenkitzel
  let thrill = 1
    + clamp(st.maxSpeed / 25, 0, 1.6)
    + clamp(st.maxHeight / 40, 0, 1.0)
    + st.inversions * 0.45
    + Math.min(st.airtime, 4) * 0.25
    + clamp((st.maxG - 2) * 0.3, 0, 0.6);
  if (st.maxSpeed < 8) notes.push('Ziemlich lahm – baue höher für mehr Tempo.');
  if (stuck) thrill = Math.min(thrill, 2);

  // Komfort
  let comfort = 5;
  if (st.maxG > 4.2) { comfort -= (st.maxG - 4.2) * 1.2; notes.push('Zu starke Andruckkräfte in Senken oder Loopings.'); }
  if (st.minG < -0.8) { comfort -= (-0.8 - st.minG) * 1.6; notes.push('Zu starke Schwerelosigkeit über Kuppen.'); }
  if (st.maxLat > 1.3) { comfort -= (st.maxLat - 1.3) * 1.6; notes.push('Kurven sind zu schnell – Querkräfte drücken zur Seite.'); }
  comfort -= info.woodShare * 0.8;
  if (info.woodShare > 0.5) notes.push('Holz rumpelt ordentlich.');
  if (st.inversions > 3) comfort -= (st.inversions - 3) * 0.4;
  if (ride.arrivalSpeed !== null && ride.arrivalSpeed > 7) { comfort -= 1; notes.push('Harte Einfahrt in den Bahnhof – baue eine Bremse davor.'); }
  if (stuck) comfort -= 1.5;

  // Sicherheit
  let safety = 5 - BOLTS[s.bolts].safetyPenalty - SUPPORTS[s.supports].safetyPenalty;
  if (!info.hasBrake) { safety -= 0.6; notes.push('Eine Bremse auf der Strecke wäre sicherer.'); }
  if (info.woodInversions) { safety -= 1.5; notes.push('Holz-Loopings sind gefährlich.'); }
  if (st.maxLoadRatio > 0.85) { safety -= 0.8; notes.push('Die Strecke war kurz vor dem Limit belastet.'); }
  if (stuck) { safety -= 1; notes.push('Der Zug ist steckengeblieben – zu wenig Schwung. Kettenlift bis ganz oben bauen oder Hügel flacher machen!'); }

  // Optik & Länge
  const look = 1
    + clamp(info.length / 300, 0, 2)
    + clamp(info.uniqueTypes * 0.2, 0, 1.2)
    + (info.colorCount > 1 ? 0.4 : 0)
    + (info.materialMix ? 0.4 : 0);

  const scores = {
    thrill: clamp(thrill, 1, 5),
    comfort: clamp(comfort, 1, 5),
    safety: crashed ? 1 : clamp(safety, 1, 5),
    look: clamp(look, 1, 5),
  };
  return { scores, notes: [...new Set(notes)].slice(0, 3), crashed, stuck };
}

// Einzelbewertung eines Gastes inkl. Kommentar.
export function guestVerdict(guest, result, rnd = Math.random) {
  const w = PERSONALITIES[guest.type].weights;
  const sc = result.scores;
  let v = 0;
  for (const k in w) v += w[k] * sc[k];
  v += (rnd() - 0.5) * 0.6;
  let stars = Math.round(clamp(v, 1, 5));
  if (result.crashed) stars = guest.type === 'daredevil' && rnd() < 0.5 ? 2 : 1;
  return { stars, comment: comment(guest, result, stars, rnd) };
}

function pick(arr, rnd) { return arr[Math.floor(rnd() * arr.length)]; }

function comment(guest, r, stars, rnd) {
  const sc = r.scores;
  if (r.crashed) {
    if (guest.type === 'daredevil') return pick(['Aua… aber NOCHMAL!', 'Das war krass. Und schmerzhaft.', 'Ich sehe Sternchen!'], rnd);
    return pick(['Ich will zu meiner Mama!', 'Nie wieder!!!', 'Wer hat DAS gebaut?!', 'Mein Eis ist weg…'], rnd);
  }
  if (r.stuck) return pick(['Wir hängen fest…', 'Ist das schon die Fahrt?', 'Ich hab Zeit… viel Zeit.'], rnd);
  if (sc.comfort < 2.2 && guest.type !== 'daredevil') return pick(['Mir ist schlecht…', 'Mein Rücken!', 'Bitte langsamer!'], rnd);
  if (sc.thrill < 2 && guest.type !== 'careful') return pick(['Gähn…', 'Das war ja wie Bus fahren.', 'Schneller bitte!'], rnd);
  if (stars >= 5) return pick(['WAHNSINN!', 'Beste Bahn im Park!', 'Nochmal, nochmal!', 'Absolut genial!'], rnd);
  if (stars >= 4) return pick(['Richtig gut!', 'Hat Spaß gemacht!', 'Tolle Abfahrt!', 'Super Aussicht!'], rnd);
  if (stars >= 3) return pick(['Ganz okay.', 'Ganz nett.', 'Geht so.'], rnd);
  return pick(['Naja…', 'Nicht so meins.', 'Da geht noch was.'], rnd);
}
