# Sprachen lernen

Vokabeltrainer mit Spaced Repetition (SM-2), Lückensätzen für Konjugationen und Dashboard.

## Lokal ausführen
```bash
npm install
npm run dev
```
Dann die angezeigte Adresse (z. B. http://localhost:5173) im Browser öffnen.

## Online veröffentlichen (Vercel)
1. Dieses Projekt auf GitHub hochladen.
2. Auf vercel.com mit GitHub einloggen → "Add New Project" → dieses Repo auswählen → "Deploy".
3. Fertig – du bekommst eine öffentliche URL. Auf dem Handy: URL öffnen → "Zum Startbildschirm hinzufügen".

## Auf dem Handy installieren
Die App ist eine PWA und lässt sich wie eine echte App installieren:

- **iPhone/iPad:** Adresse in **Safari** öffnen (nur Safari kann das) → Teilen-Symbol → „Zum Home-Bildschirm“
- **Android:** Adresse in Chrome öffnen → Menü (drei Punkte) → „App installieren“

Danach startet sie ohne Browserleiste und funktioniert auch ohne Internet.

Zwei Hinweise für iOS:
- Symbol und Name werden beim Installieren einmalig übernommen. Ändern sie sich später, muss das Symbol vom Home-Bildschirm gelöscht und neu hinzugefügt werden.
- Bleibt die App nach einem Update auf einem alten Stand hängen: Symbol löschen und neu hinzufügen. Am Rechner geht es über die Entwicklertools → Application → Service Workers → „Unregister“.

## Speicherung
Vokabeln und Fortschritt werden automatisch im `localStorage` des Browsers gespeichert – bleiben also auch nach dem Schließen der App erhalten und funktionieren offline.

Das gilt aktuell **pro Gerät**: Was am Handy eingetragen wird, erscheint nicht automatisch am iPad. Über „Karten → Export“ lässt sich jederzeit eine JSON-Sicherung erstellen, die sich anderswo wieder importieren lässt.

Gelöschte Karten werden nicht sofort entfernt, sondern als gelöscht markiert und nach 90 Tagen endgültig weggeräumt. Das ist die Voraussetzung dafür, dass eine Löschung sich später auch auf andere Geräte übertragen kann.
