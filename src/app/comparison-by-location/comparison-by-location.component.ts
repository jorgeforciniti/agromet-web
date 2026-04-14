import { Component, Inject, OnInit, ViewEncapsulation } from '@angular/core';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import {
  MatDialogModule,
  MatDialogRef,
  MAT_DIALOG_DATA
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatRadioModule } from '@angular/material/radio';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import {
  MatNativeDateModule,
  NativeDateAdapter,
  MAT_DATE_LOCALE
} from '@angular/material/core';
import { BaseChartDirective } from 'ng2-charts';
import { forkJoin } from 'rxjs';
import { WeatherService, WeatherStation } from '../services/weather.service';
import { ChartData, ChartDataset } from 'chart.js';
import { ValidationErrors, AbstractControl } from '@angular/forms';
import { DateAdapter, MAT_DATE_FORMATS } from '@angular/material/core';
import { Injectable } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Injectable()
export class CustomDateAdapter extends NativeDateAdapter {
  override parse(value: unknown): Date | null {
    if (typeof value === 'string' && value.indexOf('/') > -1) {
      const [day, month, year] = value.split('/');
      const date = new Date(+year, +month - 1, +day);
      return isNaN(date.getTime()) ? null : date;
    }
    return super.parse(value);
  }

  override format(date: Date, displayFormat: Object): string {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }
}

interface WeatherRecord {
  fecha: string;
  temp_max: number;
  temp_min: number;
  HR_max: number;
  HR_min: number;
  rr_24: number;
  presion_media_24: number;
  viento_medio: number;
  rad_solar_media: number;
  et: number;
  hum_hoja_hs: number;
}

const MY_DATE_FORMATS = {
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

@Component({
  selector: 'comparison-by-location',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatSelectModule,
    MatRadioModule,
    MatProgressBarModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatIconModule,
    BaseChartDirective
  ],
  providers: [
    { provide: MAT_DATE_LOCALE, useValue: 'es-AR' },
    { provide: DateAdapter, useClass: CustomDateAdapter },
    {
      provide: MAT_DATE_FORMATS,
      useValue: MY_DATE_FORMATS
    }
  ],
  templateUrl: './comparison-by-location.component.html',
  styleUrl: './comparison-by-location.component.css'
})
export class ComparisonByLocationComponent implements OnInit {
  form!: FormGroup;
  stations: WeatherStation[] = [];
  comparisonYears: number[] = [];
  lineChartData: ChartData<'line', number[]> = { labels: [], datasets: [] };
  barChartData: ChartData<'bar', number[]> = { labels: [], datasets: [] };
  chartLabels: string[] = [];
  isLoading = false;

  chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        position: 'left',
        display: true,
        ticks: { color: '#111827', font: { weight: '700' } },
        grid: { color: 'rgba(17,24,39,.10)' }
      },
      x: {
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

  variables = [
    { key: 'temp_max', label: 'Temperatura máxima (°C)' },
    { key: 'temp_min', label: 'Temperatura mínima (°C)' },
    { key: 'HR', label: 'Humedad relativa media (%)' },
    { key: 'rr_24', label: 'Lluvia (mm)' },
    { key: 'presion_media_24', label: 'Presión atmosférica (hPa)' },
    { key: 'viento_medio', label: 'Velocidad de viento (km/h)' },
    { key: 'rad_solar_media', label: 'Radiación solar (W/m²)' },
    { key: 'et', label: 'Evapotranspiración (mm)' },
    { key: 'hum_hoja_hs', label: 'Hoja mojada (mm)' }
  ];

  readonly data: Record<string, unknown>;

  constructor(
    private fb: FormBuilder,
    private weatherService: WeatherService,
    private dialogRef: MatDialogRef<ComparisonByLocationComponent>,
    @Inject(MAT_DIALOG_DATA) dialogData: Record<string, unknown> | null
  ) {
    this.data = dialogData ?? {};
  }

  ngOnInit() {
    this.weatherService.getStationsAll().subscribe(res => this.stations = res);
    const currentYear = new Date().getFullYear();
    for (let y = 2006; y <= currentYear; y++) {
      this.comparisonYears.push(y);
    }
    const today = new Date();
    const start = new Date();
    start.setDate(today.getDate() - 59);
    this.form = this.fb.group({
      estacion: ['2049', Validators.required],
      fechaDesde: [start, Validators.required],
      fechaHasta: [today, Validators.required],
      compStation: ['', Validators.required],  // <- Cambiado aquí
      variable: ['temp_max', Validators.required],
      formato: ['diario', Validators.required]
    }, { validators: this.dateRangeValidator });
  }

  private dateRangeValidator(group: AbstractControl): ValidationErrors | null {
    const formGroup = group as FormGroup;
    const start = formGroup.get('fechaDesde')?.value;
    const end = formGroup.get('fechaHasta')?.value;
    return start && end && start > end ? { invalidRange: true } : null;
  }

  private coerceDate(value: Date | string): Date {
    if (value instanceof Date) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }

    if (typeof value === 'string' && value.includes('/')) {
      const [day, month, year] = value.split('/').map(Number);
      return new Date(year, month - 1, day);
    }

    if (typeof value === 'string' && value.includes('-')) {
      const [year, month, day] = value.split('-').map(Number);
      return new Date(year, month - 1, day);
    }

    return new Date(value);
  }

  private resetCharts(): void {
    this.chartLabels = [];
    this.lineChartData = { labels: [], datasets: [] };
    this.barChartData = { labels: [], datasets: [] };
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.isLoading = true;
    this.resetCharts();

    const { estacion, fechaDesde, fechaHasta, compStation, variable, formato } = this.form.value; // 

    const dFrom = this.coerceDate(fechaDesde);
    const dTo = this.coerceDate(fechaHasta);

    if (isNaN(dFrom.getTime()) || isNaN(dTo.getTime())) {
      this.isLoading = false;
      this.resetCharts();
      console.error('Fechas inválidas en comparación por localidad', { fechaDesde, fechaHasta });
      return;
    }

    const cFrom = new Date(compStation, dFrom.getMonth(), dFrom.getDate());
    const yearDiff = dTo.getFullYear() - dFrom.getFullYear();
    const cTo = new Date(compStation + yearDiff, dTo.getMonth(), dTo.getDate());

    const formatDate = (date: Date) => {
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${year}-${month}-${day}`;
    };

    forkJoin({
      base: this.weatherService.getWeatherDataDiary<WeatherRecord>(formatDate(dFrom), formatDate(dTo), estacion),
      comp: this.weatherService.getWeatherDataDiary<WeatherRecord>(formatDate(dFrom), formatDate(dTo), compStation)
    }).subscribe({
      next: ({ base, comp }) => {
        const baseStation = this.stations.find(s => s.Identificacion === estacion)?.nombre || estacion;
        const compStationName = this.stations.find(s => s.Identificacion === compStation)?.nombre || compStation;

        this.applyBuildCharts(base.data, comp.data, baseStation, compStationName, variable, formato);
        this.isLoading = false;
      },
      error: (error) => {
        this.isLoading = false;
        this.resetCharts();
        console.error('Error al calcular comparación por localidad', error);
      }
    });
  }

  private applyBuildCharts(
    baseData: WeatherRecord[],
    compData: WeatherRecord[],
    baseStation: string,  // <- Cambiado aquí
    compStation: string,  // <- Cambiado aquí
    key: string,
    formato: string
  ): void {
    const meta = this.variables.find(v => v.key === key)!;
    const isBar = ['rr_24', 'et', 'hum_hoja_hs'].includes(key);

    const baseStationLabel = `(${baseStation})`;
    const compStationLabel = `(${compStation})`;

    if (formato === 'mensual') {
      const baseMonths = this.groupByMonth(baseData);
      const compMonths = this.groupByMonth(compData);
      const baseValues = this.calculateMonthlyValues(baseMonths, key);
      const compValues = this.calculateMonthlyValues(compMonths, key);

      this.chartLabels = baseValues.map(v => v.label);
      const valsBase = baseValues.map(v => v.value);
      const valsComp = compValues.map(v => v.value);

      if (isBar) {
        const barDatasets: ChartDataset<'bar', number[]>[] = [
          { label: `${meta.label} ${baseStation}`, data: valsBase, type: 'bar', yAxisID: 'y' },
          { label: `${meta.label} ${compStation}`, data: valsComp, type: 'bar', yAxisID: 'y' }
        ];
        this.barChartData = { labels: this.chartLabels, datasets: barDatasets };
        this.lineChartData = { labels: this.chartLabels, datasets: [] };
      } else {
        const lineDatasets: ChartDataset<'line', number[]>[] = [
          { label: `${meta.label} ${baseStation}`, data: valsBase, type: 'line', fill: false, tension: 0.2, yAxisID: 'y' },
          { label: `${meta.label} ${compStation}`, data: valsComp, type: 'line', fill: false, tension: 0.2, yAxisID: 'y' }
        ];
        this.lineChartData = { labels: this.chartLabels, datasets: lineDatasets };
        this.barChartData = { labels: this.chartLabels, datasets: [] };
      }
    } else if (formato === 'decadico') {
      const baseDecades = this.groupByDecade(baseData);
      const compDecades = this.groupByDecade(compData);
      const baseValues = this.calculateDecadeValues(baseDecades, key);
      const compValues = this.calculateDecadeValues(compDecades, key);

      this.chartLabels = baseValues.map(v => v.label);
      const valsBase = baseValues.map(v => v.value);
      const valsComp = compValues.map(v => v.value);

      if (isBar) {
        const barDatasets: ChartDataset<'bar', number[]>[] = [
          { label: `${meta.label} ${baseStation}`, data: valsBase, type: 'bar', yAxisID: 'y' },
          { label: `${meta.label} ${compStation}`, data: valsComp, type: 'bar', yAxisID: 'y' }
        ];
        this.barChartData = { labels: this.chartLabels, datasets: barDatasets };
        this.lineChartData = { labels: this.chartLabels, datasets: [] };
      } else {
        const lineDatasets: ChartDataset<'line', number[]>[] = [
          { label: `${meta.label} ${baseStation}`, data: valsBase, type: 'line', fill: false, tension: 0.2, yAxisID: 'y' },
          { label: `${meta.label} ${compStation}`, data: valsComp, type: 'line', fill: false, tension: 0.2, yAxisID: 'y' }
        ];
        this.lineChartData = { labels: this.chartLabels, datasets: lineDatasets };
        this.barChartData = { labels: this.chartLabels, datasets: [] };
      }
    } else {
      this.chartLabels = baseData.map(r => r.fecha.split('-').slice(1).join('/'));
      const valsBase = baseData.map(r => key === 'HR' ? (r.HR_max + r.HR_min) / 2 : (r[key as keyof WeatherRecord] as number));
      const valsComp = compData.map(r => key === 'HR' ? (r.HR_max + r.HR_min) / 2 : (r[key as keyof WeatherRecord] as number));

      if (isBar) {
        const barDatasets: ChartDataset<'bar', number[]>[] = [
          { label: `${meta.label} ${baseStation}`, data: valsBase, type: 'bar', yAxisID: 'y' },
          { label: `${meta.label} ${compStation}`, data: valsComp, type: 'bar', yAxisID: 'y' }
        ];
        this.barChartData = { labels: this.chartLabels, datasets: barDatasets };
        this.lineChartData = { labels: this.chartLabels, datasets: [] };
      } else {
        const lineDatasets: ChartDataset<'line', number[]>[] = [
          { label: `${meta.label} ${baseStation}`, data: valsBase, type: 'line', fill: false, tension: 0.2, yAxisID: 'y' },
          { label: `${meta.label} ${compStation}`, data: valsComp, type: 'line', fill: false, tension: 0.2, yAxisID: 'y' }
        ];
        this.lineChartData = { labels: this.chartLabels, datasets: lineDatasets };
        this.barChartData = { labels: this.chartLabels, datasets: [] };
      }
    }
  }

  private groupByDecade(data: WeatherRecord[]): { [key: string]: WeatherRecord[] } {
    const decades: { [key: string]: WeatherRecord[] } = {};
    data.forEach(record => {
      const date = new Date(record.fecha);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const day = date.getDate();
      let decade: string;
      if (day <= 10) {
        decade = `${year}-${month}-1`;
      } else if (day <= 20) {
        decade = `${year}-${month}-2`;
      } else {
        decade = `${year}-${month}-3`;
      }
      if (!decades[decade]) {
        decades[decade] = [];
      }
      decades[decade].push(record);
    });
    return decades;
  }

  private calculateDecadeValues(decades: { [key: string]: WeatherRecord[] }, key: string): { label: string, value: number }[] {
    const result: { label: string, value: number }[] = [];
    const isAccumulative = ['rr_24', 'et', 'hum_hoja_hs'].includes(key);
    for (const decade in decades) {
      const records = decades[decade];
      let value: number;
      if (isAccumulative) {
        value = records.reduce((sum, r) => sum + (r[key as keyof WeatherRecord] as number), 0);
      } else {
        const sum = records.reduce((sum, r) => sum + (key === 'HR' ? (r.HR_max + r.HR_min) / 2 : (r[key as keyof WeatherRecord] as number)), 0);
        value = sum / records.length;
      }
      result.push({ label: decade, value });
    }
    return result.sort((a, b) => a.label.localeCompare(b.label));
  }

  private groupByMonth(data: WeatherRecord[]): { [key: string]: WeatherRecord[] } {
    const months: { [key: string]: WeatherRecord[] } = {};
    data.forEach(record => {
      const date = new Date(record.fecha);
      const year = date.getFullYear();
      const month = date.getMonth() + 1;
      const key = `${year}-${month.toString().padStart(2, '0')}`;
      if (!months[key]) {
        months[key] = [];
      }
      months[key].push(record);
    });
    return months;
  }

  private calculateMonthlyValues(months: { [key: string]: WeatherRecord[] }, key: string): { label: string, value: number }[] {
    const result: { label: string, value: number }[] = [];
    const isAccumulative = ['rr_24', 'et', 'hum_hoja_hs'].includes(key);
    for (const month in months) {
      const records = months[month];
      let value: number;
      if (isAccumulative) {
        value = records.reduce((sum, r) => sum + (r[key as keyof WeatherRecord] as number), 0);
      } else {
        const sum = records.reduce((sum, r) => sum + (key === 'HR' ? (r.HR_max + r.HR_min) / 2 : (r[key as keyof WeatherRecord] as number)), 0);
        value = sum / records.length;
      }
      result.push({ label: month, value });
    }
    return result.sort((a, b) => a.label.localeCompare(b.label));
  }

  close(): void {
    this.dialogRef.close();
  }
}
