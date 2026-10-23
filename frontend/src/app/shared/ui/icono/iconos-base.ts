/**
 * Iconos del PRIMER render (marco de la app, cabecera, pie y avisos): van en el bundle inicial.
 * Los demás están en `iconos.ts`, que `IconoComponent` carga en diferido (ver `icono.ts`).
 * Mismo formato y procedencia que `iconos.ts` (trazos de Lucide, licencia ISC; algunos derivan de
 * Feather, licencia MIT): las licencias completas están en `iconos.ts`.
 *
 * Añade un icono aquí solo si se pinta antes de cargar cualquier página (p. ej. en la cabecera);
 * la prueba `icono.spec.ts` comprueba que la cabecera y el marco no usan otros.
 */
export const ICONOS_BASE = {
  info: 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M12 16v-4M12 8h.01',
  x: 'M18 6 6 18M6 6l12 12',
  clock: 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M12 6v6l4 2',
  menu: 'M4 5h16M4 12h16M4 19h16',
  'chevron-down': 'M6 9l6 6 6-6',
  // (calendar-days)
  calendar:
    'M8 2v3M16 2v3M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2ZM3 9h18M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01',
  'calendar-plus':
    'M16 18h6M16 2v3M19 15v6M21 11.5V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2h8.3M3 9h18M8 2v3',
  bell: 'M10.268 21a2 2 0 0 0 3.464 0M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326',
  // (user-round)
  user: 'M7 8a5 5 0 1 0 10 0a5 5 0 1 0 -10 0M20 21a8 8 0 0 0-16 0',
  'layout-dashboard':
    'M4 3h5a1 1 0 0 1 1 1v7a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-7a1 1 0 0 1 1 -1ZM15 3h5a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1ZM15 12h5a1 1 0 0 1 1 1v7a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-7a1 1 0 0 1 1 -1ZM4 16h5a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-5a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1Z',
  // (chart-column)
  'chart-column': 'M3 3v16a2 2 0 0 0 2 2h16M18 17V9M13 17V5M8 17v-3',
  'file-text':
    'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7ZM14 2v4a2 2 0 0 0 2 2h4M10 9H8M16 13H8M16 17H8',
  'log-in': 'M10 17l5-5-5-5M15 12H3M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4',
  'user-plus':
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M5 7a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M19 8v6M22 11h-6',
  // (circle-check)
  'check-circle': 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M9 12l2 2 4-4',
  // (circle-alert)
  'alert-circle': 'M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M12 8L12 12M12 16L12.01 16',
  // (triangle-alert)
  'alert-triangle':
    'M21.73 18l-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3M12 9v4M12 17h.01',
} as const satisfies Record<string, string>;

export type NombreIconoBase = keyof typeof ICONOS_BASE;
