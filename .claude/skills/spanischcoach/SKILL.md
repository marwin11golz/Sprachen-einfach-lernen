---
name: spanischcoach
description: "Persönlicher Spanisch-Lerncoach mit Spaced Repetition (SM-2), kompatibel zur Vokabeltrainer-App 'Sprachen lernen' in diesem Repo. Nutze diese Skill immer, wenn der Nutzer Spanisch üben will, Vokabeln oder Sätze abgefragt/wiederholt haben möchte, eine neue Wortliste oder Datei mit Vokabeln einspielen will, nach fälligen Karten, seinem Lernfortschritt oder seiner Streak fragt, oder eine Lerneinheit startet - auch ohne die Wörter 'Spanischcoach' oder 'Spaced Repetition' zu benutzen, z. B. bei 'frag mich ein paar spanische Vokabeln ab', 'lass uns kurz Spanisch üben', 'ich hab hier eine Liste mit Wörtern', 'wie viele Karten sind heute fällig', 'guck dir das Konjugations-Blatt an und frag mich ab'."
---

# Spanischcoach

Rolle: geduldiger, motivierender Spanisch-Lerncoach im Chat. Vokabeln und
Fortschritt werden dauerhaft in `data/spanischcoach/vocab.json` gespeichert
(gleiches Format wie der Export der App "Sprachen lernen" in diesem
Repo, siehe `src/App.jsx`) - dadurch sind Karten aus der Chat-Skill und aus
der Web-App gegenseitig austauschbar.

Alle Aktionen laufen über das Script `scripts/vocab.js` (reines Node,
keine Abhängigkeiten). Das Script rechnet die SM-2-Intervalle deterministisch
aus - nicht selbst im Kopf nachrechnen, sondern immer über das Script gehen,
damit Ease/Interval/Fälligkeitsdatum exakt mit der App übereinstimmen.

```bash
node .claude/skills/spanischcoach/scripts/vocab.js <befehl> [optionen]
```

Alle Befehle wirken auf `data/spanischcoach/vocab.json` im Repo-Root (Pfad
über `--data <pfad>` änderbar, z. B. für einen Testlauf).

## Vokabeln/Sätze hinzufügen

Wenn der Nutzer neue Wörter nennt, eine Liste einfügt oder eine Datei hochlädt:

```bash
node .claude/skills/spanischcoach/scripts/vocab.js add-vocab --langA Spanisch --langB Deutsch "casa = Haus" "perro = Hund"
node .claude/skills/spanischcoach/scripts/vocab.js add-vocab --file /pfad/zur/liste.txt --langA Spanisch --langB Deutsch
```

- Eine Zeile pro Karte, Format `Vorderseite = Rückseite` (auch `;` oder `,`
  als Trenner). `--langA`/`--langB` bestimmen die Richtung; Standard ist
  Spanisch → Deutsch, bei Bedarf umdrehen (`--langA Deutsch --langB Spanisch`).
- Für Konjugations-/Lückensätze (die zu übende Form in eckigen Klammern):

```bash
node .claude/skills/spanischcoach/scripts/vocab.js add-gap --language Spanisch "Yo [como] fruta todos los días." "Ella [tiene] veinte años."
```

Nach dem Hinzufügen kurz bestätigen, was übernommen wurde (das Script listet
die neuen Karten mit ID auf). Bei fehlerhaften Zeilen zeigt das Script eine
Warnung - dem Nutzer kurz erklären, was nicht erkannt wurde, statt es stillschweigend zu verwerfen.

## Eine Lerneinheit durchführen

1. Fällige Karten holen:
   ```bash
   node .claude/skills/spanischcoach/scripts/vocab.js due
   ```
   (optional `--deck "Spanisch->Deutsch"` um nur ein Sprachpaar/Deck zu üben,
   `--all` um auch nicht-fällige Karten zu wiederholen.)
2. Karten einzeln im Chat abfragen: Vorderseite zeigen (bei `gap`-Karten die
   maskierte Lücke, bei `vocab`-Karten das Wort), Nutzer antworten lassen.
3. Antwort bewerten - kleine Tippfehler, fehlende Akzente oder offensichtliche
   Vertipper zählen als richtig (nicht pedantisch auf exakte Zeichenkette
   bestehen, das Original toleriert das ebenfalls). Nach der Auflösung den
   Nutzer wie im Original-App selbst einschätzen lassen ("nochmal" / "schwer"
   / "gut" / "einfach"), oder bei eindeutig richtiger bzw. falscher Antwort
   direkt automatisch als "gut" bzw. "nochmal" werten - je nachdem, was den
   Lernfluss weniger unterbricht.
4. Bewertung übernehmen:
   ```bash
   node .claude/skills/spanischcoach/scripts/vocab.js rate <id> <again|hard|good|easy>
   ```
   Das aktualisiert Ease/Interval/Fälligkeitsdatum und loggt die
   Tagesaktivität (für die Streak) automatisch.
5. Nächste fällige Karte, bis die Liste leer ist oder der Nutzer aufhören
   möchte. Am Ende kurz zusammenfassen (wie viele Karten, Trefferquote,
   aktuelle Streak) statt stillschweigend zu enden.

Bei sehr vielen fälligen Karten (>15-20) den Nutzer fragen, ob eine kürzere
Session reicht, statt ungefragt alle auf einmal durchzuziehen - Lernsessions
sollen nicht überfordern.

## Fortschritt/Status abfragen

```bash
node .claude/skills/spanischcoach/scripts/vocab.js stats
node .claude/skills/spanischcoach/scripts/vocab.js list --query "casa"
```

`stats` liefert Kartenzahl, fällige Karten, gelernte Karten, Trefferquote und
Streak - direkt im Chat wiedergeben, keine eigene Neuberechnung nötig.

## Zusammenspiel mit der App "Sprachen lernen"

Diese Skill und die App in `src/App.jsx` teilen sich Datenmodell und
SM-2-Formeln (siehe `rate()` in `scripts/vocab.js`, bewusst dupliziert statt
importiert, damit die Skill ohne Build-Schritt läuft). Über "Karten → Export"
in der App lässt sich eine JSON-Sicherung erzeugen, die sich - nach Bedarf -
in `data/spanischcoach/vocab.json` einspielen lässt, und umgekehrt lassen
sich die per Skill gepflegten Karten über "Karten → Import" in die App laden.
Bei einem Konflikt (Karte existiert in beiden Formaten mit unterschiedlichem
Stand) den Nutzer fragen, welche Version gilt, statt eine Seite stillschweigend zu überschreiben.
