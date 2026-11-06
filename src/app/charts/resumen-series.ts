import { ChartDataset } from 'chart.js';
import { formatDecimal } from '../pipes/valor.pipe';
import { SerieConFaltantes } from './dias-faltantes';

/**
 * Resumen de cuatro cifras de cada serie de un gráfico (C3 del informe de mejoras): máxima,
 * mínima, total o promedio, y la comparación con la normal. Se muestra en la franja
 * .resumen-grafico (styles.css) sobre el gráfico.
 */
export interface ResumenSerie {
  nombre: string;
  color: string;
  maxima: string;
  minima: string;
  /** "Total" para variables que se suman (lluvia, ET), "Promedio" para las demás */
  etiquetaValor: string;
  valor: string;
  /** "85 % de la normal" (acumuladas) o "+1,2 °C sobre la normal"; null sin normal */
  frenteNormal: string | null;
  /** Arriba o abajo de la normal, para el color */
  signo: 'mas' | 'menos' | null;
}

/** Unidad del título del eje: "Temperatura mínima (°C)" → "°C" */
export function unidadDe(titulo: string): string {
  return /\(([^)]+)\)\s*$/.exec(titulo)?.[1] ?? '';
}

/**
 * Las normales se buscan por etiqueta: "Normal <nombre>" (una por estación) o "Normal" (la misma
 * para todas las series, como en la comparación entre años). La comparación usa sólo los puntos
 * en que la serie tiene dato, para no comparar un total incompleto con la normal completa.
 */
export function resumirSeries(series: SerieConFaltantes[], nombres: string[], colores: readonly string[],
  acumulada: boolean, normales: ChartDataset<'line', (number | null)[]>[], unidad: string): ResumenSerie[] {
  const normalDe = (nombre: string) =>
    (normales.find(n => n.label === `Normal ${nombre}`) ?? normales.find(n => n.label === 'Normal'))?.data ?? null;

  return series.map((s, i) => {
    const con = s.valores.map((v, k) => ({ v, k })).filter((x): x is { v: number; k: number } => x.v !== null);
    const vals = con.map(x => x.v);
    const nombre = nombres[i] ?? '';
    const base = { nombre, color: colores[i % colores.length], etiquetaValor: acumulada ? 'Total' : 'Promedio' };
    if (!vals.length) {
      return { ...base, maxima: '—', minima: '—', valor: '—', frenteNormal: null, signo: null };
    }
    const suma = vals.reduce((a, b) => a + b, 0);
    const valor = acumulada ? suma : suma / vals.length;
    const u = unidad ? ` ${unidad}` : '';

    let frenteNormal: string | null = null;
    let signo: 'mas' | 'menos' | null = null;
    const normal = normalDe(nombre);
    if (normal) {
      const pares = con.filter(x => typeof normal[x.k] === 'number');
      if (pares.length) {
        const sumaSerie = pares.reduce((a, x) => a + x.v, 0);
        const sumaNormal = pares.reduce((a, x) => a + (normal[x.k] as number), 0);
        if (acumulada && sumaNormal > 0) {
          const pct = (sumaSerie / sumaNormal) * 100;
          frenteNormal = `${formatDecimal(pct, 0)} % de la normal`;
          signo = pct >= 100 ? 'mas' : 'menos';
        } else if (!acumulada) {
          const dif = (sumaSerie - sumaNormal) / pares.length;
          frenteNormal = `${dif >= 0 ? '+' : '−'}${formatDecimal(Math.abs(dif), 1)}${u} ${dif >= 0 ? 'sobre' : 'bajo'} la normal`;
          signo = dif >= 0 ? 'mas' : 'menos';
        }
      }
    }
    return {
      ...base,
      maxima: `${formatDecimal(Math.max(...vals), 1)}${u}`,
      minima: `${formatDecimal(Math.min(...vals), 1)}${u}`,
      valor: `${formatDecimal(valor, 1)}${u}`,
      frenteNormal,
      signo
    };
  });
}
