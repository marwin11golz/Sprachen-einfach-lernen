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

// Fuer die lateinisch geschriebenen Sprachen drei Beweisquellen:
//
//   woerter   haeufige Funktionswoerter - stehen in jedem echten Satz und
//             fast nie in einer anderen Sprache. Der staerkste Beleg, aber nur
//             vorhanden, wenn ueberhaupt Saetze da sind.
//   muster    Schreibweise: Endungen und Buchstabenfolgen. Die tragen auch
//             eine NACKTE Wortliste ohne einen einzigen Beispielsatz - genau
//             der Fall, in dem die Funktionswoerter nichts hergeben, weil
//             "house = Haus" keine enthaelt. Ueber zehn Zeilen summiert sich
//             das zu einem belastbaren Bild, ueber eine einzelne nicht.
//   zeichen   Buchstaben, die es nur hier gibt - ein einziger reicht als
//             starker Hinweis.
//
// "zeichen" ist bewusst knapp gehalten und enthaelt nur wirklich
// Unterscheidendes: ae/oe/ue traegt Deutsch mit Tuerkisch gemeinsam, taugt
// also nicht als Beweis - die Funktionswoerter trennen die beiden ohnehin.
//
// Die Gewichte in "muster" sagen, wie allein-unterscheidend ein Muster ist:
// "-ción" gibt es praktisch nur im Spanischen (4), "-tion" teilen sich
// Englisch und Franzoesisch (1), "-ment" ebenso. Geteilte Muster tragen
// deshalb wenig und entscheiden nie allein.
const SPRACHEN = [
  {
    name: 'Englisch',
    zeichen: null,
    woerter: ['the', 'and', 'of', 'to', 'in', 'is', 'for', 'with', 'that', 'this', 'are', 'was', 'on', 'it', 'as', 'by', 'from', 'have', 'has', 'be', 'we', 'you', 'they', 'their', 'our', 'not', 'but', 'at', 'an', 'or', 'can', 'will', 'would', 'more', 'than', 'which', 'about', 'into', 'over', 'after', 'before', 'when', 'how', 'what', 'all', 'also', 'such', 'only', 'very', 'most', 'some', 'any', 'each', 'both', 'because', 'while', 'during', 'through', 'between', 'without', 'within', 'could', 'should', 'his', 'her', 'its'],
    muster: [{ re: /ing\b/g, w: 1.5 }, { re: /ness\b/g, w: 3 }, { re: /able\b/g, w: 2.5 }, { re: /ous\b/g, w: 2.5 }, { re: /ly\b/g, w: 2 }, { re: /tion\b/g, w: 1 }, { re: /ment\b/g, w: 1 }, { re: /th/g, w: 2 }, { re: /wh/g, w: 2 }, { re: /gh/g, w: 2.5 }, { re: /ea/g, w: 1 }, { re: /oo/g, w: 1 }, { re: /ty\b/g, w: 2 }, { re: /y\b/g, w: 0.8 }, { re: /sh/g, w: 1.5 }, { re: /ee/g, w: 1.2 }, { re: /oa/g, w: 1.2 }],
  },
  {
    name: 'Deutsch',
    zeichen: /ß/,
    woerter: ['der', 'die', 'das', 'und', 'ist', 'ein', 'eine', 'einen', 'einem', 'einer', 'mit', 'für', 'nicht', 'auf', 'den', 'dem', 'des', 'zu', 'von', 'im', 'sich', 'auch', 'wird', 'werden', 'wurde', 'haben', 'hat', 'sein', 'sind', 'war', 'waren', 'als', 'bei', 'nach', 'aus', 'über', 'unter', 'vor', 'durch', 'ohne', 'gegen', 'um', 'noch', 'nur', 'schon', 'sehr', 'mehr', 'oder', 'aber', 'wenn', 'dass', 'weil', 'man', 'wir', 'ihre', 'seine', 'kann', 'können', 'muss', 'müssen', 'soll', 'beim', 'zum', 'zur'],
    muster: [{ re: /ung\b/g, w: 3 }, { re: /keit\b/g, w: 3.5 }, { re: /heit\b/g, w: 3.5 }, { re: /schaft\b/g, w: 3.5 }, { re: /lich\b/g, w: 2.5 }, { re: /chen\b/g, w: 2.5 }, { re: /nis\b/g, w: 2 }, { re: /sch/g, w: 1.5 }, { re: /tz/g, w: 2 }, { re: /pf/g, w: 2.5 }, { re: /[äöü]/g, w: 1.5 }, { re: /ei/g, w: 0.8 }, { re: /au/g, w: 1.2 }, { re: /\bver/g, w: 1.5 }, { re: /\bge/g, w: 0.8 }, { re: /ff/g, w: 1.2 }, { re: /tt/g, w: 1 }],
  },
  {
    name: 'Spanisch',
    zeichen: /[ñ¿¡]/,
    woerter: ['el', 'la', 'los', 'las', 'de', 'del', 'que', 'y', 'en', 'un', 'una', 'por', 'para', 'con', 'se', 'no', 'es', 'su', 'al', 'lo', 'como', 'más', 'pero', 'sus', 'le', 'ya', 'este', 'esta', 'porque', 'cuando', 'muy', 'sin', 'sobre', 'también', 'hasta', 'hay', 'donde', 'desde', 'todo', 'nos', 'durante', 'todos', 'les', 'ni', 'contra', 'son', 'está', 'están', 'ser', 'tiene'],
    muster: [{ re: /ción/g, w: 4 }, { re: /dad\b/g, w: 3 }, { re: /miento\b/g, w: 3.5 }, { re: /aje\b/g, w: 2.5 }, { re: /ez\b/g, w: 1.5 }, { re: /ado\b/g, w: 1.5 }, { re: /ll/g, w: 1.5 }],
  },
  {
    name: 'Französisch',
    zeichen: /[œàèùêâîôë]/,
    woerter: ['le', 'la', 'les', 'de', 'des', 'du', 'et', 'un', 'une', 'dans', 'pour', 'que', 'qui', 'sur', 'pas', 'au', 'aux', 'ce', 'cette', 'ces', 'est', 'sont', 'avec', 'plus', 'par', 'ne', 'se', 'son', 'sa', 'ses', 'nous', 'vous', 'ils', 'elles', 'mais', 'ou', 'comme', 'tout', 'tous', 'être', 'avoir', 'fait', 'peut', 'sans', 'sous', 'entre', 'chez', 'très', 'bien', 'aussi', 'leur'],
    muster: [{ re: /eau/g, w: 3 }, { re: /eux\b/g, w: 3 }, { re: /ité/g, w: 3 }, { re: /oir\b/g, w: 2 }, { re: /ier\b/g, w: 2 }, { re: /ance\b/g, w: 2 }, { re: /ement\b/g, w: 2 }, { re: /tion\b/g, w: 1 }, { re: /é/g, w: 1.8 }],
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
    muster: [{ re: /zione/g, w: 4 }, { re: /ezza\b/g, w: 3.5 }, { re: /tà/g, w: 3.5 }, { re: /mento\b/g, w: 2 }, { re: /gli/g, w: 3 }, { re: /zz/g, w: 2 }, { re: /cch|ggi|sci/g, w: 2 }],
  },
  {
    name: 'Portugiesisch',
    zeichen: /[ãõ]/,
    woerter: ['o', 'os', 'as', 'de', 'do', 'da', 'dos', 'das', 'que', 'e', 'um', 'uma', 'para', 'com', 'não', 'se', 'é', 'no', 'na', 'nos', 'nas', 'como', 'mais', 'mas', 'também', 'por', 'pelo', 'pela', 'seu', 'sua', 'quando', 'porque', 'muito', 'sem', 'sobre', 'entre', 'são', 'está', 'ser', 'ter', 'foi', 'ao'],
    muster: [{ re: /ção/g, w: 4 }, { re: /dade\b/g, w: 3.5 }, { re: /agem\b/g, w: 3 }, { re: /mento\b/g, w: 2 }, { re: /lh/g, w: 2.5 }, { re: /nh/g, w: 2.5 }, { re: /[ãõ]/g, w: 4 }],
  },
  {
    name: 'Niederländisch',
    zeichen: /\bij\b/,
    woerter: ['de', 'het', 'een', 'en', 'van', 'is', 'voor', 'op', 'met', 'dat', 'die', 'te', 'niet', 'aan', 'zijn', 'er', 'maar', 'ook', 'als', 'wordt', 'worden', 'heeft', 'hebben', 'was', 'door', 'over', 'naar', 'uit', 'bij', 'om', 'nog', 'wel', 'meer', 'deze', 'dit', 'wij', 'zij', 'hun', 'kan', 'kunnen', 'moet', 'ze', 'we'],
    muster: [{ re: /lijk\b/g, w: 4 }, { re: /heid\b/g, w: 3.5 }, { re: /tje\b/g, w: 3 }, { re: /ing\b/g, w: 1.5 }, { re: /ij/g, w: 2.5 }, { re: /aa|ee|oo|uu/g, w: 1.2 }, { re: /oe/g, w: 1.2 }],
  },
  {
    name: 'Türkisch',
    zeichen: /[ışğİ]/,
    woerter: ['ve', 'bir', 'bu', 'için', 'ile', 'da', 'de', 'olarak', 'çok', 'daha', 'en', 'gibi', 'ama', 'veya', 'her', 'sonra', 'kadar', 'olan', 'var', 'yok', 'ben', 'sen', 'biz', 'siz', 'onlar', 'ne', 'ki', 'değil', 'olduğu', 'üzere'],
    muster: [{ re: /l[ıi]k\b|luk\b|lük\b/g, w: 3 }, { re: /mek\b|mak\b/g, w: 3.5 }, { re: /[ışğ]/g, w: 3 }, { re: /ç/g, w: 1.5 }],
  },
  {
    name: 'Polnisch',
    zeichen: /[łżźćęąśń]/,
    woerter: ['i', 'w', 'na', 'z', 'do', 'nie', 'to', 'że', 'się', 'jest', 'od', 'po', 'jak', 'ale', 'lub', 'oraz', 'przez', 'dla', 'przy', 'ten', 'ta', 'te', 'być', 'ma', 'są', 'był', 'była', 'tylko', 'bardzo', 'może', 'gdy', 'który', 'która'],
    muster: [{ re: /ość/g, w: 4 }, { re: /ów\b/g, w: 3 }, { re: /sz|cz|rz/g, w: 2.5 }, { re: /[łżźćęąśń]/g, w: 3 }],
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

  const klein = roh.toLowerCase();
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
    // Schreibweise. Jedes Vorkommen zaehlt, denn hier ist gerade die HAEUFUNG
    // der Beleg: ein einzelnes "-ing" kann Zufall sein, fuenf in einer Liste
    // sind es nicht.
    for (const { re, w } of sprache.muster || []) {
      const n = (klein.match(re) || []).length;
      if (n) wert += n * w;
    }
    if (sprache.zeichen && sprache.zeichen.test(klein)) wert += 3;
    return { name: sprache.name, wert };
  }).sort((a, b) => b.wert - a.wert);

  const [erster, zweiter] = punkte;
  // Untergrenze, unter der gar nichts zaehlt: ein einzelnes "Haus" traegt ein
  // "au" und sonst nichts, das ist kein Beleg, sondern Rauschen.
  if (erster.wert < 2.5) return null;
  // Beansprucht KEINE der anderen dreizehn Sprachen den Text auch nur mit
  // einem Punkt, ist die Sache klar, auch wenn der Gewinner niedrig steht -
  // genau so sieht eine kurze, nackte Wortliste aus ("house / work / city"
  // holt 2,8, alle anderen 0). Wer hier eine hoehere Huerde verlangt, laesst
  // die Erkennung ausgerechnet bei Listen ohne Beispielsaetze schweigen.
  if (zweiter.wert === 0) return erster.name;
  // Sobald aber jemand anders mithaelt, gelten die strengen Regeln: genug
  // Belege UND klarer Abstand. Spanisch und Portugiesisch teilen sich halbe
  // Wortlisten - ohne den Abstand raet die Erkennung dort mit einer Muenze.
  if (erster.wert < 4) return null;
  if (erster.wert < zweiter.wert * 1.5) return null;
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
