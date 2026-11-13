import { CdkTableModule } from '@angular/cdk/table';
import { Component, OnInit, ViewChild, inject } from '@angular/core';
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
import { ChartDataset } from 'chart.js';
import { VAR_COLOR, GRID_COLOR, conAlfa } from '../charts/chart-theme';
import { referenciasHelada } from '../charts/referencias';
import { ClaveNormal, Normales, datasetNormal, normalDiaria, textoPeriodoNormales, tieneValores } from '../charts/normales';
import { NormalesService } from '../services/normales.service';
import { describirFaltantes, etiquetaDia, fechasDelPeriodo, pluginFranjasSinDatos, porFecha, valorDiario } from '../charts/dias-faltantes';
import { ChartConfiguration } from 'chart.js';
import { lastValueFrom } from 'rxjs';
import { WeatherService, WeatherStation } from '../services/weather.service';
import { StationService } from '../services/station.service';
import { SelectorEstacionComponent } from '../shared/selector-estacion.component';
import { BaseChartDirective } from 'ng2-charts';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CopiarEnlaceComponent } from '../shared/copiar-enlace.component';
import { FUENTE_NOMBRE, FUENTE_URL, MAX_DIAS_DESCARGA } from '../shared/fuente';
import { armarEnlace, consultaDe, leerFecha } from '../shared/enlace-consulta';
import { RangoFechas, periodoRecordado, recordarPeriodo } from '../shared/periodo-recordado';
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
  /** Puede faltar: sensor de lluvia dado de baja en el período (depuración de datos) */
  diasLluvia?: number;
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

import { ValorPipe } from '../pipes/valor.pipe';
import { ExportarGraficoComponent } from '../shared/exportar-grafico.component';
import { ComoSeLeeComponent } from '../shared/como-se-lee.component';
import { EncabezadoDialogoComponent } from '../shared/encabezado-dialogo.component';
import { AvisoBajasComponent, ConsultaBajas } from '../shared/aviso-bajas.component';

@Component({
  selector: 'app-weather-dashboard',
  templateUrl: './weather-dashboard.component.html',
  styleUrls: ['./weather-dashboard.component.css'],
  standalone: true,
  imports: [
    EncabezadoDialogoComponent, ComoSeLeeComponent, AvisoBajasComponent,
    ExportarGraficoComponent,
    CopiarEnlaceComponent,
    SelectorEstacionComponent,
    CommonModule,
    ValorPipe,
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
  /** Normales de la estación consultada (null si no tiene: no se grafican) */
  private normales: Normales | null = null;
  /** Período de referencia de esas normales («1991–2020»), si la API lo trae */
  get periodoNormales(): string {
    return textoPeriodoNormales(this.normales);
  }
  private readonly normalesService = inject(NormalesService);

  truncatedDiaryData: WeatherDiaryRecord[] = [];

  /** Calendario completo del período consultado (la API omite los días sin registro) */
  private fechasPeriodo: string[] = [];
  /** Estación y período de la última consulta (el formulario puede cambiar después) */
  estacionConsultada = '';
  periodoConsultado = '';
  /** Estación y período consultados, para el aviso de sensores dados de baja */
  consultaBajas: ConsultaBajas | ConsultaBajas[] | null = null;
  /** Posición en el eje de los días sin registro (franjas grises) y su descripción */
  indicesSinRegistro: number[] = [];
  textoFaltantes = '';
  readonly pluginsGrafico = [pluginFranjasSinDatos(() => this.indicesSinRegistro)];
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

  /** Favoritas del usuario, para mostrarlas primero en el selector */
  readonly favoritas$ = inject(StationService).favoritas$;

  /** Consulta recibida por enlace (ver shared/enlace-consulta.ts) */
  private readonly consulta = consultaDe(inject(MAT_DIALOG_DATA, { optional: true }));

  /** Enlace a la consulta actual (botón "Copiar enlace") */
  readonly enlaceConsulta = (): string => {
    const v = this.weatherForm.getRawValue();
    return armarEnlace('datos-localidad', { estacion: v.station, desde: v.desde, hasta: v.hasta });
  };

  constructor(
    private fb: FormBuilder,
    private weatherService: WeatherService,
    private stationService: StationService,
    private dialogRef: MatDialogRef<WeatherDashboardComponent>
  ) {
    this.weatherForm = this.fb.group({
      station: [''],
      desde: [''],
      hasta: ['']
    });
  }

  /** Período que se usa si no hay uno recordado (shared/periodo-recordado.ts) */
  private periodoPorDefecto!: RangoFechas;

  ngOnInit(): void {
    this.periodoPorDefecto = this.getDefaultDates();
    // Último período elegido (24 h), salvo que el enlace traiga fechas
    const defaultDates = periodoRecordado('datos-localidad', this.consulta) ?? this.periodoPorDefecto;
    this.weatherForm = this.fb.group({
      station: ['', Validators.required],
      desde: [defaultDates.desde, [Validators.required, dmyDateValidator()]],
      hasta: [defaultDates.hasta, [Validators.required, dmyDateValidator()]]
    });
    const desde = leerFecha(this.consulta['desde']);
    const hasta = leerFecha(this.consulta['hasta']);
    if (desde) this.weatherForm.controls['desde'].setValue(desde);
    if (hasta) this.weatherForm.controls['hasta'].setValue(hasta);
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
      const defaultStation = this.stations.find(s => s.Identificacion === this.stationService.activa);
      const initialStation = defaultStation || this.stations[0];
      if (initialStation) {
        this.weatherForm.patchValue({
          station: initialStation.Identificacion
        });
        this.syncVariableAvailability();
        // Desde un enlace, la consulta se ejecuta sola
        if (Object.keys(this.consulta).length) void this.loadData();
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
    recordarPeriodo('datos-localidad', desdeDate, hastaDate, this.periodoPorDefecto);
    const dma = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    this.estacionConsultada = this.getStationName(station);
    this.periodoConsultado = `${dma(desdeDate)} a ${dma(hastaDate)}`;
    this.consultaBajas = { estacion: station, desde, hasta };

    try {
      // 3) Ahora paso strings '2025-04-01' y no objetos Date
      const resumen$ = this.weatherService.getWeatherDataResumen<WeatherSummaryRecord>(desde, hasta, station);
      const resumen = await lastValueFrom(resumen$);
      this.summaryData = resumen.data?.[0] || null;

      const diario$ = this.weatherService.getWeatherDataDiary<WeatherDiaryRecord>(desde, hasta, station);
      const [diario, normales] = await Promise.all([
        lastValueFrom(diario$),
        lastValueFrom(this.normalesService.deEstacion(station))
      ]);
      this.diaryData = diario.data || [];
      this.normales = normales;

      // Días del período sin registro: huecos y franjas grises en el gráfico, y aviso
      const registros = porFecha(this.diaryData);
      this.fechasPeriodo = fechasDelPeriodo(desdeDate, hastaDate, f => registros.has(f));
      this.indicesSinRegistro = this.fechasPeriodo.map((f, i) => (registros.has(f) ? -1 : i)).filter(i => i >= 0);
      this.textoFaltantes = describirFaltantes(this.indicesSinRegistro.map(i => this.fechasPeriodo[i]));

      // Tabla y descarga: como máximo los últimos 31 días del período
      if (this.diaryData.length > MAX_DIAS_DESCARGA) {
        this.truncatedDiaryData = this.diaryData.slice(-MAX_DIAS_DESCARGA);
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

    // Eje con todos los días del período en dd/MM: un día sin registro queda como hueco.
    const fechas = this.fechasPeriodo;
    const labels = fechas.map(etiquetaDia);
    const registros = porFecha(this.diaryData);
    const serie = (campo: WeatherDiaryField) => fechas.map(f => valorDiario(registros.get(f), campo)) as number[];
    const datasets: ChartDataset<'line' | 'bar', number[]>[] = [];

    // Normal de cada variable (línea punteada del mismo color), sólo si la estación la tiene.
    // La lluvia normal mensual se muestra como promedio diario (normal del mes ÷ días del mes).
    const agregarNormal = (clave: ClaveNormal, label: string, eje: string, color: string) => {
      const serie = normalDiaria(this.normales, clave, fechas);
      if (tieneValores(serie)) {
        datasets.push({ ...datasetNormal(`Normal ${label}`, serie, color), yAxisID: eje } as unknown as ChartDataset<'line', number[]>);
      }
    };

    if (this.selectedVariables.temperatura) {
      datasets.push(
        {
          label: 'Temp. Máxima (°C)',
          type: 'line',
          data: serie('temp_max'),
          yAxisID: 'yTemp',
          borderColor: VAR_COLOR.tmax,
          backgroundColor: conAlfa(VAR_COLOR.tmax, .2)
        } as ChartDataset<'line', number[]>,
        {
          label: 'Temp. Mínima (°C)',
          type: 'line',
          data: serie('temp_min'),
          yAxisID: 'yTemp',
          borderColor: VAR_COLOR.tmin,
          backgroundColor: conAlfa(VAR_COLOR.tmin, .2)
        } as ChartDataset<'line', number[]>
      );
      agregarNormal('th', 'temp. máx. (°C)', 'yTemp', VAR_COLOR.tmax);
      agregarNormal('tl', 'temp. mín. (°C)', 'yTemp', VAR_COLOR.tmin);
    }

    if (this.selectedVariables.humedad) {
      datasets.push(
        {
          label: 'Humedad Máx (%)',
          type: 'line',
          data: serie('HR_max'),
          yAxisID: 'yHumedad',
          borderColor: VAR_COLOR.hrMax,
          backgroundColor: conAlfa(VAR_COLOR.hrMax, .2)
        } as ChartDataset<'line', number[]>,
        {
          label: 'Humedad Mín (%)',
          type: 'line',
          data: serie('HR_min'),
          yAxisID: 'yHumedad',
          borderColor: VAR_COLOR.hrMin,
          backgroundColor: conAlfa(VAR_COLOR.hrMin, .2)
        } as ChartDataset<'line', number[]>
      );
      agregarNormal('hh', 'humedad máx. (%)', 'yHumedad', VAR_COLOR.hrMax);
      agregarNormal('hl', 'humedad mín. (%)', 'yHumedad', VAR_COLOR.hrMin);
    }

    if (this.selectedVariables.lluvia) {
      datasets.push(
        {
          label: 'Precipitaciones (mm)',
          type: 'bar',
          data: serie('rr_24'),
          yAxisID: 'yLluvia',
          backgroundColor: conAlfa(VAR_COLOR.lluvia, .75)
        } as ChartDataset<'bar', number[]>
      );
      agregarNormal('rr', 'lluvia, promedio diario (mm)', 'yLluvia', VAR_COLOR.lluvia);
    }

    if (this.selectedVariables.et) {
      datasets.push(
        {
          label: 'Evapotranspiración (mm)',
          type: 'bar',
          data: serie('et'),
          yAxisID: 'yEt',
          backgroundColor: conAlfa(VAR_COLOR.et, .75)
        } as ChartDataset<'bar', number[]>
      );
      agregarNormal('et', 'evapotranspiración (mm)', 'yEt', VAR_COLOR.et);
    }

    if (this.selectedVariables.humHoja) {
      datasets.push(
        {
          label: 'Humedad de hoja (hs)',
          type: 'bar',
          data: serie('hum_hoja_hs'),
          yAxisID: 'yHumHoja',
          backgroundColor: conAlfa(VAR_COLOR.mojado, .75)
        } as ChartDataset<'bar', number[]>
      );
      agregarNormal('hj', 'humedad de hoja (hs)', 'yHumHoja', VAR_COLOR.mojado);
    }

    if (this.selectedVariables.viento) {
      datasets.push(
        {
          label: 'Viento Medio (km/h)',
          type: 'line',
          data: serie('viento_medio'),
          yAxisID: 'yViento',
          borderColor: VAR_COLOR.viento,
          backgroundColor: conAlfa(VAR_COLOR.viento, .2)
        } as ChartDataset<'line', number[]>,
        {
          label: 'Viento Máx (km/h)',
          type: 'line',
          data: serie('viento_max'),
          yAxisID: 'yViento',
          borderColor: VAR_COLOR.rafaga,
          backgroundColor: conAlfa(VAR_COLOR.rafaga, .2)
        } as ChartDataset<'line', number[]>
      );
      agregarNormal('vi', 'viento medio (km/h)', 'yViento', VAR_COLOR.viento);
      agregarNormal('vix', 'viento máx. (km/h)', 'yViento', VAR_COLOR.rafaga);
    }
    if (this.selectedVariables.radSolar) {
      datasets.push(
        {
          label: 'Rad. Solar (W/m²)',
          type: 'line',
          data: serie('rad_solar_media'),
          yAxisID: 'yRad',
          borderColor: VAR_COLOR.radiacion,
          backgroundColor: conAlfa(VAR_COLOR.radiacion, .2)
        } as ChartDataset<'line', number[]>
      );
      agregarNormal('rg', 'rad. solar (W/m²)', 'yRad', VAR_COLOR.radiacion);
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
        title: { display: true, text: 'ET (mm)', color: '#111827' },
        ticks: { color: '#111827' },
        grid: { color: 'rgba(17,24,39,.10)' }
      };
    }
    if (this.selectedVariables.humHoja) {
      scales['yHumHoja'] = {
        type: 'linear',
        display: true,
        position: 'left',
        title: { display: true, text: 'Hoja mojada (h)', color: '#111827' },
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
        grid: { color: GRID_COLOR }
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
          referencias: { lineas: this.selectedVariables.temperatura ? referenciasHelada('yTemp') : [] },
          legend: {
            labels: {
              color: '#111827',   // texto leyenda
              font: { weight: 700 }
            }
          },
          // Texto claro sobre el fondo oscuro del tooltip (antes era #111827 sobre negro, ilegible).
          // El tooltip ya muestra serie y valor, por eso no hay onClick con alert().
          tooltip: {
            titleColor: '#ffffff',
            bodyColor: '#ffffff',
            backgroundColor: 'rgba(17,24,39,0.9)'
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
    this.stationService.setActiva(this.weatherForm.value.station);
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
      tables: 'Tabla'
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
    csvRows.push(`"Fuente: ${FUENTE_NOMBRE} - ${FUENTE_URL}"`);

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

