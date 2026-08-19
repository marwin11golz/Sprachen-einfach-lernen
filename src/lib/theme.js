// Farbwelt und Button-Stile. Reine Gestaltung - keine Logik.
// Wird von App.jsx und vom Anmelde-Bildschirm gemeinsam genutzt.

export function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '');
  const bigint = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h, 16);
  const r = (bigint >> 16) & 255, g = (bigint >> 8) & 255, b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

// ---------- Sprachpass-Farbwelt ----------
export const THEMES = {
  light: {
    bg: '#F1F2ED', bgElev: '#FFFFFF', ink: '#161C18', inkSoft: '#666F67',
    border: '#DDE2D8', accent: '#1F5C4D', accentSoft: '#E1EEE8',
    gold: '#B8863B', goldSoft: '#F7EEDC',
    blue: '#33517A', blueSoft: '#E4EAF2',
    danger: '#A23B4C', dangerSoft: '#F6E3E6',
    success: '#2E7D5B', successSoft: '#E0F0E7',
    shadow: '0 1px 2px rgba(20,30,20,.05), 0 10px 28px rgba(20,30,20,.06)',
  },
  dark: {
    bg: '#0F1310', bgElev: '#171D17', ink: '#EBEEE7', inkSoft: '#8D968B',
    border: '#262E24', accent: '#4FAF8E', accentSoft: '#17322A',
    gold: '#D9A75C', goldSoft: '#2C2210',
    blue: '#7C9BC7', blueSoft: '#1C2634',
    danger: '#E28A96', dangerSoft: '#341A1E',
    success: '#57C08C', successSoft: '#12291F',
    shadow: '0 1px 2px rgba(0,0,0,.35), 0 10px 28px rgba(0,0,0,.35)',
  },
};

export function btnPrimary(T) {
  return { background: T.accent, color: '#fff', border: 'none', padding: '11px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' };
}
export function btnSecondary(T) {
  return { background: T.bgElev, color: T.ink, border: `1px solid ${T.border}`, padding: '11px 20px', borderRadius: 10, fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' };
}
export function ratingBtn(color, bg) {
  return { background: bg, color, border: 'none', borderRadius: 10, padding: '10px 4px', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 };
}
