import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plus, Search, BarChart3, Layers, CheckCircle2, XCircle, Sun, Moon, X,
  Download, Trash2, Volume2, Upload, BookOpen, PenLine, ChevronRight, Repeat, Flame,
} from 'lucide-react';

import {
  levenshtein, todayISO,
  parseGapLine, revealSentence, splitAnswer,
  deckKeyOf, deckLabelOf,
  newVocabCard, newGapCard,
  VOCAB_PAIRS, SENTENCE_LANGS, langCodeOf,
} from './lib/srs.js';
import {
  THEMES, hexToRgba, SPACE, RADIUS, FONT, NAVBAR_H,
  btnPrimary, btnSecondary, btnGhost, ratingBtn, surface, surfaceSoft, divider,
  typoDisplay, typoH1, typoH2, typoBody, typoSecondary, typoCaption, typoNumber,
} from './lib/theme.js';
import { useVocabStore } from './hooks/useVocabStore.js';
import { useAuth } from './hooks/useAuth.js';
import { useCloudSync } from './hooks/useCloudSync.js';
import AuthScreen from './ui/AuthScreen.jsx';
import SyncBadge from './ui/SyncBadge.jsx';

// Fortschrittsring fuer den Einstieg ins Lernen. Bewusst als SVG von Hand
// statt per Bibliothek - es ist ein Kreis, das rechtfertigt keine Abhaengigkeit.
function ProgressRing({ percent, size = 148, stroke = 10, track, color, children }) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const dash = (Math.max(0, Math.min(100, percent)) / 100) * circumference;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        {/* Bei 0 % gar nichts zeichnen - die runde Kappe wuerde sonst als Punkt
            stehen bleiben und wie ein angefangener Fortschritt aussehen. */}
        {dash > 0 && (
          <circle
            cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
            strokeLinecap="round" strokeDasharray={`${dash} ${circumference - dash}`}
            style={{ transition: 'stroke-dasharray .5s ease' }}
          />
        )}
      </svg>
      <div style={{
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 2,
      }}>
        {children}
      </div>
    </div>
  );
}

export default function VokabelTrainer() {
  const [view, setView] = useState('dashboard');

  // Karten, Lernaktivität und Speicherung liegen komplett im Store.
  const store = useVocabStore();
  const {
    cards, allCards, activity,
    flipped, setFlipped,
    newCardsPerDay, setNewCardsPerDay,
    loaded, storageWarning,
    addCards, rateCard, deleteCard, importData,
  } = store;

  const auth = useAuth();
  // Während einer Lernsitzung wird nicht abgeglichen: ein Fernstand dürfte
  // sonst eine gerade bewertete Karte überschreiben.
  const sync = useCloudSync({ store, userId: auth.userId, paused: view === 'study' });

  const [theme, setTheme] = useState('light');
  const [toast, setToast] = useState(null);

  const [addTab, setAddTab] = useState('vocab');
  const [addText, setAddText] = useState('');
  const [pairIdx, setPairIdx] = useState(0);
  const [sentenceText, setSentenceText] = useState('');
  const [sentenceLangIdx, setSentenceLangIdx] = useState(0);

  const [studyMode, setStudyMode] = useState('classic');
  const [deckFilter, setDeckFilter] = useState(null);
  const [deckLabel, setDeckLabel] = useState(null);
  const [queue, setQueue] = useState([]);
  const [sessionTotal, setSessionTotal] = useState(0);
  const [current, setCurrent] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [writeInput, setWriteInput] = useState('');
  const [writeResult, setWriteResult] = useState(null);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [dashSearch, setDashSearch] = useState('');

  const T = THEMES[theme];
  const vocabFileRef = useRef(null);
  const sentenceFileRef = useRef(null);
  const importFileRef = useRef(null);

  // Dunkles Design nach Systemeinstellung.
  useEffect(() => {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) setTheme('dark');
  }, []);

  // Die Stimmenliste laedt der Browser nachtraeglich - beim ersten Aufruf ist
  // sie meist noch leer. Deshalb einmal jetzt und erneut, sobald sie steht.
  const voicesRef = useRef([]);
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    const load = () => { voicesRef.current = synth.getVoices() || []; };
    load();
    synth.addEventListener?.('voiceschanged', load);
    return () => synth.removeEventListener?.('voiceschanged', load);
  }, []);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  // --- Vokabeln hinzufügen ---
  const handleAddVocab = () => {
    const lines = addText.split('\n').map(l => l.trim()).filter(Boolean);
    const pair = VOCAB_PAIRS[pairIdx];
    const newCards = [];
    for (const line of lines) {
      let front, back;
      if (line.includes('=')) {
        const parts = line.split('=');
        front = parts[0].trim(); back = parts.slice(1).join('=').trim();
      } else if (line.includes(';')) {
        const parts = line.split(';');
        front = parts[0].trim(); back = parts.slice(1).join(';').trim();
      } else if (line.includes(',')) {
        const parts = line.split(',');
        front = parts[0].trim(); back = parts.slice(1).join(',').trim();
      } else continue;
      if (!front || !back) continue;
      newCards.push(newVocabCard({ front, back, langA: pair.a, langB: pair.b }));
    }
    if (newCards.length === 0) { showToast('Keine gültigen Zeilen erkannt (Format: Wort = Übersetzung)'); return; }
    addCards(newCards);
    setAddText('');
    showToast(`${newCards.length} Vokabel${newCards.length > 1 ? 'n' : ''} hinzugefügt`);
  };

  // --- Lückensätze hinzufügen ---
  const handleAddSentences = () => {
    const lines = sentenceText.split('\n').map(l => l.trim()).filter(Boolean);
    const language = SENTENCE_LANGS[sentenceLangIdx];
    const newCards = [];
    for (const line of lines) {
      const parsed = parseGapLine(line);
      if (!parsed) continue;
      newCards.push(newGapCard({ sentence: parsed.sentence, answer: parsed.answer, language }));
    }
    if (newCards.length === 0) { showToast('Keine gültigen Zeilen erkannt (Wort in [eckigen Klammern] markieren)'); return; }
    addCards(newCards);
    setSentenceText('');
    showToast(`${newCards.length} Satz${newCards.length > 1 ? 'sätze' : ''} hinzugefügt`);
  };

  const readFileInto = (e, setter) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      setter(prev => (prev ? prev.trim() + '\n' + text : text));
      showToast(`Datei „${file.name}“ geladen – bitte prüfen und hinzufügen`);
    };
    reader.onerror = () => showToast('Datei konnte nicht gelesen werden');
    reader.readAsText(file);
    e.target.value = '';
  };

  // --- Stats ---
  const dueCards = useMemo(() => cards.filter(c => c.dueDate <= todayISO()), [cards]);
  const newCardsCount = useMemo(() => dueCards.filter(c => c.repetitions === 0).length, [dueCards]);
  // Neue Karten, die HEUTE schon zum ersten Mal bewertet wurden - aus den
  // Karten abgeleitet statt in einem eigenen Zaehler mitgefuehrt, damit
  // mehrere Sitzungen am selben Tag und ein Cloud-Abgleich dazwischen den
  // Zaehler nicht verfaelschen koennen.
  const newIntroducedToday = useMemo(
    () => cards.filter(c => c.totalReviews === 1 && c.lastReviewed === todayISO()).length,
    [cards],
  );
  const reviewCount = dueCards.length - newCardsCount;
  const learnedCount = cards.filter(c => c.repetitions > 0).length;
  const totalReviewsAll = cards.reduce((s, c) => s + (c.totalReviews || 0), 0);
  const totalCorrect = cards.reduce((s, c) => s + (c.correct || 0), 0);
  const totalWrong = cards.reduce((s, c) => s + (c.wrong || 0), 0);
  const successRate = totalReviewsAll > 0 ? Math.round((totalCorrect / (totalCorrect + totalWrong || 1)) * 100) : 0;
  const reviewsToday = activity[todayISO()] || 0;

  const streak = useMemo(() => {
    let s = 0;
    let d = new Date();
    if (!activity[todayISO()]) d.setDate(d.getDate() - 1);
    while (true) {
      const iso = d.toISOString().slice(0, 10);
      if (activity[iso] > 0) { s++; d.setDate(d.getDate() - 1); } else break;
    }
    return s;
  }, [activity]);

  // Tagesfortschritt fuer den Ring: erledigte gegenueber dem, was heute
  // insgesamt anstand (erledigt + noch offen).
  const dayGoal = reviewsToday + dueCards.length;
  const dayPercent = dayGoal > 0 ? (reviewsToday / dayGoal) * 100 : 0;

  // GitHub-artige Stempel-Heatmap: 12 Wochen x 7 Tage
  const heatmap = useMemo(() => {
    const days = [];
    for (let i = 83; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      days.push({ date: iso, count: activity[iso] || 0 });
    }
    const weeks = [];
    for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));
    const max = Math.max(1, ...days.map(d => d.count));
    return { weeks, max };
  }, [activity]);

  const difficultCards = useMemo(() =>
    cards.filter(c => (c.wrong || 0) > 0).sort((a, b) => (b.wrong / (b.totalReviews || 1)) - (a.wrong / (a.totalReviews || 1))).slice(0, 5),
    [cards]);

  // Kartenboxen ("Decks") wie in Anki
  const decks = useMemo(() => {
    const map = new Map();
    for (const c of cards) {
      const key = deckKeyOf(c);
      if (!map.has(key)) map.set(key, { key, label: deckLabelOf(c), type: c.type, total: 0, due: 0, neu: 0, learned: 0 });
      const d = map.get(key);
      d.total += 1;
      if (c.dueDate <= todayISO()) { d.due += 1; if (c.repetitions === 0) d.neu += 1; }
      if (c.repetitions > 0) d.learned += 1;
    }
    return [...map.values()].sort((a, b) => b.due - a.due || b.total - a.total);
  }, [cards]);

  // --- Study-Session ---
  const startStudy = (key, label, onlyDue = true) => {
    const source = onlyDue ? dueCards : cards;
    let pool = key ? source.filter(c => deckKeyOf(c) === key) : source;
    let limitHit = false;
    // Tageslimit fuer neue Karten: nur beim normalen Faellig-Lernen, nicht
    // bei "Alle wiederholen" - das soll bewusst alles zeigen. Wiederholungen
    // bereits gelernter Karten sind nie gedeckelt.
    if (onlyDue) {
      const reviewPool = pool.filter(c => c.repetitions > 0);
      const newPool = pool.filter(c => c.repetitions === 0)
        .slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const allowance = Math.max(0, newCardsPerDay - newIntroducedToday);
      limitHit = newPool.length > allowance && reviewPool.length === 0;
      pool = [...reviewPool, ...newPool.slice(0, allowance)];
    }
    if (pool.length === 0) {
      showToast(limitHit
        ? `Tageslimit erreicht (${newCardsPerDay} neue Karten) – wiederholte Karten gibt's gerade keine. Morgen geht's weiter.`
        : onlyDue ? 'Keine fälligen Karten in diesem Bereich – gut gemacht!' : 'Keine Karten in diesem Bereich vorhanden.');
      return;
    }
    setDeckFilter(key); setDeckLabel(label || null);
    setQueue([...pool].sort(() => Math.random() - 0.5));
    setSessionTotal(pool.length);
    setCurrent(null);
    setView('study');
  };
  useEffect(() => {
    if (view === 'study' && !current && queue.length > 0) {
      setCurrent(queue[0]);
      setRevealed(false); setWriteInput(''); setWriteResult(null);
    }
    if (view === 'study' && queue.length === 0 && current) setCurrent(null);
  }, [queue, view, current]);

  const submitRating = (ratingKey) => {
    if (!current) return;
    // Der Store bewertet die aktuell gespeicherte Karte, nicht die
    // Momentaufnahme aus der Warteschlange, und zaehlt den Lerntag mit.
    const updated = rateCard(current.id, ratingKey);
    if (!updated) { setCurrent(null); return; }
    let rest = queue.slice(1);
    if (ratingKey === 'again') {
      const pos = Math.min(rest.length, 3);
      rest = [...rest.slice(0, pos), updated, ...rest.slice(pos)];
    }
    setQueue(rest);
    setCurrent(null);
  };

  // Bei umgedrehter Vokabel werden Vorder- und Rückseite für Anzeige/Prüfung vertauscht.
  // Ein "|" in der Rückseite trennt die eigentliche Antwort von einem Beispielsatz -
  // getippt/geprüft wird nur die Antwort, der Beispielsatz ist reiner Kontext beim Aufdecken.
  const frontRaw = current ? (current.type === 'vocab' && flipped ? current.back : current.front) : '';
  const backRaw = current ? (current.type === 'vocab' && flipped ? current.front : current.back) : '';
  // Nur Vokabelkarten kennen die Trennung Antwort/Beispielsatz. Bei einem
  // Lueckensatz waere ein Gedankenstrich mitten im Satz ("Yo ▁▁▁ fruta - y
  // mi hermana come pan.") sonst ein Trenner, und die zweite Satzhaelfte
  // verschwaende aus der Frage.
  const asIs = (text) => ({ answer: text, example: null });
  const splitSides = current?.type === 'vocab' ? splitAnswer : asIs;
  const frontParts = splitSides(frontRaw);
  const backParts = splitSides(backRaw);
  const displayFront = frontParts.answer;
  const displayBack = backParts.answer;
  // Der Beispielsatz gehoert zur Karte, nicht zu einer Seite: beim Umdrehen
  // steht er auf der Vorderseite und wuerde sonst gar nicht mehr auftauchen.
  const displayExample = backParts.example || frontParts.example;

  // Welche Sprache auf welcher Seite steht - entscheidet, wie vorgelesen wird.
  // Bei Lueckensaetzen sind beide Seiten dieselbe Sprache.
  const frontLang = current
    ? (current.type === 'gap' ? current.language : (flipped ? current.langB : current.langA))
    : null;
  const backLang = current
    ? (current.type === 'gap' ? current.language : (flipped ? current.langA : current.langB))
    : null;

  const checkWrite = () => {
    if (!current) return;
    const dist = levenshtein(writeInput, displayBack);
    const tolerance = Math.max(1, Math.floor(displayBack.trim().length * 0.2));
    const ok = dist <= tolerance;
    setWriteResult({ ok, dist });
    setRevealed(true);
  };

  const isWriteInteraction = current && (current.type === 'gap' || studyMode === 'write');

  // Tastatursteuerung
  useEffect(() => {
    if (view !== 'study') return;
    const handler = (e) => {
      if (!isWriteInteraction && !revealed && e.code === 'Space') { e.preventDefault(); setRevealed(true); }
      if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
        const map = { '1': 'again', '2': 'hard', '3': 'good', '4': 'easy' };
        submitRating(map[e.key]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [view, isWriteInteraction, revealed, current, queue]);

  // --- Browse ---
  const filtered = useMemo(() => {
    let list = cards;
    const q = search.trim().toLowerCase();
    if (q) list = list.filter(c => {
      const hay = c.type === 'gap' ? `${c.sentence} ${c.back}` : `${c.front} ${c.back}`;
      return hay.toLowerCase().includes(q);
    });
    if (filter === 'new') list = list.filter(c => c.repetitions === 0);
    if (filter === 'due') list = list.filter(c => c.dueDate <= todayISO());
    if (filter === 'difficult') list = list.filter(c => (c.wrong || 0) > 0);
    if (filter === 'vocab') list = list.filter(c => c.type === 'vocab');
    if (filter === 'gap') list = list.filter(c => c.type === 'gap');
    return list.slice().reverse();
  }, [cards, search, filter]);


  const [exportText, setExportText] = useState(null);
  const [importPasteText, setImportPasteText] = useState('');
  const exportTextareaRef = useRef(null);

  const exportJSON = () => {
    // Grabsteine kommen bewusst mit, damit ein Import auch Loeschungen uebernimmt.
    setExportText(JSON.stringify({ schemaVersion: 2, cards: allCards, activityLog: activity, flipped }, null, 2));
  };

  const copyExportText = async () => {
    try {
      await navigator.clipboard.writeText(exportText);
      showToast('In Zwischenablage kopiert');
    } catch (e) {
      if (exportTextareaRef.current) {
        exportTextareaRef.current.select();
        showToast('Bitte manuell mit Strg/Cmd+C kopieren (Text ist markiert)');
      }
    }
  };

  const applyImportedData = (raw, sourceLabel) => {
    try {
      const parsed = JSON.parse(raw || '{}');
      const count = importData(parsed);
      showToast(`${count} Karte(n) ${sourceLabel} eingelesen`);
      return true;
    } catch (err) {
      showToast('Inhalt konnte nicht gelesen werden – ist es eine gültige Export-Sicherung?');
      return false;
    }
  };

  const importJSON = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { applyImportedData(String(reader.result || ''), 'aus Datei'); };
    reader.readAsText(file);
    e.target.value = '';
  };

  const importFromPaste = () => {
    if (!importPasteText.trim()) return;
    if (applyImportedData(importPasteText, 'aus eingefügtem Text')) setImportPasteText('');
  };

  const goSearch = (q) => { setSearch(q); setFilter('all'); setView('browse'); };

  if (!loaded) return null;

  // Vorlesen in der Sprache der jeweiligen Kartenseite. Ohne gesetzte Sprache
  // nimmt der Browser die Standardstimme - ein englisches "future" klaenge
  // dann deutsch ausgesprochen.
  const speak = (text, langName) => {
    try {
      const synth = window.speechSynthesis;
      if (!synth || !text) return;
      const u = new SpeechSynthesisUtterance(text);
      const code = langCodeOf(langName);
      if (code) {
        u.lang = code;
        // Einige Browser richten sich nur nach einer ausdruecklich gesetzten
        // Stimme und ignorieren u.lang. Erst die genaue Regionalstimme
        // versuchen (es-ES), sonst irgendeine der Sprache (es-MX).
        const base = code.slice(0, 2).toLowerCase();
        const voices = voicesRef.current;
        const voice = voices.find(v => v.lang?.replace('_', '-').toLowerCase() === code.toLowerCase())
          || voices.find(v => v.lang?.replace('_', '-').toLowerCase().startsWith(base));
        if (voice) u.voice = voice;
      }
      // Ein noch laufender Satz wuerde den neuen sonst in die Warteschlange
      // schieben, statt ihn sofort zu sprechen.
      synth.cancel();
      synth.speak(u);
    } catch (e) {}
  };

  const sessionDone = sessionTotal - queue.length;
  const sessionProgress = sessionTotal > 0 ? Math.max(0, Math.min(100, (sessionDone / sessionTotal) * 100)) : 0;

  const inputStyle = {
    width: '100%', padding: `${SPACE.md}px ${SPACE.lg}px`, borderRadius: RADIUS.md,
    border: `1px solid ${T.border}`, background: T.surfaceElevated, color: T.textPrimary,
    fontSize: FONT.md, outline: 'none',
  };

  const globalCss = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; }
    .mono { font-family: 'IBM Plex Mono', monospace; font-variant-numeric: tabular-nums; }
    button { font-family: inherit; }
    ::selection { background: ${T.primarySoft}; }
    input, textarea, select { font-family: inherit; }
    input:focus, textarea:focus, select:focus { border-color: ${T.primary}; }
    ::-webkit-scrollbar { height: 8px; width: 8px; }
    ::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 4px; }

    .press:active { transform: scale(.97); }
    /* Die Zeilen haben keinen eigenen Rand mehr, den man einfaerben koennte -
       das Ueberfahren zeigt sich jetzt als leicht abgesetzte Flaeche. */
    .row-link { transition: background .15s; }
    .row-link:hover { background: ${T.surfaceElevated}; }
    .stamp:hover { outline: 1px solid ${T.primary}; }

    /* Die Lernkarte kommt bei jedem Wechsel kurz herein - das macht den
       Kartenwechsel sichtbar, ohne den Lernfluss zu bremsen. */
    @keyframes cardIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
    .card-in { animation: cardIn .22s ease-out; }
    @keyframes riseIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    .rise-in { animation: riseIn .2s ease-out; }
    @media (prefers-reduced-motion: reduce) {
      .card-in, .rise-in { animation: none; }
      .press:active { transform: none; }
    }

    .dash-grid { display: grid; grid-template-columns: minmax(0,1.35fr) minmax(0,1fr); gap: ${SPACE.lg}px; align-items: start; }
    .hero { display: flex; align-items: center; gap: ${SPACE.xl}px; }
    .hero-actions { flex: 1; min-width: 0; }
    .deck-actions { display: flex; align-items: center; gap: ${SPACE.md}px; flex-shrink: 0; }

    /* Auf dem Handy sitzt die Navigation unten wie in einer App, am grossen
       Fenster oben - dort waere eine Leiste am unteren Rand nur weit weg. */
    /* Die Sichtbarkeit beider Navigationen haengt nur an diesen Regeln - kein
       inline display, sonst schlaegt es die Umbruchregel und beide sind da. */
    .nav-bottom { display: none; }
    .nav-top-links { display: flex; gap: ${SPACE.xs}px; }
    .brand-full { display: inline; }
    .page { max-width: 980px; margin: 0 auto; padding: ${SPACE.xl}px ${SPACE.lg}px ${SPACE.xxl}px; }
    @media (max-width: 720px) {
      .dash-grid { grid-template-columns: minmax(0,1fr); }
      .hero { flex-direction: column; text-align: center; gap: ${SPACE.lg}px; }
      .hero-actions { width: 100%; }
      .nav-top-links { display: none; }
      .nav-bottom { display: flex; }
      .brand { font-size: ${FONT.lg}px; }
      /* Nur wenn die Leiste unten wirklich sichtbar ist, muss der Inhalt ihr ausweichen. */
      .page { padding-bottom: calc(${NAVBAR_H + SPACE.xl}px + env(safe-area-inset-bottom)); }
    }
    @media (max-width: 380px) {
      .brand-full { display: none; }
    }
    @media (max-width: 460px) {
      .deck-head { flex-wrap: wrap; }
      .deck-actions { width: 100%; justify-content: space-between; }
    }
  `;

  // ---------- Lernansicht: eigener Vollbild-Layer ohne Navigation ----------
  if (view === 'study') {
    return (
      <div style={{
        position: 'fixed', inset: 0, background: T.background, color: T.textPrimary,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif", display: 'flex', flexDirection: 'column',
      }}>
        <style>{globalCss}</style>

        {/* Kopfzeile: schliessen, Fortschritt, Zaehler */}
        <div style={{
          padding: `calc(${SPACE.md}px + env(safe-area-inset-top)) ${SPACE.lg}px ${SPACE.md}px`,
          display: 'flex', alignItems: 'center', gap: SPACE.md, flexShrink: 0,
        }}>
          <button className="press" onClick={() => setView('dashboard')} aria-label="Lernen beenden"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textSecondary, padding: 4, display: 'flex' }}>
            <X size={22} />
          </button>
          <div style={{ flex: 1, height: 6, borderRadius: RADIUS.pill, background: T.border, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${sessionProgress}%`, background: T.primary, borderRadius: RADIUS.pill, transition: 'width .3s ease' }} />
          </div>
          <div className="mono" style={{ fontSize: FONT.base, color: T.textSecondary, flexShrink: 0 }}>
            {Math.min(sessionDone + 1, sessionTotal)}/{sessionTotal}
          </div>
        </div>

        {!current ? (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: SPACE.xl, textAlign: 'center' }}>
            <div style={{
              width: 84, height: 84, borderRadius: RADIUS.pill, background: T.successSoft,
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.lg,
            }}>
              <CheckCircle2 size={42} color={T.success} />
            </div>
            <div style={{ ...typoH1(), marginBottom: SPACE.sm }}>Geschafft</div>
            <div style={{ color: T.textSecondary, marginBottom: SPACE.xl, maxWidth: 320, ...typoBody() }}>
              {sessionTotal} Karte{sessionTotal !== 1 ? 'n' : ''}{deckLabel ? ` in „${deckLabel}“` : ''} für heute erledigt.
            </div>
            <button className="press" onClick={() => setView('dashboard')} style={btnPrimary(T, 'lg')}>Zum Dashboard</button>
          </div>
        ) : (
          <>
            {/* Karte */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: `0 ${SPACE.lg}px`, minHeight: 0, overflowY: 'auto' }}>
              <div key={current.id + String(revealed)} className="card-in" style={{
                ...surface(T, { lift: true }),
                width: '100%', maxWidth: 520, textAlign: 'center',
                padding: `${SPACE.xxl}px ${SPACE.xl}px`,
              }}>
                <div className="mono" style={{ fontSize: FONT.xs, color: T.textSecondary, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: SPACE.lg }}>
                  {current.type === 'gap' ? `Satz · ${current.language}` : `${flipped ? current.langB : current.langA} → ${flipped ? current.langA : current.langB}`}
                </div>

                <div style={{ ...(current.type === 'gap' ? typoH2() : typoDisplay()) }}>
                  {displayFront}
                </div>

                {(!isWriteInteraction || revealed) && (
                  <button className="press"
                    onClick={() => speak(current.type === 'gap' ? revealSentence(current.sentence) : displayFront, frontLang)}
                    aria-label={`Vorlesen (${frontLang})`}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textSecondary, marginTop: SPACE.md, padding: 6 }}>
                    <Volume2 size={20} />
                  </button>
                )}

                {!isWriteInteraction && revealed && (
                  <div className="rise-in" style={{ marginTop: SPACE.xl, paddingTop: SPACE.xl, ...divider(T) }}>
                    <div style={{ ...typoH2(), color: T.primary }}>{displayBack}</div>
                    {/* Beim umgedrehten Lernen steht das Fremdwort hier - ohne
                        eigenen Knopf waere gerade das nicht zu hoeren. */}
                    <button className="press" onClick={() => speak(displayBack, backLang)}
                      aria-label={`Antwort vorlesen (${backLang})`}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textSecondary, marginTop: SPACE.sm, padding: 6 }}>
                      <Volume2 size={18} />
                    </button>
                    {displayExample && (
                      <div style={{ ...typoBody(), color: T.textSecondary, marginTop: SPACE.sm }}>{displayExample}</div>
                    )}
                  </div>
                )}

                {isWriteInteraction && (
                  <div style={{ marginTop: SPACE.xl }}>
                    {!revealed ? (
                      <div style={{ display: 'flex', gap: SPACE.sm, justifyContent: 'center', flexWrap: 'wrap' }}>
                        <input autoFocus value={writeInput} onChange={e => setWriteInput(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && checkWrite()}
                          placeholder={current.type === 'gap' ? 'fehlende Form eingeben…' : 'Übersetzung eingeben…'}
                          style={{ ...inputStyle, flex: 1, minWidth: 200, maxWidth: 300, textAlign: 'center', fontSize: FONT.lg }} />
                        <button className="press" onClick={checkWrite} style={btnPrimary(T)}>Prüfen</button>
                      </div>
                    ) : (
                      <div className="rise-in">
                        <div style={{
                          display: 'inline-flex', alignItems: 'center', gap: SPACE.sm, ...typoSecondary(),
                          color: writeResult?.ok ? T.success : T.error, background: writeResult?.ok ? T.successSoft : T.errorSoft,
                          padding: `${SPACE.sm}px ${SPACE.lg}px`, borderRadius: RADIUS.pill,
                        }}>
                          {writeResult?.ok ? <CheckCircle2 size={17} /> : <XCircle size={17} />}
                          {writeResult?.ok ? 'Richtig' : 'Nicht ganz'}
                        </div>
                        <div style={{ ...typoH2(), marginTop: SPACE.lg }}>
                          {current.type === 'gap' ? revealSentence(current.sentence) : displayBack}
                        </div>
                        <button className="press"
                          onClick={() => speak(current.type === 'gap' ? revealSentence(current.sentence) : displayBack, backLang)}
                          aria-label={`Antwort vorlesen (${backLang})`}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textSecondary, marginTop: SPACE.sm, padding: 6 }}>
                          <Volume2 size={18} />
                        </button>
                        {current.type === 'vocab' && displayExample && (
                          <div style={{ ...typoBody(), color: T.textSecondary, marginTop: SPACE.sm }}>{displayExample}</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Aktionsleiste unten - dort, wo der Daumen ohnehin liegt */}
            <div style={{
              flexShrink: 0, padding: `${SPACE.lg}px ${SPACE.lg}px calc(${SPACE.lg}px + env(safe-area-inset-bottom))`,
              ...divider(T), background: T.surfaceElevated,
            }}>
              <div style={{ maxWidth: 520, margin: '0 auto' }}>
                {!revealed ? (
                  <>
                    {!isWriteInteraction && (
                      <button className="press" onClick={() => setRevealed(true)} style={{ ...btnPrimary(T, 'lg'), width: '100%' }}>
                        Aufdecken
                      </button>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: SPACE.lg, marginTop: SPACE.md }}>
                      {current.type === 'vocab' && (
                        <>
                          <button className="press" onClick={() => setFlipped(f => !f)} style={btnGhost(T)}>
                            <Repeat size={13} /> Umdrehen
                          </button>
                          <button className="press" onClick={() => setStudyMode(m => m === 'classic' ? 'write' : 'classic')} style={btnGhost(T)}>
                            {studyMode === 'classic' ? 'Tippen' : 'Aufdecken'}
                          </button>
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="rise-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: SPACE.sm }}>
                    {[
                      ['again', 'Nochmal', T.error, T.errorSoft, '1'],
                      ['hard', 'Schwer', T.warning, T.warningSoft, '2'],
                      ['good', 'Gut', T.success, T.successSoft, '3'],
                      ['easy', 'Einfach', T.primary, T.primarySoft, '4'],
                    ].map(([key, label, color, bg, num]) => (
                      <button key={key} className="press" onClick={() => submitRating(key)} style={ratingBtn(color, bg)}>
                        {label}<span className="mono" style={{ fontSize: FONT.xs, opacity: .65 }}>{num}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {toast && (
          <div style={{
            position: 'fixed', bottom: `calc(120px + env(safe-area-inset-bottom))`, left: '50%', transform: 'translateX(-50%)',
            background: T.textPrimary, color: T.background, padding: `${SPACE.md}px ${SPACE.xl}px`, borderRadius: RADIUS.pill,
            fontSize: FONT.md, maxWidth: '90vw', textAlign: 'center', boxShadow: T.shadowLift, zIndex: 50,
          }}>
            {toast}
          </div>
        )}
      </div>
    );
  }

  // ---------- Normale Ansichten mit Navigation ----------
  const navItems = [
    ['dashboard', 'Start', BarChart3],
    ['add', 'Hinzufügen', Plus],
    ['browse', 'Karten', Search],
  ];

  return (
    <div style={{
      background: T.background, color: T.textPrimary, minHeight: '100%', width: '100%', overflowX: 'hidden',
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif", transition: 'background .25s, color .25s',
    }}>
      <style>{globalCss}</style>

      {/* Kopfzeile */}
      <div style={{ borderBottom: `1px solid ${T.hairline}`, position: 'sticky', top: 0, background: hexToRgba(T.background, .92), backdropFilter: 'blur(10px)', zIndex: 10 }}>
        <div style={{
          maxWidth: 980, margin: '0 auto',
          padding: `calc(${SPACE.md}px + env(safe-area-inset-top)) ${SPACE.lg}px ${SPACE.md}px`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.md,
        }}>
          <button className="brand" onClick={() => setView('dashboard')} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: T.textPrimary, padding: 0,
            ...typoH1(), display: 'flex', alignItems: 'center', gap: SPACE.sm, whiteSpace: 'nowrap',
          }}>
            <Layers size={20} color={T.primary} />
            <span>Sprachen<span className="brand-full"> lernen</span></span>
          </button>

          <div style={{ display: 'flex', gap: SPACE.xs, alignItems: 'center' }}>
            <div className="nav-top-links">
              {navItems.map(([key, label, Icon]) => (
                <button key={key} className="press" onClick={() => setView(key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: SPACE.xs, padding: `${SPACE.sm}px ${SPACE.md}px`, borderRadius: RADIUS.pill,
                    border: 'none', cursor: 'pointer', ...typoSecondary(),
                    background: view === key ? T.primarySoft : 'transparent',
                    color: view === key ? T.primary : T.textSecondary, transition: 'background .15s, color .15s',
                  }}>
                  <Icon size={16} /> {label}
                </button>
              ))}
            </div>
            <SyncBadge T={T} state={sync.syncState} onClick={() => setView('account')} />
            <button className="press" onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
              aria-label="Design wechseln"
              style={{ padding: 9, borderRadius: RADIUS.pill, border: `1px solid ${T.border}`, background: T.surfaceElevated, cursor: 'pointer', color: T.textPrimary, display: 'flex' }}>
              {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
            </button>
          </div>
        </div>
      </div>

      <div className="page">

        {storageWarning && (
          <div style={{ background: T.errorSoft, color: T.error, border: `1px solid ${T.error}`, borderRadius: RADIUS.lg, padding: `${SPACE.md}px ${SPACE.lg}px`, marginBottom: SPACE.lg, ...typoBody() }}>
            {storageWarning}
          </div>
        )}

        {sync.accountConflict && (
          <div style={{ background: T.warningSoft, color: T.textPrimary, border: `1px solid ${T.warning}`, borderRadius: RADIUS.lg, padding: `${SPACE.lg}px`, marginBottom: SPACE.lg, ...typoBody('lg') }}>
            <strong>Anderes Konto erkannt.</strong> Auf diesem Gerät liegen
            {' '}{sync.accountConflict.cardCount} Karte(n), die zu einem anderen Konto gehören.
            Sollen sie in das jetzt angemeldete Konto übernommen werden?
            <div style={{ display: 'flex', gap: SPACE.sm, marginTop: SPACE.md, flexWrap: 'wrap' }}>
              <button className="press" onClick={() => sync.resolveAccountConflict(true)} style={btnPrimary(T, 'sm')}>Übernehmen</button>
              <button className="press" onClick={() => sync.resolveAccountConflict(false)} style={btnSecondary(T, 'sm')}>Nicht übernehmen</button>
            </div>
            <div style={{ fontSize: FONT.xs, color: T.textSecondary, marginTop: SPACE.sm }}>
              Eine Sicherungskopie des lokalen Standes wurde vorher automatisch angelegt.
            </div>
          </div>
        )}

        {/* ---------- KONTO ---------- */}
        {view === 'account' && (
          <AuthScreen T={T} auth={auth} sync={sync} cardCount={cards.length} onBack={() => setView('dashboard')} />
        )}

        {/* ---------- DASHBOARD ---------- */}
        {view === 'dashboard' && (
          <div>
            {/* Einstieg: was heute ansteht, und ein Knopf, der es startet. Steht
                ohne Kasten direkt auf der Seite - es ist der Hauptinhalt, nicht
                eine Kachel unter vielen. */}
            <div style={{ marginBottom: SPACE.xxxl }}>
              <div className="hero">
                <ProgressRing
                  percent={dayPercent} track={T.primarySoft} color={T.primary}
                  size={148} stroke={11}
                >
                  <div className="mono" style={{ ...typoNumber('hero'), color: dueCards.length > 0 ? T.primary : T.textSecondary }}>
                    {dueCards.length}
                  </div>
                  <div style={{ fontSize: FONT.sm, color: T.textSecondary }}>fällig</div>
                </ProgressRing>

                <div className="hero-actions">
                  <div style={{ ...typoDisplay(), marginBottom: SPACE.xs }}>
                    {dueCards.length > 0 ? 'Bereit zum Lernen' : reviewsToday > 0 ? 'Für heute erledigt' : 'Nichts fällig'}
                  </div>
                  <div style={{ color: T.textSecondary, ...typoBody('lg'), marginBottom: SPACE.lg }}>
                    {dueCards.length > 0
                      ? <>{newCardsCount} neu · {reviewCount} Wiederholung{reviewCount !== 1 ? 'en' : ''}{reviewsToday > 0 ? ` · ${reviewsToday} heute geschafft` : ''}</>
                      : reviewsToday > 0
                        ? <>{reviewsToday} Karte{reviewsToday !== 1 ? 'n' : ''} heute wiederholt. Morgen geht's weiter.</>
                        : <>Unter „Hinzufügen“ Vokabeln anlegen, dann kann's losgehen.</>}
                  </div>
                  <div style={{ display: 'flex', gap: SPACE.sm, flexWrap: 'wrap' }}>
                    {/* Die eine Hauptaktion nimmt den Platz, der uebrig ist - so
                        ist sie das Erste, worauf der Blick faellt. */}
                    <button className="press" onClick={() => startStudy(null, null)} disabled={dueCards.length === 0}
                      style={{ ...btnPrimary(T, 'lg'), flex: 1, minWidth: 200, opacity: dueCards.length === 0 ? .45 : 1, cursor: dueCards.length === 0 ? 'default' : 'pointer' }}>
                      Lernen starten <ChevronRight size={18} />
                    </button>
                    <button className="press" onClick={() => startStudy(null, null, false)} disabled={cards.length === 0}
                      style={{ ...btnSecondary(T, 'lg'), opacity: cards.length === 0 ? .45 : 1 }}>
                      <Repeat size={16} /> Alle
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Kennzahlen - drei Werte nebeneinander, allein durch Abstand
                getrennt. Ein Rahmen drumherum wuerde sie zu einer Kachel machen,
                obwohl sie nur eine Zeile Information sind. */}
            <div style={{ display: 'flex', gap: SPACE.xl, marginBottom: SPACE.xxxl, flexWrap: 'wrap' }}>
              {[
                [<Flame size={15} key="i" />, 'Streak', `${streak}`, streak > 0 ? T.error : T.textSecondary, streak === 1 ? 'Tag' : 'Tage'],
                [null, 'Gelernt', `${learnedCount}`, T.textPrimary, `von ${cards.length}`],
                [null, 'Trefferquote', `${successRate}`, T.success, '%'],
              ].map(([icon, label, val, color, unit]) => (
                <div key={label} style={{ flex: 1, minWidth: 90 }}>
                  <div style={{ fontSize: FONT.xs, color: T.textSecondary, marginBottom: SPACE.xs, display: 'flex', alignItems: 'center', gap: SPACE.xs }}>
                    {icon}{label}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE.xs }}>
                    <span className="mono" style={{ ...typoNumber(), color }}>{val}</span>
                    <span style={{ ...typoCaption(), color: T.textSecondary }}>{unit}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="dash-grid">
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: SPACE.md, gap: SPACE.sm }}>
                  <div style={{ ...typoH2() }}>Kartenboxen</div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, fontSize: FONT.sm, color: T.textSecondary }}>
                    Neu/Tag:
                    <input
                      type="number" min={0} value={newCardsPerDay}
                      onChange={e => setNewCardsPerDay(Math.max(0, Number(e.target.value) || 0))}
                      style={{ width: 52, padding: `${SPACE.xs}px ${SPACE.sm}px`, borderRadius: RADIUS.sm, border: `1px solid ${T.border}`, background: T.surfaceElevated, color: T.textPrimary, fontSize: FONT.sm, textAlign: 'center' }}
                    />
                    <span style={{ whiteSpace: 'nowrap' }}>· {newIntroducedToday} heute</span>
                  </label>
                </div>

                {/* Eine Liste mit Haarlinien statt eines Stapels aus Karten -
                    die Kartenboxen gehoeren zusammen und werden auch so gelesen. */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {decks.map((d, i) => {
                    // Satz- und Vokabelboxen unterscheiden sich am Symbol, nicht an
                    // der Farbe: Gruen gehoert dem Fortschritt und dem faelligen
                    // Stand, nicht der Kategorie.
                    const progress = d.total > 0 ? Math.round((d.learned / d.total) * 100) : 0;
                    return (
                      <div key={d.key} className="row-link" style={{
                        padding: `${SPACE.lg}px ${SPACE.md}px`, borderRadius: RADIUS.md,
                        ...(i > 0 ? divider(T) : null),
                      }}>
                        <div className="deck-head" style={{ display: 'flex', alignItems: 'center', gap: SPACE.md, marginBottom: SPACE.md }}>
                          <div style={{ width: 40, height: 40, borderRadius: RADIUS.md, background: T.surfaceElevated, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {d.type === 'gap' ? <PenLine size={18} color={T.textSecondary} /> : <BookOpen size={18} color={T.textSecondary} />}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ ...typoSecondary('lg'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</div>
                            <div className="mono" style={{ fontSize: FONT.xs, color: T.textMuted, marginTop: 3 }}>
                              {d.learned}/{d.total} gelernt · {d.neu} neu
                            </div>
                          </div>
                          <div className="deck-actions">
                            {d.due > 0 && (
                              <span className="mono" style={{
                                background: T.primarySoft, color: T.primary, padding: `${SPACE.xs}px ${SPACE.md}px`, borderRadius: RADIUS.pill,
                                ...typoSecondary('sm'), whiteSpace: 'nowrap',
                              }}>
                                {d.due} fällig
                              </span>
                            )}
                            <button className="press" onClick={() => startStudy(d.key, d.label)} disabled={d.due === 0}
                              style={{ ...btnSecondary(T, 'sm'), opacity: d.due === 0 ? .4 : 1 }}>
                              Lernen <ChevronRight size={14} />
                            </button>
                          </div>
                        </div>
                        <div style={{ height: 6, borderRadius: RADIUS.pill, background: T.primarySoft, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${progress}%`, borderRadius: RADIUS.pill, background: T.primary, transition: 'width .4s ease' }} />
                        </div>
                      </div>
                    );
                  })}
                  {decks.length === 0 && (
                    <div style={{ padding: `${SPACE.xxl}px ${SPACE.lg}px`, textAlign: 'center' }}>
                      <BookOpen size={30} color={T.textSecondary} style={{ marginBottom: SPACE.md, opacity: .6 }} />
                      <div style={{ ...typoH2(), marginBottom: SPACE.xs }}>Noch keine Karten</div>
                      <div style={{ color: T.textSecondary, ...typoBody(), marginBottom: SPACE.lg }}>
                        Leg deine ersten Vokabeln an – eine Zeile pro Wort.
                      </div>
                      <button className="press" onClick={() => setView('add')} style={btnPrimary(T)}>
                        <Plus size={16} /> Vokabeln anlegen
                      </button>
                    </div>
                  )}
                </div>

                {difficultCards.length > 0 && (
                  <div style={{ marginTop: SPACE.xxxl }}>
                    <div style={{ ...typoSecondary('sm'), color: T.textSecondary, marginBottom: SPACE.md }}>Fehlerkartei</div>
                    {difficultCards.map((c, i) => (
                      <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: `${SPACE.sm}px 0`, ...(i > 0 ? divider(T) : null), gap: SPACE.md }}>
                        <span style={{ fontSize: FONT.md, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.type === 'gap' ? revealSentence(c.sentence) : `${c.front} → ${splitAnswer(c.back).answer}`}
                        </span>
                        <span className="mono" style={{ color: T.error, fontSize: FONT.sm, flexShrink: 0 }}>{c.wrong}×</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Aktivität */}
              <div style={{ minWidth: 0 }}>
                <div style={{ ...typoH2(), marginBottom: SPACE.md }}>Aktivität</div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE.sm, marginBottom: SPACE.xs }}>
                    <span className="mono" style={{ ...typoNumber(), color: T.primary }}>
                      {heatmap.weeks.flat().reduce((s, d) => s + d.count, 0)}
                    </span>
                    <span style={{ ...typoCaption(), color: T.textSecondary }}>Wiederholungen</span>
                  </div>
                  <div style={{ fontSize: FONT.xs, color: T.textMuted, marginBottom: SPACE.lg }}>in den letzten 12 Wochen</div>

                  <div style={{ overflowX: 'auto', paddingBottom: 2 }}>
                    <div style={{ display: 'flex', gap: 3, width: 'max-content' }}>
                      {heatmap.weeks.map((week, wi) => (
                        <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                          {week.map(d => {
                            const level = d.count === 0 ? 0 : Math.min(4, Math.ceil((d.count / heatmap.max) * 4));
                            const bg = level === 0 ? T.surface : hexToRgba(T.primary, 0.22 + 0.195 * level);
                            return <div key={d.date} className="stamp" title={`${d.date}: ${d.count} Wiederholungen`}
                              style={{ width: 12, height: 12, borderRadius: 3, background: bg, transition: 'outline-color .15s' }} />;
                          })}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: SPACE.md, fontSize: FONT.xs, color: T.textMuted }}>
                    <span>12 Wochen</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      weniger
                      {[0, 1, 2, 3, 4].map(level => (
                        <span key={level} style={{ width: 10, height: 10, borderRadius: 2, background: level === 0 ? T.surface : hexToRgba(T.primary, 0.22 + 0.195 * level) }} />
                      ))}
                      mehr
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ---------- ADD ---------- */}
        {view === 'add' && (
          <div>
            <div style={{ ...typoDisplay(), marginBottom: SPACE.lg }}>Hinzufügen</div>

            <div style={{ display: 'inline-flex', gap: 3, marginBottom: SPACE.xl, padding: 3, background: T.surfaceElevated, border: `1px solid ${T.border}`, borderRadius: RADIUS.pill }}>
              {[['vocab', 'Vokabeln', BookOpen], ['gap', 'Sätze', PenLine]].map(([key, label, Icon]) => (
                <button key={key} className="press" onClick={() => setAddTab(key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: SPACE.xs, padding: `${SPACE.sm}px ${SPACE.lg}px`,
                    border: 'none', borderRadius: RADIUS.pill, cursor: 'pointer', ...typoSecondary(),
                    background: addTab === key ? T.primary : 'transparent',
                    color: addTab === key ? T.primaryInk : T.textSecondary, transition: 'background .15s, color .15s',
                  }}>
                  <Icon size={15} /> {label}
                </button>
              ))}
            </div>

            {addTab === 'vocab' && (
              <div style={{ maxWidth: 620 }}>
                <label style={{ ...typoSecondary('sm'), color: T.textSecondary, display: 'block', marginBottom: SPACE.sm }}>Sprachpaar</label>
                <select value={pairIdx} onChange={e => setPairIdx(Number(e.target.value))}
                  style={{ ...inputStyle, maxWidth: 320, marginBottom: SPACE.lg, cursor: 'pointer' }}>
                  {VOCAB_PAIRS.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
                </select>

                <label style={{ ...typoSecondary('sm'), color: T.textSecondary, display: 'block', marginBottom: SPACE.sm }}>Vokabeln</label>
                <textarea value={addText} onChange={e => setAddText(e.target.value)}
                  placeholder={'casa = Haus\nperro = Hund\ncasa = Haus - Ich benutze ein Haus.'}
                  rows={8}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.7, fontFamily: "'IBM Plex Mono', monospace", fontSize: FONT.base }} />

                <div style={{ display: 'flex', gap: SPACE.sm, marginTop: SPACE.lg, flexWrap: 'wrap' }}>
                  <button className="press" onClick={handleAddVocab} style={btnPrimary(T)}><Plus size={16} /> Hinzufügen</button>
                  <button className="press" onClick={() => vocabFileRef.current.click()} style={btnSecondary(T)}>
                    <Upload size={15} /> Datei
                  </button>
                  <input ref={vocabFileRef} type="file" accept=".txt,.csv" style={{ display: 'none' }} onChange={e => readFileInto(e, setAddText)} />
                </div>
                <div style={{ marginTop: SPACE.lg, ...typoBody('sm'), color: T.textSecondary }}>
                  Eine Zeile pro Karte im Format <span className="mono">Wort = Übersetzung</span> (auch Komma oder Semikolon gehen). Optional mit Beispielsatz: <span className="mono">Übersetzung - Beispielsatz</span> (Bindestrich mit Leerzeichen davor und danach, oder <span className="mono">|</span>). Getippt werden muss dann nur die Übersetzung vor dem Strich – der Satz erscheint beim Aufdecken als Kontext. Eine hochgeladene .txt/.csv landet erst im Feld – du kannst sie also vorher prüfen.
                </div>
              </div>
            )}

            {addTab === 'gap' && (
              <div style={{ maxWidth: 620 }}>
                <label style={{ ...typoSecondary('sm'), color: T.textSecondary, display: 'block', marginBottom: SPACE.sm }}>Sprache</label>
                <select value={sentenceLangIdx} onChange={e => setSentenceLangIdx(Number(e.target.value))}
                  style={{ ...inputStyle, maxWidth: 320, marginBottom: SPACE.lg, cursor: 'pointer' }}>
                  {SENTENCE_LANGS.map(l => <option key={l} value={SENTENCE_LANGS.indexOf(l)}>{l}</option>)}
                </select>

                <label style={{ ...typoSecondary('sm'), color: T.textSecondary, display: 'block', marginBottom: SPACE.sm }}>Sätze</label>
                <textarea value={sentenceText} onChange={e => setSentenceText(e.target.value)}
                  placeholder={'Yo [como] fruta todos los días.\nElla [tiene] veinte años.\nNosotros [vivimos] en Berlín.'}
                  rows={8}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.7, fontFamily: "'IBM Plex Mono', monospace", fontSize: FONT.base }} />

                <div style={{ display: 'flex', gap: SPACE.sm, marginTop: SPACE.lg, flexWrap: 'wrap' }}>
                  <button className="press" onClick={handleAddSentences} style={btnPrimary(T)}><Plus size={16} /> Hinzufügen</button>
                  <button className="press" onClick={() => sentenceFileRef.current.click()} style={btnSecondary(T)}>
                    <Upload size={15} /> Datei
                  </button>
                  <input ref={sentenceFileRef} type="file" accept=".txt,.csv" style={{ display: 'none' }} onChange={e => readFileInto(e, setSentenceText)} />
                </div>
                <div style={{ marginTop: SPACE.lg, ...typoBody('sm'), color: T.textSecondary }}>
                  Die zu übende Form in <span className="mono">[eckige Klammern]</span> setzen – beim Lernen wird daraus eine Lücke. Kleine Tippfehler werden toleriert. Aktuell eine Lücke pro Zeile.
                </div>
              </div>
            )}
          </div>
        )}

        {/* ---------- BROWSE ---------- */}
        {view === 'browse' && (
          <div>
            <div style={{ ...typoDisplay(), marginBottom: SPACE.lg }}>Karten</div>

            <div style={{ display: 'flex', gap: SPACE.sm, marginBottom: SPACE.lg, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
                <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: T.textSecondary, pointerEvents: 'none' }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suchen…"
                  style={{ ...inputStyle, paddingLeft: 40 }} />
              </div>
              <select value={filter} onChange={e => setFilter(e.target.value)}
                style={{ ...inputStyle, width: 'auto', cursor: 'pointer' }}>
                <option value="all">Alle</option>
                <option value="vocab">Nur Vokabeln</option>
                <option value="gap">Nur Sätze</option>
                <option value="new">Neu</option>
                <option value="due">Heute fällig</option>
                <option value="difficult">Schwierig</option>
              </select>
              <button className="press" onClick={exportJSON} style={btnSecondary(T)}><Download size={15} /> Export</button>
              <button className="press" onClick={() => importFileRef.current.click()} style={btnSecondary(T)}><Upload size={15} /> Import</button>
              <input ref={importFileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={importJSON} />
            </div>

            {exportText !== null && (
              <div className="rise-in" style={{ ...surfaceSoft(T), padding: SPACE.lg, marginBottom: SPACE.lg }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.md }}>
                  <div style={{ ...typoSecondary() }}>Sicherung</div>
                  <button className="press" onClick={() => setExportText(null)} style={btnGhost(T)}>Schließen</button>
                </div>
                <textarea ref={exportTextareaRef} readOnly value={exportText} rows={5}
                  onFocus={e => e.target.select()}
                  style={{ ...inputStyle, background: T.background, fontSize: FONT.xs, fontFamily: "'IBM Plex Mono', monospace", resize: 'vertical' }} />
                <div style={{ display: 'flex', gap: SPACE.md, marginTop: SPACE.md, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button className="press" onClick={copyExportText} style={btnPrimary(T)}>Kopieren</button>
                  <span style={{ fontSize: FONT.sm, color: T.textSecondary }}>z. B. in eine Notiz-App einfügen und aufbewahren.</span>
                </div>
              </div>
            )}

            <div style={{ fontSize: FONT.sm, color: T.textSecondary, marginBottom: SPACE.md }}>{filtered.length} Karte(n)</div>
            {/* Auch hier eine Liste statt vieler Einzelkarten - bei hunderten
                Eintraegen waere jede eigene Umrandung nur Unruhe. */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {filtered.map((c, i) => (
                <div key={c.id} className="row-link" style={{
                  padding: `${SPACE.md}px ${SPACE.md}px`, borderRadius: RADIUS.md,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: SPACE.md,
                  ...(i > 0 ? divider(T) : null),
                }}>
                  <div style={{ minWidth: 0 }}>
                    {c.type === 'gap' ? (
                      <div style={{ ...typoSecondary(), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{revealSentence(c.sentence)}</div>
                    ) : (
                      <div style={{ ...typoSecondary() }}>{c.front} <span style={{ ...typoBody(), color: T.textSecondary }}>→</span> {splitAnswer(c.back).answer}</div>
                    )}
                    <div className="mono" style={{ fontSize: FONT.xs, color: T.textMuted, marginTop: 3 }}>
                      {c.type === 'gap' ? `Satz · ${c.language}` : `${c.langA} → ${c.langB}`} · fällig {c.dueDate} · {c.totalReviews || 0}×
                    </div>
                  </div>
                  <button className="press" onClick={() => deleteCard(c.id)} aria-label="Karte löschen"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textSecondary, flexShrink: 0, padding: 6, display: 'flex' }}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {filtered.length === 0 && (
                <div style={{ color: T.textSecondary, textAlign: 'center', padding: SPACE.xxl }}>
                  Keine Karten gefunden.
                </div>
              )}
            </div>

            {/* Selten gebraucht, deshalb hinter der Kartenliste - ohne Kasten
                muss die Reihenfolge die Rangfolge tragen. */}
            <div style={{ marginTop: SPACE.xxxl }}>
              <div style={{ ...typoSecondary(), marginBottom: SPACE.md }}>Sicherung einspielen</div>
              <textarea value={importPasteText} onChange={e => setImportPasteText(e.target.value)} rows={3}
                placeholder="Gesicherten Text hier einfügen…"
                style={{ ...inputStyle, background: T.background, fontSize: FONT.xs, fontFamily: "'IBM Plex Mono', monospace", resize: 'vertical' }} />
              <button className="press" onClick={importFromPaste} style={{ ...btnSecondary(T), marginTop: SPACE.md, opacity: importPasteText.trim() ? 1 : .5 }} disabled={!importPasteText.trim()}>
                Einfügen & importieren
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Navigationsleiste unten - schwebende Pille mittig statt einer
          Leiste von Rand zu Rand, damit sie nicht an den Bildschirmkanten klebt. */}
      <div className="nav-bottom" style={{
        position: 'fixed', left: '50%', bottom: `calc(${SPACE.lg}px + env(safe-area-inset-bottom))`,
        transform: 'translateX(-50%)', zIndex: 20,
        background: hexToRgba(T.surfaceElevated, .95), backdropFilter: 'blur(12px)',
        border: `1px solid ${T.border}`, borderRadius: RADIUS.pill,
        boxShadow: T.shadowLift, padding: SPACE.xs,
      }}>
        <div style={{ display: 'flex', gap: 2 }}>
          {navItems.map(([key, label, Icon]) => {
            const active = view === key;
            return (
              <button key={key} className="press" onClick={() => setView(key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: SPACE.xs, padding: `${SPACE.sm}px ${SPACE.md}px`,
                  borderRadius: RADIUS.pill, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                  background: active ? T.primarySoft : 'transparent',
                  color: active ? T.primary : T.textSecondary, ...typoSecondary('sm'),
                  transition: 'background .15s, color .15s',
                }}>
                <Icon size={17} strokeWidth={active ? 2.3 : 1.9} /> {label}
              </button>
            );
          })}
        </div>
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: `calc(${NAVBAR_H + SPACE.lg}px + env(safe-area-inset-bottom))`, left: '50%', transform: 'translateX(-50%)',
          background: T.textPrimary, color: T.background, padding: `${SPACE.md}px ${SPACE.xl}px`, borderRadius: RADIUS.pill,
          fontSize: FONT.md, maxWidth: '90vw', textAlign: 'center', boxShadow: T.shadowLift, zIndex: 30,
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
