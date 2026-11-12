/*
 * Enlaces que se pueden compartir a una consulta de "Datos y estadísticas":
 *   /datos?herramienta=horas-frio&estacion=73&desde=2026-10-01&hasta=2026-10-27&base=7
 * Al abrirlo, DatosMeteorologicosComponent fija la estación activa y abre la herramienta
 * con estos parámetros en data.consulta; cada diálogo aplica los que entiende.
 */

/** Parámetros de una consulta, ya como texto (fechas en AAAA-MM-DD) */
export type Consulta = Record<string, string>;

export type Herramienta =
  | 'datos-localidad'
  | 'tiempo-real'
  | 'resumen-diario'
  | 'campania-lluvias'
  | 'aplicar'
  | 'comparar-anios'
  | 'comparar-localidades'
  | 'horas-frio'
  | 'suma-termica'
  | 'enfermedades'
  | 'fenologia'
  | 'rinde-soja'
  | 'balance-hidrico';

/** Nombre visible de cada herramienta (consultas guardadas) */
export const NOMBRE_HERRAMIENTA: Record<Herramienta, string> = {
  'datos-localidad': 'Datos por localidad',
  'tiempo-real': 'Datos en tiempo real',
  'resumen-diario': 'Resumen diario de la red',
  'campania-lluvias': 'Lluvias por campaña',
  'aplicar': 'Condiciones para aplicar',
  'comparar-anios': 'Comparación entre años',
  'comparar-localidades': 'Comparación entre localidades',
  'horas-frio': 'Horas de frío',
  'suma-termica': 'Sumas térmicas',
  'enfermedades': 'Enfermedades',
  'fenologia': 'Meteorología por estadíos fenológicos',
  'rinde-soja': 'Rinde de soja',
  'balance-hidrico': 'Balance hidrológico seriado'
};

/** Arma la URL absoluta; omite los parámetros vacíos. */
export function armarEnlace(herramienta: Herramienta, params: Record<string, string | number | Date | null | undefined>): string {
  const q = new URLSearchParams({ herramienta });
  for (const [clave, valor] of Object.entries(params)) {
    if (valor === null || valor === undefined || valor === '') continue;
    q.set(clave, valor instanceof Date ? fechaIso(valor) : String(valor));
  }
  return `${window.location.origin}/datos?${q.toString()}`;
}

/** Date → AAAA-MM-DD (fecha local) */
export function fechaIso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** AAAA-MM-DD → Date local; null si falta o no es una fecha válida. */
export function leerFecha(valor: string | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor ?? '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) || d.getMonth() !== Number(m[2]) - 1 ? null : d;
}

/** Número de la consulta; null si falta o no es numérico. */
export function leerNumero(valor: string | undefined): number | null {
  if (valor === undefined || valor.trim() === '') return null;
  const n = Number(valor.replace(',', '.'));
  return isNaN(n) ? null : n;
}

/** La consulta que llega en los datos del diálogo (o una vacía). */
export function consultaDe(data: unknown): Consulta {
  const c = (data as { consulta?: unknown } | null)?.consulta;
  return c && typeof c === 'object' ? c as Consulta : {};
}
