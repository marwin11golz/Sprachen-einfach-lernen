// Verbindet Speicher, Anmeldung und Abgleich und entscheidet, WANN
// abgeglichen wird.

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, cloudConfigured } from '../lib/supabase.js';
import { syncNow } from '../lib/sync.js';
import { getDeviceId, backupRaw } from '../lib/storage.js';

const CHANGE_DELAY = 2000;      // nach einer Änderung warten (lokal wird sofort gespeichert)
const FOREGROUND_MIN_GAP = 30000; // beim Zurückkehren nicht öfter als alle 30 s

export function useCloudSync({ store, userId, paused }) {
  const [syncState, setSyncState] = useState(
    cloudConfigured ? 'signedOut' : 'disabled',
  );
  const [syncError, setSyncError] = useState(null);
  // Ein anderes Konto meldet sich auf einem Gerät mit vorhandenen Karten an -
  // stillschweigend hochzuladen waere nicht rueckholbar, also wird gefragt.
  const [accountConflict, setAccountConflict] = useState(null);

  const deviceIdRef = useRef(null);
  if (deviceIdRef.current === null && typeof window !== 'undefined') {
    deviceIdRef.current = getDeviceId();
  }

  // Refs, damit der Abgleich immer den aktuellen Stand liest, ohne dass die
  // Ausloeser bei jeder Kartenaenderung neu aufgesetzt werden muessen.
  const storeRef = useRef(store);
  useEffect(() => { storeRef.current = store; }, [store]);
  const pausedRef = useRef(paused);
  useEffect(() => { pausedRef.current = paused; }, [paused]);

  const lastAttemptRef = useRef(0);

  const run = useCallback(async ({ force = false, dropLocalCards = false } = {}) => {
    if (!cloudConfigured || !userId) return;
    if (!force && pausedRef.current) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setSyncState('offline');
      return;
    }

    const s = storeRef.current;
    if (!s.loaded) return;

    lastAttemptRef.current = Date.now();
    setSyncState('syncing');

    const result = await syncNow({
      client: supabase,
      userId,
      deviceId: deviceIdRef.current,
      cards: dropLocalCards ? [] : s.allCards,
      activityLocal: dropLocalCards ? {} : s.activityLocal,
      flipped: s.flipped,
      prefsUpdatedAt: s.prefsUpdatedAt,
    });

    if (!result.ok) {
      setSyncError(result.error?.message || String(result.error || 'Unbekannter Fehler'));
      setSyncState(
        typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'error',
      );
      return;
    }

    setSyncError(null);
    storeRef.current.applyRemote({
      cards: result.cards,
      activityRemote: result.activityRemote,
      flipped: result.flipped,
      prefsUpdatedAt: result.prefsUpdatedAt,
      lastSyncAt: new Date().toISOString(),
      lastUserId: userId,
    });
    setSyncState('idle');
  }, [userId]);

  // --- Ausloeser 1: angemeldet bzw. Start ---
  useEffect(() => {
    if (!cloudConfigured) { setSyncState('disabled'); return; }
    if (!userId) { setSyncState('signedOut'); return; }
    if (!store.loaded) return;

    const s = storeRef.current;

    // Vor dem allerersten Abgleich dieses Kontos den unveraenderten lokalen
    // Stand sichern - rueckspielbar ueber das vorhandene Import-Feld.
    backupRaw(`lucy-lernt-sprachen-vocab-data-backup-pre-sync-${userId}`);

    if (s.lastUserId && s.lastUserId !== userId && s.allCards.length > 0) {
      setAccountConflict({ previousUserId: s.lastUserId, cardCount: s.cards.length });
      return;
    }

    run({ force: true });
  }, [userId, store.loaded, run]);

  // --- Ausloeser 2: nach lokalen Aenderungen, entprellt ---
  useEffect(() => {
    if (!cloudConfigured || !userId || !store.loaded || accountConflict) return;
    if (store.revision === 0) return;
    const t = setTimeout(() => run(), CHANGE_DELAY);
    return () => clearTimeout(t);
  }, [store.revision, userId, store.loaded, accountConflict, run]);

  // --- Ausloeser 3: wieder online / wieder im Vordergrund ---
  useEffect(() => {
    if (!cloudConfigured || !userId || accountConflict) return;

    const onOnline = () => run({ force: true });
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastAttemptRef.current < FOREGROUND_MIN_GAP) return;
      run();
    };

    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, accountConflict, run]);

  const resolveAccountConflict = useCallback((keepLocal) => {
    setAccountConflict(null);
    run({ force: true, dropLocalCards: !keepLocal });
  }, [run]);

  return {
    syncState,
    syncError,
    lastSyncAt: store.lastSyncAt,
    accountConflict,
    resolveAccountConflict,
    syncNow: () => run({ force: true }),
  };
}
