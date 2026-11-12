import { Component, Inject, Injectable, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable, Subscription, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import {
  DateAdapter,
  MAT_DATE_FORMATS,
  MAT_DATE_LOCALE,
  MatNativeDateModule,
  NativeDateAdapter
} from '@angular/material/core';
import { RegistroDiario, WeatherService, WeatherStation } from '../services/weather.service';
import { CopiarEnlaceComponent } from '../shared/copiar-enlace.component';
import { ComoSeLeeComponent } from '../shared/como-se-lee.component';
import { EncabezadoDialogoComponent } from '../shared/encabezado-dialogo.component';
import { armarEnlace, consultaDe, fechaIso, leerFecha } from '../shared/enlace-consulta';
import { OTRAS_ESTACIONES, ZONA_LABELS } from '../shared/zonas';
import { formatDecimal, SIN_DATO } from '../pipes/valor.pipe';
import { FUENTE_TEXTO } from '../shared/fuente';

/** Valores del día ya validados (null: sin dato, fuera de rango o sin sensor) */
interface ValoresDia {
  tmax: number | null;
  tmin: number | null;
  lluvia: number | null;
  hrMax: number | null;
  hrMin: number | null;
  vientoMedio: number | null;
  vientoMax: number | null;
  radiacion: number | null;
  et: number | null;
  hoja: number | null;
}

interface FilaEstacion {
  id: string;
  nombre: string;
  /** Localidad, departamento y provincia, como en Red de estaciones */
  lugar: string;
  zona: string;
  /** null: la estación no tiene la fila de ese día */
  valores: ValoresDia | null;
}

interface GrupoZona {
  titulo: string;
  filas: FilaEstacion[];
}

/** Rango físico aceptado de cada variable; afuera son valores de error o de relleno (−99,9) */
const RANGOS: Record<keyof ValoresDia, [number, number]> = {
  tmax: [-25, 50],
  tmin: [-25, 50],
  lluvia: [0, 500],
  hrMax: [0, 100],
  hrMin: [0, 100],
  vientoMedio: [0, 200],
  vientoMax: [0, 250],
  radiacion: [0, 1500],
  et: [0, 20],
  hoja: [0, 24]
};

function numero(v: number | string | null | undefined, clave: keyof ValoresDia): number | null {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(v);
  const [min, max] = RANGOS[clave];
  return isNaN(n) || n < min || n > max ? null : n;
}

/**
 * Valores del día validados. Además del rango, descarta los ceros que un sensor no puede dar:
 * cuando el sensor falla, la fila del día sale con ceros (en noviembre de 2026 La Argentina
 * marcaba 1802,6 °C y su fila tenía máxima, mínima y humedad en 0).
 *   - máxima igual a la mínima: el termómetro no varió en todo el día;
 *   - humedad máxima 0 %;
 *   - radiación media 0 en un día completo (sin sensor de radiación o sensor caído); la ET se
 *     calcula con la radiación, así que tampoco vale;
 *   - ráfaga máxima 0 en un día completo (anemómetro caído).
 */
function valoresDe(r: RegistroDiario, diaCompleto: boolean): ValoresDia {
  const v: ValoresDia = {
    tmax: numero(r.temp_max, 'tmax'),
    tmin: numero(r.temp_min, 'tmin'),
    lluvia: numero(r.rr_24, 'lluvia'),
    hrMax: numero(r.HR_max, 'hrMax'),
    hrMin: numero(r.HR_min, 'hrMin'),
    vientoMedio: numero(r.viento_medio, 'vientoMedio'),
    vientoMax: numero(r.viento_max, 'vientoMax'),
    radiacion: numero(r.rad_solar_media, 'radiacion'),
    et: numero(r.et, 'et'),
    hoja: numero(r.hum_hoja_hs, 'hoja')
  };
  if (v.tmax !== null && v.tmax === v.tmin) v.tmax = v.tmin = null;
  if (v.hrMax === 0) v.hrMax = v.hrMin = null;
  if (diaCompleto && v.radiacion === 0) v.radiacion = v.et = null;
  if (diaCompleto && v.vientoMax === 0) v.vientoMax = v.vientoMedio = null;
  return v;
}

/** Minúsculas y sin tildes, para que «tafi» encuentre «Tafí» */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

const RESUMEN_DATE_FORMATS = {
  parse: { dateInput: 'DD/MM/YYYY' },
  display: {
    dateInput: 'DD/MM/YYYY',
    monthYearLabel: 'MMM YYYY',
    dateA11yLabel: 'LL',
    monthYearA11yLabel: 'MMMM YYYY',
  },
};

@Injectable()
class ResumenDateAdapter extends NativeDateAdapter {
  override parse(value: unknown): Date | null {
    if (typeof value === 'string' && value.indexOf('/') > -1) {
      const [day, month, year] = value.split('/');
      const date = new Date(+year, +month - 1, +day);
      return isNaN(date.getTime()) ? null : date;
    }
    return super.parse(value);
  }

  override format(date: Date): string {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    return `${day}/${month}/${date.getFullYear()}`;
  }
}

/**
 * Resumen de un día en todas las estaciones habilitadas, agrupadas por zona como en Red de
 * estaciones: máxima, mínima, lluvia, humedad, viento, radiación, ET y hoja mojada de
 * datos_diarios. Usa resumen-diario.php (una consulta); si no está instalado, pide
 * datos-diarios.php estación por estación.
 */
@Component({
  selector: 'app-resumen-diario-dialog',
  standalone: true,
  imports: [
    EncabezadoDialogoComponent, ComoSeLeeComponent, CopiarEnlaceComponent,
    CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule,
    MatIconModule, MatDatepickerModule, MatNativeDateModule, MatProgressBarModule
  ],
  providers: [
    { provide: MAT_DATE_LOCALE, useValue: 'es-AR' },
    { provide: DateAdapter, useClass: ResumenDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: RESUMEN_DATE_FORMATS }
  ],
  templateUrl: './resumen-diario-dialog.component.html',
  styleUrls: ['./resumen-diario-dialog.component.css']
})
export class ResumenDiarioDialogComponent implements OnInit, OnDestroy {
  readonly hoy = new Date();
  fecha: Date = new Date(this.hoy.getFullYear(), this.hoy.getMonth(), this.hoy.getDate());
  /** Fecha de los datos que se muestran (puede diferir de la del campo hasta consultar) */
  fechaMostrada = '';

  /** Filtros de la lista: se aplican sin volver a consultar */
  zona = '';
  busqueda = '';

  readonly zonas = Object.entries(ZONA_LABELS).map(([id, nombre]) => ({ id, nombre }));

  private estaciones: WeatherStation[] = [];
  filas: FilaEstacion[] = [];
  grupos: GrupoZona[] = [];

  cargando = false;
  error = '';
  private pedido?: Subscription;

  readonly fuente = FUENTE_TEXTO;

  readonly enlaceConsulta = (): string => armarEnlace('resumen-diario', { fecha: this.fecha });

  constructor(
    private weatherService: WeatherService,
    private dialogRef: MatDialogRef<ResumenDiarioDialogComponent>,
    @Inject(MAT_DIALOG_DATA) data: unknown
  ) {
    const desdeEnlace = leerFecha(consultaDe(data)['fecha']);
    if (desdeEnlace && desdeEnlace <= this.hoy) this.fecha = desdeEnlace;
  }

  ngOnInit(): void {
    this.weatherService.getStationsAll().subscribe({
      next: lista => {
        this.estaciones = lista
          .filter(s => Number(s.habilitada ?? 0) > 0)
          .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
        this.consultar();
      },
      error: () => this.error = 'No se pudieron cargar las estaciones. Probá de nuevo en un rato.'
    });
  }

  ngOnDestroy(): void {
    this.pedido?.unsubscribe();
  }

  get esHoy(): boolean {
    return this.fechaMostrada === fechaIso(this.hoy);
  }

  get fechaTexto(): string {
    const [a, m, d] = this.fechaMostrada.split('-');
    return `${d}/${m}/${a}`;
  }

  consultar(): void {
    if (!this.fecha || isNaN(this.fecha.getTime()) || !this.estaciones.length) return;
    const fecha = fechaIso(this.fecha);
    this.pedido?.unsubscribe();
    this.cargando = true;
    this.error = '';

    this.pedido = this.registrosDelDia(fecha).subscribe({
      next: registros => {
        this.fechaMostrada = fecha;
        this.filas = this.estaciones.map(s => {
          const r = registros.get(s.Identificacion);
          return {
            id: s.Identificacion,
            nombre: s.nombre,
            lugar: [...new Set([s.Localidad || s.nombre, s.departamento, s.provincia].map(t => (t ?? '').trim()).filter(Boolean))].join(', '),
            zona: ZONA_LABELS[s.zona ?? ''] ? s.zona! : '',
            valores: r ? valoresDe(r, fecha < fechaIso(this.hoy)) : null
          };
        });
        this.armarGrupos();
        this.cargando = false;
      },
      error: () => {
        this.error = 'No se pudieron cargar los datos del día. Probá de nuevo en un rato.';
        this.cargando = false;
      }
    });
  }

  /** resumen-diario.php; si falla (todavía no instalado), datos-diarios.php de cada estación */
  private registrosDelDia(fecha: string): Observable<Map<string, RegistroDiario>> {
    const porEstacion = (): Observable<Map<string, RegistroDiario>> => forkJoin(
      this.estaciones.map(s => this.weatherService.getWeatherDataDiary<RegistroDiario & { fecha: string }>(fecha, fecha, s.Identificacion).pipe(
        map(r => (r.data ?? []).find(d => d.fecha === fecha) ?? null),
        catchError(() => of(null))
      ))
    ).pipe(map(lista => new Map(
      lista.flatMap((r, i) => r ? [[this.estaciones[i].Identificacion, r] as [string, RegistroDiario]] : [])
    )));

    return this.weatherService.getResumenDiario(fecha).pipe(
      map(r => {
        if (r?.status !== 'success' || !Array.isArray(r.data)) throw new Error('respuesta inesperada');
        return new Map(r.data.map(d => [String(d.identificacion), d as RegistroDiario]));
      }),
      catchError(() => porEstacion())
    );
  }

  filtrar(): void {
    this.armarGrupos();
  }

  private armarGrupos(): void {
    const q = normalizar(this.busqueda);
    const filas = this.filas.filter(f =>
      (!this.zona || f.zona === this.zona) && (!q || normalizar(`${f.nombre} ${f.lugar}`).includes(q)));
    this.grupos = [...Object.keys(ZONA_LABELS), '']
      .map(clave => ({
        titulo: clave ? ZONA_LABELS[clave] : OTRAS_ESTACIONES,
        filas: filas.filter(f => f.zona === clave)
      }))
      .filter(g => g.filas.length);
  }

  get conDatos(): number {
    return this.filas.filter(f => f.valores).length;
  }

  /** Estación con el valor más alto (o más bajo) de una variable, para el resumen de arriba */
  extremo(clave: keyof ValoresDia, mayor: boolean): { valor: number; nombre: string } | null {
    let mejor: { valor: number; nombre: string } | null = null;
    for (const f of this.filas) {
      const v = f.valores?.[clave];
      if (v === null || v === undefined) continue;
      if (!mejor || (mayor ? v > mejor.valor : v < mejor.valor)) mejor = { valor: v, nombre: f.nombre };
    }
    return mejor;
  }

  /** Número con coma decimal o «—» */
  v(n: number | null | undefined, decimales = 1): string {
    return n === null || n === undefined ? SIN_DATO : formatDecimal(n, decimales);
  }

  /** Dos valores juntos («81 / 50»); «—» si faltan los dos */
  par(a: number | null | undefined, b: number | null | undefined, decimales = 1): string {
    if ((a ?? null) === null && (b ?? null) === null) return SIN_DATO;
    return `${this.v(a, decimales)} / ${this.v(b, decimales)}`;
  }

  trackFila(_: number, f: FilaEstacion): string {
    return f.id;
  }

  close(): void {
    this.dialogRef.close();
  }
}
