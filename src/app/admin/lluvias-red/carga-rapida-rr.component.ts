import { Component, ElementRef, Input, OnInit, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AdminApiService, LocalidadRr } from '../../services/admin-api.service';
import { fechaIso } from '../../shared/enlace-consulta';
import {
  AVISO_LLUVIA_DIA, AVISO_LLUVIA_MES, LIMITE_LLUVIA_DIA, LIMITE_LLUVIA_MES, LLUVIAS_DESDE, MESES_LARGOS_RR,
  buscarLocalidades, escribirMm, fechaCorta, leerMm, proveedores
} from './lluvias-red';

type Modo = 'dia' | 'mes';

/** Una carga de la sesión (para ver lo hecho y deshacerlo). */
interface Carga {
  modo: Modo;
  localidad: LocalidadRr;
  fecha: string;
  anio: number;
  mes: number;
  mm: number | null;
  anterior: number | null;
  deshecha: boolean;
  error: string;
}

/**
 * Carga sin mouse: unas letras del nombre (o el número), Enter, los mm, Enter, y queda lista para la
 * siguiente. Cada Enter guarda en el momento. Sirve para el dato diario y para el total mensual.
 */
@Component({
  selector: 'app-carga-rapida-rr',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './carga-rapida-rr.component.html',
  styleUrls: ['../estaciones/estaciones.css', './lluvias-red.css']
})
export class CargaRapidaRrComponent implements OnInit {
  private readonly api = inject(AdminApiService);

  @Input({ required: true }) localidades: LocalidadRr[] = [];
  @ViewChild('busqueda') busqueda?: ElementRef<HTMLInputElement>;
  @ViewChild('campoMm') campoMm?: ElementRef<HTMLInputElement>;

  readonly meses = MESES_LARGOS_RR;
  readonly hoy = fechaIso(new Date());
  readonly anioActual = new Date().getFullYear();
  readonly mesActual = new Date().getMonth() + 1;
  readonly anios = Array.from({ length: this.anioActual - LLUVIAS_DESDE + 1 }, (_, i) => this.anioActual - i);

  modo: Modo = 'dia';
  fecha = fechaIso(new Date(Date.now() - 86_400_000));
  anio = this.mesActual === 1 ? this.anioActual - 1 : this.anioActual;
  mes = this.mesActual === 1 ? 12 : this.mesActual - 1;
  proveedor = '';

  /** Fechas que se pueden cargar en el diario (las dice la API) */
  desdeDiario = '';
  hastaDiario = this.hoy;

  texto = '';
  sugerencias: LocalidadRr[] = [];
  activa = 0;
  elegida: LocalidadRr | null = null;
  mmTexto = '';

  /** Esperando un segundo Enter: valor alto o reemplazo de otro valor */
  confirmar: 'alto' | 'reemplazo' | null = null;
  anterior: number | null = null;
  mensaje = '';
  error = '';
  enviando = false;

  /** Valores guardados del mes (diario) o del año (mensual) que se está cargando */
  private existentes = new Map<string, number>();
  private cargado = '';
  errorContexto = '';

  historial: Carga[] = [];

  ngOnInit(): void {
    this.leerContexto();
  }

  get listaProveedores(): string[] {
    return proveedores(this.localidades);
  }

  get limite(): number {
    return this.modo === 'dia' ? LIMITE_LLUVIA_DIA : LIMITE_LLUVIA_MES;
  }

  get mesesPosibles(): number[] {
    const hasta = this.anio === this.anioActual ? this.mesActual : 12;
    return Array.from({ length: hasta }, (_, i) => i + 1);
  }

  /** Qué se está cargando, para los mensajes: «el 17/11/2026» o «noviembre de 2026». */
  get periodo(): string {
    return this.modo === 'dia' ? `el ${fechaCorta(this.fecha)}` : `${this.meses[this.mes - 1]} de ${this.anio}`;
  }

  private clave(id: number, modo = this.modo, fecha = this.fecha, anio = this.anio, mes = this.mes): string {
    return modo === 'dia' ? `${id}|${fecha}` : `${id}|${anio}|${mes}`;
  }

  /** Lee lo ya cargado del mes (diario) o del año (mensual), si cambió. */
  async leerContexto(): Promise<void> {
    if (this.modo === 'dia' && !/^\d{4}-\d{2}-\d{2}$/.test(this.fecha)) return;   // fecha borrada a medias
    const pedido = this.modo === 'dia' ? `d${this.fecha.slice(0, 7)}` : `m${this.anio}`;
    if (pedido === this.cargado) return;
    this.cargado = pedido;
    this.errorContexto = '';
    try {
      const existentes = new Map<string, number>();
      if (this.modo === 'dia') {
        const r = await this.api.diariosRr(this.fecha.slice(0, 7));
        this.desdeDiario = r.desde;
        this.hastaDiario = r.hasta;
        for (const v of r.valores) if (v.mm !== null) existentes.set(`${v.id}|${v.fecha}`, v.mm);
      } else {
        const r = await this.api.mensualesRr(this.anio);
        for (const f of r.filas) {
          f.meses.forEach((mm, i) => { if (mm !== null) existentes.set(`${f.id}|${r.anio}|${i + 1}`, mm); });
        }
      }
      if (this.cargado === pedido) this.existentes = existentes;
    } catch (e) {
      this.cargado = '';
      this.errorContexto = (e as Error).message;
    }
  }

  cambiarModo(): void {
    this.cancelar();
    this.leerContexto();
    this.enfocarBusqueda();
  }

  cambiarPeriodo(): void {
    if (this.modo === 'mes' && !this.mesesPosibles.includes(this.mes)) this.mes = this.mesesPosibles.length;
    this.cancelar();
    this.leerContexto();
  }

  get fechaFueraDeRango(): boolean {
    return this.modo === 'dia' && (!this.fecha || (!!this.desdeDiario && this.fecha < this.desdeDiario) || this.fecha > this.hastaDiario);
  }

  /** Valor guardado de la localidad en el período elegido */
  guardado(l: LocalidadRr): number | null {
    return this.existentes.get(this.clave(l.id)) ?? null;
  }

  /** Acumulado del mes de la localidad con los diarios cargados */
  acumuladoMes(l: LocalidadRr): { mm: number; dias: number } {
    const prefijo = `${l.id}|${this.fecha.slice(0, 7)}`;
    let mm = 0, dias = 0;
    for (const [k, v] of this.existentes) {
      if (k.startsWith(prefijo)) { mm += v; dias++; }
    }
    return { mm: Math.round(mm * 10) / 10, dias };
  }

  buscar(): void {
    this.elegida = null;
    this.sugerencias = buscarLocalidades(this.localidades, this.texto, this.proveedor);
    this.activa = 0;
    this.error = '';
  }

  teclaBusqueda(ev: KeyboardEvent): void {
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (!this.sugerencias.length) return;
      const n = this.sugerencias.length;
      this.activa = (this.activa + (ev.key === 'ArrowDown' ? 1 : n - 1)) % n;
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      if (this.sugerencias.length) this.elegir(this.sugerencias[this.activa]);
      else if (this.texto.trim()) this.error = 'No hay ninguna localidad con ese nombre o número.';
    } else if (ev.key === 'Escape') {
      this.texto = '';
      this.buscar();
    } else if (ev.key === 'z' && (ev.ctrlKey || ev.metaKey) && !this.texto) {
      ev.preventDefault();
      const ultima = this.historial.find(c => !c.deshecha && !c.error);
      if (ultima) this.deshacer(ultima);
    }
  }

  elegir(l: LocalidadRr): void {
    if (this.fechaFueraDeRango) {
      this.error = `Los datos diarios se cargan del ${fechaCorta(this.desdeDiario)} a hoy.`;
      return;
    }
    this.elegida = l;
    this.texto = l.nombre;
    this.sugerencias = [];
    this.mmTexto = '';
    this.confirmar = null;
    this.error = '';
    setTimeout(() => this.campoMm?.nativeElement.focus());
  }

  teclaMm(ev: KeyboardEvent): void {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      this.enviar();
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      if (this.confirmar) {
        this.confirmar = null;
        this.mensaje = '';
      } else {
        this.cancelar();
        this.enfocarBusqueda();
      }
    }
  }

  /** Cambiar el valor anula la confirmación pendiente (Shift, Tab o las flechas no). */
  alCambiarMm(): void {
    if (!this.confirmar) return;
    this.confirmar = null;
    this.mensaje = '';
  }

  async enviar(): Promise<void> {
    const l = this.elegida;
    if (!l || this.enviando) return;
    const mm = leerMm(this.mmTexto);
    if (mm === undefined) {
      this.error = 'Escribí los mm con un decimal como máximo (por ejemplo 12,5), o dejalo vacío para borrar el valor.';
      return;
    }
    if (mm !== null && mm > this.limite) {
      this.error = `El valor no puede pasar de ${this.limite} mm.`;
      return;
    }
    const aviso = this.modo === 'dia' ? AVISO_LLUVIA_DIA : AVISO_LLUVIA_MES;
    if (mm !== null && mm > aviso && !this.confirmar) {
      this.confirmar = 'alto';
      this.mensaje = `${escribirMm(mm)} mm es un valor alto. Enter para confirmar, Esc para corregir.`;
      return;
    }

    this.enviando = true;
    this.error = '';
    const carga: Carga = {
      modo: this.modo, localidad: l, fecha: this.fecha, anio: this.anio, mes: this.mes, mm,
      anterior: null, deshecha: false, error: ''
    };
    try {
      const r = await this.guardar(carga, this.confirmar === 'reemplazo');
      if (!r.guardado) {
        this.confirmar = 'reemplazo';
        this.anterior = r.anterior;
        this.mensaje = `${l.nombre} ya tenía ${escribirMm(r.anterior)} mm ${this.periodo}. `
          + (mm === null ? 'Enter lo borra' : 'Enter lo reemplaza') + ', Esc cancela.';
        return;
      }
      carga.anterior = r.anterior;
      this.historial.unshift(carga);
      this.cancelar();
      this.enfocarBusqueda();
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.enviando = false;
    }
  }

  private async guardar(c: Carga, reemplazar: boolean) {
    const r = c.modo === 'dia'
      ? await this.api.guardarDiarioRr({ id: c.localidad.id, fecha: c.fecha, mm: c.mm, reemplazar })
      : await this.api.guardarMensualRr({ id: c.localidad.id, anio: c.anio, mes: c.mes, mm: c.mm, reemplazar });
    if (r.guardado) {
      const k = this.clave(c.localidad.id, c.modo, c.fecha, c.anio, c.mes);
      if (c.mm === null) this.existentes.delete(k);
      else this.existentes.set(k, c.mm);
    }
    return r;
  }

  /** Vuelve a dejar el valor que había antes de esa carga. */
  async deshacer(c: Carga): Promise<void> {
    try {
      await this.guardar({ ...c, mm: c.anterior }, true);
      c.deshecha = true;
      c.error = '';
    } catch (e) {
      c.error = (e as Error).message;
    }
  }

  cancelar(): void {
    this.elegida = null;
    this.texto = '';
    this.mmTexto = '';
    this.sugerencias = [];
    this.confirmar = null;
    this.anterior = null;
    this.mensaje = '';
    this.error = '';
  }

  private enfocarBusqueda(): void {
    setTimeout(() => this.busqueda?.nativeElement.focus());
  }

  etiqueta(c: Carga): string {
    return c.modo === 'dia' ? fechaCorta(c.fecha) : `${this.meses[c.mes - 1]} ${c.anio}`;
  }

  readonly mmTxt = escribirMm;
}
