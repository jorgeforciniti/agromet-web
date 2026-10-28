import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';
import { Normales } from '../charts/normales';

interface RespuestaNormales {
  status: 'success' | 'sin_normales' | 'error';
  normales?: Normales;
}

/**
 * Normales mensuales por estación (normales.php). Devuelve null si la estación no tiene
 * normales o si el servicio falla: en ese caso los gráficos simplemente no la dibujan.
 * Se pide una sola vez por estación mientras dura la visita.
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
        map(r => (r?.status === 'success' && r.normales && Object.keys(r.normales).length ? r.normales : null)),
        catchError(() => of(null)),
        shareReplay(1)
      );
      this.cache.set(id, pedido);
    }
    return pedido;
  }
}
