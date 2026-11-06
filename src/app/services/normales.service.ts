import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';
import { Normales, PeriodoNormales } from '../charts/normales';

interface RespuestaNormales {
  status: 'success' | 'sin_normales' | 'error';
  normales?: Normales;
  /** Período de referencia, si la tabla lo tiene: {desde, hasta} o un texto */
  periodo?: { desde?: number | string | null; hasta?: number | string | null } | string | null;
}

/** Normaliza el período que manda normales.php (objeto, texto o nada). */
function leerPeriodo(p: RespuestaNormales['periodo']): PeriodoNormales | undefined {
  if (typeof p === 'string') return p.trim() ? { texto: p.trim() } : undefined;
  if (p && typeof p === 'object' && (p.desde || p.hasta)) return { desde: p.desde ?? null, hasta: p.hasta ?? null };
  return undefined;
}

/**
 * Normales mensuales por estación (normales.php). Devuelve null si la estación no tiene
 * normales o si el servicio falla: en ese caso los gráficos simplemente no la dibujan.
 * Se pide una sola vez por estación mientras dura la visita. Si la API trae el período de
 * referencia de las normales, queda en `periodo` (ver textoPeriodoNormales).
 */
@Injectable({ providedIn: 'root' })
export class NormalesService {
  private readonly url = 'https://agromet.eeaoc.gob.ar/services/normales.php';
  private readonly cache = new Map<string, Observable<Normales | null>>();

  constructor(private http: HttpClient) { }

  deEstacion(estacion: string | number | null | undefined): Observable<Normales | null> {
    const id = String(estacion ?? '').trim();
    if (!/^\d+$/.test(id)) return of(null);

    let pedido = this.cache.get(id);
    if (!pedido) {
      pedido = this.http.get<RespuestaNormales>(this.url, { params: { estacion: id } }).pipe(
        map(r => {
          if (r?.status !== 'success' || !r.normales || !Object.keys(r.normales).length) return null;
          const periodo = leerPeriodo(r.periodo);
          return periodo ? { ...r.normales, periodo } : r.normales;
        }),
        catchError(() => of(null)),
        shareReplay(1)
      );
      this.cache.set(id, pedido);
    }
    return pedido;
  }
}
