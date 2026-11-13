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

  constructor(bajas: SensorBaja[]) {
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

  /** Bajas de la estación que tocan algún día del período (para avisar en las series) */
  bajasEnPeriodo(estacion: string, desde: string, hasta: string): SensorBaja[] {
    return (this.porEstacion.get(estacion) ?? []).filter(b => b.desde <= hasta && (b.hasta === null || b.hasta >= desde));
  }

  /** El valor si está en rango y el sensor no está de baja; si no, null */
  valor(estacion: string, variable: VariableSensor, fecha: string,
    valor: number | string | null | undefined): number | null {
    return this.baja(estacion, variable, fecha) ? null : enRango(variable, valor);
  }
}

/** Texto para mostrar junto a un valor de un sensor dado de baja */
export function textoBaja(b: SensorBaja): string {
  return `${NOMBRE_VARIABLE[b.variable]}: sensor dado de baja (${b.motivo})`;
}
