import { Chart, ChartDataset, Plugin, TooltipItem } from 'chart.js';
import { conAlfa } from './chart-theme';

/**
 * Días faltantes en los gráficos de datos diarios (datos-diarios.php).
 *
 * La API no devuelve fila para un día sin registro de la estación, así que los gráficos
 * arman primero el calendario completo del período y ubican cada valor por su fecha:
 * un día sin registro queda como hueco (null) y se marca con una franja gris. Al agrupar
 * por década o mes se suma o promedia sólo lo que hay y el período se marca incompleto.
 */

export type FormatoSerie = 'diario' | 'decadico' | 'mensual';

/** Variables que se suman al agrupar (las demás se promedian) */
export const VARIABLES_ACUMULADAS = ['rr_24', 'et', 'hum_hoja_hs'];

/** Fondo de los días sin registro (el mismo en todos los gráficos) */
export const COLOR_SIN_DATOS = 'rgba(148, 163, 184, .22)';

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function fechaIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** aaaa-mm-dd → dd/mm */
export function etiquetaDia(fecha: string): string {
  return `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
}

/**
 * Fechas aaaa-mm-dd de desde a hasta inclusive, sin pasar de hoy (lo futuro no es un
 * faltante). Hoy entra sólo si ya tiene registro: el día en curso puede no estar cargado.
 */
export function fechasDelPeriodo(desde: Date, hasta: Date, conRegistro?: (fecha: string) => boolean): string[] {
  const hoy = new Date();
  const tope = hasta > hoy ? hoy : hasta;
  const fechas: string[] = [];
  for (let d = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate()); d <= tope;
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    fechas.push(fechaIso(d));
  }
  const fechaHoy = fechaIso(hoy);
  if (fechas[fechas.length - 1] === fechaHoy && conRegistro && !conRegistro(fechaHoy)) fechas.pop();
  return fechas;
}

/** Registros por fecha aaaa-mm-dd */
export function porFecha<T extends { fecha: string }>(registros: T[]): Map<string, T> {
  return new Map(registros.map(r => [String(r.fecha).slice(0, 10), r]));
}

function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

/**
 * Valor diario de una variable, o null si el día no tiene registro o la variable no tiene
 * dato. 'HR' es el promedio de la máxima y la mínima. ET 0 con radiación 0 o sin dato es
 * el sensor de radiación sin datos, no un día sin evapotranspiración.
 */
export function valorDiario(r: object | undefined, clave: string): number | null {
  if (!r) return null;
  const reg = r as Record<string, unknown>;
  if (clave === 'HR') {
    const max = numero(reg['HR_max']);
    const min = numero(reg['HR_min']);
    return max === null || min === null ? null : (max + min) / 2;
  }
  const v = numero(reg[clave]);
  if (clave === 'et' || clave === 'rad_solar_media') {
    const et = numero(reg['et']);
    const rad = numero(reg['rad_solar_media']);
    if (et === 0 && (rad === null || rad === 0)) return null;
  }
  return v;
}

/** Un punto del eje: un día, una década o un mes, con los días del período que abarca */
export interface Periodo {
  clave: string;
  etiqueta: string;
  fechas: string[];
}

/** Agrupa el calendario en días, décadas (01-10, 11-20, 21-fin) o meses, en orden. */
export function periodosDe(fechas: string[], formato: FormatoSerie): Periodo[] {
  if (formato !== 'decadico' && formato !== 'mensual') {
    return fechas.map(f => ({ clave: f, etiqueta: etiquetaDia(f), fechas: [f] }));
  }
  const grupos = new Map<string, Periodo>();
  for (const f of fechas) {
    const dia = Number(f.slice(8, 10));
    const dec = dia <= 10 ? 1 : dia <= 20 ? 2 : 3;
    const clave = formato === 'mensual' ? f.slice(0, 7) : `${f.slice(0, 7)}-${dec}`;
    if (!grupos.has(clave)) {
      const mes = `${MESES_CORTOS[Number(f.slice(5, 7)) - 1]} ${f.slice(0, 4)}`;
      const etiqueta = formato === 'mensual' ? mes : `${['01-10', '11-20', '21-fin'][dec - 1]} ${mes}`;
      grupos.set(clave, { clave, etiqueta, fechas: [] });
    }
    grupos.get(clave)!.fechas.push(f);
  }
  return [...grupos.values()];
}

/** Una serie ubicada sobre los períodos del eje, con la cobertura de cada punto */
export interface SerieConFaltantes {
  valores: (number | null)[];
  /** Días con dato / días del período, por punto */
  conDato: number[];
  esperados: number[];
  /** Fechas propias de la serie con dato, por punto (para la normal equivalente) */
  fechasConDato: string[][];
  /** Fechas propias de la serie sin dato (para el aviso) */
  faltantes: string[];
}

/**
 * Valores de una variable sobre los períodos del eje. `fechaPropia` lleva la fecha del eje
 * a la de la serie (otro año en la comparación entre años). Al agrupar se suma o promedia
 * sobre los días con dato; un período sin ningún dato queda en null.
 */
export function serieConFaltantes(registros: Map<string, object>, periodos: Periodo[], clave: string,
  fechaPropia: (fecha: string) => string = f => f): SerieConFaltantes {
  const acumulada = VARIABLES_ACUMULADAS.includes(clave);
  const serie: SerieConFaltantes = { valores: [], conDato: [], esperados: [], fechasConDato: [], faltantes: [] };
  const hoy = fechaIso(new Date());
  for (const p of periodos) {
    const vals: number[] = [];
    const fechas: string[] = [];
    let esperados = 0;
    for (const f of p.fechas) {
      const propia = fechaPropia(f);
      // Un día futuro de la serie (año en curso) no es un faltante
      if (propia > hoy) continue;
      esperados++;
      const v = valorDiario(registros.get(propia), clave);
      if (v === null) {
        serie.faltantes.push(propia);
      } else {
        vals.push(v);
        fechas.push(propia);
      }
    }
    const suma = vals.reduce((a, b) => a + b, 0);
    const valor = !vals.length ? null : acumulada ? suma : suma / vals.length;
    serie.valores.push(valor === null ? null : Math.round(valor * 100) / 100);
    serie.conDato.push(vals.length);
    serie.esperados.push(esperados);
    serie.fechasConDato.push(fechas);
  }
  return serie;
}

/** ¿Al punto i le faltan días? (con al menos un dato: sin ninguno es un hueco) */
export function esIncompleto(s: SerieConFaltantes, i: number): boolean {
  return s.conDato[i] > 0 && s.conDato[i] < s.esperados[i];
}

/** "01/05–04/05, 12/05" a partir de fechas aaaa-mm-dd ordenadas */
export function tramosDeFechas(fechas: string[]): string {
  const tramos: string[] = [];
  let inicio: string | null = null;
  let anterior: string | null = null;
  const siguiente = (f: string) => {
    const d = new Date(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10) + 1);
    return fechaIso(d);
  };
  const cerrar = () => {
    if (inicio) tramos.push(inicio === anterior ? etiquetaDia(inicio) : `${etiquetaDia(inicio)}–${etiquetaDia(anterior!)}`);
  };
  for (const f of fechas) {
    if (anterior && f === siguiente(anterior)) {
      anterior = f;
      continue;
    }
    cerrar();
    inicio = f;
    anterior = f;
  }
  cerrar();
  return tramos.join(', ');
}

/** "4 días (01/05–04/05)", o "" si no falta ninguno */
export function describirFaltantes(fechas: string[]): string {
  if (!fechas.length) return '';
  const n = fechas.length;
  const tramos = tramosDeFechas(fechas);
  return `${n} ${n === 1 ? 'día' : 'días'}` + (tramos.length <= 80 ? ` (${tramos})` : '');
}

/** Pinta una franja gris detrás de los puntos indicados del eje x */
export function dibujarFranjasSinDatos(chart: Chart, indices: number[]): void {
  const x = chart.scales['x'];
  const area = chart.chartArea;
  if (!x || !area || !indices.length) return;
  const total = chart.data.labels?.length ?? 0;
  const ancho = total > 1 ? Math.abs(x.getPixelForValue(1) - x.getPixelForValue(0)) : area.width;
  const ctx = chart.ctx;
  ctx.save();
  ctx.fillStyle = COLOR_SIN_DATOS;
  for (const i of indices) {
    const centro = x.getPixelForValue(i);
    ctx.fillRect(centro - ancho / 2, area.top, ancho, area.bottom - area.top);
  }
  ctx.restore();
}

/** Plugin de Chart.js con las franjas de los días sin registro (`indices` se lee al dibujar) */
export function pluginFranjasSinDatos(indices: () => number[]): Plugin {
  return {
    id: 'franjasSinDatos',
    beforeDatasetsDraw: (chart: Chart) => dibujarFranjasSinDatos(chart, indices())
  };
}

/** Puntos del eje donde alguna serie no tiene ningún dato (franja gris) */
export function indicesSinDatos(series: SerieConFaltantes[]): number[] {
  const n = series[0]?.valores.length ?? 0;
  return Array.from({ length: n }, (_, i) => i)
    .filter(i => series.some(s => s.esperados[i] > 0 && s.conDato[i] === 0));
}

/**
 * Datasets de las series comparadas: huecos donde no hay dato y, en los períodos
 * incompletos, barra más clara con borde o punto hueco con el tramo punteado.
 */
export function datasetsConFaltantes(series: SerieConFaltantes[], etiquetas: string[], barras: boolean,
  colores: readonly string[]): ChartDataset<'line' | 'bar', (number | null)[]>[] {
  return series.map((s, k) => {
    const color = colores[k % colores.length];
    const inc = s.valores.map((_, i) => esIncompleto(s, i));
    if (barras) {
      return {
        type: 'bar',
        label: etiquetas[k],
        data: s.valores,
        yAxisID: 'y',
        borderColor: color,
        backgroundColor: inc.map(x => conAlfa(color, x ? .3 : .75)),
        borderWidth: inc.map(x => (x ? 1.5 : 0))
      } as ChartDataset<'bar', (number | null)[]>;
    }
    return {
      type: 'line',
      label: etiquetas[k],
      data: s.valores,
      yAxisID: 'y',
      fill: false,
      tension: 0.2,
      spanGaps: false,
      borderColor: color,
      backgroundColor: conAlfa(color, .15),
      pointBackgroundColor: inc.map(x => (x ? '#ffffff' : color)),
      pointBorderColor: color,
      pointRadius: inc.map(x => (x ? 4 : 2.5)),
      segment: { borderDash: (ctx: { p0DataIndex: number; p1DataIndex: number }) =>
        (inc[ctx.p0DataIndex] || inc[ctx.p1DataIndex] ? [4, 3] : undefined) }
    } as ChartDataset<'line', (number | null)[]>;
  });
}

/** Tooltip: "≥" en sumas incompletas y cuántos días con dato tiene el período */
export function tooltipConFaltantes(series: SerieConFaltantes[], acumulada: boolean) {
  return {
    titleColor: '#ffffff',
    bodyColor: '#ffffff',
    backgroundColor: 'rgba(17,24,39,0.9)',
    callbacks: {
      label: (ctx: TooltipItem<'line' | 'bar'>) => {
        const v = ctx.parsed.y;
        const s = series[ctx.datasetIndex];
        const valor = v === null || v === undefined ? 'sin datos' : v.toLocaleString('es-AR', { maximumFractionDigits: 1 });
        if (!s || !esIncompleto(s, ctx.dataIndex)) return `${ctx.dataset.label}: ${valor}`;
        const i = ctx.dataIndex;
        return `${ctx.dataset.label}: ${acumulada ? '≥ ' : ''}${valor} (${s.conDato[i]} de ${s.esperados[i]} días con datos)`;
      }
    }
  };
}

/** "2026: 4 días (01/05–04/05) · 2025: sin faltantes", o "" si ninguna serie tiene faltantes */
export function textoFaltantesSeries(series: SerieConFaltantes[], nombres: string[]): string {
  if (!series.some(s => s.faltantes.length)) return '';
  return series.map((s, k) => `${nombres[k]}: ${describirFaltantes(s.faltantes) || 'sin faltantes'}`).join(' · ');
}
