// Kleine Statusanzeige in der Kopfzeile.
//
// Sie ist dauerhaft sichtbar, weil ein still fehlgeschlagener Abgleich der
// unangenehmste Fehler waere: Man merkt wochenlang nichts und die Geraete
// laufen unbemerkt auseinander.

import React from 'react';
import { Cloud, CloudOff, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { RADIUS, typoSecondary } from '../lib/theme.js';

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
    ? { fg: T.error, bg: T.errorSoft }
    : state === 'idle'
      ? { fg: T.primary, bg: T.primarySoft }
      : { fg: T.textSecondary, bg: 'transparent' };

  return (
    <button
      onClick={onClick}
      title="Konto und Abgleich"
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 13px', borderRadius: RADIUS.pill, cursor: 'pointer',
        border: tone.bg === 'transparent' ? `1px solid ${T.hairline}` : 'none',
        background: tone.bg, color: tone.fg,
        ...typoSecondary('sm'), whiteSpace: 'nowrap',
      }}
    >
      <Icon size={14} /> {text}
    </button>
  );
}
