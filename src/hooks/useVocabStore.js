// Besitzt den gesamten Vokabel-Zustand: Karten, Lernaktivität, Einstellungen.
//
// Nach außen gibt es bewusst KEIN rohes setCards, sondern nur die vier
// Absichten addCards / rateCard / deleteCard / importData. Genau das
// garantiert, dass jede Änderung ihren Zeitstempel bekommt - vergisst man das
// an einer einzigen Stelle, gewinnt beim Abgleich später der falsche Stand.

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { rate, todayISO } from '../lib/srs.js';
import { loadLocal, saveLocal, migrateCard } from '../lib/storage.js';
import { mergeCards, combinedActivity, purgeOldTombstones } from '../lib/merge.js';

const stamp = (card) => ({ ...card, updatedAt: new Date().toISOString(), deleted: card.deleted || false });

export function useVocabStore() {
  const [allCards, setAllCards] = useState([]);
  const [activityLocal, setActivityLocal] = useState({});
  const [activityRemote, setActivityRemote] = useState({});
  const [flipped, setFlipped] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [storageWarning, setStorageWarning] = useState(null);

  // Zählt nur echte Nutzeränderungen hoch. Ein eingespielter Fernstand darf
  // ihn nicht bewegen, sonst löst jeder Abruf wieder ein Hochladen aus.
  const [revision, setRevision] = useState(0);
  const bump = useCallback(() => setRevision(r => r + 1), []);

  // --- Laden ---
  useEffect(() => {
    const { state, warning } = loadLocal();
    setAllCards(purgeOldTombstones(state.cards));
    setActivityLocal(state.activityLocal);
    setActivityRemote(state.activityRemote);
    setFlipped(state.flipped);
    if (warning) setStorageWarning(warning);
    setLoaded(true);
  }, []);

  // --- Speichern (entprellt, erst nachdem geladen wurde) ---
  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      const res = saveLocal({ cards: allCards, activityLocal, activityRemote, flipped });
      setStorageWarning(res.ok ? null : res.warning);
    }, 300);
    return () => clearTimeout(t);
  }, [allCards, activityLocal, activityRemote, flipped, loaded]);

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
    bump();
  }, [bump]);

  // Wird in P4 vom Cloud-Abgleich benutzt: setzt den zusammengeführten Stand,
  // ohne die Revision zu bewegen.
  const applyRemote = useCallback(({ cards: mergedCards, activityRemote: remote }) => {
    if (mergedCards) setAllCards(mergedCards);
    if (remote) setActivityRemote(remote);
  }, []);

  return {
    cards, allCards, activity, activityLocal,
    flipped, setFlipped: setFlippedTracked,
    loaded, storageWarning,
    revision,
    addCards, rateCard, deleteCard, importData, applyRemote,
  };
}
