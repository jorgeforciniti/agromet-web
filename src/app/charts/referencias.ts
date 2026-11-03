import { Chart, ChartType, Plugin } from 'chart.js';

/**
 * Líneas de referencia horizontales en los gráficos (C1 del informe de mejoras): 0 °C y −2 °C
 * para heladas, 35 °C para golpe de calor, etc. Plugin propio en lugar de
 * chartjs-plugin-annotation: alcanza con pocas líneas y no suma una dependencia.
 *
 * Se registra una sola vez (lo importa chart-theme) y cada gráfico lo activa con
 *   options.plugins.referencias = { lineas: [...] }
 * Una línea fuera del rango del eje no se dibuja: un día de verano no muestra la de helada ni
 * cambia la escala del gráfico.
 */
export interface LineaReferencia {
  valor: number;
  etiqueta: string;
  color?: string;
  /** Id de la escala vertical (por defecto 'y') */
  eje?: string;
}

export interface OpcionesReferencias {
  lineas?: LineaReferencia[];
}

declare module 'chart.js' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface PluginOptionsByType<TType extends ChartType> {
    referencias?: OpcionesReferencias;
  }
}

const COLOR_HELADA = '#2563eb';
const COLOR_HELADA_FUERTE = '#1e3a8a';
const COLOR_CALOR = '#b91c1c';
const COLOR_NOCHE_CALIDA = '#c2410c';

/** Temperatura de 0 °C y −2 °C (helada e intensidad moderada, como en el mapa de heladas) */
export function referenciasHelada(eje = 'y'): LineaReferencia[] {
  return [
    { valor: 0, etiqueta: 'Helada 0 °C', color: COLOR_HELADA, eje },
    { valor: -2, etiqueta: '−2 °C', color: COLOR_HELADA_FUERTE, eje }
  ];
}

/** Máxima de 35 °C: la que cuentan los días de calor de fenología */
export function referenciaCalor(eje = 'y'): LineaReferencia {
  return { valor: 35, etiqueta: '35 °C', color: COLOR_CALOR, eje };
}

/** Mínima de 22 °C: noches cálidas, en los gráficos de temperatura mínima */
export function referenciaNocheCalida(eje = 'y'): LineaReferencia {
  return { valor: 22, etiqueta: 'Mín. 22 °C', color: COLOR_NOCHE_CALIDA, eje };
}

const pluginReferencias: Plugin = {
  id: 'referencias',
  beforeDatasetsDraw(chart, _args, opciones: OpcionesReferencias) {
    const lineas = opciones?.lineas;
    if (!lineas?.length) return;
    const { ctx, chartArea: area } = chart;
    for (const linea of lineas) {
      const escala = chart.scales[linea.eje ?? 'y'];
      if (!escala || linea.valor < escala.min || linea.valor > escala.max) continue;
      const y = escala.getPixelForValue(linea.valor);
      const color = linea.color ?? COLOR_HELADA;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(area.left, y);
      ctx.lineTo(area.right, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = '600 11px sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(linea.etiqueta, area.right - 4, y - 2);
      ctx.restore();
    }
  }
};

Chart.register(pluginReferencias);
