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
  nextInterval, hardInterval, STABILITY_MIN,
  earlyInterval, EARLY_COUNT,
} from './fsrs.js';

export const todayISO = () => new Date().toISOString().slice(0, 10);
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// Abstand zweier Lerntage in KALENDERTAGEN.
//
// Vorher wurde dafuer die Differenz zwischen der aktuellen UHRZEIT und
// Mitternacht des letzten Lerntags gerundet. Das zaehlte systematisch falsch:
// wer nachmittags lernte, lag ueber der halben Tagesgrenze und bekam bei
// JEDER Wiederholung einen Tag zu viel angerechnet (zwei Kalendertage Abstand
// wurden zu "elapsed = 3"). Das Modell hielt die Erinnerung dann fuer
// belastbarer als sie war, liess die Stabilitaet zu stark wachsen und schob
// die Karte immer weiter weg - genau die Beschwerde, dass gut gekonnte
// Vokabeln nie wiederkommen. Beide Daten sind reine Tagesstempel, also
// gehoert auch die Differenz auf Tagesebene gebildet.
export function daysBetween(fromISO, toISO) {
  const from = new Date(`${fromISO}T00:00:00.000Z`);
  const to = new Date(`${toISO}T00:00:00.000Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  return Math.max(0, Math.round((to - from) / 86400000));
}

const MONATE = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];

// Ein Faelligkeitsdatum als Angabe, die man beim Ueberfliegen versteht.
//
// In der Kartenliste stand bisher das rohe ISO-Datum ("fällig 2026-08-29").
// Das muss man gegen das heutige Datum im Kopf verrechnen, um zu wissen, ob
// eine Karte ansteht - bei einer Liste, die man ueberfliegt, ist das die
// falsche Arbeit. Nah am heutigen Tag zaehlt der Abstand, weiter weg wird das
// Datum selbst wieder aussagekraeftiger als "in 143 Tagen".
//
// daysBetween() taugt hier nicht: es klemmt bei 0 und koennte "ueberfaellig"
// gar nicht ausdruecken. Die Tagesgrenze wird aber genauso ueber UTC-Mitternacht
// gebildet, damit beide Funktionen denselben Tageswechsel sehen.
export function relativerTag(iso, heuteISO = todayISO()) {
  const ziel = new Date(`${iso}T00:00:00.000Z`);
  const heute = new Date(`${heuteISO}T00:00:00.000Z`);
  if (Number.isNaN(ziel.getTime()) || Number.isNaN(heute.getTime())) return iso;
  const tage = Math.round((ziel - heute) / 86400000);

  if (tage === 0) return 'heute';
  if (tage === 1) return 'morgen';
  if (tage === -1) return 'seit gestern';
  if (tage < 0) return `seit ${-tage} Tagen`;
  if (tage <= 13) return `in ${tage} Tagen`;
  // Ab zwei Wochen das Datum. Das Jahr nur, wenn es ein anderes ist - sonst
  // traegt jede Zeile vier Ziffern, die immer gleich sind.
  const tagNr = ziel.getUTCDate();
  const monat = MONATE[ziel.getUTCMonth()];
  return ziel.getUTCFullYear() === heute.getUTCFullYear()
    ? `${tagNr}. ${monat}`
    : `${tagNr}. ${monat} ${ziel.getUTCFullYear()}`;
}

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

// Ab wie vielen sicheren Bewertungen IN FOLGE eine einmal falsche Karte als
// erholt gilt und aus der Fehlerkartei faellt.
//
// `wrong` selbst zaehlt bewusst nie zurueck (Lernfortschritt soll nicht
// schrumpfen) - wuerde die Mitgliedschaft allein an `wrong > 0` haengen, waechst
// der Stapel nur noch, ganz gleich wie oft eine Karte seither richtig war. Bei
// laengerer Nutzung stuenden dort irgendwann hunderte laengst sitzende Karten,
// und "wiederholen" waere witzlos.
export const FEHLERKARTEI_ERHOLT = 3;

// Wie viele Bewertungen IN FOLGE eine Karte zuletzt sicher sass - die Zahl,
// an der die Fehlerkartei entscheidet, ob eine Karte sich erholt hat.
//
// Gezaehlt wird ausschliesslich im Fehlerkartei-Drill (drill()). Das normale
// Lernen kann die Straehne nur auf 0 zuruecksetzen, also die Karte in den
// Stapel zurueckholen - voranbringen kann es sie nicht. Der Weg hinaus fuehrt
// nur ueber den Stapel selbst, sonst ist es nicht sein Algorithmus.
//
// Bewusst ein eigenes Feld und NICHT earlyStep, obwohl beide "seit dem letzten
// Fehler" zaehlen: earlyStep waehlt das Faelligkeitsdatum auf der Anfangsleiter
// und muss deshalb auch bei "Schwer" weiterruecken - sonst haenge die Karte
// dort fest. Fuer die Fehlerkartei ist "Schwer" aber das Gegenteil eines
// Erfolgs: es ist die Bewertung, mit der man sagt "die sitzt noch nicht".
//
// Bestandskarten ohne das Feld bekommen nur eine von zwei Antworten: drinnen
// (0) oder erholt (die Schwelle). Der frueher hier zurueckgegebene earlyStep
// haelt die Mitgliedschaft zwar zum Zeitpunkt der Einfuehrung richtig, ist als
// Zahl aber unbrauchbar - er waechst mit jedem normalen Lernen weiter, und
// drill() zaehlte von ihm aus hoch. Eine Bestandskarte mit earlyStep 2 fiel
// deshalb schon nach EINEM "Gut" aus dem Stapel statt nach dreien. Zweiwertig
// bleibt die heutige Zugehoerigkeit erhalten (wer mit earlyStep >= 3 draussen
// war, bleibt draussen - kein Zustrom laengst sitzender Karten), und jede Karte
// im Stapel hat wieder die vollen drei Durchgaenge vor sich.
export function erholungsStreak(card) {
  if (Number.isFinite(card.recoveryStreak)) return card.recoveryStreak;
  const stufe = Number.isFinite(card.earlyStep) ? card.earlyStep : (card.totalReviews || 0);
  return stufe >= FEHLERKARTEI_ERHOLT ? FEHLERKARTEI_ERHOLT : 0;
}

// Bewertet eine Karte AUSSCHLIESSLICH fuer die Fehlerkartei - bewegt nur
// recoveryStreak, sonst nichts. Im Unterschied zu rate() laesst das die
// Terminierung (interval/dueDate/stability/difficulty/earlyStep) und die
// Statistik (correct/wrong/totalReviews/repetitions) komplett unberuehrt.
//
// Grund: Die Fehlerkartei sollte ein freies Uebungsfeld sein, kein zweiter
// Zufluss in denselben Zeitplan. Vorher lief das Ueben dort durch rate() -
// zwei "Gut" in derselben Sitzung ruecken earlyStep zweimal vor und schieben
// das echte Faelligkeitsdatum ebenso weit hinaus wie ein normaler, ueber Tage
// verteilter Lernerfolg. Wer nur schnell drillen wollte, bekam so eine Karte,
// die er kaum beherrschte, erst in einer Woche wieder zu sehen - der ganze
// Sinn der Fehlerkartei war damit unterlaufen: Karten sollten "eigen" auf
// wiederholtes Ueben reagieren, unabhaengig vom regulaeren Lernrhythmus.
export function drill(card, rating) {
  const c = { ...card };
  // Vor dem Ueberschreiben lesen - dieselbe Reihenfolge wie in rate().
  const straehne = erholungsStreak(c);
  c.recoveryStreak = (rating === 'good' || rating === 'easy')
    ? Math.min(EARLY_COUNT, straehne + 1)
    : 0;
  return c;
}

// ---------- FSRS-Kern ----------
//
// Was in das naechste Faelligkeitsdatum eingeht - alles davon steckt in den
// wenigen Zeilen unten, auch wenn man es ihnen nicht ansieht:
//
//   Stabilitaet          c.stability, fortgeschrieben bei jeder Bewertung
//   Schwierigkeit        c.difficulty, ueber nextDifficulty()
//   Abrufwahrscheinlichk. retrievability(elapsed, S) - wie sicher die Karte
//                        JETZT noch sass, bevor sie aufgedeckt wurde
//   Zeit seit zuletzt    elapsed, in Kalendertagen (daysBetween)
//   diese Bewertung      r, plus hardPenalty/easyBonus in nextStabilityRecall
//   Vergessensereignisse jedes "Nochmal" laeuft durch nextStabilityForget und
//                        hebt zugleich die Schwierigkeit - beides bleibt an der
//                        Karte stehen und wirkt bei jeder spaeteren Rechnung mit
//   fruehere Bewertungen kumuliert in genau diesen beiden Werten
//   fruehere Intervalle  ebenso - die Stabilitaet IST die Schaetzung, wie viele
//                        Tage die Erinnerung traegt
//   Zielretention        fest 0,95 (RETENTION in fsrs.js), in nextInterval()
//
// FSRS fuehrt bewusst keinen eigenen Zaehler fuer Wiederholungen oder Lapses in
// der Formel: Stabilitaet und Schwierigkeit SIND das Gedaechtnis der ganzen
// Historie. Zwei Karten mit gleicher Bewertungsgeschichte landen deshalb beim
// selben Datum, egal auf welchem Weg sie dorthin kamen.
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

  // Anfangsphase: die ersten sieben Wiederholungen laufen auf festen
  // Abstaenden, FSRS rechnet daneben trotzdem weiter. Das ist Absicht - die
  // Stabilitaet wird aus den TATSAECHLICH verstrichenen Tagen fortgeschrieben,
  // das Modell bleibt also stimmig, und nach der Leiter kann es nahtlos
  // uebernehmen. Nur die Wahl des Faelligkeitsdatums ist hier uebersteuert.
  //
  // Die Stufe zaehlt an der Karte mit, statt aus totalReviews abgeleitet zu
  // werden: nur so kann "Nochmal" sie zuruecksetzen.
  const stufe = Number.isFinite(c.earlyStep) ? c.earlyStep : (c.totalReviews || 0);
  const fest = earlyInterval(stufe, rating);
  // Vor dem Ueberschreiben von earlyStep lesen: Bestandskarten leiten ihre
  // Straehne genau daraus ab (siehe erholungsStreak), und nach der Zuweisung
  // unten waere das bereits der neue Wert.
  const straehne = erholungsStreak(c);

  // Nach der Leiter kennt nextInterval() nur noch die Stabilitaet - die
  // Bewertung selbst faellt dort aus der Terminierung heraus. Fuer "Schwer"
  // ist das zu wenig: die Stabilitaet waechst auch dann, und eine muehsam
  // erinnerte Karte sprang so weiter hinaus als beim letzten Mal (140 → 222
  // Tage). hardInterval() deckelt das auf das letzte Intervall mal 1,2, siehe
  // fsrs.js.
  c.interval = fest != null
    ? fest
    : (rating === 'hard' ? hardInterval(c.interval, c.stability) : nextInterval(c.stability));
  // Vergessen wirft auf den Anfang der Leiter zurueck, jede erinnerte
  // Bewertung rueckt eine Stufe weiter. Ist die Leiter durch, bleibt der
  // Zaehler stehen und FSRS terminiert von hier an allein.
  c.earlyStep = rating === 'again' ? 0 : Math.min(EARLY_COUNT, stufe + 1);
  // Getrennt davon die Erholungs-Straehne (siehe erholungsStreak). Sie gehoert
  // der Fehlerkartei und wird nur dort hochgezaehlt - hier passieren nur die
  // beiden Dinge, die das normale Lernen an ihr zu tun hat:
  //
  // Zuruecksetzen bei "Nochmal"/"Schwer" ist der EINGANG in die Fehlerkartei,
  // nicht das Zaehlwerk: ohne das kaeme eine erholte Karte nach einer neuen
  // Lapse nie mehr in den Stapel zurueck und er hoerte auf zu funktionieren.
  //
  // Festschreiben des unveraenderten Werts bei "Gut"/"Einfach" - statt gar
  // nichts zu schreiben - haelt Bestandskarten fest: deren Ersatzwert haengt an
  // earlyStep, und der rueckt eine Zeile hoeher weiter. Eine Karte mit
  // earlyStep 2 fiele beim naechsten "Gut" auf 3 und damit lautlos aus dem
  // Stapel, ohne je gedrillt worden zu sein.
  c.recoveryStreak = (rating === 'again' || rating === 'hard') ? 0 : straehne;

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

// Terminiert eine bereits gelernte Karte auf die feste Zielretention um.
//
// Gebraucht wird das nur noch als einmalige Umstellung beim Laden (siehe
// useVocabStore): Karten aus der Zeit des Dichte-Reglers liegen mit einer
// flacheren Kurve 163 oder 674 Tage in der Zukunft und wuerden von der festen
// 0,95 sonst nie wieder erfasst. Umgerechnet wird ausschliesslich das
// Faelligkeitsdatum, und zwar aus der gespeicherten Stabilitaet - der
// Lernfortschritt selbst (Stabilitaet, Schwierigkeit, Zaehler, Trefferquote)
// bleibt unangetastet.
//
// Anders als sonst duerfen Karten hier bewusst springen: dass sie springen,
// IST der Zweck. Deshalb werden Altkarten aus der Zeit vor FSRS hier auch
// sofort geimpft statt wie ueblich erst bei ihrer naechsten Bewertung -
// seedFromLegacy() liest das alte interval als Stabilitaetsschaetzung, und die
// wuerde durch das neu gerechnete interval sonst verfaelscht.
export function rescheduleCard(card) {
  // Noch nie bewertete Karten haben keine Stabilitaet, die sich umrechnen
  // liesse - sie sind ohnehin sofort faellig.
  if (!card.lastReviewed || !(card.totalReviews > 0)) return card;
  // Karten in der festen Anfangsphase haengen nicht an der Zielretention -
  // ihr Abstand steht in EARLY_STEPS. Sie umzurechnen wuerde die Leiter
  // ueberspringen und die Karte mitten in der Einarbeitung weit wegschieben.
  const stufe = Number.isFinite(card.earlyStep) ? card.earlyStep : (card.totalReviews || 0);
  if (stufe < EARLY_COUNT) return card;

  const c = { ...card };
  if (c.stability == null) {
    const seeded = seedFromLegacy(c);
    c.stability = seeded.stability;
    c.difficulty = seeded.difficulty;
  }
  c.interval = nextInterval(c.stability);
  const due = new Date(`${c.lastReviewed}T00:00:00.000Z`);
  due.setUTCDate(due.getUTCDate() + c.interval);
  c.dueDate = due.toISOString().slice(0, 10);
  return c;
}

// ---------- Übersetzung mit optionalem Beispielsatz ----------
// "Haus | Ich benutze ein Haus." - beim Tippen zaehlt nur der Teil vor dem
// Trenner, der Beispielsatz dient nur als Kontext beim Aufdecken.
//
// Erlaubte Trenner: "|" (auch ohne Leerzeichen) sowie Binde-/Gedankenstrich,
// aber NUR mit Leerzeichen ringsum. Die Leerzeichen-Pflicht ist der Grund,
// warum "E-Mail" oder "well-known" nicht versehentlich zerschnitten werden.
// Der Gedankenstrich muss mit, weil Handy-Tastaturen " - " gern automatisch
// in " – " umwandeln.
//
// Ohne Trenner gilt der ganze Text als Antwort - Karten ohne Beispielsatz
// verhalten sich also unveraendert.
const ANSWER_SEPARATOR = /\s*\|\s*|\s+[-–—]\s+/;

export function splitAnswer(text) {
  const s = String(text ?? '');
  const m = s.match(ANSWER_SEPARATOR);
  if (!m) return { answer: s.trim(), example: null };

  const answer = s.slice(0, m.index).trim();
  const example = s.slice(m.index + m[0].length).trim();
  // Steht der Trenner ganz vorn oder ganz hinten, war er nicht als Trennung
  // gemeint - dann lieber den Originaltext behalten als eine leere Antwort
  // zu erzeugen, gegen die niemand etwas Richtiges tippen kann.
  if (!answer) return { answer: s.trim(), example: null };
  return { answer, example: example || null };
}

// Beide Seiten einer Karte zerlegt: jede Sprache traegt ihren eigenen
// Beispielsatz. "casa | Vivo en una casa. = Haus | Ich wohne in einem Haus."
// ergibt vorne das spanische, hinten das deutsche Paar.
//
// Lueckensaetze bleiben unzerlegt: dort waere ein Gedankenstrich mitten im Satz
// ("Yo ▁▁▁ fruta - y mi hermana come pan.") ein Trenner, und die zweite
// Satzhaelfte verschwaende aus der Frage. Das ist schon einmal passiert.
export function cardSides(card) {
  if (!card) return { front: { answer: '', example: null }, back: { answer: '', example: null } };
  if (card.type !== 'vocab') {
    return {
      front: { answer: card.front ?? '', example: null },
      back: { answer: card.back ?? '', example: null },
    };
  }
  return { front: splitAnswer(card.front), back: splitAnswer(card.back) };
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
    // Stufe auf der festen Anfangsleiter (EARLY_STEPS). Bestandskarten ohne
    // dieses Feld leiten ihre Stufe aus totalReviews ab - siehe rate().
    earlyStep: 0,
    // Sichere Bewertungen in Folge ("Gut"/"Einfach") - siehe erholungsStreak.
    recoveryStreak: 0,
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

// ---------- Sprachen ----------
// Der Code (BCP-47) ist das, woran die Sprachausgabe die Stimme waehlt. Ohne
// ihn liest der Browser jeden Text mit der Standardstimme vor - "future"
// klingt dann deutsch. Die Namen sind zugleich die Werte, die in langA/langB
// bzw. language auf der Karte landen; sie duerfen deshalb nicht umbenannt
// werden, sonst finden bestehende Karten ihre Sprache nicht mehr.
export const LANGUAGES = [
  { name: 'Spanisch', code: 'es-ES' },
  { name: 'Englisch', code: 'en-US' },
  { name: 'Französisch', code: 'fr-FR' },
  { name: 'Italienisch', code: 'it-IT' },
  { name: 'Portugiesisch', code: 'pt-PT' },
  { name: 'Niederländisch', code: 'nl-NL' },
  { name: 'Türkisch', code: 'tr-TR' },
  { name: 'Polnisch', code: 'pl-PL' },
  { name: 'Russisch', code: 'ru-RU' },
  { name: 'Arabisch', code: 'ar-SA' },
  { name: 'Japanisch', code: 'ja-JP' },
  { name: 'Koreanisch', code: 'ko-KR' },
  { name: 'Chinesisch', code: 'zh-CN' },
  { name: 'Deutsch', code: 'de-DE' },
];

// null fuer "Sonstige"/unbekannt - dann bleibt es bei der Standardstimme,
// was ehrlicher ist als eine geratene Sprache.
export function langCodeOf(name) {
  const hit = LANGUAGES.find(l => l.name === name);
  return hit ? hit.code : null;
}

// ---------- Auswahllisten ----------
const FOREIGN = LANGUAGES.filter(l => l.name !== 'Deutsch');

export const VOCAB_PAIRS = [
  ...FOREIGN.map(l => ({ label: `${l.name} → Deutsch`, a: l.name, b: 'Deutsch' })),
  ...FOREIGN.map(l => ({ label: `Deutsch → ${l.name}`, a: 'Deutsch', b: l.name })),
  { label: 'Sonstige', a: 'Sprache 1', b: 'Sprache 2' },
];

export const SENTENCE_LANGS = [...LANGUAGES.map(l => l.name), 'Sonstige'];
