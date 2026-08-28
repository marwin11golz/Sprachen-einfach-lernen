// Die grosse Streak-Feier - der zweite Entwurf im Design-Canvas
// ("Streak-Animation"), dort als eigener Bildschirm gezeigt statt als Zeile
// unter anderen Kennzahlen. Erscheint nur an dem Tag, an dem die Serie durch
// DIESE Sitzung tatsaechlich weitergegangen ist (siehe streakNeu in App.jsx,
// gesetzt beim Start einer Sitzung anhand "war heute noch nichts") - an jedem
// anderen Tag waere sie eine Feier fuer etwas, das schon feststand, und liefe
// nach der normalen Zusammenfassung (SessionDone) ein zweites Mal ab.
//
// Der Entwurf zeichnet die Flamme in Orange auf eigenem dunklem Grund. Hier
// bleibt sie Gruen: die Farbregel des Projekts (siehe CLAUDE.md, "Green means
// act now") reserviert warning/orange fuer unmittelbares Feedback
// (Bewertungsknoepfe, Toasts) - eine zweite Akzentfarbe fuer eine Feier waere
// genau der Bruch, den die Regel verhindern soll. Aus demselben Grund das
// lucide-Symbol statt des Emojis, wie schon bei der Flamme in SessionDone.
//
// Der Entwurf zeigt im Vorschau-Rahmen keinen Knopf - "Nochmal abspielen"
// gehoert der CANVAS-Vorschau, nicht der App; der eigentliche Bildschirm hat
// keine sichtbare Bedienung. Damit er in der echten App trotzdem einen Ausgang
// hat: die ganze Flaeche ist antippbar (wie die Lernkarte), und ein fester
// Timer schaltet nach kurzer Zeit von selbst weiter, falls niemand antippt.

import React, { useEffect } from 'react';
import { Flame } from 'lucide-react';
import { SPACE, RADIUS, FONT, hexToRgba } from '../lib/theme.js';
import { useHochzaehlen } from '../lib/motion.js';

// Lang genug, um das Einlaufen UND die hochzaehlende Zahl in Ruhe zu sehen,
// kurz genug, dass niemand vor einem stehenden Bildschirm haengen bleibt, der
// nicht antippt.
const AUTO_WEITER_MS = 3200;

export default function StreakCelebration({ T, days, onDone }) {
  const tage = useHochzaehlen(days, 300);

  useEffect(() => {
    const t = setTimeout(onDone, AUTO_WEITER_MS);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div
      className="dc-screen"
      role="button"
      tabIndex={0}
      aria-label="Weiter"
      onClick={onDone}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDone(); } }}
      style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: SPACE.xl, textAlign: 'center', cursor: 'pointer',
        backgroundImage: `radial-gradient(120% 55% at 50% 40%, ${hexToRgba(T.primary, .07)} 0%, transparent 60%)`,
      }}
    >
      <div style={{
        position: 'relative', width: 200, height: 160,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {/* Im Entwurf ein sehr blasser Ring (1px, Farbe selbst schon halb
            durchsichtig, dazu eine Deckkraft, die auf 0,35 gedeckelt ist) -
            kaum mehr als ein Hauch. Eine volltonige Linie in Bauteilfarbe war
            hier zu kraeftig und sah aus wie ein gezeichneter Kreis statt wie
            ein Lichtschein. hexToRgba nimmt die Deckkraft vorweg. */}
        <span className="dc-glow" style={{
          position: 'absolute', width: 150, height: 150, borderRadius: RADIUS.pill,
          border: `1px solid ${hexToRgba(T.primary, .55)}`, animationDelay: '150ms',
        }} />
        {/* Der eigentliche Glanz im Entwurf sitzt nicht im Ring, sondern als
            weicher Schlagschatten auf der Flamme selbst
            (filter: drop-shadow(...)) - ohne ihn blieb nur der Ring uebrig,
            und der allein wirkte wie ein Fremdkoerper um das Symbol. */}
        <span className="dc-pop" style={{
          display: 'inline-flex', animationDelay: '200ms',
          filter: `drop-shadow(0 0 22px ${hexToRgba(T.primary, .4)})`,
        }}>
          <Flame size={92} color={T.primary} strokeWidth={1.6} />
        </span>
      </div>

      <div className="dc-rise" style={{
        display: 'flex', alignItems: 'baseline', gap: SPACE.md,
        marginTop: SPACE.lg, animationDelay: '350ms',
      }}>
        <span className="nums" style={{
          fontSize: FONT.display, fontWeight: 700, lineHeight: 1,
          letterSpacing: '-0.02em', color: T.textPrimary,
        }}>
          {tage}
        </span>
        <span style={{ fontSize: FONT.xl, color: T.textSecondary, fontWeight: 500 }}>
          {days === 1 ? 'Tag Streak' : 'Tage Streak'}
        </span>
      </div>
    </div>
  );
}
