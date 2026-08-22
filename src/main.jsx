import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx';

// Ohne diesen Aufruf bleibt es bei der nackten Registrierung des Dienstes: der
// neue Stand wird zwar geladen, die offene Seite behaelt aber ihre alten
// Dateien und zeigt weiter die vorige Fassung. Genau das ist passiert - eine
// frisch veroeffentlichte Version kam auf dem Geraet nicht an.
// "autoUpdate" in vite.config.js allein genuegt dafuer nicht; es wirkt erst
// zusammen mit dieser Registrierung, die nach dem Wechsel neu laedt.
registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
