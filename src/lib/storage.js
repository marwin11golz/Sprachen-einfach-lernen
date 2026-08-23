// Lesen und Schreiben des lokalen Speichers (localStorage) inklusive
// Migration auf das aktuelle Datenformat.
//
// Format v2:
//   {
//     schemaVersion: 2,
//     cards: [...],            // inklusive Grabsteine (deleted: true)
//     activityLocal: {...},    // Lerntage DIESES Geräts
//     activityRemote: {...},   // Summe aller anderen Geräte (kommt aus der Cloud)
//     flipped: false,
//     newCardsPerDay: 20,      // nur lokal, nicht Teil des Cloud-Abgleichs
//     retention: 0.95,         // Marke, auf welche Zielretention der Bestand
//                              // gerechnet ist - nicht mehr einstellbar
//     deviceId: "...",
//     lastUserId: null,
//     lastSyncAt: null
//   }

import { uid } from './srs.js';
import { RETENTION } from './fsrs.js';

export const STORAGE_KEY = 'lucy-lernt-sprachen-vocab-data';
export const DEVICE_KEY = 'lucy-lernt-sprachen-device-id';
const BACKUP_V1_KEY = 'lucy-lernt-sprachen-vocab-data-backup-v1';

export const SCHEMA_VERSION = 2;

function emptyState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    cards: [],
    activityLocal: {},
    activityRemote: {},
    flipped: false,
    newCardsPerDay: 20,
    prefsUpdatedAt: null,
    lastUserId: null,
    lastSyncAt: null,
  };
}

// Feste Geräte-Kennung. Sie sorgt dafür, dass jedes Gerät seine eigene
// Lernaktivität zählt und Geräte sich beim Abgleich nicht überschreiben.
export function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) { id = uid(); localStorage.setItem(DEVICE_KEY, id); }
    return id;
  } catch {
    return 'unbekannt';
  }
}

// Sicherungskopie des unveränderten Rohstands. Überschreibt eine bestehende
// Sicherung nie - die älteste ist die wertvollste.
export function backupRaw(key) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, raw);
    return true;
  } catch {
    return false;
  }
}

// Ergänzt fehlende Felder einer Karte aus einem älteren Format.
//
// WICHTIG - der Zeitstempel wird bewusst aus vorhandenen Daten ABGELEITET und
// nicht auf "jetzt" gesetzt: Handy und iPad tragen dieselben Altkarten (per
// Export/Import verteilt). Bei "jetzt" würde das Gerät, das die App als
// zweites öffnet, jede Karte gewinnen und den echten Lernfortschritt des
// anderen Geräts überschreiben. Abgeleitet kommen beide Geräte auf denselben
// Wert - es entsteht ein Gleichstand, den pickWinner() verlustfrei auflöst.
export function migrateCard(c) {
  const card = { type: 'vocab', ...c };
  if (!card.updatedAt) {
    const day = card.lastReviewed || card.createdAt || '1970-01-01';
    card.updatedAt = `${day}T00:00:00.000Z`;
  }
  if (typeof card.deleted !== 'boolean') card.deleted = false;
  return card;
}

export function loadLocal() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (e) {
    return {
      state: emptyState(),
      warning: 'Lokaler Speicher nicht verfügbar (z. B. privates Fenster) – Änderungen werden nicht dauerhaft gesichert.',
    };
  }

  if (!raw) return { state: emptyState(), warning: null };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return {
      state: emptyState(),
      warning: 'Gespeicherte Daten konnten nicht gelesen werden – bitte über „Karten → Import“ eine Sicherung einspielen.',
    };
  }

  const isLegacy = !parsed.schemaVersion;
  if (isLegacy) backupRaw(BACKUP_V1_KEY);

  const state = {
    schemaVersion: SCHEMA_VERSION,
    cards: (parsed.cards || []).map(migrateCard),
    // v1 kannte nur "activityLog" – das ist die Historie dieses Geräts.
    activityLocal: parsed.activityLocal || parsed.activityLog || {},
    activityRemote: parsed.activityRemote || {},
    flipped: typeof parsed.flipped === 'boolean' ? parsed.flipped : false,
    // Tageslimit fuer neue Karten - bewusst rein lokal, nicht Teil des
    // Cloud-Prefs-Abgleichs (siehe useVocabStore.js): eine Lerntempo-
    // Praeferenz, kein Lernfortschritt.
    newCardsPerDay: Number.isFinite(parsed.newCardsPerDay) ? parsed.newCardsPerDay : 20,
    // Die Zielretention ist fest (RETENTION in fsrs.js) und nicht mehr
    // einstellbar. Der gespeicherte Wert ist nur noch die Marke, auf welche
    // Retention der Kartenbestand gerechnet ist: steht dort etwas anderes -
    // ein alter Reglerwert, oder gar nichts, weil der Stand aelter ist als die
    // Zielretention selbst - dann liegen die Faelligkeiten auf einer anderen
    // Kurve und der Store rechnet sie beim Laden einmalig um. Danach steht hier
    // 0,95 und die Umstellung laeuft nie wieder.
    needsRetentionReset: parsed.retention !== RETENTION,
    prefsUpdatedAt: parsed.prefsUpdatedAt || null,
    lastUserId: parsed.lastUserId || null,
    lastSyncAt: parsed.lastSyncAt || null,
  };

  return { state, warning: null };
}

export function saveLocal(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      schemaVersion: SCHEMA_VERSION,
      cards: state.cards,
      activityLocal: state.activityLocal,
      activityRemote: state.activityRemote,
      flipped: state.flipped,
      newCardsPerDay: state.newCardsPerDay ?? 20,
      // Immer der feste Wert: die Marke sagt, auf welche Zielretention der
      // Bestand gerechnet ist, und ab hier ist das immer 0,95.
      retention: RETENTION,
      prefsUpdatedAt: state.prefsUpdatedAt ?? null,
      lastUserId: state.lastUserId ?? null,
      lastSyncAt: state.lastSyncAt ?? null,
    }));
    return { ok: true, warning: null };
  } catch (e) {
    return {
      ok: false,
      warning: `Speichern fehlgeschlagen (${String(e && e.message ? e.message : e)}) – bitte Vokabeln vorsichtshalber per Export sichern.`,
    };
  }
}
