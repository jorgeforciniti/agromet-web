import { Component, Inject, Injectable, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
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
import { MatTableModule } from '@angular/material/table';
import { WeatherService, WeatherStation } from '../services/weather.service';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

interface ThermalDayRecord {
  fecha: string;
  temp_max: number;
  temp_min: number;
}

interface ThermalHourlyRecord {
  hora: string;
  temp_af?: number | string | null;
}

interface ThermalSumRow {
  date: string;
  dailyValue: number | null;
  accumulated: number | null;
  insufficient: boolean;
}

const THERMAL_DATE_FORMATS = {
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
class ThermalDateAdapter extends NativeDateAdapter {
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
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }
}

@Component({
  selector: 'app-thermal-sum-dialog',
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
    MatTableModule
  ],
  providers: [
    { provide: MAT_DATE_LOCALE, useValue: 'es-AR' },
    { provide: DateAdapter, useClass: ThermalDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: THERMAL_DATE_FORMATS }
  ],
  templateUrl: './thermal-sum-dialog.component.html',
  styleUrls: ['./thermal-sum-dialog.component.css']
})
export class ThermalSumDialogComponent implements OnInit {
  form!: FormGroup;
  stations: WeatherStation[] = [];
  rows: ThermalSumRow[] = [];
  displayedColumns = ['date', 'dailyValue', 'accumulated'];
  isLoading = false;
  loadError = '';
  totalThermalSum = 0;
  validDays = 0;

  readonly baseOptions = [0, 5, 10, 12, 12.5, 15, 18];
  readonly data: Record<string, unknown>;

  constructor(
    private fb: FormBuilder,
    private weatherService: WeatherService,
    private dialogRef: MatDialogRef<ThermalSumDialogComponent>,
    @Inject(MAT_DIALOG_DATA) dialogData: Record<string, unknown> | null
  ) {
    this.data = dialogData ?? {};
  }

  ngOnInit(): void {
    const today = new Date();
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const monthStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), 1);

    this.form = this.fb.group({
      station: ['2049', Validators.required],
      base: [10, Validators.required],
      from: [monthStart, Validators.required],
      to: [yesterday, Validators.required]
    }, { validators: this.dateRangeValidator });

    this.weatherService.getStationsAll().subscribe({
      next: (stations) => {
        this.stations = [...stations]
          .filter(st => st.Identificacion !== '20')
          .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
        this.calculate();
      },
      error: () => {
        this.loadError = 'No se pudieron cargar las estaciones disponibles.';
      }
    });
  }

  calculate(): void {
    this.form.markAllAsTouched();
    this.loadError = '';
    this.rows = [];
    this.totalThermalSum = 0;
    this.validDays = 0;

    if (this.form.invalid) {
      return;
    }

    const { station, base, from, to } = this.form.getRawValue();
    const fromDate = this.coerceDate(from);
    const toDate = this.coerceDate(to);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime()) || fromDate >= toDate) {
      this.loadError = 'Revisa el rango de fechas para continuar.';
      return;
    }

    const stationInfo = this.stations.find(st => st.Identificacion === station);
    const minRecords = Number(stationInfo?.habilitada ?? 0) > 2 ? 20 : 80;

    this.isLoading = true;
    const fromApi = this.formatApiDate(fromDate);
    const toApi = this.formatApiDate(toDate);

    forkJoin({
      daily: this.weatherService.getWeatherDataDiary<ThermalDayRecord>(fromApi, toApi, station),
      hourlyCounts: forkJoin(
        this.buildDateRange(fromDate, toDate).map(date =>
          this.weatherService.getWeatherDataHourly<ThermalHourlyRecord>(date, station).pipe(
            catchError(() => of({ data: [] }))
          )
        )
      )
    }).subscribe({
      next: ({ daily, hourlyCounts }) => {
        let accumulated = 0;
        const hourlyCountByDate = new Map<string, number>();

        this.buildDateRange(fromDate, toDate).forEach((date, index) => {
          const response = hourlyCounts[index];
          const validCount = (response.data ?? []).filter(item => this.toNumber(item.temp_af) !== null).length;
          hourlyCountByDate.set(date, validCount);
        });

        this.rows = (daily.data ?? []).map(record => {
          const dailyValue = this.calculateDailyThermalSum(record, Number(base));
          const recordsCount = hourlyCountByDate.get(record.fecha) ?? 0;
          const insufficient = (dailyValue > 50 || recordsCount < minRecords);

          if (!insufficient) {
            accumulated += dailyValue;
          }

          return {
            date: record.fecha,
            dailyValue: insufficient ? null : dailyValue,
            accumulated: insufficient ? null : accumulated,
            insufficient
          };
        });

        this.totalThermalSum = accumulated;
        this.validDays = this.rows.filter(row => !row.insufficient).length;
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
        this.loadError = 'No se pudieron calcular las sumas térmicas para el período seleccionado.';
      }
    });
  }

  close(): void {
    this.dialogRef.close();
  }

  stationLabel(stationId: string): string {
    const station = this.stations.find(st => st.Identificacion === stationId);
    return station ? `${station.Identificacion} - ${station.nombre}` : stationId;
  }

  formatDisplayDate(date: string): string {
    const [year, month, day] = date.split('-');
    return `${day}/${month}/${year}`;
  }

  private calculateDailyThermalSum(record: ThermalDayRecord, base: number): number {
    const maxCapped = Math.min(Number(record.temp_max ?? 0), 30);
    const min = Number(record.temp_min ?? 0);
    const value = ((maxCapped + min) / 2) - base;
    return value < 0 ? 0 : value;
  }

  private dateRangeValidator(group: AbstractControl): ValidationErrors | null {
    const formGroup = group as FormGroup;
    const start = formGroup.get('from')?.value;
    const end = formGroup.get('to')?.value;
    return start && end && start >= end ? { invalidRange: true } : null;
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

  private formatApiDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private buildDateRange(start: Date, end: Date): string[] {
    const dates: string[] = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());

    while (cursor <= end) {
      dates.push(this.formatApiDate(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }

    return dates;
  }

  private toNumber(value: number | string | null | undefined): number | null {
    if (value == null || value === '') {
      return null;
    }

    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
}
