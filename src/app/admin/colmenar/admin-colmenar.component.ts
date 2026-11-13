import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import {
  AdminApiService, CargaDiaColmenar, DiaColmenar, PeriodoColmenar, ResumenColmenar
} from '../../services/admin-api.service';
import { fechaIso } from '../../shared/enlace-consulta';

/** Los mismos límites que LIMITES_COLMENAR de server/admin/api/config.php. */
const TEMP_MIN = -20;
const TEMP_MAX = 50;
const PP_MAX = 500;
const MAX_DIAS = 366;

const ORIGENES: Record<string, string> = {
  historico_csv: 'Histórico',
  convencional: 'Convencional',
  automatico: 'Automática'
};

type Campo = 'max' | 'min' | 'pp';

/** Un día en edición: los valores como se escriben (admiten coma decimal). */
interface FilaColmenar {
  dia: DiaColmenar;
  max: string;
  min: string;
  pp: string;
  traza: boolean;
  obs: string;
}

/** Número con un decimal como máximo; null si está vacío; undefined si no es válido. */
function leerNumero(texto: string): number | null | undefined {
  const t = texto.trim().replace(',', '.');
  if (t === '') return null;
  if (!/^-?\d+(\.\d)?$/.test(t)) return undefined;
  return Number(t);
}

function escribirNumero(v: number | null): string {
  return v === null ? '' : v.toFixed(1).replace('.', ',');
}

/**
 * Carga de los días faltantes de la serie diaria de El Colmenar y validación de los provisionales
 * (server/admin/api/colmenar_diarios.php). Un día validado sólo admite completar sus valores vacíos.
 */
@Component({
  selector: 'app-admin-colmenar',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './admin-colmenar.component.html',
  styleUrls: ['../estaciones/estaciones.css', './admin-colmenar.component.css']
})
export class AdminColmenarComponent implements OnInit {
  private readonly api = inject(AdminApiService);

  readonly hoy = fechaIso(new Date());
  readonly origenes = ORIGENES;

  resumen: ResumenColmenar | null = null;
  errorResumen = '';

  desde = fechaIso(new Date(Date.now() - 30 * 86_400_000));
  hasta = this.hoy;
  soloPendientes = true;
  periodo: PeriodoColmenar | null = null;
  filas: FilaColmenar[] = [];
  consultando = false;
  errorConsulta = '';

  /** Días provisionales que se validan sin cambiarles nada. */
  readonly confirmados = new Set<string>();
  guardando = false;
  errorGuardar = '';
  mensaje = '';

  ngOnInit(): void {
    this.leerResumen();
    this.consultar();
  }

  async leerResumen(): Promise<void> {
    this.errorResumen = '';
    try {
      this.resumen = await this.api.resumenColmenar();
    } catch (e) {
      this.errorResumen = (e as Error).message;
    }
  }

  pendientesAnio(a: ResumenColmenar['anios'][number]): number {
    return a.sin_fila + a.provisionales + a.sin_max + a.sin_min + a.sin_pp;
  }

  /** Abre los pendientes de un año del resumen. */
  abrirAnio(anio: number): void {
    if (!this.descartarCambios()) return;
    this.desde = `${anio}-01-01`;
    this.hasta = `${anio}-12-31` > this.hoy ? this.hoy : `${anio}-12-31`;
    this.soloPendientes = true;
    this.consultar(true);
  }

  get diasPeriodo(): number {
    if (!this.desde || !this.hasta) return 0;
    return Math.round((Date.parse(this.hasta) - Date.parse(this.desde)) / 86_400_000) + 1;
  }

  get periodoValido(): boolean {
    return !!this.desde && !!this.hasta && this.desde <= this.hasta && this.diasPeriodo <= MAX_DIAS;
  }

  async consultar(sinPreguntar = false): Promise<void> {
    if (!this.periodoValido || this.consultando) return;
    if (!sinPreguntar && !this.descartarCambios()) return;
    this.consultando = true;
    this.errorConsulta = '';
    this.errorGuardar = '';
    this.mensaje = '';
    try {
      this.periodo = await this.api.diasColmenar(this.desde, this.hasta, this.soloPendientes);
      this.filas = this.periodo.dias.map(d => this.fila(d));
    } catch (e) {
      this.errorConsulta = (e as Error).message;
      this.periodo = null;
      this.filas = [];
    } finally {
      this.consultando = false;
    }
  }

  private fila(dia: DiaColmenar): FilaColmenar {
    return {
      dia,
      max: escribirNumero(dia.temp_max),
      min: escribirNumero(dia.temp_min),
      pp: escribirNumero(dia.precipitacion),
      traza: dia.estado_pp === 1,
      obs: dia.observaciones ?? ''
    };
  }

  /** Un día validado sólo deja completar lo que está vacío. */
  editable(f: FilaColmenar, campo: Campo): boolean {
    if (!f.dia.definitivo) return true;
    const valor = campo === 'max' ? f.dia.temp_max : campo === 'min' ? f.dia.temp_min : f.dia.precipitacion;
    return valor === null;
  }

  alCambiarTraza(f: FilaColmenar): void {
    if (f.traza) f.pp = '0';
  }

  /** Valores de la fila listos para enviar, o el primer problema encontrado. */
  private carga(f: FilaColmenar): { carga?: CargaDiaColmenar; error?: string } {
    const max = leerNumero(f.max), min = leerNumero(f.min), pp = leerNumero(f.pp);
    if (max === undefined || min === undefined || pp === undefined) {
      return { error: 'Los valores son números con un decimal como máximo (por ejemplo 23,4).' };
    }
    for (const [v, nombre] of [[max, 'La máxima'], [min, 'La mínima']] as const) {
      if (v !== null && (v < TEMP_MIN || v > TEMP_MAX)) return { error: `${nombre} tiene que estar entre ${TEMP_MIN} y ${TEMP_MAX} °C.` };
    }
    if (max !== null && min !== null && max < min) return { error: 'La máxima es menor que la mínima.' };
    if (pp !== null && (pp < 0 || pp > PP_MAX)) return { error: `La lluvia tiene que estar entre 0 y ${PP_MAX} mm.` };
    if (f.traza && pp !== 0) return { error: 'La traza se carga con 0 mm.' };
    if (max === null && min === null && pp === null) return { error: 'Cargá al menos un valor.' };
    if (f.obs.trim().length > 255) return { error: 'Las observaciones pueden tener hasta 255 caracteres.' };
    return { carga: { fecha: f.dia.fecha, temp_max: max, temp_min: min, precipitacion: pp, traza: f.traza, observaciones: f.obs.trim() } };
  }

  error(f: FilaColmenar): string {
    return this.cambiada(f) ? this.carga(f).error ?? '' : '';
  }

  /**
   * Algún valor distinto de lo guardado. En un día validado las observaciones solas no cuentan: la
   * API sólo lo modifica si se completa un valor vacío.
   */
  cambiada(f: FilaColmenar): boolean {
    const d = f.dia;
    const valores = leerNumero(f.max) !== d.temp_max || leerNumero(f.min) !== d.temp_min
      || leerNumero(f.pp) !== d.precipitacion || f.traza !== (d.estado_pp === 1);
    return valores || (!d.definitivo && f.obs.trim() !== (d.observaciones ?? '').trim());
  }

  /**
   * Marca un día provisional para validarlo con los valores que ya tiene. Al desmarcarlo se deja
   * como está en la base: también se deshacen los cambios de esa fila.
   */
  confirmar(f: FilaColmenar, si: boolean): void {
    if (si) {
      this.confirmados.add(f.dia.fecha);
      return;
    }
    this.confirmados.delete(f.dia.fecha);
    const i = this.filas.indexOf(f);
    if (i >= 0 && this.cambiada(f)) this.filas[i] = this.fila(f.dia);
  }

  aGuardar(f: FilaColmenar): boolean {
    return this.cambiada(f) || (!f.dia.definitivo && f.dia.existe && this.confirmados.has(f.dia.fecha));
  }

  get filasAGuardar(): FilaColmenar[] {
    return this.filas.filter(f => this.aGuardar(f));
  }

  get conErrores(): number {
    return this.filasAGuardar.filter(f => this.carga(f).error).length;
  }

  get pendientesEnTabla(): number {
    return this.filas.filter(f => f.dia.pendiente).length;
  }

  async guardar(): Promise<void> {
    const filas = this.filasAGuardar;
    if (!filas.length || this.conErrores || this.guardando) return;
    this.guardando = true;
    this.errorGuardar = '';
    this.mensaje = '';
    try {
      const r = await this.api.guardarColmenar(filas.map(f => this.carga(f).carga!));
      const nuevos = new Map(r.dias.map(d => [d.fecha, d]));
      this.filas = this.filas.map(f => nuevos.has(f.dia.fecha) ? this.fila(nuevos.get(f.dia.fecha)!) : f);
      this.confirmados.clear();
      this.mensaje = r.guardados === 1 ? 'Se guardó 1 día.' : `Se guardaron ${r.guardados} días.`;
      this.leerResumen();
    } catch (e) {
      this.errorGuardar = (e as Error).message;
    } finally {
      this.guardando = false;
    }
  }

  descartar(): void {
    if (!this.periodo) return;
    this.filas = this.filas.map(f => this.fila(f.dia));
    this.confirmados.clear();
    this.errorGuardar = '';
  }

  private descartarCambios(): boolean {
    return !this.filasAGuardar.length || confirm('Hay cambios sin guardar en la tabla. ¿Descartarlos?');
  }

  estado(d: DiaColmenar): { texto: string; clase: string } {
    if (!d.existe) return { texto: 'Falta el día', clase: 'est-t-sin' };
    if (!d.definitivo) return { texto: 'Provisional', clase: 'est-t-retraso' };
    if (d.pendiente) return { texto: 'Validado, con vacíos', clase: 'est-t-info' };
    return { texto: 'Validado', clase: 'est-t-ok' };
  }

  /** dd/mm/aaaa y día de la semana abreviado */
  fecha(iso: string): string {
    const [a, m, d] = iso.split('-').map(Number);
    const dia = new Date(a, m - 1, d).toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '');
    return `${dia} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a}`;
  }

  numero(v: number | null): string {
    return v === null ? '—' : escribirNumero(v);
  }

  porFecha(_: number, f: FilaColmenar): string {
    return f.dia.fecha;
  }
}
