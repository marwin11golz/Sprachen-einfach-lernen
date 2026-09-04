// Erkennt aus einem eingefuegten Vokabelblock, welches Sprachpaar er traegt.
//
// Warum das ueberhaupt gebraucht wird: Die Sprache haengt an der einzelnen
// Karte (langA/langB, siehe LANGUAGES in srs.js) und wird beim Anlegen aus dem
// Auswahlfeld uebernommen. Steht dort noch das Paar der letzten Sitzung, sind
// alle frisch eingefuegten Karten falsch beschriftet - und weil es kein
// Bearbeiten gibt, hilft nur: alles loeschen und von vorn. Genau dieser Fall
// tritt beim Einfuegen fertiger Listen staendig ein, weil der Blick beim
// Einfuegen auf dem Text liegt und nicht auf dem Feld darueber.
//
// Bewusst von Hand statt franc/cld3: dieselbe Abwaegung wie beim
// Fenster-Rendering gegen react-window und beim Wochendiagramm gegen recharts.
// Die Pakete bringen Modelle fuer hunderte Sprachen mit (franc rund 40 kB
// gzip), gebraucht werden hier die vierzehn aus LANGUAGES - und fuer die
// reichen Schriftbereiche, ein paar Dutzend Funktionswoerter und die jeweils
// eigenen Buchstaben.
//
// Die Erkennung darf lieber NICHTS sagen als etwas Falsches: ein stiller
// Fehlgriff waere genau der Schaden, den sie verhindern soll. Deshalb die
// Schwellen unten - ohne klaren Abstand zum Zweitplatzierten gibt sie null
// zurueck und das Feld bleibt, wie es steht.

// Schriften sind eindeutig genug, um ohne Wortliste zu entscheiden. Die
// Reihenfolge traegt die Logik: Japanisch schreibt auch mit chinesischen
// Zeichen, also muessen die Kana vorher greifen, sonst faende der
// Chinesisch-Test jeden japanischen Satz zuerst.
const SKRIPTE = [
  { sprache: 'Japanisch', muster: /[぀-ゟ゠-ヿ]/ },
  { sprache: 'Koreanisch', muster: /[가-힯ᄀ-ᇿ]/ },
  { sprache: 'Chinesisch', muster: /[一-鿿]/ },
  { sprache: 'Russisch', muster: /[Ѐ-ӿ]/ },
  { sprache: 'Arabisch', muster: /[؀-ۿ]/ },
];

// Fuer die lateinisch geschriebenen Sprachen: haeufige Funktionswoerter (die
// stehen in jedem echten Satz und fast nie in einer anderen Sprache) und die
// Buchstaben, die nur diese Sprache hat.
//
// "zeichen" ist bewusst knapp gehalten und enthaelt nur wirklich
// Unterscheidendes: ae/oe/ue traegt Deutsch mit Tuerkisch gemeinsam, taugt
// also nicht als Beweis - die Funktionswoerter trennen die beiden ohnehin.
const SPRACHEN = [
  {
    name: 'Englisch',
    zeichen: null,
    woerter: ['the', 'and', 'of', 'to', 'in', 'is', 'for', 'with', 'that', 'this', 'are', 'was', 'on', 'it', 'as', 'by', 'from', 'have', 'has', 'be', 'we', 'you', 'they', 'their', 'our', 'not', 'but', 'at', 'an', 'or', 'can', 'will', 'would', 'more', 'than', 'which', 'about', 'into', 'over', 'after', 'before', 'when', 'how', 'what', 'all', 'also', 'such', 'only', 'very', 'most', 'some', 'any', 'each', 'both', 'because', 'while', 'during', 'through', 'between', 'without', 'within', 'could', 'should', 'his', 'her', 'its'],
  },
  {
    name: 'Deutsch',
    zeichen: /ß/,
    woerter: ['der', 'die', 'das', 'und', 'ist', 'ein', 'eine', 'einen', 'einem', 'einer', 'mit', 'für', 'nicht', 'auf', 'den', 'dem', 'des', 'zu', 'von', 'im', 'sich', 'auch', 'wird', 'werden', 'wurde', 'haben', 'hat', 'sein', 'sind', 'war', 'waren', 'als', 'bei', 'nach', 'aus', 'über', 'unter', 'vor', 'durch', 'ohne', 'gegen', 'um', 'noch', 'nur', 'schon', 'sehr', 'mehr', 'oder', 'aber', 'wenn', 'dass', 'weil', 'man', 'wir', 'ihre', 'seine', 'kann', 'können', 'muss', 'müssen', 'soll', 'beim', 'zum', 'zur'],
  },
  {
    name: 'Spanisch',
    zeichen: /[ñ¿¡]/,
    woerter: ['el', 'la', 'los', 'las', 'de', 'del', 'que', 'y', 'en', 'un', 'una', 'por', 'para', 'con', 'se', 'no', 'es', 'su', 'al', 'lo', 'como', 'más', 'pero', 'sus', 'le', 'ya', 'este', 'esta', 'porque', 'cuando', 'muy', 'sin', 'sobre', 'también', 'hasta', 'hay', 'donde', 'desde', 'todo', 'nos', 'durante', 'todos', 'les', 'ni', 'contra', 'son', 'está', 'están', 'ser', 'tiene'],
  },
  {
    name: 'Französisch',
    zeichen: /[œàèùêâîôë]/,
    woerter: ['le', 'la', 'les', 'de', 'des', 'du', 'et', 'un', 'une', 'dans', 'pour', 'que', 'qui', 'sur', 'pas', 'au', 'aux', 'ce', 'cette', 'ces', 'est', 'sont', 'avec', 'plus', 'par', 'ne', 'se', 'son', 'sa', 'ses', 'nous', 'vous', 'ils', 'elles', 'mais', 'ou', 'comme', 'tout', 'tous', 'être', 'avoir', 'fait', 'peut', 'sans', 'sous', 'entre', 'chez', 'très', 'bien', 'aussi', 'leur'],
  },
  {
    name: 'Italienisch',
    zeichen: /[òì]/,
    // Viele davon teilt Italienisch mit Spanisch ("una", "con", "la"). Die
    // Liste traegt deshalb bewusst auch die Formen, die es NICHT teilt - "mia"
    // gegen spanisch "mi", "ho/hanno" gegen "he/han", "gli/della/nella" ohne
    // spanische Entsprechung. Ohne die bleibt ein einzelner Satz unter dem
    // geforderten Abstand und die Erkennung schweigt.
    woerter: ['il', 'lo', 'la', 'gli', 'le', 'di', 'del', 'della', 'che', 'e', 'un', 'una', 'per', 'con', 'non', 'si', 'sono', 'è', 'nel', 'nella', 'come', 'più', 'ma', 'anche', 'da', 'dei', 'delle', 'degli', 'questo', 'questa', 'quando', 'perché', 'molto', 'senza', 'sopra', 'tra', 'loro', 'essere', 'avere', 'fare', 'alla', 'allo', 'sul', 'sulla', 'dalla', 'mia', 'mio', 'miei', 'sua', 'suo', 'ci', 'ne', 'ho', 'ha', 'hanno', 'era', 'erano', 'tutto', 'tutti', 'quello', 'quella', 'dove', 'però', 'due'],
  },
  {
    name: 'Portugiesisch',
    zeichen: /[ãõ]/,
    woerter: ['o', 'os', 'as', 'de', 'do', 'da', 'dos', 'das', 'que', 'e', 'um', 'uma', 'para', 'com', 'não', 'se', 'é', 'no', 'na', 'nos', 'nas', 'como', 'mais', 'mas', 'também', 'por', 'pelo', 'pela', 'seu', 'sua', 'quando', 'porque', 'muito', 'sem', 'sobre', 'entre', 'são', 'está', 'ser', 'ter', 'foi', 'ao'],
  },
  {
    name: 'Niederländisch',
    zeichen: /\bij\b/,
    woerter: ['de', 'het', 'een', 'en', 'van', 'is', 'voor', 'op', 'met', 'dat', 'die', 'te', 'niet', 'aan', 'zijn', 'er', 'maar', 'ook', 'als', 'wordt', 'worden', 'heeft', 'hebben', 'was', 'door', 'over', 'naar', 'uit', 'bij', 'om', 'nog', 'wel', 'meer', 'deze', 'dit', 'wij', 'zij', 'hun', 'kan', 'kunnen', 'moet', 'ze', 'we'],
  },
  {
    name: 'Türkisch',
    zeichen: /[ışğİ]/,
    woerter: ['ve', 'bir', 'bu', 'için', 'ile', 'da', 'de', 'olarak', 'çok', 'daha', 'en', 'gibi', 'ama', 'veya', 'her', 'sonra', 'kadar', 'olan', 'var', 'yok', 'ben', 'sen', 'biz', 'siz', 'onlar', 'ne', 'ki', 'değil', 'olduğu', 'üzere'],
  },
  {
    name: 'Polnisch',
    zeichen: /[łżźćęąśń]/,
    woerter: ['i', 'w', 'na', 'z', 'do', 'nie', 'to', 'że', 'się', 'jest', 'od', 'po', 'jak', 'ale', 'lub', 'oraz', 'przez', 'dla', 'przy', 'ten', 'ta', 'te', 'być', 'ma', 'są', 'był', 'była', 'tylko', 'bardzo', 'może', 'gdy', 'który', 'która'],
  },
];

// Woerter statt Zeichenketten: "in" darf nicht in "increase" treffen, sonst
// zaehlte jeder englische Satz auch fuer Deutsch mit.
function woerterVon(text) {
  return text
    .toLowerCase()
    // Apostrophe gehoeren zum Wort ("don't"), alles andere trennt.
    .split(/[^a-zà-öø-ÿāăąćčđēėęěğīįıłńňōőœřśşšťūůűųźżž']+/i)
    .filter(Boolean);
}

// Die erkannte Sprache oder null, wenn der Text zu wenig hergibt.
export function erkenneSprache(text) {
  const roh = (text || '').trim();
  if (roh.length < 3) return null;

  for (const { sprache, muster } of SKRIPTE) {
    if (muster.test(roh)) return sprache;
  }

  const woerter = woerterVon(roh);
  if (woerter.length === 0) return null;
  const zaehler = new Map();
  for (const w of woerter) zaehler.set(w, (zaehler.get(w) || 0) + 1);

  const punkte = SPRACHEN.map(sprache => {
    let verschiedene = 0;
    let treffer = 0;
    for (const wort of sprache.woerter) {
      const n = zaehler.get(wort);
      if (n) { verschiedene += 1; treffer += n; }
    }
    // Verschiedene Treffer wiegen schwerer als haeufige: ein Text, der
    // dasselbe Wort zwanzigmal enthaelt, beweist weniger als einer mit zwanzig
    // verschiedenen Funktionswoertern.
    let wert = verschiedene * 2 + treffer * 0.5;
    if (sprache.zeichen && sprache.zeichen.test(roh.toLowerCase())) wert += 3;
    return { name: sprache.name, wert };
  }).sort((a, b) => b.wert - a.wert);

  const [erster, zweiter] = punkte;
  // Zwei Huerden, beide noetig: genug Belege ueberhaupt, und klarer Abstand
  // zum Naechsten. Spanisch und Portugiesisch teilen sich halbe Wortlisten -
  // ohne den Abstand raet die Erkennung dort mit einer Muenze.
  if (erster.wert < 4) return null;
  if (zweiter.wert > 0 && erster.wert < zweiter.wert * 1.5) return null;
  return erster.name;
}

// Aus den bereits gespaltenen Zeilen das Sprachpaar bestimmen.
//
// Der Trick liegt im Aufbau der Auswahlliste: JEDES Paar in VOCAB_PAIRS hat
// Deutsch auf einer der beiden Seiten (siehe srs.js). Es genuegt also, die
// FREMDSPRACHE zu finden und zu wissen, auf welcher Seite sie steht - die
// andere Seite ist dann zwangslaeufig Deutsch und muss gar nicht erkannt
// werden. Das ist wichtig, weil die deutsche Seite typischerweise nur aus
// einzelnen Woertern besteht ("Wettbewerbsvorteil"): dort gibt es keine
// Funktionswoerter, an denen sich irgendetwas erkennen liesse, waehrend die
// Fremdsprachenseite den Beispielsatz traegt und damit reichlich Belege.
export function erkenneVokabelPaar(paare) {
  if (!paare || paare.length === 0) return null;
  const links = erkenneSprache(paare.map(p => p.front).join('\n'));
  const rechts = erkenneSprache(paare.map(p => p.back).join('\n'));

  const linksFremd = links && links !== 'Deutsch';
  const rechtsFremd = rechts && rechts !== 'Deutsch';

  // Genau eine Seite fremd - die andere ist Deutsch, ob erkannt oder nicht.
  if (linksFremd && !rechtsFremd) return { a: links, b: 'Deutsch' };
  if (rechtsFremd && !linksFremd) return { a: 'Deutsch', b: rechts };
  // Beide fremd, beide deutsch, oder gar nichts erkannt: dafuer gibt es kein
  // Paar in der Liste - lieber nichts tun.
  return null;
}
