import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';

export interface ServicioAgromet {
  id: number;
  nombre: string;
  categoria: string;
  descripcion: string;
  interno: number;
  externo: number;
  arancelado: number;
  precio_base: number | null;
  tiempo_estimado_horas: number | null;
  requiere_periodo: number;
  requiere_localidad: number;
}

export interface CrearSolicitudPayload {
  origen: string;
  tipo_solicitud: string;

  solicitante_nombre: string;
  solicitante_institucion?: string;
  solicitante_cuit?: string;
  solicitante_condicion_iva?: string;
  solicitante_area?: string;
  solicitante_email: string;
  solicitante_telefono?: string;

  servicio_id?: string | number;
  localidad_zona?: string;
  fecha_desde?: string;
  fecha_hasta?: string;

  descripcion: string;
  finalidad?: string;
  prioridad?: string;
}

export interface SolicitudUsuario {
  id: number;
  codigo_solicitud: string;
  fecha_solicitud: string;
  canal: string;
  origen: string;
  tipo_solicitud: string;
  solicitante_nombre: string;
  solicitante_institucion: string;
  solicitante_email: string;
  localidad_zona: string;
  fecha_desde: string;
  fecha_hasta: string;
  descripcion: string;
  finalidad: string;
  prioridad: string;
  estado: string;
  fecha_inicio: string | null;
  fecha_finalizacion: string | null;
  fecha_entrega: string | null;
  servicio_nombre: string | null;
  servicio_categoria: string | null;
}

export interface MovimientoSolicitud {
  fecha_movimiento: string;
  estado_anterior: string | null;
  estado_nuevo: string | null;
  comentario: string;
}

export interface DetalleSolicitudUsuario {
  solicitud: SolicitudUsuario & {
    solicitante_cuit: string;
    solicitante_condicion_iva: string;
    solicitante_area: string;
    solicitante_telefono: string;
    servicio_descripcion: string | null;
    respuesta_entregada: string | null;
    estado_pago: string;
    instrucciones_pago: string | null;
    fecha_limite_pago: string | null;
  };
  movimientos: MovimientoSolicitud[];
  adjuntos: AdjuntoSolicitudUsuario[];
}

export interface AdjuntoSolicitudUsuario {
  id: number;
  tipo: string;
  nombre_original: string;
  extension: string;
  tamanio_bytes: number;
  descripcion: string;
  fecha_subida: string;
}

export interface ClienteAgromet {
  id: number;
  nombre: string;
  institucion: string;
  cuit: string;
  condicion_iva: string;
  email: string;
  telefono: string;
  area: string;
}

@Injectable({
  providedIn: 'root'
})
export class SolicitudesService {
  private apiBase = 'https://agromet.eeaoc.gob.ar/solicitudes/api';

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) { }

  async listarServicios(): Promise<ServicioAgromet[]> {
    const json: any = await firstValueFrom(
      this.http.get(`${this.apiBase}/listar_servicios.php`)
    );

    if (!json.ok) {
      throw new Error(json.error || 'No se pudieron cargar los servicios.');
    }

    return json.servicios;
  }

  async crearSolicitud(payload: CrearSolicitudPayload): Promise<any> {
    const user = await this.authService.getCurrentUser();

    const headers: any = {
      'Content-Type': 'application/json'
    };

    if (user) {
      const token = await user.getIdToken();
      headers.Authorization = `Bearer ${token}`;
    }

    const json: any = await firstValueFrom(
      this.http.post(`${this.apiBase}/crear_solicitud.php`, payload, { headers })
    );

    if (!json.ok) {
      throw new Error(json.error || 'No se pudo registrar la solicitud.');
    }

    return json;
  }

  async misSolicitudes(): Promise<SolicitudUsuario[]> {
    const user = await this.authService.getCurrentUser();

    if (!user) {
      throw new Error('Debe iniciar sesion para consultar sus solicitudes.');
    }

    const token = await user.getIdToken();

    const json: any = await firstValueFrom(
      this.http.post(
        `${this.apiBase}/mis_solicitudes.php`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      )
    );

    if (!json.ok) {
      throw new Error(json.error || 'No se pudieron consultar las solicitudes.');
    }

    return json.solicitudes;
  }

  
  async miCliente(): Promise<ClienteAgromet | null> {
    const user = await this.authService.getCurrentUser();

    if (!user) {
      return null;
    }

    const token = await user.getIdToken();

    const res = await fetch(`${this.apiBase}/mi_cliente.php`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const json = await res.json();

    if (!json.ok) {
      return null;
    }

    return json.cliente;
  }

  async detalleMiSolicitud(id: number): Promise<DetalleSolicitudUsuario> {
    const user = await this.authService.getCurrentUser();

    if (!user) {
      throw new Error('Debe iniciar sesion para consultar la solicitud.');
    }

    const token = await user.getIdToken();

    const json: any = await firstValueFrom(
      this.http.post(
        `${this.apiBase}/mi_solicitud_detalle.php`,
        { id },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      )
    );

    if (!json.ok) {
      throw new Error(json.error || 'No se pudo consultar la solicitud.');
    }

    return {
      solicitud: json.solicitud,
      movimientos: json.movimientos,
      adjuntos: json.adjuntos || []
    };
  }

  async descargarMiAdjunto(id: number, nombre: string): Promise<void> {
    const user = await this.authService.getCurrentUser();

    if (!user) {
      throw new Error('Debe iniciar sesion para descargar el archivo.');
    }

    const token = await user.getIdToken();

    const res = await fetch(`${this.apiBase}/mi_adjunto_descargar.php?id=${id}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!res.ok) {
      throw new Error('No se pudo descargar el archivo.');
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();

    a.remove();
    window.URL.revokeObjectURL(url);
  }

  async subirComprobantePago(solicitudId: number, archivo: File, descripcion: string): Promise<any> {
    const user = await this.authService.getCurrentUser();

    if (!user) {
      throw new Error('Debe iniciar sesion para subir el comprobante.');
    }

    const token = await user.getIdToken();

    const formData = new FormData();
    formData.append('solicitud_id', String(solicitudId));
    formData.append('archivo', archivo);
    formData.append('descripcion', descripcion || '');

    const res = await fetch(`${this.apiBase}/mi_comprobante_subir.php`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });

    const json = await res.json();

    if (!json.ok) {
      throw new Error(json.error || 'No se pudo subir el comprobante.');
    }

    return json;
  }

}