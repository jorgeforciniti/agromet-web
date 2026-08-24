import { Component, Inject, Injectable, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { BaseChartDirective } from 'ng2-charts';
import { Chart, ChartData, registerables } from 'chart.js';
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

Chart.register(...registerables);

interface PhenologyDailyRecord {
  fecha: string;
  temp_max?: number | string | null;
  temp_min?: number | string | null;
  rr_24?: number | string | null;
  rad_solar_media?: number | string | null;
  et?: number | string | null;
  hum_hoja_hs?: number | string | null;
}

type CropKey = 'SOJA' | 'MAIZ' | 'CANA';

interface CropPreset {
  key: CropKey;
  label: string;
  totalDays: number;
  milestones: string[];
  kcDefaults: number[];
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
}

interface DailyBalancePoint {
  label: string;
  cumulativeRain: number;
  cumulativeDemand: number;
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
  readonly cropPresets: CropPreset[] = [
    {
      key: 'SOJA',
      label: 'Soja',
      totalDays: 210,
      milestones: ['Acumulación de lluvia', 'Siembra', 'R1', 'R5', 'R6', 'Cosecha'],
      kcDefaults: [0.35, 0.75, 1.12, 1.2, 0.75]
    },
    {
      key: 'MAIZ',
      label: 'Maíz',
      totalDays: 210,
      milestones: ['Acumulación de lluvia', 'Siembra', 'Período crítico', 'Madurez fisiológica', 'Cosecha'],
      kcDefaults: [0.35, 0.6, 1.15, 0.7]
    },
    {
      key: 'CANA',
      label: 'Caña de azúcar',
      totalDays: 320,
      milestones: ['Emergencia', 'Brotación', 'Macollaje', 'Gran crecimiento', 'Maduración', 'Cosecha'],
      kcDefaults: [0.35, 0.55, 0.75, 1.1, 0.65]
    }
  ];

  readonly data: Record<string, unknown>;
  readonly stageChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        ticks: { color: '#111827', font: { weight: '700' } },
        grid: { display: false }
      },
      y: {
        ticks: { color: '#111827', font: { weight: '700' } },
        grid: { color: 'rgba(17,24,39,.10)' }
      }
    },
    plugins: {
      legend: {
        labels: { color: '#111827', font: { weight: '700' } }
      }
    }
  };
  readonly cumulativeChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        ticks: { color: '#111827', maxRotation: 0, autoSkip: true },
        grid: { display: false }
      },
      y: {
        ticks: { color: '#111827', font: { weight: '700' } },
        grid: { color: 'rgba(17,24,39,.10)' }
      }
    },
    plugins: {
      legend: {
        labels: { color: '#111827', font: { weight: '700' } }
      }
    },
    elements: {
      line: {
        tension: 0.25
      }
    }
  };

  form!: FormGroup;
  stations: WeatherStation[] = [];
  isLoading = false;
  loadError = '';
  summaries: StageSummary[] = [];
  totals: TotalsSummary | null = null;
  stageChartData: ChartData<'bar', number[], string> = { labels: [], datasets: [] };
  cumulativeChartData: ChartData<'line', number[], string> = { labels: [], datasets: [] };

  constructor(
    private fb: FormBuilder,
    private weatherService: WeatherService,
    private dialogRef: MatDialogRef<PhenologyWeatherDialogComponent>,
    @Inject(MAT_DIALOG_DATA) dialogData: Record<string, unknown> | null
  ) {
    this.data = dialogData ?? {};
  }

  ngOnInit(): void {
    this.form = this.fb.group({
      station: ['2049', Validators.required],
      crop: ['SOJA', Validators.required],
      applyKc: [true],
      m1: [null as Date | null, Validators.required],
      m2: [null as Date | null, Validators.required],
      m3: [null as Date | null, Validators.required],
      m4: [null as Date | null, Validators.required],
      m5: [null as Date | null, Validators.required],
      m6: [null as Date | null],
      kc1: [0.35, [Validators.required, Validators.min(0)]],
      kc2: [0.75, [Validators.required, Validators.min(0)]],
      kc3: [1.12, [Validators.required, Validators.min(0)]],
      kc4: [1.2, [Validators.required, Validators.min(0)]],
      kc5: [0.75, [Validators.required, Validators.min(0)]]
    }, { validators: this.milestoneOrderValidator.bind(this) });

    this.applyCropPreset('SOJA');

    this.form.controls['crop'].valueChanges.subscribe((crop) => {
      this.applyCropPreset(crop as CropKey);
      this.resetResults();
    });

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
    const overallEnd = new Date(windows[windows.length - 1].end.getTime() - 86400000);

    if (overallStart > overallEnd) {
      this.loadError = 'El período fenológico resultante no es válido.';
      return;
    }

    this.isLoading = true;

    forkJoin({
      daily: this.weatherService.getWeatherDataDiary<PhenologyDailyRecord>(
        this.formatApiDate(overallStart),
        this.formatApiDate(overallEnd),
        station
      )
    }).subscribe({
      next: ({ daily }) => {
        const records = (daily.data ?? []).map((item) => ({
          fecha: item.fecha,
          tempMax: this.toNumber(item.temp_max),
          tempMin: this.toNumber(item.temp_min),
          rain: this.toNumber(item.rr_24) ?? 0,
          radiation: this.toNumber(item.rad_solar_media),
          eto: this.toNumber(item.et) ?? 0,
          leafWetness: this.toNumber(item.hum_hoja_hs) ?? 0
        }));

        this.summaries = windows.map((window) => this.summarizeStage(window, records));
        this.totals = this.buildTotalsSummary(this.summaries);
        this.buildCharts(this.summaries, records, windows);
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
  }

  private buildDefaultMilestones(preset: CropPreset): Date[] {
    const end = this.startOfDay(new Date());
    end.setDate(end.getDate() - 1);
    const start = new Date(end);
    start.setDate(start.getDate() - preset.totalDays);

    const count = preset.milestones.length;
    const step = count > 1 ? Math.round(preset.totalDays / (count - 1)) : preset.totalDays;

    return Array.from({ length: count }, (_, index) => {
      const point = new Date(start);
      point.setDate(start.getDate() + step * index);
      return point > end ? new Date(end) : point;
    });
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

  private summarizeStage(
    window: StageWindow,
    records: Array<{
      fecha: string;
      tempMax: number | null;
      tempMin: number | null;
      rain: number;
      radiation: number | null;
      eto: number;
      leafWetness: number;
    }>
  ): StageSummary {
    const stageRecords = records.filter(record => {
      const current = this.coerceDate(record.fecha);
      return Boolean(current) && (current as Date) >= window.start && (current as Date) < window.end;
    });

    const spanDays = Math.max(1, this.diffInDays(window.start, window.end));
    const tempMaxValues = stageRecords.map(item => item.tempMax).filter((value): value is number => value != null);
    const tempMinValues = stageRecords.map(item => item.tempMin).filter((value): value is number => value != null);
    const radValues = stageRecords.map(item => item.radiation).filter((value): value is number => value != null);
    const rain = this.round(stageRecords.reduce((sum, item) => sum + item.rain, 0), 1);
    const eto = this.round(stageRecords.reduce((sum, item) => sum + item.eto, 0), 1);
    const demand = this.round(stageRecords.reduce((sum, item) => sum + item.eto * window.kc, 0), 1);
    const balance = this.round(rain - demand, 1);

    return {
      label: window.label,
      start: this.formatApiDate(window.start),
      end: this.formatApiDate(new Date(window.end.getTime() - 86400000)),
      spanDays,
      dataDays: stageRecords.length,
      coverage: Math.min(100, this.round((stageRecords.length / spanDays) * 100, 0)),
      kc: this.round(window.kc, 2),
      rain,
      eto,
      demand,
      balance,
      avgRadiation: radValues.length ? this.round(radValues.reduce((sum, value) => sum + value, 0) / radValues.length, 1) : null,
      leafWetnessHours: this.round(stageRecords.reduce((sum, item) => sum + item.leafWetness, 0), 1),
      avgTempMax: tempMaxValues.length ? this.round(tempMaxValues.reduce((sum, value) => sum + value, 0) / tempMaxValues.length, 1) : null,
      avgTempMin: tempMinValues.length ? this.round(tempMinValues.reduce((sum, value) => sum + value, 0) / tempMinValues.length, 1) : null,
      hotDays: stageRecords.filter(item => (item.tempMax ?? Number.NEGATIVE_INFINITY) >= 35).length,
      frostDays: stageRecords.filter(item => (item.tempMin ?? Number.POSITIVE_INFINITY) <= 0).length
    };
  }

  private buildTotalsSummary(summaries: StageSummary[]): TotalsSummary | null {
    if (!summaries.length) {
      return null;
    }

    const stationId = String(this.form.get('station')?.value ?? '');
    const stationName = this.stationLabel(stationId);
    const crop = this.cropLabel(this.activePreset.key);
    const validDays = summaries.reduce((sum, item) => sum + item.dataDays, 0);
    const totalDays = summaries.reduce((sum, item) => sum + item.spanDays, 0);
    const rain = this.round(summaries.reduce((sum, item) => sum + item.rain, 0), 1);
    const demand = this.round(summaries.reduce((sum, item) => sum + item.demand, 0), 1);

    return {
      stationName,
      cropLabel: crop,
      start: summaries[0].start,
      end: summaries[summaries.length - 1].end,
      rain,
      demand,
      balance: this.round(rain - demand, 1),
      validDays,
      totalDays
    };
  }

  private buildCharts(
    summaries: StageSummary[],
    records: Array<{
      fecha: string;
      tempMax: number | null;
      tempMin: number | null;
      rain: number;
      radiation: number | null;
      eto: number;
      leafWetness: number;
    }>,
    windows: StageWindow[]
  ): void {
    const labels = summaries.map(item => item.label.replace(' → ', '\n'));
    this.stageChartData = {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Lluvia acumulada (mm)',
          data: summaries.map(item => item.rain),
          backgroundColor: 'rgba(37, 99, 235, .70)',
          borderColor: 'rgba(37, 99, 235, 1)',
          borderWidth: 1,
          borderRadius: 8
        },
        {
          type: 'bar',
          label: 'Demanda hídrica ET x Kc (mm)',
          data: summaries.map(item => item.demand),
          backgroundColor: 'rgba(245, 158, 11, .72)',
          borderColor: 'rgba(245, 158, 11, 1)',
          borderWidth: 1,
          borderRadius: 8
        }
      ]
    };

    const points = this.buildDailyBalanceSeries(records, windows);
    this.cumulativeChartData = {
      labels: points.map(item => item.label),
      datasets: [
        {
          type: 'line',
          label: 'Lluvia acumulada',
          data: points.map(item => item.cumulativeRain),
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, .18)',
          borderWidth: 2,
          fill: false,
          tension: 0.25,
          pointRadius: 0,
          pointHoverRadius: 3,
          spanGaps: true
        },
        {
          type: 'line',
          label: 'Demanda acumulada ET x Kc',
          data: points.map(item => item.cumulativeDemand),
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245, 158, 11, .18)',
          borderWidth: 2,
          fill: false,
          tension: 0.25,
          pointRadius: 0,
          pointHoverRadius: 3,
          spanGaps: true
        }
      ]
    };
  }

  private buildDailyBalanceSeries(
    records: Array<{
      fecha: string;
      tempMax: number | null;
      tempMin: number | null;
      rain: number;
      radiation: number | null;
      eto: number;
      leafWetness: number;
    }>,
    windows: StageWindow[]
  ): DailyBalancePoint[] {
    let cumulativeRain = 0;
    let cumulativeDemand = 0;

    return [...records]
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
      .map((record) => {
        const current = this.coerceDate(record.fecha);
        const stage = windows.find(item => Boolean(current) && (current as Date) >= item.start && (current as Date) < item.end);
        const factor = stage?.kc ?? 1;
        cumulativeRain += record.rain;
        cumulativeDemand += record.eto * factor;

        return {
          label: this.shortDateLabel(record.fecha),
          cumulativeRain: this.round(cumulativeRain, 1),
          cumulativeDemand: this.round(cumulativeDemand, 1)
        };
      });
  }

  private resetResults(): void {
    this.summaries = [];
    this.totals = null;
    this.stageChartData = { labels: [], datasets: [] };
    this.cumulativeChartData = { labels: [], datasets: [] };
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
