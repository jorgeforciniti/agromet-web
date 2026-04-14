import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
export interface KpLatest {
  timeTag: string;      // UTC string ("YYYY-MM-DD HH:mm:ss.SSS")
  kp: number;           // 0..9 (puede venir con decimales)
  stationCount?: number;
}

type KpFeedRow = Array<string | number>;
type KpFeedTable = KpFeedRow[];

@Injectable({ providedIn: 'root' })
export class KpService {
  /**
   * Feed oficial SWPC (NOAA) en formato "tabla" JSON.
   * Contiene Kp observado en intervalos de 3 horas.
   */
  private readonly url = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json';

  constructor(private http: HttpClient) {}

  /** Obtiene el último Kp disponible (observado). */
  getLatestKp(): Observable<KpLatest> {
    return this.http.get<KpFeedTable>(this.url).pipe(
      map((rows) => {
        if (!Array.isArray(rows) || rows.length < 2) {
          throw new Error('Formato inesperado de SWPC Kp');
        }
        const headers = rows[0].map((value) => String(value));
        const idxTime = headers.indexOf('time_tag');
        const idxKp = headers.indexOf('Kp');
        const idxStations = headers.indexOf('station_count');
        if (idxTime < 0 || idxKp < 0) {
          throw new Error('Encabezados faltantes en SWPC Kp');
        }
        const last = rows[rows.length - 1];
        const timeTag = String(last[idxTime]);
        const kp = Number(last[idxKp]);
        const stationCount = idxStations >= 0 ? Number(last[idxStations]) : undefined;
        if (!Number.isFinite(kp)) throw new Error('Kp inválido');
        return { timeTag, kp, stationCount } as KpLatest;
      })
    );
  }
}
