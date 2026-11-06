import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/** Un intervalo de 3 h del índice Kp: empieza en inicioMs (UTC) y dura 3 h. */
export interface IntervaloKp {
  inicioMs: number;
  kp: number;
}

export interface SerieKp {
  fuente: 'GFZ Potsdam' | 'NOAA SWPC';
  intervalos: IntervaloKp[];
}

const TRES_HORAS_MS = 3 * 3600 * 1000;

/**
 * Kp histórico de GFZ Potsdam (https://kp.gfz.de/app/json/?start=…&end=…&index=Kp, antes
 * kp.gfz-potsdam.de). Responde { datetime: [...], Kp: [...] } con el inicio de cada intervalo
 * de 3 h en ISO 8601. PENDIENTE: no manda Access-Control-Allow-Origin (verificado en nov. 2026),
 * así que el navegador no lo puede leer directo. Cuando haya un proxy PHP en el servidor, poner
 * acá su URL (recibe start, end e index y devuelve la respuesta de GFZ tal cual).
 */
const URL_GFZ_PROXY: string | null = null;

/** Feed de NOAA SWPC: Kp observado de los últimos 7 días aprox., con CORS. */
const URL_NOAA = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json';

interface RespuestaGfz {
  datetime?: string[];
  Kp?: Array<number | null>;
}

type FilaNoaa = { time_tag?: string; Kp?: number | string } | Array<string | number>;

/**
 * Serie de Kp por intervalos de 3 h para un período, para tomar el Kp del momento de cada
 * registro (y no el último publicado) al consultar fechas pasadas.
 */
@Injectable({ providedIn: 'root' })
export class KpHistoricoService {
  constructor(private http: HttpClient) {}

  /**
   * Kp entre desde y hasta. Con el proxy de GFZ configurado se usa GFZ (cubre cualquier fecha);
   * si no, el feed de NOAA, que sólo cubre la última semana: quien llama verifica la cobertura
   * con kpEnInstante().
   */
  serie(desde: Date, hasta: Date): Observable<SerieKp> {
    if (URL_GFZ_PROXY) {
      const params = { start: isoSinMs(desde), end: isoSinMs(hasta), index: 'Kp' };
      return this.http.get<RespuestaGfz>(URL_GFZ_PROXY, { params }).pipe(
        map(r => ({ fuente: 'GFZ Potsdam' as const, intervalos: leerGfz(r) }))
      );
    }
    return this.http.get<FilaNoaa[]>(URL_NOAA).pipe(
      map(filas => ({ fuente: 'NOAA SWPC' as const, intervalos: leerNoaa(filas) }))
    );
  }
}

/** Kp del intervalo de 3 h que contiene el instante; null si la serie no lo cubre. */
export function kpEnInstante(serie: SerieKp | null, instanteMs: number): number | null {
  if (!serie) return null;
  const intervalo = serie.intervalos.find(i => instanteMs >= i.inicioMs && instanteMs < i.inicioMs + TRES_HORAS_MS);
  return intervalo ? intervalo.kp : null;
}

/** "2026-11-01T00:00:00Z" (GFZ no acepta milisegundos) */
function isoSinMs(fecha: Date): string {
  return fecha.toISOString().slice(0, 19) + 'Z';
}

/** Fecha UTC del feed ("2026-11-05T03:00:00", "2026-11-05 03:00:00.000" o con Z) → ms. */
function leerFechaUtc(texto: string): number {
  const iso = String(texto).trim().replace(' ', 'T');
  return Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z');
}

function intervaloValido(inicioMs: number, kp: number): boolean {
  return Number.isFinite(inicioMs) && Number.isFinite(kp) && kp >= 0 && kp <= 9;
}

function leerGfz(r: RespuestaGfz): IntervaloKp[] {
  const fechas = r?.datetime ?? [];
  const valores = r?.Kp ?? [];
  const intervalos: IntervaloKp[] = [];
  fechas.forEach((f, i) => {
    const kp = valores[i] == null ? NaN : Number(valores[i]);
    const inicioMs = leerFechaUtc(f);
    if (intervaloValido(inicioMs, kp)) intervalos.push({ inicioMs, kp });
  });
  if (!intervalos.length) throw new Error('GFZ no devolvió Kp para el período');
  return intervalos;
}

/** Feed de NOAA en sus dos formatos: lista de objetos o tabla con una fila de encabezados. */
function leerNoaa(filas: FilaNoaa[]): IntervaloKp[] {
  if (!Array.isArray(filas) || !filas.length) throw new Error('Feed de Kp vacío');
  let idxFecha = -1;
  let idxKp = -1;
  if (Array.isArray(filas[0])) {
    const nombres = filas[0].map(v => String(v));
    idxFecha = nombres.indexOf('time_tag');
    idxKp = nombres.indexOf('Kp');
  }
  const intervalos: IntervaloKp[] = [];
  for (const fila of filas) {
    const fecha = Array.isArray(fila) ? fila[idxFecha] : fila?.time_tag;
    const valor = Array.isArray(fila) ? fila[idxKp] : fila?.Kp;
    if (fecha == null || valor == null || valor === '') continue;
    const inicioMs = leerFechaUtc(String(fecha));
    const kp = Number(valor);
    if (intervaloValido(inicioMs, kp)) intervalos.push({ inicioMs, kp });
  }
  if (!intervalos.length) throw new Error('Formato inesperado del feed de Kp');
  return intervalos;
}
