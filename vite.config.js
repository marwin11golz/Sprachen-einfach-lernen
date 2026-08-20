import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Ein neuer Stand wird beim nächsten Start automatisch übernommen.
      // Ohne das bleibt eine einmal installierte App auf einer alten Fassung
      // hängen - der häufigste und unangenehmste PWA-Fehler.
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: [
        'icons/apple-touch-icon-180.png',
        'icons/favicon-32.png',
      ],
      manifest: {
        name: 'Sprachen lernen',
        short_name: 'Sprachen',
        description: 'Vokabeltrainer mit Spaced Repetition und Lückensätzen',
        lang: 'de',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F1F2ED',
        theme_color: '#1F5C4D',
        icons: [
          { src: 'icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Bei einer Ein-Fenster-App vom Startbildschirm würde "warten, bis alle
        // Tabs zu sind" bedeuten: nie. Deshalb übernimmt der neue Stand sofort.
        clientsClaim: true,
        skipWaiting: true,
        navigateFallback: 'index.html',
        // Bewusst KEIN runtimeCaching für Supabase: Datenbank-Antworten dürfen
        // nie aus dem Zwischenspeicher kommen. Ohne Netz soll die Abfrage
        // fehlschlagen, damit der Abgleich es später erneut versucht.
      },
    }),
  ],
});
