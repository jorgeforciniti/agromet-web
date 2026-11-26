import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { AdminApiService, PedidoIncorporacion } from '../../services/admin-api.service';

const INTERNET: Record<PedidoIncorporacion['internet'], string> = { si: 'Sí', no: 'No', no_se: 'No sabe', '': '—' };

/** Pedidos de productores para sumar su estación a la red (página pública /suma-tu-estacion). */
@Component({
  selector: 'app-admin-incorporaciones',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './admin-incorporaciones.component.html',
  styleUrls: ['./estaciones.css', './admin-incorporaciones.component.css']
})
export class AdminIncorporacionesComponent implements OnInit {
  private readonly api = inject(AdminApiService);

  pedidos: PedidoIncorporacion[] = [];
  cargando = false;
  error = '';

  ngOnInit(): void {
    this.leer();
  }

  get pendientes(): number {
    return this.pedidos.filter(p => !p.atendido).length;
  }

  async leer(): Promise<void> {
    if (this.cargando) return;
    this.cargando = true;
    try {
      this.pedidos = await this.api.incorporaciones();
      this.error = '';
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.cargando = false;
    }
  }

  async marcar(p: PedidoIncorporacion, atendido: boolean): Promise<void> {
    try {
      await this.api.marcarIncorporacion(p.id, atendido);
      p.atendido = atendido;
      this.error = '';
    } catch (e) {
      this.error = (e as Error).message;
    }
  }

  internet(valor: PedidoIncorporacion['internet']): string {
    return INTERNET[valor] ?? '—';
  }
}
