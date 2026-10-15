// Karte bearbeiten: Inhalt aendern, Lernstand behalten.
//
// Bis hierher gab es nur Loeschen und Neuanlegen. Ein Tippfehler kostete damit
// die gesamte Lernhistorie der Karte - bei einer Vokabel, die seit Wochen
// sitzt, ist das der teuerste Weg zum billigsten Fehler. Terminierung und
// Statistik bleiben hier unberuehrt; geaendert wird ausschliesslich, was auf
// der Karte steht (der Store setzt das als Vertrag durch, siehe editCard).
//
// Bewusst ein eigener Layer und nicht aufgeklappt in der Zeile: Die
// Kartenliste zeichnet nur ihren sichtbaren Ausschnitt und rechnet dafuer mit
// FESTER Zeilenhoehe (ZEILE_H in App.jsx). Eine Zeile, die sich oeffnet,
// verschoebe alle Platzhalter darunter.

import React, { useState, useMemo, useEffect } from 'react';
import { X } from 'lucide-react';
import { VOCAB_PAIRS, SENTENCE_LANGS, parseGapLine } from '../lib/srs.js';
import {
  btnPrimary, btnGhost, hexToRgba,
  SPACE, RADIUS, FONT, typoH2, typoSecondary, typoCaption,
} from '../lib/theme.js';

export default function KarteBearbeiten({ T, card, onSpeichern, onAbbrechen }) {
  const istSatz = card.type === 'gap';

  const [front, setFront] = useState(card.front || '');
  const [back, setBack] = useState(card.back || '');
  const [sentence, setSentence] = useState(card.sentence || '');
  const [fehler, setFehler] = useState(null);

  // Sprachen sind Kartendaten (siehe LANGUAGES in srs.js). Traegt eine Karte
  // eine Kombination, die nicht in der Liste steht - aus einem Import etwa -,
  // wird sie vorangestellt statt beim Oeffnen stillschweigend auf einen
  // anderen Wert gezogen: Der Dialog soll Fehler beheben, nicht welche machen.
  const paare = useMemo(() => {
    const drin = VOCAB_PAIRS.some(p => p.a === card.langA && p.b === card.langB);
    return drin
      ? VOCAB_PAIRS
      : [{ label: `${card.langA} → ${card.langB}`, a: card.langA, b: card.langB }, ...VOCAB_PAIRS];
  }, [card.langA, card.langB]);
  const sprachen = useMemo(() => (
    SENTENCE_LANGS.includes(card.language) ? SENTENCE_LANGS : [card.language, ...SENTENCE_LANGS]
  ), [card.language]);

  const [paarIdx, setPaarIdx] = useState(() =>
    Math.max(0, paare.findIndex(p => p.a === card.langA && p.b === card.langB)));
  const [sprache, setSprache] = useState(card.language || sprachen[0]);

  // Escape schliesst - erwartbar bei allem, was sich ueber die Seite legt.
  useEffect(() => {
    const zu = (e) => { if (e.key === 'Escape') onAbbrechen(); };
    window.addEventListener('keydown', zu);
    return () => window.removeEventListener('keydown', zu);
  }, [onAbbrechen]);

  const feld = {
    width: '100%', padding: `${SPACE.md}px ${SPACE.lg}px`, borderRadius: RADIUS.md,
    border: `1px solid ${T.border}`, background: T.background, color: T.textPrimary,
    fontSize: FONT.md, outline: 'none',
  };
  const label = { ...typoSecondary('sm'), color: T.textSecondary, display: 'block', marginBottom: SPACE.sm };

  const speichern = () => {
    if (istSatz) {
      // Die Antwort wird aus den eckigen Klammern NEU abgeleitet statt separat
      // gepflegt - zwei Felder koennten sonst auseinanderlaufen, und geprueft
      // wird beim Lernen gegen answer, angezeigt wird sentence.
      const teile = parseGapLine(sentence);
      if (!teile) {
        setFehler('Der Satz braucht eine Lücke in eckigen Klammern, zum Beispiel: Ich [gehe] nach Hause.');
        return;
      }
      onSpeichern({ sentence: teile.sentence, answer: teile.answer, language: sprache });
      return;
    }
    if (!front.trim() || !back.trim()) {
      setFehler('Beide Seiten müssen ausgefüllt sein.');
      return;
    }
    const paar = paare[paarIdx];
    onSpeichern({ front: front.trim(), back: back.trim(), langA: paar.a, langB: paar.b });
  };

  return (
    <div
      onClick={onAbbrechen}
      style={{
        position: 'fixed', inset: 0, zIndex: 40,
        background: hexToRgba(T.background, 0.72), backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: `calc(${SPACE.lg}px + env(safe-area-inset-top)) ${SPACE.lg}px calc(${SPACE.lg}px + env(safe-area-inset-bottom))`,
      }}>
      {/* Klicks im Dialog duerfen nicht bis zum Grund durchfallen und ihn schliessen. */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 520, maxHeight: '100%', overflowY: 'auto',
          background: T.surfaceElevated, border: `1px solid ${T.hairline}`,
          borderRadius: RADIUS.lg, boxShadow: T.shadowLift,
          padding: SPACE.xl,
        }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.md, marginBottom: SPACE.xl }}>
          <div style={{ ...typoH2(), flex: 1 }}>Karte bearbeiten</div>
          {/* Eigener Name, obwohl dasselbe passiert wie unten: Zwei Knoepfe mit
              derselben Beschriftung sind fuer eine Vorlesesoftware nicht zu
              unterscheiden. */}
          <button className="press" onClick={onAbbrechen} aria-label="Dialog schließen"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textSecondary, padding: 4, display: 'flex' }}>
            <X size={20} />
          </button>
        </div>

        {istSatz ? (
          <>
            <label style={label} htmlFor="kb-satz">Satz</label>
            <textarea id="kb-satz" value={sentence} rows={3}
              onChange={e => { setSentence(e.target.value); setFehler(null); }}
              style={{ ...feld, resize: 'vertical', lineHeight: 1.6, marginBottom: SPACE.lg }} />

            <label style={label} htmlFor="kb-sprache">Sprache</label>
            <select id="kb-sprache" value={sprache} onChange={e => setSprache(e.target.value)}
              style={{ ...feld, cursor: 'pointer' }}>
              {sprachen.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </>
        ) : (
          <>
            <label style={label} htmlFor="kb-front">Vorderseite</label>
            <input id="kb-front" value={front}
              onChange={e => { setFront(e.target.value); setFehler(null); }}
              style={{ ...feld, marginBottom: SPACE.lg }} />

            <label style={label} htmlFor="kb-back">Rückseite</label>
            <input id="kb-back" value={back}
              onChange={e => { setBack(e.target.value); setFehler(null); }}
              style={{ ...feld, marginBottom: SPACE.lg }} />

            <label style={label} htmlFor="kb-paar">Sprachpaar</label>
            <select id="kb-paar" value={paarIdx} onChange={e => setPaarIdx(Number(e.target.value))}
              style={{ ...feld, cursor: 'pointer' }}>
              {paare.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
            </select>
          </>
        )}

        {fehler && (
          <div style={{
            marginTop: SPACE.lg, background: T.errorSoft, color: T.error,
            border: `1px solid ${T.error}`, borderRadius: RADIUS.md,
            padding: `${SPACE.md}px ${SPACE.lg}px`, ...typoSecondary('sm'),
          }}>
            {fehler}
          </div>
        )}

        <div style={{ ...typoCaption(), color: T.textSecondary, marginTop: SPACE.lg }}>
          Lernstand und Fälligkeit bleiben erhalten.
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE.lg, marginTop: SPACE.xl }}>
          <button className="press" onClick={speichern} style={btnPrimary(T)}>Speichern</button>
          <button className="press" onClick={onAbbrechen} style={btnGhost(T)}>Abbrechen</button>
        </div>
      </div>
    </div>
  );
}
