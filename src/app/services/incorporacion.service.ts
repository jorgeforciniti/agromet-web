import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_ADMIN } from './admin-api.service';

/** Correo de la Sección (el del pie del sitio), para cuando el envío falla */
export const CORREO_SECCION = 'jorgeforciniti@eeaoc.org.ar';

export interface DatosIncorporacion {
  nombre: string;
  email: string;
  telefono: string;
  /** Localidad o ubicación de la estación */
  ubicacion: string;
  /** Marca y modelo */
  estacion: string;
  internet: '' | 'si' | 'no' | 'no_se';
  comentarios: string;
  /** Trampa para robots: siempre vacío */
  sitio_web: string;
}

/**
 * Pedido público para sumar una estación a la red. Va sin token a incorporaciones.php de la API de
 * administración, que lo guarda (pestaña «Sumar estaciones» de /admin) y avisa por correo.
 */
@Injectable({ providedIn: 'root' })
export class IncorporacionService {
  private readonly http = inject(HttpClient);

  async enviar(datos: DatosIncorporacion): Promise<void> {
    try {
      const r = await firstValueFrom(this.http.post<{ ok: boolean; error?: string }>(`${API_ADMIN}/incorporaciones.php`, datos));
      if (!r.ok) throw new Error(r.error || 'No se pudo enviar el pedido.');
    } catch (e) {
      if (e instanceof HttpErrorResponse) {
        const error = (e.error as { error?: unknown } | null)?.error;
        throw new Error(typeof error === 'string' && error
          ? error
          : `No se pudo enviar el pedido. Volvé a intentar o escribinos a ${CORREO_SECCION}.`);
      }
      throw e;
    }
  }
}
