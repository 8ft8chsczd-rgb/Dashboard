# Lernen – Karteikarten & Quiz

Schlichte Lern-App für die Uni-Fächer im iOS-Look (Dark Mode). Läuft als Web-App (PWA) im Browser und lässt sich auf iPad und iPhone wie eine normale App auf den Home-Bildschirm legen. Sie funktioniert auch offline.

## Funktionen

- **Fächer-Übersicht** mit Lernfortschritt pro Fach
- **Karteikarten**
  - Karte **antippen** → umdrehen (Vorderseite = Frage, Rückseite = Antwort, liniert wie eine echte Karteikarte)
  - **„Kann ich“** (oder nach rechts wischen) → Karte wandert auf den Stapel **„Gekonnt“**
  - **„Nochmal“** (oder nach links wischen) → Karte bleibt im **Lernstapel**
  - Gekonnt-Stapel ansehen und Karten mit **„Wieder lernen“** zurücklegen
  - Rückgängig, Mischen, Fortschritt zurücksetzen
- **Quiz** (Multiple Choice)
  - eigene Quizfragen (auch mit mehreren richtigen Antworten und Erklärung)
  - plus automatisch erzeugte Fragen aus den Karteikarten (falsche Antworten = Rückseiten anderer Karten)
  - Auswertung mit Liste der falschen Antworten und „Falsche wiederholen“

**Tastatur (iPad mit Tastatur / PC):** Leertaste = umdrehen, → = Kann ich, ← = Nochmal, ⌘Z = Rückgängig. Im Quiz: 1–4 bzw. A–D wählen, Enter = weiter.

## Auf iPad / iPhone installieren

1. App online stellen (siehe unten) und die Adresse in **Safari** öffnen.
2. Teilen-Symbol → **„Zum Home-Bildschirm“**.
3. Die App startet dann im Vollbild mit eigenem Icon.

Der Lernfortschritt wird **pro Gerät** gespeichert (iPad und iPhone haben jeweils ihren eigenen Stand).

### Online stellen

Die App besteht nur aus statischen Dateien, es ist kein Build-Schritt nötig.

- **Netlify** (kostenlos, funktioniert mit privatem Repo): „Add new site“ → „Import an existing project“ → GitHub → Repo wählen → Build command leer lassen, Publish directory `.` → Deploy.
- **GitHub Pages**: Settings → Pages → „Deploy from a branch“. Bei privaten Repos ist dafür GitHub Pro nötig.

Lokal testen: `python3 -m http.server` im Projektordner, dann `http://localhost:8000` öffnen.

## Inhalte hinzufügen

Jedes Fach ist eine JSON-Datei in `data/`. Neue Fächer zusätzlich in `data/index.json` eintragen:

```json
{ "subjects": ["technische-mechanik.json", "baustoffkunde.json", "neues-fach.json"] }
```

### Aufbau einer Fach-Datei

```json
{
  "id": "baustatik",
  "name": "Baustatik",
  "icon": "🏗️",
  "color": "blau",
  "cards": [
    { "front": "Frage oder Begriff", "back": "Antwort", "topic": "Kapitel 1" }
  ],
  "quiz": [
    {
      "question": "Wie viele Lagerreaktionen hat ein Festlager?",
      "options": ["1", "2", "3", "4"],
      "correct": "B",
      "explanation": "Eine horizontale und eine vertikale Kraft."
    },
    {
      "question": "Welche Aussagen sind richtig?",
      "options": ["Aussage 1", "Aussage 2", "Aussage 3", "Aussage 4"],
      "correct": ["A", "C"]
    },
    {
      "question": "Richtig oder falsch: Ein Loslager nimmt ein Moment auf.",
      "correct": false
    }
  ]
}
```

| Feld | Bedeutung |
|---|---|
| `id` | Kurzname ohne Leerzeichen (optional, sonst Dateiname) |
| `name`, `icon`, `color` | Anzeigename, Emoji, Farbe (`blau`, `grün`, `orange`, `rot`, `lila`, `pink`, `türkis`, `indigo`, `gelb` oder `#hex`) |
| `cards[].front` / `back` | Vorder- und Rückseite (`vorne`/`hinten` geht auch) |
| `cards[].topic` | optional: Kapitel/Thema, wird klein oben auf der Karte angezeigt |
| `quiz[].options` | 2–10 Antwortmöglichkeiten |
| `quiz[].correct` | Buchstabe (`"B"`), Liste (`["A","C"]`) bei mehreren richtigen Antworten, oder `true`/`false` für Richtig/Falsch-Fragen ohne `options` |
| `quiz[].explanation` | optional: Erklärung nach dem Beantworten |
| `frontImage` / `backImage` / `image` | optional: Bildpfad, z. B. `data/bilder/skizze.png` |

Die Antworten im Quiz werden automatisch gemischt (außer bei „Alle genannten“, „Keine der …“ usw.).

### Formatierung in Texten

- Zeilenumbruch: `\n`, Leerzeile: `\n\n`
- Aufzählung: Zeilen mit `- ` beginnen, nummeriert mit `1. `
- **Fett**: `**Text**`
- Tiefgestellt: `f_{ck}` → f<sub>ck</sub>, hochgestellt: `m^2` oder `m^{-1}` → m<sup>2</sup>

## Vorlage für Claude (Quizfragen erstellen lassen)

Diesen Text in dein Claude-Projekt kopieren, damit die Fragen direkt im passenden Format kommen:

```text
Erstelle Quizfragen zu [THEMA] als JSON-Array in genau diesem Format:

[
  {
    "question": "Fragetext",
    "options": ["Antwort A", "Antwort B", "Antwort C", "Antwort D"],
    "correct": "B",
    "explanation": "Kurze Erklärung, warum B richtig ist.",
    "topic": "Kapitelname"
  }
]

Regeln:
- "correct" ist der Buchstabe der richtigen Antwort (A = erste Option).
- Bei mehreren richtigen Antworten: "correct": ["A", "C"] und das in der Frage erwähnen.
- Richtig/Falsch-Fragen ohne "options", mit "correct": true oder false.
- Falsche Antworten sollen plausibel sein (typische Denkfehler).
- Formeln mit Unicode (σ, ε, ·, ≈) schreiben, Indizes als f_{ck}, Hochzahlen als m^2.
- Nur das JSON ausgeben, ohne weiteren Text.
```

## Technik

- Reines HTML/CSS/JavaScript ohne Abhängigkeiten
- `sw.js` (Service Worker) speichert die App für die Offline-Nutzung. Bei Änderungen am Code die Versionsnummer `CACHE` in `sw.js` erhöhen.
- Fortschritt liegt im `localStorage` des Browsers
