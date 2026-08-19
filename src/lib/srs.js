// Lernlogik ("Spaced Repetition") und Kartenerzeugung.
//
// Dies ist die maßgebliche Fassung des SM-2-ähnlichen Algorithmus. Die
// Spanischcoach-Skill (.claude/skills/spanischcoach/scripts/vocab.js)
// dupliziert rate() bewusst, weil sie als abhängigkeitsfreies Node-Script
// ohne Build-Schritt laufen muss - Änderungen hier müssen dort mitgezogen
// werden (siehe CLAUDE.md).

export const todayISO = () => new Date().toISOString().slice(0, 10);
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// ---------- SM-2-ähnlicher Spaced-Repetition-Kern ----------
export function rate(card, rating) {
  const c = { ...card };
  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);

  if (rating === 'again') {
    c.ease = Math.max(1.3, c.ease - 0.2);
    c.repetitions = 0;
    c.interval = 0;
    c.dueDate = iso(today);
    c.wrong += 1;
  } else {
    c.correct += 1;
    if (rating === 'hard') {
      c.ease = Math.max(1.3, c.ease - 0.15);
      c.interval = Math.max(1, Math.round((c.interval || 1) * 1.2));
    } else if (rating === 'good') {
      c.repetitions += 1;
      if (c.repetitions === 1) c.interval = 1;
      else if (c.repetitions === 2) c.interval = 6;
      else c.interval = Math.round(c.interval * c.ease);
    } else if (rating === 'easy') {
      c.ease = Math.min(3.0, c.ease + 0.15);
      c.repetitions += 1;
      c.interval = Math.round((c.interval || 1) * c.ease * 1.3) + 1;
    }
    const due = new Date(today);
    due.setDate(due.getDate() + c.interval);
    c.dueDate = iso(due);
  }
  c.lastReviewed = iso(today);
  c.totalReviews = (c.totalReviews || 0) + 1;
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
