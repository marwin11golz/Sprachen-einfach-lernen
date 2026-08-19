// Zusammenführen zweier Kartenbestände.
//
// Wird an zwei Stellen gebraucht und muss deshalb genau eine Fassung haben:
//   - beim Import einer Sicherungsdatei
//   - beim Abgleich mit der Cloud
//
// Regel: gleiche id -> der jüngere Zeitstempel gewinnt ("last write wins").
// Verschiedene ids -> beide behalten. Löschungen sind keine Ausnahme, sondern
// nur eine Kartenversion mit deleted: true - deshalb kann eine Löschung sich
// wie jede andere Änderung durchsetzen.

// Auflösung bei gleichem Zeitstempel. Leitgedanke: ein Gleichstand darf
// niemals Lernfortschritt kosten. Relevant vor allem direkt nach der
// Migration, wo beide Geräte denselben abgeleiteten Zeitstempel berechnen.
function pickWinner(local, remote) {
  const lu = local.updatedAt || '';
  const ru = remote.updatedAt || '';
  if (lu > ru) return local;
  if (ru > lu) return remote;

  const lr = local.totalReviews || 0;
  const rr = remote.totalReviews || 0;
  if (rr > lr) return remote;
  if (lr > rr) return local;

  if ((remote.interval || 0) > (local.interval || 0)) return remote;
  return local;
}

// Führt zwei Kartenlisten zusammen. Bei absolutem Gleichstand gewinnt die
// erste Liste, deshalb dort immer den lokalen Bestand übergeben.
export function mergeCards(localCards, otherCards) {
  const byId = new Map();
  for (const c of localCards) byId.set(c.id, c);
  for (const c of otherCards) {
    const existing = byId.get(c.id);
    byId.set(c.id, existing ? pickWinner(existing, c) : c);
  }
  return [...byId.values()];
}

// Anzeigewert der Lernaktivität: eigene Tage plus die Summe der anderen
// Geräte. Die beiden Maps bleiben getrennt gespeichert - würde man den
// zusammengerechneten Wert als eigenen Zählerstand hochladen, würden sich
// die Zahlen bei jedem Abgleich selbst aufsummieren.
export function combinedActivity(activityLocal, activityRemote) {
  const out = { ...activityLocal };
  for (const [day, n] of Object.entries(activityRemote || {})) {
    out[day] = (out[day] || 0) + n;
  }
  return out;
}

// Grabsteine, die lange genug verteilt sind, endgültig wegräumen.
export function purgeOldTombstones(cards, days = 90) {
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  return cards.filter(c => !(c.deleted && (c.updatedAt || '') < cutoff));
}
