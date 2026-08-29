// Besitzt den gesamten Vokabel-Zustand: Karten, Lernaktivität, Einstellungen.
//
// Nach außen gibt es bewusst KEIN rohes setCards, sondern nur die vier
// Absichten addCards / rateCard / deleteCard / importData. Genau das
// garantiert, dass jede Änderung ihren Zeitstempel bekommt - vergisst man das
// an einer einzigen Stelle, gewinnt beim Abgleich später der falsche Stand.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { rate, todayISO, rescheduleCard } from '../lib/srs.js';
import { loadLocal, saveLocal, migrateCard } from '../lib/storage.js';
import { mergeCards, combinedActivity, purgeOldTombstones } from '../lib/merge.js';

const stamp = (card) => ({ ...card, updatedAt: new Date().toISOString(), deleted: card.deleted || false });

export function useVocabStore() {
  const [allCards, setAllCards] = useState([]);
  const [activityLocal, setActivityLocal] = useState({});
  const [activityRemote, setActivityRemote] = useState({});
  const [flipped, setFlipped] = useState(false);
  const [newCardsPerDay, setNewCardsPerDay] = useState(20);
  const [prefsUpdatedAt, setPrefsUpdatedAt] = useState(null);
  const [lastUserId, setLastUserId] = useState(null);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [storageWarning, setStorageWarning] = useState(null);

  // Zählt nur echte Nutzeränderungen hoch. Ein eingespielter Fernstand darf
  // ihn nicht bewegen, sonst löst jeder Abruf wieder ein Hochladen aus.
  const [revision, setRevision] = useState(0);
  const bump = useCallback(() => setRevision(r => r + 1), []);

  // --- Laden ---
  useEffect(() => {
    const { state, warning } = loadLocal();
    let start = purgeOldTombstones(state.cards);
    // Einmalige Umstellung auf die feste Zielretention. Betrifft zwei Gruppen:
    // wer die App vor der Zielretention benutzt hat, und wer spaeter am
    // Dichte-Regler gedreht hatte. Beide tragen Karten, die mit einer flacheren
    // Kurve weit in der Zukunft liegen - ohne Umrechnung wuerden die von der
    // festen 0,95 nie wieder erfasst und blieben monatelang unsichtbar.
    //
    // Bewusst OHNE updatedAt-Stempel - genau wie bei der Schema-Migration in
    // storage.js. Die Rechnung ist deterministisch, also kommt jedes Geraet
    // fuer sich auf dasselbe Ergebnis; wuerde stattdessen gestempelt, koennte
    // das zuerst geoeffnete Geraet ungesyncte Bewertungen des anderen
    // ueberschreiben.
    if (state.needsRetentionReset) {
      start = start.map(c => (c.deleted ? c : rescheduleCard(c)));
    }
    setAllCards(start);
    setActivityLocal(state.activityLocal);
    setActivityRemote(state.activityRemote);
    setFlipped(state.flipped);
    setNewCardsPerDay(state.newCardsPerDay);
    setPrefsUpdatedAt(state.prefsUpdatedAt);
    setLastUserId(state.lastUserId);
    setLastSyncAt(state.lastSyncAt);
    if (warning) setStorageWarning(warning);
    setLoaded(true);
  }, []);

  // --- Speichern (entprellt, erst nachdem geladen wurde) ---
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      const res = saveLocal({
        cards: allCards, activityLocal, activityRemote,
        flipped, newCardsPerDay, prefsUpdatedAt, lastUserId, lastSyncAt,
      });
      setStorageWarning(res.ok ? null : res.warning);
    }, 300);
    return () => clearTimeout(t);
  }, [allCards, activityLocal, activityRemote, flipped, newCardsPerDay, prefsUpdatedAt, lastUserId, lastSyncAt, loaded]);

  // Immer der zuletzt festgeschriebene Stand - damit rateCard die aktuelle
  // Karte bewertet und nicht eine veraltete Momentaufnahme aus der Warteschlange.
  const cardsRef = useRef([]);
  useEffect(() => { cardsRef.current = allCards; }, [allCards]);

  // Die Oberfläche sieht Grabsteine nie.
  const cards = useMemo(() => allCards.filter(c => !c.deleted), [allCards]);
  const activity = useMemo(
    () => combinedActivity(activityLocal, activityRemote),
    [activityLocal, activityRemote],
  );

  const logActivity = useCallback(() => {
    const day = todayISO();
    setActivityLocal(prev => ({ ...prev, [day]: (prev[day] || 0) + 1 }));
  }, []);

  const addCards = useCallback((newCards) => {
    if (!newCards.length) return;
    setAllCards(prev => [...prev, ...newCards.map(stamp)]);
    bump();
  }, [bump]);

  const rateCard = useCallback((id, ratingKey) => {
    const live = cardsRef.current.find(c => c.id === id);
    if (!live) return null;
    const updated = stamp(rate(live, ratingKey));
    setAllCards(prev => prev.map(c => (c.id === id ? updated : c)));
    logActivity();
    bump();
    return updated;
  }, [logActivity, bump]);

  // Löschen heißt: als gelöscht markieren, nicht entfernen. Nur so erfährt
  // das andere Gerät überhaupt davon.
  const deleteCard = useCallback((id) => {
    setAllCards(prev => prev.map(c => (
      c.id === id ? { ...c, deleted: true, updatedAt: new Date().toISOString() } : c
    )));
    bump();
  }, [bump]);

  // Mehrere Karten in EINEM Durchgang. Ueber deleteCard in einer Schleife
  // waeren es je Karte ein Zustandsupdate und ein Hochzaehlen der Revision -
  // bei 200 markierten Karten also 200 Renderzyklen und 200 Anstoesse fuer den
  // Cloud-Abgleich. Grabsteine wie beim Einzelloeschen: entfernt wird nichts,
  // sonst holt das andere Geraet die Karten beim naechsten Abgleich zurueck.
  const deleteCards = useCallback((ids) => {
    const menge = ids instanceof Set ? ids : new Set(ids);
    if (menge.size === 0) return;
    const jetzt = new Date().toISOString();
    setAllCards(prev => prev.map(c => (
      menge.has(c.id) ? { ...c, deleted: true, updatedAt: jetzt } : c
    )));
    bump();
  }, [bump]);

  const importData = useCallback((parsed) => {
    const incoming = (parsed.cards || []).map(migrateCard);
    setAllCards(prev => mergeCards(prev, incoming));
    const incomingActivity = parsed.activityLocal || parsed.activityLog || {};
    setActivityLocal(prev => {
      const out = { ...prev };
      for (const [day, n] of Object.entries(incomingActivity)) {
        out[day] = Math.max(out[day] || 0, n);
      }
      return out;
    });
    bump();
    return incoming.length;
  }, [bump]);

  const setFlippedTracked = useCallback((valueOrFn) => {
    setFlipped(valueOrFn);
    setPrefsUpdatedAt(new Date().toISOString());
    bump();
  }, [bump]);

  // Wird vom Cloud-Abgleich benutzt: setzt den zusammengeführten Stand, OHNE
  // die Revision zu bewegen - sonst würde jeder Abruf ein Hochladen auslösen.
  const applyRemote = useCallback((next) => {
    if (next.cards) setAllCards(next.cards);
    if (next.activityRemote) setActivityRemote(next.activityRemote);
    if (typeof next.flipped === 'boolean') setFlipped(next.flipped);
    if (next.prefsUpdatedAt !== undefined) setPrefsUpdatedAt(next.prefsUpdatedAt);
    if (next.lastSyncAt !== undefined) setLastSyncAt(next.lastSyncAt);
    if (next.lastUserId !== undefined) setLastUserId(next.lastUserId);
  }, []);

  return {
    cards, allCards, activity, activityLocal,
    flipped, setFlipped: setFlippedTracked,
    newCardsPerDay, setNewCardsPerDay,
    prefsUpdatedAt, lastUserId, lastSyncAt,
    loaded, storageWarning,
    revision,
    addCards, rateCard, deleteCard, deleteCards, importData, applyRemote,
  };
}
