import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  AdjuntoSolicitudUsuario,
  DetalleSolicitudUsuario,
  MovimientoSolicitud,
  SolicitudesService,
  SolicitudUsuario
} from '../services/solicitudes.service';


@Component({
  selector: 'app-mi-solicitud-detalle',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './mi-solicitud-detalle.component.html',
  styleUrl: './mi-solicitud-detalle.component.css'
})

export class MiSolicitudDetalleComponent implements OnInit {
  adjuntos: AdjuntoSolicitudUsuario[] = [];
  private route = inject(ActivatedRoute);
  private solicitudesService = inject(SolicitudesService);
  archivoComprobante: File | null = null;
  descripcionComprobante = '';
  subiendoComprobante = false;
  mensajeComprobante = '';

  cargando = false;
  error = '';

  solicitud: (SolicitudUsuario & {
    solicitante_area: string;
    solicitante_telefono: string;
    solicitante_cuit: string;
    solicitante_condicion_iva: string;
    servicio_descripcion: string | null;
    respuesta_entregada: string | null;
    estado_pago: string;
    instrucciones_pago: string | null;
    fecha_limite_pago: string | null;
  }) | null = null;

  movimientos: MovimientoSolicitud[] = [];

  async ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));

    if (!id || isNaN(id)) {
      this.error = 'ID de solicitud invalido.';
      return;
    }

    await this.cargarDetalle(id);
  }

  async cargarDetalle(id: number) {
    this.error = '';
    this.cargando = true;

    try {
      const detalle: DetalleSolicitudUsuario = await this.solicitudesService.detalleMiSolicitud(id);

      this.solicitud = detalle.solicitud;
      this.movimientos = detalle.movimientos;
      this.adjuntos = detalle.adjuntos || [];
    } catch (e: any) {
      this.error = e.message || 'No se pudo cargar el detalle de la solicitud.';
    } finally {
      this.cargando = false;
    }
  }

  estadoTexto(estado: string): string {
    const textos: Record<string, string> = {
      recibida: 'Recibida',
      en_revision: 'En revision',
      pendiente_autorizacion: 'Pendiente de autorizacion',
      pendiente_pago: 'Pendiente de pago',
      en_elaboracion: 'En elaboracion',
      enviada_contaduria: 'Enviada a Contaduría',
      finalizada: 'Finalizada',
      entregada: 'Entregada',
      rechazada: 'Rechazada',
      cancelada: 'Cancelada'
    };

    return textos[estado] || estado;
  }

  servicioTexto(): string {
    if (!this.solicitud) {
      return '';
    }

    if (this.solicitud.servicio_categoria && this.solicitud.servicio_nombre) {
      return `${this.solicitud.servicio_categoria} - ${this.solicitud.servicio_nombre}`;
    }

    if (this.solicitud.servicio_nombre) {
      return this.solicitud.servicio_nombre;
    }

    return 'No indicado';
  }

  async descargarAdjunto(a: AdjuntoSolicitudUsuario) {
    try {
      await this.solicitudesService.descargarMiAdjunto(a.id, a.nombre_original);
    } catch (e: any) {
      this.error = e.message || 'No se pudo descargar el archivo.';
    }
  }

  onArchivoComprobanteSeleccionado(event: Event) {
    const input = event.target as HTMLInputElement;

    if (!input.files || input.files.length === 0) {
      this.archivoComprobante = null;
      return;
    }

    this.archivoComprobante = input.files[0];
  }

  puedeSubirComprobante(): boolean {
    if (!this.solicitud) {
      return false;
    }

    return (
      this.solicitud.estado_pago === 'pendiente' ||
      this.solicitud.estado === 'pendiente_pago' ||
      this.solicitud.estado_pago === 'rechazado'
    );
  }

  async subirComprobante() {
    if (!this.solicitud) {
      return;
    }

    if (!this.archivoComprobante) {
      this.error = 'Seleccione un archivo para subir.';
      return;
    }

    this.error = '';
    this.mensajeComprobante = '';
    this.subiendoComprobante = true;

    try {
      await this.solicitudesService.subirComprobantePago(
        this.solicitud.id,
        this.archivoComprobante,
        this.descripcionComprobante
      );

      this.mensajeComprobante = 'Comprobante cargado correctamente.';
      this.archivoComprobante = null;
      this.descripcionComprobante = '';

      await this.cargarDetalle(this.solicitud.id);

    } catch (e: any) {
      this.error = e.message || 'No se pudo subir el comprobante.';
    } finally {
      this.subiendoComprobante = false;
    }
  }

  esDocumentoPrincipal(tipo: string): boolean {
    return ['informe_final', 'factura', 'recibo'].includes(tipo);
  }

  documentosPrincipales(): AdjuntoSolicitudUsuario[] {
    return this.adjuntos.filter((a) => this.esDocumentoPrincipal(a.tipo));
  }

  otrosAdjuntosVisibles(): AdjuntoSolicitudUsuario[] {
    return this.adjuntos.filter((a) => !this.esDocumentoPrincipal(a.tipo));
  }

  tipoAdjuntoTexto(tipo: string): string {
    const textos: Record<string, string> = {
      pedido: 'Pedido',
      comprobante_pago: 'Comprobante de pago',
      factura: 'Factura',
      recibo: 'Recibo',
      informe_final: 'Informe final',
      memo: 'Memo',
      nota: 'Nota',
      planilla: 'Planilla',
      otro: 'Otro'
    };

    return textos[tipo] || tipo;
  }
}