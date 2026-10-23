/** Prefijo común de la API. En desarrollo, `proxy.conf.json` redirige `/api` a http://localhost:8080. */
export const API_BASE = '/api/v1';

/** Construye una URL de la API a partir de una ruta que empieza con `/`. */
export function api(ruta: string): string {
  return `${API_BASE}${ruta}`;
}
