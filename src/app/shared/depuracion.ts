/*
 * Depuración de datos para todo el sitio:
 *   - RANGOS: el rango físico aceptado de cada variable (afuera hay valores de error o de relleno,
 *     como −99,9). Es el único lugar donde se definen.
 *   - Sensores dados de baja: la Sección los carga en /admin (pestaña «Sensores dados de baja») y
 *     el sitio los lee de /services/sensores-baja.php con SensoresBajaService. Un valor de un sensor
 *     de baja no se muestra ni se usa: va como «—», con el motivo.
 * Las variables tienen que coincidir con VARIABLES_SENSOR de server/admin/api/sensores_baja.php.
 */

export type VariableSensor = 'temperatura' | 'humedad' | 'viento' | 'lluvia' | 'radiacion' | 'presion' | 'hoja';

export const VARIABLES_SENSOR: VariableSensor[] = ['temperatura', 'humedad', 'viento', 'lluvia', 'radiacion', 'presion', 'hoja'];

export const NOMBRE_VARIABLE: Record<VariableSensor, string> = {
  temperatura: 'Temperatura',
  humedad: 'Humedad relativa',
  viento: 'Viento',
  lluvia: 'Lluvia',
  radiacion: 'Radiación solar',
  presion: 'Presión',
  hoja: 'Hoja mojada'
};

/**
 * Rango físico aceptado. La humedad relativa empieza en 1 %: un 0 % es un sensor caído. La presión
 * cubre las estaciones de 300 a 3.000 m. La lluvia es la de un registro o la de un día.
 */
export const RANGOS: Record<VariableSensor, [number, number]> = {
  temperatura: [-25, 50],
  humedad: [1, 100],
  viento: [0, 250],
  lluvia: [0, 500],
  radiacion: [0, 1500],
  presion: [500, 1100],
  hoja: [0, 24]
};

/** Valor numérico dentro del rango de la variable, o null (vacío, no numérico o fuera de rango). */
export function enRango(variable: VariableSensor, valor: number | string | null | undefined): number | null {
  if (valor === null || valor === undefined || String(valor).trim() === '') return null;
  const n = Number(valor);
  const [min, max] = RANGOS[variable];
  return isNaN(n) || n < min || n > max ? null : n;
}

/** Fila de /services/sensores-baja.php */
export interface SensorBaja {
  estacion: string;
  variable: VariableSensor;
  /** AAAA-MM-DD */
  desde: string;
  /** AAAA-MM-DD; null: sigue de baja */
  hasta: string | null;
  motivo: string;
}

/** Consulta de los sensores dados de baja de una lista ya cargada */
export class Depurador {
  private readonly porEstacion = new Map<string, SensorBaja[]>();

  /** idPorNombre: nombre de la estación en minúsculas → identificación (para respuestas sin id) */
  constructor(bajas: SensorBaja[], private readonly idPorNombre = new Map<string, string>()) {
    for (const b of bajas) {
      const lista = this.porEstacion.get(b.estacion) ?? [];
      lista.push(b);
      this.porEstacion.set(b.estacion, lista);
    }
  }

  /** Baja que alcanza a esa variable de la estación en esa fecha (AAAA-MM-DD), o null */
  baja(estacion: string, variable: VariableSensor, fecha: string): SensorBaja | null {
    return this.porEstacion.get(estacion)?.find(b =>
      b.variable === variable && b.desde <= fecha && (b.hasta === null || b.hasta >= fecha)) ?? null;
  }

  /** Identificación de una estación por su nombre (datos-temperatura.php no trae el id) */
  idDe(nombre: string | null | undefined): string | null {
    return this.idPorNombre.get((nombre ?? '').trim().toLowerCase()) ?? null;
  }

  /** Bajas de la estación que tocan algún día del período (para avisar en las series) */
  bajasEnPeriodo(estacion: string, desde: string, hasta: string): SensorBaja[] {
    return (this.porEstacion.get(estacion) ?? []).filter(b => b.desde <= hasta && (b.hasta === null || b.hasta >= desde));
  }

  /**
   * Copia de la fila sin los campos de los sensores dados de baja en algún día del período
   * (AAAA-MM-DD). Los campos se borran (quedan undefined, no null): así Number() y parseFloat()
   * dan NaN y cada sección los muestra como «sin dato». Un promedio o total de un período en el
   * que el sensor estuvo de baja aunque sea un día también se borra: incluye datos erróneos.
   */
  limpiar<T extends object>(fila: T, estacion: string | number | null | undefined, desde: string, hasta: string,
    campos: CamposSensor): T {
    if (estacion === null || estacion === undefined) return fila;
    const bajas = this.bajasEnPeriodo(String(estacion), desde, hasta);
    if (!bajas.length) return fila;
    const copia: Record<string, unknown> = { ...(fila as Record<string, unknown>) };
    for (const b of bajas) {
      for (const campo of campos[b.variable] ?? []) delete copia[campo];
    }
    return copia as T;
  }

  /** El valor si está en rango y el sensor no está de baja; si no, null */
  valor(estacion: string, variable: VariableSensor, fecha: string,
    valor: number | string | null | undefined): number | null {
    return this.baja(estacion, variable, fecha) ? null : enRango(variable, valor);
  }
}

/** Texto para mostrar junto a un valor de un sensor dado de baja */
export function textoBaja(b: SensorBaja): string {
  // Las estaciones sin el sensor (SensoresBajaService) tienen una baja sin fecha de inicio real
  if (b.desde <= '1900-01-01') return `Sin sensor de ${NOMBRE_VARIABLE[b.variable].toLowerCase()}`;
  const dudoso = esAConfirmar(b);
  return dudoso ? `${NOMBRE_VARIABLE[b.variable]}: dato a confirmar (${b.motivo.slice(A_CONFIRMAR.length).trim()})`
    : `${NOMBRE_VARIABLE[b.variable]}: sensor dado de baja (${b.motivo})`;
}

/**
 * Dato dudoso: no se muestra hasta que la Sección lo confirme (por ejemplo, una lluvia que sólo
 * registró una estación). Es una baja como las demás, con el motivo que empieza con A_CONFIRMAR; si
 * se confirma que el dato es bueno, se borra la baja.
 */
export const A_CONFIRMAR = 'A confirmar:';

export function esAConfirmar(b: { motivo: string }): boolean {
  return b.motivo.startsWith(A_CONFIRMAR);
}

/** Campos de una respuesta que salen de cada sensor */
export type CamposSensor = Partial<Record<VariableSensor, string[]>>;

/** La ET se calcula con temperatura, humedad, viento y radiación: cae con cualquiera de ellos */
function conEt(campos: CamposSensor, et: string): CamposSensor {
  const r: CamposSensor = { ...campos };
  for (const v of ['temperatura', 'humedad', 'viento', 'radiacion'] as VariableSensor[]) r[v] = [...(r[v] ?? []), et];
  return r;
}

/** estaciones.php y datos-online.php: el último registro de cada estación (rr_mes va aparte, por mes) */
export const CAMPOS_ACTUALES: CamposSensor = {
  temperatura: ['temp_af'],
  humedad: ['hum_af'],
  lluvia: ['RR_dia', 'rr_dia', 'rr_15'],
  viento: ['viento_medio', 'viento_max', 'rafaga24', 'direc'],
  presion: ['presion']
};

/** datos-diarios.php y resumen-diario.php: un día */
export const CAMPOS_DIARIOS: CamposSensor = conEt({
  temperatura: ['temp_max', 'temp_min'],
  humedad: ['HR_max', 'HR_min'],
  lluvia: ['rr_24'],
  viento: ['viento_medio', 'viento_max'],
  radiacion: ['rad_solar_media', 'rad_solar_max'],
  presion: ['presion_media_24'],
  hoja: ['hum_hoja_hs']
}, 'et');

/** datos-24hs.php y datos-enfermedades.php: un registro de 15 minutos */
export const CAMPOS_REGISTRO: CamposSensor = conEt({
  temperatura: ['temp_af', 'temp_haf', 'temp_laf'],
  humedad: ['hum_af'],
  lluvia: ['lluvia', 'tasa_lluvia'],
  viento: ['viento_medio', 'viento_max', 'direccion', 'direccion_vmax', 'direccion_vmed'],
  radiacion: ['rad_solar', 'rad_solar_h'],
  presion: ['presion'],
  hoja: ['hum_hoja']
}, 'et');

/** datos-resumen.php: totales y promedios del período de una estación */
export const CAMPOS_RESUMEN: CamposSensor = conEt({
  temperatura: ['TempMaxAbs', 'TempMinAbs', 'tempMaxMedia', 'tempMinMedia', 'amplitudTermica', 'horasHelada', 'diasHelada',
    'horasTMenor18', 'horasTMayor32'],
  humedad: ['humedadMaxAbs', 'humedadMinAbs', 'humedadMaxMedia', 'humedadMinMedia', 'amplitudHigrica', 'horasMenor20',
    'horasMenor40', 'horasMayor80', 'horasMayor90'],
  lluvia: ['lluvia', 'lluviaMaxDiaria', 'diasLluvia'],
  viento: ['vientoMedio', 'VientoMaximo', 'norte', 'norNorEste', 'norEste', 'esteNorEste', 'este', 'esteSurEste', 'surEste',
    'surSurEste', 'sur', 'surSurOeste', 'surOeste', 'oesteSurOeste', 'oeste', 'oesteNorOeste', 'norOeste', 'norNorOeste', 'calma'],
  radiacion: ['radSolarMedia', 'radSolarMax'],
  presion: ['presionMedia', 'presionMax', 'presionMin'],
  hoja: ['horasHumedadHoja']
}, 'evapotranspiracion');

/** datos-alerta.php: lluvia y mínimas del período */
export const CAMPOS_ALERTA: CamposSensor = {
  lluvia: ['totalLluvia', 'maxLluvia', 'maxLluviaDia', 'fechaMaxLluviaDia', 'registrosLluvia'],
  temperatura: ['minimaTemperatura', 'registrosHelada']
};

/** lluvia-periodo.php */
export const CAMPOS_LLUVIA_PERIODO: CamposSensor = {
  lluvia: ['mm', 'maxRegistro', 'registrosLluvia']
};

/** datos-temperatura.php */
export const CAMPOS_TEMPERATURA_PERIODO: CamposSensor = {
  temperatura: ['avg_temp_max', 'abs_max_temp', 'avg_temp_min', 'abs_min_temp', 'avg_temp_period', 'abs_max_date', 'abs_min_date']
};

/** datos-heladas.php */
export const CAMPOS_HELADAS: CamposSensor = {
  temperatura: ['minAbs', 'hsDebajo-4', 'hsDebajo-2', 'maxHsDebajo0', 'diasHeladas', 'FPH', 'FUH', 'hsDebajo0']
};

/** Primer día del mes de una fecha AAAA-MM-DD (para los acumulados del mes) */
export function inicioDeMes(fecha: string): string {
  return `${fecha.slice(0, 7)}-01`;
}
