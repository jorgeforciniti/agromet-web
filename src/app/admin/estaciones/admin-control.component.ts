import { Component, Input, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AdminApiService, ComandoEstacion, ControlEstaciones, EstacionControl } from '../../services/admin-api.service';
import { hace } from './tiempo';

const CADA_MS = 30_000;
const SIN_FECHA = '00/00/0000:00';
const FORMATO_FECHA = /^(\d\d\/\d\d\/\d{4}:\d\d|00\/00\/0000:00)$/;

/**
 * Pedidos de "Actualizar fecha y hora" y "Borrar memoria" (antes control.php del visor). Quedan
 * pendientes y UDPAdmin los envía cuando la estación transmite su próxima trama.
 */
@Component({
  selector: 'app-admin-control',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './admin-control.component.html',
  styleUrls: ['./estaciones.css', './admin-control.component.css']
})
export class AdminControlComponent implements OnInit, OnDestroy {
  private readonly api = inject(AdminApiService);

  /** Estación a elegir al abrir (desde el visor de comunicaciones). */
  @Input() set estacion(pedido: { id: string } | null) {
    if (!pedido) return;
    this.estacionId = pedido.id;
    this.alCambiarEstacion();
  }

  readonly hace = hace;
  readonly nombresComando: Record<ComandoEstacion, string> = { hora: 'Actualizar fecha y hora', borrar: 'Borrar memoria' };

  datos: ControlEstaciones | null = null;
  cargando = false;
  errorCarga = '';

  estacionId = '';
  fechaRef = SIN_FECHA;
  avisoAhora = false;
  confirmar = '';

  enviando: ComandoEstacion | null = null;
  mensaje = '';
  error = '';
  cancelando: number | null = null;

  private temporizador?: ReturnType<typeof setTimeout>;
  private destruido = false;

  ngOnInit(): void {
    this.leer();
  }

  ngOnDestroy(): void {
    this.destruido = true;
    clearTimeout(this.temporizador);
  }

  /** Relee estaciones y pedidos (los pendientes pasan a enviados solos). */
  async leer(): Promise<void> {
    clearTimeout(this.temporizador);
    if (this.cargando || this.destruido) return;
    // Con la pestaña del navegador oculta no se consulta
    if (this.datos && document.visibilityState === 'hidden') return this.programar();
    this.cargando = true;
    try {
      const primera = !this.datos;
      this.datos = await this.api.controlEstaciones();
      this.errorCarga = '';
      if (!this.seleccionada) this.estacionId = this.datos.estaciones[0]?.id ?? '';
      if (primera) this.usarUltimaFecha();
    } catch (e) {
      this.errorCarga = (e as Error).message;
    } finally {
      this.cargando = false;
      this.programar();
    }
  }

  private programar(): void {
    if (!this.destruido) this.temporizador = setTimeout(() => this.leer(), CADA_MS);
  }

  get seleccionada(): EstacionControl | undefined {
    return this.datos?.estaciones.find(e => e.id === this.estacionId);
  }

  /** Atraso del último dato guardado; con más de 30 min, borrar la memoria puede perder datos. */
  get atraso(): number | null {
    const m = this.seleccionada?.min_dato ?? null;
    return m !== null && m > 30 ? m : null;
  }

  alCambiarEstacion(): void {
    this.usarUltimaFecha();
    this.confirmar = '';
    this.mensaje = '';
    this.error = '';
  }

  usarUltimaFecha(): void {
    this.fechaRef = this.seleccionada?.fecha_i || SIN_FECHA;
    this.avisoAhora = false;
  }

  usarAhora(): void {
    if (!this.datos) return;
    this.fechaRef = this.datos.ahora;
    this.avisoAhora = true;
  }

  get fechaValida(): boolean {
    return FORMATO_FECHA.test(this.fechaRef.trim());
  }

  async pedir(comando: ComandoEstacion): Promise<void> {
    const est = this.seleccionada;
    if (!est || this.enviando) return;
    if (comando === 'borrar' && !confirm(`¿Pedir el borrado de la memoria de ${est.nombre} (${est.id})? No se puede deshacer.`)) return;
    this.enviando = comando;
    this.mensaje = '';
    this.error = '';
    try {
      this.mensaje = await this.api.pedirComando(comando === 'hora'
        ? { estacion: est.id, comando, fecha_ref: this.fechaRef.trim() }
        : { estacion: est.id, comando, confirmar: this.confirmar.trim() });
      this.confirmar = '';
      this.leer();
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.enviando = null;
    }
  }

  async cancelar(id: number): Promise<void> {
    if (this.cancelando) return;
    this.cancelando = id;
    this.mensaje = '';
    this.error = '';
    try {
      this.mensaje = await this.api.cancelarComando(id);
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.cancelando = null;
      this.leer();
    }
  }

  /** Al releer, las opciones se conservan y el select no vuelve a la primera estación */
  porId(_: number, e: EstacionControl): string {
    return e.id;
  }

  /** dd/mm hh:mm a partir de AAAA-MM-DD HH:MM:SS */
  diaHora(fecha: string | null): string {
    return fecha ? `${fecha.slice(8, 10)}/${fecha.slice(5, 7)} ${fecha.slice(11, 16)}` : '—';
  }
}
