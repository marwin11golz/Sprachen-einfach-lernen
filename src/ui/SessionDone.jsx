// Der Abschlussbildschirm einer Lernsitzung.
//
// Die Choreografie stammt aus einem Design-Entwurf (Canvas "Abschluss &
// Streak"): Haken, Titel, drei Kennzahlen und Knopf laufen gestaffelt ein,
// die Zahlen zaehlen dabei hoch. Uebernommen ist die BEWEGUNG - Reihenfolge,
// Verzoegerungen, Ueberschwingen. Die Farben kommen bewusst aus den
// Design-Tokens der App und nicht aus dem Entwurf: der arbeitete mit einer
// eigenen dunklen Palette, die im hellen Design unlesbar waere.
//
// Warum ueberhaupt animiert: Das Ende einer Sitzung ist der einzige Moment,
// in dem die App etwas zurueckgibt statt etwas abzufragen. Die Staffelung
// laesst die Kennzahlen einzeln ankommen, statt sie als Block hinzustellen.

import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle2, Flame } from 'lucide-react';
import {
  SPACE, RADIUS, btnPrimary, typoH1, typoBody, typoNumber,
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

// Eine Kennzahlzeile. Zahl links, Einheit rechts - beide auf derselben
// Grundlinie, damit die Zeilen untereinander nicht wackeln.
function Kennzahl({ T, wert, einheit, farbe, verzoegerung, icon, hervor }) {
  return (
    <div className="dc-rise" style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'center',
      gap: SPACE.md, animationDelay: `${verzoegerung}ms`,
    }}>
      {icon && (
        // Der Rahmen haelt Platz frei, damit die Zeile beim Aufploppen des
        // Symbols nicht seitlich verrutscht.
        <span style={{
          position: 'relative', display: 'inline-flex', alignItems: 'center',
          justifyContent: 'center', width: 28, height: 28, flexShrink: 0,
          alignSelf: 'center',
        }}>
          {hervor && (
            <span className="dc-glow" style={{
              position: 'absolute', width: 28, height: 28, borderRadius: RADIUS.pill,
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
      <span className="nums" style={{ ...typoNumber('hero'), color: farbe }}>{wert}</span>
      <span style={{ ...typoBody('lg'), color: T.textSecondary }}>{einheit}</span>
    </div>
  );
}

export default function SessionDone({
  T, sessionTotal, deckLabel, trefferquote, streak, streakNeu, onDone,
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
      <div className="dc-check" style={{
        width: 84, height: 84, borderRadius: RADIUS.pill, background: T.successSoft,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <CheckCircle2 size={42} color={T.success} />
      </div>

      <div className="dc-rise" style={{ ...typoH1(), marginTop: SPACE.lg, animationDelay: '450ms' }}>
        Geschafft
      </div>
      <div className="dc-rise" style={{
        ...typoBody(), color: T.textSecondary, marginTop: SPACE.sm, maxWidth: 320,
        animationDelay: '450ms',
      }}>
        {sessionTotal} Karte{sessionTotal !== 1 ? 'n' : ''}{deckLabel ? ` in „${deckLabel}“` : ''} für heute erledigt.
      </div>

      <div style={{
        marginTop: SPACE.xxl, display: 'flex', flexDirection: 'column',
        gap: SPACE.lg, width: '100%',
      }}>
        {/* Die gelernten Karten tragen als Hauptzahl der Sitzung primary, die
            beiden anderen die normale Textfarbe - drei gruene Zahlen
            untereinander haetten keine Rangfolge mehr. */}
        <Kennzahl T={T} wert={karten} einheit={karten === 1 ? 'Karte gelernt' : 'Karten gelernt'}
          farbe={T.primary} verzoegerung={850} />
        {/* Das Prozentzeichen laeuft mit der Einheit, nicht mit der Zahl -
            sonst steht "100 %" in Hero-Groesse und sprengt die Zeile auf
            schmalen Geraeten. */}
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
            icon={<Flame size={20} color={T.primary} />} />
        )}
      </div>

      <button className="press dc-rise" onClick={onDone}
        style={{ ...btnPrimary(T, 'lg'), marginTop: SPACE.xxl, animationDelay: '2150ms' }}>
        Zum Dashboard
      </button>
    </div>
  );
}
