import { ChartDataset } from 'chart.js';
import { VAR_COLOR } from './chart-theme';

/**
 * Normales mensuales de una estación (normales.php, tabla `normales`). Cada clave trae
 * 12 valores (enero a diciembre) o no viene si la estación no la tiene.
 * Unidades: rr mm/mes; tl/th °C; hl/hh %; pr hPa; vi/vix km/h; rg/rgx W/m² (media
 * diaria); et mm/día; hj horas/día.
 */
export type ClaveNormalTabla = 'rr' | 'tl' | 'th' | 'hl' | 'hh' | 'pr' | 'vi' | 'vix' | 'rg' | 'rgx' | 'et' | 'hj';
/**
 * Período de referencia de las normales (cambia de una estación a otra). Viene de normales.php
 * sólo si la tabla tiene esas columnas: años desde/hasta o un texto libre («1991-2020»).
 */
export interface PeriodoNormales {
  desde?: number | string | null;
  hasta?: number | string | null;
  texto?: string | null;
}

export type Normales = Partial<Record<ClaveNormalTabla, (number | null)[]>> & { periodo?: PeriodoNormales };

/** Período de las normales en texto («1991–2020»); vacío si la API no lo trae. */
export function textoPeriodoNormales(n: Normales | null | undefined): string {
  const p = n?.periodo;
  if (!p) return '';
  const desde = String(p.desde ?? '').trim();
  const hasta = String(p.hasta ?? '').trim();
  if (desde && hasta) return `${desde}–${hasta}`;
  if (desde) return `desde ${desde}`;
  if (hasta) return `hasta ${hasta}`;
  return String(p.texto ?? '').trim();
}

/** Las de la tabla más 'hr': humedad relativa promedio, (máx + mín) / 2 como en las comparaciones */
export type ClaveNormal = ClaveNormalTabla | 'hr';

/** Variables que se suman al agrupar por década o mes (las demás se promedian) */
const ACUMULADAS: ClaveNormal[] = ['rr', 'et', 'hj'];

/** Variable de los datos diarios (datos-diarios.php) → normal equivalente */
export const NORMAL_DE_VARIABLE: Record<string, ClaveNormal> = {
  temp_max: 'th',
  temp_min: 'tl',
  HR: 'hr',
  HR_max: 'hh',
  HR_min: 'hl',
  rr_24: 'rr',
  presion_media_24: 'pr',
  viento_medio: 'vi',
  viento_max: 'vix',
  rad_solar_media: 'rg',
  rad_solar_max: 'rgx',
  et: 'et',
  hum_hoja_hs: 'hj'
};

function aFecha(fecha: string | Date): Date | null {
  if (fecha instanceof Date) return isNaN(fecha.getTime()) ? null : fecha;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(fecha);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

function mensual(n: Normales, clave: ClaveNormalTabla, mes: number): number | null {
  const v = n[clave]?.[mes];
  return v === null || v === undefined || isNaN(v) ? null : v;
}

/**
 * Valor normal de un día. La lluvia normal es mensual: se reparte por igual entre los
 * días del mes (promedio diario). Las demás ya son valores diarios o medias del mes.
 */
export function normalDelDia(n: Normales | null, clave: ClaveNormal, fecha: string | Date): number | null {
  const d = n ? aFecha(fecha) : null;
  if (!n || !d) return null;
  const mes = d.getMonth();
  if (clave === 'hr') {
    const hh = mensual(n, 'hh', mes);
    const hl = mensual(n, 'hl', mes);
    return hh === null || hl === null ? null : (hh + hl) / 2;
  }
  const v = mensual(n, clave, mes);
  if (v === null) return null;
  if (clave === 'rr') {
    const diasDelMes = new Date(d.getFullYear(), mes + 1, 0).getDate();
    return v / diasDelMes;
  }
  return v;
}

/** Serie diaria de la normal para las fechas de un gráfico diario. */
export function normalDiaria(n: Normales | null, clave: ClaveNormal, fechas: (string | Date)[]): (number | null)[] {
  return fechas.map(f => redondear(normalDelDia(n, clave, f)));
}

/**
 * Normal de un grupo de días (una década o un mes) con el mismo criterio que los datos:
 * suma de los días para lluvia, ET y hoja mojada, promedio para el resto. Se calcula sobre
 * los días que tienen dato, así un mes incompleto se compara con la parte equivalente.
 */
export function normalDeGrupo(n: Normales | null, clave: ClaveNormal, fechas: (string | Date)[]): number | null {
  if (!n || !fechas.length) return null;
  const valores = fechas.map(f => normalDelDia(n, clave, f));
  if (valores.some(v => v === null)) return null;
  const suma = (valores as number[]).reduce((a, b) => a + b, 0);
  return redondear(ACUMULADAS.includes(clave) ? suma : suma / valores.length);
}

/**
 * Serie de la normal para un gráfico diario, decádico o mensual armado a partir de los
 * registros diarios (fechas aaaa-mm-dd). Agrupa con las mismas claves que las comparaciones
 * (aaaa-mm-1/2/3 por década, aaaa-mm por mes) y en el mismo orden, uno por grupo.
 */
export function serieNormalAgrupada(n: Normales | null, clave: ClaveNormal, fechas: string[],
  formato: string): (number | null)[] {
  if (formato !== 'decadico' && formato !== 'mensual') return normalDiaria(n, clave, fechas);
  const grupos = new Map<string, string[]>();
  for (const f of fechas) {
    const dia = Number(f.slice(8, 10));
    const k = formato === 'mensual' ? f.slice(0, 7) : `${f.slice(0, 7)}-${dia <= 10 ? 1 : dia <= 20 ? 2 : 3}`;
    grupos.set(k, [...(grupos.get(k) ?? []), f]);
  }
  return [...grupos.keys()].sort().map(k => normalDeGrupo(n, clave, grupos.get(k)!));
}

/** Acumulado día a día de la normal (para gráficos de lluvia acumulada). */
export function normalAcumulada(n: Normales | null, clave: ClaveNormal, fechas: (string | Date)[]): (number | null)[] {
  let total = 0;
  let cortada = false;
  return fechas.map(f => {
    const v = normalDelDia(n, clave, f);
    if (v === null) cortada = true;
    if (cortada) return null;
    total += v as number;
    return redondear(total);
  });
}

/** ¿Hay al menos un valor para dibujar? Si no, el gráfico no lleva la normal. */
export function tieneValores(serie: (number | null)[]): boolean {
  return serie.some(v => v !== null);
}

/**
 * Serie de la normal en un gráfico: línea punteada, sin puntos.
 * Sin color propio usa el gris de referencia (VAR_COLOR.normal).
 */
export function datasetNormal(label: string, data: (number | null)[], color: string = VAR_COLOR.normal): ChartDataset<'line', (number | null)[]> {
  return {
    type: 'line',
    label,
    data,
    borderColor: color,
    backgroundColor: color,
    borderWidth: 2,
    borderDash: [6, 4],
    pointRadius: 0,
    pointHoverRadius: 3,
    fill: false,
    tension: 0,
    spanGaps: true
  };
}

function redondear(v: number | null): number | null {
  return v === null ? null : Math.round(v * 100) / 100;
}
