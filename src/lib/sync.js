// Abgleich mit der Cloud: holen -> zusammenführen -> hochladen.
//
// Der Datenbank-Client wird übergeben und nicht importiert. Dadurch lässt sich
// die gesamte Logik mit einem nachgebauten Client testen, ohne Netzverbindung.
//
// Die Regel, welche Kartenfassung gewinnt, steht ausschliesslich in merge.js -
// hier wird sie benutzt, nicht wiederholt.

import { mergeCards } from './merge.js';

const PUSH_CHUNK = 500;
const ACTIVITY_DAYS = 120;

// Postgres liefert Zeitstempel als "2026-08-19T16:28:16.762+00:00", lokal
// erzeugen wir "2026-08-19T16:28:16.762Z". Beides bezeichnet denselben
// Moment, vergleicht sich als Zeichenkette aber NICHT gleich ('+' < 'Z') -
// ein Gleichstand würde sonst fälschlich als Unterschied gelesen. Deshalb
// wird jeder Zeitstempel aus der Datenbank auf die kanonische Form gebracht.
export function normalizeStamp(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
}

// Baut aus einer Datenbankzeile wieder eine Karte im App-Format.
export function rowToCard(row) {
  return {
    ...row.data,
    id: row.id,
    deleted: Boolean(row.deleted),
    updatedAt: normalizeStamp(row.updated_at),
  };
}

// Baut aus einer Karte eine Datenbankzeile. updated_at kommt bewusst vom
// Client und nicht von now(), damit die hochgeladene Zeile beim nächsten
// Abruf exakt denselben Zeitstempel zurückliefert - sonst sähe jede Karte
// nach jedem Hochladen wieder "neu" aus und die Geräte würden endlos pingpong
// spielen.
export function cardToRow(card, userId) {
  const { id, deleted, updatedAt, ...data } = card;
  return {
    user_id: userId,
    id,
    data,
    deleted: Boolean(deleted),
    updated_at: updatedAt,
  };
}

// Hat die lokale Fassung etwas, das der Cloud fehlt?
// Bei gleichem Zeitstempel zählt der höhere Wiederholungsstand - dieselbe
// Rangfolge wie in merge.js, damit ein Gleichstands-Gewinner auch wirklich
// hochgeladen wird.
export function isNewer(local, remote) {
  if (!remote) return true;
  const lu = local.updatedAt || '';
  const ru = remote.updatedAt || '';
  if (lu > ru) return true;
  if (lu < ru) return false;
  return (local.totalReviews || 0) > (remote.totalReviews || 0);
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function recentDays(activity, days) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  return Object.entries(activity || {})
    .filter(([day, count]) => day >= cutoff && count > 0);
}

/**
 * Führt einen vollständigen Abgleich durch.
 *
 * Es wird immer der komplette Bestand geholt. Ein persönlicher Kartenstapel
 * ist winzig, und das erspart die gesamte Fehlerklasse "welche Änderung habe
 * ich beim letzten Mal übersehen".
 */
export async function syncOnce({ client, userId, deviceId, cards, activityLocal, flipped, prefsUpdatedAt }) {
  // --- 1. Holen ---
  const [cardsRes, activityRes, prefsRes] = await Promise.all([
    client.from('cards').select('id, data, deleted, updated_at'),
    client.from('activity').select('device_id, day, count').neq('device_id', deviceId),
    client.from('preferences').select('data, updated_at').maybeSingle(),
  ]);

  const firstError = cardsRes.error || activityRes.error || prefsRes.error;
  if (firstError) return { ok: false, error: firstError };

  const remoteCards = (cardsRes.data || []).map(rowToCard);
  const remoteById = new Map(remoteCards.map(c => [c.id, c]));

  // --- 2. Zusammenführen (Regel liegt in merge.js) ---
  const merged = mergeCards(cards, remoteCards);

  // --- 3. Hochlade-Menge aus dem Ergebnis ableiten ---
  // Kein Merkzettel offener Änderungen nötig: Was offline geändert wurde, ist
  // automatisch neuer. Ein abgebrochenes Hochladen wird beim nächsten Mal
  // einfach neu hergeleitet.
  const toPush = merged.filter(c => isNewer(c, remoteById.get(c.id)));

  // --- 4. Lernaktivität: fremde Geräte aufsummieren ---
  const activityRemote = {};
  for (const row of activityRes.data || []) {
    activityRemote[row.day] = (activityRemote[row.day] || 0) + (row.count || 0);
  }

  // --- 5. Einstellungen ---
  const remotePrefs = prefsRes.data || null;
  const remotePrefsStamp = remotePrefs ? normalizeStamp(remotePrefs.updated_at) : '';
  const localPrefsStamp = prefsUpdatedAt || '';
  const remotePrefsWin = remotePrefs && remotePrefsStamp > localPrefsStamp;
  const nextFlipped = remotePrefsWin
    ? Boolean(remotePrefs.data?.flipped)
    : flipped;
  const nextPrefsUpdatedAt = remotePrefsWin ? remotePrefsStamp : localPrefsStamp;

  // --- 6. Hochladen ---
  if (toPush.length) {
    for (const part of chunk(toPush.map(c => cardToRow(c, userId)), PUSH_CHUNK)) {
      const { error } = await client.from('cards').upsert(part, { onConflict: 'user_id,id' });
      if (error) return { ok: false, error };
    }
  }

  // Jedes Gerät schreibt ausschliesslich seine EIGENE Zeile. Würde man den
  // zusammengerechneten Anzeigewert als eigenen Zählerstand hochladen, würden
  // sich die Zahlen bei jedem Abgleich selbst aufschaukeln.
  const ownActivity = recentDays(activityLocal, ACTIVITY_DAYS)
    .map(([day, count]) => ({ user_id: userId, device_id: deviceId, day, count }));
  if (ownActivity.length) {
    const { error } = await client
      .from('activity')
      .upsert(ownActivity, { onConflict: 'user_id,device_id,day' });
    if (error) return { ok: false, error };
  }

  // Nur schreiben, wenn es wirklich etwas Neues gibt - sonst würde jeder
  // Abgleich unnötig eine Zeile anfassen.
  const shouldPushPrefs = !remotePrefs || (localPrefsStamp && localPrefsStamp > remotePrefsStamp);
  if (shouldPushPrefs) {
    const stamp = localPrefsStamp || new Date().toISOString();
    const { error } = await client.from('preferences').upsert(
      { user_id: userId, data: { flipped }, updated_at: stamp },
      { onConflict: 'user_id' },
    );
    if (error) return { ok: false, error };
  }

  return {
    ok: true,
    cards: merged,
    activityRemote,
    flipped: nextFlipped,
    prefsUpdatedAt: nextPrefsUpdatedAt,
    pushedCards: toPush.length,
    pulledCards: remoteCards.length,
  };
}

// Sorgt dafür, dass nie zwei Abgleiche gleichzeitig laufen. Deckt zugleich
// Reacts doppelten Effektaufruf im Entwicklungsmodus ab.
let inFlight = null;

export function syncNow(args) {
  if (inFlight) return inFlight;
  inFlight = syncOnce(args)
    .catch(error => ({ ok: false, error }))
    .finally(() => { inFlight = null; });
  return inFlight;
}

export function isSyncing() { return Boolean(inFlight); }
