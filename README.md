# Lucy lernt Sprachen

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

## Speicherung
Vokabeln und Fortschritt werden automatisch im `localStorage` des Browsers gespeichert – bleiben also auch nach dem Schließen des Tabs erhalten. Das gilt pro Browser/Gerät (kein Abgleich zwischen Handy und PC). Über „Karten → Export“ lässt sich jederzeit eine JSON-Sicherung erstellen, die sich an anderer Stelle wieder importieren lässt.
