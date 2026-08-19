const { chromium } = require('playwright');
// Chromium-Pfad ist konfigurierbar: In manchen Umgebungen liegt ein fertiger
// Browser bereit, sonst nimmt Playwright den selbst installierten.
function launchOptions() {
  return process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
}

const BASE = process.env.BASE || 'http://127.0.0.1:5175/';
const MODE = process.env.MODE || 'mit';   // 'mit' = Zugangsdaten gesetzt, 'ohne' = nicht gesetzt

let fail = 0;
const check = (n, c) => { console.log(c ? '  OK   ' + n : '  FEHLER ' + n); if (!c) fail++; };

(async () => {
  const browser = await chromium.launch({ ...launchOptions() });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  await page.goto(BASE);
  await page.waitForSelector('text=Lucy lernt Sprachen', { timeout: 15000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('text=Lucy lernt Sprachen');
  await page.waitForTimeout(800);

  console.log(`\n=== Modus: ${MODE === 'mit' ? 'mit Zugangsdaten' : 'OHNE Zugangsdaten'} ===`);

  console.log('\n1) App startet und ist bedienbar');
  let body = await page.textContent('body');
  check('Dashboard sichtbar', body.includes('Fällig heute'));
  check('Statusabzeichen in der Kopfzeile', /lokal|nicht angemeldet|gleicht ab|abgeglichen|offline|Fehler/.test(body));

  console.log('\n2) Kernfunktion unabhängig von der Cloud');
  await page.getByRole('button', { name: 'Hinzufügen' }).first().click();
  await page.locator('textarea').fill('casa = Haus\nperro = Hund');
  await page.getByRole('button', { name: 'Hinzufügen', exact: true }).last().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Karten' }).click();
  await page.waitForTimeout(400);
  body = await page.textContent('body');
  check('Vokabeln angelegt', body.includes('casa') && body.includes('perro'));

  await page.reload();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: 'Karten' }).click();
  await page.waitForTimeout(300);
  body = await page.textContent('body');
  check('nach Reload noch da', body.includes('casa'));

  console.log('\n3) Konto-Ansicht');
  await page.locator('button', { hasText: /lokal|nicht angemeldet|gleicht ab|abgeglichen|offline|Fehler/ }).first().click();
  await page.waitForTimeout(500);
  body = await page.textContent('body');

  if (MODE === 'ohne') {
    check('Hinweis statt totem Formular', body.includes('Abgleich nicht eingerichtet'));
    check('kein Anmeldeformular', (await page.locator('input[type="email"]').count()) === 0);
  } else {
    check('Anmeldeformular vorhanden', (await page.locator('input[type="email"]').count()) === 1);
    check('Passwortfeld vorhanden', (await page.locator('input[type="password"]').count()) === 1);
    check('Hinweis auf lokalen Betrieb', body.includes('Ohne Anmeldung'));

    console.log('\n4) Anmeldung ohne Netz -> verständliche Meldung, kein Absturz');
    await page.locator('input[type="email"]').fill('test@example.com');
    await page.locator('input[type="password"]').fill('geheim123');
    await page.getByRole('button', { name: /Anmelden$/ }).first().click();
    await page.waitForTimeout(6000);
    body = await page.textContent('body');
    check('Fehlermeldung auf Deutsch', /Keine Verbindung|stimmt nicht|Unbekannter Fehler|Fehler/.test(body));
    check('App weiterhin bedienbar', body.includes('Zurück'));
  }

  console.log('\n5) Zurück zur App, Daten unversehrt');
  await page.getByRole('button', { name: 'Zurück' }).first().click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Karten' }).click();
  await page.waitForTimeout(300);
  body = await page.textContent('body');
  check('Vokabeln unverändert vorhanden', body.includes('casa') && body.includes('perro'));

  const store = await page.evaluate(() => JSON.parse(localStorage.getItem('lucy-lernt-sprachen-vocab-data')));
  check('keine Karte verloren', store.cards.length === 2);
  check('Zeitstempel vorhanden', store.cards.every(c => !!c.updatedAt));

  const realErrors = errors.filter(e => !/Failed to fetch|NetworkError|Load failed/i.test(e));
  console.log('\nSeitenfehler (ohne Netzfehler):', realErrors.length ? realErrors : 'keine');
  if (realErrors.length) fail++;

  await browser.close();
  console.log(fail ? `\n${fail} FEHLER` : '\nAlles bestanden');
  process.exit(fail ? 1 : 0);
})();
