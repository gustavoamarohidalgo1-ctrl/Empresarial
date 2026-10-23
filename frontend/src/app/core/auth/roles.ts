import { Rol } from '../modelos/contrato';

/** Ruta de inicio de cada rol tras el login. */
export const RUTA_INICIO_POR_ROL: Readonly<Record<Rol, string>> = {
  PACIENTE: '/paciente/citas',
  OPERADOR: '/operador',
  RESPONSABLE: '/indicadores',
  ADMINISTRADOR: '/indicadores',
};

export const ETIQUETA_ROL: Readonly<Record<Rol, string>> = {
  PACIENTE: 'Paciente',
  OPERADOR: 'Operador',
  RESPONSABLE: 'Responsable',
  ADMINISTRADOR: 'Administrador',
};

export function rutaInicioPorRol(rol: Rol): string {
  return RUTA_INICIO_POR_ROL[rol] ?? '/login';
}
