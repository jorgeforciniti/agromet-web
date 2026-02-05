import { CdkTableModule } from '@angular/cdk/table';
import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { Chart, CategoryScale, LinearScale, LineController, PointElement, LineElement, BarController, BarElement, Tooltip, Legend, ChartEvent, ActiveElement, ChartDataset } from 'chart.js';
import { ChartConfiguration } from 'chart.js';
import { lastValueFrom } from 'rxjs';
import { WeatherService } from '../services/weather.service';
import { BaseChartDirective } from 'ng2-charts';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatDialogRef } from '@angular/material/dialog';
import { MatDialogModule } from '@angular/material/dialog';
import { MAT_DATE_LOCALE, MatNativeDateModule, provideNativeDateAdapter } from '@angular/material/core';
import { MAT_DATE_FORMATS } from '@angular/material/core';
import { NativeDateAdapter } from '@angular/material/core';
import { Injectable } from '@angular/core';
import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { DateAdapter } from '@angular/material/core';

@Injectable()
export class DmyDateAdapter extends NativeDateAdapter {
  override parse(value: any): Date | null {
    if (typeof value === 'string' && value.includes('/')) {
      const [dd, mm, yyyy] = value.split('/').map(v => Number(v));
      if ([dd, mm, yyyy].every(n => !isNaN(n))) {
        const date = new Date(yyyy, mm - 1, dd);
        if (
          date.getFullYear() === yyyy &&
          date.getMonth() + 1 === mm &&
          date.getDate() === dd
        ) {
          return date;
        }
      }
    }
    return super.parse(value);
  }
}

export function dmyDateValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const val = control.value;
    if (!val || typeof val !== 'string') return null;
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(val);
    if (!match) return { invalidDate: true };
    const [, dd, mm, yyyy] = match;
    const d = +dd, m = +mm, y = +yyyy;
    const date = new Date(y, m - 1, d);
    if (
      date.getFullYear() !== y ||
      date.getMonth() + 1 !== m ||
      date.getDate() !== d
    ) {
      return { invalidDate: true };
    }
    return null;
  };
}

export const MY_DATE_FORMATS = {
  parse: {
    dateInput: 'dd/MM/yyyy', // Formato de entrada
  },
  display: {
    dateInput: 'dd/MM/yyyy', // Visualización principal
    monthYearLabel: 'MMM yyyy', // Ej: "Jul 2024"
    dateA11yLabel: 'dd/MM/yyyy', // Formato accesible
    monthYearA11yLabel: 'MMMM yyyy' // Mes completo accesible
  },
};

@Component({
  selector: 'app-weather-dashboard',
  templateUrl: './weather-dashboard.component.html',
  styleUrls: ['./weather-dashboard.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatTabsModule,
    MatTableModule,
    MatCheckboxModule,
    BaseChartDirective,
    FormsModule,
    MatDialogModule,
    RouterModule,
    MatDatepickerModule,
    MatNativeDateModule,
    CdkTableModule
  ],
  providers: [
    { provide: DateAdapter, useClass: DmyDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: MY_DATE_FORMATS },
    { provide: MAT_DATE_LOCALE, useValue: 'es-AR' }, // Configura el locale a español argentino
  ],
})
export class WeatherDashboardComponent implements OnInit {
  @ViewChild(BaseChartDirective) chartDirective!: BaseChartDirective;

  weatherForm: FormGroup;
  stations: any[] = [];
  summaryData: any = null;
  diaryData: any[] = [];

  // Nuevas propiedades para la tabla
  truncatedDiaryData: any[] = [];
  showLimitMessage = false;

  displayedColumns: string[] = [
    'fecha',
    'temp_max',
    'temp_min',
    'HR_max',
    'HR_min',
    'rr_24',
    'viento_medio',
    'viento_max'
  ];

  chartConfig: ChartConfiguration<'line' | 'bar', number[], unknown> = {
    type: 'line',
    data: { labels: [], datasets: [] },
    options: {}
  };
  activeTab: string = 'summary';
  loading = false;
  errorMessage: string | null = null;

  selectedVariables = {
    temperatura: true,
    humedad: false,
    lluvia: false,
    viento: false
  };

  constructor(
    private fb: FormBuilder,
    private weatherService: WeatherService,
    private dialogRef: MatDialogRef<WeatherDashboardComponent>
  ) {
    Chart.register(
      CategoryScale,
      LinearScale,
      LineController,
      PointElement,
      LineElement,
      BarController,
      BarElement,
      Tooltip,
      Legend
    );
    this.weatherForm = this.fb.group({
      station: [''],
      desde: [''],
      hasta: ['']
    });
  }

  ngOnInit(): void {
    const defaultDates = this.getDefaultDates();
    this.weatherForm = this.fb.group({
      station: ['', Validators.required],
      desde: [defaultDates.desde, [Validators.required, dmyDateValidator()]],
      hasta: [defaultDates.hasta, [Validators.required, dmyDateValidator()]]
    });
    this.loadStations();
  }

  private getDefaultDates(): { desde: Date; hasta: Date } {
    const today = new Date();
    const desde = new Date(today.getFullYear(), today.getMonth(), 1); // Primer día del mes
    const hasta = new Date(today); // Día actual
    hasta.setDate(today.getDate() - 1); // Ajusta según necesidad
    return { desde, hasta };
  }

  private formatDate(date: Date): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = ('0' + (d.getMonth() + 1)).slice(-2);
  const day = ('0' + d.getDate()).slice(-2);
  return `${year}-${month}-${day}`;
}

  private async loadStations(): Promise<void> {
    try {
      const stations$ = this.weatherService.getStationsAll();
      this.stations = await lastValueFrom(stations$);
      const defaultStation = this.stations.find(s => s.Identificacion === '2049');
      const initialStation = defaultStation || this.stations[0];
      if (initialStation) {
        this.weatherForm.patchValue({
          station: initialStation.Identificacion
        });
      }
    } catch (error) {
      console.error('Error loading stations:', error);
      this.errorMessage = 'Error al cargar las estaciones';
    }
  }

  async loadData(): Promise<void> {
    if (!this.weatherForm.valid) return;

    this.loading = true;
    this.errorMessage = null;

    // 1) Extraemos station y raw desde/hasta del form
    const { station, desde: rawDesde, hasta: rawHasta } = this.weatherForm.value;

    // 2) Convertimos siempre a Date y luego a 'YYYY-MM-DD'
    const desdeDate = new Date(rawDesde);
    const hastaDate = new Date(rawHasta);
    const desde = this.formatDate(desdeDate);
    const hasta = this.formatDate(hastaDate);

    try {
      // 3) Ahora paso strings '2025-04-01' y no objetos Date
      const resumen$ = this.weatherService.getWeatherDataResumen(desde, hasta, station);
      const resumen = await lastValueFrom(resumen$);
      this.summaryData = resumen.data?.[0] || null;

      const diario$ = this.weatherService.getWeatherDataDiary(desde, hasta, station);
      const diario = await lastValueFrom(diario$);
      this.diaryData = diario.data || [];

      // Configurar la tabla: limitar a 30 días y mostrar mensaje si excede
      if (this.diaryData.length > 30) {
        this.truncatedDiaryData = this.diaryData.slice(0, 30);
        this.showLimitMessage = true;
      } else {
        this.truncatedDiaryData = this.diaryData;
        this.showLimitMessage = false;
      }

      if (this.diaryData.length > 0) {
        this.setupCharts();
      }
    } catch (error) {
      console.error('Error loading weather data:', error);
      this.errorMessage = 'Error al cargar los datos meteorológicos';
    } finally {
      this.loading = false;
    }
  }

  public setupCharts(): void {
    const labels = this.diaryData.map(d => d.fecha);
    const datasets: ChartDataset<'line' | 'bar', number[]>[] = [];

    if (this.selectedVariables.temperatura) {
      datasets.push(
        {
          label: 'Temp. Máxima (°C)',
          type: 'line',
          data: this.diaryData.map(d => d.temp_max),
          yAxisID: 'yTemp',
          borderColor: '#FF6384',
          backgroundColor: 'rgba(255,99,132,0.2)'
        } as ChartDataset<'line', number[]>,
        {
          label: 'Temp. Mínima (°C)',
          type: 'line',
          data: this.diaryData.map(d => d.temp_min),
          yAxisID: 'yTemp',
          borderColor: '#36A2EB',
          backgroundColor: 'rgba(54,162,235,0.2)'
        } as ChartDataset<'line', number[]>
      );
    }

    if (this.selectedVariables.humedad) {
      datasets.push(
        {
          label: 'Humedad Máx (%)',
          type: 'line',
          data: this.diaryData.map(d => d.HR_max),
          yAxisID: 'yHumedad',
          borderColor: '#4BC0C0',
          backgroundColor: 'rgba(75,192,192,0.2)'
        } as ChartDataset<'line', number[]>,
        {
          label: 'Humedad Mín (%)',
          type: 'line',
          data: this.diaryData.map(d => d.HR_min),
          yAxisID: 'yHumedad',
          borderColor: '#FF8080',
          backgroundColor: 'rgba(255,128,128,0.2)'
        } as ChartDataset<'line', number[]>
      );
    }

    if (this.selectedVariables.lluvia) {
      datasets.push(
        {
          label: 'Precipitaciones (mm)',
          type: 'bar',
          data: this.diaryData.map(d => d.rr_24),
          yAxisID: 'yLluvia',
          backgroundColor: 'blue'
        } as ChartDataset<'bar', number[]>
      );
    }

    if (this.selectedVariables.viento) {
      datasets.push(
        {
          label: 'Viento Medio (km/h)',
          type: 'line',
          data: this.diaryData.map(d => d.viento_medio),
          yAxisID: 'yViento',
          borderColor: '#009F40',
          backgroundColor: 'rgba(0,159,64,0.2)'
        } as ChartDataset<'line', number[]>,
        {
          label: 'Viento Máx (km/h)',
          type: 'line',
          data: this.diaryData.map(d => d.viento_max),
          yAxisID: 'yViento',
          borderColor: '#FF9F40',
          backgroundColor: 'rgba(255,159,64,0.2)'
        } as ChartDataset<'line', number[]>
      );
    }

    const scales: any = {};
    if (this.selectedVariables.temperatura) {
      scales.yTemp = {
        type: 'linear',
        display: true,
        position: 'left',
        title: { display: true, text: 'Temperatura (°C)', color: 'white' },
        ticks: { color: 'white' },
        grid: { color: 'rgba(255,255,255,0.1)' }
      };
    }
    if (this.selectedVariables.humedad) {
      scales.yHumedad = {
        type: 'linear',
        display: true,
        position: 'right',
        title: { display: true, text: 'Humedad (%)', color: 'white' },
        ticks: { color: 'white' },
        grid: { color: 'rgba(255,255,255,0.1)' }
      };
    }
    if (this.selectedVariables.lluvia) {
      scales.yLluvia = {
        type: 'linear',
        display: true,
        position: 'left',
        title: { display: true, text: 'Lluvia (mm)', color: 'white' },
        ticks: { color: 'white' },
        grid: { color: 'rgba(255,255,255,0.1)' }
      };
    }
    if (this.selectedVariables.viento) {
      scales.yViento = {
        type: 'linear',
        display: true,
        position: 'right',
        title: { display: true, text: 'Viento (km/h)', color: 'white' },
        ticks: { color: 'white' },
        grid: { color: 'rgba(255,255,255,0.1)' }
      };
    }
    scales.x = {
      title: { display: true, text: 'Fecha', color: 'white' },
      ticks: { color: 'white' },
      grid: { color: 'rgba(255,255,255,0.1)' }
    };

    this.chartConfig = {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales,
        plugins: {
          legend: {
            labels: { color: 'white' }
          },
          tooltip: {
            titleColor: 'white',
            bodyColor: 'white',
            backgroundColor: 'rgba(0,0,0,0.7)'
          }
        },
        onClick: (evt: ChartEvent, elements: ActiveElement[], chart) => {
          if (elements.length > 0) {
            const { datasetIndex, index } = elements[0];
            const ds = chart.data.datasets?.[datasetIndex] as ChartDataset<'line' | 'bar', number[]>;
            const value = ds.data[index];
            alert(`${ds.label}: ${value}`);
          }
        }
      }
    };
  }

  setActiveTab(tab: string): void {
    this.activeTab = tab;
    if (tab === 'charts' && this.diaryData.length > 0) {
      setTimeout(() => this.setupCharts(), 50);
    }
  }

  getTabName(tabKey: string): string {
    const tabNames: { [key: string]: string } = {
      summary: 'Resumen',
      charts: 'Gráficos',
      tables: 'Tablas'
    };
    return tabNames[tabKey] || 'Otra pestaña';
  }

  getStationName(stationId: string): string {
    const station = this.stations.find(s => s.Identificacion === stationId);
    return station?.nombre || 'Estación desconocida';
  }

  closeDashboard(): void {
    this.dialogRef.close();
  }
}
