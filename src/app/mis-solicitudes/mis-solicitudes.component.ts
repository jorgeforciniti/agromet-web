import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SolicitudesService, SolicitudUsuario } from '../services/solicitudes.service';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-mis-solicitudes',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './mis-solicitudes.component.html',
  styleUrl: './mis-solicitudes.component.css'
})
export class MisSolicitudesComponent implements OnInit {
  private solicitudesService = inject(SolicitudesService);
  private authService = inject(AuthService);

  solicitudes: SolicitudUsuario[] = [];
  cargando = false;
  error = '';
  usuarioLogueado = false;

  async ngOnInit() {
    await this.cargar();
  }

  async cargar() {
    this.error = '';
    this.cargando = true;

    try {
      const user = await this.authService.getCurrentUser();

      if (!user) {
        this.usuarioLogueado = false;
        this.error = 'Debe iniciar sesion para consultar sus solicitudes.';
        return;
      }

      this.usuarioLogueado = true;
      this.solicitudes = await this.solicitudesService.misSolicitudes();

    } catch (e: any) {
      this.error = e.message || 'No se pudieron cargar las solicitudes.';
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

  servicioTexto(s: SolicitudUsuario): string {
    if (s.servicio_categoria && s.servicio_nombre) {
      return `${s.servicio_categoria} - ${s.servicio_nombre}`;
    }

    if (s.servicio_nombre) {
      return s.servicio_nombre;
    }

    return 'No indicado';
  }
}