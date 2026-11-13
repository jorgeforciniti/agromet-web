import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map, shareReplay, timeout } from 'rxjs/operators';
import { Depurador, SensorBaja } from '../shared/depuracion';

/** Si sensores-baja.php o estaciones.php tardan más, se sigue sin depurar */
const ESPERA_MS = 6000;

interface EstacionCruda {
  Identificacion: string;
  nombre: string;
  isRadiation?: number | string;
}

/**
 * Sensores dados de baja (server/servicios/sensores-baja.php). Se piden una vez por visita y se
 * comparten entre secciones. Si el PHP no responde, se sigue sin depurar (lista vacía): nunca
 * bloquea la sección que lo usa.
 *
 * Además, las estaciones sin sensor de radiación (isRadiation = 0 en estaciones.php) cuentan como
 * radiación dada de baja siempre: su 0 no es un dato. Se leen de estaciones.php directamente (no con
 * WeatherService, que usa este servicio).
 */
@Injectable({ providedIn: 'root' })
export class SensoresBajaService {
  private readonly http = inject(HttpClient);
  private readonly url = 'https://agromet.eeaoc.gob.ar/services/sensores-baja.php';
  private readonly urlEstaciones = 'https://agromet.eeaoc.gob.ar/services/estaciones.php';

  private readonly depurador$: Observable<Depurador> = forkJoin([
    this.http.get<{ status: string; data: SensorBaja[] }>(this.url).pipe(
      timeout(ESPERA_MS),
      map(r => r?.status === 'success' && Array.isArray(r.data) ? r.data : []),
      catchError(() => of([] as SensorBaja[]))
    ),
    this.http.get<EstacionCruda[]>(this.urlEstaciones).pipe(
      timeout(ESPERA_MS),
      map(r => Array.isArray(r) ? r : []),
      catchError(() => of([] as EstacionCruda[]))
    )
  ]).pipe(
    map(([bajas, estaciones]) => new Depurador([
      ...bajas,
      ...estaciones
        .filter(e => e.isRadiation !== undefined && String(e.isRadiation) === '0')
        .map(e => ({
          estacion: String(e.Identificacion), variable: 'radiacion' as const, desde: '1900-01-01', hasta: null,
          motivo: 'la estación no tiene sensor de radiación'
        }))
    ], new Map(estaciones.map(e => [(e.nombre ?? '').trim().toLowerCase(), String(e.Identificacion)])))),
    shareReplay(1)
  );

  depurador(): Observable<Depurador> {
    return this.depurador$;
  }
}
