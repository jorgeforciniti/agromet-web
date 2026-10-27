import { Chart, ChartOptions, registerables } from 'chart.js';
import { IndicadorExtremo, Mensual, NormalMensual } from './colmenar.models';

Chart.register(...registerables);

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export const PERIODO_NORMAL = '1991–2020';

/* =========================
   Escala de clasificación percentilar (P10, P20, P40, P60, P80, P90)
   ========================= */
export interface CategoriaClasificacion {
  nombre: string;
  /** Posición -3 … +3 respecto de lo normal. */
  nivel: number;
  rango: string;
  /** Símbolo que acompaña al color para no depender sólo de él. */
  simbolo: string;
}

export const CATEGORIAS: CategoriaClasificacion[] = [
  { nombre: 'Extremadamente inferior a lo normal', nivel: -3, rango: '< P10', simbolo: '▼▼▼' },
  { nombre: 'Muy inferior a lo normal', nivel: -2, rango: 'P10–P20', simbolo: '▼▼' },
  { nombre: 'Inferior a lo normal', nivel: -1, rango: 'P20–P40', simbolo: '▼' },
  { nombre: 'Normal', nivel: 0, rango: 'P40–P60', simbolo: '●' },
  { nombre: 'Superior a lo normal', nivel: 1, rango: 'P60–P80', simbolo: '▲' },
  { nombre: 'Muy superior a lo normal', nivel: 2, rango: 'P80–P90', simbolo: '▲▲' },
  { nombre: 'Extremadamente superior a lo normal', nivel: 3, rango: '> P90', simbolo: '▲▲▲' }
];

/**
 * 'lluvia': tonos cálidos (seco) → gris (normal) → azules (húmedo).
 * 'termica': azules (menos días cálidos) → gris → rojos (más días cálidos).
 * Índices alineados con CATEGORIAS (nivel -3 … +3).
 */
export type EscalaClasificacion = 'lluvia' | 'termica';

const COLORES: Record<EscalaClasificacion, { fondo: string; texto: string }[]> = {
  lluvia: [
    { fondo: '#9a3412', texto: '#ffffff' },
    { fondo: '#ea580c', texto: '#ffffff' },
    { fondo: '#fdba74', texto: '#431407' },
    { fondo: '#e7e5e4', texto: '#292524' },
    { fondo: '#93c5fd', texto: '#172554' },
    { fondo: '#2563eb', texto: '#ffffff' },
    { fondo: '#1e3a8a', texto: '#ffffff' }
  ],
  termica: [
    { fondo: '#1e3a8a', texto: '#ffffff' },
    { fondo: '#2563eb', texto: '#ffffff' },
    { fondo: '#93c5fd', texto: '#172554' },
    { fondo: '#e7e5e4', texto: '#292524' },
    { fondo: '#fca5a5', texto: '#450a0a' },
    { fondo: '#dc2626', texto: '#ffffff' },
    { fondo: '#7f1d1d', texto: '#ffffff' }
  ]
};

export function categoriaDe(clasificacion: string | null | undefined): CategoriaClasificacion | null {
  if (!clasificacion) {
    return null;
  }
  const c = clasificacion.trim().toLowerCase();
  return CATEGORIAS.find((cat) => cat.nombre.toLowerCase() === c) ?? null;
}

export function coloresCategoria(escala: EscalaClasificacion, cat: CategoriaClasificacion): { fondo: string; texto: string } {
  return COLORES[escala][cat.nivel + 3];
}

/* =========================
   Indicadores de extremos térmicos
   ========================= */
export interface IndicadorInfo {
  clave: IndicadorExtremo;
  etiqueta: string;
  corta: string;
  variable: 'max' | 'min';
}

export const INDICADORES: IndicadorInfo[] = [
  { clave: 'tmax_30', etiqueta: 'Días con Tmax ≥ 30 °C', corta: 'Tmax ≥ 30 °C', variable: 'max' },
  { clave: 'tmax_35', etiqueta: 'Días con Tmax ≥ 35 °C', corta: 'Tmax ≥ 35 °C', variable: 'max' },
  { clave: 'tmin_20', etiqueta: 'Días con Tmin ≥ 20 °C', corta: 'Tmin ≥ 20 °C', variable: 'min' },
  { clave: 'tmin_22', etiqueta: 'Días con Tmin ≥ 22 °C', corta: 'Tmin ≥ 22 °C', variable: 'min' }
];

/* =========================
   Formatos y cálculos
   ========================= */
const fmtCache = new Map<number, Intl.NumberFormat>();

export function fmt(v: number | null | undefined, decimales = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) {
    return '—';
  }
  let f = fmtCache.get(decimales);
  if (!f) {
    f = new Intl.NumberFormat('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
    fmtCache.set(decimales, f);
  }
  return f.format(v);
}

/** Valores de eje: sin decimales cuando son enteros, hasta 1 decimal si el paso es fraccionario. */
export function fmtEje(v: number): string {
  return Number.isInteger(v) ? fmt(v, 0) : fmt(v, 1);
}

/** Igual que fmt, con signo explícito (+/−) para anomalías. */
export function fmtSigno(v: number | null | undefined, decimales = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) {
    return '—';
  }
  const s = fmt(Math.abs(v), decimales);
  if (Math.abs(v) < Math.pow(10, -decimales) / 2) {
    return s;
  }
  return (v > 0 ? '+' : '−') + s;
}

export function redondear(v: number, decimales = 1): number {
  const f = Math.pow(10, decimales);
  return Math.round(v * f) / f;
}

export function suma(valores: number[]): number {
  return valores.reduce((a, b) => a + b, 0);
}

export function media(valores: number[]): number | null {
  return valores.length ? suma(valores) / valores.length : null;
}

/** Lista legible de meses: "ene–sep" si son consecutivos; si no, "ene, mar, abr". */
export function listaMeses(meses: number[]): string {
  if (!meses.length) {
    return 'ninguno';
  }
  const ord = [...meses].sort((a, b) => a - b);
  const consecutivos = ord.every((m, i) => i === 0 || m === ord[i - 1] + 1);
  const n = (m: number) => MESES_CORTOS[m - 1].toLowerCase();
  if (consecutivos && ord.length > 2) {
    return `${n(ord[0])}–${n(ord[ord.length - 1])}`;
  }
  return ord.map(n).join(', ');
}

export function normalDeMes(normales: NormalMensual[] | null | undefined, mes: number): NormalMensual | null {
  return normales?.find((n) => n.mes === mes) ?? null;
}

/** Devuelve los 12 meses del año en orden; los meses que la API no devolvió quedan como null. */
export function porMes<T extends { mes: number }>(filas: T[] | null | undefined): (T | null)[] {
  return Array.from({ length: 12 }, (_, i) => filas?.find((f) => f.mes === i + 1) ?? null);
}

export function mensualPorMes(filas: Mensual[] | null | undefined): (Mensual | null)[] {
  return porMes(filas);
}

/* =========================
   Gráficos (Chart.js)
   ========================= */
export const COLOR = {
  tmax: '#eb6834',
  tmin: '#2a78d6',
  lluvia: '#2a78d6',
  normal: '#52514e',
  anioA: '#2a78d6',
  anioB: '#eb6834',
  positivoTermico: '#dc2626',
  negativoTermico: '#2563eb',
  humedo: '#2563eb',
  seco: '#c2410c',
  grilla: 'rgba(17, 24, 39, .08)',
  texto: '#52514e'
};

const patrones = new Map<string, CanvasPattern | string>();

/** Relleno rayado a 45° para identificar valores parciales sin depender sólo del color. */
export function rayado(color: string): CanvasPattern | string {
  const cached = patrones.get(color);
  if (cached) {
    return cached;
  }
  if (typeof document === 'undefined') {
    return color;
  }
  const c = document.createElement('canvas');
  c.width = c.height = 8;
  const ctx = c.getContext('2d');
  if (!ctx) {
    return color;
  }
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  ctx.fillRect(0, 0, 8, 8);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 8);
  ctx.lineTo(8, 0);
  ctx.moveTo(-2, 2);
  ctx.lineTo(2, -2);
  ctx.moveTo(6, 10);
  ctx.lineTo(10, 6);
  ctx.stroke();
  const p = ctx.createPattern(c, 'repeat') ?? color;
  patrones.set(color, p);
  return p;
}

/** Opciones base comunes: tooltip por índice, grilla tenue, leyenda arriba. */
export function opcionesBase(unidad: string, extra: { minCero?: boolean; decimales?: number } = {}): ChartOptions {
  const dec = extra.decimales ?? 1;
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        position: 'top',
        align: 'start',
        labels: { usePointStyle: true, boxWidth: 10, boxHeight: 10, color: COLOR.texto, font: { size: 12 } }
      },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const v = ctx.parsed.y;
            if (v === null || v === undefined || Number.isNaN(v)) {
              return `${ctx.dataset.label}: sin dato válido`;
            }
            return `${ctx.dataset.label}: ${fmt(v, dec)} ${unidad}`;
          }
        }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: COLOR.texto } },
      y: {
        beginAtZero: extra.minCero ?? false,
        grid: { color: COLOR.grilla },
        ticks: { color: COLOR.texto, callback: (v) => `${fmtEje(Number(v))} ${unidad}`.trim() }
      }
    }
  } as ChartOptions;
}
