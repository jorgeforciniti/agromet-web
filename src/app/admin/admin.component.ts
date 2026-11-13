import { Component, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTabsModule } from '@angular/material/tabs';
import { AdminApiService, InformeCargado, LluviaEstacion9a9, Lluvias9a9 } from '../services/admin-api.service';
import { fechaIso } from '../shared/enlace-consulta';
import { CATEGORIAS_INFORME, nombreCategoria, sugerirDesdeArchivo } from './categorias';
import { AdminComunicacionesComponent } from './estaciones/admin-comunicaciones.component';
import { AdminControlComponent } from './estaciones/admin-control.component';
import { AdminSensoresComponent } from './estaciones/admin-sensores.component';
import { AdminPublicadosComponent } from './publicados/admin-publicados.component';

const MAX_MB = 30;
const PESTANA_CONTROL = 4;

type Orden9a9 = 'nombre' | 'mm' | 'horas';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, MatIconModule, MatTabsModule, AdminPublicadosComponent,
    AdminComunicacionesComponent, AdminControlComponent, AdminSensoresComponent],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.css'
})
export class AdminComponent implements OnInit {
  private readonly api = inject(AdminApiService);

  @ViewChild(AdminPublicadosComponent) private publicados?: AdminPublicadosComponent;

  readonly categorias = CATEGORIAS_INFORME;
  readonly nombreCategoria = nombreCategoria;
  readonly hoy = fechaIso(new Date());
  readonly maxMb = MAX_MB;

  pestana = 0;
  /** Estación a abrir en "Control de estaciones" (objeto nuevo en cada pedido) */
  estacionControl: { id: string } | null = null;

  // ---- Cargar informe ----
  titulo = '';
  categoria = 'll';
  creado = this.hoy;
  archivo: File | null = null;
  arrastrando = false;
  enviando = false;
  errorCarga = '';
  cargado: InformeCargado | null = null;

  recientes: InformeCargado[] = [];
  cargandoRecientes = true;
  errorRecientes = '';

  // ---- Lluvias de 9 a 9 ----
  fecha9a9 = this.hoy;
  consultando = false;
  error9a9 = '';
  lluvias: Lluvias9a9 | null = null;
  orden: Orden9a9 = 'nombre';
  ordenDesc = false;
  copiado = false;

  ngOnInit(): void {
    this.leerRecientes();
  }

  /** Desde el visor de comunicaciones: abre el control con esa estación elegida. */
  controlarEstacion(id: string): void {
    this.estacionControl = { id };
    this.pestana = PESTANA_CONTROL;
  }

  // ---- Cargar informe ----

  elegirArchivo(input: HTMLInputElement): void {
    this.usarArchivo(input.files?.[0] ?? null);
    input.value = '';
  }

  soltar(evento: DragEvent): void {
    evento.preventDefault();
    this.arrastrando = false;
    this.usarArchivo(evento.dataTransfer?.files?.[0] ?? null);
  }

  arrastrar(evento: DragEvent, encima: boolean): void {
    evento.preventDefault();
    this.arrastrando = encima;
  }

  quitarArchivo(): void {
    this.archivo = null;
  }

  private usarArchivo(archivo: File | null): void {
    this.errorCarga = '';
    this.cargado = null;
    if (!archivo) return;
    if (!/\.(pdf|xlsx)$/i.test(archivo.name)) {
      this.errorCarga = 'Sólo se pueden subir archivos PDF o XLSX.';
      return;
    }
    if (archivo.size > MAX_MB * 1024 * 1024) {
      this.errorCarga = `El archivo pesa más de ${MAX_MB} MB.`;
      return;
    }
    this.archivo = archivo;
    // Con los nombres habituales (Lluvias_28_10_2026.pdf) se completan título, categoría y fecha
    const s = sugerirDesdeArchivo(archivo.name, this.hoy);
    if (!this.titulo.trim() || s.categoria) this.titulo = s.titulo;
    if (s.categoria) this.categoria = s.categoria;
    if (s.creado) this.creado = s.creado;
  }

  tamano(bytes: number): string {
    return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
  }

  async cargar(form: NgForm): Promise<void> {
    if (form.invalid || !this.archivo || this.enviando) return;
    this.enviando = true;
    this.errorCarga = '';
    this.cargado = null;
    try {
      this.cargado = await this.api.cargarInforme({
        titulo: this.titulo.trim(),
        categoria: this.categoria,
        creado: this.creado,
        archivo: this.archivo
      });
      // Se mantienen categoría y fecha: suelen cargarse varios informes seguidos del mismo tipo
      this.archivo = null;
      form.resetForm({ titulo: '', categoria: this.categoria, creado: this.creado });
      this.leerRecientes();
      this.publicados?.recargar();
    } catch (e) {
      this.errorCarga = (e as Error).message;
    } finally {
      this.enviando = false;
    }
  }

  urlArchivo(archivo: string): string {
    return `https://agromet.eeaoc.gob.ar/PDFS/${encodeURIComponent(archivo)}`;
  }

  private async leerRecientes(): Promise<void> {
    this.cargandoRecientes = true;
    this.errorRecientes = '';
    try {
      this.recientes = (await this.api.informes()).informes.slice(0, 8);
    } catch (e) {
      this.errorRecientes = (e as Error).message;
    } finally {
      this.cargandoRecientes = false;
    }
  }

  // ---- Lluvias de 9 a 9 ----

  async consultar9a9(): Promise<void> {
    if (!this.fecha9a9 || this.consultando) return;
    this.consultando = true;
    this.error9a9 = '';
    this.copiado = false;
    try {
      this.lluvias = await this.api.lluvias9a9(this.fecha9a9);
    } catch (e) {
      this.error9a9 = (e as Error).message;
      this.lluvias = null;
    } finally {
      this.consultando = false;
    }
  }

  /** Día anterior / siguiente (sin pasar de hoy) y consulta. */
  moverDia(dias: number): void {
    const [a, m, d] = this.fecha9a9.split('-').map(Number);
    const nueva = fechaIso(new Date(a, m - 1, d + dias));
    if (nueva > this.hoy) return;
    this.fecha9a9 = nueva;
    this.consultar9a9();
  }

  ordenarPor(campo: Orden9a9): void {
    // Primer clic: nombre A→Z; mm y horas de mayor a menor
    this.ordenDesc = this.orden === campo ? !this.ordenDesc : campo !== 'nombre';
    this.orden = campo;
  }

  get estacionesOrdenadas(): LluviaEstacion9a9[] {
    const lista = [...(this.lluvias?.estaciones ?? [])];
    const signo = this.ordenDesc ? -1 : 1;
    return lista.sort((a, b) => {
      if (this.orden === 'nombre') return signo * a.nombre.localeCompare(b.nombre, 'es');
      // Sin registros, siempre al final
      const va = this.orden === 'mm' ? a.mm : a.horas, vb = this.orden === 'mm' ? b.mm : b.horas;
      if (va === null) return 1;
      if (vb === null) return -1;
      return signo * (va - vb) || a.nombre.localeCompare(b.nombre, 'es');
    });
  }

  ariaOrden(campo: Orden9a9): 'ascending' | 'descending' | null {
    return this.orden === campo ? (this.ordenDesc ? 'descending' : 'ascending') : null;
  }

  get conRegistros(): number {
    return this.lluvias?.estaciones.filter(e => e.mm !== null).length ?? 0;
  }

  get maximo(): { nombre: string; mm: number } | null {
    const conLluvia = (this.lluvias?.estaciones ?? []).filter(e => (e.mm ?? 0) > 0);
    if (!conLluvia.length) return null;
    const m = conLluvia.reduce((a, b) => (b.mm! > a.mm! ? b : a));
    return { nombre: m.nombre, mm: m.mm! };
  }

  /** Copia la tabla separada por tabulaciones, para pegarla en Excel o en un informe. */
  async copiarTabla(): Promise<void> {
    if (!this.lluvias) return;
    const num = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 2 });
    const filas = [
      `Lluvia del ${this.diaMes(this.lluvias.desde)} 9 h al ${this.diaMes(this.lluvias.hasta)} 9 h`,
      ['Id', 'Estación', 'mm', 'Horas con datos'].join('\t'),
      ...this.estacionesOrdenadas.map(e => [e.id, e.nombre, e.mm === null ? '' : num(e.mm), num(e.horas)].join('\t'))
    ];
    try {
      await navigator.clipboard.writeText(filas.join('\n'));
      this.copiado = true;
      setTimeout(() => this.copiado = false, 2500);
    } catch {
      this.error9a9 = 'No se pudo copiar al portapapeles.';
    }
  }

  /** dd/mm a partir de AAAA-MM-DD */
  diaMes(iso: string): string {
    return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  }
}
