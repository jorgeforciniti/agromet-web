import { Component, Inject, Injectable, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { BaseChartDirective } from 'ng2-charts';
import { Chart, ChartData, ChartDataset } from 'chart.js';
import { VAR_COLOR, conAlfa } from '../charts/chart-theme';
import { LineaReferencia, referenciaCalor, referenciaNocheCalida, referenciasHelada } from '../charts/referencias';
import { dibujarFranjasSinDatos } from '../charts/dias-faltantes';
import { ClaveNormal, Normales, datasetNormal, normalDelDia, normalDiaria, tieneValores } from '../charts/normales';
import { NormalesService } from '../services/normales.service';
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
import { WeatherService, WeatherStation } from '../services/weather.service';
import { StationService } from '../services/station.service';
import { SelectorEstacionComponent } from '../shared/selector-estacion.component';
import { ExportarGraficoComponent } from '../shared/exportar-grafico.component';
import { ComoSeLeeComponent } from '../shared/como-se-lee.component';
import { EncabezadoDialogoComponent } from '../shared/encabezado-dialogo.component';
import { CopiarEnlaceComponent } from '../shared/copiar-enlace.component';
import { AvisoBajasComponent, ConsultaBajas } from '../shared/aviso-bajas.component';
import { armarEnlace, consultaDe, leerFecha, leerNumero } from '../shared/enlace-consulta';


interface PhenologyDailyRecord {
  fecha: string;
  temp_max?: number | string | null;
  temp_min?: number | string | null;
  rr_24?: number | string | null;
  rad_solar_media?: number | string | null;
  et?: number | string | null;
  hum_hoja_hs?: number | string | null;
}

type CropKey = 'SOJA' | 'MAIZ' | 'CANA' | 'CITRUS';

interface CropPreset {
  key: CropKey;
  label: string;
  totalDays: number;
  milestones: string[];
  kcDefaults: number[];
  /** Hito de referencia: al cambiar su fecha se sugieren los siguientes */
  ancla: number;
  /** Días desde el hito de referencia para cada hito (null: anterior a la referencia) */
  desdeAncla: (number | null)[];
  /** Días antes de la referencia para los hitos previos (acumulación de lluvia) */
  antesDeAncla?: number;
  /** Fecha típica de la referencia en Tucumán [mes (0-11), día], para la consulta inicial */
  anclaTipica: [number, number];
}

interface StageWindow {
  label: string;
  start: Date;
  end: Date;
  kc: number;
}

interface StageSummary {
  label: string;
  start: string;
  end: string;
  spanDays: number;
  dataDays: number;
  coverage: number;
  kc: number;
  rain: number;
  eto: number;
  demand: number;
  balance: number;
  avgRadiation: number | null;
  leafWetnessHours: number;
  avgTempMax: number | null;
  avgTempMin: number | null;
  hotDays: number;
  frostDays: number;
  /** Días del estadío sin lluvia o sin ET (después de completar con la normal, si se pidió) */
  lluviaFaltante: number;
  demandaFaltante: number;
  /** Días con lluvia o ET completadas con la normal */
  estimados: number;
  /** Tramos sin registro y días con ET sin dato, para mostrar en la tabla */
  faltantes: string;
}

interface TotalsSummary {
  stationName: string;
  cropLabel: string;
  start: string;
  end: string;
  rain: number;
  demand: number;
  balance: number;
  validDays: number;
  totalDays: number;
  lluviaParcial: boolean;
  demandaParcial: boolean;
  estimados: number;
}

/** Un día del período consultado, tenga o no registro en la estación */
interface DiaCampania {
  fecha: string;
  conRegistro: boolean;
  tempMax: number | null;
  tempMin: number | null;
  /** null: sin dato */
  rain: number | null;
  radiation: number | null;
  /** null: sin registro, o ET y radiación en 0 a la vez (sensor sin dato) */
  eto: number | null;
  leafWetness: number | null;
  /** Valor completado con la normal de la estación */
  rainEstimada: boolean;
  etoEstimada: boolean;
}

const PHENOLOGY_DATE_FORMATS = {
  parse: {
    dateInput: 'DD/MM/YYYY',
  },
  display: {
    dateInput: 'DD/MM/YYYY',
    monthYearLabel: 'MMM YYYY',
    dateA11yLabel: 'LL',
    monthYearA11yLabel: 'MMMM YYYY',
  },
};

@Injectable()
class PhenologyDateAdapter extends NativeDateAdapter {
  override parse(value: unknown): Date | null {
    if (typeof value === 'string' && value.includes('/')) {
      const [day, month, year] = value.split('/').map(Number);
      const parsed = new Date(year, month - 1, day);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return super.parse(value);
  }

  override format(date: Date): string {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }
}

@Component({
  selector: 'app-phenology-weather-dialog',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [
    EncabezadoDialogoComponent, CopiarEnlaceComponent, AvisoBajasComponent,
    ComoSeLeeComponent,
    ExportarGraficoComponent,
    SelectorEstacionComponent,
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatProgressBarModule,
    BaseChartDirective
  ],
  providers: [
    { provide: MAT_DATE_LOCALE, useValue: 'es-AR' },
    { provide: DateAdapter, useClass: PhenologyDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: PHENOLOGY_DATE_FORMATS }
  ],
  templateUrl: './phenology-weather-dialog.component.html',
  styleUrls: ['./phenology-weather-dialog.component.css']
})
export class PhenologyWeatherDialogComponent implements OnInit {
  /*
   * Kc por defecto: FAO-56 (Allen et al., 1998, Riego y Drenaje 56, cuadro 12,
   * https://www.fao.org/4/x0490e/x0490e0b.htm), como pidió la Sección. Cada etapa toma el Kc de la
   * fase FAO que le corresponde (inicial, media o final); en las etapas de transición (desarrollo y
   * final), el promedio entre los dos valores vecinos, porque FAO-56 interpola linealmente entre ellos:
   *   soja: ini 0,40, med 1,15, fin 0,50 → 0,40 / 0,78 / 1,15 / 1,15 / 0,83
   *   maíz grano: ini 0,30, med 1,20, fin 0,35 (secado en el campo) → 0,30 / 0,75 / 1,20 / 0,35
   *   caña: ini 0,40, med 1,25, fin 0,75 → 0,40 / 0,40 / 0,83 / 1,25 / 1,00
   * Las duraciones de los hitos sugeridos no salen de FAO-56 (cuadro 11: soja 85 a 150 días según la
   * región; caña soca 280 a 420) y su origen sigue sin confirmar (ver la pregunta en el HTML).
   *
   * Cítricos: Kc de FAO-56, cuadro 12, «Citrus, no ground cover, 70 % canopy» (ini 0,70, med 0,65,
   * fin 0,70; con malezas o cobertura activa los valores son mayores: 0,75 / 0,70 / 0,75). Como es
   * perenne, el ciclo empieza en la brotación de primavera y dura un año (cuadro 11: 60 / 90 / 120 /
   * 95 días, 365 en total, para el Mediterráneo). Las etapas siguen el calendario típico del limón en
   * Tucumán: brotación y floración (septiembre-octubre), cuaje y caída fisiológica (noviembre-
   * diciembre), crecimiento del fruto (enero a mediados de marzo), maduración y cosecha principal de
   * otoño-invierno (abril a agosto). Los Kc de las etapas de transición (cuaje y maduración) son el
   * promedio de la interpolación lineal de FAO-56 entre los valores vecinos (0,675 → 0,68).
   * Pendiente de validar con la Sección Fruticultura/Citrus de la EEAOC.
   */
  readonly cropPresets: CropPreset[] = [
    {
      key: 'SOJA',
      label: 'Soja',
      totalDays: 210,
      milestones: ['Acumulación de lluvia', 'Siembra', 'R1', 'R5', 'R6', 'Cosecha'],
      kcDefaults: [0.4, 0.78, 1.15, 1.15, 0.83],
      ancla: 1,
      desdeAncla: [null, 0, 45, 80, 95, 135],
      antesDeAncla: 30,
      anclaTipica: [11, 15]
    },
    {
      key: 'MAIZ',
      label: 'Maíz',
      totalDays: 210,
      milestones: ['Acumulación de lluvia', 'Siembra', 'Período crítico', 'Madurez fisiológica', 'Cosecha'],
      kcDefaults: [0.3, 0.75, 1.2, 0.35],
      ancla: 1,
      desdeAncla: [null, 0, 55, 120, 150],
      antesDeAncla: 30,
      anclaTipica: [11, 20]
    },
    {
      key: 'CANA',
      label: 'Caña de azúcar',
      totalDays: 320,
      milestones: ['Emergencia', 'Brotación', 'Macollaje', 'Gran crecimiento', 'Maduración', 'Cosecha'],
      kcDefaults: [0.4, 0.4, 0.83, 1.25, 1.0],
      ancla: 0,
      desdeAncla: [0, 30, 60, 120, 240, 320],
      anclaTipica: [8, 15]
    },
    {
      // Perenne: la referencia es el inicio de la brotación y el ciclo termina en la siguiente
      key: 'CITRUS',
      label: 'Cítricos',
      totalDays: 365,
      milestones: ['Brotación', 'Cuaje', 'Crecimiento del fruto', 'Maduración', 'Cosecha', 'Nueva brotación'],
      kcDefaults: [0.7, 0.68, 0.65, 0.68, 0.7],
      ancla: 0,
      desdeAncla: [0, 60, 120, 195, 240, 365],
      anclaTipica: [8, 1]
    }
  ];

  readonly data: Record<string, unknown>;
  readonly stageChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        ticks: { color: '#111827', maxRotation: 0, autoSkip: false, font: { size: 11, weight: 700 } },
        grid: { display: false }
      },
      y: {
        ticks: { color: '#111827', font: { weight: 700 } },
        grid: { color: 'rgba(17,24,39,.10)' }
      }
    },
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: { color: '#111827', boxWidth: 12, boxHeight: 8, font: { size: 11, weight: 700 } }
      },
      tooltip: {
        callbacks: {
          afterLabel: (ctx: { datasetIndex: number; dataIndex: number }) => this.notaEstadio(ctx.datasetIndex, ctx.dataIndex)
        }
      }
    }
  };
  readonly cumulativeChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        ticks: { color: '#111827', maxRotation: 0, autoSkip: true, autoSkipPadding: 10 },
        grid: { display: false }
      },
      y: {
        ticks: { color: '#111827', font: { weight: 700 } },
        grid: { color: 'rgba(17,24,39,.10)' }
      }
    },
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: { color: '#111827', boxWidth: 12, boxHeight: 8, font: { size: 11, weight: 700 } }
      }
    },
    elements: {
      line: {
        tension: 0.25
      }
    }
  } as const;

  /** Gráficos diarios de temperaturas y de radiación solar (uno por variable) */
  // Helada y 35 °C (los umbrales que cuenta la tabla: días ≥ 35 / ≤ 0) y mínima de 22 °C
  readonly tempChartOptions = this.conReferencias(this.opcionesDiarias('Temperatura (°C)', false),
    [...referenciasHelada(), referenciaNocheCalida(), referenciaCalor()]);
  readonly radChartOptions = this.opcionesDiarias('Radiación solar (W/m²)', true);

  /**
   * Gráficos diarios: franjas grises en los días sin registro de la estación y una línea
   * punteada con el nombre del hito donde empieza cada etapa.
   */
  readonly pluginsAcumulado = [{
    id: 'franjasSinDatos',
    beforeDatasetsDraw: (chart: Chart) => {
      const x = chart.scales['x'];
      const area = chart.chartArea;
      if (!x || !area) return;
      const total = chart.data.labels?.length ?? 0;
      const ancho = total > 1 ? Math.abs(x.getPixelForValue(1) - x.getPixelForValue(0)) : area.width;
      dibujarFranjasSinDatos(chart, this.indicesSinRegistro);
      const ctx = chart.ctx;
      ctx.save();
      // Inicio de cada etapa
      ctx.strokeStyle = 'rgba(71, 84, 103, .55)';
      ctx.fillStyle = '#475467';
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.font = '600 10px sans-serif';
      ctx.textBaseline = 'top';
      // Si el nombre no entra antes del siguiente, baja un renglón para no superponerse
      let finAnterior = -Infinity;
      let fila = 0;
      for (const h of this.inicioEtapas) {
        const px = x.getPixelForValue(h.indice) - ancho / 2;
        ctx.beginPath();
        ctx.moveTo(px, area.top);
        ctx.lineTo(px, area.bottom);
        ctx.stroke();
        fila = px + 3 < finAnterior ? (fila + 1) % 2 : 0;
        ctx.fillText(h.nombre, px + 3, area.top + 2 + fila * 12);
        finAnterior = Math.max(finAnterior, px + 3 + ctx.measureText(h.nombre).width + 4);
      }
      ctx.restore();
    }
  }];

  form!: FormGroup;
  stations: WeatherStation[] = [];
  isLoading = false;
  loadError = '';
  /** Estación y período consultados, para el aviso de sensores dados de baja */
  consultaBajas: ConsultaBajas | ConsultaBajas[] | null = null;
  summaries: StageSummary[] = [];
  totals: TotalsSummary | null = null;
  stageChartData: ChartData<'bar', number[], string | string[]> = { labels: [], datasets: [] };
  cumulativeChartData: ChartData<'line', number[], string> = { labels: [], datasets: [] };
  tempChartData: ChartData<'line', (number | null)[], string> = { labels: [], datasets: [] };
  radChartData: ChartData<'bar' | 'line', (number | null)[], string> = { labels: [], datasets: [] };
  /** Posición (índice del día) y nombre corto del hito donde empieza cada etapa */
  inicioEtapas: { indice: number; nombre: string }[] = [];

  /** Hitos completados por la sugerencia (se desmarcan si el usuario los cambia) */
  readonly sugeridos = new Set<number>();

  /** Datos faltantes: calendario completo, normales y opción de completar con ellas */
  completarConNormal = false;
  puedeCompletar = false;
  diasFaltantes = 0;
  diasEstimados = 0;
  indicesSinRegistro: number[] = [];
  private diasBase: DiaCampania[] = [];
  private ventanas: StageWindow[] = [];
  private normales: Normales | null = null;

  /** Favoritas del usuario, para mostrarlas primero en el selector */
  readonly favoritas$ = inject(StationService).favoritas$;

  private readonly normalesService = inject(NormalesService);

  /**
   * Enlace con la consulta completa (A5 y F5 del informe de mejoras): estación, cultivo, fechas de
   * los hitos (siembra o emergencia incluida), Kc de cada etapa y si se aplica. Así una consulta
   * guardada conserva la fecha de siembra de cada lote.
   */
  readonly enlaceConsulta = (): string => {
    const v = this.form.getRawValue();
    const params: Record<string, string | number | Date | null> = {
      estacion: v.station, cultivo: v.crop, kc: v.applyKc ? 1 : 0
    };
    [1, 2, 3, 4, 5, 6].forEach(n => params[`m${n}`] = this.coerceDate(v[`m${n}`]));
    [1, 2, 3, 4, 5].forEach(n => params[`kc${n}`] = v[`kc${n}`]);
    return armarEnlace('fenologia', params);
  };

  constructor(
    private fb: FormBuilder,
    private weatherService: WeatherService,
    private stationService: StationService,
    private dialogRef: MatDialogRef<PhenologyWeatherDialogComponent>,
    @Inject(MAT_DIALOG_DATA) dialogData: Record<string, unknown> | null
  ) {
    this.data = dialogData ?? {};
  }

  ngOnInit(): void {
    this.form = this.fb.group({
      station: [this.stationService.activa, Validators.required],
      crop: ['SOJA', Validators.required],
      applyKc: [true],
      m1: [null as Date | null, Validators.required],
      m2: [null as Date | null, Validators.required],
      m3: [null as Date | null, Validators.required],
      m4: [null as Date | null, Validators.required],
      m5: [null as Date | null, Validators.required],
      m6: [null as Date | null],
      kc1: [0.4, [Validators.required, Validators.min(0)]],
      kc2: [0.78, [Validators.required, Validators.min(0)]],
      kc3: [1.15, [Validators.required, Validators.min(0)]],
      kc4: [1.15, [Validators.required, Validators.min(0)]],
      kc5: [0.83, [Validators.required, Validators.min(0)]]
    }, { validators: this.milestoneOrderValidator.bind(this) });

    this.applyCropPreset('SOJA');
    this.aplicarConsulta();

    // Cambiar la fecha de referencia (siembra, emergencia o brotación) sugiere las siguientes; cambiar
    // a mano un hito sugerido lo deja como fecha propia.
    [1, 2, 3, 4, 5, 6].forEach(n => {
      this.form.controls[`m${n}`].valueChanges.subscribe(() => {
        if (n - 1 === this.activePreset.ancla) {
          this.sugerirDesdeAncla();
        } else {
          this.sugeridos.delete(n - 1);
        }
      });
    });

    this.form.controls['crop'].valueChanges.subscribe((crop) => {
      this.applyCropPreset(crop as CropKey);
      this.resetResults();
    });

    // La estación elegida acá pasa a ser la activa del sitio (ver StationService)
    this.form.controls['station'].valueChanges.subscribe(id => this.stationService.setActiva(id));

    this.form.controls['applyKc'].valueChanges.subscribe(() => {
      if (this.summaries.length) {
        this.calculate();
      }
    });

    this.weatherService.getStationsAll().subscribe({
      next: (stations) => {
        this.stations = [...stations]
          .filter(st => st.Identificacion !== '20')
          .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
        this.calculate();
      },
      error: () => {
        this.loadError = 'No se pudieron cargar las estaciones para la consulta fenológica.';
      }
    });
  }

  close(): void {
    this.dialogRef.close();
  }

  /** Consulta recibida por enlace o consulta guardada: cultivo, hitos y Kc (la estación ya llega activa). */
  private aplicarConsulta(): void {
    const consulta = consultaDe(this.data);
    if (!Object.keys(consulta).length) return;
    const cultivo = consulta['cultivo'] as CropKey;
    if (this.cropPresets.some(c => c.key === cultivo)) {
      this.form.controls['crop'].setValue(cultivo, { emitEvent: false });
      this.applyCropPreset(cultivo);
    }
    const patch: Record<string, Date | number | boolean> = {};
    [1, 2, 3, 4, 5, 6].forEach(n => {
      const fecha = leerFecha(consulta[`m${n}`]);
      if (fecha) patch[`m${n}`] = fecha;
    });
    [1, 2, 3, 4, 5].forEach(n => {
      const kc = leerNumero(consulta[`kc${n}`]);
      if (kc !== null && kc >= 0) patch[`kc${n}`] = kc;
    });
    if (consulta['kc'] === '0' || consulta['kc'] === '1') patch['applyKc'] = consulta['kc'] === '1';
    // Sin eventos: las fechas del enlace no se reemplazan por las sugeridas
    this.form.patchValue(patch, { emitEvent: false });
    this.sugeridos.clear();
  }

  calculate(): void {
    this.form.markAllAsTouched();
    this.loadError = '';
    this.resetResults();

    if (this.form.invalid) {
      this.loadError = 'Revisá las fechas de los estadíos antes de consultar.';
      return;
    }

    const station = String(this.form.get('station')?.value ?? '');
    const windows = this.getStageWindows();
    if (!windows.length) {
      this.loadError = 'No se pudieron interpretar los estadíos fenológicos cargados.';
      return;
    }

    const overallStart = windows[0].start;
    const ultimoDia = new Date(windows[windows.length - 1].end.getTime() - 86400000);
    // Campaña en curso: se consulta hasta hoy (los días futuros no son datos faltantes)
    const hoy = this.startOfDay(new Date());
    const overallEnd = ultimoDia > hoy ? hoy : ultimoDia;

    if (overallStart > overallEnd) {
      this.loadError = 'El período fenológico resultante no es válido.';
      return;
    }

    this.isLoading = true;
    this.consultaBajas = { estacion: station, desde: this.formatApiDate(overallStart), hasta: this.formatApiDate(overallEnd) };

    forkJoin({
      daily: this.weatherService.getWeatherDataDiary<PhenologyDailyRecord>(
        this.formatApiDate(overallStart),
        this.formatApiDate(overallEnd),
        station
      ),
      normales: this.normalesService.deEstacion(station)
    }).subscribe({
      next: ({ daily, normales }) => {
        this.diasBase = this.armarCalendario(overallStart, overallEnd, daily.data ?? []);
        this.ventanas = windows;
        this.normales = normales;
        this.recalcular();
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
        this.loadError = 'No se pudieron obtener los datos diarios para el período seleccionado.';
      }
    });
  }

  stationLabel(stationId: string): string {
    const station = this.stations.find(st => st.Identificacion === stationId);
    return station ? `${station.Identificacion} - ${station.nombre}` : stationId;
  }

  cropLabel(cropKey: CropKey): string {
    return this.cropPresets.find(c => c.key === cropKey)?.label ?? cropKey;
  }

  milestoneLabel(index: number): string {
    return this.activePreset.milestones[index] ?? `Hito ${index + 1}`;
  }

  showMilestone(index: number): boolean {
    return index < this.activePreset.milestones.length;
  }

  showKc(index: number): boolean {
    return index < this.activePreset.kcDefaults.length;
  }

  kcLabel(index: number): string {
    const stageEnd = this.activePreset.milestones[index + 1] ?? `Etapa ${index + 1}`;
    return `Kc ${index + 1} · hasta ${stageEnd}`;
  }

  /** Algún estadío quedó con lluvia o ET incompletas (con o sin completar con la normal) */
  get hayParciales(): boolean {
    return this.summaries.some(s => s.lluviaFaltante > 0 || s.demandaFaltante > 0);
  }

  /** Color de la cobertura de datos: verde desde 95 %, ámbar desde 80 %, rojo por debajo */
  claseCobertura(porcentaje: number): string {
    return porcentaje >= 95 ? 'cobertura--ok' : porcentaje >= 80 ? 'cobertura--media' : 'cobertura--baja';
  }

  formatDisplayDate(date: string): string {
    const [year, month, day] = date.split('-');
    return `${day}/${month}/${year}`;
  }

  trackByStage(_: number, stage: StageSummary): string {
    return `${stage.label}-${stage.start}`;
  }

  private get activePreset(): CropPreset {
    const crop = (this.form?.get('crop')?.value as CropKey | null) ?? 'SOJA';
    return this.cropPresets.find(item => item.key === crop) ?? this.cropPresets[0];
  }

  private applyCropPreset(crop: CropKey): void {
    const preset = this.cropPresets.find(item => item.key === crop) ?? this.cropPresets[0];
    const milestones = this.buildDefaultMilestones(preset);
    const patch: Record<string, Date | number | boolean | null> = {
      m1: milestones[0] ?? null,
      m2: milestones[1] ?? null,
      m3: milestones[2] ?? null,
      m4: milestones[3] ?? null,
      m5: milestones[4] ?? null,
      m6: milestones[5] ?? null,
      kc1: preset.kcDefaults[0] ?? 1,
      kc2: preset.kcDefaults[1] ?? 1,
      kc3: preset.kcDefaults[2] ?? 1,
      kc4: preset.kcDefaults[3] ?? 1,
      kc5: preset.kcDefaults[4] ?? 1
    };

    this.form.patchValue(patch, { emitEvent: false });
    this.sugerirDesdeAncla();
  }

  /**
   * Completa los hitos posteriores a la referencia (siembra, emergencia o brotación) con las duraciones
   * típicas del cultivo, y los anteriores (acumulación de lluvia) con su anticipación.
   * Se pueden cambiar después; un hito cambiado a mano deja de figurar como sugerido.
   */
  private sugerirDesdeAncla(): void {
    const preset = this.activePreset;
    const ancla = this.coerceDate(this.form.get(`m${preset.ancla + 1}`)?.value);
    this.sugeridos.clear();
    if (!ancla) return;

    const patch: Record<string, Date> = {};
    preset.milestones.forEach((_, i) => {
      if (i === preset.ancla) return;
      const dias = i < preset.ancla ? -(preset.antesDeAncla ?? 30) * (preset.ancla - i) : preset.desdeAncla[i];
      if (dias === null || dias === undefined) return;
      patch[`m${i + 1}`] = new Date(ancla.getFullYear(), ancla.getMonth(), ancla.getDate() + dias);
      this.sugeridos.add(i);
    });
    this.form.patchValue(patch, { emitEvent: false });
    this.form.updateValueAndValidity({ emitEvent: false });
  }

  /** Días de la etapa que empieza en el hito idx (hasta el siguiente), o null si falta una fecha. */
  diasEtapa(idx: number): number | null {
    const desde = this.coerceDate(this.form.get(`m${idx + 1}`)?.value);
    const hasta = this.coerceDate(this.form.get(`m${idx + 2}`)?.value);
    return desde && hasta ? this.diffInDays(desde, hasta) : null;
  }

  /** Hito de referencia del cultivo elegido (siembra, emergencia o brotación) */
  get anclaActual(): number {
    return this.activePreset.ancla;
  }

  /** dd/mm para la tabla (el año está en el resumen) */
  fechaCorta(fecha: string): string {
    return this.shortDateLabel(fecha);
  }

  /**
   * Fechas iniciales: la referencia en su fecha típica (siembra, emergencia o brotación) de la última
   * campaña ya cosechada, así la consulta inicial es realista y tiene datos completos.
   */
  private buildDefaultMilestones(preset: CropPreset): Date[] {
    const ayer = this.startOfDay(new Date());
    ayer.setDate(ayer.getDate() - 1);
    const ultimo = Math.max(...preset.desdeAncla.map(d => d ?? 0));
    const [mes, dia] = preset.anclaTipica;
    let ancla = new Date(ayer.getFullYear(), mes, dia);
    while (new Date(ancla.getFullYear(), mes, dia + ultimo) > ayer) {
      ancla = new Date(ancla.getFullYear() - 1, mes, dia);
    }
    return preset.milestones.map((_, i) => (i === preset.ancla ? ancla : new Date(ancla)));
  }

  private milestoneOrderValidator(group: AbstractControl): ValidationErrors | null {
    const crop = (group.get('crop')?.value as CropKey | null) ?? 'SOJA';
    const preset = this.cropPresets.find(item => item.key === crop) ?? this.cropPresets[0];
    const milestones = preset.milestones.map((_, index) =>
      this.coerceDate(group.get(`m${index + 1}`)?.value)
    );

    if (milestones.some(date => !date || Number.isNaN(date.getTime()))) {
      return { invalidMilestones: true };
    }

    for (let index = 1; index < milestones.length; index += 1) {
      if ((milestones[index - 1] as Date).getTime() >= (milestones[index] as Date).getTime()) {
        return { invalidOrder: true };
      }
    }

    return null;
  }

  private getStageWindows(): StageWindow[] {
    const preset = this.activePreset;
    const useKc = Boolean(this.form.get('applyKc')?.value);

    return preset.kcDefaults.map((defaultKc, index) => {
      const start = this.coerceDate(this.form.get(`m${index + 1}`)?.value);
      const end = this.coerceDate(this.form.get(`m${index + 2}`)?.value);
      const kcControl = this.form.get(`kc${index + 1}`);
      const kc = useKc ? Math.max(0, Number(kcControl?.value ?? defaultKc)) : 1;

      if (!start || !end) {
        return null;
      }

      return {
        label: `${preset.milestones[index]} → ${preset.milestones[index + 1]}`,
        start,
        end,
        kc
      };
    }).filter((item): item is StageWindow => Boolean(item));
  }

  /**
   * Arma todos los días del período, tengan o no registro. Un día sin registro queda con
   * valores null; también la ET de un día con ET 0 y radiación 0 a la vez (el servicio
   * convierte los vacíos en 0, así que eso es falta del sensor, no demanda nula).
   */
  private armarCalendario(desde: Date, hasta: Date, registros: PhenologyDailyRecord[]): DiaCampania[] {
    const porFecha = new Map(registros.map(r => [String(r.fecha).slice(0, 10), r]));
    const dias: DiaCampania[] = [];
    for (let d = this.startOfDay(desde); d <= hasta; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      const fecha = this.formatApiDate(d);
      const r = porFecha.get(fecha);
      if (!r) {
        dias.push({ fecha, conRegistro: false, tempMax: null, tempMin: null, rain: null, radiation: null,
          eto: null, leafWetness: null, rainEstimada: false, etoEstimada: false });
        continue;
      }
      const eto = this.toNumber(r.et);
      const radiation = this.toNumber(r.rad_solar_media);
      const sensorSinDato = eto === 0 && (radiation === null || radiation === 0);
      dias.push({
        fecha,
        conRegistro: true,
        tempMax: this.toNumber(r.temp_max),
        tempMin: this.toNumber(r.temp_min),
        rain: this.toNumber(r.rr_24),
        radiation: sensorSinDato ? null : radiation,
        eto: sensorSinDato ? null : eto,
        leafWetness: this.toNumber(r.hum_hoja_hs),
        rainEstimada: false,
        etoEstimada: false
      });
    }
    return dias;
  }

  /** Interruptor "Completar con la normal": recalcula sin volver a pedir los datos. */
  alternarCompletar(valor: boolean): void {
    this.completarConNormal = valor;
    this.recalcular();
  }

  /** Resúmenes, totales y gráficos a partir del calendario (completado o no con la normal). */
  private recalcular(): void {
    const normales = this.normales;
    const dias = this.completarConNormal && normales
      ? this.diasBase.map(d => this.completarDia(d, normales))
      : this.diasBase;

    this.diasFaltantes = this.diasBase.filter(d => d.rain === null || d.eto === null).length;
    this.puedeCompletar = this.diasFaltantes > 0 && !!normales && !!(normales.rr || normales.et);
    if (!this.puedeCompletar) this.completarConNormal = false;
    this.diasEstimados = dias.filter(d => d.rainEstimada || d.etoEstimada).length;
    this.indicesSinRegistro = dias.map((d, i) => (d.conRegistro ? -1 : i)).filter(i => i >= 0);

    // Estadíos que todavía no empezaron (campaña en curso) no se resumen
    const hoy = this.startOfDay(new Date());
    this.summaries = this.ventanas.filter(w => w.start <= hoy).map(w => this.resumirEstadio(w, dias));
    this.totals = this.buildTotalsSummary(this.summaries);
    this.buildCharts(this.summaries, dias, this.ventanas, normales);
  }

  /** Completa la lluvia y la ET que faltan con la normal diaria del mes (si existe). */
  private completarDia(d: DiaCampania, normales: Normales): DiaCampania {
    const copia = { ...d };
    if (copia.rain === null) {
      const rr = normalDelDia(normales, 'rr', d.fecha);
      if (rr !== null) { copia.rain = rr; copia.rainEstimada = true; }
    }
    if (copia.eto === null) {
      const et = normalDelDia(normales, 'et', d.fecha);
      if (et !== null) { copia.eto = et; copia.etoEstimada = true; }
    }
    return copia;
  }

  private resumirEstadio(window: StageWindow, dias: DiaCampania[]): StageSummary {
    const ds = dias.filter(d => this.enVentana(d.fecha, window));
    // Días transcurridos del estadío (en una campaña en curso, hasta hoy)
    const spanDays = Math.max(1, ds.length);
    const conRegistro = ds.filter(d => d.conRegistro).length;
    const valores = (f: (d: DiaCampania) => number | null) => ds.map(f).filter((v): v is number => v !== null);
    const suma = (v: number[]) => v.reduce((a, b) => a + b, 0);
    const media = (v: number[]) => (v.length ? this.round(suma(v) / v.length, 1) : null);

    const rain = this.round(suma(valores(d => d.rain)), 1);
    const etos = valores(d => d.eto);
    const eto = this.round(suma(etos), 1);
    const demand = this.round(suma(etos.map(v => v * window.kc)), 1);
    const tempMax = valores(d => d.tempMax);
    const tempMin = valores(d => d.tempMin);

    return {
      label: window.label,
      start: this.formatApiDate(window.start),
      end: this.formatApiDate(new Date(window.end.getTime() - 86400000)),
      spanDays,
      dataDays: conRegistro,
      coverage: Math.min(100, this.round((conRegistro / spanDays) * 100, 0)),
      kc: this.round(window.kc, 2),
      rain,
      eto,
      demand,
      balance: this.round(rain - demand, 1),
      avgRadiation: media(valores(d => d.radiation)),
      leafWetnessHours: this.round(suma(valores(d => d.leafWetness)), 1),
      avgTempMax: media(tempMax),
      avgTempMin: media(tempMin),
      hotDays: tempMax.filter(v => v >= 35).length,
      frostDays: tempMin.filter(v => v <= 0).length,
      lluviaFaltante: ds.filter(d => d.rain === null).length,
      demandaFaltante: ds.filter(d => d.eto === null).length,
      estimados: ds.filter(d => d.rainEstimada || d.etoEstimada).length,
      faltantes: this.describirFaltantes(ds)
    };
  }

  /** "Sin datos: 03/01–12/01, 15/02 · ET sin dato: 2 días" (vacío si el estadío está completo). */
  private describirFaltantes(ds: DiaCampania[]): string {
    const tramos: string[] = [];
    let inicio: string | null = null;
    let anterior: string | null = null;
    const cerrar = () => {
      if (inicio) tramos.push(inicio === anterior ? this.shortDateLabel(inicio) : `${this.shortDateLabel(inicio)}–${this.shortDateLabel(anterior!)}`);
      inicio = null;
    };
    for (const d of ds) {
      if (!d.conRegistro) {
        if (!inicio) inicio = d.fecha;
        anterior = d.fecha;
      } else {
        cerrar();
      }
    }
    cerrar();
    const etSinDato = ds.filter(d => d.conRegistro && (d.eto === null || d.etoEstimada)).length;
    const partes = [];
    if (tramos.length) partes.push(`Sin datos: ${tramos.join(', ')}`);
    if (etSinDato) partes.push(`ET sin dato: ${etSinDato} ${etSinDato === 1 ? 'día' : 'días'}`);
    return partes.join(' · ');
  }

  private buildTotalsSummary(summaries: StageSummary[]): TotalsSummary | null {
    if (!summaries.length) {
      return null;
    }

    const stationId = String(this.form.get('station')?.value ?? '');
    const rain = this.round(summaries.reduce((sum, item) => sum + item.rain, 0), 1);
    const demand = this.round(summaries.reduce((sum, item) => sum + item.demand, 0), 1);

    return {
      stationName: this.stationLabel(stationId),
      cropLabel: this.cropLabel(this.activePreset.key),
      start: summaries[0].start,
      end: summaries[summaries.length - 1].end,
      rain,
      demand,
      balance: this.round(rain - demand, 1),
      validDays: summaries.reduce((sum, item) => sum + item.dataDays, 0),
      totalDays: summaries.reduce((sum, item) => sum + item.spanDays, 0),
      lluviaParcial: summaries.some(s => s.lluviaFaltante > 0),
      demandaParcial: summaries.some(s => s.demandaFaltante > 0),
      estimados: summaries.reduce((sum, item) => sum + item.estimados, 0)
    };
  }

  private buildCharts(
    summaries: StageSummary[],
    dias: DiaCampania[],
    windows: StageWindow[],
    normales: Normales | null
  ): void {
    // Chart.js parte la etiqueta en renglones sólo si recibe un arreglo (un salto de línea no tiene efecto).
    const labels = summaries.map(item => {
      const [desde, hasta] = item.label.split(' → ').map(n => this.nombreCorto(n));
      return hasta ? [`${desde} →`, hasta] : item.label;
    });
    // Estadío incompleto: la barra más clara (su total real puede ser mayor)
    const relleno = (color: string, incompleto: boolean[]) => incompleto.map(i => conAlfa(color, i ? .28 : .7));
    this.stageChartData = {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Lluvia acumulada (mm)',
          data: summaries.map(item => item.rain),
          backgroundColor: relleno(VAR_COLOR.lluvia, summaries.map(s => s.lluviaFaltante > 0)),
          borderColor: VAR_COLOR.lluvia,
          borderWidth: 1,
          borderRadius: 8
        },
        {
          type: 'bar',
          label: 'Demanda hídrica ET x Kc (mm)',
          data: summaries.map(item => item.demand),
          backgroundColor: relleno(VAR_COLOR.et, summaries.map(s => s.demandaFaltante > 0)),
          borderColor: VAR_COLOR.et,
          borderWidth: 1,
          borderRadius: 8
        }
      ]
    };

    // Normales por estadío (si la estación las tiene), sobre todos los días del estadío:
    // lluvia normal y demanda normal (ET normal × Kc del estadío).
    const normalEstadio = windows.map(w => {
      const fechas = dias.filter(d => this.enVentana(d.fecha, w)).map(d => d.fecha);
      return {
        lluvia: this.sumaNormal(normales, 'rr', fechas, 1),
        demanda: this.sumaNormal(normales, 'et', fechas, w.kc)
      };
    });
    const lluviaNormal = normalEstadio.map(n => n.lluvia);
    const demandaNormal = normalEstadio.map(n => n.demanda);
    if (tieneValores(lluviaNormal)) {
      this.stageChartData.datasets.push(
        datasetNormal('Lluvia normal (mm)', lluviaNormal, VAR_COLOR.lluvia) as unknown as ChartDataset<'bar', number[]>);
    }
    if (tieneValores(demandaNormal)) {
      this.stageChartData.datasets.push(
        datasetNormal('Demanda normal ET x Kc (mm)', demandaNormal, VAR_COLOR.et) as unknown as ChartDataset<'bar', number[]>);
    }

    // Acumulados día a día sobre el calendario completo: un día sin dato corta la línea
    // (y se marca con una franja gris); un día completado con la normal va punteado.
    const kcDe = (fecha: string) => windows.find(w => this.enVentana(fecha, w))?.kc ?? 1;
    let lluvia = 0;
    let demanda = 0;
    const lluviaAcum = dias.map(d => (d.rain === null ? null : this.round(lluvia += d.rain, 1)));
    const demandaAcum = dias.map(d => (d.eto === null ? null : this.round(demanda += d.eto * kcDe(d.fecha), 1)));
    const punteadoSi = (estimado: (d: DiaCampania) => boolean) => ({
      borderDash: (ctx: { p1DataIndex: number }) => (estimado(dias[ctx.p1DataIndex]) ? [5, 4] : undefined)
    });

    this.cumulativeChartData = {
      labels: dias.map(d => this.shortDateLabel(d.fecha)),
      datasets: [
        {
          type: 'line',
          label: 'Lluvia acumulada',
          data: lluviaAcum as number[],
          borderColor: VAR_COLOR.lluvia,
          backgroundColor: conAlfa(VAR_COLOR.lluvia, .18),
          borderWidth: 2,
          fill: false,
          tension: 0.25,
          pointRadius: 0,
          pointHoverRadius: 3,
          spanGaps: false,
          segment: punteadoSi(d => d.rainEstimada)
        } as ChartDataset<'line', number[]>,
        {
          type: 'line',
          label: 'Demanda acumulada ET x Kc',
          data: demandaAcum as number[],
          borderColor: VAR_COLOR.et,
          backgroundColor: conAlfa(VAR_COLOR.et, .18),
          borderWidth: 2,
          fill: false,
          tension: 0.25,
          pointRadius: 0,
          pointHoverRadius: 3,
          spanGaps: false,
          segment: punteadoSi(d => d.etoEstimada)
        } as ChartDataset<'line', number[]>
      ]
    };

    // Inicio de cada etapa sobre el eje diario (primer día de la etapa)
    this.inicioEtapas = windows
      .map(w => ({ indice: dias.findIndex(d => this.enVentana(d.fecha, w)), nombre: this.nombreCorto(w.label.split(' → ')[0]) }))
      .filter(h => h.indice >= 0);

    // Temperaturas máxima y mínima diarias, y radiación solar diaria, cada una con su normal
    const fechas = dias.map(d => d.fecha);
    const etiquetasDias = dias.map(d => this.shortDateLabel(d.fecha));
    const linea = (label: string, data: (number | null)[], color: string) => ({
      type: 'line' as const,
      label,
      data,
      borderColor: color,
      backgroundColor: conAlfa(color, .15),
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 3,
      spanGaps: false
    });
    const conNormal = <T>(datasets: T[], clave: ClaveNormal, label: string, color: string): T[] => {
      const serie = normalDiaria(normales, clave, fechas);
      return tieneValores(serie) ? [...datasets, datasetNormal(label, serie, color) as unknown as T] : datasets;
    };

    let temp: ChartDataset<'line', (number | null)[]>[] = [
      linea('Temp. máxima (°C)', dias.map(d => d.tempMax), VAR_COLOR.tmax),
      linea('Temp. mínima (°C)', dias.map(d => d.tempMin), VAR_COLOR.tmin)
    ];
    temp = conNormal(temp, 'th', 'Normal temp. máx.', VAR_COLOR.tmax);
    temp = conNormal(temp, 'tl', 'Normal temp. mín.', VAR_COLOR.tmin);
    this.tempChartData = { labels: etiquetasDias, datasets: temp };

    let rad: ChartDataset<'bar' | 'line', (number | null)[]>[] = [{
      type: 'bar',
      label: 'Radiación solar (W/m²)',
      data: dias.map(d => d.radiation),
      backgroundColor: conAlfa(VAR_COLOR.radiacion, .55),
      borderWidth: 0,
      barPercentage: 1,
      categoryPercentage: 1
    } as ChartDataset<'bar', (number | null)[]>];
    rad = conNormal(rad, 'rg', 'Normal radiación', VAR_COLOR.radiacion);
    this.radChartData = { labels: etiquetasDias, datasets: rad };

    // Acumulados normales con el mismo Kc por estadío
    let lluviaN: number | null = 0;
    let demandaN: number | null = 0;
    const lluviaAcumNormal = dias.map(d => {
      const rr = normalDelDia(normales, 'rr', d.fecha);
      lluviaN = lluviaN === null || rr === null ? null : lluviaN + rr;
      return lluviaN === null ? null : this.round(lluviaN, 1);
    });
    const demandaAcumNormal = dias.map(d => {
      const et = normalDelDia(normales, 'et', d.fecha);
      demandaN = demandaN === null || et === null ? null : demandaN + et * kcDe(d.fecha);
      return demandaN === null ? null : this.round(demandaN, 1);
    });
    if (tieneValores(lluviaAcumNormal)) {
      this.cumulativeChartData.datasets.push(
        datasetNormal('Lluvia acumulada normal', lluviaAcumNormal, VAR_COLOR.lluvia) as unknown as ChartDataset<'line', number[]>);
    }
    if (tieneValores(demandaAcumNormal)) {
      this.cumulativeChartData.datasets.push(
        datasetNormal('Demanda acumulada normal', demandaAcumNormal, VAR_COLOR.et) as unknown as ChartDataset<'line', number[]>);
    }
  }

  /** Opciones comunes de los gráficos diarios: un eje Y con su título y la leyenda abajo. */
  private conReferencias<T extends { plugins: object }>(opciones: T, lineas: LineaReferencia[]): T {
    return { ...opciones, plugins: { ...opciones.plugins, referencias: { lineas } } };
  }

  private opcionesDiarias(tituloEje: string, desdeCero: boolean) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index' as const, intersect: false },
      scales: {
        x: {
          ticks: { color: '#111827', maxRotation: 0, autoSkip: true, autoSkipPadding: 10 },
          grid: { display: false }
        },
        y: {
          beginAtZero: desdeCero,
          title: { display: true, text: tituloEje, color: '#111827' },
          ticks: { color: '#111827', font: { weight: 700 } },
          grid: { color: 'rgba(17,24,39,.10)' }
        }
      },
      plugins: {
        legend: {
          position: 'bottom' as const,
          labels: { color: '#111827', boxWidth: 12, boxHeight: 8, font: { size: 11, weight: 700 } }
        }
      },
      elements: { line: { tension: 0.2 } }
    };
  }

  /** Nombres de hito abreviados para los ejes de los gráficos */
  private nombreCorto(nombre: string): string {
    const cortos: Record<string, string> = {
      'Acumulación de lluvia': 'Acum.',
      'Período crítico': 'P. crítico',
      'Madurez fisiológica': 'Madurez fis.',
      'Gran crecimiento': 'Gran crec.',
      'Crecimiento del fruto': 'Crec. fruto',
      'Nueva brotación': 'N. brotación',
      'Caña de azúcar': 'Caña'
    };
    return cortos[nombre] ?? nombre;
  }

  /** Tooltip del gráfico por estadío: avisa si el total está incompleto o tiene días estimados. */
  private notaEstadio(datasetIndex: number, index: number): string {
    const s = this.summaries[index];
    if (!s || datasetIndex > 1) return '';
    const faltan = datasetIndex === 0 ? s.lluviaFaltante : s.demandaFaltante;
    if (faltan) return `Incompleto: faltan ${faltan} ${faltan === 1 ? 'día' : 'días'}`;
    return s.estimados ? `Incluye ${s.estimados} ${s.estimados === 1 ? 'día estimado' : 'días estimados'} con la normal` : '';
  }

  /** El día pertenece al estadío (desde el inicio inclusive hasta el fin exclusive). */
  private enVentana(fecha: string, w: StageWindow): boolean {
    const d = this.coerceDate(fecha);
    return !!d && d >= w.start && d < w.end;
  }

  /** Suma de la normal diaria sobre los días dados, multiplicada por un factor (Kc). */
  private sumaNormal(normales: Normales | null, clave: 'rr' | 'et', fechas: string[], factor: number): number | null {
    if (!normales || !fechas.length) return null;
    let total = 0;
    for (const f of fechas) {
      const v = normalDelDia(normales, clave, f);
      if (v === null) return null;
      total += v * factor;
    }
    return this.round(total, 1);
  }

  private resetResults(): void {
    this.summaries = [];
    this.totals = null;
    this.diasBase = [];
    this.diasFaltantes = 0;
    this.diasEstimados = 0;
    this.puedeCompletar = false;
    this.indicesSinRegistro = [];
    this.stageChartData = { labels: [], datasets: [] };
    this.cumulativeChartData = { labels: [], datasets: [] };
    this.tempChartData = { labels: [], datasets: [] };
    this.radChartData = { labels: [], datasets: [] };
    this.inicioEtapas = [];
  }

  private coerceDate(value: unknown): Date | null {
    if (value instanceof Date) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }

    if (typeof value === 'string' && value.includes('/')) {
      const [day, month, year] = value.split('/').map(Number);
      const date = new Date(year, month - 1, day);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    if (typeof value === 'string' && value.includes('-')) {
      const [year, month, day] = value.split('-').map(Number);
      const date = new Date(year, month - 1, day);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    return null;
  }

  private formatApiDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private shortDateLabel(date: string): string {
    const [, month, day] = date.split('-');
    return `${day}/${month}`;
  }

  private toNumber(value: number | string | null | undefined): number | null {
    if (value == null || value === '') {
      return null;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }

  private diffInDays(start: Date, end: Date): number {
    return Math.round((end.getTime() - start.getTime()) / 86400000);
  }

  private startOfDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  private round(value: number, digits: number): number {
    return Number(value.toFixed(digits));
  }
}
