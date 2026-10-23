import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  booleanAttribute,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { Especialidad, ProfesionalCatalogo, SedeCatalogo } from '../../../core/modelos/contrato';
import { IconoComponent } from '../../../shared/ui/icono/icono';
import { enfocarTrasRenderizar } from '../../../shared/utils/foco';
import {
  Dimension,
  FiltroIndicadores,
  PRESETS_PERIODO,
  PRESET_POR_DEFECTO,
  PresetPeriodo,
  etiquetaPreset,
  resolverPreset,
  textoRango,
  validarRango,
} from '../modelo/periodo';

interface Opcion {
  codigo: string;
  nombre: string;
}

/** Un filtro activo, mostrado como chip eliminable. */
export interface ChipFiltro {
  id: 'periodo' | Dimension;
  etiqueta: string;
  valor: string;
}

const ETIQUETA_DIMENSION: Readonly<Record<Dimension, string>> = {
  sede: 'Sede',
  especialidad: 'Especialidad',
  profesional: 'Profesional',
};

/** Añade la opción elegida si no está en el catálogo (enlace compartido, catálogo caído). */
function conElegida(opciones: Opcion[], elegida: string | null): Opcion[] {
  return elegida && !opciones.some((o) => o.codigo === elegida)
    ? [...opciones, { codigo: elegida, nombre: elegida }]
    : opciones;
}

/**
 * Barra de filtros del tablero: periodo con atajos (o personalizado, con su validación),
 * sede, especialidad y profesional (filtrado por especialidad), y los filtros activos como
 * chips eliminables. No navega: emite el filtro nuevo y la página lo lleva a la URL.
 */
@Component({
  selector: 'app-filtros-indicadores',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent],
  templateUrl: './filtros-indicadores.html',
  styleUrl: './filtros-indicadores.css',
})
export class FiltrosIndicadoresComponent {
  readonly filtro = input.required<FiltroIndicadores>();
  readonly hoy = input.required<string>();
  readonly sedes = input<SedeCatalogo[]>([]);
  readonly especialidades = input<Especialidad[]>([]);
  readonly profesionales = input<ProfesionalCatalogo[]>([]);
  readonly errorCatalogos = input(false, { transform: booleanAttribute });

  readonly cambiar = output<FiltroIndicadores>();
  readonly reintentarCatalogos = output<void>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly inyector = inject(Injector);

  protected readonly presets = PRESETS_PERIODO;

  /** Atajo marcado (puede ser «Personalizado» antes de aplicar las fechas). */
  protected readonly presetElegido = linkedSignal<PresetPeriodo>(() => this.filtro().periodo);
  protected readonly desde = linkedSignal(() => this.filtro().desde);
  protected readonly hasta = linkedSignal(() => this.filtro().hasta);
  protected readonly errorRango = signal<string | null>(null);

  protected readonly opcionesSede = computed(() =>
    conElegida(
      this.sedes().map((s) => ({ codigo: s.codigo, nombre: s.nombre })),
      this.filtro().sede,
    ),
  );

  protected readonly opcionesEspecialidad = computed(() =>
    conElegida(
      this.especialidades().map((e) => ({ codigo: e.codigo, nombre: e.nombre })),
      this.filtro().especialidad,
    ),
  );

  /** Profesionales de la especialidad elegida (o todos), en orden alfabético. */
  protected readonly opcionesProfesional = computed(() => {
    const especialidad = this.filtro().especialidad;
    const lista = this.profesionales()
      .filter((p) => !especialidad || p.especialidad?.codigo === especialidad)
      .map((p) => ({ codigo: p.codigo, nombre: p.nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    return conElegida(lista, this.filtro().profesional);
  });

  protected readonly chips = computed<ChipFiltro[]>(() => {
    const f = this.filtro();
    const chips: ChipFiltro[] = [];
    if (f.periodo !== PRESET_POR_DEFECTO) {
      chips.push({
        id: 'periodo',
        etiqueta: 'Periodo',
        valor:
          f.periodo === 'personalizado' ? textoRango(f.desde, f.hasta) : etiquetaPreset(f.periodo),
      });
    }
    const nombres: Record<Dimension, Opcion[]> = {
      sede: this.opcionesSede(),
      especialidad: this.opcionesEspecialidad(),
      profesional: this.opcionesProfesional(),
    };
    for (const d of ['sede', 'especialidad', 'profesional'] as const) {
      const codigo = f[d];
      if (!codigo) continue;
      chips.push({
        id: d,
        etiqueta: ETIQUETA_DIMENSION[d],
        valor: nombres[d].find((o) => o.codigo === codigo)?.nombre ?? codigo,
      });
    }
    return chips;
  });

  protected elegirPreset(preset: PresetPeriodo): void {
    this.presetElegido.set(preset);
    this.errorRango.set(null);
    if (preset === 'personalizado') {
      // Se aplica con «Aplicar», tras revisar las fechas (parten del periodo actual).
      return;
    }
    this.emitir({ ...this.filtro(), periodo: preset, ...resolverPreset(preset, this.hoy()) });
  }

  protected cambiarFecha(campo: 'desde' | 'hasta', evento: Event): void {
    const valor = (evento.target as HTMLInputElement).value;
    (campo === 'desde' ? this.desde : this.hasta).set(valor);
    this.errorRango.set(null);
  }

  protected aplicarRango(): void {
    const error = validarRango(this.desde(), this.hasta());
    this.errorRango.set(error);
    if (error) {
      enfocarTrasRenderizar(this.inyector, () =>
        this.host.nativeElement.querySelector<HTMLElement>('#filtro-desde'),
      );
      return;
    }
    this.emitir({
      ...this.filtro(),
      periodo: 'personalizado',
      desde: this.desde(),
      hasta: this.hasta(),
    });
  }

  protected elegir(dimension: Dimension, evento: Event): void {
    const valor = (evento.target as HTMLSelectElement).value || null;
    const siguiente: FiltroIndicadores = { ...this.filtro(), [dimension]: valor };
    // El profesional debe pertenecer a la especialidad elegida.
    if (dimension === 'especialidad' && valor && siguiente.profesional) {
      const prof = this.profesionales().find((p) => p.codigo === siguiente.profesional);
      if (prof && prof.especialidad?.codigo !== valor) siguiente.profesional = null;
    }
    this.emitir(siguiente);
  }

  /** Quita un filtro activo. El foco pasa al chip siguiente (o al título de los filtros). */
  protected quitar(chip: ChipFiltro, indice: number): void {
    const f = this.filtro();
    const siguiente: FiltroIndicadores =
      chip.id === 'periodo'
        ? { ...f, periodo: PRESET_POR_DEFECTO, ...resolverPreset(PRESET_POR_DEFECTO, this.hoy()) }
        : { ...f, [chip.id]: null };
    if (chip.id === 'periodo') this.presetElegido.set(PRESET_POR_DEFECTO);
    this.emitir(siguiente);
    this.enfocarChip(indice);
  }

  protected limpiar(): void {
    this.presetElegido.set(PRESET_POR_DEFECTO);
    this.errorRango.set(null);
    this.emitir({
      periodo: PRESET_POR_DEFECTO,
      ...resolverPreset(PRESET_POR_DEFECTO, this.hoy()),
      sede: null,
      especialidad: null,
      profesional: null,
    });
    this.enfocarChip(0);
  }

  private emitir(filtro: FiltroIndicadores): void {
    this.cambiar.emit(filtro);
  }

  /**
   * Tras quitar un chip, el filtro llega por la URL en el siguiente ciclo; el foco se mueve
   * cuando los chips ya se volvieron a pintar.
   */
  private enfocarChip(indice: number): void {
    enfocarTrasRenderizar(this.inyector, () => {
      const chips = this.host.nativeElement.querySelectorAll<HTMLElement>('.fi__chip');
      return (
        chips[Math.min(indice, chips.length - 1)] ??
        this.host.nativeElement.querySelector<HTMLElement>('#filtros-titulo')
      );
    });
  }
}
