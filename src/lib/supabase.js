// Verbindung zur Supabase-Datenbank.
//
// Fehlen die Umgebungsvariablen, ist `supabase` bewusst null und
// `cloudConfigured` false - die App läuft dann rein lokal weiter, statt beim
// Start abzustürzen. Jede aufrufende Stelle prüft cloudConfigured.

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const cloudConfigured = Boolean(url && key);

export const supabase = cloudConfigured
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Wir nutzen bewusst keine Magic Links (die öffnen in Safari statt in
        // der Startbildschirm-App). Ohne diese Zeile durchsucht der Client bei
        // jedem Start unnötig die Adresszeile nach einem Anmelde-Token.
        detectSessionInUrl: false,
      },
    })
  : null;
