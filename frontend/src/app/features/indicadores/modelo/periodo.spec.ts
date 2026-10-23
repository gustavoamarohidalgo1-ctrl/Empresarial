import {
  RANGO_MAXIMO_DIAS,
  claveFiltro,
  consultaApi,
  diasIncluidos,
  filtroPorDefecto,
  leerFiltro,
  parametrosDeFiltro,
  resolverPreset,
  textoRango,
  validarRango,
} from './periodo';

const HOY = '2026-10-23';
const leer = (params: Record<string, string>) => leerFiltro((n) => params[n] ?? null, HOY);

describe('periodo de los indicadores', () => {
  describe('resolverPreset', () => {
    it('«Este mes» abarca el mes completo (como el servidor por defecto)', () => {
      expect(resolverPreset('este-mes', HOY)).toEqual({ desde: '2026-10-01', hasta: '2026-10-31' });
      expect(resolverPreset('este-mes', '2028-02-10')).toEqual({
        desde: '2028-02-01',
        hasta: '2028-02-29',
      });
    });

    it('«Últimos 7 días» y «Últimos 30 días» terminan hoy e incluyen hoy', () => {
      expect(resolverPreset('ultimos-7', HOY)).toEqual({ desde: '2026-10-17', hasta: HOY });
      expect(resolverPreset('ultimos-30', HOY)).toEqual({ desde: '2026-09-24', hasta: HOY });
      expect(diasIncluidos('2026-10-17', HOY)).toBe(7);
    });

    it('«Mes anterior» cruza el cambio de año', () => {
      expect(resolverPreset('mes-anterior', HOY)).toEqual({
        desde: '2026-09-01',
        hasta: '2026-09-30',
      });
      expect(resolverPreset('mes-anterior', '2027-01-05')).toEqual({
        desde: '2026-12-01',
        hasta: '2026-12-31',
      });
    });
  });

  describe('validarRango', () => {
    it('acepta un rango válido de hasta 366 días', () => {
      expect(validarRango('2026-01-01', '2026-01-01')).toBeNull();
      expect(validarRango('2025-10-23', '2026-10-23')).toBeNull();
      expect(diasIncluidos('2025-10-23', '2026-10-23')).toBe(RANGO_MAXIMO_DIAS);
    });

    it('rechaza fechas inválidas, invertidas o rangos demasiado largos', () => {
      expect(validarRango('', '2026-10-01')).toContain('inicio válida');
      expect(validarRango('2026-10-01', '2026-02-30')).toContain('fin válida');
      expect(validarRango('2026-10-10', '2026-10-01')).toContain('anterior o igual');
      expect(validarRango('2025-10-22', '2026-10-23')).toContain('366 días');
    });
  });

  describe('leerFiltro (URL → filtro)', () => {
    it('sin parámetros usa el mes en curso y ningún otro filtro', () => {
      expect(leer({})).toEqual({ filtro: filtroPorDefecto(HOY), aviso: null });
    });

    it('lee un atajo y los códigos de sede, especialidad y profesional', () => {
      const { filtro, aviso } = leer({
        periodo: 'ultimos-30',
        sede: 'SURCO',
        especialidad: 'CARDIO',
        profesional: 'P02',
      });
      expect(aviso).toBeNull();
      expect(filtro).toEqual({
        periodo: 'ultimos-30',
        desde: '2026-09-24',
        hasta: HOY,
        sede: 'SURCO',
        especialidad: 'CARDIO',
        profesional: 'P02',
      });
    });

    it('«desde» y «hasta» sin periodo se interpretan como personalizado', () => {
      expect(leer({ desde: '2026-08-01', hasta: '2026-08-15' }).filtro).toMatchObject({
        periodo: 'personalizado',
        desde: '2026-08-01',
        hasta: '2026-08-15',
      });
    });

    it('un periodo inválido no rompe la vista: vuelve al mes en curso y lo explica', () => {
      const casos: Record<string, string>[] = [
        { periodo: 'personalizado', desde: '2026-10-10', hasta: '2026-10-01' },
        { periodo: 'trimestre' },
        { desde: 'ayer' },
      ];
      for (const params of casos) {
        const { filtro, aviso } = leer({ ...params, sede: 'SURCO' });
        expect(filtro.periodo).toBe('este-mes');
        expect(filtro.sede).toBe('SURCO');
        expect(aviso).toContain('no es válido');
      }
    });

    it('ignora códigos con caracteres no permitidos', () => {
      const { filtro } = leer({
        sede: '<script>',
        especialidad: ' CARDIO ',
        profesional: 'a'.repeat(60),
      });
      expect(filtro.sede).toBeNull();
      expect(filtro.especialidad).toBe('CARDIO');
      expect(filtro.profesional).toBeNull();
    });
  });

  describe('parametrosDeFiltro (filtro → URL)', () => {
    it('omite los valores por defecto', () => {
      expect(parametrosDeFiltro(filtroPorDefecto(HOY))).toEqual({
        periodo: null,
        desde: null,
        hasta: null,
        sede: null,
        especialidad: null,
        profesional: null,
      });
    });

    it('guarda los atajos como atajo y el personalizado con sus fechas', () => {
      const atajo = leer({ periodo: 'ultimos-7', sede: 'SURCO' }).filtro;
      expect(parametrosDeFiltro(atajo)).toMatchObject({
        periodo: 'ultimos-7',
        desde: null,
        hasta: null,
        sede: 'SURCO',
      });
      const personalizado = leer({ desde: '2026-08-01', hasta: '2026-08-15' }).filtro;
      expect(parametrosDeFiltro(personalizado)).toMatchObject({
        periodo: 'personalizado',
        desde: '2026-08-01',
        hasta: '2026-08-15',
      });
    });

    it('ida y vuelta: leer lo escrito da el mismo filtro', () => {
      const original = leer({
        periodo: 'personalizado',
        desde: '2026-08-01',
        hasta: '2026-08-15',
        profesional: 'P02',
      }).filtro;
      const params = parametrosDeFiltro(original);
      const releido = leerFiltro((n) => (params[n] as string | null) ?? null, HOY).filtro;
      expect(releido).toEqual(original);
    });
  });

  it('consultaApi envía siempre las fechas y solo los códigos elegidos; la clave es estable', () => {
    const filtro = leer({ periodo: 'ultimos-7', especialidad: 'CARDIO' }).filtro;
    expect(consultaApi(filtro)).toEqual({
      desde: '2026-10-17',
      hasta: HOY,
      especialidad: 'CARDIO',
    });
    expect(claveFiltro(filtro)).toBe('desde=2026-10-17&especialidad=CARDIO&hasta=2026-10-23');
  });

  it('textoRango muestra un día o un rango legible', () => {
    expect(textoRango('2026-10-01', '2026-10-31')).toBe('01 oct 2026 – 31 oct 2026');
    expect(textoRango('2026-10-05', '2026-10-05')).toBe('05 oct 2026');
  });
});
