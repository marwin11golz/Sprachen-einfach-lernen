// Anmeldung per E-Mail und Passwort.
//
// Bewusst kein Magic Link: Der Bestätigungslink öffnet in Safari statt in der
// Startbildschirm-App - man wäre dort dann nicht angemeldet.

import { useState, useEffect, useCallback } from 'react';
import { supabase, cloudConfigured } from '../lib/supabase.js';

// Supabase meldet auf Englisch; hier die Fälle, die tatsächlich vorkommen.
function germanError(error) {
  const msg = String(error?.message || error || '');
  if (/invalid login credentials/i.test(msg)) return 'E-Mail oder Passwort stimmt nicht.';
  if (/already registered|already been registered/i.test(msg)) return 'Diese E-Mail ist schon registriert – bitte anmelden.';
  if (/password should be at least/i.test(msg)) return 'Das Passwort braucht mindestens 6 Zeichen.';
  if (/unable to validate email|invalid email/i.test(msg)) return 'Diese E-Mail-Adresse sieht nicht gültig aus.';
  if (/email not confirmed/i.test(msg)) return 'E-Mail noch nicht bestätigt – bitte im Postfach nachsehen.';
  if (/failed to fetch|network|load failed/i.test(msg)) return 'Keine Verbindung – du kannst offline weiterlernen.';
  if (/rate limit|too many/i.test(msg)) return 'Zu viele Versuche – bitte kurz warten.';
  return msg || 'Unbekannter Fehler.';
}

export function useAuth() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(!cloudConfigured);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    if (!cloudConfigured) return;
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data?.session || null);
      setAuthReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next || null);
    });

    // Wichtig fuer Reacts doppelten Effektaufruf im Entwicklungsmodus:
    // ohne Abmelden sammeln sich Zuhoerer an.
    return () => { active = false; sub?.subscription?.unsubscribe(); };
  }, []);

  const run = useCallback(async (fn) => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      const { error } = await fn();
      if (error) { setAuthError(germanError(error)); return false; }
      return true;
    } catch (e) {
      setAuthError(germanError(e));
      return false;
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const signIn = useCallback(
    (email, password) => run(() => supabase.auth.signInWithPassword({ email, password })),
    [run],
  );

  const signUp = useCallback(
    (email, password) => run(() => supabase.auth.signUp({ email, password })),
    [run],
  );

  const signOut = useCallback(() => run(() => supabase.auth.signOut()), [run]);

  return {
    session,
    user: session?.user || null,
    userId: session?.user?.id || null,
    authReady,
    authBusy,
    authError,
    setAuthError,
    cloudConfigured,
    signIn, signUp, signOut,
  };
}
