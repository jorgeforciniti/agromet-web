import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AdminApiService, ConsultasApis } from '../../services/admin-api.service';

/** Para quién es cada feed de /api/ (ver server/api/LEEME.md) */
const DESTINO: Record<string, string> = {
  smn: 'Servicio Meteorológico Nacional',
  'smn-anterior': 'Servicio Meteorológico Nacional (versión anterior)',
  'smn-nuevo': 'Servicio Meteorológico Nacional (versión nueva)',
  coviar: 'COVIAR',
  citrusvil: 'Citrusvil',
  conicet_BB: 'CONICET',
  io_valles: 'Estaciones de los valles',
  api_el_charco: 'El Charco',
  io_estaciones: 'Lista de estaciones (versión vieja)'
};

/** Cantidad de consultas de los feeds para terceros (api_consultas, la llenan los PHP de /api/). */
@Component({
  selector: 'app-admin-consultas-api',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './admin-consultas-api.component.html',
  styleUrls: ['./estaciones.css', './admin-consultas-api.component.css']
})
export class AdminConsultasApiComponent implements OnInit {
  private readonly api = inject(AdminApiService);

  readonly periodos = [7, 30, 90, 365];
  dias = 30;
  datos: ConsultasApis | null = null;
  cargando = false;
  error = '';

  ngOnInit(): void {
    this.leer();
  }

  async leer(): Promise<void> {
    if (this.cargando) return;
    this.cargando = true;
    try {
      this.datos = await this.api.consultasApis(this.dias);
      this.error = '';
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.cargando = false;
    }
  }

  destino(api: string): string {
    return DESTINO[api] ?? '';
  }

  /** Promedio por día del período (cuenta también los días sin consultas) */
  promedio(total: number): number {
    return total / this.dias;
  }

  /** Consultas del día más reciente con datos y su fecha */
  ultimoDia(porDia: { dia: string; consultas: number }[]): { dia: string; consultas: number } | null {
    return porDia.length ? porDia[porDia.length - 1] : null;
  }

  /** Alto relativo de cada día (0 a 100), para la mini serie */
  barras(porDia: { dia: string; consultas: number }[]): { dia: string; consultas: number; alto: number }[] {
    const max = Math.max(1, ...porDia.map(d => d.consultas));
    return porDia.map(d => ({ ...d, alto: Math.round(d.consultas / max * 100) }));
  }
}
