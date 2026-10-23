import {
  RESULTADOS,
  actorSinUsuario,
  esAccionDeVisitante,
  etiquetaAccion,
  etiquetaEntidad,
  etiquetaRol,
  explicacionCodigoAuditoria,
  fechaHoraLima,
  presentacionResultado,
  referenciaCorta,
} from './formato-auditoria';
import {
  FILTRO_BITACORA_VACIO,
  consultaBitacora,
  filtrosActivos,
  leerFiltroBitacora,
  parametrosBitacora,
  validarFiltroBitacora,
} from './filtro-bitacora';

describe('formato de la bitácora', () => {
  it('traduce las acciones conocidas a un texto legible', () => {
    expect(etiquetaAccion('CITA_CONFIRMAR')).toBe('Confirmar cita');
    expect(etiquetaAccion('LOGIN')).toBe('Iniciar sesión');
    expect(etiquetaAccion('CITA_OPERADOR_PASAR_A_ESPERA')).toBe(
      'Pasar a sala de espera (operador)',
    );
    expect(etiquetaAccion('INDICADORES_EXPORTAR')).toBe('Exportar indicadores (CSV)');
    expect(etiquetaAccion('NOTIFICACION_ACCESO')).toBe('Acceder a una notificación');
  });

  it('todas las acciones que registra el backend tienen un texto propio', () => {
    const esperadas: Record<string, string> = {
      LOGIN: 'Iniciar sesión',
      LOGOUT: 'Cerrar sesión',
      REGISTRO: 'Crear cuenta',
      RECUPERACION_SOLICITAR: 'Solicitar recuperación de contraseña',
      CONTRASENA_RESTABLECER: 'Restablecer contraseña',
      CONTRASENA_CAMBIAR: 'Cambiar contraseña',
      PERFIL_ACTUALIZAR: 'Actualizar datos de contacto',
      ACCESO_RUTA: 'Acceso a una función restringida',
      INDICADORES_EXPORTAR: 'Exportar indicadores (CSV)',
      NOTIFICACION_ACCESO: 'Acceder a una notificación',
      CITA_ACCESO: 'Consultar una cita',
      CITA_REGISTRAR: 'Registrar cita',
      CITA_RESERVAR: 'Reservar cita',
      CITA_CONFIRMAR: 'Confirmar cita',
      CITA_CANCELAR: 'Cancelar cita',
      CITA_REPROGRAMAR: 'Reprogramar cita',
      CITA_PRE_CHECK_IN: 'Completar pre-check-in',
      CITA_REGISTRAR_LLEGADA: 'Registrar llegada',
      CITA_MARCAR_NO_ASISTIO: 'Cerrar cita por inasistencia',
      CITA_OPERADOR_REGISTRAR_LLEGADA: 'Registrar llegada (operador)',
      CITA_OPERADOR_PASAR_A_ESPERA: 'Pasar a sala de espera (operador)',
      CITA_OPERADOR_INICIAR_ATENCION: 'Iniciar atención (operador)',
      CITA_OPERADOR_COMPLETAR: 'Completar atención (operador)',
    };
    for (const [codigo, texto] of Object.entries(esperadas)) {
      expect(etiquetaAccion(codigo)).toBe(texto);
    }
  });

  it('sin actor distingue al visitante sin sesión del proceso automático', () => {
    for (const accion of [
      'LOGIN',
      'REGISTRO',
      'RECUPERACION_SOLICITAR',
      'CONTRASENA_RESTABLECER',
      'ACCESO_RUTA',
      'CUENTA_BLOQUEADA_TEMPORALMENTE',
      'login',
      // Una acción nueva de los flujos de acceso también es de un visitante.
      'RECUPERACION_VERIFICAR',
    ]) {
      expect(esAccionDeVisitante(accion)).toBe(true);
      expect(actorSinUsuario(accion)).toMatchObject({
        tipo: 'visitante',
        nombre: 'Visitante sin sesión',
        icono: 'user',
      });
    }
    for (const accion of [
      'CITA_MARCAR_NO_ASISTIO',
      'CITA_REGISTRAR',
      'RECORDATORIO_ENVIAR',
      'PURGA_NOCTURNA',
      '',
      null,
    ]) {
      expect(esAccionDeVisitante(accion)).toBe(false);
      expect(actorSinUsuario(accion)).toMatchObject({
        tipo: 'sistema',
        nombre: 'Sistema',
        descripcion: 'Proceso automático',
        icono: 'monitor',
      });
    }
  });

  it('explica los códigos propios de la bitácora', () => {
    expect(explicacionCodigoAuditoria('CUENTA_BLOQUEADA_TEMPORALMENTE')).toContain(
      'bloqueada temporalmente',
    );
    expect(explicacionCodigoAuditoria('VERSION_OBSOLETA')).toBeNull();
    expect(explicacionCodigoAuditoria(null)).toBeNull();
  });

  it('humaniza las acciones nuevas sin dejar códigos crudos', () => {
    expect(etiquetaAccion('CITA_ANULAR')).toBe('Anular cita');
    expect(etiquetaAccion('CONTRASENA_CADUCAR')).toBe('Caducar contraseña');
    expect(etiquetaAccion('PERFIL_EXPORTAR')).toBe('Exportar perfil');
    expect(etiquetaAccion('CITA_OPERADOR_REABRIR')).toBe('Reabrir (operador)');
    expect(etiquetaAccion('PURGA_NOCTURNA')).toBe('Purga nocturna');
    expect(etiquetaAccion('')).toBe('Acción sin nombre');
  });

  it('traduce entidades, roles y resultados', () => {
    expect(etiquetaEntidad('CITA')).toBe('Cita');
    expect(etiquetaEntidad('SESION')).toBe('Sesión');
    expect(etiquetaEntidad('HISTORIA_CLINICA')).toBe('Historia clinica');
    expect(etiquetaRol('OPERADOR')).toBe('Operador');
    expect(etiquetaRol(null)).toBe('Sistema');
    expect(presentacionResultado('DENEGADO')).toBe(RESULTADOS.DENEGADO);
    expect(RESULTADOS.EXITO).toMatchObject({
      etiqueta: 'Éxito',
      icono: 'check-circle',
      tono: 'exito',
    });
    expect(presentacionResultado('DESCONOCIDO').etiqueta).toBe('Desconocido');
  });

  it('muestra fecha y hora de Lima al segundo y referencias cortas', () => {
    expect(fechaHoraLima('2026-10-23T14:14:05Z')).toEqual({
      fecha: '23 oct 2026',
      hora: '09:14:05',
    });
    expect(fechaHoraLima('2026-10-24T04:30:00Z')).toEqual({
      fecha: '23 oct 2026',
      hora: '23:30:00',
    });
    expect(fechaHoraLima('no-es-fecha')).toEqual({ fecha: '', hora: '' });
    expect(referenciaCorta('0b6c4f2a-1111-2222')).toBe('0b6c4f2a…');
    expect(referenciaCorta('abc')).toBe('abc');
    expect(referenciaCorta(null)).toBe('—');
  });
});

describe('filtro de la bitácora', () => {
  const leer = (p: Record<string, string>) => leerFiltroBitacora((n) => p[n] ?? null);

  it('lee la URL ignorando lo inválido y nunca el correo', () => {
    expect(
      leer({
        desde: '2026-10-01',
        hasta: '2026-13-01',
        accion: 'CITA_CONFIRMAR',
        resultado: 'DENEGADO',
        usuario: 'ana@correo.pe',
        pagina: '3',
        tamano: '50',
      }),
    ).toEqual({
      desde: '2026-10-01',
      hasta: null,
      accion: 'CITA_CONFIRMAR',
      resultado: 'DENEGADO',
      usuario: null,
      pagina: 2,
      tamano: 50,
    });
    expect(leer({ accion: "x' OR 1=1", resultado: 'TODO', pagina: '-1', tamano: '1000' })).toEqual(
      FILTRO_BITACORA_VACIO,
    );
  });

  it('la URL lleva página en base 1 y omite el correo y los valores por defecto', () => {
    const filtro = {
      ...FILTRO_BITACORA_VACIO,
      accion: 'LOGIN',
      usuario: 'ana@correo.pe',
      pagina: 1,
    };
    expect(parametrosBitacora(filtro)).toEqual({
      desde: null,
      hasta: null,
      accion: 'LOGIN',
      resultado: null,
      pagina: 2,
      tamano: null,
    });
    expect(parametrosBitacora(FILTRO_BITACORA_VACIO)['pagina']).toBeNull();
  });

  it('la API recibe la página en base 0 y el correo', () => {
    expect(
      consultaBitacora({ ...FILTRO_BITACORA_VACIO, usuario: 'ana@correo.pe', pagina: 1 }),
    ).toEqual({
      pagina: '1',
      tamano: '25',
      usuario: 'ana@correo.pe',
    });
  });

  it('valida fechas en orden y el formato del correo', () => {
    expect(validarFiltroBitacora(FILTRO_BITACORA_VACIO)).toEqual([]);
    expect(
      validarFiltroBitacora({ ...FILTRO_BITACORA_VACIO, desde: '2026-10-10', hasta: '2026-10-01' }),
    ).toEqual([{ campo: 'hasta', mensaje: expect.stringContaining('igual o posterior') }]);
    expect(validarFiltroBitacora({ ...FILTRO_BITACORA_VACIO, usuario: 'ana@' })[0].campo).toBe(
      'usuario',
    );
    expect(
      filtrosActivos({ ...FILTRO_BITACORA_VACIO, accion: 'LOGIN', usuario: 'a@b.pe', pagina: 4 }),
    ).toBe(2);
  });
});
