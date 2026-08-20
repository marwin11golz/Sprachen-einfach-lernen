import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plus, Search, BarChart3, Layers, CheckCircle2, XCircle, Sun, Moon,
  Download, Trash2, Volume2, Upload, BookOpen, PenLine, ChevronRight, Repeat,
} from 'lucide-react';

import {
  levenshtein, todayISO,
  parseGapLine, revealSentence,
  deckKeyOf, deckLabelOf,
  newVocabCard, newGapCard,
  VOCAB_PAIRS, SENTENCE_LANGS,
} from './lib/srs.js';
import { THEMES, hexToRgba, SPACE, RADIUS, FONT, btnPrimary, btnSecondary, btnGhost, ratingBtn } from './lib/theme.js';
import { useVocabStore } from './hooks/useVocabStore.js';
import { useAuth } from './hooks/useAuth.js';
import { useCloudSync } from './hooks/useCloudSync.js';
import AuthScreen from './ui/AuthScreen.jsx';
import SyncBadge from './ui/SyncBadge.jsx';

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

  // Bei umgedrehter Vokabel werden Vorder- und Rückseite für Anzeige/Prüfung vertauscht
  const displayFront = current ? (current.type === 'vocab' && flipped ? current.back : current.front) : '';
  const displayBack = current ? (current.type === 'vocab' && flipped ? current.front : current.back) : '';

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

  const speak = (text) => {
    try {
      const u = new SpeechSynthesisUtterance(text);
      window.speechSynthesis.speak(u);
    } catch (e) {}
  };

  const sessionProgress = sessionTotal > 0 ? Math.max(0, Math.min(100, Math.round(((sessionTotal - queue.length) / sessionTotal) * 100))) : 0;

  return (
    <div style={{ background: T.bg, color: T.ink, minHeight: '100%', width: '100%', overflowX: 'hidden', fontFamily: "'IBM Plex Sans', sans-serif", transition: 'background .25s,color .25s' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        .mono { font-family: 'IBM Plex Mono', monospace; }
        button { font-family: inherit; }
        ::selection { background: ${T.accentSoft}; }
        .nav-btn:hover { opacity: .78; }
        .deck-row:hover { border-color: ${T.accent}; }
        .stamp:hover { outline: 1px solid ${T.accent}; }
        input, textarea, select { font-family: inherit; }
        ::-webkit-scrollbar { height: 8px; width: 8px; }
        .dash-grid { display: grid; grid-template-columns: minmax(0,1.3fr) minmax(0,1fr); gap: ${SPACE.lg}px; }
        .deck-actions { display: flex; flex-direction: column; align-items: flex-end; gap: ${SPACE.xs}px; flex-shrink: 0; }
        @media (max-width: 720px) {
          .dash-grid { grid-template-columns: minmax(0,1fr); }
        }
        /* Auf Handybreite passen Text und beide Knoepfe nicht mehr nebeneinander -
           die Knoepfe ruecken unter die Kartenbox-Angaben statt rechts herauszulaufen. */
        @media (max-width: 460px) {
          .deck-head { flex-wrap: wrap; }
          .deck-actions { flex-direction: row; align-items: center; width: 100%; justify-content: flex-end; gap: ${SPACE.md}px; }
        }
      `}</style>

      {/* Top Nav */}
      <div style={{ borderBottom: `1px solid ${T.border}`, position: 'sticky', top: 0, background: T.bg, zIndex: 10 }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: 'calc(14px + env(safe-area-inset-top)) 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: FONT.xxl, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Layers size={19} color={T.accent} /> Sprachen lernen
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {[
              ['dashboard', 'Dashboard', BarChart3],
              ['add', 'Hinzufügen', Plus],
              ['browse', 'Karten', Search],
            ].map(([key, label, Icon]) => (
              <button key={key} className="nav-btn" onClick={() => setView(key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: RADIUS.sm,
                  border: 'none', cursor: 'pointer', fontSize: FONT.base, fontWeight: 500,
                  background: view === key ? T.accentSoft : 'transparent',
                  color: view === key ? T.accent : T.inkSoft,
                }}>
                <Icon size={15} /> {label}
              </button>
            ))}
            <SyncBadge T={T} state={sync.syncState} onClick={() => setView('account')} />
            <button className="nav-btn" onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
              style={{ padding: 8, borderRadius: RADIUS.sm, border: `1px solid ${T.border}`, background: T.bgElev, cursor: 'pointer', color: T.ink }}>
              {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '26px 20px calc(90px + env(safe-area-inset-bottom))' }}>

        {storageWarning && (
          <div style={{ background: T.dangerSoft, color: T.danger, border: `1px solid ${T.danger}`, borderRadius: RADIUS.lg, padding: '12px 16px', marginBottom: 18, fontSize: FONT.base, lineHeight: 1.5 }}>
            {storageWarning}
          </div>
        )}

        {sync.accountConflict && (
          <div style={{ background: T.goldSoft, color: T.ink, border: `1px solid ${T.gold}`, borderRadius: RADIUS.lg, padding: '14px 16px', marginBottom: 18, fontSize: FONT.base, lineHeight: 1.6 }}>
            <strong>Anderes Konto erkannt.</strong> Auf diesem Gerät liegen
            {' '}{sync.accountConflict.cardCount} Karte(n), die zu einem anderen Konto gehören.
            Sollen sie in das jetzt angemeldete Konto übernommen werden?
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button onClick={() => sync.resolveAccountConflict(true)} style={btnPrimary(T, 'sm')}>
                Übernehmen
              </button>
              <button onClick={() => sync.resolveAccountConflict(false)} style={btnSecondary(T, 'sm')}>
                Nicht übernehmen
              </button>
            </div>
            <div style={{ fontSize: FONT.xs, color: T.inkSoft, marginTop: 10 }}>
              Eine Sicherungskopie des lokalen Standes wurde vorher automatisch angelegt.
            </div>
          </div>
        )}

        {/* ---------- KONTO ---------- */}
        {view === 'account' && (
          <AuthScreen
            T={T} auth={auth} sync={sync} cardCount={cards.length}
            onBack={() => setView('dashboard')}
          />
        )}

        {/* ---------- DASHBOARD ---------- */}
        {view === 'dashboard' && (
          <div>
            {/* Quick-Suche direkt im Dashboard */}
            <div style={{ position: 'relative', marginBottom: 20 }}>
              <Search size={16} style={{ position: 'absolute', left: 14, top: 13, color: T.inkSoft }} />
              <input
                value={dashSearch}
                onChange={e => setDashSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && dashSearch.trim()) goSearch(dashSearch.trim()); }}
                placeholder="Karten durchsuchen und zur Kartenansicht springen…"
                style={{ width: '100%', padding: '12px 14px 12px 38px', borderRadius: RADIUS.lg, border: `1px solid ${T.border}`, background: T.bgElev, color: T.ink, fontSize: FONT.md, boxShadow: T.shadow }}
              />
            </div>

            {/* Stat-Kacheln */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(124px,1fr))', gap: SPACE.sm, marginBottom: SPACE.xl }}>
              {[
                ['Fällig heute', dueCards.length, T.accent],
                ['Neue Karten', newCardsCount, T.gold],
                ['Wiederholungen', reviewCount, T.blue],
                // Einheit bewusst kleiner als die Zahl - sonst sprengt "0 Tage" in
                // grosser Schrift die schmale Kachel und wird abgeschnitten.
                ['Streak', <>{streak}<span style={{ fontSize: FONT.sm, fontWeight: 500 }}> Tage</span></>, T.danger],
                ['Gelernt', learnedCount, T.ink],
                ['Trefferquote', `${successRate}%`, T.success],
              ].map(([label, val, color]) => (
                <div key={label} style={{ background: T.bgElev, border: `1px solid ${T.border}`, borderRadius: RADIUS.lg, padding: '14px 16px', boxShadow: T.shadow, minWidth: 0 }}>
                  <div style={{ fontSize: FONT.xs, color: T.inkSoft, marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
                  <div className="mono" style={{ fontSize: FONT.xxl, fontWeight: 600, color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{val}</div>
                </div>
              ))}
            </div>

            <div className="dash-grid">
              {/* Kartenboxen / Decks */}
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ fontSize: FONT.xl, fontWeight: 700 }}>Kartenboxen</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button onClick={() => startStudy(null, null, false)} disabled={cards.length === 0}
                      style={{ ...btnSecondary(T, 'sm'), opacity: cards.length === 0 ? 0.5 : 1 }}>
                      <Repeat size={14} style={{ marginRight: 6 }} /> Alle wiederholen
                    </button>
                    <button onClick={() => startStudy(null, null)} disabled={dueCards.length === 0}
                      style={{ ...btnPrimary(T, 'sm'), opacity: dueCards.length === 0 ? 0.5 : 1 }}>
                      Alle fälligen lernen
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: FONT.sm, color: T.inkSoft, flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    Neue Karten/Tag:
                    <input
                      type="number" min={0} value={newCardsPerDay}
                      onChange={e => setNewCardsPerDay(Math.max(0, Number(e.target.value) || 0))}
                      style={{ width: 56, padding: '4px 6px', borderRadius: RADIUS.sm, border: `1px solid ${T.border}`, background: T.bgElev, color: T.ink, fontSize: FONT.sm }}
                    />
                  </label>
                  <span>·</span>
                  <span>heute {newIntroducedToday} eingeführt</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {decks.map(d => {
                    const color = d.type === 'gap' ? T.gold : T.accent;
                    const soft = d.type === 'gap' ? T.goldSoft : T.accentSoft;
                    const progress = d.total > 0 ? Math.round((d.learned / d.total) * 100) : 0;
                    return (
                      <div key={d.key} className="deck-row" style={{ background: T.bgElev, border: `1px solid ${T.border}`, borderRadius: RADIUS.lg, padding: '14px 16px', boxShadow: T.shadow, transition: 'border-color .15s' }}>
                        <div className="deck-head" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ width: 36, height: 36, borderRadius: RADIUS.md, background: soft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {d.type === 'gap' ? <PenLine size={17} color={color} /> : <BookOpen size={17} color={color} />}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: FONT.md, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.label}</div>
                            <div className="mono" style={{ fontSize: FONT.xs, color: T.inkSoft, marginTop: 2, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ color: d.due > 0 ? color : T.inkSoft, fontWeight: d.due > 0 ? 600 : 400 }}>{d.due} fällig</span>
                              <span>·</span><span>{d.neu} neu</span>
                              <span>·</span><span>{d.learned}/{d.total} gelernt</span>
                            </div>
                          </div>
                          <div className="deck-actions">
                            <button onClick={() => startStudy(d.key, d.label)} disabled={d.due === 0}
                              style={{ ...btnSecondary(T, 'sm'), opacity: d.due === 0 ? 0.4 : 1 }}>
                              Lernen <ChevronRight size={13} style={{ marginLeft: 2 }} />
                            </button>
                            <button onClick={() => startStudy(d.key, d.label, false)} style={btnGhost(T, 'sm')}>
                              <Repeat size={11} /> alle wiederholen
                            </button>
                          </div>
                        </div>
                        <div style={{ height: 5, borderRadius: RADIUS.sm, background: soft, marginTop: 12, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${progress}%`, borderRadius: RADIUS.sm, background: color, transition: 'width .3s' }} />
                        </div>
                      </div>
                    );
                  })}
                  {decks.length === 0 && (
                    <div style={{ background: T.bgElev, border: `1px dashed ${T.border}`, borderRadius: RADIUS.lg, padding: '28px 16px', textAlign: 'center', color: T.inkSoft, fontSize: FONT.base }}>
                      Noch keine Kartenboxen. Unter „Hinzufügen“ Vokabeln oder Lückensätze anlegen.
                    </div>
                  )}
                </div>

                {difficultCards.length > 0 && (
                  <div style={{ background: T.bgElev, border: `1px solid ${T.border}`, borderRadius: RADIUS.lg, padding: '14px 16px', marginTop: 16, boxShadow: T.shadow }}>
                    <div style={{ fontSize: FONT.sm, color: T.inkSoft, marginBottom: 8 }}>Fehlerkartei</div>
                    {difficultCards.map(c => (
                      <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderTop: `1px solid ${T.border}`, gap: 10 }}>
                        <span style={{ fontSize: FONT.base, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.type === 'gap' ? revealSentence(c.sentence) : `${c.front} → ${c.back}`}
                        </span>
                        <span className="mono" style={{ color: T.danger, fontSize: FONT.sm, flexShrink: 0 }}>{c.wrong} Fehler</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Stempel-Heatmap */}
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
                  <div style={{ fontSize: FONT.xl, fontWeight: 700 }}>Lern-Stempel</div>
                  <div className="mono" style={{ fontSize: FONT.xs, color: T.inkSoft }}>12 Wochen</div>
                </div>
                <div style={{ background: T.bgElev, border: `1px solid ${T.border}`, borderRadius: RADIUS.lg, padding: '20px 18px', boxShadow: T.shadow }}>
                  <div className="mono" style={{ fontSize: 24, fontWeight: 600, color: T.accent, marginBottom: 2 }}>
                    {heatmap.weeks.flat().reduce((s, d) => s + d.count, 0)}
                  </div>
                  <div style={{ fontSize: FONT.xs, color: T.inkSoft, marginBottom: 16 }}>Wiederholungen in den letzten 12 Wochen</div>

                  <div style={{ overflowX: 'auto' }}>
                    <div style={{ display: 'flex', gap: 4, width: 'max-content' }}>
                      {heatmap.weeks.map((week, wi) => (
                        <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {week.map(d => {
                            const level = d.count === 0 ? 0 : Math.min(4, Math.ceil((d.count / heatmap.max) * 4));
                            const bg = level === 0 ? T.heatEmpty : hexToRgba(T.accent, 0.2 + 0.2 * level);
                            return <div key={d.date} className="stamp" title={`${d.date}: ${d.count} Wiederholungen`}
                              style={{ width: 13, height: 13, borderRadius: 4, background: bg, border: level > 0 ? `1px solid ${hexToRgba(T.accent, 0.25)}` : 'none', transition: 'outline-color .15s' }} />;
                          })}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: FONT.xs, color: T.inkSoft }}>
                      <span>vor 12 Wochen</span>
                      <span>heute</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: FONT.xs, color: T.inkSoft, marginRight: 2 }}>weniger</span>
                      {[0, 1, 2, 3, 4].map(level => (
                        <div key={level} style={{ width: 11, height: 11, borderRadius: 3, flexShrink: 0, background: level === 0 ? T.heatEmpty : hexToRgba(T.accent, 0.2 + 0.2 * level) }} />
                      ))}
                      <span style={{ fontSize: FONT.xs, color: T.inkSoft, marginLeft: 2 }}>mehr</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ---------- ADD ---------- */}
        {view === 'add' && (
          <div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
              {[['vocab', 'Vokabeln', BookOpen], ['gap', 'Sätze & Konjugationen', PenLine]].map(([key, label, Icon]) => (
                <button key={key} onClick={() => setAddTab(key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px',
                    border: 'none', borderRadius: RADIUS.sm,
                    background: addTab === key ? T.accentSoft : 'transparent', cursor: 'pointer', fontSize: FONT.base, fontWeight: 500,
                    color: addTab === key ? T.accent : T.inkSoft,
                  }}>
                  <Icon size={15} /> {label}
                </button>
              ))}
            </div>

            {addTab === 'vocab' && (
              <div>
                <div style={{ fontSize: FONT.xl, fontWeight: 700, marginBottom: 14 }}>Vokabeln hinzufügen</div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: FONT.sm, color: T.inkSoft, display: 'block', marginBottom: 6 }}>Sprachpaar</label>
                  <select value={pairIdx} onChange={e => setPairIdx(Number(e.target.value))}
                    style={{ padding: '10px 12px', borderRadius: RADIUS.md, border: `1px solid ${T.border}`, background: T.bgElev, color: T.ink, width: '100%', maxWidth: 320 }}>
                    {VOCAB_PAIRS.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
                  </select>
                </div>
                <textarea value={addText} onChange={e => setAddText(e.target.value)}
                  placeholder={'Ein Wort pro Zeile, z. B.:\ncasa = Haus\nperro = Hund\ncomer = essen'}
                  rows={9}
                  style={{ width: '100%', padding: 14, borderRadius: RADIUS.lg, border: `1px solid ${T.border}`, background: T.bgElev, color: T.ink, fontSize: FONT.md, resize: 'vertical' }} />
                <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button onClick={handleAddVocab} style={btnPrimary(T)}>Hinzufügen</button>
                  <button onClick={() => vocabFileRef.current.click()} style={btnSecondary(T)}>
                    <Upload size={14} style={{ marginRight: 6 }} /> Datei hochladen
                  </button>
                  <input ref={vocabFileRef} type="file" accept=".txt,.csv" style={{ display: 'none' }} onChange={e => readFileInto(e, setAddText)} />
                </div>
                <div style={{ marginTop: 14, fontSize: FONT.sm, color: T.inkSoft }}>
                  Format: <span className="mono">Vorderseite = Rückseite</span> (auch Komma oder Semikolon als Trenner möglich), eine Zeile pro Karte. Eine .txt- oder .csv-Datei wird direkt in das Feld geladen, sodass du sie vor dem Import noch prüfen kannst.
                </div>
              </div>
            )}

            {addTab === 'gap' && (
              <div>
                <div style={{ fontSize: FONT.xl, fontWeight: 700, marginBottom: 14 }}>Sätze & Konjugationen hinzufügen</div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: FONT.sm, color: T.inkSoft, display: 'block', marginBottom: 6 }}>Sprache</label>
                  <select value={sentenceLangIdx} onChange={e => setSentenceLangIdx(Number(e.target.value))}
                    style={{ padding: '10px 12px', borderRadius: RADIUS.md, border: `1px solid ${T.border}`, background: T.bgElev, color: T.ink, width: '100%', maxWidth: 320 }}>
                    {SENTENCE_LANGS.map(l => <option key={l} value={SENTENCE_LANGS.indexOf(l)}>{l}</option>)}
                  </select>
                </div>
                <textarea value={sentenceText} onChange={e => setSentenceText(e.target.value)}
                  placeholder={'Ein Satz pro Zeile, die zu lernende Form in eckigen Klammern:\nYo [como] fruta todos los días.\nElla [tiene] veinte años.\nNosotros [vivimos] en Berlín.'}
                  rows={9}
                  style={{ width: '100%', padding: 14, borderRadius: RADIUS.lg, border: `1px solid ${T.border}`, background: T.bgElev, color: T.ink, fontSize: FONT.md, resize: 'vertical' }} />
                <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button onClick={handleAddSentences} style={btnPrimary(T)}>Hinzufügen</button>
                  <button onClick={() => sentenceFileRef.current.click()} style={btnSecondary(T)}>
                    <Upload size={14} style={{ marginRight: 6 }} /> Datei hochladen
                  </button>
                  <input ref={sentenceFileRef} type="file" accept=".txt,.csv" style={{ display: 'none' }} onChange={e => readFileInto(e, setSentenceText)} />
                </div>
                <div style={{ marginTop: 14, fontSize: FONT.sm, color: T.inkSoft }}>
                  Beim Lernen wird die Klammer durch eine Lücke ersetzt (z. B. „Yo ▁▁▁ fruta…“); du tippst die fehlende Form, kleine Tippfehler werden toleriert. Aktuell wird pro Zeile eine Lücke unterstützt.
                </div>
              </div>
            )}
          </div>
        )}

        {/* ---------- STUDY ---------- */}
        {view === 'study' && (
          <div>
            {!current ? (
              <div style={{ textAlign: 'center', padding: '80px 20px' }}>
                <CheckCircle2 size={38} color={T.success} style={{ marginBottom: 12 }} />
                <div style={{ fontSize: FONT.xl, fontWeight: 700, marginBottom: 6 }}>Session abgeschlossen</div>
                <div style={{ color: T.inkSoft, marginBottom: 20 }}>Alle fälligen Karten{deckLabel ? ` in „${deckLabel}“` : ''} für heute erledigt.</div>
                <button onClick={() => setView('dashboard')} style={btnPrimary(T)}>Zurück zum Dashboard</button>
              </div>
            ) : (
              <div style={{ maxWidth: 540, margin: '0 auto' }}>
                <div style={{ height: 4, borderRadius: RADIUS.sm, background: T.border, marginBottom: 10, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${sessionProgress}%`, background: T.accent, borderRadius: RADIUS.sm, transition: 'width .25s' }} />
                </div>
                <div className="mono" style={{ fontSize: FONT.sm, color: T.inkSoft, marginBottom: 14, textAlign: 'center' }}>
                  Noch {queue.length} Karte{queue.length !== 1 ? 'n' : ''} {deckLabel ? `· ${deckLabel}` : ''}
                </div>
                {current.type === 'vocab' && (
                  <div style={{ textAlign: 'center', marginBottom: 8 }}>
                    <button onClick={() => setFlipped(f => !f)} style={btnSecondary(T, 'sm')}>
                      <Repeat size={13} style={{ marginRight: 6 }} /> Umdrehen
                    </button>
                  </div>
                )}
                <div style={{ background: T.bgElev, border: `1px solid ${T.border}`, borderRadius: RADIUS.lg, padding: '44px 28px', textAlign: 'center', minHeight: 170, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14, boxShadow: T.shadow }}>
                  <div style={{ fontSize: current.type === 'gap' ? 19 : 23, fontWeight: 600, lineHeight: 1.4 }}>{displayFront}</div>
                  {(!isWriteInteraction || revealed) && (
                    <button onClick={() => speak(current.type === 'gap' ? revealSentence(current.sentence) : displayFront)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.inkSoft, alignSelf: 'center' }}><Volume2 size={16} /></button>
                  )}

                  {!isWriteInteraction && revealed && (
                    <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14, fontSize: FONT.xxl, color: T.accent, fontWeight: 600 }}>{displayBack}</div>
                  )}
                  {isWriteInteraction && (
                    <div style={{ marginTop: 8 }}>
                      {!revealed ? (
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                          <input autoFocus value={writeInput} onChange={e => setWriteInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && checkWrite()}
                            placeholder={current.type === 'gap' ? 'fehlende Form eingeben…' : 'Übersetzung eingeben...'}
                            style={{ padding: '10px 14px', borderRadius: RADIUS.md, border: `1px solid ${T.border}`, background: T.bg, color: T.ink, fontSize: FONT.lg, width: '70%', minWidth: 180 }} />
                          <button onClick={checkWrite} style={btnPrimary(T)}>Prüfen</button>
                        </div>
                      ) : (
                        <div>
                          <div style={{ color: writeResult?.ok ? T.success : T.danger, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', fontWeight: 600 }}>
                            {writeResult?.ok ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                            {writeResult?.ok ? 'Richtig' : 'Nicht ganz'}
                          </div>
                          <div style={{ fontSize: FONT.xxl, marginTop: 8, fontWeight: 600 }}>
                            {current.type === 'gap' ? revealSentence(current.sentence) : displayBack}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {!isWriteInteraction && !revealed && (
                  <div style={{ textAlign: 'center', marginTop: 20 }}>
                    <button onClick={() => setRevealed(true)} style={btnPrimary(T)}>Aufdecken (Leertaste)</button>
                  </div>
                )}
                {current.type === 'vocab' && (
                  <div style={{ textAlign: 'center', marginTop: 12 }}>
                    <button onClick={() => setStudyMode(m => m === 'classic' ? 'write' : 'classic')} style={{ ...btnGhost(T, 'sm'), textDecoration: 'underline' }}>
                      Modus: {studyMode === 'classic' ? 'Aufdecken' : 'Tippen'} (wechseln)
                    </button>
                  </div>
                )}
                {revealed && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginTop: 20 }}>
                    <button onClick={() => submitRating('again')} style={ratingBtn(T.danger, T.dangerSoft)}>Nochmal<span>1</span></button>
                    <button onClick={() => submitRating('hard')} style={ratingBtn(T.gold, T.goldSoft)}>Schwer<span>2</span></button>
                    <button onClick={() => submitRating('good')} style={ratingBtn(T.success, T.successSoft)}>Gut<span>3</span></button>
                    <button onClick={() => submitRating('easy')} style={ratingBtn(T.accent, T.accentSoft)}>Einfach<span>4</span></button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ---------- BROWSE ---------- */}
        {view === 'browse' && (
          <div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                <Search size={15} style={{ position: 'absolute', left: 12, top: 12, color: T.inkSoft }} />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suche nach Wort, Übersetzung, Satz..."
                  style={{ width: '100%', padding: '10px 12px 10px 34px', borderRadius: RADIUS.md, border: `1px solid ${T.border}`, background: T.bgElev, color: T.ink }} />
              </div>
              <select value={filter} onChange={e => setFilter(e.target.value)}
                style={{ padding: '10px 12px', borderRadius: RADIUS.md, border: `1px solid ${T.border}`, background: T.bgElev, color: T.ink }}>
                <option value="all">Alle</option>
                <option value="vocab">Nur Vokabeln</option>
                <option value="gap">Nur Sätze</option>
                <option value="new">Neu</option>
                <option value="due">Heute fällig</option>
                <option value="difficult">Schwierig</option>
              </select>
              <button onClick={exportJSON} style={btnSecondary(T)}><Download size={14} style={{ marginRight: 6 }} />Export</button>
              <button onClick={() => importFileRef.current.click()} style={btnSecondary(T)}><Upload size={14} style={{ marginRight: 6 }} />Import per Datei</button>
              <input ref={importFileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={importJSON} />
            </div>

            {exportText !== null && (
              <div style={{ background: T.bgElev, border: `1px solid ${T.border}`, borderRadius: RADIUS.lg, padding: 14, marginBottom: 16, boxShadow: T.shadow }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: FONT.base, fontWeight: 600 }}>Sicherung – Text kopieren und lokal ablegen</div>
                  <button onClick={() => setExportText(null)} style={btnGhost(T, 'sm')}>Schließen</button>
                </div>
                <textarea ref={exportTextareaRef} readOnly value={exportText} rows={6}
                  onFocus={e => e.target.select()}
                  style={{ width: '100%', padding: 10, borderRadius: RADIUS.md, border: `1px solid ${T.border}`, background: T.bg, color: T.ink, fontSize: FONT.xs, fontFamily: "'IBM Plex Mono', monospace" }} />
                <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <button onClick={copyExportText} style={btnPrimary(T)}>In Zwischenablage kopieren</button>
                  <span style={{ fontSize: FONT.xs, color: T.inkSoft }}>Tipp: kopierten Text z. B. in eine Notiz-App einfügen und dort als Sicherung aufbewahren.</span>
                </div>
              </div>
            )}

            <div style={{ background: T.bgElev, border: `1px dashed ${T.border}`, borderRadius: RADIUS.lg, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: FONT.base, fontWeight: 600, marginBottom: 8 }}>Oder: gesicherten Text wieder einfügen</div>
              <textarea value={importPasteText} onChange={e => setImportPasteText(e.target.value)} rows={4}
                placeholder="Zuvor kopierten Sicherungstext hier einfügen…"
                style={{ width: '100%', padding: 10, borderRadius: RADIUS.md, border: `1px solid ${T.border}`, background: T.bg, color: T.ink, fontSize: FONT.xs, fontFamily: "'IBM Plex Mono', monospace" }} />
              <button onClick={importFromPaste} style={{ ...btnSecondary(T), marginTop: 8 }} disabled={!importPasteText.trim()}>Einfügen & importieren</button>
            </div>
            <div style={{ fontSize: FONT.sm, color: T.inkSoft, marginBottom: 10 }}>{filtered.length} Karte(n)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map(c => (
                <div key={c.id} style={{ background: T.bgElev, border: `1px solid ${T.border}`, borderRadius: RADIUS.lg, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    {c.type === 'gap' ? (
                      <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{revealSentence(c.sentence)}</div>
                    ) : (
                      <div style={{ fontWeight: 600 }}>{c.front} <span style={{ color: T.inkSoft, fontWeight: 400 }}>→</span> {c.back}</div>
                    )}
                    <div className="mono" style={{ fontSize: FONT.xs, color: T.inkSoft, marginTop: 2 }}>
                      {c.type === 'gap' ? `Sätze · ${c.language}` : `${c.langA} → ${c.langB}`} · fällig {c.dueDate} · {c.totalReviews || 0}× wiederholt
                    </div>
                  </div>
                  <button onClick={() => deleteCard(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.danger, flexShrink: 0 }}><Trash2 size={16} /></button>
                </div>
              ))}
              {filtered.length === 0 && <div style={{ color: T.inkSoft, textAlign: 'center', padding: 40 }}>Keine Karten gefunden.</div>}
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: T.ink, color: T.bg, padding: '10px 18px', borderRadius: RADIUS.md, fontSize: FONT.md, maxWidth: '90vw', textAlign: 'center', boxShadow: T.shadow }}>
          {toast}
        </div>
      )}
    </div>
  );
}
