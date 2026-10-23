/**
 * Tema visual (Claro, Oscuro o Sistema). Sin dependencias de Angular para poder aplicarlo en
 * `main.ts` ANTES del primer render, sin script en línea en index.html (CSP estricta).
 *
 * - «Sistema»: sin clase en <html>; manda `prefers-color-scheme` (styles.css).
 * - «Claro» / «Oscuro»: clase `tema-claro` / `tema-oscuro` en <html>.
 * La preferencia se guarda en localStorage, siempre dentro de try/catch (modo privado,
 * almacenamiento bloqueado…): si falla, la app sigue funcionando con «Sistema».
 */

export type PreferenciaTema = 'claro' | 'oscuro' | 'sistema';

export const CLAVE_TEMA = 'siga-sp.tema';

const CLASES: Readonly<Record<Exclude<PreferenciaTema, 'sistema'>, string>> = {
  claro: 'tema-claro',
  oscuro: 'tema-oscuro',
};

export function esPreferenciaTema(valor: unknown): valor is PreferenciaTema {
  return valor === 'claro' || valor === 'oscuro' || valor === 'sistema';
}

/** Lee la preferencia guardada; ante cualquier problema devuelve «sistema». */
export function leerPreferenciaTema(ventana: Window | null | undefined): PreferenciaTema {
  try {
    const valor = ventana?.localStorage?.getItem(CLAVE_TEMA);
    return esPreferenciaTema(valor) ? valor : 'sistema';
  } catch {
    return 'sistema';
  }
}

/** Guarda la preferencia («sistema» borra la clave). Devuelve `false` si no se pudo. */
export function guardarPreferenciaTema(
  ventana: Window | null | undefined,
  preferencia: PreferenciaTema,
): boolean {
  try {
    const almacen = ventana?.localStorage;
    if (!almacen) return false;
    if (preferencia === 'sistema') almacen.removeItem(CLAVE_TEMA);
    else almacen.setItem(CLAVE_TEMA, preferencia);
    return true;
  } catch {
    return false;
  }
}

/** Pone o quita las clases de tema en <html> y ajusta `<meta name="theme-color">`. */
export function aplicarTema(documento: Document, preferencia: PreferenciaTema): void {
  const raiz = documento.documentElement;
  raiz.classList.toggle(CLASES.claro, preferencia === 'claro');
  raiz.classList.toggle(CLASES.oscuro, preferencia === 'oscuro');
  sincronizarColorNavegador(documento, preferencia);
}

/** Aplica el tema guardado. Se llama en `main.ts` antes de `bootstrapApplication`. */
export function aplicarTemaInicial(documento: Document = document): PreferenciaTema {
  const preferencia = leerPreferenciaTema(documento.defaultView);
  aplicarTema(documento, preferencia);
  return preferencia;
}

/**
 * Con tema fijado a mano, ambos `<meta name="theme-color">` (claro y oscuro) toman el color
 * del token `--c-tema-navegador`; con «sistema» recuperan su valor original del HTML.
 */
function sincronizarColorNavegador(documento: Document, preferencia: PreferenciaTema): void {
  const metas = Array.from(documento.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'));
  if (!metas.length) return;
  let color = '';
  if (preferencia !== 'sistema') {
    try {
      color =
        documento.defaultView
          ?.getComputedStyle(documento.documentElement)
          .getPropertyValue('--c-tema-navegador')
          .trim() ?? '';
    } catch {
      color = '';
    }
  }
  for (const meta of metas) {
    const original = meta.dataset['original'] ?? meta.content;
    meta.dataset['original'] = original;
    meta.content = color || original;
  }
}
