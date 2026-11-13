import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';
import { Depurador, SensorBaja } from '../shared/depuracion';

/**
 * Sensores dados de baja (server/servicios/sensores-baja.php). Se piden una vez por visita y se
 * comparten entre secciones. Si el PHP no responde, se sigue sin depurar (lista vacía): nunca
 * bloquea la sección que lo usa.
 */
@Injectable({ providedIn: 'root' })
export class SensoresBajaService {
  private readonly http = inject(HttpClient);
  private readonly url = 'https://agromet.eeaoc.gob.ar/services/sensores-baja.php';

  private readonly depurador$: Observable<Depurador> = this.http
    .get<{ status: string; data: SensorBaja[] }>(this.url)
    .pipe(
      map(r => new Depurador(r?.status === 'success' && Array.isArray(r.data) ? r.data : [])),
      catchError(() => of(new Depurador([]))),
      shareReplay(1)
    );

  depurador(): Observable<Depurador> {
    return this.depurador$;
  }
}
