# Browser-Tests

Diese Tests steuern einen echten Browser und prüfen Dinge, die sich ohne
Browser nicht prüfen lassen: die Migration alter gespeicherter Daten, das
Verhalten der installierten App (PWA) und den Offline-Betrieb.

Sie laufen **nicht** über `npm test`, weil sie eine zusätzliche Installation
brauchen — die reinen Logik-Tests sollen ohne jede Vorbereitung laufen.

## Einmalig vorbereiten

```bash
npm install --no-save playwright
npx playwright install chromium
```

## Ausführen

Jeder Test braucht eine laufende App. In einem zweiten Terminal starten:

```bash
npm run dev          # für migration.test.cjs und app.test.cjs
# oder
npm run build && npm run preview   # für pwa.test.cjs (Service Worker gibt es nur im Produktionsbuild)
```

Dann:

```bash
BASE=http://127.0.0.1:5173/ node tests/browser/migration.test.cjs
BASE=http://127.0.0.1:5173/ node tests/browser/app.test.cjs
BASE=http://127.0.0.1:4173/ node tests/browser/pwa.test.cjs
```

## Umgebungsvariablen

- `BASE` — Adresse der laufenden App (Vorgabe je Test unterschiedlich, siehe oben)
- `MODE` — nur für `app.test.cjs`: `mit` (Vorgabe) erwartet hinterlegte
  Supabase-Zugangsdaten, `ohne` erwartet, dass keine gesetzt sind. Beide Fälle
  sind einen Lauf wert: Ohne Zugangsdaten muss die App einen Hinweis zeigen
  statt abzustürzen.
- `CHROMIUM_PATH` — nur nötig, wenn ein fertiger Browser an einer festen Stelle
  liegt; sonst weglassen, dann nimmt Playwright den selbst installierten.

## Was jeder Test abdeckt

| Datei | Prüft |
|---|---|
| `migration.test.cjs` | Alte Daten (ohne Zeitstempel) werden verlustfrei übernommen, Sicherungskopie wird angelegt, Löschen erzeugt einen Grabstein statt zu entfernen, Bewerten erneuert Zeitstempel und zählt den Lerntag, Export enthält Grabsteine |
| `app.test.cjs` | App startet und ist bedienbar, Vokabeln überleben einen Reload, Konto-Ansicht verhält sich mit und ohne Zugangsdaten richtig, ein fehlgeschlagener Anmeldeversuch lässt die Vokabeln unangetastet |
| `pwa.test.cjs` | Manifest und alle Symbole erreichbar, iOS-Angaben vorhanden, Service Worker wird aktiv, App startet ohne Netz |
