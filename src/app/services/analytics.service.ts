import { ErrorHandler, Injectable, inject } from '@angular/core';
import { Analytics, logEvent, ScreenTrackingService, UserTrackingService } from '@angular/fire/analytics';
import posthog from 'posthog-js';
import { environment } from '../environments/environment';

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
 * Se mide sólo en el dominio publicado, para no mezclar visitas de desarrollo y pruebas, y
 * nunca si la persona lo desactivó en /privacidad.
 * Para probar en local: localStorage.setItem('agromet.analytics', '1') y recargar.
 */
export function medirVisitas(): boolean {
  if (typeof window === 'undefined' || medicionDesactivada()) return false;
  if (/(^|\.)agromet\.eeaoc\.gob\.ar$/.test(window.location.hostname)) return true;
  try {
    return localStorage.getItem('agromet.analytics') === '1';
  } catch {
    return false;
  }
}

/** La persona pidió no medir sus visitas en este navegador (botón de /privacidad). */
export function medicionDesactivada(): boolean {
  try {
    return localStorage.getItem('agromet.analytics') === '0';
  } catch {
    return false;
  }
}

/**
 * Desactiva (o vuelve a activar) Google Analytics y PostHog en este navegador. Al desactivar se
 * cortan ya mismo; al reactivar, la medición vuelve en la próxima carga de la página.
 */
export function desactivarMedicion(desactivar: boolean): void {
  try {
    if (desactivar) localStorage.setItem('agromet.analytics', '0');
    else localStorage.removeItem('agromet.analytics');
  } catch {
    // Sin almacenamiento local la preferencia dura sólo esta visita.
  }
  // Interruptor oficial de Google Analytics para el ID de medición.
  (window as unknown as Record<string, boolean>)[`ga-disable-${environment.firebaseConfig.measurementId}`] =
    desactivar;
  if (posthogActivo) {
    if (desactivar) posthog.opt_out_capturing();
    else posthog.opt_in_capturing();
  }
}
