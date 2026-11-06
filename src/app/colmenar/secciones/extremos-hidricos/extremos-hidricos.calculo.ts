import { LluviaDiariaAnio } from '../../colmenar.models';

/**
 * Análisis de frecuencia de lluvias extremas siguiendo la metodología de Figueroa, Lamelas y Forciniti
 * («Frecuencia de ocurrencia de precipitaciones extremas diarias en El Colmenar – Tucumán», EEAOC):
 * distribución de Gumbel ajustada por momentos sobre los máximos anuales, frecuencia empírica
 * n/(N+1) y sumas móviles de 2 a 5 días asignadas al mes de su día central.
 */

export const PERIODOS_RETORNO = [2, 5, 10, 25, 50, 100];
const EULER = 0.5772;
/** Cuantil normal para un intervalo bilateral del 80 %. */
const Z80 = 1.2816;

/* =========================
   Distribución de Gumbel
   ========================= */
export interface AjusteGumbel {
  n: number;
  media: number;
  desvio: number;
  /** Parámetro de escala (1/ø en la notación del trabajo). */
  escala: number;
  /** Moda de la distribución (µ). */
  moda: number;
}

/** Ajuste por momentos: ø = π/(sd·√6), µ = media − c/ø. Requiere al menos 5 valores. */
export function ajustarGumbel(valores: number[]): AjusteGumbel | null {
  const n = valores.length;
  if (n < 5) {
    return null;
  }
  const media = valores.reduce((a, b) => a + b, 0) / n;
  const desvio = Math.sqrt(valores.reduce((a, v) => a + (v - media) ** 2, 0) / (n - 1));
  if (!desvio) {
    return null;
  }
  const escala = (desvio * Math.sqrt(6)) / Math.PI;
  return { n, media, desvio, escala, moda: media - EULER * escala };
}

/** Variable reducida de Gumbel para un período de retorno T: −ln(−ln(1 − 1/T)). */
export function variableReducida(T: number): number {
  return -Math.log(-Math.log(1 - 1 / T));
}

/** Período de retorno a partir de la variable reducida. */
export function retornoDeReducida(y: number): number {
  return 1 / (1 - Math.exp(-Math.exp(-y)));
}

export function valorRetorno(a: AjusteGumbel, T: number): number {
  return a.moda + a.escala * variableReducida(T);
}

/** Período de retorno estimado para un valor observado (años). */
export function retornoDeValor(a: AjusteGumbel, x: number): number {
  const fc = Math.exp(-Math.exp(-(x - a.moda) / a.escala));
  return fc >= 1 ? Infinity : 1 / (1 - fc);
}

/**
 * Intervalo de confianza del 80 % con el error estándar de los cuantiles de Gumbel (Kite, 1977):
 * SE = sd·√((1 + 1,1396·K + 1,1·K²)/n), con K el factor de frecuencia. El trabajo original usó las
 * bandas binomiales de Oosterbaan, leídas de gráficos, que no pueden reproducirse exactamente.
 */
export function intervalo80(a: AjusteGumbel, T: number): [number, number] {
  const K = -(Math.sqrt(6) / Math.PI) * (EULER + Math.log(-Math.log(1 - 1 / T)));
  const se = a.desvio * Math.sqrt((1 + 1.1396 * K + 1.1 * K * K) / a.n);
  const x = valorRetorno(a, T);
  return [x - Z80 * se, x + Z80 * se];
}

/* =========================
   Máximos anuales y mensuales
   ========================= */
export interface Maximo {
  anio: number;
  /** Mes del día central del evento (1–12). */
  mes: number;
  mm: number;
  /** Fecha del día central del evento (para 1 día, la fecha de la lluvia). */
  fecha: string;
  inicio: string;
  fin: string;
  /** Lluvia del día más lluvioso dentro del evento. */
  maxDiario: number;
}

interface SerieContinua {
  fechas: string[];
  mm: (number | null)[];
}

function serieContinua(anios: LluviaDiariaAnio[]): SerieContinua {
  const ordenados = [...anios].sort((a, b) => a.anio - b.anio);
  const fechas: string[] = [];
  const mm: (number | null)[] = [];
  let previo: number | null = null;
  for (const a of ordenados) {
    // Si falta un año intermedio, se corta la continuidad con un día inválido.
    if (previo !== null && a.anio !== previo + 1) {
      fechas.push('');
      mm.push(null);
    }
    fechas.push(...a.fechas);
    mm.push(...a.mm);
    previo = a.anio;
  }
  return { fechas, mm };
}

/**
 * Recorre todas las ventanas de `duracion` días con lluvia válida en todos sus días y llama a `fn`
 * con el evento asignado a la fecha de su día central (índice i + ⌊duracion/2⌋).
 */
function recorrerVentanas(s: SerieContinua, duracion: number, fn: (e: Maximo) => void): void {
  let suma = 0;
  let invalidos = 0;
  for (let i = 0; i < s.mm.length; i++) {
    if (s.mm[i] === null) invalidos++;
    else suma += s.mm[i] as number;
    const salida = i - duracion;
    if (salida >= 0) {
      if (s.mm[salida] === null) invalidos--;
      else suma -= s.mm[salida] as number;
    }
    const inicio = i - duracion + 1;
    if (inicio < 0 || invalidos > 0) continue;
    const central = s.fechas[inicio + Math.floor(duracion / 2)];
    if (!central) continue;
    let maxDiario = 0;
    for (let j = inicio; j <= i; j++) maxDiario = Math.max(maxDiario, s.mm[j] as number);
    fn({
      anio: Number(central.slice(0, 4)),
      mes: Number(central.slice(5, 7)),
      mm: Math.round(suma * 10) / 10,
      fecha: central,
      inicio: s.fechas[inicio],
      fin: s.fechas[i],
      maxDiario
    });
  }
}

export interface Maximos {
  /** Máximo anual por año (sólo años completos dentro del período). */
  anuales: Maximo[];
  /** Máximo por año y mes: clave `${anio}-${mes}`. */
  mensuales: Map<string, Maximo>;
}

/**
 * Máximos de `duracion` días por año y por mes. `anios` puede incluir años vecinos para que los
 * eventos que cruzan el 1 de enero se evalúen completos; sólo se informan los años de `validos`.
 */
export function calcularMaximos(anios: LluviaDiariaAnio[], duracion: number, validos: Set<number>): Maximos {
  const anuales = new Map<number, Maximo>();
  const mensuales = new Map<string, Maximo>();
  recorrerVentanas(serieContinua(anios), duracion, (e) => {
    if (!validos.has(e.anio)) return;
    // Ante empates se conserva el primer evento del año (o del mes).
    const a = anuales.get(e.anio);
    if (!a || e.mm > a.mm) anuales.set(e.anio, e);
    const clave = `${e.anio}-${e.mes}`;
    const m = mensuales.get(clave);
    if (!m || e.mm > m.mm) mensuales.set(clave, e);
  });
  return { anuales: [...anuales.values()].sort((x, y) => x.anio - y.anio), mensuales };
}

/** Total mensual por año y mes (`${anio}-${mes}`), sólo para años válidos. */
export function totalesMensuales(anios: LluviaDiariaAnio[], validos: Set<number>): Map<string, number> {
  const tot = new Map<string, number>();
  for (const a of anios) {
    if (!validos.has(a.anio)) continue;
    a.fechas.forEach((f, i) => {
      const clave = `${a.anio}-${Number(f.slice(5, 7))}`;
      tot.set(clave, (tot.get(clave) ?? 0) + (a.mm[i] ?? 0));
    });
  }
  return tot;
}

/* =========================
   Frecuencia empírica (Cuadro 1 del trabajo)
   ========================= */
export interface FilaEmpirica {
  orden: number;
  maximo: Maximo;
  /** Frecuencia de excedencia Fe = n/(N+1). */
  fe: number;
  fc: number;
  retorno: number;
}

export function frecuenciaEmpirica(maximos: Maximo[]): FilaEmpirica[] {
  const N = maximos.length;
  return [...maximos]
    .sort((a, b) => b.mm - a.mm || a.anio - b.anio)
    .map((m, i) => {
      const fe = (i + 1) / (N + 1);
      return { orden: i + 1, maximo: m, fe, fc: 1 - fe, retorno: 1 / fe };
    });
}

/* =========================
   Correlación (Cuadro 5 del trabajo)
   ========================= */
export interface Correlacion {
  n: number;
  r: number;
  /** Probabilidad bilateral (prueba t de Student con n − 2 grados de libertad). */
  p: number;
  pendiente: number;
  ordenada: number;
}

export function correlacion(x: number[], y: number[]): Correlacion | null {
  const n = x.length;
  if (n < 4) {
    return null;
  }
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  if (!sxx || !syy) {
    return null;
  }
  const r = sxy / Math.sqrt(sxx * syy);
  const gl = n - 2;
  const t = Math.abs(r) >= 1 ? Infinity : (r * Math.sqrt(gl)) / Math.sqrt(1 - r * r);
  const p = Number.isFinite(t) ? betaIncompleta(gl / 2, 0.5, gl / (gl + t * t)) : 0;
  const pendiente = sxy / sxx;
  return { n, r, p, pendiente, ordenada: my - pendiente * mx };
}

/** Función beta incompleta regularizada I_x(a, b) (fracción continua de Lentz). */
function betaIncompleta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const lnBeta = lnGamma(a + b) - lnGamma(a) - lnGamma(b);
  const frente = Math.exp(lnBeta + a * Math.log(x) + b * Math.log(1 - x));
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - betaIncompleta(b, a, 1 - x);
  }
  const TINY = 1e-30;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let f = d;
  for (let m = 1; m <= 200; m++) {
    for (const par of [true, false]) {
      const num = par
        ? (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m))
        : -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
      d = 1 + num * d;
      if (Math.abs(d) < TINY) d = TINY;
      c = 1 + num / c;
      if (Math.abs(c) < TINY) c = TINY;
      d = 1 / d;
      f *= d * c;
    }
    if (Math.abs(d * c - 1) < 1e-10) break;
  }
  return (frente * f) / a;
}

function lnGamma(z: number): number {
  const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let x = z;
  let y = z;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const c of g) ser += c / ++y;
  return -tmp + Math.log((2.5066282746310005 * ser) / x);
}
