// Prüft die Zusammenführ-Regeln ohne Browser.
import { mergeCards, combinedActivity, purgeOldTombstones } from '../src/lib/merge.js';
import { migrateCard } from '../src/lib/storage.js';

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log('  OK  ', name); } else { fail++; console.log('  FEHLER', name); } };

const base = (over = {}) => ({
  id: 'a', type: 'vocab', front: 'casa', back: 'Haus', ease: 2.5, interval: 0,
  repetitions: 0, dueDate: '2026-08-19', createdAt: '2026-08-01',
  lastReviewed: null, totalReviews: 0, correct: 0, wrong: 0,
  updatedAt: '2026-08-19T10:00:00.000Z', deleted: false, ...over,
});

console.log('\n1) Jüngerer Zeitstempel gewinnt');
{
  const local = base({ interval: 1, updatedAt: '2026-08-19T10:00:00.000Z' });
  const remote = base({ interval: 6, updatedAt: '2026-08-19T12:00:00.000Z' });
  check('Fernstand gewinnt', mergeCards([local], [remote])[0].interval === 6);
  check('Lokal gewinnt umgekehrt', mergeCards([remote], [local])[0].interval === 6);
}

console.log('\n2) Verschiedene ids werden vereinigt');
{
  const a = base({ id: 'a' }), b = base({ id: 'b' });
  check('beide behalten', mergeCards([a], [b]).length === 2);
}

console.log('\n3) Löschung setzt sich durch');
{
  const local = base({ updatedAt: '2026-08-19T10:00:00.000Z' });
  const remoteDeleted = base({ deleted: true, updatedAt: '2026-08-19T11:00:00.000Z' });
  check('Grabstein gewinnt', mergeCards([local], [remoteDeleted])[0].deleted === true);
}

console.log('\n4) KRITISCH: Gleichstand nach Migration verliert keinen Fortschritt');
{
  // Beide Geräte haben dieselbe Altkarte. Gerät A hat sie 5x wiederholt,
  // Gerät B gar nicht. Beide leiten denselben Zeitstempel ab.
  const legacyA = { id: 'x', front: 'casa', back: 'Haus', ease: 2.5, interval: 6,
    repetitions: 2, dueDate: '2026-08-25', createdAt: '2026-08-01',
    lastReviewed: '2026-08-19', totalReviews: 5, correct: 5, wrong: 0 };
  const legacyB = { ...legacyA, interval: 0, repetitions: 0, totalReviews: 0, correct: 0, lastReviewed: '2026-08-19' };

  const a = migrateCard(legacyA), b = migrateCard(legacyB);
  check('gleicher abgeleiteter Zeitstempel', a.updatedAt === b.updatedAt);
  check('Zeitstempel abgeleitet, nicht "jetzt"', a.updatedAt === '2026-08-19T00:00:00.000Z');
  check('Fortschritt gewinnt (A als Fernstand)', mergeCards([b], [a])[0].totalReviews === 5);
  check('Fortschritt gewinnt (A als lokal)', mergeCards([a], [b])[0].totalReviews === 5);
}

console.log('\n5) Migration ohne jedes Datum');
{
  const c = migrateCard({ id: 'y', front: 'a', back: 'b' });
  check('Notfall-Zeitstempel', c.updatedAt === '1970-01-01T00:00:00.000Z');
  check('deleted ergänzt', c.deleted === false);
  check('type ergänzt', c.type === 'vocab');
}

console.log('\n6) Lernaktivität wird summiert, nicht überschrieben');
{
  const merged = combinedActivity({ '2026-08-19': 3 }, { '2026-08-19': 2, '2026-08-18': 4 });
  check('gleicher Tag summiert', merged['2026-08-19'] === 5);
  check('fremder Tag übernommen', merged['2026-08-18'] === 4);
}

console.log('\n7) Alte Grabsteine werden entsorgt, junge bleiben');
{
  const old = base({ id: 'old', deleted: true, updatedAt: '2020-01-01T00:00:00.000Z' });
  const fresh = base({ id: 'fresh', deleted: true, updatedAt: new Date().toISOString() });
  const live = base({ id: 'live' });
  const out = purgeOldTombstones([old, fresh, live]);
  check('alter Grabstein weg', !out.find(c => c.id === 'old'));
  check('junger Grabstein bleibt', !!out.find(c => c.id === 'fresh'));
  check('lebende Karte bleibt', !!out.find(c => c.id === 'live'));
}

console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
process.exit(fail ? 1 : 0);
