import { Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AdminApiService, AlertaDatos, ControlDatos } from '../../services/admin-api.service';
import { A_CONFIRMAR, NOMBRE_VARIABLE, VariableSensor } from '../../shared/depuracion';
import { formatDecimal } from '../../pipes/valor.pipe';

/** Baja a precargar en la pestaña «Sensores dados de baja» */
export interface PropuestaBaja {
  estacion: string;
  variable: VariableSensor;
  desde: string;
  motivo: string;
}

/** Unidad del valor de ejemplo según la regla */
const UNIDAD: Record<VariableSensor, string> = {
  temperatura: '°C', humedad: '%', viento: 'km/h', lluvia: 'mm', radiacion: 'W/m²', presion: 'hPa', hoja: 'h'
};

/**
 * Control de datos (depuración, etapa 2): sensores que parecen fallar en los últimos días, según
 * las reglas de control_datos.php. No cambia nada: cada alerta tiene un botón que precarga la baja.
 */
@Component({
  selector: 'app-admin-control-datos',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './admin-control-datos.component.html',
  styleUrls: ['./estaciones.css', './admin-control-datos.component.css']
})
export class AdminControlDatosComponent implements OnInit {
  private readonly api = inject(AdminApiService);

  /** Pide abrir la pestaña de sensores con la baja precargada */
  @Output() darDeBaja = new EventEmitter<PropuestaBaja>();

  readonly nombreVariable = NOMBRE_VARIABLE;
  readonly opcionesDias = [7, 14, 31];
  dias = 14;
  verDeBaja = false;

  datos: ControlDatos | null = null;
  cargando = false;
  error = '';

  ngOnInit(): void {
    this.revisar();
  }

  async revisar(): Promise<void> {
    if (this.cargando) return;
    this.cargando = true;
    try {
      this.datos = await this.api.controlDatos(this.dias);
      this.error = '';
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.cargando = false;
    }
  }

  get alertas(): AlertaDatos[] {
    return this.datos?.alertas.filter(a => this.verDeBaja || !a.de_baja) ?? [];
  }

  get yaDeBaja(): number {
    return this.datos?.alertas.filter(a => a.de_baja).length ?? 0;
  }

  proponer(a: AlertaDatos): void {
    this.darDeBaja.emit({
      estacion: a.estacion,
      variable: a.variable,
      desde: a.inicio,
      // Una lluvia aislada puede ser real: se oculta como dato a confirmar, no como falla
      motivo: `${a.regla === 'lluvia_aislada' ? A_CONFIRMAR + ' ' : ''}${a.problema}: ${a.dias} de ${this.datos?.dias ?? a.dias} días; falla desde el ${this.fechaLarga(a.inicio)}`
        + (a.inicio_limite ? ' o antes' : '') + ` (control del ${this.fechaLarga(this.datos?.hasta ?? a.ultima)})`
    });
  }

  /** «1 % (vecinas 46 %)» */
  ejemplo(a: AlertaDatos): string {
    const u = UNIDAD[a.variable] ?? '';
    const valor = `${formatDecimal(a.ejemplo.valor, a.variable === 'humedad' ? 0 : 1)} ${u}`;
    return a.ejemplo.vecinas === null ? valor
      : `${valor} (vecinas ${formatDecimal(a.ejemplo.vecinas, a.variable === 'humedad' ? 0 : 1)} ${u})`;
  }

  /** dd/mm a partir de AAAA-MM-DD */
  fecha(iso: string): string {
    return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  }

  /** dd/mm/aaaa a partir de AAAA-MM-DD */
  fechaLarga(iso: string): string {
    return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  }

  porClave(_: number, a: AlertaDatos): string {
    return `${a.estacion}|${a.regla}|${a.variable}`;
  }
}
