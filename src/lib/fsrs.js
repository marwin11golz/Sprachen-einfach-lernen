// FSRS-6 (vereinfacht): das Gedächtnismodell hinter rate() in srs.js.
//
// Reine Funktionen, keine Importe, kein npm-Paket - genau wie bei rate() zuvor
// wird diese Datei wörtlich nach
// .claude/skills/spanischcoach/scripts/vocab.js gespiegelt, damit das Script
// ohne Build-Schritt läuft (siehe CLAUDE.md).
//
// Gewichte und Formeln folgen der Referenzimplementierung
// open-spaced-repetition/py-fsrs (fsrs/scheduler.py, DEFAULT_PARAMETERS).
// Bewusst weggelassen gegenüber der Referenz: Lern-/Wiederauffrisch-
// Zustandsautomat und Unter-Tages-Lernschritte (diese App plant nur auf
// Tagesebene - dueDate ist ein Datum, nie eine Uhrzeit) sowie Fuzzing (hält
// diese Datei und ihre Kopie deterministisch und nachrechenbar).

export const W = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666,
  0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
];

const DECAY = -W[20];
const FACTOR = Math.pow(0.9, 1 / DECAY) - 1;
export const STABILITY_MIN = 0.001;
const DESIRED_RETENTION = 0.9;
const MAX_INTERVAL = 36500;

export const RATING = { again: 1, hard: 2, good: 3, easy: 4 };

const clampDifficulty = (d) => Math.min(10, Math.max(1, d));

export function initialStability(r) {
  return Math.max(W[r - 1], STABILITY_MIN);
}

export function initialDifficulty(r) {
  return clampDifficulty(W[4] - Math.exp(W[5] * (r - 1)) + 1);
}

export function nextDifficulty(D, r) {
  const deltaD = -(W[6] * (r - 3));
  const damped = D + ((10 - D) * deltaD) / 9;
  const easyD0 = W[4] - Math.exp(W[5] * 3) + 1;
  return clampDifficulty(W[7] * easyD0 + (1 - W[7]) * damped);
}

// t = verstrichene Tage seit der letzten Bewertung, S = Stabilität.
export function retrievability(t, S) {
  return Math.pow(1 + (FACTOR * t) / S, DECAY);
}

// Bewertung war "hard"/"good"/"easy" (erinnert).
export function nextStabilityRecall(D, S, R, r) {
  const hardPenalty = r === RATING.hard ? W[15] : 1;
  const easyBonus = r === RATING.easy ? W[16] : 1;
  const grown = S * (
    1
    + Math.exp(W[8])
      * (11 - D)
      * Math.pow(S, -W[9])
      * (Math.exp((1 - R) * W[10]) - 1)
      * hardPenalty
      * easyBonus
  );
  return Math.max(grown, STABILITY_MIN);
}

// Bewertung war "again" (vergessen).
export function nextStabilityForget(D, S, R) {
  const longTerm = W[11] * Math.pow(D, -W[12]) * (Math.pow(S + 1, W[13]) - 1) * Math.exp((1 - R) * W[14]);
  const shortTerm = S / Math.exp(W[17] * W[18]);
  return Math.max(Math.min(longTerm, shortTerm), STABILITY_MIN);
}

// Karte wird am selben Tag ein zweites Mal bewertet (z. B. eine "Nochmal"-
// Karte, die noch in derselben Sitzung zurückkommt).
export function shortTermStability(S, r) {
  let inc = Math.exp(W[17] * (r - 3 + W[18])) * Math.pow(S, -W[19]);
  if (r !== RATING.again) inc = Math.max(inc, 1.0);
  return Math.max(S * inc, STABILITY_MIN);
}

// Bei Zielretention 0,9 vereinfacht sich das rechnerisch zu round(S) - die
// allgemeine Formel bleibt trotzdem stehen, falls die Zielretention später
// einstellbar werden soll.
export function nextInterval(S) {
  const raw = (S / FACTOR) * (Math.pow(DESIRED_RETENTION, 1 / DECAY) - 1);
  return Math.min(MAX_INTERVAL, Math.max(1, Math.round(raw)));
}
