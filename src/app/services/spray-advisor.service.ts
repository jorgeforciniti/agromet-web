import { Injectable } from '@angular/core';

export type MetodoAplicacion = 'MANUAL' | 'MOSQUITO' | 'DRON' | 'AVION' | 'AIRBLAST';
export type Prioridad = 'SEGURIDAD' | 'EQUILIBRADO' | 'EFICACIA';
export type Cultivo = 'CAÑA' | 'CITRUS' | 'GRANOS';
export type Semaforo = 'VERDE' | 'AMARILLO' | 'ROJO';

export interface MeteoActualOWM {
  main: { temp: number; humidity: number };
  wind: { speed: number; deg?: number; gust?: number };
  clouds?: { all?: number };
  visibility?: number;
  dt?: number;
  sys?: { sunrise?: number; sunset?: number };
  timezone?: number;
}

export interface MeteoPronOWMItem {
  dt: number;
  main: { temp: number; humidity: number };
  wind: { speed: number; deg?: number; gust?: number };
  pop?: number;
  rain?: { '3h'?: number };
  sys?: { pod?: 'd' | 'n' };
  dt_txt?: string;
}

export interface EvaluacionAplicacion {
  semaforo: Semaforo;
  scoreDeriva: number;   // 0..100
  scoreEficacia: number; // 0..100
  deltaT: number;
  inversionProbable: boolean;
  razones: string[];
  recomendaciones: string[];
}

type ThresholdRange = [number, number];

interface ThresholdRule {
  green: ThresholdRange;
  yellow?: ThresholdRange[];
  red?: ThresholdRange[];
}

interface MetodoRule {
  /** Piso de calma: se compara con el VIENTO MEDIO (por debajo, riesgo de inversión y deriva) */
  calmaKmh: { rojo: number; amarillo: number };
  /** Techo de viento: se compara con la RÁFAGA (verde hasta `verde`, amarillo hasta `amarillo`, después rojo) */
  rafagaKmh: { verde: number; amarillo: number };
  /**
   * Techo del VIENTO MEDIO: amarillo desde `amarillo`; rojo por encima de `rojo` o, con `rojoIncluido`,
   * desde `rojo`. Sin él sólo cuenta la ráfaga.
   */
  medioKmh?: { amarillo: number; rojo: number; rojoIncluido?: boolean; fuente: string };
  deltaT: ThresholdRule;
  gustDeltaYellow: number;
  gustDeltaRed: number;
  inversion: {
    min: Semaforo;
    forceRed: boolean;
  };
  popRed: number;
  popYellow: number;
}

/*
 * Reglas por método. Criterio aprobado por la Sección (noviembre de 2026), a partir de la guía GRDC
 * (Australia) «Delta T» y de las de viento para pulverización terrestre:
 * - Viento: el PISO de calma se compara con el viento medio y el TECHO con la ráfaga. Las guías dan los
 *   límites para viento medio a la altura del botalón (GRDC: aprox. 3–15 km/h para terrestre); con
 *   menos de 3 km/h de viento medio hay riesgo de inversión y dirección impredecible (rojo). La ráfaga
 *   suele ser 1,5 a 2 veces el viento medio, por eso los techos de ráfaga son más altos que los rangos
 *   de viento medio de las guías: terrestre (MOSQUITO) verde hasta 20 km/h, rojo con más de 25.
 *   DRON: Agriculture Victoria permite aplicar con dron entre 3 y 13 km/h si la etiqueta no dice otra
 *   cosa; ráfaga verde hasta 13 km/h y amarillo hasta 16. AVION: la instrucción estándar de APVMA
 *   (Australia) pide de 3 a 20 km/h. MANUAL y AIRBLAST: criterios propios, sin fuente, a validar con
 *   la experiencia de la Sección.
 * - Techo del viento medio en terrestre (MOSQUITO): INTA EEA Oliveros y las guías dan 15 km/h como
 *   máximo de buena práctica; desde 15 km/h amarillo y con más de 20 km/h rojo (ajuste de noviembre
 *   de 2026, aprobado por el usuario a partir de esas fuentes).
 * - deltaT: GRDC: 2–8 °C adecuado, 8–10 °C marginal (amarillo), menos de 2 °C riesgo de inversión y
 *   deriva (amarillo; menos de 1 °C, rojo, criterio propio). GRDC (Practical tips for spraying, 2025):
 *   de 10 a 12 °C sólo con gota muy gruesa o mayor y nunca por encima de 12 °C; acá, de 10 a 12 °C es
 *   amarillo con gota gruesa o muy gruesa y rojo con gota media o más fina; más de 12 °C, rojo.
 * - gustDeltaYellow/gustDeltaRed (ráfaga − viento medio, turbulencia): criterio propio, sin fuente.
 * - popRed/popYellow: pensados para probabilidad de lluvia de un pronóstico; con datos medidos, una
 *   lluvia de más de 0,2 mm cuenta como probabilidad 1 (rojo), como en Kogan et al. (2017): las
 *   estaciones Davis miden de a 0,2 mm y un solo registro puede ser rocío.
 * - AIRBLAST: techo del viento medio de Kogan et al. (2017), semáforo para pulverizadoras
 *   hidroneumáticas en frutales del Alto Valle (umbrales de Rodríguez et al., 2015, INTA EEA Alto
 *   Valle): menos de 14,4 km/h verde, de 14,4 a 18 amarillo, desde 18 rojo.
 * - Inversión (inversionProbable): proxy propio (viento medio < 5 km/h y HR ≥ 85 %) dentro del horario
 *   de INTA Pergamino (desde una hora antes de la puesta hasta una hora después de la salida del sol,
 *   citado por AgroSpray, 2020); agrava el semáforo junto con ΔT < 2.
 */
const RULES: Record<MetodoAplicacion, MetodoRule> = {
  MOSQUITO: {
    calmaKmh: { rojo: 3, amarillo: 5 },
    rafagaKmh: { verde: 20, amarillo: 25 },
    medioKmh: { amarillo: 15, rojo: 20, fuente: 'INTA EEA Oliveros; Queensland Government. AAPRESID, citada por AgroSpray, recomienda menos de 10 km/h' },
    deltaT: { green: [2, 8], yellow: [[1, 2], [8, 10]], red: [[0, 1], [10, 999]] },
    gustDeltaYellow: 8,
    gustDeltaRed: 15,
    inversion: { min: 'AMARILLO', forceRed: false },
    popRed: 0.6,
    popYellow: 0.3,
  },
  MANUAL: {
    calmaKmh: { rojo: 3, amarillo: 3 },
    rafagaKmh: { verde: 15, amarillo: 20 },
    deltaT: { green: [2, 8], yellow: [[1, 2], [8, 10]], red: [[0, 1], [10, 999]] },
    gustDeltaYellow: 6,
    gustDeltaRed: 12,
    inversion: { min: 'AMARILLO', forceRed: false },
    popRed: 0.6,
    popYellow: 0.3,
  },
  DRON: {
    // Agriculture Victoria: de 3 a 13 km/h si la etiqueta no dice otra cosa + inversión = evitar
    calmaKmh: { rojo: 3, amarillo: 5 },
    rafagaKmh: { verde: 13, amarillo: 16 },
    deltaT: { green: [2, 8], yellow: [[1, 2], [8, 10]], red: [[0, 1], [10, 999]] },
    gustDeltaYellow: 6,
    gustDeltaRed: 10,
    inversion: { min: 'ROJO', forceRed: true },
    popRed: 0.5,
    popYellow: 0.25,
  },
  AVION: {
    calmaKmh: { rojo: 3, amarillo: 4 },
    rafagaKmh: { verde: 20, amarillo: 25 },
    deltaT: { green: [2, 8], yellow: [[1, 2], [8, 10]], red: [[0, 1], [10, 999]] },
    gustDeltaYellow: 8,
    gustDeltaRed: 14,
    inversion: { min: 'ROJO', forceRed: true },
    popRed: 0.5,
    popYellow: 0.25,
  },
  AIRBLAST: {
    calmaKmh: { rojo: 3, amarillo: 3 },
    rafagaKmh: { verde: 15, amarillo: 20 },
    medioKmh: { amarillo: 14.4, rojo: 18, rojoIncluido: true, fuente: 'Kogan et al., 2017; Rodríguez et al., 2015' },
    deltaT: { green: [2, 8], yellow: [[1, 2], [8, 10]], red: [[0, 1], [10, 999]] },
    gustDeltaYellow: 6,
    gustDeltaRed: 12,
    inversion: { min: 'ROJO', forceRed: true },
    popRed: 0.6,
    popYellow: 0.3,
  },
};

/** Número con coma decimal, sin decimales si es entero */
const num = (n: number) => String(n).replace('.', ',');

/**
 * Umbrales del método en palabras, para la ayuda del semáforo. Salen de RULES: si cambia una
 * regla, cambia el texto.
 */
export function describirUmbrales(metodo: MetodoAplicacion): string[] {
  const r = RULES[metodo];
  const fuenteViento: Record<MetodoAplicacion, string> = {
    MOSQUITO: 'INTA EEA Oliveros; Queensland Government',
    MANUAL: 'criterio propio',
    DRON: 'Agriculture Victoria',
    AVION: 'APVMA',
    AIRBLAST: 'criterio propio',
  };
  const lineas = [
    `Viento medio (calma): menos de ${num(r.calmaKmh.rojo)} km/h, rojo` +
      (r.calmaKmh.amarillo > r.calmaKmh.rojo ? `; menos de ${num(r.calmaKmh.amarillo)} km/h, amarillo` : '') +
      ' (INTA Pergamino; Engormix).',
    `Ráfaga: verde hasta ${num(r.rafagaKmh.verde)} km/h, amarillo hasta ${num(r.rafagaKmh.amarillo)} km/h, rojo por encima (${fuenteViento[metodo]}).`,
  ];
  if (r.medioKmh) {
    const m = r.medioKmh;
    lineas.push(`Viento medio (techo): desde ${num(m.amarillo)} km/h, amarillo; ${m.rojoIncluido ? 'desde' : 'más de'} ${num(m.rojo)} km/h, rojo (${m.fuente}).`);
  }
  lineas.push(
    `Ráfaga menos viento medio (turbulencia): desde ${num(r.gustDeltaYellow)} km/h, amarillo; desde ${num(r.gustDeltaRed)} km/h, rojo (criterio propio).`,
    'ΔT: verde de 2 a 8 °C; amarillo de 1 a 2 °C y de 8 a 10 °C; de 10 a 12 °C, amarillo con gota gruesa o muy gruesa y rojo con gota más fina; más de 12 °C, rojo (GRDC, 2025). Menos de 1 °C, rojo (criterio propio).',
    `Inversión probable: ${r.inversion.forceRed ? 'rojo' : 'amarillo'} (criterio propio; ver «Inversión»).`,
    `Lluvia registrada: más de ${num(LLUVIA_MINIMA_MM)} mm, rojo (Kogan et al., 2017).`,
    'Kp: desde 4, amarillo; desde 5, rojo (NOAA SWPC: con Kp 5 empieza la tormenta geomagnética G1).',
  );
  if (metodo === 'DRON' || metodo === 'AVION') {
    lineas.push('Satélites: menos de 12, amarillo; menos de 8, rojo (criterio propio).');
  }
  return lineas;
}

/** Bibliografía de los criterios, para la ayuda del semáforo */
export const BIBLIOGRAFIA_APLICACION: string[] = [
  'APVMA (Australian Pesticides and Veterinary Medicines Authority). Instrucciones estándar de etiqueta para aplicación aérea: viento de 3 a 20 km/h.',
  'Agriculture Victoria. Drone or remotely piloted aircraft spraying: sin indicación de la etiqueta, aplicar con viento de más de 3 y menos de 13 km/h.',
  'GRDC (2025). Practical tips for spraying (fact sheet, revisión de enero de 2025). Grains Research and Development Corporation, Australia: ΔT de 2 a 8 °C; de 10 a 12 °C sólo con gota muy gruesa o mayor; no aplicar con más de 12 °C ni con inversión.',
  'INTA EEA Oliveros. Delta T como indicador del ambiente para pulverizar: 15 km/h es el viento máximo de buena práctica.',
  'INTA Pergamino. Caracterización del fenómeno de inversión térmica (Engormix): viento de 4,2 km/h o menos como indicador de inversión.',
  'Kogan, P.; Grosso, G.; Magdalena, C.; Fernández, D.; Muñoz, A. R.; Rodríguez, A. B. y Giorgetti, G. (2017). Desarrollo web de un semáforo indicador de condiciones climáticas necesarias para realizar una correcta aplicación de agroquímicos en fruticultura (Alto Valle de Río Negro y Neuquén). CAI, Congreso Argentino de AgroInformática, 46 JAIIO, pp. 241-251. ISSN 2525-0949. Pulverizadoras hidroneumáticas: viento menor a 14,4 km/h verde, de 14,4 a 18 amarillo, desde 18 rojo; lluvia de más de 0,2 mm, rojo. Para esa región también fija temperatura (menos de 25 °C) y humedad (de 35 a 85 %), que acá no se usan: el ΔT ya combina las dos.',
  'Rodríguez, A.; Magdalena, C.; Muñoz, A.; Benítez-Piccini, E. y Fernández, D. (2015). Ventana de aplicación de productos fitosanitarios en cultivos de pepita en el Alto Valle de Río Negro y Neuquén. 38.º Congreso Argentino de Horticultura, Bahía Blanca. Origen de los umbrales de Kogan et al. (2017), con doce temporadas de datos.',
  'Engormix. Conocer y manejar parámetros para reducir la deriva: viento de 5 a 15 km/h; con menos de 5 km/h, probable inversión.',
  'AgroSpray (2020). Fitosanitarios: ¿cómo les influyen las condiciones climáticas? (agrospray.com.ar). Cita a AAPRESID: viento menor a 10 km/h, temperatura menor a 30 °C, humedad relativa mayor a 55 % y ΔT de 2 a 8 °C; y a INTA Pergamino: la inversión empieza una hora antes de la puesta del sol y termina una hora después de la salida.',
  'AgroSpray (2026). El clima también se calibra: cómo tomar la decisión de pulverizar en la campaña 2026/27 (agrospray.com.ar). Viento de 4 a 9 km/h según distintas guías; ante sospecha de inversión, no pulverizar.',
  'Queensland Government. Minimising the impacts of spray drift: viento ideal de 3 a 15 km/h.',
  'NOAA SWPC. Space Weather Scales: escala de tormentas geomagnéticas (G1 desde Kp 5).',
  'Stull, R. (2011). Wet-bulb temperature from relative humidity and air temperature. Journal of Applied Meteorology and Climatology, 50: 2267-2269 (cálculo del ΔT).',
];

/** Lluvia medida que cuenta: hasta 0,2 mm (un registro de la estación Davis) puede ser rocío (Kogan et al., 2017) */
const LLUVIA_MINIMA_MM = 0.2;

/** La inversión empieza una hora antes de la puesta y termina una hora después de la salida del sol */
const MARGEN_INVERSION_S = 3600;

/** Argentina: UTC−3 todo el año. */
const HUSO_ARGENTINA_MS = -3 * 3600 * 1000;

/** Fuera de estos rangos el dato se toma como inválido (sensor fuera de servicio) y no se evalúa. */
const RANGOS_VALIDOS: Record<'temperatura' | 'humedad' | 'viento' | 'lluvia', [number, number]> = {
  temperatura: [-30, 55],
  humedad: [1, 100],
  viento: [0, 200],
  lluvia: [0, 300],
};

/** Registro medido en una estación (unidades de la API: °C, %, km/h, mm). null = sin dato. */
export interface RegistroMeteo {
  instante: Date | null;
  lat: number | null;
  lon: number | null;
  temperatura: number | null;
  humedad: number | null;
  vientoMedio: number | null;
  rafaga: number | null;
  lluvia: number | null;
}

export interface ContextoEvaluacion {
  metodo: MetodoAplicacion;
  cultivo: Cultivo;
  prioridad: Prioridad;
  /** Kp del momento del registro; null o undefined = no se considera */
  kpIndex?: number | null;
  sats?: number;
  /** Gota gruesa o muy gruesa: con ΔT de 10 a 12 °C el semáforo queda en amarillo y no en rojo */
  gotaGruesa?: boolean;
}

/** evaluacion = null: «Sin evaluar» por los datos faltantes o inválidos que lista faltantes. */
export interface ResultadoEvaluacion {
  evaluacion: EvaluacionAplicacion | null;
  faltantes: string[];
}

/**
 * Salida y puesta del sol (ms UTC) para una fecha y una ubicación, con el algoritmo de NOAA
 * (General Solar Position Calculations / planilla de NOAA), con refracción estándar (90,833°).
 * Se calcula al mediodía local de Argentina (15 h UTC). null si ese día no hay salida o puesta
 * (latitudes polares).
 */
export function salidaPuestaSol(anio: number, mes: number, dia: number, lat: number, lon: number): { salidaMs: number; puestaMs: number } | null {
  const rad = Math.PI / 180;
  const jd = Date.UTC(anio, mes - 1, dia, 15) / 86400000 + 2440587.5;
  const t = (jd - 2451545) / 36525;

  const l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const c = Math.sin(m * rad) * (1.914602 - t * (0.004817 + 0.000014 * t))
    + Math.sin(2 * m * rad) * (0.019993 - 0.000101 * t)
    + Math.sin(3 * m * rad) * 0.000289;
  const omega = 125.04 - 1934.136 * t;
  const longAparente = l0 + c - 0.00569 - 0.00478 * Math.sin(omega * rad);
  const oblicuidadMedia = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const oblicuidad = oblicuidadMedia + 0.00256 * Math.cos(omega * rad);
  const declinacion = Math.asin(Math.sin(oblicuidad * rad) * Math.sin(longAparente * rad));

  const y = Math.tan((oblicuidad / 2) * rad) ** 2;
  const ecuacionTiempo = 4 / rad * (
    y * Math.sin(2 * l0 * rad)
    - 2 * e * Math.sin(m * rad)
    + 4 * e * y * Math.sin(m * rad) * Math.cos(2 * l0 * rad)
    - 0.5 * y * y * Math.sin(4 * l0 * rad)
    - 1.25 * e * e * Math.sin(2 * m * rad)
  ); // minutos

  const cosH = Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(declinacion))
    - Math.tan(lat * rad) * Math.tan(declinacion);
  if (cosH < -1 || cosH > 1) return null;
  const anguloHorario = Math.acos(cosH) / rad; // grados

  const mediodiaMin = 720 - 4 * lon - ecuacionTiempo; // minutos UTC desde las 0 h
  const ceroUtc = Date.UTC(anio, mes - 1, dia);
  return {
    salidaMs: ceroUtc + (mediodiaMin - 4 * anguloHorario) * 60000,
    puestaMs: ceroUtc + (mediodiaMin + 4 * anguloHorario) * 60000,
  };
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function worst(a: Semaforo, b: Semaforo): Semaforo {
  const r: Record<Semaforo, number> = { VERDE: 0, AMARILLO: 1, ROJO: 2 };
  return r[b] > r[a] ? b : a;
}

function lightScore(l: Semaforo): number {
  return l === 'VERDE' ? 20 : l === 'AMARILLO' ? 55 : 85;
}

function evalThreshold(x: number, rule: ThresholdRule): Semaforo {
  const [g1, g2] = rule.green;
  if (x >= g1 && x <= g2) return 'VERDE';
  for (const [y1, y2] of (rule.yellow ?? [])) if (x >= y1 && x <= y2) return 'AMARILLO';
  for (const [r1, r2] of (rule.red ?? [])) if (x >= r1 && x <= r2) return 'ROJO';
  return 'AMARILLO';
}

// === OpenWeatherMap: weather.id -> descripción amigable (ES) ===
function owmWeatherDesc(id: number): string {
  if (!Number.isFinite(id)) return 'Condición meteorológica (desconocida)';

  const explicit: Record<number, string> = {
    // 2xx Tormenta
    200: 'Tormenta eléctrica con lluvia ligera',
    201: 'Tormenta eléctrica con lluvia',
    202: 'Tormenta eléctrica con fuertes lluvias',
    210: 'Tormenta ligera',
    211: 'Tormenta',
    212: 'Fuerte tormenta eléctrica',
    221: 'Tormenta eléctrica irregular',
    230: 'Tormenta eléctrica con llovizna ligera',
    231: 'Tormenta eléctrica con llovizna',
    232: 'Tormenta eléctrica con llovizna intensa',

    // 3xx Llovizna
    300: 'Llovizna de intensidad ligera',
    301: 'Llovizna',
    302: 'Llovizna de fuerte intensidad',
    310: 'Lluvia ligera y llovizna',
    311: 'Llovizna',
    312: 'Lluvia lloviznosa de fuerte intensidad',
    313: 'Chubascos de lluvia y llovizna',
    314: 'Fuertes lluvias y lloviznas',
    321: 'Llovizna de ducha',

    // 5xx Lluvia
    500: 'Lluvia ligera',
    501: 'Lluvia moderada',
    502: 'Lluvia de fuerte intensidad',
    503: 'Lluvia muy fuerte',
    504: 'Lluvia extrema',
    511: 'Lluvia helada',
    520: 'Lluvia ligera de intensidad baja',
    521: 'Lluvia de chaparrón',
    522: 'Lluvia de fuerte intensidad',
    531: 'Lluvia torrencial',

    // 6xx Nieve
    600: 'Nieve ligera',
    601: 'Nieve',
    602: 'Fuertes nevadas',
    611: 'Aguanieve',
    612: 'Chubasco ligero de aguanieve',
    613: 'Aguanieve',
    615: 'Lluvia ligera y nieve',
    616: 'Lluvia y nieve',
    620: 'Chubasco ligero de nieve',
    621: 'Lluvia de nieve',
    622: 'Fuertes nevadas',

    // 7xx Atmósfera
    701: 'Neblina',
    711: 'Humo',
    721: 'Bruma',
    731: 'Remolinos de arena/polvo',
    741: 'Niebla',
    751: 'Arena',
    761: 'Polvo',
    762: 'Ceniza volcánica',
    771: 'Borrascas',
    781: 'Tornado',

    // 800+ Cielo/nubes
    800: 'Cielo despejado',
    801: 'Pocas nubes',
    802: 'Nubes dispersas',
    803: 'Nubes dispersas',
    804: 'Nubes cubiertas',
  };

  if (explicit[id]) return explicit[id];

  const group = Math.floor(id / 100);
  switch (group) {
    case 2: return 'Tormenta eléctrica';
    case 3: return 'Llovizna';
    case 5: return 'Lluvia';
    case 6: return 'Nieve';
    case 7: return 'Fenómeno de baja visibilidad (niebla/bruma/polvo)';
    case 8: return id === 800 ? 'Cielo despejado' : 'Nubosidad';
    default: return 'Condición meteorológica';
  }
}

@Injectable({ providedIn: 'root' })
export class SprayAdvisorService {

  // Aproximación de Stull (2011). Suficiente para decisión operativa.
  wetBulbTempC(tC: number, rh: number): number {
    const T = tC;
    const RH = clamp(rh, 1, 100);
    return (
      T * Math.atan(0.151977 * Math.sqrt(RH + 8.313659)) +
      Math.atan(T + RH) -
      Math.atan(RH - 1.676331) +
      0.00391838 * Math.pow(RH, 1.5) * Math.atan(0.023101 * RH) -
      4.686035
    );
  }

  deltaT(tC: number, rh: number): number {
    return tC - this.wetBulbTempC(tC, rh);
  }

  // Proxy simple de inversión. Si más adelante agregás T a 2 alturas, se reemplaza.
  inversionProbable(params: { windKmh: number; rh: number; isNight: boolean }): boolean {
    return params.isNight && params.windKmh < 5 && params.rh >= 85;
  }

  /**
   * Horario con posible inversión: desde una hora antes de la puesta del sol hasta una hora después
   * de la salida (INTA Pergamino, citado por AgroSpray, 2020), en segundos Unix UTC. Sin salida y
   * puesta no se puede saber: se devuelve false (ya no hay horario fijo). evaluarRegistro() las
   * calcula siempre con salidaPuestaSol().
   */
  isNightFromUnix(dtUtc: number, sunriseUtc?: number, sunsetUtc?: number): boolean {
    if (sunriseUtc == null || sunsetUtc == null) return false;
    return dtUtc < sunriseUtc + MARGEN_INVERSION_S || dtUtc > sunsetUtc - MARGEN_INVERSION_S;
  }

  /**
   * Evaluación única de un registro de estación, la que usan el mapa y la tabla. Si falta un
   * dato (o es inválido) devuelve evaluacion = null («Sin evaluar»): nunca se evalúa con 0.
   * El viento de referencia es la ráfaga; la noche (para la inversión) sale de la salida y la
   * puesta del sol en la fecha y la ubicación de la estación.
   */
  evaluarRegistro(reg: RegistroMeteo, ctx: ContextoEvaluacion): ResultadoEvaluacion {
    const faltantes: string[] = [];
    const leer = (v: number | null | undefined, rango: [number, number], nombre: string): number => {
      if (v == null || !Number.isFinite(v) || v < rango[0] || v > rango[1]) {
        faltantes.push(nombre);
        return NaN;
      }
      return v;
    };

    const tC = leer(reg.temperatura, RANGOS_VALIDOS.temperatura, 'temperatura');
    const rh = leer(reg.humedad, RANGOS_VALIDOS.humedad, 'humedad');
    const medio = leer(reg.vientoMedio, RANGOS_VALIDOS.viento, 'viento medio');
    const rafaga = leer(reg.rafaga, RANGOS_VALIDOS.viento, 'ráfaga');
    const lluvia = leer(reg.lluvia, RANGOS_VALIDOS.lluvia, 'lluvia');
    const instanteMs = reg.instante?.getTime();
    if (instanteMs == null || !Number.isFinite(instanteMs)) faltantes.push('hora');
    if (reg.lat == null || reg.lon == null || !Number.isFinite(reg.lat) || !Number.isFinite(reg.lon)
      || (reg.lat === 0 && reg.lon === 0)) faltantes.push('ubicación');
    if (faltantes.length) return { evaluacion: null, faltantes };

    // Fecha local (UTC−3) del registro, para la salida y la puesta del sol de ese día
    const local = new Date((instanteMs as number) + HUSO_ARGENTINA_MS);
    const sol = salidaPuestaSol(local.getUTCFullYear(), local.getUTCMonth() + 1, local.getUTCDate(), reg.lat as number, reg.lon as number);

    const evaluacion = this.evaluar(
      {
        tC,
        rh,
        windMs: medio / 3.6,
        gustMs: rafaga / 3.6,
        pop: lluvia > LLUVIA_MINIMA_MM ? 1 : 0,
        dtUtc: Math.floor((instanteMs as number) / 1000),
        sunriseUtc: sol ? Math.floor(sol.salidaMs / 1000) : undefined,
        sunsetUtc: sol ? Math.floor(sol.puestaMs / 1000) : undefined,
      },
      ctx.metodo,
      ctx.cultivo,
      ctx.prioridad,
      { kpIndex: ctx.kpIndex ?? undefined, sats: ctx.sats, gotaGruesa: ctx.gotaGruesa }
    );
    return { evaluacion, faltantes };
  }

  // Ponderaciones por prioridad/cultivo
  private weights(prioridad: Prioridad, cultivo: Cultivo) {
    let wDeriva = 0.6;
    let wEfic = 0.4;
    if (prioridad === 'SEGURIDAD') { wDeriva = 0.8; wEfic = 0.2; }
    if (prioridad === 'EFICACIA') { wDeriva = 0.4; wEfic = 0.6; }
    if (cultivo === 'CITRUS') wDeriva += 0.05;
    if (cultivo === 'GRANOS') wEfic += 0.05;
    const s = wDeriva + wEfic;
    return { wDeriva: wDeriva / s, wEfic: wEfic / s };
  }

  evaluar(
    meteo: {
      tC: number;
      rh: number;
      windMs: number;
      gustMs?: number;
      pop?: number;
      dtUtc?: number;
      sunriseUtc?: number;
      sunsetUtc?: number;
      weatherId?: number;
      weather?: Array<{ id: number; main?: string; description?: string }>;
    },
    metodo: MetodoAplicacion,
    cultivo: Cultivo,
    prioridad: Prioridad,
    extras?: { kpIndex?: number; sats?: number; gotaGruesa?: boolean }
  ): EvaluacionAplicacion {
    const rules = RULES[metodo];
    const windKmh = meteo.windMs * 3.6;
    const gustKmh = meteo.gustMs != null ? meteo.gustMs * 3.6 : undefined;
    // Techo de viento con la ráfaga (criterio de la Sección); el medio sólo si no hay ráfaga.
    const refKmh = gustKmh ?? windKmh;
    const dT = this.deltaT(meteo.tC, meteo.rh);

    const isNight = meteo.dtUtc != null
      ? this.isNightFromUnix(meteo.dtUtc, meteo.sunriseUtc, meteo.sunsetUtc)
      : false;
    const inv = this.inversionProbable({ windKmh, rh: meteo.rh, isNight });

    // Piso de calma con el viento medio; techo con la ráfaga
    const lCalma: Semaforo = windKmh < rules.calmaKmh.rojo ? 'ROJO' : windKmh < rules.calmaKmh.amarillo ? 'AMARILLO' : 'VERDE';
    const lTecho: Semaforo = refKmh > rules.rafagaKmh.amarillo ? 'ROJO' : refKmh > rules.rafagaKmh.verde ? 'AMARILLO' : 'VERDE';
    const medio = rules.medioKmh;
    const medioRojo = !!medio && (medio.rojoIncluido ? windKmh >= medio.rojo : windKmh > medio.rojo);
    const lMedio: Semaforo = !medio ? 'VERDE' : medioRojo ? 'ROJO' : windKmh >= medio.amarillo ? 'AMARILLO' : 'VERDE';
    const lWind = worst(lCalma, worst(lTecho, lMedio));
    let lDT = evalThreshold(dT, rules.deltaT);
    // GRDC: de 10 a 12 °C sólo con gota muy gruesa o mayor
    const dtConGotaGruesa = lDT === 'ROJO' && dT > 10 && dT <= 12 && !!extras?.gotaGruesa;
    if (dtConGotaGruesa) lDT = 'AMARILLO';

    let lGust: Semaforo = 'VERDE';
    if (gustKmh != null) {
      const delta = gustKmh - windKmh;
      if (delta >= rules.gustDeltaRed) lGust = 'ROJO';
      else if (delta >= rules.gustDeltaYellow) lGust = 'AMARILLO';
    }

    let lRain: Semaforo = 'VERDE';

    let lWx: Semaforo = 'VERDE';
    let wxText: string | null = null;

    const wxList =
      Array.isArray(meteo.weather) && meteo.weather.length
        ? meteo.weather
        : (Number.isFinite(meteo.weatherId as number) ? [{ id: meteo.weatherId as number }] : []);

    if (wxList.length) {
      wxText = wxList
        .map(w => (w?.description || w?.main || '').trim())
        .filter(Boolean)
        .map(s => s.charAt(0).toUpperCase() + s.slice(1))
        .join(' + ') || null;

      for (const w of wxList) {
        const id = Number(w?.id);
        if (!Number.isFinite(id)) continue;

        let sev: Semaforo = 'VERDE';
        if ((id >= 200 && id <= 232) || (id >= 300 && id <= 321) || (id >= 500 && id <= 531) || (id >= 600 && id <= 622) || id === 771 || id === 781) {
          sev = 'ROJO';
        } else if (id >= 700 && id <= 762) {
          sev = 'AMARILLO';
        }

        if (sev === 'ROJO') { lWx = 'ROJO'; break; }
        if (sev === 'AMARILLO' && lWx === 'VERDE') lWx = 'AMARILLO';
      }
    }

    const pop = meteo.pop ?? 0;
    if (pop >= rules.popRed) lRain = 'ROJO';
    else if (pop >= rules.popYellow) lRain = 'AMARILLO';

    let lInv: Semaforo = 'VERDE';
    if (inv) lInv = rules.inversion.forceRed ? 'ROJO' : rules.inversion.min;

    // Factores extra (no meteorológicos): KP y satélites.
    // No deben dominar el semáforo salvo valores claramente riesgosos.
    let lKp: Semaforo = 'VERDE';
    const kp = extras?.kpIndex;
    if (kp != null) {
      if (kp >= 5) lKp = 'ROJO';
      else if (kp >= 4) lKp = 'AMARILLO';
    }
    let lSats: Semaforo = 'VERDE';
    const sats = extras?.sats;
    if (sats != null) {
      if (sats < 8) lSats = 'ROJO';
      else if (sats < 12) lSats = 'AMARILLO';
    }

    const scoreDeriva = Math.round(
      0.35 * lightScore(lWind) +
      0.20 * lightScore(lGust) +
      0.30 * lightScore(lInv) +
      0.15 * lightScore(lDT)
    );

    const scoreEficacia = Math.round(
      0.45 * lightScore(lRain) +
      0.30 * lightScore(lDT) +
      0.25 * lightScore(lWind)
    );

    const { wDeriva, wEfic } = this.weights(prioridad, cultivo);
    const finalScore = Math.round(wDeriva * scoreDeriva + wEfic * scoreEficacia);
    let sem: Semaforo = finalScore > 65 ? 'ROJO' : finalScore >= 35 ? 'AMARILLO' : 'VERDE';

    // Reglas duras
    sem = worst(sem, worst(lWind, worst(lGust, worst(lDT, lRain))));
    sem = worst(sem, lInv);
    sem = worst(sem, lWx);
    // Extras: solo afectan si son malos
    sem = worst(sem, lKp);
    sem = worst(sem, lSats);

    const razones: string[] = [];
    const recs: string[] = [];
    const push = (arr: string[], s: string) => { if (arr.length < 3) arr.push(s); };

    if (lInv !== 'VERDE') push(razones, 'Riesgo de inversión/atmósfera estable.');
    if (lCalma !== 'VERDE') push(razones, `Viento medio ${windKmh.toFixed(0)} km/h: calma (${lCalma}).`);
    if (lTecho !== 'VERDE') push(razones, `${gustKmh != null ? 'Ráfaga' : 'Viento'} ${refKmh.toFixed(0)} km/h (${lTecho}).`);
    if (lMedio !== 'VERDE') push(razones, `Viento medio ${windKmh.toFixed(1)} km/h: desde ${num(medio!.amarillo)} km/h es demasiado (${lMedio}).`);
    if (lGust !== 'VERDE' && gustKmh != null) push(razones, `Ráfaga ${(gustKmh - windKmh).toFixed(0)} km/h sobre el viento medio (${lGust}).`);
    if (lDT !== 'VERDE') push(razones, dtConGotaGruesa
      ? `ΔT ${dT.toFixed(1)} °C (AMARILLO): entre 10 y 12 °C sólo se aplica con gota gruesa o muy gruesa.`
      : `ΔT ${dT.toFixed(1)} °C (${lDT}) → evaporación/deriva.`);
    if (lRain !== 'VERDE') push(razones, `Prob. precipitación ${(pop * 100).toFixed(0)}% (${lRain}).`);
    if (lKp !== 'VERDE') push(razones, `Kp ${kp} (${lKp}) → posible degradación GNSS/compás.`);
    if (lSats !== 'VERDE') push(razones, `Satélites ${sats} (${lSats}) → precisión GNSS baja.`);
    if (lWx !== 'VERDE') {
      const desc = wxText ? wxText : 'Condición atmosférica adversa';
      push(razones, `Condición actual: ${desc} (${lWx}).`);
    }

    // Recomendaciones por método (conservadoras)
    if (sem === 'ROJO') push(recs, 'Evitar la aplicación en estas condiciones.');
    if (lInv !== 'VERDE') push(recs, 'Esperar ruptura de inversión: más mezcla (viento medio > 5 km/h) y/o mayor radiación.');
    if (lDT === 'ROJO') push(recs, 'Reprogramar a ΔT 2–8 °C o usar gota muy gruesa + antievaporante.');
    if (lWind === 'ROJO' || lGust === 'ROJO') push(recs, 'Si es imprescindible: bajar altura, aumentar tamaño de gota y alejarse de bordes sensibles.');
    if (lWx === 'ROJO') push(recs, 'Hay precipitación/tormenta ahora: evitar la aplicación por lavado y seguridad.');
    if (lWx === 'AMARILLO') push(recs, 'Condición atmosférica (niebla/bruma/polvo): revisar visibilidad/deriva antes de aplicar.');

    // Consejos de operación (genéricos; se pueden ajustar)
    if (metodo === 'DRON') {
      push(recs, 'Dron: usar altura baja/estable (p.ej. 2–4 m sobre canopia) y velocidad moderada para evitar deriva.');
    } else if (metodo === 'AVION') {
      push(recs, 'Avión: respetar altura/velocidad del operador; evitar inversión y vientos hacia zonas sensibles.');
    } else if (metodo === 'MOSQUITO') {
      push(recs, 'Terrestre: mantener botalón lo más bajo y estable posible, y preferir gotas más gruesas con riesgo de deriva.');
    } else if (metodo === 'AIRBLAST') {
      push(recs, 'Airblast: reducir aire en bordes, controlar deriva y evitar viento hacia áreas sensibles.');
    }

    return {
      semaforo: sem,
      scoreDeriva,
      scoreEficacia,
      deltaT: dT,
      inversionProbable: inv,
      razones,
      recomendaciones: recs,
    };
  }

}
