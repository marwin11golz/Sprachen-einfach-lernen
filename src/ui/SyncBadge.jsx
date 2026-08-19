// Kleine Statusanzeige in der Kopfzeile.
//
// Sie ist dauerhaft sichtbar, weil ein still fehlgeschlagener Abgleich der
// unangenehmste Fehler waere: Man merkt wochenlang nichts und die Geraete
// laufen unbemerkt auseinander.

import React from 'react';
import { Cloud, CloudOff, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';

const LABELS = {
  disabled:  { text: 'lokal',        Icon: CloudOff },
  signedOut: { text: 'nicht angemeldet', Icon: CloudOff },
  syncing:   { text: 'gleicht ab…',  Icon: RefreshCw },
  idle:      { text: 'abgeglichen',  Icon: CheckCircle2 },
  offline:   { text: 'offline',      Icon: CloudOff },
  error:     { text: 'Fehler',       Icon: AlertTriangle },
};

export default function SyncBadge({ T, state, onClick }) {
  const { text, Icon } = LABELS[state] || { text: 'Cloud', Icon: Cloud };

  const tone = state === 'error'
    ? { fg: T.danger, bg: T.dangerSoft }
    : state === 'idle'
      ? { fg: T.accent, bg: T.accentSoft }
      : { fg: T.inkSoft, bg: 'transparent' };

  return (
    <button
      onClick={onClick}
      title="Konto und Abgleich"
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 12px', borderRadius: 9, cursor: 'pointer',
        border: tone.bg === 'transparent' ? `1px solid ${T.border}` : 'none',
        background: tone.bg, color: tone.fg,
        fontSize: 12.5, fontWeight: 500, whiteSpace: 'nowrap',
      }}
    >
      <Icon size={14} /> {text}
    </button>
  );
}
