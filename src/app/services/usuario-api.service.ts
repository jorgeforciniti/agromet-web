import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';

/** API de usuarios (server/usuario/api, instalada en /services/usuarios). Mismo dominio en
 *  producción; en desarrollo pasa por proxy.conf.json. */
export const API_USUARIOS = '/services/usuarios';

interface RespuestaApi {
  ok: boolean;
  error?: string;
}

/**
 * Pedidos a la API de usuarios con el token de la sesión. Devuelve la respuesta si ok es true;
 * si no, lanza un Error con el mensaje del servidor (ya en castellano) para mostrarlo tal cual.
 */
@Injectable({ providedIn: 'root' })
export class UsuarioApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  get<T>(archivo: string): Promise<T> {
    return this.pedir<T>('GET', archivo);
  }

  post<T>(archivo: string, cuerpo: unknown): Promise<T> {
    return this.pedir<T>('POST', archivo, cuerpo);
  }

  private async pedir<T>(metodo: 'GET' | 'POST', archivo: string, cuerpo?: unknown): Promise<T> {
    const usuario = await this.auth.getCurrentUser();
    if (!usuario) {
      throw new Error('Iniciá sesión para usar esta función.');
    }
    const headers = new HttpHeaders({ Authorization: `Bearer ${await usuario.getIdToken()}` });
    try {
      const url = `${API_USUARIOS}/${archivo}`;
      const r = await firstValueFrom(metodo === 'GET'
        ? this.http.get<T & RespuestaApi>(url, { headers })
        : this.http.post<T & RespuestaApi>(url, cuerpo, { headers }));
      if (!r.ok) throw new Error(r.error || 'No se pudo completar la operación.');
      return r;
    } catch (e) {
      if (e instanceof HttpErrorResponse) {
        throw new Error((e.error as RespuestaApi | null)?.error || 'No se pudo conectar con el servidor. Volvé a intentar.');
      }
      throw e;
    }
  }
}
