import { Chart, registerables } from 'chart.js';
import { FUENTE_TEXTO } from '../shared/fuente';
// Registra el plugin de líneas de referencia (options.plugins.referencias)
import './referencias';

/*
 * Configuración común de Chart.js para todos los gráficos del sitio.
 * Se importa desde cada componente con gráficos (no desde main.ts) para que
 * Chart.js siga cargándose sólo en las secciones que lo usan.
 */
Chart.register(...registerables);

// Números con coma decimal en ejes y tooltips, igual que en las tablas.
Chart.defaults.locale = 'es-AR';
Chart.defaults.font.family = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, "Noto Sans", "Helvetica Neue", sans-serif';
Chart.defaults.font.size = 12;
Chart.defaults.color = '#52514e';
Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(17, 24, 39, .92)';
Chart.defaults.plugins.tooltip.titleColor = '#ffffff';
Chart.defaults.plugins.tooltip.bodyColor = '#ffffff';

// Fuente al pie de cada gráfico (subtítulo de Chart.js: reserva su propio espacio y
// queda incluida en la imagen descargada). Un gráfico puede ocultarla con
// options.plugins.subtitle.display = false.
Chart.defaults.plugins.subtitle.display = true;
Chart.defaults.plugins.subtitle.text = FUENTE_TEXTO;
Chart.defaults.plugins.subtitle.position = 'bottom';
Chart.defaults.plugins.subtitle.align = 'end';
Chart.defaults.plugins.subtitle.color = '#5f6670';
Chart.defaults.plugins.subtitle.font = { size: 12 };
Chart.defaults.plugins.subtitle.padding = { top: 6, bottom: 0 };

/**
 * Color fijo por variable meteorológica: la misma variable se ve igual en
 * todos los gráficos (estadísticas históricas, datos por localidad, comparaciones, etc.).
 */
export const VAR_COLOR = {
  temp: '#eb6834',       // temperatura (serie única)
  tmax: '#eb6834',
  tmin: '#2a78d6',
  lluvia: '#1098ad',
  hrMax: '#7048e8',
  hrMin: '#ae3ec9',
  humedad: '#7048e8',
  viento: '#495057',
  rafaga: '#212529',
  radiacion: '#b5890e',   // dorado: distinto del naranja de la temperatura
  et: '#2f9e44',         // evapotranspiración y demanda hídrica
  mojado: '#d6336c',     // horas de mojado foliar
  presion: '#5c940d',
  normal: '#52514e'
} as const;

/** Dos series que se comparan entre sí (años o localidades). */
export const SERIE_COLOR = ['#2a78d6', '#eb6834'] as const;

export const GRID_COLOR = 'rgba(17, 24, 39, .08)';

/** '#rrggbb' → 'rgba(r, g, b, a)' para rellenos translúcidos. */
export function conAlfa(hex: string, alfa: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
}

/** Número con coma decimal y la cantidad de decimales indicada. */
export function fmtNum(v: number, decimales = 1): string {
  return v.toLocaleString('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}
