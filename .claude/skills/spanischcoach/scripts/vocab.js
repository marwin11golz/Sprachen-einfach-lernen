#!/usr/bin/env node
// Kommandozeilen-Werkzeug fuer den Spanischcoach.
// Implementiert dieselbe SM-2-aehnliche Bewertungslogik wie src/lib/srs.js
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
  if (!fs.existsSync(dataPath)) return { cards: [], activityLog: {} };
  const raw = fs.readFileSync(dataPath, 'utf8');
  if (!raw.trim()) return { cards: [], activityLog: {} };
  const parsed = JSON.parse(raw);
  const cards = (parsed.cards || []).map(migrateCard);
  return { cards, activityLog: parsed.activityLog || {} };
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
  return card;
}

const todayISO = () => new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// Identisch zur rate()-Funktion in src/lib/srs.js - bewusst dupliziert statt
// importiert, damit die Skill ohne Build-Schritt als reines Node-Script
// laeuft und unabhaengig von der React-App bleibt.
function rate(card, rating) {
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
    } else {
      throw new Error(`Unbekanntes Rating: ${rating}`);
    }
    const due = new Date(today);
    due.setDate(due.getDate() + c.interval);
    c.dueDate = iso(due);
  }
  c.lastReviewed = iso(today);
  c.totalReviews = (c.totalReviews || 0) + 1;
  c.updatedAt = new Date().toISOString();
  return c;
}

function newCard(fields) {
  return {
    id: uid(),
    ease: 2.5, interval: 0, repetitions: 0, dueDate: todayISO(),
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
  added.forEach(c => console.log(`  [${c.id}] ${c.front} = ${c.back}`));
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
    const label = c.type === 'gap' ? `[gap/${c.language}] ${c.front}` : `[vocab/${c.langA}->${c.langB}] ${c.front}`;
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
  console.log(`Aktualisiert: ${updated.type === 'gap' ? updated.sentence : `${updated.front} = ${updated.back}`}`);
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
    console.log(`${c.id}\t${c.type === 'gap' ? c.sentence : `${c.front} = ${c.back}`}\tfaellig ${c.dueDate}`);
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
