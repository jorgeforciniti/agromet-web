import { Component, EventEmitter, HostListener, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AdminApiService, FilaMensualRr, LocalidadRr } from '../../services/admin-api.service';
import {
  AVISO_LLUVIA_MES, LIMITE_LLUVIA_MES, LLUVIAS_DESDE, MESES_RR, buscarLocalidades, escribirMm, leerMm, normalizar,
  proveedores
} from './lluvias-red';

type Modo = 'anio' | 'localidad';

/** Filas por pedido (MAX_FILAS_MES de lluvias_mes.php) */
const FILAS_POR_PEDIDO = 200;

/** Una fila de la planilla: una localidad en un año. */
interface FilaPlanilla {
  id: number;
  anio: number;
  titulo: string;
  detalle: string;
  /** false: no tiene fila en datos_rr_mes (se crea al guardar) */
  existe: boolean;
  original: (number | null)[];
  celdas: string[];
  diarios: ({ mm: number; dias: number } | null)[];
}

/**
 * Cambios sin guardar de la última planilla cerrada. Al pasar a otra vista o a otra pestaña de /admin
 * el componente se destruye: así no se pierde lo tipeado o pegado, y se recupera al volver.
 */
let borrador: {
  modo: Modo; anio: number; localidad: LocalidadRr | null; filtro: string; proveedor: string; soloConDatos: boolean;
  filas: FilaPlanilla[]; repetidas: number[];
} | null = null;

/**
 * Totales mensuales como planilla: por año (todas las localidades) o por localidad (todos sus años,
 * para los datos históricos). Se puede pegar un bloque copiado de Excel. Guarda todo o nada.
 */
@Component({
  selector: 'app-planilla-rr',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './planilla-rr.component.html',
  styleUrls: ['../estaciones/estaciones.css', './lluvias-red.css']
})
export class PlanillaRrComponent implements OnInit, OnChanges, OnDestroy {
  private readonly api = inject(AdminApiService);

  @Input({ required: true }) localidades: LocalidadRr[] = [];
  /** Abre la planilla de esta localidad (Cargar historia) */
  @Input() localidadInicial: number | null = null;
  @Output() abierta = new EventEmitter<void>();

  readonly meses = MESES_RR;
  readonly anioActual = new Date().getFullYear();
  readonly mesActual = new Date().getMonth() + 1;
  readonly anios = Array.from({ length: this.anioActual - LLUVIAS_DESDE + 1 }, (_, i) => this.anioActual - i);

  modo: Modo = 'anio';
  anio = this.anioActual;
  localidad: LocalidadRr | null = null;
  textoLocalidad = '';
  sugerencias: LocalidadRr[] = [];
  filtro = '';
  proveedor = '';
  /** En la vista por año, sólo las localidades con algún total o diario en el año (o algo tipeado) */
  soloConDatos = true;
  anioNuevo: number | null = null;

  filas: FilaPlanilla[] = [];
  repetidas: number[] = [];
  cargando = false;
  error = '';
  guardando = false;
  errorGuardar = '';
  mensaje = '';
  /** Aviso del último pegado (filas o columnas que no entraron) */
  avisoPegado = '';
  /** Se recuperaron cambios sin guardar de la vez anterior */
  recuperado = false;
  private pedido = 0;

  ngOnInit(): void {
    if (this.localidadInicial !== null) return;   // lo resolvió ngOnChanges
    if (!this.recuperar()) this.leer();
  }

  ngOnDestroy(): void {
    borrador = this.aGuardar.length ? {
      modo: this.modo, anio: this.anio, localidad: this.localidad, filtro: this.filtro, proveedor: this.proveedor,
      soloConDatos: this.soloConDatos, filas: this.filas, repetidas: this.repetidas
    } : null;
  }

  /** Avisa antes de cerrar o recargar la página con cambios sin guardar. */
  @HostListener('window:beforeunload', ['$event'])
  alSalir(ev: BeforeUnloadEvent): void {
    if (this.aGuardar.length) ev.preventDefault();
  }

  /** Vuelve a mostrar los cambios sin guardar de la vez anterior, si los hay. */
  private recuperar(): boolean {
    const b = borrador;
    borrador = null;
    if (!b) return false;
    this.modo = b.modo;
    this.anio = b.anio;
    this.localidad = b.localidad;
    this.textoLocalidad = b.localidad?.nombre ?? '';
    this.filtro = b.filtro;
    this.proveedor = b.proveedor;
    this.soloConDatos = b.soloConDatos;
    this.filas = b.filas;
    this.repetidas = b.repetidas;
    this.recuperado = true;
    return true;
  }

  ngOnChanges(cambios: SimpleChanges): void {
    if (cambios['localidadInicial'] && this.localidadInicial !== null) {
      // Cargar historia con cambios sin guardar de la vez anterior: se pregunta antes de descartarlos
      if (borrador && !confirm('Hay cambios sin guardar en la planilla. ¿Descartarlos?')) {
        this.recuperar();
        queueMicrotask(() => this.abierta.emit());
        return;
      }
      borrador = null;
      const l = this.localidades.find(x => x.id === this.localidadInicial);
      if (l) {
        this.modo = 'localidad';
        this.elegirLocalidad(l, true);
      } else if (cambios['localidadInicial'].firstChange) {
        this.leer(true);   // ngOnInit no lee si se pidió una localidad
      }
      // Fuera del ciclo de detección: el padre vuelve localidadInicial a null (evita NG0100)
      queueMicrotask(() => this.abierta.emit());
    }
  }

  get listaProveedores(): string[] {
    return proveedores(this.localidades);
  }

  get visibles(): FilaPlanilla[] {
    if (this.modo === 'localidad') return this.filas;
    const t = normalizar(this.filtro);
    const porId = new Map(this.localidades.map(l => [l.id, l]));
    return this.filas.filter(f => {
      const l = porId.get(f.id);
      if (this.proveedor && l?.proveedor !== this.proveedor) return false;
      if (this.soloConDatos && !this.conDatos(f)) return false;
      return !t || normalizar(f.titulo).includes(t) || String(f.id).startsWith(t);
    });
  }

  /** Tiene algún total o diario en el año, o algo tipeado */
  private conDatos(f: FilaPlanilla): boolean {
    return f.original.some(v => v !== null) || f.diarios.some(d => d !== null) || f.celdas.some(t => t.trim() !== '');
  }

  cambiarModo(): void {
    if (!this.descartarCambios()) {
      this.modo = this.modo === 'anio' ? 'localidad' : 'anio';
      return;
    }
    this.filas = [];
    this.error = '';
    this.mensaje = '';
    if (this.modo === 'anio') this.leer(true);
    else if (this.localidad) this.leer(true);
  }

  buscarLocalidad(): void {
    this.sugerencias = buscarLocalidades(this.localidades, this.textoLocalidad);
  }

  teclaLocalidad(ev: KeyboardEvent): void {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      if (this.sugerencias.length) this.elegirLocalidad(this.sugerencias[0]);
    } else if (ev.key === 'Escape') {
      this.sugerencias = [];
    }
  }

  elegirLocalidad(l: LocalidadRr, sinPreguntar = false): void {
    if (!sinPreguntar && !this.descartarCambios()) return;
    this.localidad = l;
    this.textoLocalidad = l.nombre;
    this.sugerencias = [];
    this.leer(true);
  }

  async leer(sinPreguntar = false): Promise<void> {
    if (!sinPreguntar && !this.descartarCambios()) return;
    // Si se cambia de año o de localidad antes de que llegue la respuesta, la vieja se descarta
    const pedido = ++this.pedido;
    this.cargando = true;
    this.error = '';
    this.errorGuardar = '';
    this.recuperado = false;
    try {
      if (this.modo === 'anio') {
        const r = await this.api.mensualesRr(this.anio);
        if (pedido !== this.pedido) return;
        const guardadas = new Map(r.filas.map(f => [f.id, f.meses]));
        const diarios = new Map(r.diarios.map(d => [d.id, d.meses]));
        this.filas = this.localidades.map(l => this.fila(l.id, r.anio, l.nombre,
          [l.zona, l.proveedor].filter(x => x).join(' · '), guardadas.get(l.id), diarios.get(l.id)));
        this.repetidas = r.repetidas;
      } else if (this.localidad) {
        const r = await this.api.serieMensualRr(this.localidad.id);
        if (pedido !== this.pedido) return;
        this.filas = r.anios.map(a => this.fila(r.id, a.anio, String(a.anio), '', a.meses));
        this.repetidas = r.repetidas;
      }
    } catch (e) {
      if (pedido !== this.pedido) return;
      this.error = (e as Error).message;
      this.filas = [];
    } finally {
      if (pedido === this.pedido) this.cargando = false;
    }
  }

  private fila(id: number, anio: number, titulo: string, detalle: string, meses?: (number | null)[],
    diarios?: ({ mm: number; dias: number } | null)[]): FilaPlanilla {
    const original = meses ?? Array(12).fill(null);
    return {
      id, anio, titulo, detalle, existe: !!meses, original, celdas: original.map(v => escribirMm(v)),
      diarios: diarios ?? Array(12).fill(null)
    };
  }

  /** Agrega un año sin fila a la planilla de una localidad (datos históricos). */
  agregarAnio(): void {
    const a = this.anioNuevo;
    if (!this.localidad || a === null || a < LLUVIAS_DESDE || a > this.anioActual) return;
    if (this.filas.some(f => f.anio === a)) {
      this.error = `${a} ya está en la planilla.`;
      return;
    }
    this.filas = [...this.filas, this.fila(this.localidad.id, a, String(a), 'nuevo')].sort((x, y) => x.anio - y.anio);
    this.anioNuevo = null;
    this.error = '';
  }

  /** Agrega de una vez todos los años que faltan entre el primero y el último (o desde el indicado). */
  completarAnios(): void {
    if (!this.localidad) return;
    const tiene = new Set(this.filas.map(f => f.anio));
    const desde = this.anioNuevo ?? (tiene.size ? Math.min(...tiene) : this.anioActual);
    const nuevas: FilaPlanilla[] = [];
    for (let a = desde; a <= this.anioActual; a++) {
      if (!tiene.has(a)) nuevas.push(this.fila(this.localidad.id, a, String(a), 'nuevo'));
    }
    this.filas = [...this.filas, ...nuevas].sort((x, y) => x.anio - y.anio);
    this.anioNuevo = null;
  }

  futuro(f: FilaPlanilla, c: number): boolean {
    return f.anio === this.anioActual && c + 1 > this.mesActual;
  }

  errorCelda(f: FilaPlanilla, c: number): string {
    const v = leerMm(f.celdas[c]);
    if (v === undefined) return 'Número con un decimal como máximo';
    if (v !== null && v > LIMITE_LLUVIA_MES) return `Más de ${LIMITE_LLUVIA_MES} mm`;
    if (v !== null && this.futuro(f, c)) return 'El mes todavía no terminó';
    return '';
  }

  alta(f: FilaPlanilla, c: number): boolean {
    const v = leerMm(f.celdas[c]);
    return typeof v === 'number' && v > AVISO_LLUVIA_MES;
  }

  cambiada(f: FilaPlanilla, c?: number): boolean {
    const cols = c === undefined ? [...Array(12).keys()] : [c];
    return cols.some(i => leerMm(f.celdas[i]) !== f.original[i]);
  }

  /** Suma de los diarios muy distinta del total en un mes con todos los días cargados */
  difiere(f: FilaPlanilla, c: number): boolean {
    const d = f.diarios[c];
    const v = leerMm(f.celdas[c]);
    if (!d || typeof v !== 'number') return false;
    const diasMes = new Date(f.anio, c + 1, 0).getDate();
    return d.dias === diasMes && Math.abs(v - d.mm) > Math.max(5, v * 0.1);
  }

  total(f: FilaPlanilla): string {
    let suma = 0, hay = false;
    for (const t of f.celdas) {
      const v = leerMm(t);
      if (typeof v === 'number') { suma += v; hay = true; }
    }
    return hay ? escribirMm(Math.round(suma * 10) / 10) : '';
  }

  get aGuardar(): FilaPlanilla[] {
    return this.filas.filter(f => this.cambiada(f));
  }

  get valoresCambiados(): number {
    return this.aGuardar.reduce((n, f) => n + [...Array(12).keys()].filter(c => this.cambiada(f, c)).length, 0);
  }

  /** Filas cambiadas que en la base están repetidas: la API no las guarda */
  get repetidasCambiadas(): number {
    const rep = new Set(this.repetidas);
    return this.aGuardar.filter(f => rep.has(this.modo === 'anio' ? f.id : f.anio)).length;
  }

  get conErrores(): number {
    return this.aGuardar.reduce((n, f) => n + [...Array(12).keys()].filter(c => this.errorCelda(f, c)).length, 0);
  }

  /** Enter y las flechas arriba/abajo se mueven por la columna, como en una planilla. */
  tecla(ev: KeyboardEvent, fila: number, col: number): void {
    const mover: Record<string, [number, number]> = { Enter: [1, 0], ArrowDown: [1, 0], ArrowUp: [-1, 0] };
    const m = mover[ev.key];
    if (!m) return;
    ev.preventDefault();
    this.enfocar(fila + m[0] * (ev.shiftKey && ev.key === 'Enter' ? -1 : 1), col + m[1]);
  }

  private enfocar(fila: number, col: number): void {
    const el = document.querySelector<HTMLInputElement>(`input[data-rr="${fila}-${col}"]`);
    el?.focus();
    el?.select();
  }

  /** Pegado de un bloque de Excel (columnas con tabulación, filas con salto de línea) desde la celda. */
  pegar(ev: ClipboardEvent, fila: number, col: number): void {
    const texto = ev.clipboardData?.getData('text') ?? '';
    if (!/[\t\n]/.test(texto.trim())) return;   // un solo valor: pegado normal
    ev.preventDefault();
    const lineas = texto.replace(/\r/g, '').replace(/\n+$/, '').split('\n');
    const visibles = this.visibles;
    let filasPegadas = 0, sobranColumnas = false, futuros = false;
    lineas.forEach((linea, i) => {
      const f = visibles[fila + i];
      if (!f) return;
      filasPegadas++;
      linea.split('\t').forEach((valor, j) => {
        const c = col + j;
        if (c >= 12) sobranColumnas = true;
        // Un mes que no terminó está deshabilitado: con un valor pegado quedaría un error sin corregir
        else if (this.futuro(f, c)) futuros = futuros || valor.trim() !== '';
        else f.celdas[c] = valor.trim().replace(/\s/g, '');
      });
    });
    this.mensaje = '';
    const avisos: string[] = [];
    if (filasPegadas < lineas.length) {
      avisos.push(`se pegaron ${filasPegadas} de ${lineas.length} filas (no hay más filas debajo`
        + (this.modo === 'localidad' ? ': agregá los años que faltan' : '') + ')');
    }
    if (sobranColumnas) avisos.push('las columnas después de diciembre no se pegaron');
    if (futuros) avisos.push('los meses que todavía no terminaron no se pegaron');
    this.avisoPegado = avisos.length ? avisos.join('; ').replace(/^./, c => c.toUpperCase()) + '.' : '';
  }

  async guardar(): Promise<void> {
    const filas = this.aGuardar;
    if (!filas.length || this.conErrores || this.repetidasCambiadas || this.guardando) return;
    const resumen = `Se ${this.valoresCambiados === 1 ? 'cambia 1 valor' : `cambian ${this.valoresCambiados} valores`} en `
      + `${filas.length} ${filas.length === 1 ? 'fila' : 'filas'}.`;
    if (!confirm(`${resumen} ¿Guardar?`)) return;
    this.guardando = true;
    this.errorGuardar = '';
    this.mensaje = '';
    // Con los valores como se leyeron: la API sólo escribe los meses cambiados y rechaza la planilla si
    // alguno ya no es el que se leyó (otro lo cargó mientras tanto)
    const datos: FilaMensualRr[] = filas.map(f => ({
      id: f.id, anio: f.anio, meses: f.celdas.map(t => leerMm(t) as number | null), antes: f.original
    }));
    let cambios = 0;
    try {
      for (let i = 0; i < datos.length; i += FILAS_POR_PEDIDO) {
        cambios += (await this.api.guardarPlanillaRr(datos.slice(i, i + FILAS_POR_PEDIDO))).cambios;
      }
      this.mensaje = cambios === 1 ? 'Se guardó 1 valor.' : `Se guardaron ${cambios} valores.`;
      await this.leer(true);
    } catch (e) {
      this.errorGuardar = (e as Error).message
        + (datos.length > FILAS_POR_PEDIDO ? ' Las tandas anteriores ya se guardaron: volvé a leer la planilla.' : '');
    } finally {
      this.guardando = false;
    }
  }

  descartar(): void {
    for (const f of this.filas) f.celdas = f.original.map(v => escribirMm(v));
    this.filas = this.filas.filter(f => f.existe || this.modo === 'anio');
    this.errorGuardar = '';
  }

  private descartarCambios(): boolean {
    return !this.aGuardar.length || confirm('Hay cambios sin guardar en la planilla. ¿Descartarlos?');
  }

  diario(d: { mm: number; dias: number } | null): string {
    return d ? `${escribirMm(d.mm)} (${d.dias} d)` : '';
  }

  porClave(_: number, f: FilaPlanilla): string {
    return `${f.id}|${f.anio}`;
  }
}
