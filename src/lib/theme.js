// Farbwelt, Design-Tokens und Button-Stile. Reine Gestaltung - keine Logik.
// Wird von App.jsx und vom Anmelde-Bildschirm gemeinsam genutzt.

export function hexToRgba(hex, alpha) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map(x => x + x).join('');
  // Achtstellige Werte tragen ihr eigenes Alpha. Ungekuerzt wanderte es in die
  // Bit-Verschiebung und lieferte eine voellig andere Farbe - die Palette hatte
  // schon einmal einen solchen Wert.
  if (h.length === 8) h = h.slice(0, 6);
  const bigint = parseInt(h, 16);
  const r = (bigint >> 16) & 255, g = (bigint >> 8) & 255, b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

// ---------- Raster ----------
// Feste Stufen statt Ad-hoc-Werten - macht Abstand/Rundung/Schriftgröße
// überall im Code vorhersehbar statt an jeder Stelle neu erfunden.
// xxxl traegt den Abstand zwischen zwei Abschnitten. Seit die Bereiche nicht mehr
// in eigenen Kaesten liegen, ist der Abstand das Einzige, was sie trennt - dafuer
// reichten die bis 32 laufenden Stufen nicht aus.
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };
export const RADIUS = { sm: 6, md: 8, lg: 12, pill: 999 };
export const FONT = { xs: 11, sm: 12, base: 13, md: 14, lg: 16, xl: 18, xxl: 22, hero: 32 };

// Platzbedarf der schwebenden unteren Navigation (Pillenhoehe + Abstand zum
// Bildschirmrand). Der Inhalt braucht unten genau so viel Luft, damit die
// Navigation nichts verdeckt - deshalb an einer Stelle definiert.
export const NAVBAR_H = 84;

// ---------- Farbsystem ----------
// Jede Farbe hat eine Rolle, und der Name sagt sie. Wer einen Ton braucht, sucht
// die Rolle - nicht einen Farbnamen, der zufaellig passt. Genau daran ist die
// Vorgaengerpalette gescheitert: "gold" trug gleichzeitig die Warnung und die
// Kategorie der Satzkarten, und drei Toene waren gar nicht mehr in Gebrauch.
//
// Beide Designs fuehren dieselben Schluessel - fehlt einer, ergibt der Zugriff
// still `undefined` und die Farbe verschwindet, ohne dass der Build etwas merkt.
//
//   background       Seitengrund
//   surface          ruhige Flaeche darauf
//   surfaceElevated  abgehobene Flaeche (Lernkarte, schwebende Navigation)
//   primary          Hauptaktion, aktiver Zustand, Fortschritt
//   primarySoft      getoente Flaeche dazu
//   primaryInk       Schrift AUF primary
//   textPrimary/-Secondary/-Muted   drei Stufen Lesbarkeit
//   border           Rand von Eingabefeldern und Knoepfen
//   hairline         Trennlinie zwischen Zeilen und Abschnitten
//   success/warning/error (+ …Soft)  Rueckmeldung
//
// Gruen bleibt der Hauptaktion, dem aktiven Zustand, dem Fortschritt und dem
// Erfolg vorbehalten. Kategorien werden ueber ihr Symbol unterschieden, nicht
// ueber einen eigenen Farbton.
export const THEMES = {
  light: {
    background: '#F5F7F5', surface: '#FBFCFB', surfaceElevated: '#FFFFFF',
    textPrimary: '#111714', textSecondary: '#5C665F', textMuted: '#838D86',
    // border traegt die Raender von Eingabefeldern und Knoepfen - dort ist ein
    // sichtbarer Rand eine Bedienhilfe. hairline traegt Trennlinien zwischen
    // Zeilen und Abschnitten und ist deutlich schwaecher.
    border: '#DFE5E0', hairline: '#ECEFEA',
    // Im hellen Design bestimmt nicht der Seitengrund die noetige Tiefe, sondern
    // die weiche Flaeche der Bewertungsknoepfe: darauf steht die Beschriftung im
    // selben Ton. Diese Werte tragen beides - weisse Schrift auf der vollen
    // Flaeche und der eigene Ton auf der weichen.
    primary: '#0A7550', primarySoft: '#D2EDE0', primaryInk: '#FFFFFF',
    success: '#107650', successSoft: '#E1F2E9',
    warning: '#946226', warningSoft: '#F9EFDB',
    error: '#B2384A', errorSoft: '#FBE5E8',
    shadowLift: '0 2px 8px rgba(18,28,22,.08)',
  },
  dark: {
    background: '#080B0A', surface: '#0F1412', surfaceElevated: '#151B18',
    textPrimary: '#E8EDEA', textSecondary: '#8E9A94', textMuted: '#626D67',
    border: '#212B25', hairline: '#171E1A',
    // Der helle Gruenton traegt keine weisse Schrift - darauf gehoert dunkle,
    // sonst ist der Hauptknopf kaum lesbar. Dafuer ist primaryInk da.
    primary: '#34D399', primarySoft: '#15362A', primaryInk: '#04140D',
    success: '#2FBF88', successSoft: '#0E2419',
    warning: '#E0A94F', warningSoft: '#2A2113',
    error: '#E5707C', errorSoft: '#2A1518',
    shadowLift: '0 2px 8px rgba(0,0,0,.35)',
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
    background: T.primary, color: T.primaryInk, border: 'none', borderRadius: RADIUS.pill,
    fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
    justifyContent: 'center', gap: 8, transition: 'filter .15s, transform .1s',
    ...BTN_SIZES[size],
  };
}
export function btnSecondary(T, size = 'md') {
  return {
    background: T.surfaceElevated, color: T.textPrimary, border: `1px solid ${T.border}`, borderRadius: RADIUS.pill,
    fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
    justifyContent: 'center', gap: 8, transition: 'border-color .15s, transform .1s',
    ...BTN_SIZES[size],
  };
}
// Text-/Link-Buttons ohne Fläche - für sekundäre Aktionen wie "Schließen"
// oder "alle wiederholen", die bisher an jeder Stelle einzeln inline gebaut wurden.
export function btnGhost(T, size = 'md') {
  return {
    background: 'none', border: 'none', color: T.textSecondary, cursor: 'pointer', padding: 0,
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

// Abgesetzte Flaeche fuer die wenigen Stellen, an denen eine Karte wirklich eine
// Karte ist - allen voran die Lernkarte. Flach traegt sie nur noch eine Haarlinie
// und keinen Schatten mehr: zwei Mittel fuer dieselbe Abgrenzung sind eines zu viel.
export function surface(T, { lift = false } = {}) {
  return {
    background: T.surfaceElevated, border: `1px solid ${T.hairline}`, borderRadius: RADIUS.lg,
    ...(lift ? { boxShadow: T.shadowLift } : null),
  };
}

// Flaeche ganz ohne Rand - hebt sich allein durch den Untergrund ab. Fuer Bereiche,
// die eingeblendet werden und deshalb Abgrenzung brauchen, ohne als Kasten zu wirken.
// Nimmt die mittlere Ebene: abgehoben ist nur, was wirklich obenauf liegt.
// (Die Funktion surface() oben und das Token T.surface sind zweierlei - jene baut
// eine Karte, dieses ist die Farbe der ruhigen Flaeche.)
export function surfaceSoft(T) {
  return { background: T.surface, borderRadius: RADIUS.lg };
}

// Trennlinie zwischen zwei Zeilen einer Liste. Ersetzt die Kaesten um jede einzelne
// Zeile: eine Liste ist ein Block mit Linien darin, nicht ein Stapel von Karten.
export function divider(T) {
  return { borderTop: `1px solid ${T.hairline}` };
}

// ---------- Typography System ----------
// Konsistente Hierarchie für alle UI-Elemente: Display, H1, H2, Body, Secondary, Caption
// Ohne diese Funktionen: keine Exceptions mehr, immer über diese Utilities

export function typoDisplay() {
  return {
    fontSize: FONT.hero,
    fontWeight: 600,
    lineHeight: 1.2,
    letterSpacing: '-0.02em',
  };
}

export function typoH1() {
  return {
    fontSize: FONT.xxl,
    fontWeight: 600,
    lineHeight: 1.25,
    letterSpacing: '-0.01em',
  };
}

export function typoH2() {
  return {
    fontSize: FONT.xl,
    fontWeight: 600,
    lineHeight: 1.3,
    letterSpacing: '-0.01em',
  };
}

export function typoBody(size = 'md') {
  const lineHeight = size === 'lg' ? 1.6 : 1.5;
  return {
    fontSize: FONT[size],
    fontWeight: 400,
    lineHeight,
    letterSpacing: 0,
  };
}

export function typoSecondary(size = 'base') {
  return {
    fontSize: FONT[size],
    fontWeight: 500,
    lineHeight: 1.4,
    letterSpacing: 0,
  };
}

export function typoCaption() {
  return {
    fontSize: FONT.xs,
    fontWeight: 500,
    lineHeight: 1.2,
    letterSpacing: 0,
  };
}

// Kennzahlen in Mono (Faellig-Ring, Statistik-Kacheln, Heatmap-Summe). Eigene
// Rolle, weil Ziffern immer einzeilig stehen: Zeilenhoehe 1 haelt sie eng am
// Beschriftungstext darunter, und ein negativer Buchstabenabstand wie bei den
// Ueberschriften wuerde die tabellarischen Ziffern zusammenschieben.
export function typoNumber(size = 'xxl') {
  return {
    fontSize: FONT[size],
    fontWeight: 600,
    lineHeight: 1,
    letterSpacing: 0,
  };
}
