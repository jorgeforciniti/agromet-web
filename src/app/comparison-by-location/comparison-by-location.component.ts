import { Component, Inject, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { SERIE_COLOR } from '../charts/chart-theme';
import { referenciaCalor, referenciaNocheCalida, referenciasHelada } from '../charts/referencias';
import { ResumenSerie, resumirSeries, unidadDe } from '../charts/resumen-series';
import { NORMAL_DE_VARIABLE, Normales, datasetNormal, normalDeGrupo, normalDiaria, textoPeriodoNormales, tieneValores } from '../charts/normales';
import {
  FormatoSerie, Periodo, SerieConFaltantes, VARIABLES_ACUMULADAS, datasetsConFaltantes, esIncompleto, fechasDelPeriodo,
  indicesSinDatos, periodosDe, pluginFranjasSinDatos, porFecha, serieConFaltantes, textoFaltantesSeries, tooltipConFaltantes
} from '../charts/dias-faltantes';
import { NormalesService } from '../services/normales.service';

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
import { forkJoin, of } from 'rxjs';
import { WeatherService, WeatherStation } from '../services/weather.service';
import { StationService } from '../services/station.service';
import { CopiarEnlaceComponent } from '../shared/copiar-enlace.component';
import { ComoSeLeeComponent } from '../shared/como-se-lee.component';
import { EncabezadoDialogoComponent } from '../shared/encabezado-dialogo.component';
import { armarEnlace, consultaDe, leerFecha } from '../shared/enlace-consulta';
import { RangoFechas, periodoRecordado, recordarPeriodo } from '../shared/periodo-recordado';
import { SelectorEstacionComponent } from '../shared/selector-estacion.component';
import { ChartData, ChartDataset } from 'chart.js';
import { ValidationErrors, AbstractControl } from '@angular/forms';
import { DateAdapter, MAT_DATE_FORMATS } from '@angular/material/core';
import { Injectable } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { ExportarGraficoComponent } from '../shared/exportar-grafico.component';
import { AvisoBajasComponent, ConsultaBajas } from '../shared/aviso-bajas.component';

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
    EncabezadoDialogoComponent, MatButtonModule, ExportarGraficoComponent,
    ComoSeLeeComponent, AvisoBajasComponent,
    CopiarEnlaceComponent,
    SelectorEstacionComponent,
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
  /** Días sin dato (franjas grises), aviso y si hay períodos agrupados incompletos */
  indicesSinRegistro: number[] = [];
  textoFaltantes = '';
  hayIncompletos = false;
  /** Período de referencia de las normales graficadas, si la API lo trae (vacío si no) */
  periodoNormales = '';
  readonly pluginsGrafico = [pluginFranjasSinDatos(() => this.indicesSinRegistro)];
  isLoading = false;
  /** Estación y período consultados, para el aviso de sensores dados de baja */
  consultaBajas: ConsultaBajas | ConsultaBajas[] | null = null;

  /** Variable del gráfico actual: decide las líneas de referencia (helada, 35 °C) */
  private variableGraficada = '';

  /** Máxima, mínima, total o promedio y comparación con la normal de cada serie */
  resumenSeries: ResumenSerie[] = [];

  chartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        position: 'left',
        display: true,
        ticks: { color: '#111827', font: { weight: 700 } },
        grid: { color: 'rgba(17,24,39,.10)' }
      },
      x: {
        ticks: { color: '#111827', font: { weight: 700 } },
        grid: { color: 'rgba(17,24,39,.10)' }
      }
    },
    plugins: {
      legend: {
        labels: { color: '#111827', font: { weight: 700 } }
      }
    }
  } as const;

  variables = [
    { key: 'temp_max', label: 'Temperatura máxima (°C)' },
    { key: 'temp_min', label: 'Temperatura mínima (°C)' },
    { key: 'HR', label: 'Humedad relativa media (%)' },
    { key: 'rr_24', label: 'Lluvia (mm)' },
    { key: 'presion_media_24', label: 'Presión atmosférica (hPa)' },
    { key: 'viento_medio', label: 'Velocidad de viento (km/h)' },
    { key: 'rad_solar_media', label: 'Radiación solar (W/m²)' },
    { key: 'et', label: 'Evapotranspiración (mm)' },
    { key: 'hum_hoja_hs', label: 'Hoja mojada (h)' }
  ];

  readonly data: Record<string, unknown>;

  /** Favoritas del usuario, para mostrarlas primero en el selector */
  readonly favoritas$ = inject(StationService).favoritas$;

  private readonly normalesService = inject(NormalesService);

  /** Enlace a la consulta actual (botón "Copiar enlace") */
  readonly enlaceConsulta = (): string => {
    const v = this.form.getRawValue();
    return armarEnlace('comparar-localidades', {
      estacion: v.estacion, comparar: v.compStation, desde: this.coerceDate(v.fechaDesde),
      hasta: this.coerceDate(v.fechaHasta), variable: v.variable, formato: v.formato
    });
  };

  constructor(
    private fb: FormBuilder,
    private weatherService: WeatherService,
    private stationService: StationService,
    private dialogRef: MatDialogRef<ComparisonByLocationComponent>,
    @Inject(MAT_DIALOG_DATA) dialogData: Record<string, unknown> | null
  ) {
    this.data = dialogData ?? {};
  }

  /** Período que se usa si no hay uno recordado (shared/periodo-recordado.ts) */
  private periodoPorDefecto!: RangoFechas;

  ngOnInit() {
    this.weatherService.getStationsAll().subscribe(res => this.stations = res);
    const currentYear = new Date().getFullYear();
    for (let y = 2006; y <= currentYear; y++) {
      this.comparisonYears.push(y);
    }
    const today = new Date();
    const start = new Date();
    start.setDate(today.getDate() - 59);
    this.periodoPorDefecto = { desde: start, hasta: today };
    // Último período elegido (24 h), salvo que el enlace traiga fechas
    const recordado = periodoRecordado('comparar-localidades', consultaDe(this.data));
    this.form = this.fb.group({
      estacion: [this.stationService.activa, Validators.required],
      fechaDesde: [recordado?.desde ?? start, Validators.required],
      fechaHasta: [recordado?.hasta ?? today, Validators.required],
      compStation: ['', Validators.required],  // <- Cambiado aquí
      variable: ['temp_max', Validators.required],
      formato: ['diario', Validators.required]
    }, { validators: this.dateRangeValidator });

    // Consulta recibida por enlace: se aplica y, si trae la segunda estación, se ejecuta
    const consulta = consultaDe(this.data);
    if (Object.keys(consulta).length) {
      const desde = leerFecha(consulta['desde']);
      const hasta = leerFecha(consulta['hasta']);
      if (desde) this.form.controls['fechaDesde'].setValue(desde);
      if (hasta) this.form.controls['fechaHasta'].setValue(hasta);
      if (consulta['comparar']) this.form.controls['compStation'].setValue(consulta['comparar']);
      // Sólo valores que existen en el formulario (un enlace editado a mano no rompe el gráfico)
      if (this.variables.some(v => v.key === consulta['variable'])) this.form.controls['variable'].setValue(consulta['variable']);
      if (['diario', 'decadico', 'mensual'].includes(consulta['formato'])) this.form.controls['formato'].setValue(consulta['formato']);
      if (this.form.valid) this.onSubmit();
    }
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
    this.indicesSinRegistro = [];
    this.textoFaltantes = '';
    this.hayIncompletos = false;
    this.periodoNormales = '';
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.isLoading = true;
    this.resetCharts();

    const { estacion, fechaDesde, fechaHasta, compStation, variable, formato } = this.form.value; // 

    const dFrom = this.coerceDate(fechaDesde);
    const dTo = this.coerceDate(fechaHasta);
    recordarPeriodo('comparar-localidades', dFrom, dTo, this.periodoPorDefecto);

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
      comp: this.weatherService.getWeatherDataDiary<WeatherRecord>(formatDate(dFrom), formatDate(dTo), compStation),
      normalesBase: this.normalesService.deEstacion(estacion),
      normalesComp: this.normalesService.deEstacion(compStation),
      // Desde un enlace la consulta arranca antes de que llegue la lista: se espera para los nombres
      estaciones: this.stations.length ? of(this.stations) : this.weatherService.getStationsAll()
    }).subscribe({
      next: ({ base, comp, normalesBase, normalesComp, estaciones }) => {
        this.stations = estaciones;
        const baseStation = this.stations.find(s => s.Identificacion === estacion)?.nombre || estacion;
        const compStationName = this.stations.find(s => s.Identificacion === compStation)?.nombre || compStation;
        this.consultaBajas = [
          { estacion, desde: formatDate(dFrom), hasta: formatDate(dTo), nombre: baseStation },
          { estacion: compStation, desde: formatDate(dFrom), hasta: formatDate(dTo), nombre: compStationName }
        ];

        this.applyBuildCharts(base.data, comp.data, baseStation, compStationName, dFrom, dTo, variable, formato,
          [normalesBase, normalesComp]);
        this.isLoading = false;
      },
      error: (error) => {
        this.isLoading = false;
        this.resetCharts();
        console.error('Error al calcular comparación por localidad', error);
      }
    });

    // La estación elegida acá pasa a ser la activa del sitio (ver StationService)
    this.form.controls['estacion'].valueChanges.subscribe(id => this.stationService.setActiva(id));
  }

  private applyBuildCharts(
    baseData: WeatherRecord[],
    compData: WeatherRecord[],
    baseStation: string,
    compStation: string,
    desde: Date,
    hasta: Date,
    key: string,
    formato: string,
    normales: [Normales | null, Normales | null] = [null, null]
  ): void {
    const meta = this.variables.find(v => v.key === key)!;
    const isBar = VARIABLES_ACUMULADAS.includes(key);

    // Calendario común: cada estación se ubica por fecha, así un faltante no corre la otra serie
    const regBase = porFecha(baseData);
    const regComp = porFecha(compData);
    const fechas = fechasDelPeriodo(desde, hasta, f => regBase.has(f) || regComp.has(f));
    const periodos = periodosDe(fechas, formato as FormatoSerie);
    const series = [serieConFaltantes(regBase, periodos, key), serieConFaltantes(regComp, periodos, key)];
    const nombres = [baseStation, compStation];

    // Normal de cada estación (si la tiene), punteada y del color de su serie
    const clave = NORMAL_DE_VARIABLE[key];
    const normalesSeries: ChartDataset<'line', (number | null)[]>[] = [];
    // Cada estación puede tener normales de un período distinto: se indica el de cada una
    const periodosNormal: string[] = [];
    series.forEach((s, k) => {
      const serie = formato === 'diario'
        ? normalDiaria(normales[k], clave, fechas)
        : periodos.map((p, i) => normalDeGrupo(normales[k], clave, s.fechasConDato[i].length ? s.fechasConDato[i] : p.fechas));
      if (tieneValores(serie)) {
        normalesSeries.push(datasetNormal(`Normal ${nombres[k]}`, serie, SERIE_COLOR[k % SERIE_COLOR.length]));
        const periodo = textoPeriodoNormales(normales[k]);
        if (periodo) periodosNormal.push(`${nombres[k]}, ${periodo}`);
      }
    });
    this.periodoNormales = periodosNormal.join('; ');

    this.variableGraficada = key;
    this.mostrarSeries(meta.label, isBar, periodos, series, nombres.map(n => `${meta.label} ${n}`), nombres, normalesSeries);
  }

  /**
   * Gráfico con las dos series ubicadas por fecha sobre el calendario del período: los días
   * sin dato quedan como hueco con franja gris, y los períodos agrupados incompletos se
   * marcan (barra clara o punto hueco, "≥" en las sumas).
   */
  private mostrarSeries(tituloEje: string, isBar: boolean, periodos: Periodo[], series: SerieConFaltantes[],
    etiquetas: string[], nombres: string[], normales: ChartDataset<'line', (number | null)[]>[]): void {
    this.chartLabels = periodos.map(p => p.etiqueta);
    const datasets = [...datasetsConFaltantes(series, etiquetas, isBar, SERIE_COLOR), ...normales];
    if (isBar) {
      this.barChartData = { labels: this.chartLabels, datasets: datasets as unknown as ChartDataset<'bar', number[]>[] };
    } else {
      this.lineChartData = { labels: this.chartLabels, datasets: datasets as unknown as ChartDataset<'line', number[]>[] };
    }

    this.resumenSeries = resumirSeries(series, nombres, SERIE_COLOR, isBar, normales, unidadDe(tituloEje));
    this.indicesSinRegistro = indicesSinDatos(series);
    this.textoFaltantes = textoFaltantesSeries(series, nombres);
    this.hayIncompletos = series.some(s => s.valores.some((_, i) => esIncompleto(s, i)));

    // Objeto nuevo para que ng2-charts aplique el cambio de opciones.
    this.chartOptions = {
      ...this.chartOptions,
      scales: {
        ...this.chartOptions.scales,
        y: { ...this.chartOptions.scales.y, title: { display: true, text: tituloEje, color: '#111827' } }
      },
      plugins: {
        ...this.chartOptions.plugins,
        tooltip: tooltipConFaltantes(series, isBar),
        referencias: {
          lineas: this.variableGraficada === 'temp_min' ? [...referenciasHelada(), referenciaNocheCalida()]
            : this.variableGraficada === 'temp_max' ? [referenciaCalor()] : []
        }
      }
    };
  }

  close(): void {
    this.dialogRef.close();
  }
}
