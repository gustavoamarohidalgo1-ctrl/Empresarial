import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ViewContainerRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AnuncioService } from './core/sistema/anuncio.service';
import { SistemaService } from './core/sistema/sistema.service';
import { CabeceraComponent } from './shared/components/cabecera/cabecera';
import { componenteDiferido } from './shared/components/diferido';
import { IconoComponent, cargarIconos } from './shared/ui/icono/icono';
import { MarcaComponent } from './shared/ui/marca/marca';

/** Rutas que ocupan todo el ancho (la portada pública pinta sus propias bandas). */
export const RUTAS_ANCHO_COMPLETO: ReadonlySet<string> = new Set(['/']);

/**
 * Año actual en Lima, para el pie («© 2026 SIGA-SP»). La zona se escribe aquí y no se importa de
 * `shared/utils/fecha-lima`: ese módulo crea sus formateadores al cargarse y los arrastraría al
 * bundle inicial solo por el pie.
 */
export function anioLima(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', year: 'numeric' }).format(
    ahora,
  );
}

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, CabeceraComponent, IconoComponent, MarcaComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly document = inject(DOCUMENT);
  private readonly anuncios = inject(AnuncioService);
  private readonly sistema = inject(SistemaService);
  private readonly anclaAnuncio = viewChild('anclaAnuncio', { read: ViewContainerRef });
  private rutaAnterior: string | null = null;

  /** Franja «Entorno de pruebas · datos ficticios»: solo si el servidor dice «desarrollo». */
  protected readonly esDesarrollo = this.sistema.esDesarrollo;
  protected readonly hayAnuncio = computed(() => this.anuncios.visible() !== null);
  protected readonly anchoCompleto = signal(false);
  protected readonly anio = anioLima();

  constructor() {
    this.sistema.cargar();
    // Anuncio global (p. ej. la bienvenida): poco frecuente, se carga la primera vez que hay uno.
    componenteDiferido({
      ancla: this.anclaAnuncio,
      importar: () =>
        import('./shared/components/anuncio-global/anuncio-global').then(
          (m) => m.AnuncioGlobalComponent,
        ),
      cuando: this.hayAnuncio,
      enlaces: () => [],
    });
    // Los iconos que no son del primer render (`iconos.ts`) se piden justo después de pintar el
    // marco, en paralelo con la página: así llegan antes de que esta los necesite.
    afterNextRender(() => void cargarIconos());

    // Al cambiar de página (no solo de parámetros de consulta), lleva el foco al contenido
    // para que teclado y lectores de pantalla empiecen por la nueva página.
    inject(Router)
      .events.pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe((e) => {
        const ruta = e.urlAfterRedirects.split(/[?#]/)[0];
        this.anchoCompleto.set(RUTAS_ANCHO_COMPLETO.has(ruta));
        this.anuncios.alNavegar();
        if (this.rutaAnterior !== null && this.rutaAnterior !== ruta) {
          queueMicrotask(() => this.enfocarContenido(false));
        }
        this.rutaAnterior = ruta;
      });
  }

  /** «Saltar al contenido»: evita que el enlace `#contenido` navegue por el `<base href>`. */
  saltarAlContenido(evento: Event): void {
    evento.preventDefault();
    this.enfocarContenido(true);
  }

  private enfocarContenido(desplazar: boolean): void {
    const principal = this.document.getElementById('contenido');
    principal?.focus({ preventScroll: !desplazar });
  }
}
