# 🎢 Coaster Accident

Ein Achterbahn-Baukasten im Cartoon-Stil, der direkt im Browser läuft – auf Laptop, Tablet und Handy (mit Touch).

Auf einer leeren Sandfläche mitten im Freizeitpark baust du deine eigene Achterbahn aus fertigen Bauteilen. Danach steigen kleine Cartoon-Gäste ein, fahren mit und bewerten die Bahn mit **1 bis 5 Sternen**. Wer zu billig oder zu wild baut, erlebt einen (harmlosen, cartoonhaften) Unfall. 💥

## So wird gespielt

1. **Bauteile antippen** – sie werden am Ende der Strecke (grüner Pfeil) angebaut.
2. **⛓️ Kettenlift** einschalten und mit **Hoch** bergauf bauen. Ohne Kette schafft der Zug keinen Berg – die Kette muss bis ganz oben gehen.
3. Abfahrten, Kurven, **Looping** und **Schraube** einbauen.
4. **🔗 Schließen** verbindet das Ende automatisch mit dem Bahnhof (Ziel: die rosa Fahne links vom Bahnhof).
5. **▶️ Fahrt!** – und zuschauen, ob alles hält.

**Bedienung:** Ziehen = Kamera drehen · Zwei Finger / Mausrad = zoomen · Zwei Finger ziehen / rechte Maustaste = verschieben.
Während der Fahrt wechselt **🎥** zwischen *Verfolgen*, *Mitfahren* (Ego-Perspektive) und *Frei*.

## Bauteile & Werkstoffe

| Bauteil | Wirkung |
|---|---|
| ⬆️ Gerade | 4 m geradeaus (behält die Neigung) |
| ↰ ↱ Kurven | 90°-Kurve, automatisch geneigt |
| ↗️ Hoch / ↘️ Runter | Neigung um 25° ändern (max. 75°) |
| ➰ Looping | Tropfenförmiger Looping (nur auf flacher Strecke) |
| 🌀 Schraube | Korkenzieher-Rolle um die Herzlinie |
| 🛑 Bremse | Bremst auf 18 km/h |
| ⛓️ Kettenlift | Schalter: zieht neue Teile mit Kette hoch (Aufpreis) |

Im **🧰 Material**-Menü:

- **Schiene:** Stahl (stabil) oder Holz (billiger, rumpelt, hält weniger aus – Holz-Loopings sind riskant).
- **Farbe:** pro Bauteil wählbar.
- **Schrauben:** Billig / Standard / Premium – bestimmt, wie viel Druck die Strecke aushält.
- **Stützen:** Weit / Normal / Eng – mehr Stützen = stabiler, aber teurer.

Alles kostet Geld. Du startest mit 30.000 €, gute Fahrten bringen Ticketeinnahmen, Unfälle kosten Schadenersatz.

## Bewertung

Jeder Gast hat eine Persönlichkeit (😎 Draufgänger, 🧐 Vorsichtig, 🙂 Normal, 🧒 Kind) und gewichtet die Kriterien anders:

- 😱 **Nervenkitzel** – Tempo, Höhe, Überschläge, Schwerelosigkeit
- 🛋️ **Komfort** – G-Kräfte, Querkräfte in Kurven, Rumpeln, harte Einfahrt
- 🦺 **Sicherheit** – Schrauben, Stützen, Bremsen, Belastung der Strecke
- 🎨 **Optik & Länge** – Streckenlänge, Abwechslung, Farben, Material-Mix

## Unfälle

Die Fahrphysik ist echt berechnet (Schwerkraft, Reibung, G-Kräfte). Es kracht, wenn …

- die Strecke **nicht geschlossen** ist (der Zug fliegt am Ende raus),
- der Zug **zu schnell in eine Kurve** fährt,
- er über eine Kuppe **abhebt**,
- der Druck größer ist als **Material + Schrauben + Stützen** aushalten,
- der Zug **kopfüber stehen bleibt**.

Die Anzeige **„Belastung der Strecke“** während der Fahrt zeigt, wie knapp es ist.

## Starten

Das Spiel ist eine statische Webseite ohne Build-Schritt. Three.js wird vom CDN geladen, daher braucht es eine Internetverbindung.

**Online spielen (empfohlen):** In den Repository-Einstellungen unter *Settings → Pages* als Quelle den Branch `main` (Ordner `/`) wählen. Danach ist das Spiel unter `https://<benutzername>.github.io/Coaster-Accident/` erreichbar – auch auf dem Handy.

**Lokal:** Wegen der JavaScript-Module muss die Seite über einen kleinen Webserver laufen (Doppelklick auf `index.html` reicht nicht):

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

Der Spielstand wird automatisch im Browser gespeichert.

## Aufbau

```
index.html          Seite, Bedienelemente
style.css           Cartoon-Oberfläche, responsives Layout
js/main.js          Szene, Kamera, Spielablauf, Bedienung
js/logic/           Spiellogik ohne Grafik (testbar mit Node.js)
  pieces.js         Bauteile, Werkstoffe, Schrauben, Stützen
  track.js          Strecke, Prüfungen, automatisches Schließen, Fahrweg
  ride.js           Fahrphysik, G-Kräfte, Unfälle
  rating.js         Bewertung und Gäste-Kommentare
js/render/          3D-Darstellung mit Three.js
  park.js           Freizeitpark, Riesenrad, Karussell, Besucher
  trackMesh.js      Schienen, Schwellen, Schrauben, Stützen
  trainView.js      Zug, Fahrgäste, Unfall-Animation
  figures.js        Cartoon-Figuren und Wagen
  toon.js           Toon-Materialien
```

Technik: [Three.js](https://threejs.org) r170 (Toon-Shading + Outline-Effekt), reines JavaScript ohne Abhängigkeiten zum Installieren.
