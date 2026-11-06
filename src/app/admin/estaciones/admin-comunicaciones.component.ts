import { Component, EventEmitter, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AdminApiService, Comunicaciones, EstacionComunicacion, EstadoEstacion, EventoComunicacion } from '../../services/admin-api.service';
import { hace } from './tiempo';

const CADA_MS = 10_000;

const TIPOS: Record<number, string> = {
  0: 'Consulta de hora',
  2: 'Ya existía',
  3: 'Trama corta con error',
  5: 'Comando enviado desde la web',
  7: 'Error de CRC',
  8: 'Error de recepción',
  9: 'Registro correcto'
};

/** Visor de comunicaciones de las estaciones UDP (antes /web/visor, sólo en la red interna). */
@Component({
  selector: 'app-admin-comunicaciones',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './admin-comunicaciones.component.html',
  styleUrls: ['./estaciones.css', './admin-comunicaciones.component.css']
})
export class AdminComunicacionesComponent implements OnInit, OnDestroy {
  private readonly api = inject(AdminApiService);

  /** Pide abrir el control de esa estación (id). */
  @Output() controlar = new EventEmitter<string>();

  readonly hace = hace;
  readonly nombresEstado: Record<EstadoEstacion, string> = { ok: 'Reporta', retraso: 'Retraso', sin: 'Sin reporte' };

  datos: Comunicaciones | null = null;
  error = '';
  actualizado: Date | null = null;
  cargando = false;

  filtroEstado: EstadoEstacion | '' = '';
  buscar = '';
  soloErrores = false;
  sinConsultasHora = true;

  private temporizador?: ReturnType<typeof setTimeout>;
  private destruido = false;
  private readonly alVolver = () => {
    if (document.visibilityState === 'visible') this.actualizar();
  };

  ngOnInit(): void {
    this.actualizar();
    document.addEventListener('visibilitychange', this.alVolver);
  }

  ngOnDestroy(): void {
    this.destruido = true;
    clearTimeout(this.temporizador);
    document.removeEventListener('visibilitychange', this.alVolver);
  }

  /** Lee y vuelve a programar la lectura; con la pestaña del navegador oculta no se consulta. */
  async actualizar(): Promise<void> {
    clearTimeout(this.temporizador);
    if (this.cargando || this.destruido) return;
    this.cargando = true;
    try {
      this.datos = await this.api.comunicaciones();
      this.actualizado = new Date();
      this.error = '';
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.cargando = false;
      if (!this.destruido && document.visibilityState === 'visible') this.temporizador = setTimeout(() => this.actualizar(), CADA_MS);
    }
  }

  filtrarEstado(estado: EstadoEstacion): void {
    this.filtroEstado = this.filtroEstado === estado ? '' : estado;
  }

  get estaciones(): EstacionComunicacion[] {
    const q = this.buscar.trim().toLowerCase();
    return (this.datos?.estaciones ?? [])
      .filter(e => (!this.filtroEstado || e.estado === this.filtroEstado)
        && (!q || e.nombre.toLowerCase().includes(q) || e.id.includes(q)))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
  }

  get eventos(): EventoComunicacion[] {
    return (this.datos?.eventos ?? []).filter(e =>
      !(this.sinConsultasHora && e.error_c === 0) && !(this.soloErrores && [0, 2, 5, 9].includes(e.error_c)));
  }

  /** "Registro correcto: 120 · Error de CRC: 3" */
  get ultimaHora(): string {
    const tipos = this.datos?.por_tipo ?? [];
    return tipos.length ? tipos.map(t => `${TIPOS[t.error_c] ?? 'Código ' + t.error_c}: ${t.n}`).join(' · ') : 'sin eventos';
  }

  claseEvento(e: EventoComunicacion): string {
    return e.error_c === 9 ? 'ok' : e.error_c === 0 || e.error_c === 5 ? 'info' : e.error_c === 2 ? 'retraso' : 'sin';
  }

  /** dd/mm hh:mm a partir de AAAA-MM-DD HH:MM:SS */
  diaHora(fecha: string): string {
    return `${fecha.slice(8, 10)}/${fecha.slice(5, 7)} ${fecha.slice(11, 16)}`;
  }
}
