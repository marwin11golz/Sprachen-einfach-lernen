#!/usr/bin/env node
// Kommandozeilen-Werkzeug fuer den Spanischcoach.
// Implementiert dieselbe FSRS-Bewertungslogik wie src/lib/srs.js + src/lib/fsrs.js
// ("Sprachen lernen"), damit Karten aus der Chat-Skill und aus der
// Web-App austauschbar bleiben (gleiches JSON-Format, gleiche Formeln).
//
// Nutzung:
//   node vocab.js add-vocab --langA Spanisch --langB Deutsch "casa = Haus" "perro = Hund"
//   node vocab.js add-vocab --file liste.txt --langA Spanisch --langB Deutsch
//   node vocab.js add-gap --language Spanisch "Yo [como] fruta todos los dias."
//   node vocab.js due [--deck "Spanisch->Deutsch"] [--all]
//   node vocab.js rate <id> <again|hard|good|easy>
//   node vocab.js stats
//   node vocab.js list [--query text]
//
// Datenpfad: data/spanischcoach/vocab.json (relativ zum Repo-Root), ueber
// --data <pfad> aenderbar. Wird beim ersten Aufruf automatisch angelegt.

import fs from 'fs';
import path from 'path';

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { args[key] = next; i++; }
      else args[key] = true;
    } else args._.push(a);
  }
  return args;
}

function defaultDataPath() {
  return path.join(process.cwd(), 'data', 'spanischcoach', 'vocab.json');
}

function loadData(dataPath) {
  const leer = { cards: [], activityLog: {}, retention: RETENTION };
  if (!fs.existsSync(dataPath)) return leer;
  const raw = fs.readFileSync(dataPath, 'utf8');
  if (!raw.trim()) return leer;
  const parsed = JSON.parse(raw);
  const cards = (parsed.cards || []).map(migrateCard);
  // Die Zielretention ist fest; der Wert aus der Datei wird bewusst NICHT
  // uebernommen. Eine aeltere Datei kann noch einen Reglerwert tragen - der
  // wuerde hier sonst andere Faelligkeiten ergeben als in der App.
  return { cards, activityLog: parsed.activityLog || {}, retention: RETENTION };
}

function saveData(dataPath, data) {
  fs.mkdirSync(path.dirname(dataPath), { recursive: true });
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

// Ergaenzt fehlende Felder aus dem alten Format. Der Zeitstempel wird
// ABGELEITET und nicht auf "jetzt" gesetzt - siehe src/lib/storage.js.
function migrateCard(c) {
  const card = { type: 'vocab', ...c };
  if (!card.updatedAt) {
    const day = card.lastReviewed || card.createdAt || '1970-01-01';
    card.updatedAt = `${day}T00:00:00.000Z`;
  }
  if (typeof card.deleted !== 'boolean') card.deleted = false;
  if (card.stability === undefined) card.stability = null;
  if (card.difficulty === undefined) card.difficulty = null;
  return card;
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// ---------- FSRS-6 (vereinfacht) - Kopie von src/lib/fsrs.js ----------
// Identisch zu den Formeln dort - bewusst dupliziert statt importiert, damit
// die Skill ohne Build-Schritt als reines Node-Script laeuft und
// unabhaengig von der React-App bleibt. Aenderungen dort mitziehen.
const W = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666,
  0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
];
const FSRS_DECAY = -W[20];
const FSRS_FACTOR = Math.pow(0.9, 1 / FSRS_DECAY) - 1;
const STABILITY_MIN = 0.001;
const MAX_INTERVAL = 36500;

// Zielretention - siehe src/lib/fsrs.js fuer die Begruendung. FEST auf 0,95,
// in App und Script gleichermassen: es gibt keinen Regler mehr, also auch
// nichts, was aus der JSON-Datei uebernommen werden muesste. Genau deshalb
// rechnen Chat und App dieselben Intervalle, ohne dass die Datei sie tragen
// muss.
const RETENTION = 0.95;
const RATING = { again: 1, hard: 2, good: 3, easy: 4 };
const clampDifficulty = (d) => Math.min(10, Math.max(1, d));

// Feste Anfangsphase - woertlich aus src/lib/fsrs.js gespiegelt. Weicht sie ab,
// landet dieselbe Karte im Chat auf einem anderen Termin als in der App.
// Stufe 0 bei "hard" ist der Zehn-Minuten-Schritt: Intervall 0, die Karte
// bleibt heute faellig.
const EARLY_STEPS = {
  hard: [0, 1, 2, 4, 7, 12, 20],
  good: [1, 3, 7, 16, 35, 70, 140],
  easy: [3, 7, 18, 40, 80, 160, 320],
};
const EARLY_COUNT = EARLY_STEPS.good.length;
function earlyInterval(step, rating) {
  const reihe = EARLY_STEPS[rating];
  if (!reihe || !(step >= 0) || step >= reihe.length) return null;
  return reihe[step];
}

function initialStability(r) { return Math.max(W[r - 1], STABILITY_MIN); }
function initialDifficulty(r) { return clampDifficulty(W[4] - Math.exp(W[5] * (r - 1)) + 1); }
function nextDifficulty(D, r) {
  const deltaD = -(W[6] * (r - 3));
  const damped = D + ((10 - D) * deltaD) / 9;
  const easyD0 = W[4] - Math.exp(W[5] * 3) + 1;
  return clampDifficulty(W[7] * easyD0 + (1 - W[7]) * damped);
}
function retrievability(t, S) { return Math.pow(1 + (FSRS_FACTOR * t) / S, FSRS_DECAY); }
function nextStabilityRecall(D, S, R, r) {
  const hardPenalty = r === RATING.hard ? W[15] : 1;
  const easyBonus = r === RATING.easy ? W[16] : 1;
  const grown = S * (
    1 + Math.exp(W[8]) * (11 - D) * Math.pow(S, -W[9]) * (Math.exp((1 - R) * W[10]) - 1) * hardPenalty * easyBonus
  );
  return Math.max(grown, STABILITY_MIN);
}
function nextStabilityForget(D, S, R) {
  const longTerm = W[11] * Math.pow(D, -W[12]) * (Math.pow(S + 1, W[13]) - 1) * Math.exp((1 - R) * W[14]);
  const shortTerm = S / Math.exp(W[17] * W[18]);
  return Math.max(Math.min(longTerm, shortTerm), STABILITY_MIN);
}
function shortTermStability(S, r) {
  let inc = Math.exp(W[17] * (r - 3 + W[18])) * Math.pow(S, -W[19]);
  if (r !== RATING.again) inc = Math.max(inc, 1.0);
  return Math.max(S * inc, STABILITY_MIN);
}
function nextInterval(S) {
  const raw = (S / FSRS_FACTOR) * (Math.pow(RETENTION, 1 / FSRS_DECAY) - 1);
  return Math.min(MAX_INTERVAL, Math.max(1, Math.round(raw)));
}

// Deckel fuer "Schwer" nach der Anfangsphase - gespiegelt aus src/lib/fsrs.js.
// nextInterval() kennt nur die Stabilitaet, und die waechst auch bei "Schwer";
// ohne den Deckel sprang eine muehsam erinnerte Karte von 140 auf 222 Tage.
// Weicht der Faktor hier ab, terminiert dieselbe Karte im Chat anders als in
// der App.
const HARD_FAKTOR = 0.9;
function hardInterval(vorherigesIntervall, S) {
  const gedeckelt = Math.max(1, Math.round((vorherigesIntervall || 0) * HARD_FAKTOR));
  return Math.min(nextInterval(S), gedeckelt);
}

// Abstand zweier Lerntage in KALENDERTAGEN - siehe daysBetween() in
// src/lib/srs.js: die fruehere Rundung auf die Uhrzeit zaehlte nachmittags
// jedes Mal einen Tag zu viel und blaehte die Intervalle auf.
function daysBetween(fromISO, toISO) {
  const from = new Date(`${fromISO}T00:00:00.000Z`);
  const to = new Date(`${toISO}T00:00:00.000Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  return Math.max(0, Math.round((to - from) / 86400000));
}

// Einmaliges Impfen von stability/difficulty fuer Karten aus der Zeit vor
// FSRS - siehe seedFromLegacy() in src/lib/srs.js fuer die Begruendung.
function seedFromLegacy(card) {
  const interval = card.interval > 0 ? card.interval : 0.5;
  const ease = Math.min(3.0, Math.max(1.3, card.ease ?? 2.5));
  const difficulty = Math.min(10, Math.max(1, 1 + ((3.0 - ease) / 1.7) * 9));
  return { stability: Math.max(interval, STABILITY_MIN), difficulty };
}

// Sichere Bewertungen in Folge - gespiegelt aus src/lib/srs.js. "Schwer"
// zaehlt hier NICHT als Erfolg, anders als bei earlyStep.
function erholungsStreak(card) {
  if (Number.isFinite(card.recoveryStreak)) return card.recoveryStreak;
  return Number.isFinite(card.earlyStep) ? card.earlyStep : (card.totalReviews || 0);
}

// Identisch zur rate()-Funktion in src/lib/srs.js - bewusst dupliziert statt
// importiert, damit die Skill ohne Build-Schritt als reines Node-Script
// laeuft und unabhaengig von der React-App bleibt.
function rate(card, rating) {
  const c = { ...card };
  const r = RATING[rating];
  if (!r) throw new Error(`Unbekanntes Rating: ${rating}`);
  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);

  if (c.stability == null && c.totalReviews > 0) {
    const seeded = seedFromLegacy(c);
    c.stability = seeded.stability;
    c.difficulty = seeded.difficulty;
  }

  if (c.stability == null) {
    c.stability = initialStability(r);
    c.difficulty = initialDifficulty(r);
  } else {
    const elapsed = c.lastReviewed ? daysBetween(c.lastReviewed, iso(today)) : 0;
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

  // Feste Anfangsphase - gespiegelt aus src/lib/srs.js. FSRS rechnet daneben
  // weiter, uebersteuert ist nur die Wahl des Faelligkeitsdatums.
  const stufe = Number.isFinite(c.earlyStep) ? c.earlyStep : (c.totalReviews || 0);
  const fest = earlyInterval(stufe, rating);
  const straehne = erholungsStreak(c);
  c.interval = fest != null
    ? fest
    : (rating === 'hard' ? hardInterval(c.interval, c.stability) : nextInterval(c.stability));
  c.earlyStep = rating === 'again' ? 0 : Math.min(EARLY_COUNT, stufe + 1);
  // Erholungs-Straehne der Fehlerkartei - gespiegelt aus src/lib/srs.js. Wird
  // hier zwar von keinem Befehl gelesen, muss aber mitgeschrieben werden: sonst
  // stuende eine im Chat bewertete Karte in der App mit einer veralteten
  // Straehne da und faele zu frueh oder zu spaet aus der Fehlerkartei.
  c.recoveryStreak = (rating === 'good' || rating === 'easy')
    ? Math.min(EARLY_COUNT, straehne + 1)
    : 0;

  const due = new Date(today);
  due.setDate(due.getDate() + c.interval);
  c.dueDate = iso(due);

  c.repetitions = (c.totalReviews || 0) + 1;
  c.totalReviews = (c.totalReviews || 0) + 1;
  if (rating === 'again') c.wrong += 1; else c.correct += 1;
  c.ease = Math.round((1.3 + ((10 - c.difficulty) / 9) * 1.7) * 100) / 100;

  c.lastReviewed = iso(today);
  c.updatedAt = new Date().toISOString();
  return c;
}

function newCard(fields) {
  return {
    id: uid(),
    ease: 2.5, interval: 0, repetitions: 0, dueDate: todayISO(),
    stability: null, difficulty: null, earlyStep: 0, recoveryStreak: 0,
    createdAt: todayISO(), lastReviewed: null, totalReviews: 0, correct: 0, wrong: 0,
    updatedAt: new Date().toISOString(), deleted: false,
    ...fields,
  };
}

function parseVocabLine(line) {
  let front, back;
  if (line.includes('=')) { const p = line.split('='); front = p[0].trim(); back = p.slice(1).join('=').trim(); }
  else if (line.includes(';')) { const p = line.split(';'); front = p[0].trim(); back = p.slice(1).join(';').trim(); }
  else if (line.includes(',')) { const p = line.split(','); front = p[0].trim(); back = p.slice(1).join(',').trim(); }
  else return null;
  if (!front || !back) return null;
  return { front, back };
}

function parseGapLine(line) {
  const m = line.match(/\[([^\]]+)\]/);
  if (!m || !m[1].trim()) return null;
  const answer = m[1].trim();
  const mask = line.replace(/\[([^\]]+)\]/, (_, w) => '▁'.repeat(Math.max(3, Math.min(10, w.length))));
  return { sentence: line.trim(), front: mask, back: answer };
}

// Trennt bei Vokabelkarten die eigentliche Antwort von einem optionalen
// Beispielsatz: "Merger | With the merger, a company can become more
// efficient." Wortgleich mit splitAnswer() in src/lib/srs.js - beide Seiten
// muessen dieselbe Antwort erwarten, sonst gilt im Chat als falsch, was in
// der App richtig ist.
//
// Der Binde-/Gedankenstrich zaehlt nur mit Leerzeichen ringsum, damit
// "E-Mail" und "well-known" heil bleiben.
const ANSWER_SEPARATOR = /\s*\|\s*|\s+[-–—]\s+/;

function splitAnswer(text) {
  const s = String(text ?? '');
  const m = s.match(ANSWER_SEPARATOR);
  if (!m) return { answer: s.trim(), example: null };
  const answer = s.slice(0, m.index).trim();
  const example = s.slice(m.index + m[0].length).trim();
  if (!answer) return { answer: s.trim(), example: null };
  return { answer, example: example || null };
}

// Beide Seiten zerlegt - jede Sprache traegt ihren eigenen Beispielsatz.
// Wortgleich mit cardSides() in src/lib/srs.js: stuende der Satz hier in der
// Frage, fragte der Chat etwas anderes ab als die App.
//
// Nur Vokabelkarten kennen die Trennung. Bei einem Lueckensatz waere ein
// Gedankenstrich im Satz sonst ein Trenner und die zweite Satzhaelfte weg.
function cardSides(card) {
  if (!card) return { front: { answer: '', example: null }, back: { answer: '', example: null } };
  if (card.type !== 'vocab') {
    return {
      front: { answer: card.front ?? '', example: null },
      back: { answer: card.back ?? '', example: null },
    };
  }
  return { front: splitAnswer(card.front), back: splitAnswer(card.back) };
}

function frontOf(card) {
  return cardSides(card).front.answer;
}
function answerOf(card) {
  return cardSides(card).back.answer;
}
// Beide Saetze, damit im Chat sichtbar ist, was auf welcher Seite steht.
function examplesOf(card) {
  const { front, back } = cardSides(card);
  return [front.example, back.example].filter(Boolean);
}

function linesFromArgs(args) {
  let lines = [];
  if (args.file) lines.push(...fs.readFileSync(args.file, 'utf8').split('\n'));
  lines.push(...args._.slice(1)); // args._[0] ist der Subcommand
  return lines.map(l => l.trim()).filter(Boolean);
}

function cmdAddVocab(args, dataPath) {
  const data = loadData(dataPath);
  const langA = args.langA || 'Spanisch';
  const langB = args.langB || 'Deutsch';
  const lines = linesFromArgs(args);
  const added = [];
  for (const line of lines) {
    const parsed = parseVocabLine(line);
    if (!parsed) { console.error(`Ignoriert (kein = , ; erkannt): ${line}`); continue; }
    const card = newCard({ type: 'vocab', front: parsed.front, back: parsed.back, langA, langB });
    data.cards.push(card);
    added.push(card);
  }
  saveData(dataPath, data);
  console.log(`${added.length} Vokabel(n) hinzugefuegt (${langA} -> ${langB}).`);
  added.forEach(c => {
    const ex = examplesOf(c);
    console.log(`  [${c.id}] ${frontOf(c)} = ${answerOf(c)}${ex.length ? `   (Beispiel: ${ex.join(' / ')})` : ''}`);
  });
}

function cmdAddGap(args, dataPath) {
  const data = loadData(dataPath);
  const language = args.language || 'Spanisch';
  const lines = linesFromArgs(args);
  const added = [];
  for (const line of lines) {
    const parsed = parseGapLine(line);
    if (!parsed) { console.error(`Ignoriert (keine [Lösung] in eckigen Klammern): ${line}`); continue; }
    const card = newCard({ type: 'gap', sentence: parsed.sentence, front: parsed.front, back: parsed.back, language });
    data.cards.push(card);
    added.push(card);
  }
  saveData(dataPath, data);
  console.log(`${added.length} Luecken-Satz/Saetze hinzugefuegt (${language}).`);
  added.forEach(c => console.log(`  [${c.id}] ${c.sentence}`));
}

function deckKeyOf(c) { return c.type === 'gap' ? `gap::${c.language}` : `vocab::${c.langA}->${c.langB}`; }

function cmdDue(args, dataPath) {
  const data = loadData(dataPath);
  const today = todayISO();
  const live = data.cards.filter(c => !c.deleted);
  let pool = args.all ? live : live.filter(c => c.dueDate <= today);
  if (args.deck) pool = pool.filter(c => deckKeyOf(c) === args.deck || (c.type === 'vocab' ? `${c.langA}->${c.langB}` : c.language) === args.deck);
  if (pool.length === 0) { console.log('Keine Karten gefunden.'); return; }
  for (const c of pool) {
    const label = c.type === 'gap' ? `[gap/${c.language}] ${c.front}` : `[vocab/${c.langA}->${c.langB}] ${frontOf(c)}`;
    console.log(`${c.id}\tfaellig ${c.dueDate}\tneu:${c.repetitions === 0}\t${label}`);
  }
}

function cmdRate(args, dataPath) {
  const [, id, rating] = args._;
  if (!id || !rating) { console.error('Nutzung: rate <id> <again|hard|good|easy>'); process.exit(1); }
  const data = loadData(dataPath);
  const idx = data.cards.findIndex(c => c.id === id);
  if (idx === -1) { console.error(`Keine Karte mit id ${id} gefunden.`); process.exit(1); }
  const updated = rate(data.cards[idx], rating);
  data.cards[idx] = updated;
  data.activityLog[todayISO()] = (data.activityLog[todayISO()] || 0) + 1;
  saveData(dataPath, data);
  console.log(`Aktualisiert: ${updated.type === 'gap' ? updated.sentence : `${frontOf(updated)} = ${answerOf(updated)}`}`);
  console.log(`  naechste Faelligkeit: ${updated.dueDate} (interval ${updated.interval}, ease ${updated.ease.toFixed(2)}, wiederholungen ${updated.repetitions})`);
}

function cmdStats(args, dataPath) {
  const data = loadData(dataPath);
  const today = todayISO();
  const live = data.cards.filter(c => !c.deleted);
  const due = live.filter(c => c.dueDate <= today);
  const learned = live.filter(c => c.repetitions > 0).length;
  const totalCorrect = live.reduce((s, c) => s + (c.correct || 0), 0);
  const totalWrong = live.reduce((s, c) => s + (c.wrong || 0), 0);
  const successRate = (totalCorrect + totalWrong) > 0 ? Math.round((totalCorrect / (totalCorrect + totalWrong)) * 100) : 0;
  let streak = 0;
  let d = new Date();
  if (!data.activityLog[today]) d.setDate(d.getDate() - 1);
  while (true) {
    const iso = d.toISOString().slice(0, 10);
    if (data.activityLog[iso] > 0) { streak++; d.setDate(d.getDate() - 1); } else break;
  }
  console.log(`Karten gesamt:     ${live.length}`);
  console.log(`Faellig heute:     ${due.length}`);
  console.log(`Gelernt:           ${learned}`);
  console.log(`Trefferquote:      ${successRate}%`);
  console.log(`Streak:            ${streak} Tag(e)`);
}

function cmdList(args, dataPath) {
  const data = loadData(dataPath);
  let cards = data.cards.filter(c => !c.deleted);
  if (args.query) {
    const q = String(args.query).toLowerCase();
    cards = cards.filter(c => (c.type === 'gap' ? `${c.sentence} ${c.back}` : `${c.front} ${c.back}`).toLowerCase().includes(q));
  }
  for (const c of cards) {
    const ex = examplesOf(c);
    const text = c.type === 'gap' ? c.sentence : `${frontOf(c)} = ${answerOf(c)}`;
    console.log(`${c.id}\t${text}\tfaellig ${c.dueDate}${ex.length ? `\tBeispiel: ${ex.join(' / ')}` : ''}`);
  }
  console.log(`${cards.length} Karte(n).`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const dataPath = args.data ? path.resolve(args.data) : defaultDataPath();
  const cmd = args._[0];
  switch (cmd) {
    case 'add-vocab': return cmdAddVocab(args, dataPath);
    case 'add-gap': return cmdAddGap(args, dataPath);
    case 'due': return cmdDue(args, dataPath);
    case 'rate': return cmdRate(args, dataPath);
    case 'stats': return cmdStats(args, dataPath);
    case 'list': return cmdList(args, dataPath);
    default:
      console.error('Unbekannter Befehl. Verfuegbar: add-vocab, add-gap, due, rate, stats, list');
      process.exit(1);
  }
}

main();
