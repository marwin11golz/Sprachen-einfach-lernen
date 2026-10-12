// Statusanzeige des Abgleichs in der Kopfzeile.
//
// Sie bleibt dauerhaft sichtbar, weil ein still fehlgeschlagener Abgleich der
// unangenehmste Fehler waere: Man merkt wochenlang nichts und die Geraete
// laufen unbemerkt auseinander.
//
// Sichtbar heisst aber nicht laut. Der Normalfall traegt nur sein Symbol, in
// derselben Huelle wie der Design-Umschalter daneben - so liest die Kopfzeile
// als zwei gleichwertige kleine Knoepfe statt als Knopf plus Signal.
// Beschriftung bekommt nur, was gerade nicht stimmt.
//
// Vorher trug "abgeglichen" eine gefuellte gruene Pille und war damit neben dem
// Titel das auffaelligste Element des Bildschirms, obwohl es nur meldet, dass
// nichts zu tun ist. Das verstiess zugleich gegen die Farbregel: Gruen gehoert
// der Handlung, dem aktiven Zustand und dem Fortschritt - nicht einer
// Bestaetigung, dass alles in Ordnung ist. Nicht zurueckbauen.

import React from 'react';
import { Cloud, CloudOff, RefreshCw, AlertTriangle, Check } from 'lucide-react';
import { RADIUS, SPACE, typoSecondary } from '../lib/theme.js';

// `laut` heisst: Pille mit Beschriftung in der Signalfarbe. Das Feld steht hier
// und nicht als Bedingung im JSX, damit an einer Stelle nachzulesen ist, was
// dieser Anzeige als Problem gilt.
//
// `offline` und `error` sind die beiden einzigen. Beide sind nur erreichbar,
// wenn ein Konto angemeldet ist (siehe useCloudSync) - wer die Cloud nie
// eingerichtet hat, bekommt also nie ein orangenes Abzeichen zu sehen.
const LABELS = {
  disabled:  { text: 'Nur auf diesem Gerät', Icon: CloudOff },
  signedOut: { text: 'Nicht angemeldet',     Icon: CloudOff },
  syncing:   { text: 'Gleicht ab…',          Icon: RefreshCw },
  idle:      { text: 'Abgeglichen',          Icon: Check },
  offline:   { text: 'Offline',              Icon: CloudOff,      laut: true },
  error:     { text: 'Fehler',               Icon: AlertTriangle, laut: true },
};

export default function SyncBadge({ T, state, onClick }) {
  const { text, Icon, laut } = LABELS[state] || { text: 'Abgleich', Icon: Cloud };

  const ton = state === 'error'
    ? { fg: T.error, bg: T.errorSoft }
    : { fg: T.warning, bg: T.warningSoft };

  // Die leisen Zustaende haben keinen sichtbaren Text mehr - der Name des
  // Knopfs muss also aus den Attributen kommen, und er nennt beides: den
  // Zustand und wohin der Knopf fuehrt.
  const name = `${text} · Konto und Abgleich`;

  return (
    <button
      className="press"
      onClick={onClick}
      aria-label={name}
      title={name}
      style={laut ? {
        display: 'flex', alignItems: 'center', gap: SPACE.xs,
        padding: `${SPACE.sm}px ${SPACE.md}px`, borderRadius: RADIUS.pill,
        border: 'none', cursor: 'pointer',
        background: ton.bg, color: ton.fg,
        ...typoSecondary('sm'), whiteSpace: 'nowrap',
      } : {
        // Bewusst Zeichen fuer Zeichen die Huelle des Design-Umschalters
        // daneben (App.jsx, Kopfzeile) - die Beruhigung kommt daher, dass hier
        // ein vorhandenes Muster wiederverwendet und keine dritte Behandlung
        // erfunden wird. Aendert sich der eine, gehoert der andere mit.
        display: 'flex', padding: 9, borderRadius: RADIUS.pill,
        border: `1px solid ${T.border}`, background: T.surfaceElevated,
        color: T.textSecondary, cursor: 'pointer',
      }}
    >
      <Icon size={laut ? 14 : 16} />
      {laut && text}
    </button>
  );
}
