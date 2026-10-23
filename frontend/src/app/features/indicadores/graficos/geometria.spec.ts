import { escalaLimpia, indiceConTecla, rutaArco, rutaColumna, rutaTrama } from './geometria';
import { agruparPorPeriodo, granularidadPara } from './series';

describe('geometría de los gráficos', () => {
  it('escalaLimpia da máximos y marcas «redondos»', () => {
    expect(escalaLimpia(50)).toEqual({ max: 60, marcas: [0, 20, 40, 60] });
    expect(escalaLimpia(7)).toEqual({ max: 8, marcas: [0, 2, 4, 6, 8] });
    expect(escalaLimpia(3)).toEqual({ max: 3, marcas: [0, 1, 2, 3] });
    expect(escalaLimpia(0).max).toBeGreaterThan(0);
    expect(escalaLimpia(17.5, 4, false)).toEqual({ max: 20, marcas: [0, 5, 10, 15, 20] });
  });

  it('rutaColumna redondea solo el extremo de datos y omite columnas vacías', () => {
    const d = rutaColumna(10, 20, 16, 40, 4);
    expect(d.startsWith('M10 60V24A4 4')).toBe(true);
    expect(d.endsWith('V60Z')).toBe(true);
    expect(rutaColumna(0, 0, 16, 40, 0)).not.toContain('A');
    expect(rutaColumna(0, 0, 16, 0)).toBe('');
  });

  it('rutaTrama dibuja diagonales dentro del rectángulo', () => {
    const d = rutaTrama(0, 0, 20, 20, 5);
    const numeros = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
    expect(numeros.length).toBeGreaterThan(0);
    expect(Math.min(...numeros)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...numeros)).toBeLessThanOrEqual(20);
    expect(rutaTrama(0, 0, 0, 10)).toBe('');
  });

  it('rutaArco dibuja sectores y el anillo completo en dos mitades', () => {
    expect(rutaArco(100, 100, 96, 66, 0, Math.PI / 2)).toMatch(
      /^M100 4A96 96 0 0 1 196 100L166 100A66 66 0 0 0 100 34Z$/,
    );
    expect(rutaArco(100, 100, 96, 66, 0, Math.PI * 2).match(/M/g)?.length).toBe(2);
    expect(rutaArco(100, 100, 96, 66, 1, 1)).toBe('');
  });

  it('indiceConTecla recorre con flechas, Inicio y Fin sin salirse', () => {
    expect(indiceConTecla('ArrowRight', 0, 3)).toBe(1);
    expect(indiceConTecla('ArrowRight', 2, 3)).toBe(2);
    expect(indiceConTecla('ArrowLeft', 0, 3)).toBe(0);
    expect(indiceConTecla('ArrowDown', 1, 3)).toBe(2);
    expect(indiceConTecla('Home', 2, 3)).toBe(0);
    expect(indiceConTecla('End', 0, 3)).toBe(2);
    expect(indiceConTecla('Enter', 0, 3)).toBeNull();
    expect(indiceConTecla('ArrowRight', 0, 0)).toBeNull();
  });
});

describe('series por periodo', () => {
  const dia = (fecha: string, total = 4) => ({
    fecha,
    total,
    completadas: 2,
    canceladas: 1,
    noAsistio: 0,
  });

  it('elige día, semana o mes según la longitud del periodo', () => {
    expect(granularidadPara(31)).toBe('dia');
    expect(granularidadPara(62)).toBe('dia');
    expect(granularidadPara(90)).toBe('semana');
    expect(granularidadPara(366)).toBe('mes');
  });

  it('por día: una columna por día, con «otras» = total − el resto', () => {
    const puntos = agruparPorPeriodo([dia('2026-10-02'), dia('2026-10-01', 10)], 'dia');
    expect(puntos.map((p) => p.clave)).toEqual(['2026-10-01', '2026-10-02']);
    expect(puntos[0]).toMatchObject({ corta: '1 oct', total: 10, resto: 7 });
    expect(puntos[0].larga).toBe('Jueves, 1 de octubre de 2026');
  });

  it('por semana: agrupa de lunes a domingo y suma', () => {
    // 2026-10-04 es domingo; 2026-10-05, lunes.
    const puntos = agruparPorPeriodo(
      [dia('2026-10-03'), dia('2026-10-04'), dia('2026-10-05'), dia('2026-10-06')],
      'semana',
    );
    expect(puntos).toHaveLength(2);
    expect(puntos[0]).toMatchObject({ clave: '2026-10-03', total: 8, completadas: 4 });
    expect(puntos[0].larga).toBe('Del 03 oct 2026 al 04 oct 2026');
    expect(puntos[1]).toMatchObject({ clave: '2026-10-05', total: 8 });
  });

  it('por mes: una columna por mes', () => {
    const puntos = agruparPorPeriodo(
      [dia('2026-09-30'), dia('2026-10-01'), dia('2026-10-31')],
      'mes',
    );
    expect(puntos.map((p) => p.total)).toEqual([4, 8]);
    expect(puntos[1].larga).toBe('Octubre de 2026');
    expect(puntos[1].corta).toBe('oct 26');
  });
});
