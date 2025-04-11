import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { WeatherData } from '../models/weather-data';

@Injectable({
  providedIn: 'root'
})
export class WeatherService {
  private apiUrl = 'https://agromet.eeaoc.gob.ar/api/pronosticos/smn-pronostico.php?lat=-26.82414&lon=-65.2226';

  constructor(private http: HttpClient) { }

  getWeatherForecast(): Observable<WeatherData> {
    return this.http.get<WeatherData>(this.apiUrl);
  }
}