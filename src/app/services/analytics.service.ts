import { Injectable, inject } from '@angular/core';
import { Analytics, logEvent, ScreenTrackingService, UserTrackingService } from '@angular/fire/analytics';

/**
 * Estadísticas de uso con Google Analytics (Firebase). No muestra nada en la página.
 *
 * Las visitas y páginas vistas se registran solas (ScreenTrackingService, en main.ts); acá
 * van los eventos propios del sitio. Sólo se mide en el sitio publicado (ver medirVisitas):
 * en desarrollo Analytics no se inicializa y estos métodos no hacen nada.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly analytics = inject(Analytics, { optional: true });

  constructor() {
    // Estos servicios empiezan a registrar páginas vistas y usuario recién cuando alguien
    // los inyecta; este servicio se crea al arrancar la app (AppComponent).
    inject(ScreenTrackingService, { optional: true });
    inject(UserTrackingService, { optional: true });
  }

  registrar(evento: string, parametros?: Record<string, string | number>): void {
    if (!this.analytics) return;
    try {
      logEvent(this.analytics, evento, parametros);
    } catch {
      // Las estadísticas nunca deben romper la página (bloqueadores, navegador sin soporte).
    }
  }
}

/**
 * Se mide sólo en el dominio publicado, para no mezclar visitas de desarrollo y pruebas.
 * Para probar en local: localStorage.setItem('agromet.analytics', '1') y recargar.
 */
export function medirVisitas(): boolean {
  if (typeof window === 'undefined') return false;
  if (/(^|\.)agromet\.eeaoc\.gob\.ar$/.test(window.location.hostname)) return true;
  try {
    return localStorage.getItem('agromet.analytics') === '1';
  } catch {
    return false;
  }
}
