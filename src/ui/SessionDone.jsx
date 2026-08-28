// Der Abschlussbildschirm einer Lernsitzung.
//
// Aufbau und Choreografie stammen aus dem Design-Entwurf (Canvas "Abschluss &
// Streak") und sind bewusst so uebernommen, wie sie dort stehen:
//
//   Ring mit Haken - "Session abgeschlossen" - drei Kennzahlen - "Zur Übersicht"
//
// Kein erklaerender Untertext unter dem Titel: "4 Karten für heute erledigt"
// haette woertlich wiederholt, was die erste Kennzahl direkt darunter ohnehin
// sagt. Die Zahlen SIND der Inhalt dieser Seite.
//
// Uebernommen sind Reihenfolge, Verzoegerungen und Groessenverhaeltnisse. Die
// Farben kommen aus den Design-Tokens der App statt aus dem Entwurf: der hatte
// nur eine dunkle Fassung, seine Palette waere im hellen Design unlesbar.
// Gruen traegt - wie im Entwurf - Ring, Haken, die fuehrende Kennzahl und die
// Flamme; die beiden anderen Zahlen stehen in der normalen Textfarbe, damit die
// Zeilen eine Rangfolge behalten.

import React, { useState, useEffect, useRef } from 'react';
import { Check, Flame } from 'lucide-react';
import {
  SPACE, RADIUS, FONT, btnPrimary, typoBody, hexToRgba,
} from '../lib/theme.js';

// Wer "Bewegung reduzieren" eingestellt hat, bekommt den Endzustand sofort -
// ohne Einlaufen und ohne hochzaehlende Zahlen. Die Abfrage laeuft einmal beim
// Aufbau; sie aendert sich waehrend einer Sitzung praktisch nie, und ein
// Listener dafuer waere mehr Apparat als Nutzen.
function magKeineBewegung() {
  return typeof window !== 'undefined'
    && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Zaehlt von 0 auf ziel. Die Kurve ist dieselbe wie im Entwurf (kubisch
// auslaufend): schnell los, sanft ankommen - so steht die Zahl am Ende ruhig,
// statt bis zur letzten Millisekunde zu flackern.
function useHochzaehlen(ziel, verzoegerungMs, dauerMs = 800) {
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

// Eine Kennzahlzeile: Zahl gross, Beschriftung klein daneben - beide auf
// derselben Grundlinie, damit die drei Zeilen untereinander nicht wackeln.
function Kennzahl({ T, wert, einheit, farbe, verzoegerung, icon, hervor }) {
  return (
    <div className="dc-rise" style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'center',
      gap: SPACE.md, animationDelay: `${verzoegerung}ms`,
    }}>
      {icon && (
        // Fester Rahmen, damit die Zeile beim Aufploppen des Symbols nicht
        // seitlich verrutscht.
        <span style={{
          position: 'relative', display: 'inline-flex', alignItems: 'center',
          justifyContent: 'center', width: 30, height: 30, flexShrink: 0,
          alignSelf: 'center',
        }}>
          {hervor && (
            <span className="dc-glow" style={{
              position: 'absolute', width: 30, height: 30, borderRadius: RADIUS.pill,
              border: `1px solid ${T.primary}`,
              animationDelay: `${verzoegerung + 150}ms`,
            }} />
          )}
          <span className="dc-pop" style={{
            display: 'inline-flex', animationDelay: `${verzoegerung + 200}ms`,
          }}>
            {icon}
          </span>
        </span>
      )}
      <span className="nums" style={{
        fontSize: FONT.display, fontWeight: 700, lineHeight: 1,
        letterSpacing: '-0.02em', color: farbe,
      }}>
        {wert}
      </span>
      <span style={{ ...typoBody('lg'), color: T.textSecondary }}>{einheit}</span>
    </div>
  );
}

export default function SessionDone({
  T, sessionTotal, trefferquote, streak, streakNeu, onDone,
}) {
  const karten = useHochzaehlen(sessionTotal, 850);
  const quote = useHochzaehlen(trefferquote, 1200);
  const tage = useHochzaehlen(streak, 1550);

  return (
    <div className="dc-screen" style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: SPACE.xl, textAlign: 'center',
    }}>
      {/* Ring mit Haken statt gefuellter Flaeche - wie im Entwurf. Der
          Hintergrund ist derselbe Gruenton stark aufgehellt, damit der Ring
          auch im hellen Design nicht auf blankem Grund schwebt. */}
      <div className="dc-check" style={{
        width: 104, height: 104, borderRadius: RADIUS.pill,
        background: hexToRgba(T.primary, 0.10),
        border: `2px solid ${T.primary}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Check size={46} color={T.primary} strokeWidth={2.2} />
      </div>

      {/* Eine Stufe unter der Zahlengroesse und einzeilig: bei FONT.hero bricht
          "Session abgeschlossen" auf 390 px um, druckt die Kennzahlen nach
          unten und nimmt dem Titel die Ruhe, die er im Entwurf hat. */}
      <div className="dc-rise" style={{
        fontSize: FONT.xxl, fontWeight: 600, lineHeight: 1.2,
        letterSpacing: '-0.01em', color: T.textPrimary,
        marginTop: SPACE.xl, animationDelay: '450ms',
      }}>
        Session abgeschlossen
      </div>

      <div style={{
        marginTop: SPACE.xxxl, display: 'flex', flexDirection: 'column',
        gap: SPACE.xl, width: '100%',
      }}>
        <Kennzahl T={T} wert={karten} einheit={karten === 1 ? 'Karte gelernt' : 'Karten gelernt'}
          farbe={T.primary} verzoegerung={850} />
        {/* Das Prozentzeichen laeuft mit der Beschriftung, nicht mit der Zahl -
            genau wie im Entwurf, und "100 %" in Display-Groesse wuerde die
            Zeile auf schmalen Geraeten sprengen. */}
        <Kennzahl T={T} wert={quote} einheit="% Trefferquote"
          farbe={T.textPrimary} verzoegerung={1200} />
        {streak > 0 && (
          // Der Glueh-Ring stammt aus dem zweiten Entwurf des Canvas
          // ("Streak-Animation") und laeuft nur, wenn die Serie durch DIESE
          // Sitzung weitergegangen ist. Bei jeder weiteren Sitzung am selben
          // Tag waere er eine Feier fuer etwas, das schon feststand.
          <Kennzahl T={T} wert={tage} einheit={streak === 1 ? 'Tag Streak' : 'Tage Streak'}
            farbe={T.textPrimary} verzoegerung={1550}
            hervor={streakNeu}
            icon={<Flame size={26} color={T.primary} />} />
        )}
      </div>

      <button className="press dc-rise" onClick={onDone}
        style={{ ...btnPrimary(T, 'lg'), marginTop: SPACE.xxxl, animationDelay: '2150ms' }}>
        Zur Übersicht
      </button>
    </div>
  );
}
