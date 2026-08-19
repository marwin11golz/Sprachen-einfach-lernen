const { chromium } = require('playwright');
// Chromium-Pfad ist konfigurierbar: In manchen Umgebungen liegt ein fertiger
// Browser bereit, sonst nimmt Playwright den selbst installierten.
function launchOptions() {
  return process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
}

const BASE = process.env.BASE || 'http://127.0.0.1:4173/';

let fail = 0;
const check = (n, c) => { console.log(c ? '  OK   ' + n : '  FEHLER ' + n); if (!c) fail++; };

(async () => {
  const browser = await chromium.launch({ ...launchOptions() });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(BASE);
  await page.waitForSelector('text=Lucy lernt Sprachen');

  console.log('\n1) Manifest');
  const manifestHref = await page.getAttribute('link[rel="manifest"]', 'href');
  check('Manifest verlinkt', !!manifestHref);
  const manifest = await page.evaluate(async (href) => (await fetch(href)).json(), manifestHref);
  check('Name gesetzt', manifest.name === 'Lucy lernt Sprachen');
  check('Kurzname gesetzt', manifest.short_name === 'Sprachen');
  check('display standalone', manifest.display === 'standalone');
  check('Designfarbe', manifest.theme_color === '#1F5C4D');
  check('192er Symbol', manifest.icons.some(i => i.sizes === '192x192'));
  check('512er Symbol', manifest.icons.some(i => i.sizes === '512x512' && !i.purpose));
  check('maskierbares Symbol', manifest.icons.some(i => i.purpose === 'maskable'));

  console.log('\n2) Symbole wirklich erreichbar');
  for (const icon of manifest.icons) {
    const url = new URL(icon.src, BASE).href;
    const st = await page.evaluate(async (u) => (await fetch(u)).status, url);
    check(`${icon.src} lädt (${st})`, st === 200);
  }
  const appleStatus = await page.evaluate(async (u) => (await fetch(u)).status, new URL('/icons/apple-touch-icon-180.png', BASE).href);
  check('apple-touch-icon lädt', appleStatus === 200);

  console.log('\n3) iOS-Angaben in index.html');
  const capable = await page.getAttribute('meta[name="apple-mobile-web-app-capable"]', 'content');
  check('apple-mobile-web-app-capable=yes', capable === 'yes');
  const title = await page.getAttribute('meta[name="apple-mobile-web-app-title"]', 'content');
  check('App-Titel gesetzt', title === 'Sprachen');
  const appleIcon = await page.getAttribute('link[rel="apple-touch-icon"]', 'href');
  check('apple-touch-icon verlinkt', !!appleIcon);

  console.log('\n4) Service Worker');
  await page.waitForTimeout(2500);
  const swState = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return 'keine Registrierung';
    return reg.active ? 'aktiv' : (reg.installing ? 'installiert gerade' : 'wartet');
  });
  check('Service Worker aktiv (' + swState + ')', swState === 'aktiv');

  console.log('\n5) Offline nutzbar');
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForTimeout(1200);
  const offlineBody = await page.textContent('body').catch(() => '');
  check('App lädt ohne Netz', offlineBody.includes('Lucy lernt Sprachen'));
  check('Dashboard bedienbar', offlineBody.includes('Fällig heute'));
  await ctx.setOffline(false);

  console.log('\nSeitenfehler:', errors.length ? errors : 'keine');
  await browser.close();
  console.log(fail ? `\n${fail} FEHLER` : '\nAlles bestanden');
  process.exit(fail ? 1 : 0);
})();
