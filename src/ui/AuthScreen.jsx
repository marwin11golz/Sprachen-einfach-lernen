// Konto-Ansicht: anmelden, registrieren, abmelden, Abgleich-Status.
// Gestaltung bewusst wie die Kartenboxen im Dashboard.

import React, { useState } from 'react';
import { CheckCircle2, RefreshCw, LogOut, CloudOff } from 'lucide-react';
import { btnPrimary, btnSecondary, btnGhost, SPACE, RADIUS, FONT } from '../lib/theme.js';

function fmtTime(iso) {
  if (!iso) return 'noch nie';
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std`;
  return new Date(iso).toLocaleDateString('de-DE');
}

export default function AuthScreen({
  T, auth, sync, cardCount, onBack,
}) {
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState(null);

  const card = {
    background: T.bgElev, border: `1px solid ${T.border}`, borderRadius: RADIUS.lg,
    padding: '22px 20px', boxShadow: T.shadow, maxWidth: 420, margin: '0 auto',
  };
  const input = {
    width: '100%', padding: '11px 13px', borderRadius: RADIUS.md,
    border: `1px solid ${T.border}`, background: T.bg, color: T.ink,
    fontSize: FONT.lg, marginBottom: 10,
  };

  if (!auth.cloudConfigured) {
    return (
      <div style={card}>
        <div style={{ fontSize: FONT.xl, fontWeight: 700, marginBottom: 10 }}>
          Abgleich nicht eingerichtet
        </div>
        <div style={{ fontSize: FONT.base, color: T.inkSoft, lineHeight: 1.6 }}>
          Für diese Fassung der App sind keine Zugangsdaten zur Datenbank hinterlegt.
          Die App funktioniert vollständig – deine Vokabeln bleiben aber nur auf
          diesem Gerät.
        </div>
        <button onClick={onBack} style={{ ...btnSecondary(T), marginTop: 16 }}>Zurück</button>
      </div>
    );
  }

  // --- Angemeldet ---
  if (auth.user) {
    return (
      <div style={card}>
        <div style={{ fontSize: FONT.xl, fontWeight: 700, marginBottom: 4 }}>
          Angemeldet
        </div>
        <div className="mono" style={{ fontSize: FONT.sm, color: T.inkSoft, marginBottom: 18 }}>
          {auth.user.email}
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
          borderRadius: RADIUS.md, background: T.accentSoft, color: T.accent,
          fontSize: FONT.base, marginBottom: 8,
        }}>
          <CheckCircle2 size={16} />
          <span>{cardCount} Karte(n) · zuletzt abgeglichen {fmtTime(sync.lastSyncAt)}</span>
        </div>

        {sync.syncError && (
          <div style={{
            padding: '10px 12px', borderRadius: RADIUS.md, background: T.dangerSoft,
            color: T.danger, fontSize: FONT.sm, marginBottom: 8, lineHeight: 1.5,
          }}>
            Letzter Abgleich fehlgeschlagen: {sync.syncError}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
          <button onClick={sync.syncNow} style={btnPrimary(T)}>
            <RefreshCw size={14} style={{ marginRight: 6 }} /> Jetzt abgleichen
          </button>
          <button
            onClick={async () => {
              if (!window.confirm('Abmelden? Deine Karten bleiben auf diesem Gerät.')) return;
              await auth.signOut();
            }}
            style={btnSecondary(T)}
          >
            <LogOut size={14} style={{ marginRight: 6 }} /> Abmelden
          </button>
          <button onClick={onBack} style={btnGhost(T)}>
            Zurück
          </button>
        </div>

        <div style={{ fontSize: FONT.xs, color: T.inkSoft, marginTop: 16, lineHeight: 1.6 }}>
          Melde dich auf deinem anderen Gerät mit derselben E-Mail an, dann haben
          beide denselben Stand. Ein zweites Konto wäre ein zweiter, getrennter
          Kartenstapel.
        </div>
      </div>
    );
  }

  // --- Abgemeldet ---
  const submit = async (e) => {
    e.preventDefault();
    setNotice(null);
    const ok = mode === 'signin'
      ? await auth.signIn(email.trim(), password)
      : await auth.signUp(email.trim(), password);
    if (ok && mode === 'signup') {
      setNotice('Konto erstellt. Falls eine Bestätigungs-E-Mail kommt, bitte kurz bestätigen.');
    }
    if (ok) setPassword('');
  };

  return (
    <div style={card}>
      <div style={{ fontSize: FONT.xl, fontWeight: 700, marginBottom: 6 }}>
        {mode === 'signin' ? 'Anmelden' : 'Konto erstellen'}
      </div>
      <div style={{ fontSize: FONT.base, color: T.inkSoft, marginBottom: 18, lineHeight: 1.6 }}>
        Damit Handy und iPad dieselben Vokabeln haben. Ohne Anmeldung funktioniert
        die App weiter – die Karten bleiben dann nur auf diesem Gerät.
      </div>

      <form onSubmit={submit}>
        <input
          style={input} type="email" required autoComplete="email" inputMode="email"
          placeholder="E-Mail" value={email} onChange={e => setEmail(e.target.value)}
        />
        <input
          style={input} type="password" required minLength={6}
          autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          placeholder="Passwort (mind. 6 Zeichen)" value={password}
          onChange={e => setPassword(e.target.value)}
        />

        {auth.authError && (
          <div style={{ color: T.danger, fontSize: FONT.sm, marginBottom: 10, lineHeight: 1.5 }}>
            {auth.authError}
          </div>
        )}
        {notice && (
          <div style={{ color: T.success, fontSize: FONT.sm, marginBottom: 10, lineHeight: 1.5 }}>
            {notice}
          </div>
        )}

        <button type="submit" disabled={auth.authBusy} style={{ ...btnPrimary(T), width: '100%', justifyContent: 'center', opacity: auth.authBusy ? 0.6 : 1 }}>
          {auth.authBusy ? 'Moment…' : (mode === 'signin' ? 'Anmelden' : 'Konto erstellen')}
        </button>
      </form>

      <button
        onClick={() => { setMode(m => (m === 'signin' ? 'signup' : 'signin')); auth.setAuthError(null); setNotice(null); }}
        style={{ ...btnGhost(T), textDecoration: 'underline', marginTop: 14 }}
      >
        {mode === 'signin' ? 'Noch kein Konto? Konto erstellen' : 'Schon ein Konto? Anmelden'}
      </button>

      <div style={{ marginTop: 6 }}>
        <button onClick={onBack} style={btnGhost(T)}>
          Zurück
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: FONT.xs, color: T.inkSoft, marginTop: 18 }}>
        <CloudOff size={13} /> Ohne Anmeldung: alles bleibt lokal auf diesem Gerät.
      </div>
    </div>
  );
}
