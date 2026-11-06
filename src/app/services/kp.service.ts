import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
export interface KpLatest {
  timeTag: string;      // UTC, "YYYY-MM-DD HH:mm"
  kp: number;           // 0..9 (puede venir con decimales)
  stationCount?: number;
}

/** Formato actual del feed: un objeto por intervalo. */
interface KpFeedObjeto {
  time_tag: string;
  Kp: number | string;
  station_count?: number | string;
}

/** Formato anterior: tabla con una primera fila de encabezados. */
type KpFeedFila = Array<string | number>;

type KpFeed = KpFeedObjeto[] | KpFeedFila[];

@Injectable({ providedIn: 'root' })
export class KpService {
  /**
   * Feed oficial SWPC (NOAA) con el Kp observado en intervalos de 3 horas.
   * A fines de 2026 pasó de una tabla con encabezados a una lista de objetos; se leen los dos
   * formatos por si vuelve a cambiar.
   */
  private readonly url = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json';

  constructor(private http: HttpClient) {}

  /** Obtiene el último Kp disponible (observado). */
  getLatestKp(): Observable<KpLatest> {
    return this.http.get<KpFeed>(this.url).pipe(
      map((rows) => {
        const ultimo = Array.isArray(rows) ? leerUltimo(rows) : null;
        if (!ultimo) {
          throw new Error('Formato inesperado de SWPC Kp');
        }
        const kp = Number(ultimo.Kp);
        if (!Number.isFinite(kp)) throw new Error('Kp inválido');
        const stationCount = ultimo.station_count != null ? Number(ultimo.station_count) : undefined;
        return { timeTag: normalizarFecha(ultimo.time_tag), kp, stationCount };
      })
    );
  }
}

/** Último intervalo del feed, en cualquiera de sus dos formatos; null si no se reconoce. */
function leerUltimo(rows: KpFeed): KpFeedObjeto | null {
  const last = rows[rows.length - 1];
  if (!last) return null;

  if (!Array.isArray(last)) {
    return last.time_tag != null && last.Kp != null ? last : null;
  }

  // Formato tabla: la primera fila son los encabezados y debe haber al menos un dato.
  const headers = rows[0];
  if (rows.length < 2 || !Array.isArray(headers)) return null;
  const nombres = headers.map((value) => String(value));
  const idxTime = nombres.indexOf('time_tag');
  const idxKp = nombres.indexOf('Kp');
  const idxStations = nombres.indexOf('station_count');
  if (idxTime < 0 || idxKp < 0) return null;
  return {
    time_tag: String(last[idxTime]),
    Kp: last[idxKp],
    station_count: idxStations >= 0 ? last[idxStations] : undefined
  };
}

/** "2026-11-03T06:00:00" o "2026-11-03 06:00:00.000" → "2026-11-03 06:00". */
function normalizarFecha(timeTag: string): string {
  return String(timeTag).replace('T', ' ').slice(0, 16);
}
