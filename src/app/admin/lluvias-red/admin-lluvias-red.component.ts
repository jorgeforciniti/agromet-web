import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { AdminApiService, LocalidadesRr } from '../../services/admin-api.service';
import { CargaRapidaRrComponent } from './carga-rapida-rr.component';
import { PlanillaRrComponent } from './planilla-rr.component';
import { LocalidadesRrComponent } from './localidades-rr.component';

type Vista = 'carga' | 'planilla' | 'localidades';

/**
 * Red pluviométrica: carga de lluvias diarias y totales mensuales, y alta de localidades
 * (server/admin/api/lluvias_*.php). Reemplaza el programa de Visual FoxPro (ver
 * docs/admin-lluvias-red-diseno.md).
 */
@Component({
  selector: 'app-admin-lluvias-red',
  standalone: true,
  imports: [CommonModule, MatIconModule, CargaRapidaRrComponent, PlanillaRrComponent, LocalidadesRrComponent],
  templateUrl: './admin-lluvias-red.component.html',
  styleUrls: ['../estaciones/estaciones.css', './lluvias-red.css']
})
export class AdminLluviasRedComponent implements OnInit {
  private readonly api = inject(AdminApiService);

  vista: Vista = 'carga';
  datos: LocalidadesRr | null = null;
  error = '';
  /** Localidad que se abre en la planilla (Cargar historia) */
  historia: number | null = null;

  ngOnInit(): void {
    this.leer();
  }

  async leer(): Promise<void> {
    this.error = '';
    try {
      this.datos = await this.api.localidadesRr();
    } catch (e) {
      this.error = (e as Error).message;
    }
  }

  async abrirHistoria(id: number): Promise<void> {
    // Una localidad recién dada de alta puede no estar todavía en la lista
    if (!this.datos?.localidades.some(l => l.id === id)) await this.leer();
    this.historia = id;
    this.vista = 'planilla';
  }
}
