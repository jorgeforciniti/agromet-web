import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';
import { SensoresBajaService } from './sensores-baja.service';
import { CAMPOS_ACTUALES, inicioDeMes } from '../shared/depuracion';
import { fechaIso } from '../shared/enlace-consulta';

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

  constructor(private http: HttpClient, private sensoresBaja: SensoresBajaService) {}

  /** Sin los valores de los sensores dados de baja (depuración de datos, como en WeatherService) */
  getEstaciones(): Observable<Estacion[]> {
    return forkJoin([this.http.get<ApiResponse>(this.apiUrl), this.sensoresBaja.depurador()]).pipe(
      map(([response, d]) => (response.data ?? []).map(e => {
        const dia = (e.fecha_i ?? '').slice(0, 10) || fechaIso(new Date());
        const limpio = d.limpiar(e, e.identificacion, dia, dia, CAMPOS_ACTUALES);
        return d.limpiar(limpio, e.identificacion, inicioDeMes(dia), dia, { lluvia: ['rr_mes'] });
      }))
    );
  }
}
