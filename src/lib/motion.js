// Gemeinsame Hilfsfunktionen der Abschluss-Animationen (SessionDone,
// StreakCelebration). Eigene Datei, damit beide dieselbe Hochzaehl-Logik und
// dieselbe Praeferenzabfrage benutzen statt zweier Kopien, die auseinanderlaufen
// koennten.

import { useState, useEffect, useRef } from 'react';

// Wer "Bewegung reduzieren" eingestellt hat, bekommt den Endzustand sofort -
// ohne Einlaufen und ohne hochzaehlende Zahlen. Die Abfrage laeuft einmal beim
// Aufbau; sie aendert sich waehrend einer Sitzung praktisch nie, und ein
// Listener dafuer waere mehr Apparat als Nutzen.
export function magKeineBewegung() {
  return typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Zaehlt von 0 auf ziel. Kubisch auslaufend: schnell los, sanft ankommen - so
// steht die Zahl am Ende ruhig, statt bis zur letzten Millisekunde zu flackern.
export function useHochzaehlen(ziel, verzoegerungMs, dauerMs = 800) {
  const ruhig = magKeineBewegung();
  const [wert, setWert] = useState(ruhig ? ziel : 0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (ruhig) { setWert(ziel); return undefined; }
    const start = performance.now() + verzoegerungMs;
    const schritt = (jetzt) => {
      const p = Math.max(0, Math.min(1, (jetzt - start) / dauerMs));
      setWert(Math.round(ziel * (1 - Math.pow(1 - p, 3))));
      if (p < 1) rafRef.current = requestAnimationFrame(schritt);
    };
    rafRef.current = requestAnimationFrame(schritt);
    return () => cancelAnimationFrame(rafRef.current);
  }, [ziel, verzoegerungMs, dauerMs, ruhig]);

  return wert;
}
