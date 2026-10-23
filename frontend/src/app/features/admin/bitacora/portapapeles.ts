/**
 * Copia un texto al portapapeles con la API asíncrona del navegador.
 * Devuelve `false` si no está disponible o el navegador lo rechaza (contexto no seguro,
 * permiso denegado): la pantalla lo explica y el texto sigue visible para copiarlo a mano.
 */
export async function copiarAlPortapapeles(texto: string, documento: Document): Promise<boolean> {
  const portapapeles = documento.defaultView?.navigator?.clipboard;
  if (!portapapeles?.writeText) return false;
  try {
    await portapapeles.writeText(texto);
    return true;
  } catch {
    return false;
  }
}
