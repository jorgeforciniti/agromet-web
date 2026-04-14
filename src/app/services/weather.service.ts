import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface WeatherStation {
  id?: string;
  Identificacion: string;
  nombre: string;
  provincia?: string;
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
  reports: SmnAreaReport[];
  warnings: SmnAreaWarningEntry[];
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

@Injectable({
  providedIn: 'root'
})
export class WeatherService {
  private stationsUrl = 'https://agromet.eeaoc.gob.ar/services/';

  constructor(private http: HttpClient) { }

  getOpenWeatherForecast(lat: number, lon: number): Observable<OpenWeatherForecastResponse> {
    return this.http.get<OpenWeatherForecastResponse>(this.stationsUrl +`forecast.php`, { params: { lat, lon } });
  }

  getOpenWeatherNow(lat: number, lon: number): Observable<OpenWeatherNowResponse> {
    return this.http.get<OpenWeatherNowResponse>(this.stationsUrl +`now.php`, { params: { lat, lon } });
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

  getSmnAlerts(lat: number, lon: number): Observable<SmnAlertByAreaResponse> {
    const url = this.stationsUrl + `pronosticos/smn-alerta.php?lat=${lat}&lon=${lon}`;
    return this.http.get<SmnAlertByAreaResponse>(url);
  }

  getSmnAlertByCoords(lat: number, lon: number): Observable<SmnAlertByAreaResponse> {
    const url = this.stationsUrl + `pronosticos/smn-alerta.php?lat=${lat}&lon=${lon}&tipo=1`;
    return this.http.get<SmnAlertByAreaResponse>(url);
  }

  getSmnShortTermAlertByCoords(lat: number, lon: number): Observable<SmnAlertByAreaResponse> {
    const url = this.stationsUrl + `pronosticos/smn-alerta.php?lat=${lat}&lon=${lon}&tipo=2`;
    return this.http.get<SmnAlertByAreaResponse>(url);
  }

  getSmnAlertByArea(area: number): Observable<SmnAlertByAreaResponse> {
    const url = this.stationsUrl + `pronosticos/smn-alerta-area.php?area=${area}&tipo=1`;
    return this.http.get<SmnAlertByAreaResponse>(url);
  }

  getSmnShortTermAlertByArea(area: number): Observable<SmnAlertByAreaResponse> {
    const url = this.stationsUrl + `pronosticos/smn-alerta-area.php?area=${area}&tipo=2`;
    return this.http.get<SmnAlertByAreaResponse>(url);
  }

  getSmnWarningByArea(): Observable<SmnWarningByAreaResponse> {
    const url = this.stationsUrl + `pronosticos/smn-warning.php`;
    return this.http.get<SmnWarningByAreaResponse>(url);
  }

  getRainCampaign<TStation = RainCampaignStation>(month: number, year: number): Observable<StatusDataApiResponse<TStation>> {
    const url = this.stationsUrl + `datos-campania.php?mes=${month}&anio=${year}&tipo=2`;
    return this.http.get<StatusDataApiResponse<TStation>>(url);
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
