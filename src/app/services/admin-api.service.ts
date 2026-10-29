import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';

/** API de administración (server/admin/api, instalada en /services/admin). */
export const API_ADMIN = '/services/admin';

export interface InformeCargado {
  id: number;
  titulo: string;
  archivo: string;
  creado: string;
  categoria: string;
}

export interface FiltroInformesAdmin {
  q?: string;
  categoria?: string;
  anio?: string;
  pagina?: number;
}

export interface LluviaEstacion9a9 {
  id: string;
  nombre: string;
  /** null: la estación no tiene registros en el período */
  mm: number | null;
  /** Horas cubiertas por los registros (24 = completo) */
  horas: number;
}

export interface Lluvias9a9 {
  desde: string;
  hasta: string;
  estaciones: LluviaEstacion9a9[];
}

interface RespuestaApi {
  ok: boolean;
  error?: string;
}

/** Pedidos a la API de administración con el token de la sesión (mismo esquema que UsuarioApiService). */
@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  /** 20 por página, del último cargado al primero. */
  informes(filtro: FiltroInformesAdmin = {}): Promise<{ informes: InformeCargado[]; total: number }> {
    let params = new HttpParams();
    for (const [clave, valor] of Object.entries(filtro)) {
      if (valor !== undefined && valor !== null && valor !== '') params = params.set(clave, String(valor));
    }
    return this.pedir('GET', 'pdfs.php', undefined, params);
  }

  cargarInforme(datos: { titulo: string; categoria: string; creado: string; archivo: File }): Promise<InformeCargado> {
    const form = new FormData();
    form.append('titulo', datos.titulo);
    form.append('categoria', datos.categoria);
    form.append('creado', datos.creado);
    form.append('archivo', datos.archivo, datos.archivo.name);
    return this.pedir<{ informe: InformeCargado }>('POST', 'pdfs.php', form).then(r => r.informe);
  }

  editarInforme(datos: Omit<InformeCargado, 'archivo'>): Promise<InformeCargado> {
    return this.pedir<{ informe: InformeCargado }>('POST', 'pdf_editar.php', datos).then(r => r.informe);
  }

  /** Lo saca de /informes; el archivo queda en PDFS/_despublicados/ del servidor. */
  despublicarInforme(id: number): Promise<void> {
    return this.pedir('POST', 'pdf_borrar.php', { id }).then(() => undefined);
  }

  lluvias9a9(fecha: string): Promise<Lluvias9a9> {
    return this.pedir<Lluvias9a9>('GET', 'lluvias9a9.php', undefined, new HttpParams().set('fecha', fecha));
  }

  private async pedir<T>(metodo: 'GET' | 'POST', archivo: string, cuerpo?: unknown, params?: HttpParams): Promise<T> {
    const usuario = await this.auth.getCurrentUser();
    if (!usuario) {
      throw new Error('Iniciá sesión para usar la administración.');
    }
    const headers = new HttpHeaders({ Authorization: `Bearer ${await usuario.getIdToken()}` });
    try {
      const url = `${API_ADMIN}/${archivo}`;
      const r = await firstValueFrom(metodo === 'GET'
        ? this.http.get<T & RespuestaApi>(url, { headers, params })
        : this.http.post<T & RespuestaApi>(url, cuerpo, { headers }));
      if (!r.ok) throw new Error(r.error || 'No se pudo completar la operación.');
      return r;
    } catch (e) {
      if (e instanceof HttpErrorResponse) {
        // Sin la API instalada, el servidor responde la página del sitio (HTML) en vez de JSON
        const texto = (e.error as { text?: unknown } | null)?.text;
        if (e.status === 404 || (typeof texto === 'string' && texto.trimStart().startsWith('<'))) {
          throw new Error('La administración todavía no está instalada en el servidor (falta /services/admin).');
        }
        throw new Error((e.error as RespuestaApi | null)?.error || 'No se pudo conectar con el servidor. Volvé a intentar.');
      }
      throw e;
    }
  }
}
