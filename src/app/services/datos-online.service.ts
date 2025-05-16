import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Estacion {
  identificacion: number;
  nombre: string;
  fecha_i: string;
  temp_af: string;
  hum_af: string;
  rr_dia: number;
  rr_mes: number;
  presion: number;
  viento_medio: number;
  viento_max: number;
  direc: number;
  rafaga24: string;
  lat: number;
  lon: number;
  alt: number;
}

interface ApiResponse {
  status: string;
  data: Estacion[];
}

@Injectable({ providedIn: 'root' })
export class DatosOnlineService {
  private apiUrl = 'https://agromet.eeaoc.gob.ar/services/datos-online.php';

  constructor(private http: HttpClient) {}

  getEstaciones(): Observable<Estacion[]> {
    return this.http.get<ApiResponse>(this.apiUrl)
      .pipe(map(response => response.data));
  }
}
