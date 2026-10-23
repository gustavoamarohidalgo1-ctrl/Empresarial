import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink, UrlTree } from '@angular/router';
import { Subscription } from 'rxjs';
import { ErrorService } from '../../../core/errores/error.service';
import { CorreoSimulado } from '../../../core/modelos/contrato';
import { FechaLimaPipe } from '../../../shared/pipes/fecha-lima.pipe';
import { AvisoComponent } from '../../../shared/ui/aviso/aviso';
import { EncabezadoPaginaComponent } from '../../../shared/ui/encabezado-pagina/encabezado-pagina';
import { EsqueletoComponent } from '../../../shared/ui/esqueleto/esqueleto';
import { EstadoVacioComponent } from '../../../shared/ui/estado-vacio/estado-vacio';
import { IconoComponent } from '../../../shared/ui/icono/icono';
import { enfocarTrasRenderizar } from '../../../shared/utils/foco';
import { BuzonApiService } from './buzon-api.service';

type Carga =
  | { estado: 'cargando' }
  | { estado: 'listo'; correos: CorreoSimulado[] }
  | { estado: 'no-disponible' }
  | { estado: 'error'; mensaje: string };

/**
 * Solo acepta rutas internas de la app («/restablecer?token=…»): nunca otro origen ni `//`.
 * Devuelve el `UrlTree` para `routerLink` o `null`.
 */
export function rutaInterna(router: Router, enlace: string | null | undefined): UrlTree | null {
  if (!enlace || !enlace.startsWith('/') || enlace.startsWith('//') || enlace.includes('\\')) {
    return null;
  }
  try {
    return router.parseUrl(enlace);
  } catch {
    return null;
  }
}

/**
 * Buzón de correo simulado (`GET /dev/correos`): muestra los correos que SIGA-SP «envió» en
 * el entorno de desarrollo para completar, por ejemplo, la recuperación de contraseña sin
 * correo real. En producción el servidor responde 404 y la página lo explica.
 */
@Component({
  selector: 'app-buzon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AvisoComponent,
    EncabezadoPaginaComponent,
    EsqueletoComponent,
    EstadoVacioComponent,
    FechaLimaPipe,
    IconoComponent,
  ],
  templateUrl: './buzon.html',
  styleUrl: './buzon.css',
})
export class BuzonComponent implements OnInit {
  private readonly api = inject(BuzonApiService);
  private readonly errores = inject(ErrorService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly inyector = inject(Injector);
  private readonly estadoRef = viewChild<ElementRef<HTMLElement>>('estadoRef');

  protected readonly carga = signal<Carga>({ estado: 'cargando' });
  protected readonly correos = computed(() => {
    const c = this.carga();
    return c.estado === 'listo' ? c.correos : null;
  });
  protected readonly mensajeError = computed(() => {
    const c = this.carga();
    return c.estado === 'error' ? c.mensaje : '';
  });
  /** Hay correos en pantalla y se está pidiendo la lista de nuevo. */
  protected readonly actualizando = signal(false);
  protected readonly esqueletos = [1, 2, 3] as const;
  private peticion?: Subscription;

  ngOnInit(): void {
    this.cargar();
  }

  cargar(manual = false): void {
    const actual = this.carga();
    if (actual.estado === 'listo') this.actualizando.set(true);
    else this.carga.set({ estado: 'cargando' });
    this.peticion?.unsubscribe();
    this.peticion = this.api
      .listar()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (correos) => {
          this.actualizando.set(false);
          const ordenados = [...correos].sort(
            (a, b) => Date.parse(b.enviadoEn) - Date.parse(a.enviadoEn),
          );
          this.carga.set({ estado: 'listo', correos: ordenados });
          if (manual) enfocarTrasRenderizar(this.inyector, () => this.estadoRef());
        },
        error: (error: unknown) => {
          this.actualizando.set(false);
          const traducido = this.errores.traducir(error);
          this.carga.set(
            traducido.status === 404
              ? { estado: 'no-disponible' }
              : { estado: 'error', mensaje: traducido.mensaje },
          );
        },
      });
  }

  protected ruta(correo: CorreoSimulado): UrlTree | null {
    return rutaInterna(this.router, correo.enlace);
  }
}
