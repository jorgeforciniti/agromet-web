import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { WeatherData } from '../models/weather-data';

@Injectable({
  providedIn: 'root'
})
export class WeatherService {
  private stationsUrl = 'https://agromet.eeaoc.gob.ar/api/estaciones.php?habilitada=2';

  constructor(private http: HttpClient) { }

  getOpenWeatherForecast(lat: number, lon: number): Observable<any> {
    const apiKey = 'ea2faa440ccc747a20a042317dadac3f';
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&lang=es&units=metric&appid=${apiKey}`;
    return this.http.get(url);
  }

  getStations(): Observable<any[]> {
    return this.http.get<any[]>(this.stationsUrl);
  }

  getSmnAlerts(lat: number, lon: number): Observable<any> {
    const url = `https://agromet.eeaoc.gob.ar/api/pronosticos/smn-alerta.php?lat=${lat}&lon=${lon}`;
    return this.http.get(url);
  }
  
  getSmnAlertByCoords(lat: number, lon: number): Observable<any> {
    const url = `https://api.smn.gob.ar/v1/warning/alert/location/coord?lat=${lat}&lon=${lon}`;
    return this.http.get(url);
  }
  
  getSmnShortTermAlertByCoords(lat: number, lon: number): Observable<any> {
    const url = `https://api.smn.gob.ar/v1/warning/shortterm/location/coord?lat=${lat}&lon=${lon}`;
    return this.http.get(url);
  }
}