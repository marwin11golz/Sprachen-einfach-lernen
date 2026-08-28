import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plus, Search, BarChart3, Layers, CheckCircle2, XCircle, Sun, Moon, X,
  Download, Trash2, Volume2, Upload, BookOpen, PenLine, ChevronRight, Repeat,
  MinusCircle, Star, AlertTriangle,
} from 'lucide-react';

import {
  levenshtein, todayISO, cardSides,
  parseGapLine, revealSentence,
  deckKeyOf, deckLabelOf,
  newVocabCard, newGapCard,
  VOCAB_PAIRS, SENTENCE_LANGS, langCodeOf,
} from './lib/srs.js';
import { RETENTION } from './lib/fsrs.js';
import {
  THEMES, hexToRgba, SPACE, RADIUS, FONT, NAVBAR_H,
  btnPrimary, btnSecondary, btnGhost, btnOutline, pill, ratingBtn, surface, surfaceSoft, divider,
  typoDisplay, typoH1, typoH2, typoBody, typoSecondary, typoCaption, typoNumber,
} from './lib/theme.js';
import { useVocabStore } from './hooks/useVocabStore.js';
import { useAuth } from './hooks/useAuth.js';
import { useCloudSync } from './hooks/useCloudSync.js';
import AuthScreen from './ui/AuthScreen.jsx';
import SyncBadge from './ui/SyncBadge.jsx';
import SessionDone from './ui/SessionDone.jsx';
import StreakCelebration from './ui/StreakCelebration.jsx';

// Kennung des Fehlerkartei-Stapels. Kein echter Deck-Schluessel aus deckKeyOf,
// sondern eine eigene Marke - der Stapel schneidet quer durch alle Sprachpaare.
// Das Praefix kann mit keinem Sprachpaar kollidieren.
const DECK_FEHLER = '__fehlerkartei';

// Ab wie vielen erfolgreichen Bewertungen IN FOLGE seit dem letzten "Nochmal"
// eine einmal falsche Karte als erholt gilt und aus der Fehlerkartei faellt.
// `wrong` selbst zaehlt bewusst nie zurueck (Lernfortschritt soll nicht
// schrumpfen) - wuerde die Mitgliedschaft allein an `wrong > 0` haengen, waechst
// der Stapel nur noch, ganz gleich wie oft eine Karte seither richtig war. Bei
// laengerer Nutzung stuenden dort irgendwann hunderte laengst sitzende Karten,
// und "wiederholen" waere witzlos.
//
// `earlyStep` zaehlt bereits genau das Richtige mit: aufeinanderfolgende
// erfolgreiche Bewertungen seit dem letzten Fehler, zurueckgesetzt auf 0 bei
// jedem "Nochmal" (siehe rate() in srs.js) - ein zweites Feld dafuer waere
// dieselbe Information doppelt. Zaehlt mit, unabhaengig von der Staerke der
// Bewertung: auch eine Reihe aus "Schwer" ist erfolgreiches Erinnern, nur ein
// muehsameres.
const FEHLERKARTEI_ERHOLT = 3;

// Eine Stapelzeile: Name, Kartenzahl, Lernstand, Hauptaktion - in dieser
// Rangfolge. Kartenboxen und Fehlerkartei teilen sie sich, damit die
// Fehlerkartei sich wie ein Stapel anfuehlt und nicht wie ein Sonderfall.
function DeckZeile({ T, icon, name, anzahl, neu, faellig, onLernen, lernbar, trenner }) {
  // Jeder Wert steht fuer sich. Ist nichts faellig, sagt die Zeile das auch -
  // vorher verschwand die Angabe wortlos und die Zeile wirkte unvollstaendig.
  const werte = [
    { text: `${anzahl} ${anzahl === 1 ? 'Karte' : 'Karten'}`, ton: 'neutral' },
    ...(neu > 0 ? [{ text: `${neu} neu`, ton: 'neutral' }] : []),
    faellig > 0
      ? { text: `${faellig} fällig`, ton: 'aktiv' }
      : { text: 'heute nichts fällig', ton: 'neutral' },
  ];
  return (
    <div className="row-link" style={{
      display: 'flex', alignItems: 'center', gap: SPACE.md,
      padding: `${SPACE.lg}px ${SPACE.md}px`,
      ...(trenner ? divider(T) : null),
    }}>
      {/* Ohne Kachel dahinter und in einer Farbe: das Symbol unterscheidet die
          Kategorie ueber seine Form, nicht ueber einen eigenen Farbton. */}
      <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...typoBody('lg'), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {name}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: SPACE.xs, marginTop: SPACE.sm }}>
          {werte.map(w => <span key={w.text} style={pill(T, w.ton)}>{w.text}</span>)}
        </div>
      </div>
      <button className="press" onClick={onLernen} disabled={!lernbar}
        style={{ ...btnOutline(T, 'sm'), flexShrink: 0, opacity: lernbar ? 1 : .4 }}>
        Lernen <ChevronRight size={14} />
      </button>
    </div>
  );
}

// Wiederholungen je Woche als Balken, darueber der gleitende Schnitt ueber drei
// Wochen. Von Hand gezeichnet wie der Ring darunter - ein Diagrammpaket kostet
// rund 100 kB gzip und braechte eine zweite Styling-Ebene neben die Design-Tokens.
//
// Balken sind HTML, nur die Trendlinie ist SVG: eine Flaeche, die in der Breite
// mitwaechst, verzieht als SVG-Rechteck ihre Ecken, als div nicht. Die Linie
// darf sich verziehen, solange die Strichstaerke es nicht tut - dafuer
// vectorEffect.
function WochenDiagramm({ T, wochen }) {
  const max = Math.max(1, ...wochen.map(w => w.count));
  const spitze = wochen.reduce((a, b) => (b.count > a.count ? b : a), wochen[0]);
  const schnitt = wochen.map((_, i) => {
    const teil = wochen.slice(Math.max(0, i - 2), i + 1);
    return teil.reduce((s, w) => s + w.count, 0) / teil.length;
  });
  const punkte = schnitt
    .map((v, i) => `${(i + 0.5) * (100 / wochen.length)},${100 - (v / max) * 100}`)
    .join(' ');
  const HOEHE = 96;
  // Platz ueber den Balken fuer die Beschriftung des Hoechstwerts. Die Balken
  // muessen darunter bleiben, sonst schiebt die Zahl den hoechsten Balken heraus.
  const KOPF = 16;
  return (
    <div>
      {/* Die Grundlinie liegt am Behaelter, nicht an den Balken: so hat das
          Diagramm auch dann eine Achse, wenn keine einzige Woche einen Balken
          traegt - eine ruhige Woche sieht sonst aus wie fehlende Daten. */}
      <div style={{ position: 'relative', height: HOEHE, borderBottom: `1px solid ${T.hairline}` }}>
        {/* Die 2 px Luft zwischen den Balken sind keine Layout-Abstufung, sondern
            Diagramm-Geometrie: benachbarte Flaechen trennt der Spalt, kein Rand. */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: '100%', paddingTop: KOPF, boxSizing: 'border-box' }}>
          {wochen.map(w => (
            // Der Streifen nimmt die volle Spaltenbreite (Trefferflaeche und
            // gleicher Raster wie die Trendlinie), der Balken darin ist auf 24 px
            // gedeckelt und mittig. Die Deckelung am Streifen selbst haette die
            // Balken links zusammengeschoben - sie staenden dann nicht mehr unter
            // ihrem Punkt auf der Linie.
            <div key={w.ab} title={`Woche ab ${w.ab}: ${w.count} Wiederholungen`}
              style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center' }}>
              {w === spitze && w.count > 0 && (
                <div className="nums" style={{ fontSize: FONT.xs, color: T.textMuted, lineHeight: 1, marginBottom: SPACE.xs }}>{w.count}</div>
              )}
              <div style={{
                width: '100%', maxWidth: 24,
                height: w.count === 0 ? 0 : `${Math.max(4, (w.count / max) * 100)}%`,
                background: T.primary,
                borderRadius: `${RADIUS.sm}px ${RADIUS.sm}px 0 0`,
                transition: 'height .3s ease',
              }} />
            </div>
          ))}
        </div>
        {/* Oben um KOPF eingerueckt, damit Linie und Balken denselben Massstab
            haben. preserveAspectRatio="none" verzerrt die Flaeche - die
            Strichstaerke haelt vectorEffect davon fern.
            Hoehe und Breite muessen ausgeschrieben stehen: mit top/bottom allein
            nimmt das SVG seine eigene Groesse an (ein quadratisches viewBox wurde
            640 px hoch statt 80) und die Linie landet weit unter dem Diagramm. */}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none"
          style={{ position: 'absolute', top: KOPF, left: 0, width: '100%', height: HOEHE - KOPF, pointerEvents: 'none' }}>
          <polyline points={punkte} fill="none" stroke={T.textSecondary} strokeWidth={2}
            strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: SPACE.sm, fontSize: FONT.xs, color: T.textMuted }}>
        <span>{wochen[0].ab}</span>
        <span>{wochen[wochen.length - 1].ab}</span>
      </div>
    </div>
  );
}

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
  // Bewertungen DIESER Sitzung, fuer die Trefferquote auf dem
  // Abschlussbildschirm. Bewusst nicht aus den Karten abgeleitet: dort stehen
  // die Zaehler ueber die ganze Lebensdauer, und "85 % in dieser Sitzung" ist
  // etwas anderes als "85 % seit es diese Karte gibt".
  const [sessionRatings, setSessionRatings] = useState({ richtig: 0, gesamt: 0 });
  // Ob die Serie durch DIESE Sitzung weitergegangen ist - beim Start gemerkt,
  // weil danach schon die eigene Aktivitaet mitzaehlt.
  const [streakNeu, setStreakNeu] = useState(false);
  // Nach SessionDone kommt die grosse Streak-Feier nur, wenn streakNeu gilt -
  // sonst geht es direkt zum Dashboard. Eigener Schalter statt streakNeu
  // direkt zu lesen: SessionDone ist trotzdem IMMER der erste Bildschirm,
  // auch an einem Streak-Tag - die Feier folgt erst auf "Zur Übersicht".
  const [zeigeStreakFeier, setZeigeStreakFeier] = useState(false);
  const [current, setCurrent] = useState(null);
  // Zwei getrennte Dinge, die frueher ein einziger Schalter waren:
  //
  //   revealed         - die Antwort ist heraus. Einwegschalter je Karte: ab
  //                      hier stehen die Bewertungsknoepfe, und im Tippmodus
  //                      kommt das Eingabefeld nicht zurueck.
  //   zeigtRueckseite  - welche Seite gerade oben liegt. Frei umschaltbar,
  //                      so oft man will.
  //
  // Zusammengelegt hiess das: einmal aufgedeckt, und die Frage war fuer immer
  // weg. Wer nach dem Aufdecken noch einmal auf das spanische Wort schauen
  // wollte, musste die Karte durchbewerten und auf die naechste Runde warten.
  const [revealed, setRevealed] = useState(false);
  const [zeigtRueckseite, setZeigtRueckseite] = useState(false);
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
  // Neue Karten, die HEUTE schon zum ersten Mal bewertet wurden - aus den
  // Karten abgeleitet statt in einem eigenen Zaehler mitgefuehrt, damit
  // mehrere Sitzungen am selben Tag und ein Cloud-Abgleich dazwischen den
  // Zaehler nicht verfaelschen koennen.
  const newIntroducedToday = useMemo(
    () => cards.filter(c => c.totalReviews === 1 && c.lastReviewed === todayISO()).length,
    [cards],
  );
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

  // Wiederholungen der letzten 12 Wochen, je Woche zusammengezaehlt. Vorher lag
  // hier eine Stempel-Heatmap ueber 84 einzelne Tage; bei einer Handvoll
  // Wiederholungen im Quartal standen dort 80 leere Kaestchen. Die Wochensumme
  // zeigt dieselbe Aktivitaet als Verlauf, ohne die Leere zu betonen.
  const wochen = useMemo(() => {
    const tage = [];
    for (let i = 83; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      tage.push({ date: iso, count: activity[iso] || 0 });
    }
    const out = [];
    for (let i = 0; i < tage.length; i += 7) {
      const block = tage.slice(i, i + 7);
      out.push({ ab: block[0].date.slice(5), count: block.reduce((s, t) => s + t.count, 0) });
    }
    return out;
  }, [activity]);
  const wochenSumme = useMemo(() => wochen.reduce((s, w) => s + w.count, 0), [wochen]);

  // Die Fehlerkartei ist ein Stapel wie jeder andere: sie sammelt automatisch,
  // was schon einmal falsch war - und laesst wieder los, was sich seitdem
  // erholt hat (siehe FEHLERKARTEI_ERHOLT oben).
  const isDifficult = (c) => (c.wrong || 0) > 0 && (c.earlyStep ?? 0) < FEHLERKARTEI_ERHOLT;
  const difficultDeck = useMemo(() => {
    const list = cards.filter(isDifficult)
      .sort((a, b) => (b.wrong / (b.totalReviews || 1)) - (a.wrong / (a.totalReviews || 1)));
    return { total: list.length, due: list.filter(c => c.dueDate <= todayISO()).length };
  }, [cards]);

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
    // Die Fehlerkartei laesst sich nicht ueber deckKeyOf bilden - sie schneidet
    // quer durch alle Sprachpaare. Nur die Auswahl des Stapels ist hier neu;
    // Bewertung, Intervalle und Tageslimit bleiben unberuehrt.
    let pool = key === DECK_FEHLER
      ? source.filter(isDifficult)
      : key ? source.filter(c => deckKeyOf(c) === key) : source;
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
    setSessionRatings({ richtig: 0, gesamt: 0 });
    // Vor der ersten Bewertung gemerkt: war heute noch nichts, dann traegt
    // diese Sitzung die Serie weiter, und der Abschluss darf das feiern.
    setStreakNeu(reviewsToday === 0);
    setZeigeStreakFeier(false);
    setCurrent(null);
    setView('study');
  };
  useEffect(() => {
    if (view === 'study' && !current && queue.length > 0) {
      setCurrent(queue[0]);
      setRevealed(false); setZeigtRueckseite(false);
      setWriteInput(''); setWriteResult(null);
    }
    if (view === 'study' && queue.length === 0 && current) setCurrent(null);
  }, [queue, view, current]);

  const submitRating = (ratingKey) => {
    if (!current) return;
    // Der Store bewertet die aktuell gespeicherte Karte, nicht die
    // Momentaufnahme aus der Warteschlange, und zaehlt den Lerntag mit.
    const updated = rateCard(current.id, ratingKey);
    if (!updated) { setCurrent(null); return; }
    setSessionRatings(p => ({
      richtig: p.richtig + (ratingKey === 'again' ? 0 : 1),
      gesamt: p.gesamt + 1,
    }));
    let rest = queue.slice(1);
    // Zurueck in die Warteschlange kommt, was heute noch einmal drankommen
    // soll: eine vergessene Karte, und der Zehn-Minuten-Schritt der festen
    // Anfangsphase (Intervall 0). Ein Datum kann keine zehn Minuten
    // ausdruecken - dass die Karte in derselben Sitzung wiederkehrt, ist die
    // Entsprechung dazu.
    if (ratingKey === 'again' || updated.interval === 0) {
      const pos = Math.min(rest.length, 3);
      rest = [...rest.slice(0, pos), updated, ...rest.slice(pos)];
    }
    setQueue(rest);
    setCurrent(null);
  };

  // Bei umgedrehter Vokabel werden Vorder- und Rückseite für Anzeige/Prüfung vertauscht.
  // Ein "|" trennt auf jeder Seite die Antwort von ihrem Beispielsatz - getippt
  // und geprueft wird nur die Antwort.
  const sides = cardSides(current);
  // Beim umgedrehten Lernen tauschen die Seiten, der Satz wandert mit seiner
  // Sprache. So kann der Satz der Rueckseite nicht mehr vorne stehen und die
  // Antwort verraten.
  const frontParts = current?.type === 'vocab' && flipped ? sides.back : sides.front;
  const backParts = current?.type === 'vocab' && flipped ? sides.front : sides.back;
  const displayFront = frontParts.answer;
  const displayBack = backParts.answer;
  const frontExample = frontParts.example;
  const backExample = backParts.example;

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
    setZeigtRueckseite(true);
  };

  const isWriteInteraction = current && (current.type === 'gap' || studyMode === 'write');
  // Die Karte laesst sich antippen, sobald die Eingabe nicht mehr umgangen
  // werden kann: im Aufdeck-Modus immer, im Tippmodus erst nach dem Pruefen.
  const kannDrehen = current && (revealed || !isWriteInteraction);

  // Erstes Antippen deckt auf, jedes weitere dreht nur noch die Karte. Beides
  // liegt auf derselben Geste, weil es fuer den Lernenden dieselbe Bewegung
  // ist - die Karte umdrehen.
  const dreheKarte = () => {
    if (!revealed) { setRevealed(true); setZeigtRueckseite(true); }
    else setZeigtRueckseite(s => !s);
  };

  // Tastatursteuerung
  useEffect(() => {
    if (view !== 'study') return;
    const handler = (e) => {
      // Solange das Eingabefeld steht, gehoert die Leertaste dorthin.
      if (e.code === 'Space' && (revealed || !isWriteInteraction)) {
        e.preventDefault();
        dreheKarte();
      }
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
    // retention faehrt als fester Wert mit: die Spanischcoach-Skill liest sie
    // aus der JSON, und so bleibt die Datei auch dann eindeutig, wenn sie in
    // einem Stand landet, der die Zielretention noch fuer einstellbar haelt.
    setExportText(JSON.stringify({ schemaVersion: 2, cards: allCards, activityLog: activity, flipped, retention: RETENTION }, null, 2));
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

  // Kleine Pille fuer beilaeufige Angaben auf einer Karte (Sprachrichtung,
  // "Beispielsatz"). Sitzt auf der erhabenen Flaeche, deshalb eine Stufe darunter.
  const chipStyle = {
    display: 'inline-flex', alignItems: 'center', gap: SPACE.xs,
    background: T.surface, color: T.textSecondary,
    padding: `${SPACE.xs}px ${SPACE.md}px`, borderRadius: RADIUS.pill,
    ...typoCaption(),
  };
  // Runder Knopf fuer das Vorlesen - als Flaeche erkennbar, nicht als loses Symbol.
  const roundIconBtn = {
    width: 40, height: 40, borderRadius: RADIUS.pill, border: 'none',
    background: T.surface, color: T.textSecondary, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    marginTop: SPACE.md,
  };

  const globalCss = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, sans-serif; }
    /* Fuer Kennzahlen bewusst NICHT IBM Plex Mono: deren Null traegt einen
       fest ins Zeichen eingebackenen Punkt in der Mitte (kein Schrift-Feature
       schaltet ihn ab, das ist die einzige Form, die die Schrift hat) - bei
       "0 Karten fällig" faellt das staendig ins Auge. Inter zeigt eine
       schlichte Null, tabular-nums haelt die Ziffern trotzdem spaltenbuendig. */
    .nums { font-family: 'Inter', sans-serif; font-variant-numeric: tabular-nums; }
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

    /* Die Lernkarte kommt bei jedem Wechsel kurz herein - das macht den
       Kartenwechsel sichtbar, ohne den Lernfluss zu bremsen. */
    @keyframes cardIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
    .card-in { animation: cardIn .22s ease-out; }
    @keyframes riseIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
    .rise-in { animation: riseIn .2s ease-out; }

    /* Abschluss einer Lernsitzung (siehe ui/SessionDone.jsx). Alles laeuft
       ueber animation-delay gestaffelt ein; "backwards" haelt die Elemente
       waehrend ihrer Wartezeit im Anfangszustand, ohne dass sie einen
       versteckten Grundzustand brauchen - faellt die Animation weg
       (Bewegung reduzieren), stehen sie schlicht fertig da.
       Die Kurve mit Ueberschwingen ist der back-ease aus dem Entwurf. */
    @keyframes dcScreen { from { opacity: 0; transform: scale(.94) translateY(24px); } to { opacity: 1; transform: none; } }
    @keyframes dcCheck  { from { opacity: 0; transform: scale(.5); } to { opacity: 1; transform: scale(1); } }
    @keyframes dcRise   { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
    @keyframes dcPop    { 0% { transform: scale(1); } 45% { transform: scale(1.32); } 100% { transform: scale(1); } }
    @keyframes dcGlow   { from { opacity: .5; transform: scale(.6); } to { opacity: 0; transform: scale(1.9); } }
    .dc-screen { animation: dcScreen .5s cubic-bezier(.34,1.4,.64,1) backwards; }
    .dc-check  { animation: dcCheck .55s cubic-bezier(.34,1.56,.64,1) backwards; }
    .dc-rise   { animation: dcRise .5s cubic-bezier(.33,1,.68,1) backwards; }
    .dc-pop    { animation: dcPop .5s ease-out backwards; }
    /* "both", nicht "backwards": der Ring soll nach dem Auslaufen
       verschwunden BLEIBEN. Mit "backwards" faellt er am Ende auf seinen
       normalen Stil zurueck - und der ist voll sichtbar. */
    .dc-glow   { animation: dcGlow 1.1s ease-out both; }

    @media (prefers-reduced-motion: reduce) {
      .card-in, .rise-in { animation: none; }
      /* Ohne Bewegung zaehlen auch die Zahlen nicht hoch - das erledigt
         useHochzaehlen in SessionDone.jsx selbst. */
      .dc-screen, .dc-check, .dc-rise, .dc-pop { animation: none; }
      .dc-glow { display: none; }
      .press:active { transform: none; }
    }

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

        {/* Kopfzeile: Zaehler mittig, Fortschritt als eigene Zeile darunter ueber
            die volle Breite - so bleibt der Stand ablesbar, ohne die Zeile zu
            teilen. Der Schliessen-Knopf steht fuer sich links. */}
        <div style={{
          padding: `calc(${SPACE.md}px + env(safe-area-inset-top)) ${SPACE.lg}px 0`,
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: SPACE.md }}>
            <button className="press" onClick={() => setView('dashboard')} aria-label="Lernen beenden"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textSecondary, padding: 4, display: 'flex' }}>
              <X size={22} />
            </button>
            <div style={{ flex: 1, textAlign: 'center', ...typoSecondary('lg'), color: T.textPrimary }}>
              {Math.min(sessionDone + 1, sessionTotal)} / {sessionTotal}
            </div>
            {/* Gleicht den Schliessen-Knopf aus, damit der Zaehler wirklich mittig steht. */}
            <div style={{ width: 30, flexShrink: 0 }} />
          </div>
          <div style={{ height: 5, borderRadius: RADIUS.pill, background: T.surfaceElevated, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${sessionProgress}%`, background: T.primary, borderRadius: RADIUS.pill, transition: 'width .3s ease' }} />
          </div>
        </div>

        {!current ? (
          zeigeStreakFeier ? (
            <StreakCelebration T={T} days={streak} onDone={() => setView('dashboard')} />
          ) : (
            <SessionDone
              T={T}
              sessionTotal={sessionTotal}
              trefferquote={sessionRatings.gesamt > 0
                ? Math.round((sessionRatings.richtig / sessionRatings.gesamt) * 100)
                : 0}
              streak={streak}
              streakNeu={streakNeu}
              // An einem Streak-Tag geht es nicht direkt zum Dashboard,
              // sondern erst zur grossen Feier - SessionDone bleibt trotzdem
              // fuer jede Sitzung der erste Bildschirm.
              onDone={() => (streakNeu ? setZeigeStreakFeier(true) : setView('dashboard'))}
            />
          )
        ) : (
          <>
            {/* Eine Karte, die umblaettert: vorne die Frage mit dem Satz ihrer
                Sprache, nach dem Aufdecken die Uebersetzung mit ihrem. Die Frage
                ist dann nicht mehr zu sehen - wie bei einer echten Karteikarte. */}
            <div style={{
              flex: 1, minHeight: 0, overflowY: 'auto',
              padding: `${SPACE.lg}px ${SPACE.lg}px ${SPACE.xl}px`,
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center',
            }}>
              <div
                key={current.id + String(zeigtRueckseite)}
                className="card-in"
                onClick={kannDrehen ? dreheKarte : undefined}
                role={kannDrehen ? 'button' : undefined}
                tabIndex={kannDrehen ? 0 : undefined}
                aria-label={kannDrehen
                  ? (revealed ? 'Karte umdrehen' : 'Karte aufdecken')
                  : undefined}
                onKeyDown={kannDrehen
                  ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); dreheKarte(); } }
                  : undefined}
                style={{
                  ...surface(T), width: '100%', maxWidth: 520, flexShrink: 0,
                  textAlign: 'center', padding: `${SPACE.xxl}px ${SPACE.xl}px`,
                  cursor: kannDrehen ? 'pointer' : 'default',
                  backgroundImage: `linear-gradient(155deg, ${T.primarySoft}, ${T.surfaceElevated} 55%)`,
                }}>
                {/* Sobald die Karte aufgedeckt ist, sagt das Drehsymbol neben der
                    Sprache, dass sie sich weiter umdrehen laesst. Vorher waere es
                    ein Versprechen, das die Karte noch nicht einloest. Gilt auch
                    fuer Lueckensaetze: dort wechselt das Drehen zwischen
                    aufgedeckter und wieder verdeckter Luecke. */}
                <div style={chipStyle}>
                  {revealed && <Repeat size={11} />}
                  {current.type === 'gap'
                    ? `Satz · ${current.language}`
                    : (zeigtRueckseite
                        ? (flipped ? current.langA : current.langB)
                        : `${flipped ? current.langB : current.langA} → ${flipped ? current.langA : current.langB}`)}
                </div>

                {revealed && isWriteInteraction && (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: SPACE.sm, ...typoSecondary(),
                    color: writeResult?.ok ? T.success : T.error,
                    background: writeResult?.ok ? T.successSoft : T.errorSoft,
                    padding: `${SPACE.sm}px ${SPACE.lg}px`, borderRadius: RADIUS.pill, marginTop: SPACE.lg,
                  }}>
                    {writeResult?.ok ? <CheckCircle2 size={17} /> : <XCircle size={17} />}
                    {writeResult?.ok ? 'Richtig' : 'Nicht ganz'}
                  </div>
                )}

                <div style={{ ...(current.type === 'gap' ? typoH2() : typoDisplay()), marginTop: SPACE.lg }}>
                  {zeigtRueckseite
                    ? (current.type === 'gap' ? revealSentence(current.sentence) : displayBack)
                    : displayFront}
                </div>

                {(!isWriteInteraction || revealed) && (
                  <div>
                    <button className="press"
                      onClick={e => {
                        e.stopPropagation();
                        if (current.type === 'gap') speak(revealSentence(current.sentence), zeigtRueckseite ? backLang : frontLang);
                        else speak(zeigtRueckseite ? displayBack : displayFront, zeigtRueckseite ? backLang : frontLang);
                      }}
                      aria-label={zeigtRueckseite ? `Antwort vorlesen (${backLang})` : `Vorlesen (${frontLang})`}
                      style={roundIconBtn}>
                      <Volume2 size={19} />
                    </button>
                  </div>
                )}

                {/* Jede Seite zeigt den Satz ihrer eigenen Sprache. */}
                {(zeigtRueckseite ? backExample : frontExample) && (
                  <div style={{ marginTop: SPACE.lg, paddingTop: SPACE.lg, ...divider(T) }}>
                    <div style={{ ...typoBody('lg'), color: T.textSecondary }}>
                      {zeigtRueckseite ? backExample : frontExample}
                    </div>
                  </div>
                )}

                {isWriteInteraction && !revealed && (
                  <div style={{ display: 'flex', gap: SPACE.sm, justifyContent: 'center', flexWrap: 'wrap', marginTop: SPACE.xl }}>
                    <input autoFocus value={writeInput} onChange={e => setWriteInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && checkWrite()}
                      placeholder={current.type === 'gap' ? 'fehlende Form eingeben…' : 'Übersetzung eingeben…'}
                      style={{ ...inputStyle, flex: 1, minWidth: 200, maxWidth: 300, textAlign: 'center', fontSize: FONT.lg }} />
                    <button className="press" onClick={checkWrite} style={btnPrimary(T)}>Prüfen</button>
                  </div>
                )}
              </div>
            </div>

            {/* Aktionsleiste unten - dort, wo der Daumen ohnehin liegt */}
            <div style={{
              flexShrink: 0, padding: `${SPACE.lg}px ${SPACE.lg}px calc(${SPACE.lg}px + env(safe-area-inset-bottom))`,
              background: T.background,
            }}>
              <div style={{ maxWidth: 520, margin: '0 auto' }}>
                {!revealed ? (
                  <>
                    {/* Aufgedeckt wird durch Antippen der Karte - ein eigener Knopf
                        daneben waere derselbe Befehl ein zweites Mal.
                        "Richtung" heisst hier bewusst nicht mehr "Umdrehen": es
                        dreht den ganzen Stapel (Spanisch→Deutsch statt umgekehrt)
                        und bleibt ueber Karten hinweg stehen, waehrend das
                        Umdrehen der Karte nur diese eine Karte betrifft. Zwei
                        Dinge, die dasselbe Wort trugen. */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: SPACE.lg }}>
                      {current.type === 'vocab' && (
                        <>
                          <button className="press" onClick={() => setFlipped(f => !f)} style={btnGhost(T)}>
                            <Repeat size={13} /> Richtung
                          </button>
                          <button className="press" onClick={() => setStudyMode(m => m === 'classic' ? 'write' : 'classic')} style={btnGhost(T)}>
                            {studyMode === 'classic' ? 'Tippen' : 'Aufdecken'}
                          </button>
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="rise-in">
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: SPACE.sm }}>
                      {[
                        ['again', 'Nochmal', T.error, T.errorSoft, XCircle],
                        ['hard', 'Schwer', T.warning, T.warningSoft, MinusCircle],
                        ['good', 'Gut', T.success, T.successSoft, CheckCircle2],
                        // "Einfach" ist die staerkste Stufe und traegt als einzige
                        // einen Rand - so ist sie ohne Farbvergleich zu finden.
                        ['easy', 'Einfach', T.primary, T.primarySoft, Star, true],
                      ].map(([key, label, color, bg, Icon, outlined]) => (
                        <button key={key} className="press" onClick={() => submitRating(key)}
                          style={{ ...ratingBtn(color, bg), border: outlined ? `1px solid ${color}` : '1px solid transparent' }}>
                          <Icon size={19} />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {toast && (
          <div style={{
            position: 'fixed', bottom: `calc(120px + env(safe-area-inset-bottom))`, left: '50%', transform: 'translateX(-50%)',
            background: T.surfaceElevated, color: T.textPrimary, border: `1px solid ${T.border}`,
            padding: `${SPACE.md}px ${SPACE.xl}px`, borderRadius: RADIUS.pill,
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
          <div style={{ maxWidth: 640, margin: '0 auto' }}>

            {/* ---- 1. Heute lernen ---- */}
            <div style={{ marginBottom: SPACE.xxxl }}>
              <div style={{ ...typoSecondary('sm'), color: T.textSecondary, marginBottom: SPACE.md }}>
                Heute lernen
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.xl, marginBottom: SPACE.xl }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE.sm }}>
                    <span className="nums" style={{ ...typoNumber('hero'), color: dueCards.length > 0 ? T.primary : T.textSecondary }}>
                      {dueCards.length}
                    </span>
                    <span style={{ ...typoSecondary(), color: T.textSecondary }}>
                      {dueCards.length === 1 ? 'Karte fällig' : 'Karten fällig'}
                    </span>
                  </div>
                  {/* Die Aufschluesselung "x neu · y Wiederholungen · z geschafft"
                      stand hier und buchstabierte die Zahl darueber nach. Der Ring
                      zeigt den Tagesfortschritt ohnehin, und neu/faellig steht je
                      Kartenbox - eine dritte Fassung derselben Auskunft braucht es nicht. */}
                </div>
                {/* Der Ring begleitet die Zahl, statt sie zu ueberstrahlen. */}
                <ProgressRing percent={dayPercent} track={T.primarySoft} color={T.primary} size={64} stroke={6} />
              </div>

              <div style={{ display: 'flex', gap: SPACE.sm, flexWrap: 'wrap' }}>
                <button className="press" onClick={() => startStudy(null, null)} disabled={dueCards.length === 0}
                  style={{ ...btnPrimary(T, 'lg'), flex: 1, minWidth: 200, opacity: dueCards.length === 0 ? .45 : 1, cursor: dueCards.length === 0 ? 'default' : 'pointer' }}>
                  Lernen starten <ChevronRight size={18} />
                </button>
                {/* Zurueckgenommen, damit "Lernen starten" die einzige gefuellte
                    Hauptaktion des Bildschirms bleibt. */}
                <button className="press" onClick={() => startStudy(null, null, false)} disabled={cards.length === 0}
                  style={{ ...btnOutline(T, 'lg'), opacity: cards.length === 0 ? .45 : 1 }}>
                  <Repeat size={16} /> Alle
                </button>
              </div>
            </div>

            {/* ---- 2. Statistiken ---- */}
            <div style={{ display: 'flex', gap: SPACE.xl, marginBottom: SPACE.xxxl, flexWrap: 'wrap' }}>
              {[
                // Eine Regel statt zwei fast gleicher Gruentoene: Kennzahlen tragen
                // T.primary. T.success/warning/error bleiben der unmittelbaren
                // Rueckmeldung vorbehalten (Bewertungsknoepfe, Meldungen). Die
                // Trefferquote trug bisher als einzige T.success - praktisch
                // derselbe Ton, aber eben nicht derselbe.
                ['Streak', `${streak}`, streak === 1 ? 'Tag' : 'Tage', streak > 0 ? T.primary : T.textSecondary],
                ['Gelernt', `${learnedCount}`, learnedCount === 1 ? 'Karte' : 'Karten', T.textPrimary],
                ['Trefferquote', `${successRate}`, '%', T.primary],
              ].map(([label, wert, einheit, farbe]) => (
                <div key={label} style={{ flex: 1, minWidth: 90 }}>
                  <div style={{ ...typoCaption(), color: T.textSecondary, marginBottom: SPACE.xs }}>{label}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE.xs }}>
                    <span className="nums" style={{ ...typoNumber(), color: farbe }}>{wert}</span>
                    <span style={{ ...typoCaption(), color: T.textMuted }}>{einheit}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* ---- 3. Kartenboxen ---- */}
            <div style={{ marginBottom: SPACE.xxxl }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: SPACE.md, gap: SPACE.sm }}>
                <div style={{ ...typoH2() }}>Kartenboxen</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.lg, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: SPACE.sm, fontSize: FONT.sm, color: T.textSecondary }}>
                    Neu/Tag:
                    <input
                      type="number" min={0} value={newCardsPerDay}
                      onChange={e => setNewCardsPerDay(Math.max(0, Number(e.target.value) || 0))}
                      style={{ width: 52, padding: `${SPACE.xs}px ${SPACE.sm}px`, borderRadius: RADIUS.sm, border: `1px solid ${T.border}`, background: T.surfaceElevated, color: T.textPrimary, fontSize: FONT.sm, textAlign: 'center' }}
                    />
                  </label>
                </div>
              </div>

              {/* Ein Behaelter mit eigenem Grund: auf dem fast schwarzen Seitengrund
                  verschwand die Liste sonst. Die Fehlerkartei liegt als letzte Zeile
                  darin (Punkt 4 der Reihenfolge) - stuende sie in einem eigenen Block,
                  klaffte zwischen zwei gleich aussehenden Zeilen ein Loch aus den
                  Abstaenden beider Bloecke. */}
              <div style={{ ...surfaceSoft(T), border: `1px solid ${T.hairline}`, padding: `0 ${SPACE.sm}px`, overflow: 'hidden' }}>
                {decks.map((d, i) => (
                  <DeckZeile
                    key={d.key} T={T} trenner={i > 0}
                    icon={d.type === 'gap' ? <PenLine size={18} strokeWidth={1.5} color={T.primary} /> : <BookOpen size={18} strokeWidth={1.5} color={T.primary} />}
                    name={d.label}
                    anzahl={d.total}
                    neu={d.neu}
                    faellig={d.due}
                    lernbar={d.due > 0}
                    onLernen={() => startStudy(d.key, d.label)}
                  />
                ))}
                {/* Dieselbe Zeilenform wie ein Deck - nur die Form des Symbols sagt,
                    dass sich dieser Stapel von selbst fuellt. */}
                {difficultDeck.total > 0 && (
                  <DeckZeile
                    T={T} trenner={decks.length > 0}
                    icon={<AlertTriangle size={18} strokeWidth={1.5} color={T.primary} />}
                    name="Fehlerkartei"
                    anzahl={difficultDeck.total}
                    faellig={difficultDeck.due}
                    lernbar
                    onLernen={() => startStudy(DECK_FEHLER, 'Fehlerkartei', false)}
                  />
                )}
                {decks.length === 0 && (
                  <div style={{ padding: `${SPACE.xxl}px ${SPACE.lg}px`, textAlign: 'center' }}>
                    <BookOpen size={30} strokeWidth={1.5} color={T.primary} style={{ marginBottom: SPACE.md, opacity: .6 }} />
                    <div style={{ ...typoH2(), marginBottom: SPACE.lg }}>Noch keine Karten</div>
                    <button className="press" onClick={() => setView('add')} style={btnPrimary(T)}>
                      <Plus size={16} /> Vokabeln anlegen
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ---- 5. Aktivität ---- */}
            <div>
              <div style={{ ...typoH2(), marginBottom: SPACE.md }}>Aktivität</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: SPACE.sm, marginBottom: SPACE.xs }}>
                <span className="nums" style={{ ...typoNumber(), color: T.primary }}>{wochenSumme}</span>
                <span style={{ ...typoCaption(), color: T.textSecondary }}>Wiederholungen</span>
              </div>
              <div style={{ fontSize: FONT.xs, color: T.textMuted, marginBottom: SPACE.lg }}>in den letzten 12 Wochen</div>

              <WochenDiagramm T={T} wochen={wochen} />
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
                  placeholder={'casa = Haus\nperro = Hund | Der Hund schläft.\ncasa | Vivo en una casa. = Haus | Ich wohne in einem Haus.'}
                  rows={8}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.7, fontFamily: "'IBM Plex Mono', monospace", fontSize: FONT.base }} />

                <div style={{ display: 'flex', gap: SPACE.sm, marginTop: SPACE.lg, flexWrap: 'wrap' }}>
                  <button className="press" onClick={handleAddVocab} style={btnPrimary(T)}><Plus size={16} /> Hinzufügen</button>
                  <button className="press" onClick={() => vocabFileRef.current.click()} style={btnSecondary(T)}>
                    <Upload size={15} /> Datei
                  </button>
                  <input ref={vocabFileRef} type="file" accept=".txt,.csv" style={{ display: 'none' }} onChange={e => readFileInto(e, setAddText)} />
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
                      <div style={{ ...typoSecondary() }}>{cardSides(c).front.answer} <span style={{ ...typoBody(), color: T.textSecondary }}>→</span> {cardSides(c).back.answer}</div>
                    )}
                    <div className="nums" style={{ fontSize: FONT.xs, color: T.textMuted, marginTop: 3 }}>
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
          background: T.surfaceElevated, color: T.textPrimary, border: `1px solid ${T.border}`,
            padding: `${SPACE.md}px ${SPACE.xl}px`, borderRadius: RADIUS.pill,
          fontSize: FONT.md, maxWidth: '90vw', textAlign: 'center', boxShadow: T.shadowLift, zIndex: 30,
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
