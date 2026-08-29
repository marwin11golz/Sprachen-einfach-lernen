// Zeichnet von einer langen Liste nur den Teil, der gerade im Fenster steht.
//
// Ohne das wird die Kartenansicht bei einer gewachsenen Kartei unbenutzbar:
// mit 800 Karten hing der Aufbau bei rund einer halben Sekunde, der Baum trug
// knapp 10.000 Knoten, und jeder Tastendruck im Suchfeld kostete ~90 ms, weil
// React die ganze Liste neu schreiben musste. Bei 2.000 Karten ist das nicht
// mehr zu bedienen.
//
// Bewusst von Hand statt react-window: das Paket kostet rund 7 kB gzip und
// braechte eine zweite Styling-Ebene neben die Design-Tokens - dieselbe
// Abwaegung wie beim Wochendiagramm gegen recharts. Was hier gebraucht wird,
// sind dreissig Zeilen: sichtbaren Ausschnitt rechnen, oben und unten je einen
// Platzhalter stellen, damit die Bildlaufleiste stimmt.
//
// Die Zeilenhoehe muss FEST sein. Waere sie es nicht, saesse der Ausschnitt
// nach jedem Bildlauf woanders als die Platzhalter behaupten, und die Liste
// wuerde springen - deshalb kappen die Zeilen ihren Text, statt umzubrechen.

import { useState, useEffect, useCallback } from 'react';

// Wie viele Zeilen ueber und unter dem sichtbaren Bereich zusaetzlich
// gezeichnet werden. Ohne Puffer sieht man beim schnellen Wischen kurz
// Leerraum, bis der naechste Bildlauf-Schritt ankommt.
const PUFFER = 8;

export function useFensterListe({ laenge, zeilenHoehe }) {
  // Anfangs ein Ausschnitt, der jeden ueblichen Bildschirm fuellt. Die erste
  // echte Messung ersetzt ihn sofort; bis dahin ist lieber etwas zu viel
  // gezeichnet als eine leere Liste.
  const [fenster, setFenster] = useState({ von: 0, bis: 40 });

  // Das Element liegt bewusst im ZUSTAND, nicht in einer Ref: die Liste wird
  // erst eingeblendet, wenn man die Kartenansicht oeffnet. Eine Ref aendert
  // beim Einhaengen nichts, was einen Effekt neu anstossen wuerde - der
  // Effekt liefe also genau einmal, fande nichts vor und die Liste bliebe
  // leer. Genau so ist es im ersten Anlauf passiert. Als Zustand loest das
  // Einhaengen ein neues Rendern aus, und der Effekt unten greift.
  const [el, setEl] = useState(null);
  const ref = useCallback((node) => setEl(node), []);

  const messen = useCallback(() => {
    if (!el) return;
    // Der Container scrollt nicht selbst - die Seite tut es. Gemessen wird
    // deshalb, wo der Container relativ zum Sichtfenster liegt.
    const kasten = el.getBoundingClientRect();
    const oben = Math.max(0, -kasten.top);
    const sichtbar = window.innerHeight;
    const von = Math.max(0, Math.floor(oben / zeilenHoehe) - PUFFER);
    const bis = Math.min(laenge, Math.ceil((oben + sichtbar) / zeilenHoehe) + PUFFER);
    setFenster(vorher => (vorher.von === von && vorher.bis === bis ? vorher : { von, bis }));
  }, [el, laenge, zeilenHoehe]);

  useEffect(() => {
    if (!el) return undefined;
    messen();
    // passive: der Handler ruft nie preventDefault, und der Browser muss
    // deshalb nicht auf ihn warten, bevor er scrollt.
    window.addEventListener('scroll', messen, { passive: true });
    window.addEventListener('resize', messen);
    return () => {
      window.removeEventListener('scroll', messen);
      window.removeEventListener('resize', messen);
    };
  }, [el, messen]);

  const von = Math.min(fenster.von, Math.max(0, laenge - 1));
  const bis = Math.min(fenster.bis, laenge);
  return {
    ref,
    von,
    bis,
    obenPx: von * zeilenHoehe,
    untenPx: Math.max(0, (laenge - bis) * zeilenHoehe),
  };
}
