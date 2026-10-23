import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  ViewContainerRef,
  computed,
  effect,
  inject,
  inputBinding,
  outputBinding,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ETIQUETA_ROL, rutaInicioPorRol } from '../../../core/auth/roles';
import { Rol } from '../../../core/modelos/contrato';
import { cuandoEsteOcioso } from '../../../core/precarga/precarga-por-rol';
import { IconoComponent } from '../../ui/icono/icono';
import type { NombreIcono } from '../../ui/icono/iconos';
import { MarcaComponent } from '../../ui/marca/marca';
import { componenteDiferido } from '../diferido';
import { CabeceraInvitadoComponent } from './invitado/cabecera-invitado';

const importarMenu = () =>
  import('./menu-usuario/menu-usuario').then((m) => m.MenuUsuarioComponent);
const importarContador = () =>
  import('./contador/contador-no-leidas').then((m) => m.ContadorNoLeidasComponent);

export const MENSAJE_ERROR_CIERRE =
  'No pudimos cerrar la sesión en el servidor; inténtalo de nuevo.';

interface EnlaceNavegacion {
  ruta: string;
  texto: string;
  icono: NombreIcono;
  exacto: boolean;
}

const ENLACES_POR_ROL: Readonly<Record<Rol, EnlaceNavegacion[]>> = {
  PACIENTE: [
    { ruta: '/paciente/citas', texto: 'Mis citas', icono: 'calendar', exacto: false },
    { ruta: '/paciente/reservar', texto: 'Reservar cita', icono: 'calendar-plus', exacto: true },
    { ruta: '/paciente/notificaciones', texto: 'Notificaciones', icono: 'bell', exacto: true },
    { ruta: '/paciente/perfil', texto: 'Mi perfil', icono: 'user', exacto: true },
  ],
  OPERADOR: [
    { ruta: '/operador', texto: 'Panel del día', icono: 'layout-dashboard', exacto: true },
  ],
  RESPONSABLE: [
    { ruta: '/indicadores', texto: 'Indicadores', icono: 'chart-column', exacto: true },
  ],
  ADMINISTRADOR: [
    { ruta: '/indicadores', texto: 'Indicadores', icono: 'chart-column', exacto: true },
    { ruta: '/admin/bitacora', texto: 'Bitácora', icono: 'file-text', exacto: true },
  ],
};

const RUTA_NOTIFICACIONES = '/paciente/notificaciones';

/** Iniciales para el avatar: «Ana Torres» → «AT»; «Olga» → «OL». */
export function iniciales(nombre: string): string {
  const palabras = nombre.trim().split(/\s+/).filter(Boolean);
  if (!palabras.length) return '?';
  const letras =
    palabras.length === 1
      ? palabras[0].slice(0, 2)
      : palabras[0].charAt(0) + palabras[palabras.length - 1].charAt(0);
  return letras.toLocaleUpperCase('es-PE');
}

/**
 * Cabecera común: marca, navegación con iconos según el rol (menú desplegable en móvil),
 * chip de usuario con iniciales y menú («Mi perfil» del paciente, «Seguridad de la cuenta» de
 * todos, tema Claro/Oscuro/Sistema y Cerrar sesión). Sin sesión ofrece «Iniciar sesión» y
 * «Crear cuenta». Para el paciente muestra el contador de notificaciones no leídas.
 *
 * Lo que no hace falta en el primer render se carga en diferido (`componenteDiferido`) y queda
 * fuera del bundle inicial: el panel del menú de usuario (con el tema) al abrirlo por primera
 * vez o antes, en tiempo ocioso; y el contador (con `NotificacionesService`), solo para el
 * paciente.
 *
 * El menú de usuario y el de navegación son «disclosures» (botón con `aria-expanded` que
 * muestra un panel): Escape los cierra y devuelve el foco al botón; un clic fuera, una
 * navegación o sacar el foco del panel también los cierra.
 */
@Component({
  selector: 'app-cabecera',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    RouterLinkActive,
    CabeceraInvitadoComponent,
    IconoComponent,
    MarcaComponent,
  ],
  templateUrl: './cabecera.html',
  styleUrl: './cabecera.css',
  host: {
    '(document:click)': 'alClicDocumento($event)',
    '(document:keydown.escape)': 'alEscape()',
  },
})
export class CabeceraComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  private readonly botonMenu = viewChild<ElementRef<HTMLButtonElement>>('botonMenu');
  private readonly botonNav = viewChild<ElementRef<HTMLButtonElement>>('botonNav');
  private readonly zonaUsuario = viewChild<ElementRef<HTMLElement>>('zonaUsuario');
  private readonly zonaNav = viewChild<ElementRef<HTMLElement>>('zonaNav');
  private readonly anclaMenu = viewChild('anclaMenu', { read: ViewContainerRef });
  private readonly anclaPunto = viewChild('anclaPunto', { read: ViewContainerRef });
  private readonly anclaNumero = viewChild('anclaNumero', { read: ViewContainerRef });

  protected readonly usuario = this.auth.usuario;
  protected readonly cerrando = signal(false);
  protected readonly errorCierre = signal<string | null>(null);
  protected readonly menuAbierto = signal(false);
  protected readonly navAbierta = signal(false);
  protected readonly rutaNotificaciones = RUTA_NOTIFICACIONES;

  protected readonly etiquetaRol = computed(() => {
    const u = this.usuario();
    return u ? ETIQUETA_ROL[u.rol] : '';
  });
  protected readonly enlaces = computed(() => {
    const u = this.usuario();
    return u ? ENLACES_POR_ROL[u.rol] : [];
  });
  protected readonly inicio = computed(() => {
    const u = this.usuario();
    return u ? rutaInicioPorRol(u.rol) : '/';
  });
  protected readonly iniciales = computed(() => iniciales(this.usuario()?.nombre ?? ''));
  protected readonly esPaciente = computed(() => this.usuario()?.rol === 'PACIENTE');
  /** `aria-describedby` de «Cerrar sesión» mientras hay un estado que anunciar. */
  protected readonly idEstado = computed(() =>
    this.cerrando() || this.errorCierre() ? 'cabecera-estado' : null,
  );

  /** Panel del menú de usuario: al abrirlo por primera vez (o antes, en tiempo ocioso). */
  private readonly menu = componenteDiferido({
    ancla: this.anclaMenu,
    importar: importarMenu,
    cuando: this.menuAbierto,
    enlaces: () => [
      inputBinding('usuario', this.usuario),
      inputBinding('iniciales', this.iniciales),
      inputBinding('etiquetaRol', this.etiquetaRol),
      inputBinding('abierto', this.menuAbierto),
      inputBinding('cerrando', this.cerrando),
      inputBinding('idEstado', this.idEstado),
      outputBinding('salir', () => this.cerrarSesion()),
    ],
  });

  /** El panel ya está creado: deja de hacer falta su marcador para `aria-controls`. */
  protected readonly menuListo = this.menu.cargado;

  constructor() {
    // Contador de no leídas: solo para el paciente (punto en el botón móvil y cifra en el enlace).
    componenteDiferido({
      ancla: this.anclaPunto,
      importar: importarContador,
      cuando: this.esPaciente,
      enlaces: () => [inputBinding('variante', () => 'punto')],
    });
    componenteDiferido({
      ancla: this.anclaNumero,
      importar: importarContador,
      cuando: this.esPaciente,
      enlaces: () => [],
    });

    // Con sesión, el menú se precarga cuando el navegador está ocioso.
    const ventana = inject(DOCUMENT).defaultView;
    const hayUsuario = computed(() => this.usuario() !== null);
    effect((alLimpiar) => {
      if (!hayUsuario()) return;
      const precarga = cuandoEsteOcioso(ventana).subscribe(() => this.menu.cargar());
      alLimpiar(() => precarga.unsubscribe());
    });

    // Al cambiar de página se cierran los menús (el foco lo gestiona App).
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() => {
        this.menuAbierto.set(false);
        this.navAbierta.set(false);
      });
  }

  alternarMenu(): void {
    this.menuAbierto.update((v) => !v);
    this.navAbierta.set(false);
  }

  alternarNav(): void {
    this.navAbierta.update((v) => !v);
    this.menuAbierto.set(false);
  }

  /** Escape cierra el menú abierto y devuelve el foco a su botón. */
  alEscape(): void {
    if (this.menuAbierto()) {
      this.menuAbierto.set(false);
      this.botonMenu()?.nativeElement.focus();
    } else if (this.navAbierta()) {
      this.navAbierta.set(false);
      this.botonNav()?.nativeElement.focus();
    }
  }

  alClicDocumento(evento: MouseEvent): void {
    const objetivo = evento.target as Node | null;
    if (this.menuAbierto() && !this.contiene(this.zonaUsuario(), objetivo)) {
      this.menuAbierto.set(false);
    }
    if (this.navAbierta() && !this.contiene(this.zonaNav(), objetivo)) {
      this.navAbierta.set(false);
    }
  }

  /** Si el foco sale del menú de usuario (Tab), se cierra. */
  alSalirFocoMenu(evento: FocusEvent): void {
    const destino = evento.relatedTarget as Node | null;
    if (destino && !this.contiene(this.zonaUsuario(), destino)) this.menuAbierto.set(false);
  }

  cerrarSesion(): void {
    if (this.cerrando()) return;
    this.cerrando.set(true);
    this.errorCierre.set(null);
    this.auth.logout().subscribe({
      next: () => {
        this.cerrando.set(false);
        this.menuAbierto.set(false);
        void this.router.navigate(['/login']);
      },
      error: () => {
        // La sesión sigue activa en el servidor: no se da por cerrada ni se sale de la página.
        this.cerrando.set(false);
        this.errorCierre.set(MENSAJE_ERROR_CIERRE);
      },
    });
  }

  private contiene(zona: ElementRef<HTMLElement> | undefined, nodo: Node | null): boolean {
    return !!zona && !!nodo && zona.nativeElement.contains(nodo);
  }
}
