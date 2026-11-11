import { ErrorHandler, Injectable, inject } from '@angular/core';
import { Analytics, logEvent, ScreenTrackingService, UserTrackingService } from '@angular/fire/analytics';
import posthog from 'posthog-js';

// Clave pública del proyecto de PostHog (está pensada para ir en el sitio, no es un secreto).
const POSTHOG_CLAVE = 'phc_y6MmVvKKJcFUN38CN2NXBhUurPm2U32m2Pu8E33gfA4Q';
const POSTHOG_HOST = 'https://us.i.posthog.com';
let posthogActivo = false;

/**
 * Estadísticas de uso y errores con PostHog (además de Google Analytics). Se llama en main.ts
 * antes de arrancar Angular y sólo si medirVisitas(). Registra páginas vistas en cada cambio
 * de ruta, clics y errores de JavaScript; no graba sesiones ni encuestas.
 */
export function iniciarPostHog(): void {
  try {
    posthog.init(POSTHOG_CLAVE, {
      api_host: POSTHOG_HOST,
      defaults: '2026-08-30',
      capture_pageview: 'history_change',
      capture_exceptions: true,
      disable_session_recording: true,
      disable_surveys: true,
      person_profiles: 'identified_only',
    });
    posthogActivo = true;
  } catch {
    // Las estadísticas nunca deben romper la página.
  }
}

/**
 * Angular atrapa los errores de los componentes y sólo los escribe en la consola, así que
 * PostHog no los vería solo: este manejador los manda además a Error tracking.
 */
@Injectable()
export class ManejadorErrores extends ErrorHandler {
  override handleError(error: unknown): void {
    super.handleError(error);
    if (!posthogActivo) return;
    try {
      posthog.captureException(error);
    } catch {
      // Ídem.
    }
  }
}

/**
 * Estadísticas de uso con Google Analytics (Firebase) y PostHog. No muestra nada en la página.
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
    try {
      if (posthogActivo) posthog.capture(evento, parametros);
      if (this.analytics) logEvent(this.analytics, evento, parametros);
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
