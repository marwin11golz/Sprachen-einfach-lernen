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
const MAX_INTERVAL = 36500;

// Zielretention: Wie sicher eine Karte beim Wiedersehen noch sitzen soll.
// FEST auf 0,95 - kein Regler, keine Einstellung.
//
// Der Wert liegt bewusst ueber dem Anki-Standard von 0,9. Bei 0,9 waechst eine
// mit "Gut" bestaetigte Karte auf 2 → 11 → 46 → 163 Tage; wer ein paar Tage
// aussetzt, sieht danach nur noch die Karten wieder, die er oft falsch hatte,
// waehrend alles Gekonnte monatelang unsichtbar bleibt. Das ist zwar
// algorithmisch korrekt (FSRS rechnet fuer grosse Sammlungen auf Effizienz),
// fuehlt sich bei einer kleinen, jungen Kartei aber wie das Gegenteil von
// Festigen an.
//
// Warum ein fester Wert und kein Regler: Die Zielretention ist die einzige
// Groesse im Modell, die NICHT aus dem Lernverhalten stammt - alles andere
// (Stabilitaet, Schwierigkeit, Abrufwahrscheinlichkeit) rechnet FSRS aus den
// tatsaechlichen Bewertungen. Ein Regler daneben laedt dazu ein, an der
// Terminierung zu drehen, statt die Bewertungen sprechen zu lassen; die
// Verlaengerung, die man sich davon verspricht, entsteht ohnehin von selbst,
// sobald eine Karte wirklich sitzt.
export const RETENTION = 0.95;

export const RATING = { again: 1, hard: 2, good: 3, easy: 4 };

// ---------- Feste Anfangsphase ----------
// Die ersten sieben Wiederholungen einer Karte laufen auf festen Abstaenden,
// erst danach rechnet FSRS die Intervalle selbst weiter.
//
// Grund: die Referenzgewichte sind auf grosse Anki-Sammlungen angepasst, in
// denen "Einfach" sparsam benutzt wird. Fuer eine kleine, junge Kartei ist der
// Zuwachs dort zu steil - eine Vokabel, die erst zweimal als "Einfach"
// bewertet wurde, laege sonst schon 52 Tage in der Zukunft und danach bei 167.
//
// Die Stufe 0 fuer "Schwer" ist der Zehn-Minuten-Schritt: an Tagesabstaenden
// gemessen bleibt die Karte heute faellig und kommt in derselben Sitzung
// wieder (siehe submitRating in App.jsx). Eine Uhrzeit gibt es hier bewusst
// nicht - dueDate ist ein Datum.
//
// "Nochmal" steht absichtlich nicht in der Tabelle: eine vergessene Karte
// bekommt weiter das Intervall, das FSRS aus ihrer eigenen Stabilitaet
// errechnet. Sie faellt dafuer auf Stufe 1 zurueck (siehe rate()), sonst
// bekaeme eine gerade vergessene Karte beim naechsten "Gut" die 70 Tage der
// Stufe 6.
export const EARLY_STEPS = {
  hard: [0, 1, 2, 4, 7, 12, 20],
  good: [1, 3, 7, 16, 35, 70, 140],
  easy: [3, 7, 18, 40, 80, 160, 320],
};
export const EARLY_COUNT = EARLY_STEPS.good.length;

// Das feste Intervall fuer diese Stufe, oder null, wenn die Anfangsphase
// vorbei ist oder die Bewertung keine Leiter hat ("Nochmal").
export function earlyInterval(step, rating) {
  const reihe = EARLY_STEPS[rating];
  if (!reihe || !(step >= 0) || step >= reihe.length) return null;
  return reihe[step];
}

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

// Der Abstand, nach dem die Abrufwahrscheinlichkeit auf RETENTION gefallen ist.
// Bei 0,9 ergaebe das rechnerisch genau round(S); bei 0,95 entsprechend weniger.
export function nextInterval(S) {
  const raw = (S / FACTOR) * (Math.pow(RETENTION, 1 / DECAY) - 1);
  return Math.min(MAX_INTERVAL, Math.max(1, Math.round(raw)));
}

// Deckel fuer "Schwer" NACH der Anfangsphase.
//
// Ohne ihn ist "Schwer" dort praktisch wirkungslos: nextInterval() kennt nur
// die Stabilitaet, und die waechst auch bei "Schwer" - die Bewertung daempft
// ueber W[15] nur, WIE STARK sie waechst. Eine Karte, die nach 140 Tagen mit
// Muehe erinnert wurde, sprang deshalb auf 222 Tage: WEITER hinaus als beim
// letzten Mal und nur ein Fuenftel unter den 272 Tagen, die "Gut" gegeben
// haette. Wer "Schwer" drueckt, sagt aber das Gegenteil - die Karte sass nicht.
//
// Der Faktor liegt bewusst UNTER 1 und damit unter Ankis "Hard" (dort 1,2 auf
// das letzte Intervall). Mit 1,2 waere "Schwer" nur langsameres Wachstum: eine
// Karte, die man fuenfmal hintereinander muehsam erinnert, kletterte trotzdem
// 140 → 168 → 202 → 242 → 290 Tage. Mit 0,9 rueckt sie stattdessen jedes Mal
// naeher (140 → 126 → 113), was der Bewertung entspricht - "Schwer" heisst,
// dass der Abruf gehakt hat, also gehoert die Karte frueher wieder vorgelegt
// und nicht weiter weggeschoben.
//
// Gedeckelt wird nur nach OBEN: rechnet FSRS von sich aus knapper - was es bei
// niedriger Stabilitaet tut -, gilt weiter der kleinere Wert. Und nie unter
// einen Tag, weil dueDate ein Datum ist.
export const HARD_FAKTOR = 0.9;

export function hardInterval(vorherigesIntervall, S) {
  const gedeckelt = Math.max(1, Math.round((vorherigesIntervall || 0) * HARD_FAKTOR));
  return Math.min(nextInterval(S), gedeckelt);
}
