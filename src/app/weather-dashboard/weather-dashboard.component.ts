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
import { WeatherService, WeatherStation } from '../services/weather.service';
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
  override parse(value: unknown): Date | null {
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

interface WeatherSummaryRecord {
  cantidadRegistros: number;
  TempMaxAbs: number;
  TempMinAbs: number;
  tempMaxMedia: number;
  tempMinMedia: number;
  amplitudTermica: number;
  diasHelada: number;
  horasHelada: number;
  horasTMenor18: number;
  horasTMayor32: number;
  humedadMaxAbs: number;
  humedadMinAbs: number;
  humedadMaxMedia: number;
  humedadMinMedia: number;
  amplitudHigrica: number;
  horasMenor20: number;
  horasMenor40: number;
  horasMayor80: number;
  horasMayor90: number;
  horasHumedadHoja: number;
  evapotranspiracion: number;
  lluvia: number;
  lluviaMaxDiaria: number;
  diasLluvia: number;
  vientoMedio: number;
  VientoMaximo: number;
  radSolarMedia: number;
  radSolarMax: number;
}

interface WeatherDiaryRecord {
  fecha: string;
  temp_max: number;
  temp_min: number;
  HR_max: number;
  HR_min: number;
  rr_24: number;
  viento_medio: number;
  viento_max: number;
  rad_solar_media: number;
  et: number;
  hum_hoja_hs: number;
}

type WeatherDiaryField = keyof WeatherDiaryRecord;

type VariableSelection = {
  temperatura: boolean;
  humedad: boolean;
  lluvia: boolean;
  viento: boolean;
  radSolar: boolean;
  et: boolean;
  humHoja: boolean;
};

type DashboardScales = NonNullable<ChartConfiguration<'line' | 'bar', number[], string>['options']>['scales'];

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
  stations: WeatherStation[] = [];
  summaryData: WeatherSummaryRecord | null = null;
  diaryData: WeatherDiaryRecord[] = [];

  truncatedDiaryData: WeatherDiaryRecord[] = [];
  showLimitMessage = false;

  chartConfig: ChartConfiguration<'line' | 'bar', number[], string> = {
    type: 'line',
    data: { labels: [], datasets: [] },
    options: {}
  };
  activeTab: string = 'summary';
  loading = false;
  errorMessage: string | null = null;

  selectedVariables: VariableSelection = {
    temperatura: true,
    humedad: false,
    lluvia: false,
    viento: false,
    radSolar: false,
    et: false,
    humHoja: false
  };

  get selectedStationData(): WeatherStation | undefined {
    return this.stations.find(station => station.Identificacion === this.weatherForm?.value?.station);
  }

  get hasLeafWetnessSensor(): boolean {
    return this.flagEnabled(this.selectedStationData?.isSoil);
  }

  get hasRadiationSensor(): boolean {
    return this.flagEnabled(this.selectedStationData?.isRadiation);
  }

  get visibleDisplayedColumns(): string[] {
    const columns = [
      'fecha',
      'temp_max',
      'temp_min',
      'HR_max',
      'HR_min',
      'rr_24',
      'viento_medio',
      'viento_max'
    ];

    if (this.hasRadiationSensor) {
      columns.push('rad_solar_media', 'et');
    }

    if (this.hasLeafWetnessSensor) {
      columns.push('hum_hoja_hs');
    }

    return columns;
  }

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
        this.syncVariableAvailability();
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
      const resumen$ = this.weatherService.getWeatherDataResumen<WeatherSummaryRecord>(desde, hasta, station);
      const resumen = await lastValueFrom(resumen$);
      this.summaryData = resumen.data?.[0] || null;

      const diario$ = this.weatherService.getWeatherDataDiary<WeatherDiaryRecord>(desde, hasta, station);
      const diario = await lastValueFrom(diario$);
      this.diaryData = diario.data || [];

      // Configurar la tabla: limitar a 31 días y mostrar mensaje si excede
      if (this.diaryData.length > 31) {
        this.truncatedDiaryData = this.diaryData.slice(0, 31);
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
    this.syncVariableAvailability();

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

    if (this.selectedVariables.et) {
      datasets.push(
        {
          label: 'Evapotranspiración (mm)',
          type: 'bar',
          data: this.diaryData.map(d => d.et),
          yAxisID: 'yEt',
          backgroundColor: 'red'
        } as ChartDataset<'bar', number[]>
      );
    }

    if (this.selectedVariables.humHoja) {
      datasets.push(
        {
          label: 'Humedad de hoja (hs)',
          type: 'bar',
          data: this.diaryData.map(d => d.hum_hoja_hs),
          yAxisID: 'yHumHoja',
          backgroundColor: 'orange'
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
    if (this.selectedVariables.radSolar) {
      datasets.push(
        {
          label: 'Rad. Solar (W/m²)',
          type: 'line',
          data: this.diaryData.map(d => d.rad_solar_media),
          yAxisID: 'yRad',
          borderColor: '#9f9c00ff',
          backgroundColor: 'rgba(255, 240, 29, 0.2)'
        } as ChartDataset<'line', number[]>
      );
    }

    const scales: DashboardScales = {};
    if (this.selectedVariables.temperatura) {
      scales['yTemp'] = {
        type: 'linear',
        display: true,
        position: 'left',
        title: { display: true, text: 'Temperatura (°C)', color: '#111827' },
        ticks: { color: '#111827' },
        grid: { color: 'rgba(17,24,39,.10)' }
      };
    }
    if (this.selectedVariables.humedad) {
      scales['yHumedad'] = {
        type: 'linear',
        display: true,
        position: 'right',
        title: { display: true, text: 'Humedad (%)', color: '#111827' },
        ticks: { color: '#111827' },
        grid: { color: 'rgba(17,24,39,.10)' }
      };
    }
    if (this.selectedVariables.radSolar) {
      scales['yRad'] = {
        type: 'linear',
        display: true,
        position: 'right',
        title: { display: true, text: 'Rad.Solar (W/m²)', color: '#111827' },
        ticks: { color: '#111827' },
        grid: { color: 'rgba(17,24,39,.10)' }
      };
    }
    if (this.selectedVariables.lluvia) {
      scales['yLluvia'] = {
        type: 'linear',
        display: true,
        position: 'left',
        title: { display: true, text: 'Lluvia (mm)', color: '#111827' },
        ticks: { color: '#111827' },
        grid: { color: 'rgba(17,24,39,.10)' }
      };
    }
    if (this.selectedVariables.et) {
      scales['yEt'] = {
        type: 'linear',
        display: true,
        position: 'left',
        title: { display: true, text: 'et (mm)', color: '#111827' },
        ticks: { color: '#111827' },
        grid: { color: 'rgba(17,24,39,.10)' }
      };
    }
    if (this.selectedVariables.humHoja) {
      scales['yHumHoja'] = {
        type: 'linear',
        display: true,
        position: 'left',
        title: { display: true, text: 'Lluvia (mm)', color: '#111827' },
        ticks: { color: '#111827' },
        grid: { color: 'rgba(17,24,39,.10)' }
      };
    }
    if (this.selectedVariables.viento) {
      scales['yViento'] = {
        type: 'linear',
        display: true,
        position: 'right',
        title: { display: true, text: 'Viento (km/h)', color: '#111827' },
        ticks: { color: '#111827' },
        grid: { color: 'rgba(217,24,39,.10)' }
      };
    }
    scales['x'] = {
      type: 'category',
      ticks: { color: '#111827', font: { weight: 700 } },
      grid: { color: 'rgba(17,24,39,.10)' },
      title: { display: true, text: 'Fecha', color: '#111827', font: { weight: 800 } }
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
            labels: {
              color: '#111827',   // texto leyenda
              font: { weight: 700 }
            }
          },
          tooltip: {
            titleColor: '#111827',
            bodyColor: '#111827',
            backgroundColor: 'rgba(0,0,0,0.7)'
          }
        },
        onClick: (_evt: ChartEvent, elements: ActiveElement[], chart) => {
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

  onStationChange(): void {
    this.syncVariableAvailability();
  }

  private syncVariableAvailability(): void {
    if (!this.hasRadiationSensor) {
      this.selectedVariables.radSolar = false;
      this.selectedVariables.et = false;
    }

    if (!this.hasLeafWetnessSensor) {
      this.selectedVariables.humHoja = false;
    }
  }

  private flagEnabled(value: number | string | undefined): boolean {
    return String(value ?? '0') === '1';
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

  downloadCSV(): void {
    if (!this.truncatedDiaryData.length) return;

    const headers: WeatherDiaryField[] = [
      'fecha',
      'temp_max',
      'temp_min',
      'HR_max',
      'HR_min',
      'rr_24',
      'viento_medio',
      'viento_max',
      'rad_solar_media',
      'et',
      'hum_hoja_hs'
    ];

    const csvRows = [headers.join(',')];

    for (const row of this.truncatedDiaryData) {
      const values = headers.map(key => row[key]);
      csvRows.push(values.join(','));
    }

    // Información de encabezado
    const stationName = this.getStationName(this.weatherForm.value.station).replace(/[^\w\s]/gi, '').replace(/\s+/g, '_');
    const desdeReal = new Date(this.truncatedDiaryData[0]?.fecha);
    desdeReal.setDate(desdeReal.getDate() + 1);

    const hastaReal = new Date(this.truncatedDiaryData[this.truncatedDiaryData.length - 1]?.fecha);
    hastaReal.setDate(hastaReal.getDate() + 1);

    const desdeStr = this.formatDate(desdeReal);         // para el nombre del archivo
    const hastaStr = this.formatDate(hastaReal);

    const desdeLegible = this.formatDateDisplay(desdeReal); // para leyenda visible
    const hastaLegible = this.formatDateDisplay(hastaReal);

    // Agregar línea de advertencia y fuente
    csvRows.push('');
    csvRows.push(`"Nota: La información corresponde a la estación ${stationName} en el período comprendido entre el ${desdeLegible} y el ${hastaLegible}."`);
    csvRows.push('"Los datos son de carácter provisional y puede estar sujeta a modificaciones."');
    csvRows.push('"La EEAOC no asume responsabilidad por las decisiones que se tomen con base a esta información."');

    const csvContent = csvRows.join('\n');
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]); // UTF-8 BOM
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
    // Construir nombre de archivo amigable
    const fileName = `meteo_${stationName}_${desdeStr}_a_${hastaStr}.csv`;

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  private formatDateDisplay(date: Date): string {
    const d = new Date(date);
    const day = ('0' + d.getDate()).slice(-2);
    const month = ('0' + (d.getMonth() + 1)).slice(-2);
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }

  close(): void {
    this.dialogRef.close();
  }
}

