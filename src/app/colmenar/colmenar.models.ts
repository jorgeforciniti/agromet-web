/**
 * Contratos de las API de El Colmenar (https://agromet.eeaoc.gob.ar/api/colmenar/).
 * Los nombres y tipos se relevaron contra las respuestas publicadas; los campos que
 * la API devuelve como null cuando un mes no está completo se tipan como `| null`.
 */

export interface EstacionInfo {
  identificacion: number;
  nombre: string;
}

export interface PeriodoReferencia {
  desde: number;
  hasta: number;
}

/* ---------- normales.php ---------- */
export interface NormalMensual {
  mes: number;
  tmax_normal: number | null;
  tmin_normal: number | null;
  tmedia_normal: number | null;
  pp_normal: number | null;
  anios_validos_max: number;
  anios_validos_min: number;
  anios_validos_pp: number;
}

export interface NormalesResponse {
  ok: boolean;
  estacion: EstacionInfo;
  periodo_referencia: PeriodoReferencia;
  mes_solicitado: number | null;
  cantidad: number;
  datos: NormalMensual[];
}

/* ---------- mensuales.php ---------- */
export interface Mensual {
  anio: number;
  mes: number;
  dias_mes: number;
  dias_registrados: number;
  validos_max: number;
  validos_min: number;
  validos_pp: number;
  pct_validos_max: number;
  pct_validos_min: number;
  pct_validos_pp: number;
  tmax_media_observada: number | null;
  tmin_media_observada: number | null;
  /** Media validada por la API; null cuando el mes no cumple el control de completitud. */
  tmax_media_valida: number | null;
  tmin_media_valida: number | null;
  tmax_absoluta: number | null;
  tmin_absoluta: number | null;
  lluvia_observada: number | null;
  lluvia_mensual_valida: number | null;
  dias_secos: number;
  dias_traza: number;
  dias_lluvia_medible: number;
  lluvia_completa: boolean;
}

export interface MensualesResponse {
  ok: boolean;
  estacion: EstacionInfo;
  periodo: { anio_desde: number; anio_hasta: number };
  cantidad: number;
  datos: Mensual[];
}

/* ---------- anomalias.php ---------- */
export interface AnomaliaMensual {
  anio: number;
  mes: number;
  tmax_media_valida: number | null;
  tmax_normal: number | null;
  anomalia_tmax: number | null;
  tmin_media_valida: number | null;
  tmin_normal: number | null;
  anomalia_tmin: number | null;
  lluvia_mensual_valida: number | null;
  pp_normal: number | null;
  diferencia_pp: number | null;
  anomalia_pp_pct: number | null;
}

export interface AnomaliasResponse {
  ok: boolean;
  estacion: EstacionInfo;
  periodo_referencia: PeriodoReferencia;
  periodo_consulta: { anio_desde: number; anio_hasta: number };
  cantidad: number;
  datos: AnomaliaMensual[];
}

/* ---------- clasificacion_lluvias.php ---------- */
export interface PercentilesLluvia {
  p10: number | null;
  p20: number | null;
  p40: number | null;
  p60: number | null;
  p80: number | null;
  p90: number | null;
}

/** Valores observados: 'SIN_RECORD', 'NUEVO_RECORD' o null (mes incompleto / sin referencia previa). */
export type EstadoRecord = string | null;

export interface LluviaMensualClasificada {
  anio: number;
  mes: number;
  dias_mes: number;
  /** Días con un registro diario en la base (con o sin precipitación). */
  dias_registrados: number;
  dias_validos_pp: number;
  /** Días con valor de precipitación informado (incluye 0 mm). */
  dias_disponibles_pp: number;
  dias_definitivos_pp: number;
  dias_provisionales_pp: number;
  /** Registros provisionales cuya precipitación todavía falta: no son días secos ni con lluvia. */
  dias_pendientes_verificacion: number;
  /** Valores observados: 'Definitivo', 'A verificar', 'Incompleto'. */
  estado_verificacion: string | null;
  lluvia_completa: boolean;
  lluvia_mm: number | null;
  lluvia_parcial_mm: number | null;
  percentiles: PercentilesLluvia;
  clasificacion: string | null;
  record: boolean | null;
  estado_record: EstadoRecord;
  maximo_historico_anterior_mm: number | null;
  anio_record_anterior: number | null;
}

export interface ClasificacionLluviasResponse {
  estacion: string;
  identificacion: number;
  anio: number;
  periodo_percentiles: string;
  unidad: string;
  cantidad_meses: number;
  datos: LluviaMensualClasificada[];
}

/* ---------- extremos_termicos.php ---------- */
export type IndicadorExtremo = 'tmax_30' | 'tmax_35' | 'tmin_20' | 'tmin_22';

export type ConteoIndicadores = Record<IndicadorExtremo, number | null>;

export interface ExtremoMensual {
  mes: number;
  dias_mes: number;
  dias_registrados: number;
  validos_max: number;
  validos_min: number;
  completa_max: boolean;
  completa_min: boolean;
  tmax_30: number | null;
  tmax_35: number | null;
  tmin_20: number | null;
  tmin_22: number | null;
  normales_1991_2020: ConteoIndicadores;
  /** null cuando el mes no está completo para la variable. */
  anomalias_dias: ConteoIndicadores;
  anios_validos_normales: { max: number; min: number };
}

export interface ResumenAnualExtremos {
  dias_registrados: number;
  validos_max: number;
  validos_min: number;
  tmax_30: number | null;
  tmax_35: number | null;
  tmin_20: number | null;
  tmin_22: number | null;
  dias_anio: number;
  completa_max: boolean;
  completa_min: boolean;
  anio_completo: boolean;
}

export interface ComparacionMesesCompletos {
  meses_completos_max: number;
  meses_completos_min: number;
  observado: ConteoIndicadores;
  normal_1991_2020: ConteoIndicadores;
  anomalia: ConteoIndicadores;
  criterio: string;
  nota: string;
}

export interface PercentilesAnuales {
  n: number;
  p10: number | null;
  p20: number | null;
  p40: number | null;
  p60: number | null;
  p80: number | null;
  p90: number | null;
}

export interface ClasificacionAnualIndicador {
  observado_dias: number | null;
  anio_completo_variable: boolean;
  percentiles_1991_2020: PercentilesAnuales;
  clasificacion: string | null;
}

export interface ExtremosTermicosResponse {
  estacion: string;
  identificacion: number;
  anio: number;
  unidad_temperatura: string;
  periodo_normales: string;
  criterio: string;
  cantidad_meses: number;
  resumen_anual: ResumenAnualExtremos;
  comparacion_meses_completos: ComparacionMesesCompletos;
  clasificacion_anual: Partial<Record<IndicadorExtremo, ClasificacionAnualIndicador>>;
  datos: ExtremoMensual[];
}

/* ---------- episodios.php ---------- */
export interface CriterioEpisodios {
  percentil: number;
  temperaturas: string;
  superacion: string;
  duracion_minima_dias: number;
  anio_asignado_por: string;
}

export interface EpisodioCalido {
  id: number;
  fecha_inicio: string;
  fecha_fin: string;
  duracion: number;
  excedente_max_acum: number | null;
  excedente_min_acum: number | null;
  mayor_excedente_max: number | null;
  mayor_excedente_min: number | null;
}

export interface EpisodiosAnuales {
  anio: number;
  episodios: number;
  dias_en_episodios: number;
  duracion_maxima: number | null;
  duracion_media: number | null;
  intensidad_max_acum: number | null;
  intensidad_min_acum: number | null;
}

interface EpisodiosBase {
  ok: boolean;
  estacion: EstacionInfo;
  periodo_referencia: PeriodoReferencia;
  criterio: CriterioEpisodios;
  periodo_consulta: { anio_desde: number; anio_hasta: number };
  cantidad: number;
}

export interface EpisodiosDetalleResponse extends EpisodiosBase {
  tipo: 'detalle';
  datos: EpisodioCalido[];
}

export interface EpisodiosAnualResponse extends EpisodiosBase {
  tipo: 'anual';
  datos: EpisodiosAnuales[];
}

/* ---------- Estado de carga en la UI ---------- */
export type EstadoCarga = 'cargando' | 'ok' | 'vacio' | 'error';

export interface Recurso<T> {
  estado: EstadoCarga;
  datos: T | null;
  mensaje?: string;
}
