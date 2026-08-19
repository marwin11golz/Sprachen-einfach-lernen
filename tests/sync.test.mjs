// Prüft die Abgleich-Logik gegen eine nachgebaute Datenbank - ohne Netz.
import { syncOnce, normalizeStamp, rowToCard, cardToRow, isNewer }
  from '../src/lib/sync.js';

let pass = 0, fail = 0;
const check = (n, c) => { if (c) { pass++; console.log('  OK   ' + n); } else { fail++; console.log('  FEHLER ' + n); } };

const USER = 'user-1';
const DEV = 'geraet-A';

// --- Nachgebauter Supabase-Client -------------------------------------------
function makeDb() {
  return { cards: [], activity: [], preferences: [], __writes: [] };
}

function makeClient(db) {
  return {
    from(table) {
      const filters = [];
      const rows = () => (db[table] || []).filter(r => filters.every(f => f(r)));
      const q = {
        select() { return q; },
        eq(col, val) { filters.push(r => r[col] === val); return q; },
        neq(col, val) { filters.push(r => r[col] !== val); return q; },
        maybeSingle() { return Promise.resolve({ data: rows()[0] || null, error: null }); },
        upsert(input, opts) {
          const newRows = Array.isArray(input) ? input : [input];
          db.__writes.push({ table, count: newRows.length });
          const keys = (opts?.onConflict || 'id').split(',');
          for (const nr of newRows) {
            const i = (db[table] || []).findIndex(r => keys.every(k => r[k] === nr[k]));
            if (i >= 0) db[table][i] = { ...db[table][i], ...nr };
            else db[table].push({ ...nr });
          }
          return Promise.resolve({ error: null });
        },
        then(res, rej) { return Promise.resolve({ data: rows(), error: null }).then(res, rej); },
      };
      return q;
    },
  };
}

const card = (over = {}) => ({
  id: 'c1', type: 'vocab', front: 'casa', back: 'Haus', langA: 'Spanisch', langB: 'Deutsch',
  ease: 2.5, interval: 0, repetitions: 0, dueDate: '2026-08-19', createdAt: '2026-08-01',
  lastReviewed: null, totalReviews: 0, correct: 0, wrong: 0,
  updatedAt: '2026-08-19T10:00:00.000Z', deleted: false, ...over,
});

const run = (db, args) => syncOnce({
  client: makeClient(db), userId: USER, deviceId: DEV,
  cards: [], activityLocal: {}, flipped: false, prefsUpdatedAt: null, ...args,
});

// ---------------------------------------------------------------------------
console.log('\n1) Zeitstempel: Postgres-Form vs. lokale Form');
{
  // Genau diese Falle: '+' sortiert vor 'Z', ein Gleichstand sähe sonst wie
  // ein Unterschied aus.
  const pg = '2026-08-19T10:00:00.762+00:00';
  const local = '2026-08-19T10:00:00.762Z';
  check('roh verglichen sind sie ungleich', pg !== local);
  check('normalisiert sind sie gleich', normalizeStamp(pg) === local);
  check('Z-Form bleibt unveraendert', normalizeStamp(local) === local);
}

console.log('\n2) Zeile <-> Karte hin und zurück');
{
  const c = card({ updatedAt: '2026-08-19T10:00:00.000Z' });
  const row = cardToRow(c, USER);
  check('user_id gesetzt', row.user_id === USER);
  check('id ausserhalb von data', row.id === 'c1' && row.data.id === undefined);
  check('updatedAt nicht doppelt in data', row.data.updatedAt === undefined);
  check('updated_at vom Client, nicht now()', row.updated_at === c.updatedAt);
  const back = rowToCard(row);
  const norm = o => JSON.stringify(Object.fromEntries(Object.entries(o).sort()));
  check('Rueckweg inhaltlich identisch', norm(back) === norm(c));
}

console.log('\n3) isNewer inkl. Gleichstand');
{
  check('neuer gewinnt', isNewer(card({ updatedAt: '2026-08-19T12:00:00.000Z' }), card()));
  check('aelter gewinnt nicht', !isNewer(card({ updatedAt: '2026-08-19T08:00:00.000Z' }), card()));
  check('fehlt fern -> hochladen', isNewer(card(), null));
  check('Gleichstand: mehr Wiederholungen gewinnt', isNewer(card({ totalReviews: 5 }), card({ totalReviews: 0 })));
  check('voelliger Gleichstand -> kein Hochladen', !isNewer(card(), card()));
}

console.log('\n4) Leere Cloud: alles wird hochgeladen');
{
  const db = makeDb();
  const r = await run(db, { cards: [card({ id: 'a' }), card({ id: 'b' })] });
  check('erfolgreich', r.ok);
  check('2 Karten hochgeladen', r.pushedCards === 2);
  check('2 Zeilen in der Datenbank', db.cards.length === 2);
  check('Zeile hat user_id', db.cards[0].user_id === USER);
}

console.log('\n5) Fernstand ist neuer: wird übernommen, nichts hochgeladen');
{
  const db = makeDb();
  db.cards.push(cardToRow(card({ interval: 6, updatedAt: '2026-08-19T12:00:00.000Z' }), USER));
  const r = await run(db, { cards: [card({ interval: 1, updatedAt: '2026-08-19T10:00:00.000Z' })] });
  check('Fernstand übernommen', r.cards[0].interval === 6);
  check('nichts hochgeladen', r.pushedCards === 0);
}

console.log('\n6) Lokal neuer: gewinnt und wird hochgeladen');
{
  const db = makeDb();
  db.cards.push(cardToRow(card({ interval: 1, updatedAt: '2026-08-19T10:00:00.000Z' }), USER));
  const r = await run(db, { cards: [card({ interval: 6, updatedAt: '2026-08-19T12:00:00.000Z' })] });
  check('lokal gewinnt', r.cards[0].interval === 6);
  check('hochgeladen', r.pushedCards === 1);
  check('Datenbank aktualisiert', db.cards[0].data.interval === 6);
}

console.log('\n7) Löschung setzt sich durch und kommt nicht zurück');
{
  const db = makeDb();
  // Gerät A hat gelöscht und hochgeladen
  db.cards.push(cardToRow(card({ deleted: true, updatedAt: '2026-08-19T12:00:00.000Z' }), USER));
  // Gerät B kennt die Karte noch als lebendig
  const r = await run(db, { cards: [card({ updatedAt: '2026-08-19T10:00:00.000Z' })] });
  check('Karte ist als gelöscht markiert', r.cards[0].deleted === true);
  check('nichts hochgeladen (Löschung war neuer)', r.pushedCards === 0);
}

console.log('\n8) KRITISCH: kein Dauer-Hochladen bei identischem Stand');
{
  const db = makeDb();
  const local = [card({ id: 'a' }), card({ id: 'b' })];
  const first = await run(db, { cards: local, prefsUpdatedAt: null });
  db.__writes.length = 0;
  const second = await run(db, { cards: first.cards, prefsUpdatedAt: first.prefsUpdatedAt });
  check('zweiter Abgleich lädt nichts hoch', second.pushedCards === 0);
  check('gar keine Schreibvorgänge mehr', db.__writes.length === 0);
}

console.log('\n9) Gleichstand nach Migration: Fortschritt wird hochgeladen');
{
  const db = makeDb();
  // Fern: dieselbe Altkarte ohne Fortschritt, gleicher abgeleiteter Zeitstempel
  db.cards.push(cardToRow(card({ totalReviews: 0, updatedAt: '2026-08-19T00:00:00.000Z' }), USER));
  const r = await run(db, { cards: [card({ totalReviews: 5, updatedAt: '2026-08-19T00:00:00.000Z' })] });
  check('Fortschritt gewinnt', r.cards[0].totalReviews === 5);
  check('und wird hochgeladen', r.pushedCards === 1);
  check('Datenbank hat den Fortschritt', db.cards[0].data.totalReviews === 5);
}

console.log('\n10) Lernaktivität: eigene Zeile schreiben, fremde summieren');
{
  const db = makeDb();
  const today = new Date().toISOString().slice(0, 10);
  // Zwei andere Geraete haben heute ebenfalls gelernt
  db.activity.push({ user_id: USER, device_id: 'geraet-B', day: today, count: 2 });
  db.activity.push({ user_id: USER, device_id: 'geraet-C', day: today, count: 4 });
  const r = await run(db, { activityLocal: { [today]: 3 } });
  check('fremde Geräte summiert (2+4)', r.activityRemote[today] === 6);
  check('eigener Wert steckt NICHT in activityRemote', r.activityRemote[today] !== 9);
  const own = db.activity.filter(a => a.device_id === DEV);
  check('eigene Zeile geschrieben', own.length >= 1);
  check('eigener Zählerstand unverfälscht', own.find(a => a.day === today)?.count === 3);
  const foreign = db.activity.find(a => a.device_id === 'geraet-B');
  check('fremde Zeile unangetastet', foreign.count === 2);
}

console.log('\n11) Fehler beim Holen: lokaler Stand bleibt unberührt');
{
  const failing = { from: () => ({
    select: () => failing.from(), neq: () => failing.from(),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (res) => Promise.resolve({ data: null, error: { message: 'Netz weg' } }).then(res),
  }) };
  const r = await syncOnce({
    client: failing, userId: USER, deviceId: DEV,
    cards: [card()], activityLocal: {}, flipped: false, prefsUpdatedAt: null,
  });
  check('meldet Fehler', r.ok === false);
  check('Fehlermeldung durchgereicht', r.error.message === 'Netz weg');
  check('keine Karten zurückgegeben', r.cards === undefined);
}

console.log('\n12) Postgres-Zeitstempel aus der Datenbank kollidiert nicht');
{
  const db = makeDb();
  // So wie Postgres es zurückgibt
  const row = cardToRow(card({ updatedAt: '2026-08-19T10:00:00.000Z' }), USER);
  row.updated_at = '2026-08-19T10:00:00+00:00';
  db.cards.push(row);
  const r = await run(db, { cards: [card({ updatedAt: '2026-08-19T10:00:00.000Z' })] });
  check('als Gleichstand erkannt, kein Hochladen', r.pushedCards === 0);
}

console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
