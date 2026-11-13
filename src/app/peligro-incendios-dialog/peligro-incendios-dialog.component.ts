import { Component, Inject, Injectable, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
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
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData, Plugin } from 'chart.js';
import { GRID_COLOR, VAR_COLOR, conAlfa } from '../charts/chart-theme';
import { DiaFwi, EstimadoFwi, WeatherService, WeatherStation } from '../services/weather.service';
import { CopiarEnlaceComponent } from '../shared/copiar-enlace.component';
import { ComoSeLeeComponent } from '../shared/como-se-lee.component';
import { EncabezadoDialogoComponent } from '../shared/encabezado-dialogo.component';
import { ExportarGraficoComponent } from '../shared/exportar-grafico.component';
import { armarEnlace, consultaDe, fechaIso, leerFecha } from '../shared/enlace-consulta';
import { OTRAS_ESTACIONES, ZONA_LABELS } from '../shared/zonas';
import { formatDecimal, SIN_DATO } from '../pipes/valor.pipe';
import { FUENTE_TEXTO } from '../shared/fuente';

/** Clase de peligro según el FWI */
export interface ClasePeligro {
  nombre: string;
  /** Límite inferior del FWI (incluido) */
  desde: number;
  color: string;
  /** Color del texto sobre el color de la clase */
  texto: string;
}

/**
 * Clases de peligro PROVISORIAS: los cortes del European Forest Fire Information System (EFFIS).
 * Hay que reemplazarlas por las que defina la Sección (o el Servicio Nacional de Manejo del
 * Fuego) para la región.
 */
export const CLASES_PELIGRO: ClasePeligro[] = [
  { nombre: 'Muy bajo', desde: 0, color: '#2b8a3e', texto: '#ffffff' },
  { nombre: 'Bajo', desde: 5.2, color: '#94c11f', texto: '#1f2a0a' },
  { nombre: 'Moderado', desde: 11.2, color: '#f2c14e', texto: '#3d2e00' },
  { nombre: 'Alto', desde: 21.3, color: '#ef8a17', texto: '#2b1600' },
  { nombre: 'Muy alto', desde: 38, color: '#d9480f', texto: '#ffffff' },
  { nombre: 'Extremo', desde: 50, color: '#7f1d1d', texto: '#ffffff' }
];

export function clasePeligro(fwi: number | null): ClasePeligro | null {
  if (fwi === null) return null;
  return [...CLASES_PELIGRO].reverse().find(c => fwi >= c.desde) ?? CLASES_PELIGRO[0];
}

/** Cómo se estimó un valor faltante (claves de `estimado` de incendio-fwi.php) */
const MOTIVOS: Record<string, string> = {
  hora: 'registro más cercano a las 12 h',
  vecinas: 'promedio de estaciones vecinas',
  interpolado: 'promedio del día anterior y del siguiente',
  anterior: 'valor del día anterior',
  incompleta: 'registros de lluvia incompletos',
  'sin-dato': 'sin registros de lluvia: se tomó 0 mm',
  inicio: 'el cálculo arrancó con los valores iniciales (FFMC 85, DMC 6, DC 15)'
};

const NOMBRE_VALOR: Record<keyof EstimadoFwi, string> = {
  temp: 'Temperatura',
  hr: 'Humedad',
  viento: 'Viento',
  lluvia: 'Lluvia',
  codigos: 'Códigos de humedad'
};

/** Días del gráfico de evolución */
const DIAS_SERIE = 90;

interface FilaEstacion {
  id: string;
  nombre: string;
  lugar: string;
  zona: string;
  /** null: no hay cálculo de ese día */
  dia: DiaFwi | null;
  clase: ClasePeligro | null;
}

interface GrupoZona {
  titulo: string;
  filas: FilaEstacion[];
}

/** Minúsculas y sin tildes, para que «tafi» encuentre «Tafí» */
function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** El día en curso se calcula desde las 13 h (hace falta el registro de las 12 h) */
function ultimoDiaCalculable(ahora: Date): Date {
  const d = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  if (ahora.getHours() < 13) d.setDate(d.getDate() - 1);
  return d;
}

const FWI_DATE_FORMATS = {
  parse: { dateInput: 'DD/MM/YYYY' },
  display: {
    dateInput: 'DD/MM/YYYY',
    monthYearLabel: 'MMM YYYY',
    dateA11yLabel: 'LL',
    monthYearA11yLabel: 'MMMM YYYY',
  },
};

@Injectable()
class FwiDateAdapter extends NativeDateAdapter {
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

/** Franjas de color de las clases de peligro detrás de la línea del FWI */
const pluginFranjas: Plugin<'bar' | 'line'> = {
  id: 'franjasPeligro',
  beforeDatasetsDraw(chart) {
    const y = chart.scales['y'];
    if (!y) return;
    const { ctx, chartArea: area } = chart;
    ctx.save();
    CLASES_PELIGRO.forEach((c, i) => {
      const hasta = CLASES_PELIGRO[i + 1]?.desde ?? Infinity;
      const arriba = Math.max(area.top, y.getPixelForValue(Math.min(hasta, y.max)));
      const abajo = Math.min(area.bottom, y.getPixelForValue(Math.max(c.desde, y.min)));
      if (abajo <= arriba) return;
      ctx.fillStyle = conAlfa(c.color, .14);
      ctx.fillRect(area.left, arriba, area.right - area.left, abajo - arriba);
    });
    ctx.restore();
  }
};

/**
 * Índice meteorológico de peligro de incendios forestales (FWI) del sistema canadiense, ajustado
 * al hemisferio sur, en todas las estaciones: lo calcula incendio-fwi.php con los registros del
 * mediodía y lo guarda día por día. Muestra el día elegido por zona y la evolución de una estación.
 */
@Component({
  selector: 'app-peligro-incendios-dialog',
  standalone: true,
  imports: [
    EncabezadoDialogoComponent, ComoSeLeeComponent, CopiarEnlaceComponent, ExportarGraficoComponent,
    CommonModule, FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule,
    MatIconModule, MatDatepickerModule, MatNativeDateModule, MatProgressBarModule, BaseChartDirective
  ],
  providers: [
    { provide: MAT_DATE_LOCALE, useValue: 'es-AR' },
    { provide: DateAdapter, useClass: FwiDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: FWI_DATE_FORMATS }
  ],
  templateUrl: './peligro-incendios-dialog.component.html',
  styleUrls: ['./peligro-incendios-dialog.component.css']
})
export class PeligroIncendiosDialogComponent implements OnInit, OnDestroy {
  readonly hoy = new Date();
  readonly maxFecha = ultimoDiaCalculable(this.hoy);
  fecha: Date = new Date(this.maxFecha);
  fechaMostrada = '';

  zona = '';
  busqueda = '';
  readonly zonas = Object.entries(ZONA_LABELS).map(([id, nombre]) => ({ id, nombre }));
  readonly clases = CLASES_PELIGRO;

  estaciones: WeatherStation[] = [];
  filas: FilaEstacion[] = [];
  grupos: GrupoZona[] = [];

  /** Estación del gráfico de evolución */
  estacionSerie = '';
  serieData: ChartData<'bar' | 'line', (number | null)[], string> = { labels: [], datasets: [] };
  serieVacia = false;
  cargandoSerie = false;
  readonly pluginsSerie = [pluginFranjas];

  readonly serieOptions: ChartConfiguration<'bar' | 'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top', labels: { boxWidth: 12 } },
      tooltip: {
        callbacks: {
          label: c => {
            const v = c.parsed.y;
            if (v === null || v === undefined) return `${c.dataset.label}: ${SIN_DATO}`;
            const clase = c.dataset.yAxisID === 'y' ? ` (${clasePeligro(v)?.nombre})` : '';
            return `${c.dataset.label}: ${formatDecimal(v, 1)}${clase}`;
          }
        }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12 } },
      y: { beginAtZero: true, suggestedMax: 25, title: { display: true, text: 'FWI' }, grid: { color: GRID_COLOR } },
      y1: {
        position: 'right', beginAtZero: true, suggestedMax: 20, title: { display: true, text: 'Lluvia (mm)' },
        grid: { display: false }
      }
    }
  };

  cargando = false;
  error = '';
  /** Días que el servidor todavía no calculó (la primera vez completa el cálculo de a tandas) */
  pendientes = 0;
  calculadoHasta: string | null = null;
  inicio = '';
  private pedido?: Subscription;
  private pedidoSerie?: Subscription;

  readonly fuente = FUENTE_TEXTO;

  readonly enlaceConsulta = (): string =>
    armarEnlace('peligro-incendios', { fecha: this.fecha, estacion: this.estacionSerie });

  constructor(
    private weatherService: WeatherService,
    private dialogRef: MatDialogRef<PeligroIncendiosDialogComponent>,
    @Inject(MAT_DIALOG_DATA) data: unknown
  ) {
    const consulta = consultaDe(data);
    const desdeEnlace = leerFecha(consulta['fecha']);
    if (desdeEnlace && desdeEnlace <= this.maxFecha) this.fecha = desdeEnlace;
    this.estacionSerie = consulta['estacion'] ?? '';
  }

  ngOnInit(): void {
    this.weatherService.getStationsAll().subscribe({
      next: lista => {
        this.estaciones = lista
          .filter(s => Number(s.habilitada ?? 0) > 0)
          .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
        if (!this.estaciones.some(s => s.Identificacion === this.estacionSerie)) {
          this.estacionSerie = this.estaciones[0]?.Identificacion ?? '';
        }
        this.consultar();
      },
      error: () => this.error = 'No se pudieron cargar las estaciones. Probá de nuevo en un rato.'
    });
  }

  ngOnDestroy(): void {
    this.pedido?.unsubscribe();
    this.pedidoSerie?.unsubscribe();
  }

  get fechaTexto(): string {
    return this.textoFecha(this.fechaMostrada);
  }

  textoFecha(iso: string | null): string {
    if (!iso) return '';
    const [a, m, d] = iso.split('-');
    return `${d}/${m}/${a}`;
  }

  consultar(): void {
    if (!this.fecha || isNaN(this.fecha.getTime()) || !this.estaciones.length) return;
    const fecha = fechaIso(this.fecha);
    this.pedido?.unsubscribe();
    this.cargando = true;
    this.error = '';

    this.pedido = this.weatherService.getFwiDia(fecha).subscribe({
      next: r => {
        if (r?.status !== 'success' || !Array.isArray(r.data)) {
          this.error = 'No se pudo calcular el índice. Probá de nuevo en un rato.';
          this.cargando = false;
          return;
        }
        const dias = new Map(r.data.map(d => [String(d.identificacion), d as DiaFwi]));
        this.fechaMostrada = fecha;
        this.pendientes = r.pendientes ?? 0;
        this.calculadoHasta = r.calculadoHasta;
        this.inicio = r.inicio;
        this.filas = this.estaciones.map(s => {
          const dia = dias.get(s.Identificacion) ?? null;
          return {
            id: s.Identificacion,
            nombre: s.nombre,
            lugar: [...new Set([s.Localidad || s.nombre, s.departamento, s.provincia].map(t => (t ?? '').trim()).filter(Boolean))].join(', '),
            zona: ZONA_LABELS[s.zona ?? ''] ? s.zona! : '',
            dia,
            clase: clasePeligro(dia?.fwi ?? null)
          };
        });
        this.armarGrupos();
        this.cargando = false;
        this.cargarSerie();
      },
      error: () => {
        this.error = 'No se pudo calcular el índice. Probá de nuevo en un rato.';
        this.cargando = false;
      }
    });
  }

  /** Evolución de los últimos DIAS_SERIE días hasta la fecha consultada */
  cargarSerie(): void {
    if (!this.estacionSerie || !this.fechaMostrada) return;
    const hasta = leerFecha(this.fechaMostrada)!;
    const desde = new Date(hasta);
    desde.setDate(desde.getDate() - DIAS_SERIE + 1);
    this.pedidoSerie?.unsubscribe();
    this.cargandoSerie = true;
    this.pedidoSerie = this.weatherService.getFwiSerie(this.estacionSerie, fechaIso(desde), this.fechaMostrada).subscribe({
      next: r => {
        const datos = r?.status === 'success' && Array.isArray(r.data) ? r.data : [];
        this.serieVacia = !datos.some(d => d.fwi !== null);
        this.serieData = {
          labels: datos.map(d => this.textoFecha(d.fecha).slice(0, 5)),
          datasets: [
            {
              type: 'line', label: 'FWI', data: datos.map(d => d.fwi), yAxisID: 'y', order: 1,
              borderColor: '#9a3412', backgroundColor: '#9a3412', borderWidth: 2, pointRadius: 0,
              pointHoverRadius: 4, spanGaps: false, tension: .2
            },
            {
              type: 'bar', label: 'Lluvia de 12 a 12 h (mm)', data: datos.map(d => d.lluvia), yAxisID: 'y1', order: 2,
              backgroundColor: conAlfa(VAR_COLOR.lluvia, .6), borderWidth: 0
            }
          ]
        };
        this.cargandoSerie = false;
      },
      error: () => {
        this.serieVacia = true;
        this.serieData = { labels: [], datasets: [] };
        this.cargandoSerie = false;
      }
    });
  }

  verEvolucion(f: FilaEstacion): void {
    this.estacionSerie = f.id;
    this.cargarSerie();
    document.getElementById('fwi-evolucion')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  get nombreSerie(): string {
    return this.estaciones.find(s => s.Identificacion === this.estacionSerie)?.nombre ?? '';
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
    return this.filas.filter(f => f.dia?.fwi !== null && f.dia?.fwi !== undefined).length;
  }

  /** Estaciones en cada clase, para el resumen de arriba */
  get conteoClases(): { clase: ClasePeligro; cantidad: number }[] {
    return this.clases
      .map(clase => ({ clase, cantidad: this.filas.filter(f => f.clase === clase).length }))
      .filter(c => c.cantidad > 0);
  }

  get maximo(): FilaEstacion | null {
    return this.filas.reduce<FilaEstacion | null>((max, f) =>
      f.dia?.fwi !== null && f.dia?.fwi !== undefined && (!max || f.dia.fwi > max.dia!.fwi!) ? f : max, null);
  }

  /** ¿El valor se estimó? (temperatura, humedad, viento o lluvia) */
  estimado(f: FilaEstacion, clave: keyof EstimadoFwi): boolean {
    return !!f.dia?.estimado?.[clave];
  }

  /** Texto con los valores estimados de una estación, o '' si todos son medidos */
  estimaciones(f: FilaEstacion): string {
    const e = f.dia?.estimado ?? {};
    return (Object.keys(e) as (keyof EstimadoFwi)[])
      .map(k => `${NOMBRE_VALOR[k]}: ${k === 'codigos' && e.codigos === 'vecinas'
        ? 'el cálculo arrancó con los códigos de las vecinas' : MOTIVOS[e[k]!] ?? e[k]}`)
      .join('. ');
  }

  v(n: number | null | undefined, decimales = 1): string {
    return n === null || n === undefined ? SIN_DATO : formatDecimal(n, decimales);
  }

  trackFila(_: number, f: FilaEstacion): string {
    return f.id;
  }

  close(): void {
    this.dialogRef.close();
  }
}
