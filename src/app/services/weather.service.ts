import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface WeatherStation {
  id?: string;
  Identificacion: string;
  nombre: string;
  Localidad?: string;
  departamento?: string;
  provincia?: string;
  /** 1 = Llanura Tucumana y zonas vecinas, 2 = Pedemonte Tucumano, 3 = Valles Intermontanos, 4 = Valles de Altura, 5 = Provincias Adyacentes */
  zona?: string;
  lat: string;
  lon: string;
  alt?: number;
  fecha_I?: string;
  temp_af?: string;
  hum_af?: string;
  viento_max?: string;
  RR_dia?: string;
  viento_medio?: string;
  direc?: string;
  habilitada?: number;
  registrosLluvia?: string;
  totalLluvia?: string;
  minimaTemperatura?: string;
  tiempo?: string;
  isSoil?: number | string;
  isRadiation?: number | string;
}

export interface OpenWeatherUvResponse {
  lat: number;
  lon: number;
  date_iso: string;
  date: number;
  value: number;
}

export interface WeatherAlertStation extends WeatherStation {
  habilitada: number;
  registrosLluvia: string;
  totalLluvia: string;
  minimaTemperatura: string;
}

export interface StationsApiResponse<TStation = WeatherStation> {
  data: TStation[];
}

export interface OpenWeatherCondition {
  id: number;
  main: string;
  description: string;
  icon: string;
}

export interface OpenWeatherForecastItem {
  dt: number;
  visibility: number;
  pop?: number;
  main: {
    temp: number;
    temp_min: number;
    temp_max: number;
    humidity: number;
  };
  weather: OpenWeatherCondition[];
  wind: {
    speed: number;
    deg: number;
  };
}

export interface OpenWeatherForecastResponse {
  city: {
    name: string;
  };
  list: OpenWeatherForecastItem[];
}

export interface OpenWeatherNowResponse {
  weather: OpenWeatherCondition[];
}

export interface SmnAreaWarning {
  level: number;
}

export interface SmnReportLevel {
  level: number | string;
  description?: string;
  instruction?: string;
}

export interface SmnAreaReport {
  event_id: number;
  levels: SmnReportLevel[];
}

export interface SmnAreaEvent {
  id: number;
  levels: Record<string, number | string>;
}

export interface SmnAreaWarningEntry {
  date: string;
  events: SmnAreaEvent[];
}

export interface SmnAlertByAreaResponse {
  updated?: string;
  reports: SmnAreaReport[];
  warnings: SmnAreaWarningEntry[];
}

/**
 * Aviso a corto plazo del SMN (/warning/shortterm?province=90, ShortTermWarningDto de su Swagger).
 * Se emite para las próximas horas sobre un polígono; zones describe cada provincia afectada.
 */
export interface SmnAvisoCortoPlazo {
  id: number;
  /** Emisión y fin de vigencia, ISO 8601 */
  date: string;
  end_date?: string;
  title?: string;
  /** R roja, N naranja, A amarilla, V verde */
  severity?: 'R' | 'N' | 'A' | 'V';
  instructions?: string;
  /** «TUCUMÁN: Burruyacú - Cruz Alta - ...» (una por provincia) */
  zones?: string[];
  partial?: 'Y' | 'N';
}

export interface SmnWarningByAreaResponse {
  cold?: Record<string, SmnAreaWarning | undefined>;
  heat?: Record<string, SmnAreaWarning | undefined>;
}

export interface WeatherDataApiResponse<TData> {
  data: TData[];
}

export interface StatusDataApiResponse<TData> {
  status: string;
  data: TData[];
}

export interface RainCampaignRecord {
  year: number;
  month: string;
  value: number;
  normal: number;
}

export interface RainCampaignStation {
  id: number;
  name: string;
  lat: number;
  lon: number;
  reference_period: string;
  dataset: RainCampaignRecord[];
}

/** Respuesta de lluvias-estacion.php: datos de la estación y su serie de lluvias mensuales (mm). */
export interface LluviasEstacionResponse {
  status: 'success' | 'sin_datos' | 'error';
  estacion?: {
    id: number;
    name: string;
    lat: number;
    lon: number;
    alt: number;
    zone: string;
    reference_period: string;
    /** Enero a diciembre; null si no hay normal. */
    normales: (number | null)[];
  };
  /** Enero a diciembre por año; null en los meses sin dato. */
  anios?: { anio: number; meses: (number | null)[] }[];
  message?: string;
}

export interface TminMaxRecord {
  lat: string | number;
  lon: string | number;
  tmin?: string | number | null;
  tmax?: string | number | null;
  Tmin?: string | number | null;
  Tmax?: string | number | null;
  fecha?: string | null;
  nombre?: string;
}

export interface DiseaseApiRecord {
  fecha: string;
  hora: string;
  temp_af?: number | string | null;
  temp_haf?: number | string | null;
  temp_laf?: number | string | null;
  lluvia?: number | string | null;
  tasa_lluvia?: number | string | null;
  presion?: number | string | null;
  temp_ad?: number | string | null;
  hum_ad?: number | string | null;
  hum_af?: number | string | null;
  viento_medio?: number | string | null;
  viento_max?: number | string | null;
  direccion_vmax?: number | string | null;
  direccion_vmed?: number | string | null;
  direccion?: string | null;
  et?: number | string | null;
  rad_solar?: number | string | null;
  rad_solar_h?: number | string | null;
  pronostico?: number | string | null;
  hum_hoja?: number | string | null;
  temperatura_suelo1?: number | string | null;
  temperatura_suelo2?: number | string | null;
  temperatura_suelo3?: number | string | null;
  temperatura_suelo4?: number | string | null;
  hum_suelo1?: number | string | null;
  hum_suelo2?: number | string | null;
  hum_suelo3?: number | string | null;
  ultregrecibido?: string | null;
}

/** Día de la lluvia: calendario (0 a 24 h) o pluviométrico (de 9 a 9 h, termina a las 9 de cada fecha) */
export type DiaLluvia = 'calendario' | 'pluviometrico';

export interface LluviaPeriodoEstacion {
  id: string;
  nombre: string;
  habilitada: number;
  /** null: sin registros en el período */
  mm: number | null;
  maxRegistro: number | null;
  registros: number;
  /** Registros con más de 0,3 mm */
  registrosLluvia: number;
  /** Horas cubiertas por los registros */
  horas: number;
}

export interface LluviaPeriodoResponse {
  status: string;
  desde: string;
  hasta: string;
  dia: DiaLluvia;
  /** Horas transcurridas del período (hasta ahora si todavía no terminó) */
  horasPeriodo: number;
  estaciones: LluviaPeriodoEstacion[];
}

@Injectable({
  providedIn: 'root'
})
export class WeatherService {
  private stationsUrl = 'https://agromet.eeaoc.gob.ar/services/';
  // Relativa: smn-warning.php, forecast.php y now.php no mandan cabeceras CORS.
  // En desarrollo pasan por proxy.conf.json.
  private serviciosSinCorsUrl = '/services/';

  // No hay proxy PHP para el índice UV: se llama a OpenWeatherMap directo,
  // misma API key ya usada en leaflet-goes-viewer.component.ts.
  private openWeatherMapApiKey = 'ea2faa440ccc747a20a042317dadac3f';

  constructor(private http: HttpClient) { }

  getOpenWeatherForecast(lat: number, lon: number): Observable<OpenWeatherForecastResponse> {
    return this.http.get<OpenWeatherForecastResponse>(this.serviciosSinCorsUrl + `forecast.php`, { params: { lat, lon } });
  }

  getOpenWeatherNow(lat: number, lon: number): Observable<OpenWeatherNowResponse> {
    return this.http.get<OpenWeatherNowResponse>(this.serviciosSinCorsUrl + `now.php`, { params: { lat, lon } });
  }

  getUvIndex(lat: number, lon: number): Observable<OpenWeatherUvResponse> {
    return this.http.get<OpenWeatherUvResponse>('https://api.openweathermap.org/data/2.5/uvi', {
      params: { lat, lon, appid: this.openWeatherMapApiKey }
    });
  }

  getStations(): Observable<WeatherStation[]> {
    return this.http.get<WeatherStation[]>(this.stationsUrl + 'estaciones.php?habilitada=2');
  }

  getAlerts<TAlert = WeatherAlertStation>(): Observable<StationsApiResponse<TAlert>> {
    return this.http.get<StationsApiResponse<TAlert>>(this.stationsUrl + 'datos-alerta.php');
  }

  getRains<TRain = WeatherAlertStation>(desde: string, hasta: string): Observable<StationsApiResponse<TRain>> {
    return this.http.get<StationsApiResponse<TRain>>(this.stationsUrl + `datos-alerta.php?desde=${desde}&hasta=${hasta}`);
  }

  /**
   * Lluvia por estación con la cantidad de registros (server/servicios/lluvia-periodo.php, la misma
   * consulta que «Lluvias 9 a 9» de /admin). dia: de 0 a 24 h o día pluviométrico de 9 a 9 h.
   */
  getLluviaPeriodo(desde: string, hasta: string, dia: DiaLluvia): Observable<LluviaPeriodoResponse> {
    return this.http.get<LluviaPeriodoResponse>(this.stationsUrl + `lluvia-periodo.php?desde=${desde}&hasta=${hasta}&dia=${dia}`);
  }

  getStationsAll(): Observable<WeatherStation[]> {
    return this.http.get<WeatherStation[]>(this.stationsUrl + 'estaciones.php');
  }

  getWeatherDataResumen<TResumen>(desde: string, hasta: string, estacion: string): Observable<WeatherDataApiResponse<TResumen>> {
    const url = this.stationsUrl + `datos-resumen.php?desde=${desde}&hasta=${hasta}&estacion=${estacion}`;
    return this.http.get<WeatherDataApiResponse<TResumen>>(url);
  }

  getWeatherDataDiary<TDiary>(desde: string, hasta: string, estacion: string): Observable<WeatherDataApiResponse<TDiary>> {
    const url = this.stationsUrl + `datos-diarios.php?desde=${desde}&hasta=${hasta}&estacion=${estacion}`;
    return this.http.get<WeatherDataApiResponse<TDiary>>(url);
  }

  getWeatherDataHourly<THourly>(fecha: string, estacion: string): Observable<WeatherDataApiResponse<THourly>> {
    const url = this.stationsUrl + `datos-24hs.php?fecha=${fecha}&estacion=${estacion}`;
    return this.http.get<WeatherDataApiResponse<THourly>>(url);
  }

  getDiseaseData<TDisease = DiseaseApiRecord>(desde: string, hasta: string, estacion: string): Observable<StatusDataApiResponse<TDisease>> {
    const url = this.stationsUrl + `datos-enfermedades.php?desde=${desde}&hasta=${hasta}&estacion=${estacion}`;
    return this.http.get<StatusDataApiResponse<TDisease>>(url);
  }

  getSmnAlertByArea(area: number): Observable<SmnAlertByAreaResponse> {
    const url = this.serviciosSinCorsUrl + `pronosticos/smn-alerta-area.php?area=${area}&tipo=1`;
    return this.http.get<SmnAlertByAreaResponse>(url);
  }

  /**
   * Avisos a corto plazo vigentes para Tucumán (smn-alerta-area.php con tipo=2; el PHP pide el área
   * aunque estos avisos son por provincia). Si el PHP devuelve un error, la lista queda vacía.
   */
  getSmnAvisosCortoPlazo(): Observable<SmnAvisoCortoPlazo[]> {
    const url = this.serviciosSinCorsUrl + `pronosticos/smn-alerta-area.php?area=3373&tipo=2`;
    return this.http.get<SmnAvisoCortoPlazo[] | { error?: string }>(url).pipe(
      map(r => (Array.isArray(r) ? r : []))
    );
  }

  getSmnWarningByArea(): Observable<SmnWarningByAreaResponse> {
    const url = this.serviciosSinCorsUrl + `pronosticos/smn-warning.php`;
    return this.http.get<SmnWarningByAreaResponse>(url);
  }

  getRainCampaign<TStation = RainCampaignStation>(month: number, year: number): Observable<StatusDataApiResponse<TStation>> {
    const url = this.stationsUrl + `datos-campania.php?mes=${month}&anio=${year}&tipo=2`;
    return this.http.get<StatusDataApiResponse<TStation>>(url);
  }

  getLluviasEstacion(estacion: number): Observable<LluviasEstacionResponse> {
    return this.http.get<LluviasEstacionResponse>(this.stationsUrl + 'lluvias-estacion.php', { params: { estacion } });
  }

  getRainCurrentMonth<TCurrent = unknown>(): Observable<StatusDataApiResponse<TCurrent>> {
    const url = this.stationsUrl + `datos-campania-mes-en-curso.php`;
    return this.http.get<StatusDataApiResponse<TCurrent>>(url);
  }

  getTMinMax<TRecord = TminMaxRecord>(desde: string, hasta: string): Observable<StatusDataApiResponse<TRecord>> {
    const url = this.stationsUrl + `datos-temperatura.php?desde=${desde}&hasta=${hasta}`;
    return this.http.get<StatusDataApiResponse<TRecord>>(url);
  }

  getHeladas<THelada = unknown>(desde: string, hasta: string): Observable<WeatherDataApiResponse<THelada>> {
    const url = this.stationsUrl + `datos-heladas.php?desde=${desde}&hasta=${hasta}`;
    return this.http.get<WeatherDataApiResponse<THelada>>(url);
  }

}
