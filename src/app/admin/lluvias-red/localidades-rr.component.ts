import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AdminApiService, DatosLocalidadRr, FichaLocalidadRr, LocalidadRr } from '../../services/admin-api.service';
import { LIMITE_LLUVIA_MES, MESES_RR, escribirMm, leerMm, normalizar, proveedores } from './lluvias-red';

/** Formulario de una localidad: los números como se escriben (admiten coma). */
interface Formulario {
  id: string;
  nombre: string;
  zona: string;
  proveedor: string;
  lat: string;
  lon: string;
  alt: string;
  periodo_normal: string;
  normales: string[];
}

function numero(t: string): number | null | undefined {
  const s = t.trim().replace(',', '.');
  if (s === '') return null;
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : undefined;
}

/**
 * Localidades de la red: lista, alta (con el siguiente número libre) y edición. Cada edición agrega una
 * versión en estaciones_rr; las anteriores quedan.
 */
@Component({
  selector: 'app-localidades-rr',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './localidades-rr.component.html',
  styleUrls: ['../estaciones/estaciones.css', './lluvias-red.css']
})
export class LocalidadesRrComponent {
  private readonly api = inject(AdminApiService);

  @Input({ required: true }) localidades: LocalidadRr[] = [];
  @Input({ required: true }) siguienteId = 1;
  /** Se creó o cambió una localidad: hay que volver a leer la lista */
  @Output() cambio = new EventEmitter<void>();
  /** Abrir la planilla de la localidad para cargar sus datos históricos */
  @Output() historia = new EventEmitter<number>();

  readonly meses = MESES_RR;
  filtro = '';
  proveedor = '';

  /** null: sin formulario abierto; 'nueva': alta; número: edición de esa localidad */
  editando: 'nueva' | number | null = null;
  form: Formulario = this.vacio();
  versiones: FichaLocalidadRr[] = [];
  cargandoFicha = false;
  guardando = false;
  error = '';
  aviso = '';
  mensaje = '';
  /** Localidad recién guardada (para ofrecer cargar su historia) */
  guardada: number | null = null;
  /** No se pudo abrir la ficha de una localidad */
  errorLista = '';
  /** El formulario como se leyó, para no grabar una versión sin cambios */
  private inicial = '';

  get listaProveedores(): string[] {
    return proveedores(this.localidades);
  }

  get visibles(): LocalidadRr[] {
    const t = normalizar(this.filtro);
    return this.localidades.filter(l => (!this.proveedor || l.proveedor === this.proveedor)
      && (!t || normalizar(l.nombre).includes(t) || String(l.id).startsWith(t)));
  }

  private vacio(): Formulario {
    return { id: '', nombre: '', zona: '', proveedor: '', lat: '', lon: '', alt: '', periodo_normal: '', normales: Array(12).fill('') };
  }

  nueva(): void {
    this.editando = 'nueva';
    this.form = { ...this.vacio(), id: String(this.siguienteId) };
    this.versiones = [];
    this.limpiarMensajes();
  }

  async editar(l: LocalidadRr): Promise<void> {
    this.editando = l.id;
    this.limpiarMensajes();
    this.versiones = [];
    // Nunca queda a la vista el formulario de otra localidad
    this.form = { ...this.vacio(), id: String(l.id) };
    this.inicial = '';
    if (!l.ficha) {
      // Tiene datos pero no ficha: la edición le crea la primera versión
      return;
    }
    this.cargandoFicha = true;
    try {
      const r = await this.api.fichaLocalidadRr(l.id);
      const f = r.localidad;
      this.form = {
        id: String(f.id), nombre: f.nombre, zona: f.zona, proveedor: f.proveedor,
        lat: String(f.lat).replace('.', ','), lon: String(f.lon).replace('.', ','), alt: String(f.alt).replace('.', ','),
        periodo_normal: f.periodo_normal, normales: f.normales.map(v => escribirMm(v))
      };
      this.versiones = r.versiones;
      this.inicial = JSON.stringify(this.form);
    } catch (e) {
      // Sin la ficha no se edita: guardar grabaría una versión con el formulario vacío
      this.editando = null;
      this.errorLista = `No se pudo abrir ${l.nombre}: ${(e as Error).message}`;
    } finally {
      this.cargandoFicha = false;
    }
  }

  cerrar(): void {
    this.editando = null;
    this.limpiarMensajes();
  }

  private limpiarMensajes(): void {
    this.errorLista = '';
    this.error = '';
    this.aviso = '';
    this.mensaje = '';
    this.guardada = null;
  }

  /** Datos listos para la API, o el primer problema encontrado. */
  private datos(): { datos?: DatosLocalidadRr; error?: string } {
    const f = this.form;
    if (!f.nombre.trim()) return { error: 'Falta el nombre.' };
    if (f.nombre.trim().length > 50) return { error: 'El nombre puede tener hasta 50 caracteres.' };
    if (f.zona.trim().length > 2 || f.proveedor.trim().length > 2) return { error: 'La zona y el proveedor tienen hasta 2 caracteres.' };
    const lat = numero(f.lat), lon = numero(f.lon), alt = numero(f.alt);
    if (lat === null || lat === undefined || lat < -90 || lat > 90) return { error: 'La latitud es un número entre -90 y 90 (en grados).' };
    if (lon === null || lon === undefined || lon < -180 || lon > 180) return { error: 'La longitud es un número entre -180 y 180 (en grados).' };
    if (alt === undefined) return { error: 'La altura es un número (en metros).' };
    const normales: (number | null)[] = [];
    for (let i = 0; i < 12; i++) {
      const v = leerMm(f.normales[i]);
      if (v === undefined || (v !== null && v > LIMITE_LLUVIA_MES)) {
        return { error: `La normal de ${MESES_RR[i]} es un número de 0 a ${LIMITE_LLUVIA_MES} con un decimal como máximo.` };
      }
      normales.push(v);
    }
    let id: number | null = null;
    if (this.editando === 'nueva' && f.id.trim()) {
      id = Number(f.id.trim());
      if (!Number.isInteger(id) || id < 1 || id > 32767) return { error: 'El número de localidad va de 1 a 32767.' };
    }
    return {
      datos: {
        id, nombre: f.nombre.trim(), zona: f.zona.trim(), proveedor: f.proveedor.trim().toUpperCase(),
        lat, lon, alt, periodo_normal: f.periodo_normal.trim(), normales
      }
    };
  }

  get errorFormulario(): string {
    return this.datos().error ?? '';
  }

  async guardar(): Promise<void> {
    const { datos, error } = this.datos();
    if (!datos || this.guardando || this.editando === null) {
      this.error = error ?? '';
      return;
    }
    if (this.editando !== 'nueva' && this.inicial && JSON.stringify(this.form) === this.inicial) {
      this.limpiarMensajes();
      this.mensaje = 'No hay cambios para guardar.';
      return;
    }
    this.guardando = true;
    this.limpiarMensajes();
    try {
      const r = this.editando === 'nueva'
        ? await this.api.crearLocalidadRr(datos)
        : await this.api.editarLocalidadRr(this.editando, datos);
      this.aviso = r.aviso ?? '';
      this.mensaje = this.editando === 'nueva'
        ? `Se dio de alta ${r.localidad.nombre} con el número ${r.localidad.id}.`
        : `Se guardó una versión nueva de ${r.localidad.nombre}.`;
      this.editando = r.localidad.id;
      this.form.id = String(r.localidad.id);
      this.versiones = r.versiones;
      this.inicial = JSON.stringify(this.form);
      this.guardada = r.localidad.id;
      this.cambio.emit();
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.guardando = false;
    }
  }

  coordenadas(l: LocalidadRr): string {
    return l.lat === null || l.lon === null ? '—' : `${l.lat.toFixed(4)}, ${l.lon.toFixed(4)}`;
  }
}
