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
export const RADIUS = { sm: 6, md: 8, lg: 12 };
export const FONT = { xs: 11, sm: 12, base: 13, md: 14, lg: 16, xl: 18, xxl: 22 };

// ---------- Sprachpass-Farbwelt ----------
export const THEMES = {
  light: {
    bg: '#F1F2ED', bgElev: '#FFFFFF', ink: '#161C18', inkSoft: '#666F67',
    border: '#DDE2D8', accent: '#1F5C4D', accentSoft: '#E1EEE8', accentInk: '#FFFFFF',
    gold: '#B8863B', goldSoft: '#F7EEDC',
    blue: '#33517A', blueSoft: '#E4EAF2',
    danger: '#A23B4C', dangerSoft: '#F6E3E6',
    success: '#2E7D5B', successSoft: '#E0F0E7',
    heatEmpty: '#E7EAE2',
    shadow: '0 1px 2px rgba(20,30,20,.05)',
  },
  dark: {
    bg: '#0F1310', bgElev: '#171D17', ink: '#EBEEE7', inkSoft: '#8D968B',
    // Der helle Akzent im dunklen Design traegt weissen Text nicht - darauf
    // gehoert dunkle Schrift, sonst ist der Hauptknopf kaum lesbar.
    border: '#262E24', accent: '#4FAF8E', accentSoft: '#17322A', accentInk: '#0F1310',
    gold: '#D9A75C', goldSoft: '#2C2210',
    blue: '#7C9BC7', blueSoft: '#1C2634',
    danger: '#E28A96', dangerSoft: '#341A1E',
    success: '#57C08C', successSoft: '#12291F',
    heatEmpty: '#1D231B',
    shadow: '0 1px 2px rgba(0,0,0,.35)',
  },
};

const BTN_SIZES = {
  sm: { padding: '7px 12px', fontSize: FONT.sm },
  md: { padding: '10px 18px', fontSize: FONT.base },
};

export function btnPrimary(T, size = 'md') {
  return {
    background: T.accent, color: T.accentInk, border: 'none', borderRadius: RADIUS.md,
    fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
    ...BTN_SIZES[size],
  };
}
export function btnSecondary(T, size = 'md') {
  return {
    background: T.bgElev, color: T.ink, border: `1px solid ${T.border}`, borderRadius: RADIUS.md,
    fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
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
  return { background: bg, color, border: 'none', borderRadius: RADIUS.md, padding: '10px 4px', fontSize: FONT.base, fontWeight: 600, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 };
}
