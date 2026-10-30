import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, from, of } from 'rxjs';
import { catchError, map, mergeMap, shareReplay, toArray } from 'rxjs/operators';
import {
  AnomaliasResponse,
  ClasificacionLluviasResponse,
  DiariosResponse,
  EpisodiosAnualResponse,
  EpisodiosDetalleResponse,
  EstadoCarga,
  ExtremosTermicosResponse,
  LluviaDiariaAnio,
  MensualesResponse,
  NormalesResponse,
  Recurso
} from '../colmenar/colmenar.models';

/** Primer año con registros de la serie (la lluvia comienza en septiembre de 1910). */
export const COLMENAR_ANIO_INICIO = 1910;
/** Máximo de años por consulta que aceptan mensuales/anomalias/episodios. */
export const COLMENAR_MAX_ANIOS_RANGO = 20;

@Injectable({ providedIn: 'root' })
export class ColmenarService {
  /**
   * La API se publica en el mismo dominio que el portal. No envía cabeceras CORS, por lo que
   * en desarrollo (ng serve) debe usarse el proxy definido en proxy.conf.json.
   */
  private readonly base = '/api/colmenar/';
  private normales$?: Observable<NormalesResponse>;
  private readonly lluviaDiaria = new Map<number, Observable<LluviaDiariaAnio>>();

  constructor(private http: HttpClient) { }

  /** Las normales 1991–2020 no cambian: se piden una sola vez por sesión. */
  getNormales(): Observable<NormalesResponse> {
    if (!this.normales$) {
      this.normales$ = this.get<NormalesResponse>('normales.php').pipe(shareReplay(1));
    }
    return this.normales$;
  }

  getMensuales(anioDesde: number, anioHasta: number): Observable<MensualesResponse> {
    return this.get<MensualesResponse>('mensuales.php', { anio_desde: anioDesde, anio_hasta: anioHasta });
  }

  getAnomalias(anioDesde: number, anioHasta: number): Observable<AnomaliasResponse> {
    return this.get<AnomaliasResponse>('anomalias.php', { anio_desde: anioDesde, anio_hasta: anioHasta });
  }

  getClasificacionLluvias(anio: number): Observable<ClasificacionLluviasResponse> {
    return this.get<ClasificacionLluviasResponse>('clasificacion_lluvias.php', { anio });
  }

  getExtremosTermicos(anio: number): Observable<ExtremosTermicosResponse> {
    return this.get<ExtremosTermicosResponse>('extremos_termicos.php', { anio });
  }

  getEpisodios(anioDesde: number, anioHasta: number): Observable<EpisodiosDetalleResponse> {
    return this.get<EpisodiosDetalleResponse>('episodios.php', { anio_desde: anioDesde, anio_hasta: anioHasta, tipo: 'detalle' });
  }

  getEpisodiosAnuales(anioDesde: number, anioHasta: number): Observable<EpisodiosAnualResponse> {
    return this.get<EpisodiosAnualResponse>('episodios.php', { anio_desde: anioDesde, anio_hasta: anioHasta, tipo: 'anual' });
  }

  /** `desde` y `hasta` en formato YYYY-MM-DD; la API admite hasta 366 días por consulta. */
  getDiarios(desde: string, hasta: string): Observable<DiariosResponse> {
    return this.get<DiariosResponse>('diarios.php', { desde, hasta });
  }

  /**
   * Lluvia diaria de un año calendario (una consulta por año, guardada en caché durante la sesión).
   * Un día es válido sólo con estado_pp 0, 1 o 2 y valor informado; los demás quedan en null.
   */
  getLluviaDiaria(anio: number): Observable<LluviaDiariaAnio> {
    let obs = this.lluviaDiaria.get(anio);
    if (!obs) {
      obs = this.getDiarios(`${anio}-01-01`, `${anio}-12-31`).pipe(
        map((r) => {
          const porFecha = new Map((r.datos ?? []).map((d) => [d.fecha, d]));
          const fechas: string[] = [];
          const mm: (number | null)[] = [];
          for (let t = Date.UTC(anio, 0, 1); new Date(t).getUTCFullYear() === anio; t += 86400000) {
            const f = new Date(t).toISOString().slice(0, 10);
            const d = porFecha.get(f);
            fechas.push(f);
            mm.push(d && d.precipitacion !== null && d.estado_pp !== null && d.estado_pp <= 2 ? d.precipitacion : null);
          }
          return { anio, fechas, mm, completo: mm.every((v) => v !== null) };
        }),
        shareReplay(1)
      );
      this.lluviaDiaria.set(anio, obs);
      // Si falla, se descarta de la caché para poder reintentar.
      obs.subscribe({ error: () => this.lluviaDiaria.delete(anio) });
    }
    return obs;
  }

  /**
   * Lluvia diaria de varios años, con hasta 6 consultas simultáneas. `progreso` recibe la
   * cantidad de años ya descargados.
   */
  getLluviaDiariaAnios(anios: number[], progreso?: (listos: number) => void): Observable<LluviaDiariaAnio[]> {
    let listos = 0;
    return from(anios).pipe(
      mergeMap((a) => this.getLluviaDiaria(a).pipe(map((d) => {
        progreso?.(++listos);
        return d;
      })), 6),
      toArray(),
      map((lista) => lista.sort((x, y) => x.anio - y.anio))
    );
  }

  /**
   * Envuelve una consulta en un Recurso para la UI: nunca emite error, de modo que una API
   * caída no impide que el resto de las secciones funcione.
   */
  recurso<T>(fuente: Observable<T>, vacio: (r: T) => boolean): Observable<Recurso<T>> {
    return fuente.pipe(
      map((datos): Recurso<T> => ({ estado: (vacio(datos) ? 'vacio' : 'ok') as EstadoCarga, datos })),
      catchError((err: unknown) => of<Recurso<T>>({ estado: 'error', datos: null, mensaje: this.mensajeError(err) }))
    );
  }

  mensajeError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      // 200 con HTML: la ruta /api/colmenar no llegó al servidor de la API (p. ej. ng serve sin proxy
      // o un hosting que reescribe todas las rutas a index.html).
      if (err.status === 200 && typeof err.error?.text === 'string' && /^\s*</.test(err.error.text)) {
        return 'El servicio de datos no está disponible desde este sitio (se recibió una página HTML en lugar de datos).';
      }
      if (err.status === 0) {
        return 'No se pudo conectar con el servicio de datos. Verificá la conexión e intentá nuevamente.';
      }
      const cuerpo = err.error as { mensaje?: string; error?: string } | null;
      const detalle = cuerpo?.mensaje ?? cuerpo?.error;
      return detalle ? `El servicio respondió: ${detalle}.` : `El servicio respondió con un error (HTTP ${err.status}).`;
    }
    if (err instanceof Error) {
      return err.message;
    }
    return 'Ocurrió un error inesperado al consultar los datos.';
  }

  private get<T>(archivo: string, params: Record<string, string | number> = {}): Observable<T> {
    return this.http.get<T>(this.base + archivo, { params: new HttpParams({ fromObject: params }) }).pipe(
      map((resp) => {
        // Algunas API responden 200 con { ok: false } o { error } ante parámetros no aceptados.
        const r = resp as unknown as { ok?: boolean; error?: string; mensaje?: string };
        if (r && (r.ok === false || typeof r.error === 'string')) {
          throw new Error(`El servicio respondió: ${r.mensaje ?? r.error ?? 'consulta no válida'}.`);
        }
        return resp;
      })
    );
  }
}
