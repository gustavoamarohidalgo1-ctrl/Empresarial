import { provideHttpClient, withInterceptors, withXsrfConfiguration } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import {
  TitleStrategy,
  provideRouter,
  withComponentInputBinding,
  withInMemoryScrolling,
  withPreloading,
  withViewTransitions,
} from '@angular/router';
import { routes } from './app.routes';
import { provideCsrfInicial } from './core/http/csrf.initializer';
import { sesionInterceptor } from './core/http/sesion.interceptor';
import { PrecargaPorRol } from './core/precarga/precarga-por-rol';
import { TituloStrategy } from './core/titulo/titulo.strategy';
import { omitirSiMovimientoReducido } from './core/transiciones/transiciones';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
      // Solo los módulos del rol del usuario, en tiempo ocioso y sin ahorro de datos.
      withPreloading(PrecargaPorRol),
      // Transición suave del contenido entre rutas; se omite con movimiento reducido.
      withViewTransitions({
        skipInitialTransition: true,
        onViewTransitionCreated: omitirSiMovimientoReducido,
      }),
    ),
    provideHttpClient(
      withXsrfConfiguration({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }),
      withInterceptors([sesionInterceptor]),
    ),
    provideCsrfInicial(),
    { provide: TitleStrategy, useClass: TituloStrategy },
  ],
};
