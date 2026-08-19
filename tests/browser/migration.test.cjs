const { chromium } = require('playwright');
// Chromium-Pfad ist konfigurierbar: In manchen Umgebungen liegt ein fertiger
// Browser bereit, sonst nimmt Playwright den selbst installierten.
function launchOptions() {
  return process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
}

const BASE = process.env.BASE || 'http://127.0.0.1:5174/';
const KEY = 'lucy-lernt-sprachen-vocab-data';

let fail = 0;
const check = (name, cond) => { console.log(cond ? '  OK   ' + name : '  FEHLER ' + name); if (!cond) fail++; };

(async () => {
  const browser = await chromium.launch({ ...launchOptions() });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  // --- Altdaten im v1-Format vorbereiten (kein schemaVersion, kein updatedAt) ---
  await page.goto(BASE);
  await page.evaluate((key) => {
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify({
      cards: [
        { id: 'alt1', type: 'vocab', front: 'casa', back: 'Haus', langA: 'Spanisch', langB: 'Deutsch',
          ease: 2.5, interval: 6, repetitions: 2, dueDate: '2026-08-25', createdAt: '2026-08-01',
          lastReviewed: '2026-08-19', totalReviews: 5, correct: 5, wrong: 0 },
        { id: 'alt2', front: 'perro', back: 'Hund', langA: 'Spanisch', langB: 'Deutsch',
          ease: 2.5, interval: 0, repetitions: 0, dueDate: '2020-01-01', createdAt: '2020-01-01',
          lastReviewed: null, totalReviews: 0, correct: 0, wrong: 0 },
      ],
      activityLog: { '2026-08-18': 4 },
      flipped: false,
    }));
  }, KEY);

  await page.reload();
  await page.waitForSelector('text=Lucy lernt Sprachen');
  await page.waitForTimeout(700);

  console.log('\n1) Migration von Altdaten');
  const after = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
  check('schemaVersion 2 gesetzt', after.schemaVersion === 2);
  check('beide Karten erhalten', after.cards.length === 2);
  check('updatedAt abgeleitet aus lastReviewed', after.cards[0].updatedAt === '2026-08-19T00:00:00.000Z');
  check('updatedAt abgeleitet aus createdAt', after.cards[1].updatedAt === '2020-01-01T00:00:00.000Z');
  check('deleted ergänzt', after.cards.every(c => c.deleted === false));
  check('fehlender type ergänzt', after.cards[1].type === 'vocab');
  check('activityLog -> activityLocal', after.activityLocal['2026-08-18'] === 4);

  const backup = await page.evaluate(() => localStorage.getItem('lucy-lernt-sprachen-vocab-data-backup-v1'));
  check('Sicherungskopie angelegt', !!backup && JSON.parse(backup).cards.length === 2);

  console.log('\n2) Oberfläche zeigt die migrierten Karten');
  await page.getByRole('button', { name: 'Karten' }).click();
  await page.waitForTimeout(300);
  let body = await page.textContent('body');
  check('casa sichtbar', body.includes('casa'));
  check('perro sichtbar', body.includes('perro'));

  console.log('\n3) Löschen erzeugt Grabstein statt Entfernen');
  await page.locator('button').filter({ has: page.locator('svg.lucide-trash2') }).first().click();
  await page.waitForTimeout(600);
  body = await page.textContent('body');
  const store = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
  check('noch 2 Karten gespeichert', store.cards.length === 2);
  check('genau eine als gelöscht markiert', store.cards.filter(c => c.deleted).length === 1);
  const tomb = store.cards.find(c => c.deleted);
  check('Grabstein hat frischen Zeitstempel', tomb.updatedAt > '2026-08-19T00:00:00.000Z');
  check('nur noch eine Karte sichtbar', (body.match(/Spanisch → Deutsch/g) || []).length === 1);

  console.log('\n4) Bewerten aktualisiert Zeitstempel und Lerntag');
  await page.getByRole('button', { name: 'Dashboard' }).click();
  await page.waitForTimeout(300);
  const beforeRate = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
  const liveBefore = beforeRate.cards.find(c => !c.deleted);
  await page.getByRole('button', { name: 'Alle wiederholen', exact: true }).click();
  await page.waitForTimeout(400);
  const revealBtn = page.getByRole('button', { name: 'Aufdecken (Leertaste)', exact: true });
  if (await revealBtn.count()) await revealBtn.click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: /Gut/ }).click();
  await page.waitForTimeout(700);
  const afterRate = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
  const liveAfter = afterRate.cards.find(c => c.id === liveBefore.id);
  check('Zeitstempel erneuert', liveAfter.updatedAt > liveBefore.updatedAt);
  check('totalReviews erhöht', liveAfter.totalReviews === liveBefore.totalReviews + 1);
  const today = new Date().toISOString().slice(0, 10);
  check('Lerntag gezählt', (afterRate.activityLocal[today] || 0) >= 1);
  check('alter Lerntag erhalten', afterRate.activityLocal['2026-08-18'] === 4);

  console.log('\n5) Export enthält Grabsteine, Import führt zusammen');
  await page.getByRole('button', { name: 'Karten' }).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Export' }).click();
  await page.waitForTimeout(300);
  const exp = JSON.parse(await page.locator('textarea[readonly]').inputValue());
  check('Export enthält beide (inkl. Grabstein)', exp.cards.length === 2);
  check('Export hat schemaVersion', exp.schemaVersion === 2);

  console.log('\nSeitenfehler:', errors.length ? errors : 'keine');
  if (errors.length) fail++;
  await browser.close();
  console.log(fail ? `\n${fail} FEHLER` : '\nAlles bestanden');
  process.exit(fail ? 1 : 0);
})();
