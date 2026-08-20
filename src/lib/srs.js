// Lernlogik ("Spaced Repetition") und Kartenerzeugung.
//
// Dies ist die maßgebliche Fassung des FSRS-Algorithmus (siehe fsrs.js). Die
// Spanischcoach-Skill (.claude/skills/spanischcoach/scripts/vocab.js)
// dupliziert rate() bewusst, weil sie als abhängigkeitsfreies Node-Script
// ohne Build-Schritt laufen muss - Änderungen hier müssen dort mitgezogen
// werden (siehe CLAUDE.md).

import {
  RATING, initialStability, initialDifficulty, nextDifficulty,
  retrievability, nextStabilityRecall, nextStabilityForget, shortTermStability,
  nextInterval, STABILITY_MIN,
} from './fsrs.js';

export const todayISO = () => new Date().toISOString().slice(0, 10);
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// Einmaliges Impfen von stability/difficulty für Karten aus der Zeit vor
// FSRS: Das zuletzt gewählte Intervall IST bereits eine Schätzung, wie
// viele Tage die Erinnerung trägt - genau das, was FSRS Stabilität nennt.
// Der Ease-Faktor (1,3-3,0, höher = leichter) bildet sich linear umgekehrt
// auf die Schwierigkeit (1-10, höher = schwerer) ab. Fälligkeitsdaten werden
// dabei NICHT angefasst - direkt danach läuft die normale FSRS-Aktualisierung
// mit den echten verstrichenen Tagen weiter, keine Karte springt.
function seedFromLegacy(card) {
  const interval = card.interval > 0 ? card.interval : 0.5;
  const ease = Math.min(3.0, Math.max(1.3, card.ease ?? 2.5));
  const difficulty = Math.min(10, Math.max(1, 1 + ((3.0 - ease) / 1.7) * 9));
  return { stability: Math.max(interval, STABILITY_MIN), difficulty };
}

// ---------- FSRS-Kern ----------
export function rate(card, rating) {
  const c = { ...card };
  const r = RATING[rating];
  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);

  if (c.stability == null && c.totalReviews > 0) {
    const seeded = seedFromLegacy(c);
    c.stability = seeded.stability;
    c.difficulty = seeded.difficulty;
  }

  if (c.stability == null) {
    // Echt neue Karte, noch nie bewertet.
    c.stability = initialStability(r);
    c.difficulty = initialDifficulty(r);
  } else {
    const elapsed = c.lastReviewed
      ? Math.max(0, Math.round((today - new Date(`${c.lastReviewed}T00:00:00.000Z`)) / 86400000))
      : 0;
    const difficulty = nextDifficulty(c.difficulty, r);
    let stability;
    if (elapsed === 0) {
      stability = shortTermStability(c.stability, r);
    } else {
      const R = retrievability(elapsed, c.stability);
      stability = rating === 'again'
        ? nextStabilityForget(c.difficulty, c.stability, R)
        : nextStabilityRecall(c.difficulty, c.stability, R, r);
    }
    c.stability = stability;
    c.difficulty = difficulty;
  }

  c.interval = nextInterval(c.stability);
  const due = new Date(today);
  due.setDate(due.getDate() + c.interval);
  c.dueDate = iso(due);

  // repetitions zaehlt einfach mit statt bei "Nochmal" zurueckzusetzen (das
  // war ein reines SM-2-Konzept) - sonst wuerde eine vergessene, laengst
  // gelernte Karte im Dashboard wieder als "neue Karte" gezaehlt.
  c.repetitions = (c.totalReviews || 0) + 1;
  c.totalReviews = (c.totalReviews || 0) + 1;
  if (rating === 'again') c.wrong += 1; else c.correct += 1;

  // Nur noch Anzeigewert, nichts im UI liest ihn zur Planung.
  c.ease = Math.round((1.3 + ((10 - c.difficulty) / 9) * 1.7) * 100) / 100;

  c.lastReviewed = iso(today);
  return c;
}

// Tippfehler-Toleranz beim Abfragen getippter Antworten.
export function levenshtein(a, b) {
  a = a.trim().toLowerCase(); b = b.trim().toLowerCase();
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
  return dp[m][n];
}

// ---------- Lückensatz-Helfer ----------
// Format: "Yo [como] fruta todos los días." -> das Wort in Klammern ist die Lösung.
export function parseGapLine(line) {
  const m = line.match(/\[([^\]]+)\]/);
  if (!m) return null;
  const answer = m[1].trim();
  if (!answer) return null;
  return { sentence: line.trim(), answer };
}
export function maskSentence(sentence) {
  return sentence.replace(/\[([^\]]+)\]/, (_, w) => '▁'.repeat(Math.max(3, Math.min(10, w.length))));
}
export function revealSentence(sentence) {
  return sentence.replace(/\[([^\]]+)\]/, (_, w) => `${w}`);
}

// ---------- Kartenboxen ("Decks") ----------
export function deckKeyOf(c) { return c.type === 'gap' ? `gap::${c.language}` : `vocab::${c.langA}→${c.langB}`; }
export function deckLabelOf(c) { return c.type === 'gap' ? `Sätze · ${c.language}` : `${c.langA} → ${c.langB}`; }

// ---------- Kartenerzeugung ----------
// Einzige Stelle, an der die Kartenform definiert wird.
function baseCard() {
  return {
    id: uid(),
    ease: 2.5, interval: 0, repetitions: 0, dueDate: todayISO(),
    stability: null, difficulty: null,
    createdAt: todayISO(), lastReviewed: null, totalReviews: 0, correct: 0, wrong: 0,
  };
}

export function newVocabCard({ front, back, langA, langB }) {
  return { ...baseCard(), type: 'vocab', front, back, langA, langB };
}

export function newGapCard({ sentence, answer, language }) {
  return {
    ...baseCard(), type: 'gap',
    sentence, front: maskSentence(sentence), back: answer, language,
  };
}

// ---------- Auswahllisten ----------
export const VOCAB_PAIRS = [
  { label: 'Spanisch → Deutsch', a: 'Spanisch', b: 'Deutsch' },
  { label: 'Deutsch → Spanisch', a: 'Deutsch', b: 'Spanisch' },
  { label: 'Englisch → Deutsch', a: 'Englisch', b: 'Deutsch' },
  { label: 'Deutsch → Englisch', a: 'Deutsch', b: 'Englisch' },
  { label: 'Japanisch → Deutsch', a: 'Japanisch', b: 'Deutsch' },
  { label: 'Französisch → Deutsch', a: 'Französisch', b: 'Deutsch' },
  { label: 'Sonstige', a: 'Sprache 1', b: 'Sprache 2' },
];

export const SENTENCE_LANGS = ['Spanisch', 'Englisch', 'Französisch', 'Deutsch', 'Japanisch', 'Sonstige'];
