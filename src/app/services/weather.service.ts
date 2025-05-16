import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { WeatherData } from '../models/weather-data';

@Injectable({
  providedIn: 'root'
})
export class WeatherService {
  private stationsUrl = 'https://agromet.eeaoc.gob.ar/services/estaciones.php';

  constructor(private http: HttpClient) { }

  getOpenWeatherForecast(lat: number, lon: number): Observable<any> {
    const apiKey = 'ea2faa440ccc747a20a042317dadac3f';
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&lang=es&units=metric&appid=${apiKey}`;
    return this.http.get(url);
  }

  getStations(): Observable<any[]> {
    return this.http.get<any[]>(this.stationsUrl+'?habilitada=2');
  }

  getStationsAll(): Observable<any[]> {
    return this.http.get<any[]>(this.stationsUrl);
  }

  getWeatherDataResumen(desde: string, hasta: string, estacion: string): Observable<any> {
    const url = `https://agromet.eeaoc.gob.ar/services/datos-resumen.php?desde=${desde}&hasta=${hasta}&estacion=${estacion}`;
    return this.http.get(url);
  }

  getWeatherDataDiary(desde: string, hasta: string, estacion: string): Observable<any> {
    const url = `https://agromet.eeaoc.gob.ar/services/datos-diarios.php?desde=${desde}&hasta=${hasta}&estacion=${estacion}`;
    return this.http.get(url);
  }

  getWeatherDataHourly(fecha: string, estacion: string): Observable<any> {
    const url = `https://agromet.eeaoc.gob.ar/services/datos-24hs.php?fecha=${fecha}&estacion=${estacion}`;
    return this.http.get(url);
  }

  getSmnAlerts(lat: number, lon: number): Observable<any> {
    const url = `https://agromet.eeaoc.gob.ar/services/pronosticos/smn-alerta.php?lat=${lat}&lon=${lon}`;
    return this.http.get(url);
  }
  
  getSmnAlertByCoords(lat: number, lon: number): Observable<any> {
    const url = `https://agromet.eeaoc.gob.ar/services/pronosticos/smn-alerta.php?lat=${lat}&lon=${lon}&tipo=1`;
    return this.http.get(url);
  }
  
  getSmnShortTermAlertByCoords(lat: number, lon: number): Observable<any> {
    const url = `https://agromet.eeaoc.gob.ar/services/pronosticos/smn-alerta.php?lat=${lat}&lon=${lon}&tipo=2`;
    return this.http.get(url);
  }

  getRainCampaign(month: number, year: number): Observable<any> {
    const url = `https://agromet.eeaoc.gob.ar/services/datos-campania.php?mes=${month}&anio=${year}&tipo=2`;
    return this.http.get(url);
  }

  getTMinMax(desde: string, hasta: string): Observable<any> {
    const url = `https://agromet.eeaoc.gob.ar/services/datos-temperatura.php?desde=${desde}&hasta=${hasta}`;
    return this.http.get(url);
  }

}