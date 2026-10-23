import { Especialidad, HorarioReserva, Referencia } from '../../../core/modelos/contrato';
import { NombreIcono } from '../../../shared/ui/icono/iconos';
import {
  claveDiaLima,
  formatearDiaLargo,
  formatearHora,
  partesCalendarioLima,
} from '../../../shared/utils/fecha-lima';

/** Valor del paso 2 que significa «Cualquier profesional disponible». */
export const CUALQUIER_PROFESIONAL = '*';

/** Días que cubre cada consulta de disponibilidad (de `desde` a `desde + 13`, ambos incluidos). */
export const DIAS_VENTANA = 14;

/** Hasta cuántas ventanas hacia adelante se puede buscar (12 semanas). */
export const VENTANAS_MAXIMAS = 6;

/** Franja del día (hora de Lima) para agrupar la rejilla de horas. */
export type Franja = 'Mañana' | 'Tarde' | 'Noche';

export function franjaDe(inicio: string): Franja {
  const hora = Number(formatearHora(inicio).slice(0, 2));
  return hora < 12 ? 'Mañana' : hora < 18 ? 'Tarde' : 'Noche';
}

export interface GrupoFranja {
  franja: Franja;
  horarios: HorarioReserva[];
}

/** Un día de calendario de Lima con horarios libres. */
export interface DiaReserva {
  /** `YYYY-MM-DD` en Lima. */
  clave: string;
  /** «Viernes, 6 de noviembre de 2026». */
  titulo: string;
  semana: string;
  dia: string;
  mes: string;
  horarios: HorarioReserva[];
  franjas: GrupoFranja[];
}

/** Agrupa los horarios por día de Lima y, dentro de cada día, por franja (en orden). */
export function agruparPorDia(horarios: readonly HorarioReserva[]): DiaReserva[] {
  const dias = new Map<string, DiaReserva>();
  const ordenados = [...horarios].sort(
    (a, b) =>
      a.inicio.localeCompare(b.inicio) || a.profesional.nombre.localeCompare(b.profesional.nombre),
  );
  for (const h of ordenados) {
    const clave = claveDiaLima(h.inicio);
    let dia = dias.get(clave);
    if (!dia) {
      const p = partesCalendarioLima(h.inicio);
      dia = {
        clave,
        titulo: formatearDiaLargo(h.inicio),
        semana: p?.diaSemana ?? '',
        dia: p?.dia ?? '',
        mes: p?.mes ?? '',
        horarios: [],
        franjas: [],
      };
      dias.set(clave, dia);
    }
    dia.horarios.push(h);
    const franja = franjaDe(h.inicio);
    const ultima = dia.franjas.at(-1);
    if (ultima?.franja === franja) ultima.horarios.push(h);
    else dia.franjas.push({ franja, horarios: [h] });
  }
  return [...dias.values()];
}

/** Sedes distintas de una lista de horarios, en orden de aparición. */
export function sedesDe(horarios: readonly HorarioReserva[]): Referencia[] {
  const sedes = new Map<string, Referencia>();
  for (const h of horarios) if (!sedes.has(h.sede.codigo)) sedes.set(h.sede.codigo, h.sede);
  return [...sedes.values()];
}

/** Disponibilidad de un profesional en la ventana consultada (para el paso 2). */
export interface ResumenProfesional {
  total: number;
  /** Primer horario libre (instante ISO), o `null`. */
  proximo: string | null;
  sedes: Referencia[];
}

export function resumirPorProfesional(
  horarios: readonly HorarioReserva[],
): Map<string, ResumenProfesional> {
  const resumen = new Map<
    string,
    { total: number; proximo: string | null; horarios: HorarioReserva[] }
  >();
  for (const h of horarios) {
    const r = resumen.get(h.profesional.codigo) ?? { total: 0, proximo: null, horarios: [] };
    r.total++;
    if (!r.proximo || h.inicio < r.proximo) r.proximo = h.inicio;
    r.horarios.push(h);
    resumen.set(h.profesional.codigo, r);
  }
  return new Map(
    [...resumen].map(([codigo, r]) => [
      codigo,
      { total: r.total, proximo: r.proximo, sedes: sedesDe(r.horarios) },
    ]),
  );
}

/** Minúsculas y sin tildes, para buscar «cardiologia» y encontrar «Cardiología». */
export function normalizar(texto: string | null | undefined): string {
  return (texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Especialidades cuyo nombre o descripción contienen todas las palabras buscadas. */
export function filtrarEspecialidades(
  especialidades: readonly Especialidad[],
  termino: string,
): Especialidad[] {
  const palabras = normalizar(termino).split(/\s+/).filter(Boolean);
  if (!palabras.length) return [...especialidades];
  return especialidades.filter((e) => {
    const texto = normalizar(`${e.nombre} ${e.descripcion ?? ''}`);
    return palabras.every((p) => texto.includes(p));
  });
}

const ICONOS_ESPECIALIDAD: readonly [RegExp, NombreIcono][] = [
  [/cardio|corazon/, 'heart-pulse'],
  [/oftalm|ojo|vision/, 'eye'],
  [/pediatr|nino|neonat/, 'users'],
  [/dermat|piel/, 'shield-check'],
  [/psico|psiqu|salud mental/, 'user'],
  [/nutri|endocrin/, 'trending-up'],
  [/laborat|analisis|odontolog/, 'clipboard-check'],
];

/** Icono decorativo de una especialidad según su nombre (estetoscopio por defecto). */
export function iconoEspecialidad(
  especialidad: Pick<Especialidad, 'codigo' | 'nombre'>,
): NombreIcono {
  const texto = normalizar(`${especialidad.codigo} ${especialidad.nombre}`);
  return ICONOS_ESPECIALIDAD.find(([patron]) => patron.test(texto))?.[1] ?? 'stethoscope';
}

const TRATAMIENTO = /^(dra?|lic|mg|mag|med)\.?\s+/i;

/** Nombre sin el tratamiento («Dra.», «Dr.», «Lic.»), para ordenar alfabéticamente. */
export function nombreSinTratamiento(nombre: string): string {
  return nombre.trim().replace(TRATAMIENTO, '');
}

/** Iniciales para el avatar de un profesional: «Dra. Lucía Paredes Rojas» → «LP». */
export function inicialesProfesional(nombre: string): string {
  const palabras = nombreSinTratamiento(nombre).trim().split(/\s+/).filter(Boolean);
  if (!palabras.length) return '?';
  const letras =
    palabras.length === 1 ? palabras[0].slice(0, 2) : palabras[0].charAt(0) + palabras[1].charAt(0);
  return letras.toLocaleUpperCase('es-PE');
}
