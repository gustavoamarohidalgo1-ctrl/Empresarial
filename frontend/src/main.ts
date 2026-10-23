import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { aplicarTemaInicial } from './app/core/tema/tema';

// Tema guardado (Claro/Oscuro) antes del primer render de Angular, sin script en línea
// en index.html (compatible con una CSP estricta).
aplicarTemaInicial(document);

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
