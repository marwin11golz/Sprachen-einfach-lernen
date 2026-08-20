// Farbwelt, Design-Tokens und Button-Stile. Reine Gestaltung - keine Logik.
// Wird von App.jsx und vom Anmelde-Bildschirm gemeinsam genutzt.

export function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const bigint = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h, 16);
  const r = (bigint >> 16) & 255, g = (bigint >> 8) & 255, b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

// ---------- Raster ----------
// Feste Stufen statt Ad-hoc-Werten - macht Abstand/Rundung/Schriftgröße
// überall im Code vorhersehbar statt an jeder Stelle neu erfunden.
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const RADIUS = { sm: 6, md: 10, lg: 16, pill: 999 };
export const FONT = { xs: 11, sm: 12, base: 13, md: 14, lg: 16, xl: 20, xxl: 26, hero: 44 };

// Platzbedarf der schwebenden unteren Navigation (Pillenhoehe + Abstand zum
// Bildschirmrand). Der Inhalt braucht unten genau so viel Luft, damit die
// Navigation nichts verdeckt - deshalb an einer Stelle definiert.
export const NAVBAR_H = 84;

// ---------- Sprachpass-Farbwelt ----------
export const THEMES = {
  light: {
    bg: '#F4F6F3', bgElev: '#FFFFFF', ink: '#131815', inkSoft: '#69736C',
    border: '#E2E7DF', accent: '#0F7A5A', accentSoft: '#E2F2EA', accentInk: '#FFFFFF',
    accentDeep: '#0A5F46',
    gold: '#B07C2C', goldSoft: '#FBF0DC',
    blue: '#2F5488', blueSoft: '#E7EDF6',
    danger: '#B23A4B', dangerSoft: '#FBE6E9',
    success: '#1F8A5F', successSoft: '#E2F3EA',
    heatEmpty: '#E7EBE5',
    shadow: '0 1px 2px rgba(18,28,22,.05)',
    // Erhabene Flaechen, die sich vom Untergrund abheben sollen (Hero, Lernkarte).
    shadowLift: '0 2px 4px rgba(18,28,22,.05), 0 12px 32px rgba(18,28,22,.08)',
  },
  dark: {
    bg: '#0D110F', bgElev: '#161C19', ink: '#ECEFEA', inkSoft: '#8F9992',
    // Der helle Akzent im dunklen Design traegt weissen Text nicht - darauf
    // gehoert dunkle Schrift, sonst ist der Hauptknopf kaum lesbar.
    border: '#253029', accent: '#3FC08D', accentSoft: '#15332690', accentInk: '#08120D',
    accentDeep: '#63D6A6',
    gold: '#DDA95C', goldSoft: '#2E2411',
    blue: '#7FA0CC', blueSoft: '#1B2735',
    danger: '#E68C98', dangerSoft: '#37191E',
    success: '#4FC792', successSoft: '#102A1F',
    heatEmpty: '#1C231E',
    shadow: '0 1px 2px rgba(0,0,0,.4)',
    shadowLift: '0 2px 4px rgba(0,0,0,.4), 0 12px 32px rgba(0,0,0,.45)',
  },
};

// "lg" ist die Groesse fuer die eine Hauptaktion eines Bildschirms - am Handy
// gross genug, um sie ohne Zielen zu treffen.
const BTN_SIZES = {
  sm: { padding: '7px 12px', fontSize: FONT.sm },
  md: { padding: '11px 18px', fontSize: FONT.md },
  lg: { padding: '15px 24px', fontSize: FONT.lg },
};

export function btnPrimary(T, size = 'md') {
  return {
    background: T.accent, color: T.accentInk, border: 'none', borderRadius: RADIUS.pill,
    fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
    justifyContent: 'center', gap: 8, transition: 'filter .15s, transform .1s',
    ...BTN_SIZES[size],
  };
}
export function btnSecondary(T, size = 'md') {
  return {
    background: T.bgElev, color: T.ink, border: `1px solid ${T.border}`, borderRadius: RADIUS.pill,
    fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
    justifyContent: 'center', gap: 8, transition: 'border-color .15s, transform .1s',
    ...BTN_SIZES[size],
  };
}
// Text-/Link-Buttons ohne Fläche - für sekundäre Aktionen wie "Schließen"
// oder "alle wiederholen", die bisher an jeder Stelle einzeln inline gebaut wurden.
export function btnGhost(T, size = 'md') {
  return {
    background: 'none', border: 'none', color: T.inkSoft, cursor: 'pointer', padding: 0,
    fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 4,
    fontSize: size === 'sm' ? FONT.xs : FONT.sm,
  };
}
export function ratingBtn(color, bg) {
  return {
    background: bg, color, border: 'none', borderRadius: RADIUS.md, padding: '14px 4px',
    fontSize: FONT.md, fontWeight: 600, cursor: 'pointer', display: 'flex',
    flexDirection: 'column', alignItems: 'center', gap: 3, transition: 'transform .1s',
  };
}

// Wiederkehrendes Flaechen-Rezept, das bisher an ueber einem Dutzend Stellen
// wortgleich ausgeschrieben stand.
export function surface(T, { lift = false } = {}) {
  return {
    background: T.bgElev, border: `1px solid ${T.border}`, borderRadius: RADIUS.lg,
    boxShadow: lift ? T.shadowLift : T.shadow,
  };
}
