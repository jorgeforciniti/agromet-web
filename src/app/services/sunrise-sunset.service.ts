// sunrise-sunset.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

interface SunriseSunsetResults {
  sunrise: string;
  sunset: string;
  solar_noon: string;
  day_length: number;
  civil_twilight_begin: string;
  civil_twilight_end: string;
  nautical_twilight_begin: string;
  nautical_twilight_end: string;
  astronomical_twilight_begin: string;
  astronomical_twilight_end: string;
}

interface SunriseSunsetResponse {
  results: SunriseSunsetResults;
  status: string;
}

@Injectable({
  providedIn: 'root'
})
export class SunriseSunsetService {
  private baseUrl = 'https://api.sunrise-sunset.org/json';

  constructor(private http: HttpClient) { }

  // Se puede pasar la fecha en formato ISO o 'today'
  getSunriseSunset(lat: number, lng: number, date: string = 'today'): Observable<SunriseSunsetResponse> {
    const url = `${this.baseUrl}?lat=${lat}&lng=${lng}&date=${date}&formatted=0`;
    return this.http.get<SunriseSunsetResponse>(url);
  }
}
