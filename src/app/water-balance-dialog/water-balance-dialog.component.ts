import { Component, Inject, Injectable, OnInit, ViewEncapsulation, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { DateAdapter, MAT_DATE_FORMATS, MAT_DATE_LOCALE, MatNativeDateModule, NativeDateAdapter } from '@angular/material/core';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import '../charts/chart-theme';
import { GRID_COLOR, VAR_COLOR, conAlfa } from '../charts/chart-theme';
import { fechaIso, fechasDelPeriodo, pluginFranjasSinDatos, porFecha } from '../charts/dias-faltantes';
import { WeatherService, WeatherStation } from '../services/weather.service';
import { StationService } from '../services/station.service';
import { CopiarEnlaceComponent } from '../shared/copiar-enlace.component';
import { ExportarGraficoComponent } from '../shared/exportar-grafico.component';
import { armarEnlace, consultaDe, leerFecha, leerNumero } from '../shared/enlace-consulta';
import { GruposEstacionesPipe } from '../pipes/grupos-estaciones.pipe';
import { ALMACENAJE_INICIAL, CMR, DecadaBalance, OpcionesBalance, ResultadoBalance, calcularBalance, inicioDelCalculo } from './balance-hidrico';

const FORMATOS_FECHA = {
  parse: { dateInput: 'DD/MM/YYYY' },
  display: { dateInput: 'DD/MM/YYYY', monthYearLabel: 'MMM YYYY', dateA11yLabel: 'LL', monthYearA11yLabel: 'MMMM YYYY' }
};

@Injectable()
class FechaArgAdapter extends NativeDateAdapter {
  override parse(value: unknown): Date | null {
    if (typeof value === 'string' && value.includes('/')) {
      const [d, m, a] = value.split('/');
      const fecha = new Date(+a, +m - 1, +d);
      return isNaN(fecha.getTime()) ? null : fecha;
    }
    return super.parse(value);
  }

  override format(date: Date): string {
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  }
}

const COLOR_DEFICIT = '#d6336c';
const COLOR_EXCESO = '#2a78d6';
const COLOR_ALMACENAJE = '#5c940d';

@Component({
  selector: 'app-water-balance-dialog',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [
    CopiarEnlaceComponent,
    ExportarGraficoComponent,
    GruposEstacionesPipe,
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
    { provide: DateAdapter, useClass: FechaArgAdapter },
    { provide: MAT_DATE_FORMATS, useValue: FORMATOS_FECHA }
  ],
  templateUrl: './water-balance-dialog.component.html',
  styleUrls: ['./water-balance-dialog.component.css']
})
export class WaterBalanceDialogComponent implements OnInit {
  readonly cmr = CMR;
  readonly almacenajeInicial = ALMACENAJE_INICIAL;

  form!: FormGroup;
  stations: WeatherStation[] = [];
  resultado: ResultadoBalance | null = null;
  /** Opciones con las que se calculó el resultado que se muestra */
  opcionesCalculadas: OpcionesBalance | null = null;
  estacionCalculada = '';
  isLoading = false;
  loadError = '';

  readonly data: Record<string, unknown>;
  readonly favoritas$ = inject(StationService).favoritas$;

  /** Enlace a la consulta actual (botón "Copiar enlace") */
  readonly enlaceConsulta = (): string => {
    const v = this.form.getRawValue();
    return armarEnlace('balance-hidrico', {
      estacion: v.station, desde: v.from, hasta: v.to,
      almacenaje: v.modoInicio === 'conocido' ? v.almacenaje : null
    });
  };

  // ---- Gráficos ----
  private indicesSinDatos: number[] = [];
  readonly pluginsGrafico = [pluginFranjasSinDatos(() => this.indicesSinDatos)];
  balanceData: ChartData<'bar' | 'line', (number | null)[], string> = { labels: [], datasets: [] };
  situacionData: ChartData<'bar', (number | null)[], string> = { labels: [], datasets: [] };
  balanceOptions: ChartConfiguration<'bar' | 'line'>['options'] = {};
  situacionOptions: ChartConfiguration<'bar'>['options'] = {};

  constructor(
    private fb: FormBuilder,
    private weatherService: WeatherService,
    private stationService: StationService,
    private dialogRef: MatDialogRef<WaterBalanceDialogComponent>,
    @Inject(MAT_DIALOG_DATA) dialogData: Record<string, unknown> | null
  ) {
    this.data = dialogData ?? {};
  }

  ngOnInit(): void {
    const hoy = new Date();
    const ayer = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1);
    // Por defecto, la campaña en curso: desde el 1 de julio
    const julio = new Date(ayer.getMonth() >= 6 ? ayer.getFullYear() : ayer.getFullYear() - 1, 6, 1);

    this.form = this.fb.group({
      station: [this.stationService.activa, Validators.required],
      from: [julio, Validators.required],
      to: [ayer, Validators.required],
      // 'estimado': 100 mm seis meses antes; 'conocido': el valor indicado al inicio del período
      modoInicio: ['estimado'],
      almacenaje: [ALMACENAJE_INICIAL, [Validators.required, Validators.min(0), Validators.max(CMR)]]
    }, { validators: this.validarRango });

    const consulta = consultaDe(this.data);
    const desde = leerFecha(consulta['desde']);
    const hasta = leerFecha(consulta['hasta']);
    if (desde) this.form.controls['from'].setValue(desde);
    if (hasta) this.form.controls['to'].setValue(hasta);
    const almacenaje = leerNumero(consulta['almacenaje']);
    if (almacenaje !== null && almacenaje >= 0 && almacenaje <= CMR) {
      this.form.patchValue({ modoInicio: 'conocido', almacenaje });
    }

    this.weatherService.getStationsAll().subscribe({
      next: stations => {
        this.stations = [...stations]
          .filter(st => st.Identificacion !== '20')
          .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
        this.calcular();
      },
      error: () => this.loadError = 'No se pudieron cargar las estaciones disponibles.'
    });

    this.form.controls['station'].valueChanges.subscribe(id => this.stationService.setActiva(id));
  }

  calcular(): void {
    this.form.markAllAsTouched();
    this.loadError = '';
    const { station, from, to, modoInicio, almacenaje } = this.form.getRawValue();
    const conocido = modoInicio === 'conocido';
    if (this.form.hasError('rangoInvalido') || this.form.controls['from'].invalid || this.form.controls['to'].invalid) {
      this.loadError = 'Revisá el rango de fechas para continuar.';
      return;
    }
    if (conocido && this.form.controls['almacenaje'].invalid) {
      this.loadError = `El almacenaje inicial tiene que estar entre 0 y ${CMR} mm.`;
      return;
    }
    const desde = this.aFecha(from), hasta = this.aFecha(to);
    const opciones: OpcionesBalance = conocido
      ? { almacenajeInicial: Number(almacenaje), estabilizar: false }
      : { almacenajeInicial: ALMACENAJE_INICIAL, estabilizar: true };
    const inicioCalculo = inicioDelCalculo(desde, opciones);

    this.isLoading = true;
    this.weatherService.getWeatherDataDiary<{ fecha: string }>(fechaIso(inicioCalculo), fechaIso(hasta), station).subscribe({
      next: resp => {
        const registros = porFecha(resp.data ?? []);
        const fechas = fechasDelPeriodo(inicioCalculo, hasta, f => registros.has(f));
        this.resultado = calcularBalance(registros, fechas, desde, opciones);
        this.opcionesCalculadas = opciones;
        this.estacionCalculada = this.stationLabel(station);
        this.armarGraficos(this.resultado.decadas);
        this.isLoading = false;
        if (!this.resultado.decadas.length) this.loadError = 'No hay décadas para mostrar en ese período.';
      },
      error: () => {
        this.isLoading = false;
        this.resultado = null;
        this.loadError = 'No se pudieron obtener los datos de la estación. Volvé a intentar.';
      }
    });
  }

  get decadas(): DecadaBalance[] {
    return this.resultado?.decadas ?? [];
  }

  get calculadas(): DecadaBalance[] {
    return this.decadas.filter(d => d.almacenaje !== null);
  }

  get totales() {
    const conDatos = this.decadas.filter(d => d.lluvia !== null && d.ep !== null);
    const suma = (k: 'lluvia' | 'ep') => conDatos.reduce((a, d) => a + (d[k] ?? 0), 0);
    const ultima = this.calculadas[this.calculadas.length - 1] ?? null;
    return {
      lluvia: suma('lluvia'),
      ep: suma('ep'),
      deficit: this.calculadas.reduce((a, d) => a + Math.min(d.situacion ?? 0, 0), 0),
      exceso: this.calculadas.reduce((a, d) => a + Math.max(d.situacion ?? 0, 0), 0),
      ultima
    };
  }

  get haySinDatos(): boolean {
    return this.decadas.some(d => d.estado === 'sin-datos');
  }

  get hayIncompletas(): boolean {
    return this.decadas.some(d => d.estado === 'incompleta');
  }

  close(): void {
    this.dialogRef.close();
  }

  stationLabel(id: string): string {
    const st = this.stations.find(s => s.Identificacion === id);
    return st ? `${st.Identificacion} - ${st.nombre}` : id;
  }

  /** dd/mm/aaaa */
  fechaCorta(iso: string): string {
    return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  }

  tituloDecada(d: DecadaBalance): string {
    const base = `${this.fechaCorta(d.desde)} al ${this.fechaCorta(d.hasta)}`;
    if (d.estado === 'incompleta') return `${base}: ${Math.min(d.diasLluvia, d.diasEp)} de ${d.dias} días con datos`;
    if (d.estado === 'sin-datos') return `${base}: sin datos de la estación`;
    return base;
  }

  private armarGraficos(decadas: DecadaBalance[]): void {
    const etiquetas = decadas.map(d => d.etiqueta);
    this.indicesSinDatos = decadas.map((d, i) => d.estado === 'sin-datos' ? i : -1).filter(i => i >= 0);
    const alfa = (d: DecadaBalance, color: string) => conAlfa(color, d.estado === 'incompleta' ? .35 : .8);
    const redondeo = (v: number | null) => v === null ? null : Math.round(v * 10) / 10;

    this.balanceData = {
      labels: etiquetas,
      datasets: [
        {
          type: 'line', label: 'Almacenaje (mm)', data: decadas.map(d => redondeo(d.almacenaje)),
          borderColor: COLOR_ALMACENAJE, backgroundColor: conAlfa(COLOR_ALMACENAJE, .12), fill: true,
          tension: .3, pointRadius: 2, borderWidth: 2.5, spanGaps: false, order: 0
        },
        {
          type: 'bar', label: 'Lluvia (mm)', data: decadas.map(d => redondeo(d.lluvia)),
          backgroundColor: decadas.map(d => alfa(d, VAR_COLOR.lluvia)), borderRadius: 3, order: 1
        },
        {
          type: 'bar', label: 'EP (mm)', data: decadas.map(d => redondeo(d.ep)),
          backgroundColor: decadas.map(d => alfa(d, VAR_COLOR.et)), borderRadius: 3, order: 1
        }
      ]
    };
    this.balanceOptions = this.opciones('mm', CMR);

    this.situacionData = {
      labels: etiquetas,
      datasets: [{
        label: 'Situación hídrica (mm)',
        data: decadas.map(d => redondeo(d.situacion)),
        backgroundColor: decadas.map(d => conAlfa((d.situacion ?? 0) < 0 ? COLOR_DEFICIT : COLOR_EXCESO, d.estado === 'incompleta' ? .35 : .8)),
        borderRadius: 3
      }]
    };
    this.situacionOptions = this.opciones('mm') as ChartConfiguration<'bar'>['options'];
    (this.situacionOptions!.plugins!.legend as { display: boolean }).display = false;
  }

  private opciones(titulo: string, max?: number): ChartConfiguration<'bar' | 'line'>['options'] {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'top', labels: { usePointStyle: true, boxWidth: 8 } },
        tooltip: {
          callbacks: {
            title: items => {
              const d = this.decadas[items[0]?.dataIndex ?? -1];
              return d ? `${d.etiqueta} (${this.tituloDecada(d)})` : '';
            },
            label: ctx => ctx.parsed.y === null ? `${ctx.dataset.label}: sin datos`
              : `${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString('es-AR', { maximumFractionDigits: 1 })}`
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 60, autoSkip: true, autoSkipPadding: 6 } },
        y: { title: { display: true, text: titulo }, grid: { color: GRID_COLOR }, suggestedMax: max }
      }
    };
  }

  private validarRango(group: AbstractControl): ValidationErrors | null {
    const desde = group.get('from')?.value, hasta = group.get('to')?.value;
    return desde && hasta && desde >= hasta ? { rangoInvalido: true } : null;
  }

  private aFecha(v: Date | string): Date {
    if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
    return leerFecha(String(v)) ?? new Date(v);
  }
}
