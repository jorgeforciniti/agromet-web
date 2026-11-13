import { Component, Input, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AdminApiService, BajaSensor, SensoresBaja } from '../../services/admin-api.service';
import { fechaIso } from '../../shared/enlace-consulta';
import { NOMBRE_VARIABLE, VARIABLES_SENSOR, VariableSensor } from '../../shared/depuracion';
import { PropuestaBaja } from './admin-control-datos.component';

/**
 * Sensores dados de baja (depuración de datos): la Sección marca qué sensor da valores erróneos y
 * desde cuándo, y todo el sitio deja de usar esos valores (shared/depuracion.ts). Cuando se arregla,
 * se cierra la baja con el último día malo; borrar es sólo para lo cargado por error.
 */
@Component({
  selector: 'app-admin-sensores',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './admin-sensores.component.html',
  styleUrls: ['./estaciones.css', './admin-control.component.css', './admin-sensores.component.css']
})
export class AdminSensoresComponent implements OnInit {
  private readonly api = inject(AdminApiService);

  /** Baja propuesta por el control de datos: precarga el formulario (objeto nuevo en cada pedido) */
  @Input() set propuesta(p: PropuestaBaja | null) {
    if (!p) return;
    this.estacion = p.estacion;
    this.variable = p.variable;
    this.desde = p.desde;
    this.hasta = '';
    this.motivo = p.motivo.slice(0, 255);
    this.limpiarAvisos();
    this.mensaje = 'Revisá los datos y confirmá con «Dar de baja».';
  }

  readonly variables = VARIABLES_SENSOR;
  readonly nombreVariable = NOMBRE_VARIABLE;
  readonly hoy = fechaIso(new Date());

  datos: SensoresBaja | null = null;
  cargando = false;
  errorCarga = '';

  estacion = '';
  variable: VariableSensor = 'humedad';
  desde = this.hoy;
  hasta = '';
  motivo = '';

  enviando = false;
  ocupado: number | null = null;
  mensaje = '';
  error = '';

  ngOnInit(): void {
    this.leer();
  }

  async leer(): Promise<void> {
    if (this.cargando) return;
    this.cargando = true;
    try {
      this.datos = await this.api.sensoresBaja();
      this.errorCarga = '';
      if (!this.datos.estaciones.some(e => e.id === this.estacion)) this.estacion = this.datos.estaciones[0]?.id ?? '';
    } catch (e) {
      this.errorCarga = (e as Error).message;
    } finally {
      this.cargando = false;
    }
  }

  /** Bajas que siguen vigentes hoy (sin fecha hasta o con una futura) */
  get vigentes(): BajaSensor[] {
    return this.datos?.bajas.filter(b => b.hasta === null || b.hasta >= this.hoy) ?? [];
  }

  get cerradas(): BajaSensor[] {
    return this.datos?.bajas.filter(b => b.hasta !== null && b.hasta < this.hoy) ?? [];
  }

  get formularioValido(): boolean {
    return !!this.estacion && !!this.desde && !!this.motivo.trim() && (!this.hasta || this.hasta >= this.desde);
  }

  async darDeBaja(): Promise<void> {
    if (!this.formularioValido || this.enviando) return;
    this.enviando = true;
    this.limpiarAvisos();
    try {
      this.mensaje = await this.api.darDeBaja({
        estacion: this.estacion, variable: this.variable, desde: this.desde, hasta: this.hasta || null,
        motivo: this.motivo.trim()
      });
      this.motivo = '';
      this.hasta = '';
      await this.leer();
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.enviando = false;
    }
  }

  /** Cierra la baja: el sensor volvió a andar bien después de esa fecha */
  async cerrar(b: BajaSensor): Promise<void> {
    const ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    const hasta = prompt(`Último día con datos erróneos de ${this.nombreVariable[b.variable].toLowerCase()} en `
      + `${b.nombre ?? b.estacion} (AAAA-MM-DD):`, fechaIso(ayer));
    if (hasta === null) return;
    await this.editar(b, { desde: b.desde, hasta: hasta.trim(), motivo: b.motivo });
  }

  /** Vuelve a dejarla sin fecha de fin */
  async reabrir(b: BajaSensor): Promise<void> {
    await this.editar(b, { desde: b.desde, hasta: null, motivo: b.motivo });
  }

  async borrar(b: BajaSensor): Promise<void> {
    if (!confirm(`¿Borrar la baja de ${this.nombreVariable[b.variable].toLowerCase()} de ${b.nombre ?? b.estacion}? `
      + 'Usalo sólo si se cargó por error: si el sensor se arregló, conviene cerrarla para que quede el historial.')) return;
    this.ocupado = b.id;
    this.limpiarAvisos();
    try {
      this.mensaje = await this.api.borrarBaja(b.id);
      await this.leer();
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.ocupado = null;
    }
  }

  private async editar(b: BajaSensor, datos: { desde: string; hasta: string | null; motivo: string }): Promise<void> {
    this.ocupado = b.id;
    this.limpiarAvisos();
    try {
      this.mensaje = await this.api.editarBaja(b.id, datos);
      await this.leer();
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.ocupado = null;
    }
  }

  private limpiarAvisos(): void {
    this.mensaje = '';
    this.error = '';
  }

  /** dd/mm/aaaa a partir de AAAA-MM-DD */
  fecha(iso: string | null): string {
    return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—';
  }

  porId(_: number, b: BajaSensor): number {
    return b.id;
  }
}
