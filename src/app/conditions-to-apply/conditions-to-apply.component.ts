import { Component, OnInit, AfterViewInit, OnDestroy, Injectable, TemplateRef, ViewChild, inject } from '@angular/core';
import { CommonModule, registerLocaleData } from '@angular/common';
import { Feature, FeatureCollection, Point } from 'geojson';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import * as L from 'leaflet';
import { OPCIONES_GESTOS } from '../maps/gestos';
import { seguirTamanioMapa } from '../maps/map-size';
import { encuadrarTucuman } from '../maps/encuadre';
import { agregarMapaBase, cargarProvincias } from '../maps/mapa-base';
import { HttpClient } from '@angular/common/http';

import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DateAdapter, MAT_DATE_FORMATS, MAT_DATE_LOCALE, NativeDateAdapter } from '@angular/material/core';

import localeEs from '@angular/common/locales/es';
import { ValorPipe } from '../pipes/valor.pipe';
registerLocaleData(localeEs);

// ✅ Ajustá estos imports a tu estructura real
import { StationsApiResponse, WeatherService, WeatherStation } from '../services/weather.service';
import { ESTACION_INICIAL, StationService } from '../services/station.service';
import { GruposEstacionesPipe } from '../pipes/grupos-estaciones.pipe';
import { KpLatest, KpService } from '../services/kp.service';
import { KpHistoricoService, SerieKp, kpEnInstante } from '../services/kp-historico.service';
import {
  SprayAdvisorService,
  MetodoAplicacion,
  Prioridad,
  Cultivo,
  EvaluacionAplicacion,
  RegistroMeteo,
  ResultadoEvaluacion,
  Semaforo,
  BIBLIOGRAFIA_APLICACION,
  describirUmbrales
} from '../services/spray-advisor.service';
import { CopiarEnlaceComponent } from '../shared/copiar-enlace.component';
import { ComoSeLeeComponent } from '../shared/como-se-lee.component';
import { EncabezadoDialogoComponent } from '../shared/encabezado-dialogo.component';
import { armarEnlace, consultaDe, fechaIso, leerFecha, leerNumero } from '../shared/enlace-consulta';
import { AvisoBajasComponent, ConsultaBajas } from '../shared/aviso-bajas.component';

// ===== Formato fechas dd/MM/yyyy =====
export const MY_DATE_FORMATS = {
  parse: { dateInput: 'dd/MM/yyyy' },
  display: {
    dateInput: 'dd/MM/yyyy',
    monthYearLabel: 'MMM yyyy',
    dateA11yLabel: 'dd/MM/yyyy',
    monthYearA11yLabel: 'MMMM yyyy'
  },
};

@Injectable()
export class DmyDateAdapter extends NativeDateAdapter {
  override parse(value: unknown): Date | null {
    if (typeof value === 'string' && value.includes('/')) {
      const [dd, mm, yyyy] = value.split('/').map(v => Number(v));
      if ([dd, mm, yyyy].every(n => !isNaN(n))) {
        const date = new Date(yyyy, mm - 1, dd);
        if (date.getFullYear() === yyyy && date.getMonth() + 1 === mm && date.getDate() === dd) return date;
      }
    }
    return super.parse(value);
  }
}

interface Estacion {
  identificacion: string;
  nombre: string;
  lat: number | null;
  lon: number | null;
  temp_af: number | null;
  hum_af: number | null;
  viento_medio: number | null;
  viento_max: number | null;
  /** Lluvia del último registro (rr_15) */
  lluvia: number | null;
  fecha_I: string;
}

type ClaseFila = 'apto-row' | 'precaucion-row' | 'no-apto-row' | 'sin-evaluar-row';

interface WeatherData {
  hora: string;
  temp_af: number | null;
  hum_af: number | null;
  viento_medio: number | null;
  viento_max: number | null;
  direccion: string | null;
  lluvia: number | null;

  /** null = «Sin evaluar» (falta un dato) */
  eval?: EvaluacionAplicacion | null;
  faltantes?: string[];
  /** Kp usado para el registro (null = no se consideró) */
  kp?: number | null;
  rowClass?: ClaseFila;
}

interface HourlyWeatherRow {
  hora: string;
  temp_af?: number | string | null;
  hum_af?: number | string | null;
  viento_medio?: number | string | null;
  viento_max?: number | string | null;
  direccion?: string | null;
  lluvia?: number | string | null;
}

/** Punto del mapa sin evaluar (falta un dato): gris neutro, como la fila de la tabla */
const COLOR_SIN_EVALUAR = '#9e9e9e';

const TIPOS_PRODUCTO =['HERBICIDA', 'FUNGICIDA', 'INSECTICIDA'] as const;
const TAMANIOS_GOTA = ['MUY_FINA', 'FINA', 'MEDIA', 'GRUESA', 'MUY_GRUESA'] as const;
type TipoProducto = typeof TIPOS_PRODUCTO[number];
type TamGota = typeof TAMANIOS_GOTA[number];
type InfoKey =
  | 'ESTACION' | 'FECHA' | 'METODO' | 'PRIORIDAD' | 'CULTIVO' | 'PRODUCTO' | 'GOTA'
  | 'KP' | 'GNSS'
  | 'SEMAFORO' | 'DELTA_T' | 'INVERSION' | 'DERIVA' | 'EFICACIA' | 'DIRECCION' | 'LLUVIA'
  | 'FORECAST_HELP' | 'SCORES' | 'CONSEJOS';

@Component({
  selector: 'app-conditions-to-apply',
  standalone: true,
  imports: [
    EncabezadoDialogoComponent, GruposEstacionesPipe, AvisoBajasComponent,
    CommonModule,
    ValorPipe,
    FormsModule,
    MatDialogModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatSelectModule,
    MatTooltipModule,
    CopiarEnlaceComponent,
    ComoSeLeeComponent,
  ],
  providers: [
    { provide: DateAdapter, useClass: DmyDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: MY_DATE_FORMATS },
    { provide: MAT_DATE_LOCALE, useValue: 'es-AR' },
  ],
  templateUrl: './conditions-to-apply.component.html',
  styleUrls: ['./conditions-to-apply.component.css']
})
export class ConditionsToApplyComponent implements OnInit, AfterViewInit, OnDestroy {
  /** Deja de observar el tamaño del contenedor del mapa (ver seguirTamanioMapa). */
  private dejarDeSeguirTamanio?: () => void;

  // ===== UI state =====
  loadingEstaciones = true;
  errorEstaciones = false;

  private infoRef?: MatDialogRef<unknown>;
  
  loadingData = false;
  estacionRealDeDatos = '';
  fechaRealDeDatos: Date | null = null;

  estaciones: Estacion[] = [];
  estacionesRecientes: Estacion[] = [];

  selectedStation: string = '';
  selectedDate: Date = new Date();

  weatherData: WeatherData[] = [];
  private weatherDataRaw: HourlyWeatherRow[] = [];
  /** Fecha (yyyy-MM-dd) de weatherDataRaw */
  private ymdDatos = '';
  /** Estación y día consultados, para el aviso de sensores dados de baja */
  consultaBajas: ConsultaBajas | null = null;
  selectedRow: WeatherData | null = null;

  // ===== parámetros (como app) =====
  metodo: MetodoAplicacion = 'MOSQUITO';
  prioridad: Prioridad = 'EQUILIBRADO';
  cultivo: Cultivo = 'CAÑA';

  tipoProducto: TipoProducto = 'HERBICIDA';
  tamGota: TamGota = 'MEDIA';

  metodos: MetodoAplicacion[] = ['MOSQUITO', 'MANUAL', 'DRON', 'AVION', 'AIRBLAST'];
  prioridades: Prioridad[] = ['SEGURIDAD', 'EQUILIBRADO', 'EFICACIA'];
  cultivos: Cultivo[] = ['CAÑA', 'CITRUS', 'GRANOS'];

  /** Nombre visible de cada opción (los valores internos van en mayúsculas) */
  private readonly etiquetas: Record<string, string> = {
    MOSQUITO: 'Mosquito', MANUAL: 'Manual', DRON: 'Dron', AVION: 'Avión', AIRBLAST: 'Airblast',
    SEGURIDAD: 'Seguridad', EQUILIBRADO: 'Equilibrado', EFICACIA: 'Eficacia',
    'CAÑA': 'Caña', CITRUS: 'Citrus', GRANOS: 'Granos',
    HERBICIDA: 'Herbicida', FUNGICIDA: 'Fungicida', INSECTICIDA: 'Insecticida',
    MUY_FINA: 'Muy fina', FINA: 'Fina', MEDIA: 'Media', GRUESA: 'Gruesa', MUY_GRUESA: 'Muy gruesa'
  };

  etiqueta(valor: string): string {
    return this.etiquetas[valor] ?? valor;
  }

  // ===== KP =====
  /** Último Kp publicado por NOAA; null si no se pudo leer (entonces no se considera) */
  kpIndex: number | null = null;
  kpTimeTag: string | null = null;
  kpLoading = false;
  /** Kp por intervalos de 3 h del día consultado (ver KpHistoricoService) */
  private serieKp: SerieKp | null = null;
  /** Aclaración en pantalla sobre el Kp usado en la tabla */
  kpNota = '';
  /** Aviso para el usuario cuando el Kp no corresponde al momento de cada registro */
  kpAviso = false;

  sats = 12; // opcional para DRON/AVION (si tu advisor lo usa)


  infoText: Record<string, string> = {
    estacion: 'Seleccioná la estación meteorológica a evaluar.',
    fecha: 'Fecha para la cual se evaluarán las condiciones.',
    metodo: 'Método de aplicación. Afecta umbrales de deriva/eficacia.',
    prioridad: 'SEGURIDAD (más restrictivo), EFICACIA (más permisivo), EQUILIBRADO (intermedio).',
    cultivo: 'El cultivo puede modificar recomendaciones y umbrales.',
    producto: 'Tipo de producto: ajusta reglas de deriva/eficacia.',
    gota: 'Tamaño de gota: más gruesa reduce deriva, puede afectar cobertura.',
    kp: 'Kp: actividad geomagnética. Puede afectar GNSS/compás (dron/avión).',
    gnss: 'Satélites GNSS: relevante en dron/avión para precisión de guiado.',
  };

  infoCols: Record<string, string> = {
    semaforo: 'Resumen global (deriva + eficacia + restricciones).',
    delta_t: 'ΔT (Delta T): potencial de evaporación de la gota.',
    inversion: 'Inversión térmica: atmósfera estable → aumenta deriva a larga distancia.',
    deriva: 'Riesgo de deriva, de 0 a 100 (más alto, peor).',
    eficacia: 'Riesgo de baja eficacia, de 0 a 100 (más alto, peor).',
    viento: 'Viento y ráfagas: principal factor de deriva.',
    direccion: 'Dirección del viento: si sopla hacia zonas sensibles, no aplicar.',
    lluvia: 'Lluvia: riesgo de lavado y pérdida de eficacia.',
  };


  // ===== Leaflet =====
  private map?: L.Map;
  private stationsLayer?: L.GeoJSON;

  // ===== Info (como en la app) =====
  @ViewChild('infoDialogTpl', { static: true }) infoDialogTpl!: TemplateRef<unknown>;
  infoTitle = '';
  infoBody: string[] = [];

  /** Favoritas del usuario, para mostrarlas primero en el selector */
  readonly favoritas$ = inject(StationService).favoritas$;

  /** Consulta recibida por enlace (ver shared/enlace-consulta.ts) */
  private readonly consulta = consultaDe(inject(MAT_DIALOG_DATA, { optional: true }));

  /**
   * Enlace a la consulta actual (botón "Copiar enlace"). La fecha va sólo si no es hoy: así una
   * consulta guardada sigue mostrando el día en que se abre. Los satélites sólo cuentan con dron o avión.
   */
  readonly enlaceConsulta = (): string => {
    const hoy = fechaIso(new Date());
    const fecha = this.selectedDate ? fechaIso(new Date(this.selectedDate)) : hoy;
    return armarEnlace('aplicar', {
      estacion: this.selectedStation,
      fecha: fecha === hoy ? null : fecha,
      metodo: this.metodo.toLowerCase(),
      prioridad: this.prioridad.toLowerCase(),
      cultivo: this.cultivo.toLowerCase(),
      producto: this.tipoProducto.toLowerCase(),
      gota: this.tamGota.toLowerCase(),
      satelites: this.metodo === 'DRON' || this.metodo === 'AVION' ? this.sats : null
    });
  };

  constructor(
    private weatherService: WeatherService,
    private stationService: StationService,
    private kp: KpService,
    private dialog: MatDialog,
    private dialogRef: MatDialogRef<ConditionsToApplyComponent>,
    private advisor: SprayAdvisorService,
    private kpHistorico: KpHistoricoService,
    private http: HttpClient
  ) { }

  ngOnInit(): void {
    this.selectedDate = new Date();
    this.aplicarConsulta();
    this.loadKp();
    this.loadStations();
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.initMap(), 0);
  }

  /**
   * Parámetros del enlace (la estación ya llega como activa). Sólo se aplican valores que existen
   * en los selectores: un enlace editado a mano no rompe la evaluación.
   */
  private aplicarConsulta(): void {
    const c = this.consulta;
    const elegir = <T extends string>(valor: string | undefined, opciones: readonly T[]): T | undefined =>
      opciones.find(o => o === valor?.toUpperCase());
    const fecha = leerFecha(c['fecha']);
    if (fecha && fecha <= new Date()) this.selectedDate = fecha;
    this.metodo = elegir(c['metodo'], this.metodos) ?? this.metodo;
    this.prioridad = elegir(c['prioridad'], this.prioridades) ?? this.prioridad;
    this.cultivo = elegir(c['cultivo'], this.cultivos) ?? this.cultivo;
    this.tipoProducto = elegir(c['producto'], TIPOS_PRODUCTO) ?? this.tipoProducto;
    this.tamGota = elegir(c['gota'], TAMANIOS_GOTA) ?? this.tamGota;
    const sats = leerNumero(c['satelites']);
    if (sats !== null && sats >= 0) this.sats = Math.round(sats);
  }

  closeWindow(): void {
    this.dialogRef.close();
  }

  closeInfo(): void {
  this.infoRef?.close();
  this.infoRef = undefined;
}

  // ====== Info / Ayuda (textos calcados a Ionic) ======

  openInfo(key: InfoKey, ev?: Event): void {
    ev?.preventDefault();
  ev?.stopPropagation();

  const item = this.infoContent[key];
  if (!item) return;

  this.infoTitle = item.title;
  // El semáforo agrega los umbrales del método elegido y la bibliografía
  this.infoBody = key === 'SEMAFORO'
    ? [...item.body, `Umbrales con ${this.etiqueta(this.metodo)}:`, ...describirUmbrales(this.metodo),
      'Bibliografía:', ...BIBLIOGRAFIA_APLICACION]
    : item.body;

  this.infoRef = this.dialog.open(this.infoDialogTpl, {
    panelClass: 'instr-dialog',
    autoFocus: false,
    restoreFocus: false,
    width: 'min(720px, 94vw)'
  });
}

  private buildConsejosExplainBody(ev: EvaluacionAplicacion | null): string[] {
    if (!ev) {
      return ['Todavía no hay evaluación disponible.', 'Seleccioná una fila de la tabla y volvé a intentar.'];
    }

    const lines: string[] = [];
    lines.push(`Método: ${this.metodo} · Cultivo: ${this.cultivo} · Prioridad: ${this.prioridad}`);
    lines.push(`Producto: ${this.tipoProducto} · Gota: ${this.tamGota}`);
    lines.push(`Semáforo: ${ev.semaforo}`);

    lines.push('—');
    lines.push(`Deriva (score): ${ev.scoreDeriva}`);
    lines.push(`Eficacia (score): ${ev.scoreEficacia}`);

    lines.push('—');
    lines.push(`ΔT: ${ev.deltaT.toFixed(1)} °C`);
    lines.push(`Inversión probable: ${ev.inversionProbable ? 'Sí' : 'No'}`);

    lines.push('—');
    lines.push('Factores que empujaron la decisión:');
    if (ev.razones.length) for (const r of ev.razones) lines.push(`• ${r}`);
    else lines.push('• (No se registraron razones)');

    lines.push('—');
    lines.push('Qué podés hacer:');
    if (ev.recomendaciones.length) for (const r of ev.recomendaciones) lines.push(`• ${r}`);
    else lines.push('• (No se registraron recomendaciones)');

    lines.push('—');
    lines.push(`Extras: Kp=${this.kpIndex != null ? this.kpIndex.toFixed(1) : 'no disponible'}${this.usarGnssEnDecision() ? ` · Satélites=${this.sats}` : ''}`);

    return lines;
  }

  // ===== Param changes =====
  onParamsChanged(): void {
    this.refreshMarkers();
    if (this.weatherDataRaw.length) this.recalcTableFromRaw();
  }

  private usarGnssEnDecision(): boolean {
    return this.metodo === 'DRON' || this.metodo === 'AVION';
  }

  // ===== KP =====
  /** Último Kp publicado (el de la pastilla y el del mapa, que evalúa el último dato). */
  loadKp(): void {
    this.kpLoading = true;
    this.kp.getLatestKp().subscribe({
      next: (r: KpLatest) => {
        this.kpIndex = Number(r.kp.toFixed(2));
        this.kpTimeTag = r.timeTag;
        this.kpLoading = false;
        this.refreshMarkers();
        if (this.weatherDataRaw.length) this.recalcTableFromRaw();
      },
      error: err => {
        console.warn('[KP] Error leyendo SWPC', err);
        this.kpLoading = false;
        this.refreshMarkers();
        if (this.weatherDataRaw.length) this.recalcTableFromRaw();
      }
    });
  }

  /**
   * Kp por intervalos de 3 h del día consultado, para usar en cada registro el Kp de su momento.
   * Si falla, la tabla usa el último Kp publicado y lo aclara (ver actualizarNotaKp).
   */
  private cargarKpDelDia(ymd: string): void {
    const [y, m, d] = ymd.split('-').map(Number);
    // Día local completo (UTC−3): de las 3 h UTC del día a las 3 h UTC del siguiente
    const desde = new Date(Date.UTC(y, m - 1, d, 3));
    const hasta = new Date(Date.UTC(y, m - 1, d + 1, 3));
    this.serieKp = null;
    this.kpHistorico.serie(desde, hasta).subscribe({
      next: serie => {
        if (this.formatDate(this.selectedDate) !== ymd) return; // cambió la fecha mientras tanto
        this.serieKp = serie;
        if (this.weatherDataRaw.length) this.recalcTableFromRaw();
      },
      error: err => {
        console.warn('[KP] Error leyendo el Kp por intervalos', err);
        if (this.weatherDataRaw.length) this.recalcTableFromRaw();
      }
    });
  }

  /** Kp para un registro: el de su intervalo de 3 h; si no está, el último publicado. */
  private kpParaInstante(instanteMs: number | null): { kp: number | null; delIntervalo: boolean } {
    const kp = instanteMs != null ? kpEnInstante(this.serieKp, instanteMs) : null;
    if (kp != null) return { kp, delIntervalo: true };
    return { kp: this.kpIndex, delIntervalo: false };
  }

  private actualizarNotaKp(delIntervalo: number, ultimo: number, sinKp: number, esHoy: boolean): void {
    const fuente = this.serieKp?.fuente ?? 'NOAA SWPC';
    const ultimoTxt = this.kpTimeTag ? ` (${this.kpTimeTag} UTC)` : '';
    this.kpAviso = false;
    if (sinKp) {
      this.kpNota = 'Kp no disponible: no se consideró en el semáforo.';
      this.kpAviso = true;
    } else if (!ultimo) {
      this.kpNota = `Kp del intervalo de 3 h de cada registro (fuente: ${fuente}).`;
    } else if (esHoy && delIntervalo) {
      this.kpNota = `Kp del intervalo de 3 h de cada registro (fuente: ${fuente}); en las horas que todavía no tienen Kp publicado se usó el último${ultimoTxt}.`;
    } else {
      this.kpNota = esHoy
        ? `Kp: se usó el último publicado por NOAA${ultimoTxt}.`
        : `No hay Kp histórico disponible para esta fecha: se usó el último publicado por NOAA${ultimoTxt}, que no corresponde al día consultado.`;
      this.kpAviso = !esHoy;
    }
  }

  // ===== Estaciones =====
  private loadStations(): void {
    this.loadingEstaciones = true;
    this.errorEstaciones = false;

    this.weatherService.getStationsAll().subscribe({
      next: (data: WeatherStation[]) => {
        this.estaciones = data.map(item => {
          const identificacion = String(item.Identificacion);
          return {
            identificacion,
            nombre: item.nombre,
            lat: this.numOrNull(item.lat),
            lon: this.numOrNull(item.lon),
            temp_af: this.numOrNull(item.temp_af),
            hum_af: this.numOrNull(item.hum_af),
            viento_medio: this.numOrNull(item.viento_medio),
            viento_max: this.numOrNull(item.viento_max),
            lluvia: this.numOrNull((item as WeatherStation & { rr_15?: string }).rr_15),
            fecha_I: item.fecha_I || ''
          };
        });

        const twoHoursAgo = Date.now() - 2 * 3600 * 1000;
        this.estacionesRecientes = this.estaciones.filter(est => (this.instanteDeFechaI(est.fecha_I) ?? 0) >= twoHoursAgo);

        // La activa si tiene dato reciente; si no, El Colmenar
        const activa = this.stationService.activa;
        const defaultEst =
          this.estacionesRecientes.find(est => est.identificacion === activa) ||
          this.estacionesRecientes.find(est => est.identificacion === ESTACION_INICIAL) ||
          this.estaciones.find(est => est.identificacion === ESTACION_INICIAL) ||
          this.estacionesRecientes[0] ||
          this.estaciones[0];

        this.selectedStation = defaultEst?.identificacion || '';

        this.loadingEstaciones = false;

        if (this.map) this.addMarkers(this.estacionesRecientes);
        if (this.selectedStation) this.searchData();
      },
      error: err => {
        console.error('Error cargando estaciones:', err);
        this.errorEstaciones = true;
        this.loadingEstaciones = false;
      }
    });
  }

  // ===== Datos horarios =====
  /** Cambio desde el selector: la estación pasa a ser la activa del sitio y se consulta. */
  onStationChange(): void {
    this.stationService.setActiva(this.selectedStation);
    this.searchData();
  }

  searchData(): void {
    if (!this.selectedStation) return;

    this.loadingData = true;
    this.selectedRow = null;

    const ymd = this.formatDate(this.selectedDate);
    this.cargarKpDelDia(ymd);

    this.weatherService.getWeatherDataHourly<HourlyWeatherRow>(ymd, this.selectedStation).subscribe({
      next: (resp) => {
        this.weatherDataRaw = resp.data || [];
        this.ymdDatos = ymd;
        this.consultaBajas = { estacion: this.selectedStation, desde: ymd, hasta: ymd };
        this.recalcTableFromRaw();

        const estacion = this.estaciones.find(e => e.identificacion === this.selectedStation);
        this.estacionRealDeDatos = estacion?.nombre || '';

        if (this.weatherData.length > 0) {
          const [yyyy, mm, dd] = ymd.split('-').map(Number);
          this.fechaRealDeDatos = new Date(yyyy, mm - 1, dd);
        } else {
          this.fechaRealDeDatos = null;
        }

        this.loadingData = false;
      },
      error: err => {
        console.error('Error al obtener datos horarios:', err);
        this.weatherDataRaw = [];
        this.weatherData = [];
        this.estacionRealDeDatos = '';
        this.fechaRealDeDatos = null;
        this.loadingData = false;
      }
    });
  }

  private recalcTableFromRaw(): void {
    const ymd = this.ymdDatos || this.formatDate(this.selectedDate);
    const est = this.estaciones.find(e => e.identificacion === this.selectedStation);
    let delIntervalo = 0, ultimo = 0, sinKp = 0;

    this.weatherData = this.weatherDataRaw.map((item) => {
      const instante = this.instanteDeHora(ymd, item.hora);
      const kp = this.kpParaInstante(instante);
      if (kp.kp == null) sinKp++;
      else if (kp.delIntervalo) delIntervalo++;
      else ultimo++;

      const r = this.evaluarRegistro({
        instante: instante != null ? new Date(instante) : null,
        lat: est?.lat ?? null,
        lon: est?.lon ?? null,
        temperatura: this.numOrNull(item.temp_af),
        humedad: this.numOrNull(item.hum_af),
        vientoMedio: this.numOrNull(item.viento_medio),
        rafaga: this.numOrNull(item.viento_max),
        lluvia: this.numOrNull(item.lluvia)
      }, kp.kp);

      return {
        ...item,
        eval: r.evaluacion,
        faltantes: r.faltantes,
        kp: kp.kp,
        rowClass: this.rowClass(r.evaluacion?.semaforo ?? null)
      } as WeatherData;
    });

    this.actualizarNotaKp(delIntervalo, ultimo, sinKp, ymd === this.formatDate(new Date()));
    // La fila seleccionada se reemplaza por su versión recalculada
    if (this.selectedRow) this.selectedRow = this.weatherData.find(w => w.hora === this.selectedRow?.hora) ?? null;
  }

  selectRow(row: WeatherData): void {
    this.selectedRow = row;
  }

  // ===== Evaluación (motor) =====
  /**
   * Única evaluación de la vista: la usan la tabla y el mapa. Reglas en
   * SprayAdvisorService.evaluarRegistro (ráfaga como referencia, «Sin evaluar» si falta un dato,
   * horario de inversión según salida y puesta del sol); acá se suman las razones por producto y gota.
   */
  private evaluarRegistro(reg: RegistroMeteo, kp: number | null): ResultadoEvaluacion {
    const r = this.advisor.evaluarRegistro(reg, {
      metodo: this.metodo,
      cultivo: this.cultivo,
      prioridad: this.prioridad,
      kpIndex: kp,
      sats: this.usarGnssEnDecision() ? this.sats : undefined,
      gotaGruesa: this.tamGota === 'GRUESA' || this.tamGota === 'MUY_GRUESA'
    });
    if (!r.evaluacion) return r;
    return {
      ...r,
      evaluacion: this.applyProductoExtras(r.evaluacion, {
        tC: reg.temperatura,
        rh: reg.humedad,
        windMs: reg.rafaga != null ? reg.rafaga / 3.6 : null
      })
    };
  }

  /** Instante (ms UTC) de un registro horario: fecha del día y hora local "HH:mm" o "HH:mm:ss" (UTC−3). */
  private instanteDeHora(ymd: string, hora: string | null | undefined): number | null {
    const h = /^(\d{1,2}):(\d{2})/.exec(String(hora ?? ''));
    const [y, m, d] = ymd.split('-').map(Number);
    if (!h || !y || !m || !d) return null;
    return Date.UTC(y, m - 1, d, Number(h[1]) + 3, Number(h[2]));
  }

  /** fecha_I de la API ("2026-11-05 13:15:00", hora local UTC−3) → ms UTC. */
  private instanteDeFechaI(fechaI: string): number | null {
    const f = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(fechaI ?? '').trim());
    if (!f) return null;
    return Date.UTC(+f[1], +f[2] - 1, +f[3], +f[4] + 3, +f[5]);
  }

  private rowClass(semaforo: Semaforo | null): ClaseFila {
    if (semaforo === null) return 'sin-evaluar-row';
    if (semaforo === 'VERDE') return 'apto-row';
    if (semaforo === 'AMARILLO') return 'precaucion-row';
    return 'no-apto-row';
  }

  /** Texto de la fila o el punto sin evaluar: "Sin evaluar: falta humedad, ráfaga". */
  textoSinEvaluar(faltantes: string[] | undefined): string {
    return faltantes?.length ? `Sin evaluar: falta o es inválido el dato de ${faltantes.join(', ')}` : 'Sin evaluar';
  }

  // ===== applyProductoExtras (igual al móvil) =====
  private applyProductoExtras(
    ev: EvaluacionAplicacion,
    ctx: { tC: number | null; rh: number | null; windMs: number | null }
  ): EvaluacionAplicacion {
    if (!ev) return ev;

    const razones = [...ev.razones];
    const recomendaciones = [...ev.recomendaciones];

    const tipo = this.tipoProducto;
    const gota = this.tamGota;

    const windMs = ctx?.windMs ?? null;
    const windKmh = windMs != null ? windMs * 3.6 : null;
    const temp = ctx?.tC ?? null;
    const rh = ctx?.rh ?? null;

    const drift =
      gota === 'MUY_FINA' ? 4 :
        gota === 'FINA' ? 3 :
          gota === 'MEDIA' ? 2 :
            gota === 'GRUESA' ? 1 : 0;

    if (tipo === 'HERBICIDA') {
      if (gota === 'MUY_FINA' || gota === 'FINA' || gota === 'MEDIA') {
        razones.push('Herbicida: mayor riesgo de deriva con gota fina/media.');
        recomendaciones.push('Para herbicidas se recomienda gota GRUESA o MUY GRUESA (boquillas antideriva) y viento bajo.');
      }
      if (windKmh != null && windKmh >= 8 && drift >= 2) {
        razones.push('Viento moderado con gota fina/media incrementa la deriva (herbicida).');
        recomendaciones.push('Reducí deriva: gota más gruesa, bajar altura, disminuir velocidad o reprogramar.');
      }
    }

    if (tipo === 'INSECTICIDA' || tipo === 'FUNGICIDA') {
      if (gota === 'MUY_GRUESA') {
        razones.push('Gota muy gruesa puede reducir cobertura en blanco biológico.');
        recomendaciones.push('Con viento bajo, considerá GRUESA o MEDIA según etiqueta para mejorar cobertura.');
      }
      if ((gota === 'MUY_FINA' || gota === 'FINA') && windKmh != null && windKmh >= 8) {
        razones.push('Gota fina con viento moderado aumenta deriva.');
        recomendaciones.push('Con viento moderado evitá gota fina; preferí MEDIA/GRUESA.');
      }
    }

    if ((temp != null && temp >= 30) && (rh != null && rh <= 55) && drift >= 3) {
      razones.push('Condiciones secas/calor con gota fina: aumenta evaporación y deriva.');
      recomendaciones.push('Si no podés reprogramar: subí tamaño de gota y evitá horas de máximo calor.');
    }

    return { ...ev, razones, recomendaciones };
  }

  // ===== MAPA =====
  ngOnDestroy(): void {
    this.dejarDeSeguirTamanio?.();
    this.map?.remove();
  }

  private initMap(): void {
    const el = document.getElementById('mapConditions');
    if (!el) return;

    if (this.map) {
      this.dejarDeSeguirTamanio?.();
      this.map.remove();
    }
    this.map = L.map('mapConditions', { center: [-26.8, -65.2], zoom: 8, preferCanvas: true, ...OPCIONES_GESTOS });
    this.dejarDeSeguirTamanio = seguirTamanioMapa(this.map);
    encuadrarTucuman(this.map);

    const control = agregarMapaBase(this.map);
    void cargarProvincias(this.map, this.http, { control });
  }

  private refreshMarkers(): void {
    if (this.map) this.addMarkers(this.estacionesRecientes);
  }

  private addMarkers(stations: Estacion[]): void {
    if (!this.map) return;
    if (this.stationsLayer) this.map.removeLayer(this.stationsLayer);

    const featureCollection: FeatureCollection<Point, Estacion> = {
      type: 'FeatureCollection',
      features: stations.filter(est => est.lat != null && est.lon != null).map((est): Feature<Point, Estacion> => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [est.lon as number, est.lat as number] },
        properties: est
      }))
    };

    this.stationsLayer = L.geoJSON(
      featureCollection,
      {
        pointToLayer: (f, latlng) => {
          const p = f.properties as Estacion;
          const instante = this.instanteDeFechaI(p.fecha_I);

          // Misma evaluación que la tabla, con el último registro de la estación
          const { evaluacion: ev, faltantes } = this.evaluarRegistro({
            instante: instante != null ? new Date(instante) : null,
            lat: p.lat,
            lon: p.lon,
            temperatura: p.temp_af,
            humedad: p.hum_af,
            vientoMedio: p.viento_medio,
            rafaga: p.viento_max,
            lluvia: p.lluvia
          }, this.kpIndex);

          const kpTxt = this.kpIndex != null ? this.kpIndex.toFixed(1) : 'no disponible';
          const detalle = ev
            ? `Semáforo: <b>${ev.semaforo}</b><br>
             ΔT: ${ev.deltaT.toFixed(1)} °C ${ev.inversionProbable ? '(Inv.)' : ''}<br>
             Deriva: ${ev.scoreDeriva} | Efic.: ${ev.scoreEficacia}<br>`
            : `<b>${this.textoSinEvaluar(faltantes)}</b><br>`;

          return L.circleMarker(latlng, {
            radius: 7,
            fillColor: ev ? this.semaforoColor(ev.semaforo) : COLOR_SIN_EVALUAR,
            color: '#000',
            weight: 1,
            fillOpacity: 0.85
          }).bindTooltip(
            `<b>${p.nombre}</b><br>
             ${detalle}
             Kp: ${kpTxt}${this.usarGnssEnDecision() ? ` | Sats: ${this.sats}` : ''}`,
            { sticky: true }
          );
        }
      }
    ).addTo(this.map);

    setTimeout(() => this.map?.invalidateSize(), 50);
  }

  private semaforoColor(s: Semaforo): string {
    if (s === 'VERDE') return '#009e73';
    if (s === 'AMARILLO') return '#f0e442';
    return '#b84a00';
  }

  // ===== helpers =====
  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = ('0' + (date.getMonth() + 1)).slice(-2);
    const d = ('0' + date.getDate()).slice(-2);
    return `${y}-${m}-${d}`;
  }

  /** Número o null: vacío, null y textos no numéricos son dato faltante (Number(null) daría 0). */
  private numOrNull(v: unknown): number | null {
    if (v == null || (typeof v === 'string' && v.trim() === '')) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }


  getInfo(key: string): string {
    return this.infoText[key] || this.infoCols[key] || '';
  }

  private infoContent: Record<InfoKey, { title: string; body: string[] }> = {
    ESTACION: { title: 'Estación', body: ['Seleccioná la estación meteorológica a evaluar.'] },
    FECHA: { title: 'Fecha', body: ['Fecha para la cual se evaluarán las condiciones.'] },

    METODO: {
      title: 'Método de aplicación',
      body: [
        'Ajusta umbrales de riesgo y recomendaciones.',
        'Dron/Aéreo suelen ser más sensibles a inversión, viento y GNSS.',
        'Terrestre (mosquito/manual) tolera mejor algunos escenarios, pero no “salva” inversión fuerte.'
      ]
    },
    PRIORIDAD: {
      title: 'Prioridad',
      body: [
        'EQUILIBRADO: balance deriva/eficacia.',
        'SEGURIDAD: penaliza más deriva (viento, inversión, ΔT alto).',
        'EFICACIA: prioriza condiciones de desempeño, cuidando mínimos de seguridad.'
      ]
    },
    CULTIVO: {
      title: 'Cultivo',
      body: ['Se usa para ajustar criterios según contexto del cultivo.']
    },
    PRODUCTO: {
      title: 'Producto',
      body: [
        'Herbicida: suele ser más crítico por deriva.',
        'Fungicida/Insecticida: cobertura/eficacia puede pesar más (según etiqueta).'
      ]
    },
    GOTA: {
      title: 'Tamaño de gota',
      body: [
        'Más fina: mejor cobertura pero mayor deriva/evaporación.',
        'Más gruesa: menos deriva pero puede bajar cobertura.',
        'Con ΔT de 10 a 12 °C, la gota gruesa o muy gruesa deja el semáforo en amarillo; con gota media o más fina, rojo (GRDC, 2025).'
      ]
    },

    KP: {
      title: 'Kp (índice geomagnético)',
      body: [
        'Mide actividad geomagnética; puede afectar GNSS/compás.',
        'Guía: <4 normal; 4–5 precaución; ≥5 puede degradar precisión (dron/aéreo).',
        'En la tabla se usa el Kp del intervalo de 3 h de cada registro (NOAA SWPC para la última semana, GFZ Potsdam para fechas anteriores). Si no hay Kp para la fecha, se usa el último publicado y se aclara debajo de la tabla. El mapa usa el último publicado.'
      ]
    },
    GNSS: {
      title: 'GNSS / Satélites',
      body: [
        'Cantidad de satélites para posicionamiento.',
        'Más relevante en dron/aéreo.',
        'Si es bajo: aumentar márgenes y evitar operar cerca de zonas sensibles.'
      ]
    },

    SEMAFORO: {
      title: 'Semáforo',
      body: [
        'Verde: aplicar. Amarillo: precaución. Rojo: no aplicar. Sin evaluar (gris): falta o es inválido algún dato; no se evalúa con valores supuestos.',
        'Se combinan los dos riesgos según la prioridad (deriva / eficacia): Seguridad 80 / 20, Equilibrado 60 / 40, Eficacia 40 / 60. En citrus pesa un poco más la deriva y en granos, la eficacia. Resultado: menos de 35, verde; de 35 a 65, amarillo; más de 65, rojo (criterio propio).',
        'Nunca es mejor que el peor criterio individual: si alguno de los de abajo da amarillo o rojo, el semáforo queda por lo menos de ese color.',
        'La etiqueta del producto tiene prioridad sobre estos criterios. El semáforo es una herramienta de apoyo: la decisión de aplicar es de quien aplica (Kogan et al., 2017).'
      ]
    },
    DELTA_T: {
      title: 'ΔT (Delta T)',
      body: [
        'Indicador del potencial de evaporación de la gota.',
        'ΔT alto: aumenta evaporación → más deriva y menor depósito.',
        'GRDC (2025): de 2 a 8 °C, adecuado; de 8 a 10 °C y de 1 a 2 °C, precaución; de 10 a 12 °C, sólo con gota gruesa o muy gruesa; más de 12 °C, no aplicar. Menos de 1 °C, no aplicar (criterio propio).',
        'Se calcula con la temperatura de bulbo húmedo de Stull (2011).'
      ]
    },
    INVERSION: {
      title: 'Inversión térmica',
      body: [
        'Aire estable: la nube puede viajar lejos sin dispersarse.',
        'Se estima probable desde una hora antes de la puesta del sol hasta una hora después de la salida (INTA Pergamino, citado por AgroSpray, 2020), con viento medio menor a 5 km/h y HR de 85 % o más (criterio propio; INTA Pergamino toma un viento de 4,2 km/h o menos como indicador de inversión).',
        'Riesgo alto de deriva a larga distancia.'
      ]
    },
    DERIVA: {
      title: 'Riesgo de deriva',
      body: [
        'Riesgo de que el producto se desvíe fuera del lote, de 0 a 100: más alto, peor.',
        'Cada criterio se califica verde (20 puntos), amarillo (55) o rojo (85) y se pondera: viento (calma o ráfaga alta) 35 %, inversión térmica probable 30 %, ráfaga por encima del viento medio (turbulencia) 20 % y ΔT 15 %.',
        'Menos de 35, bajo; de 35 a 65, medio; más de 65, alto. En la práctica va de 20 (todo verde) a 85 (todo rojo).',
        'Pesos y rangos: criterio propio. Los umbrales de cada criterio y sus fuentes están en la ayuda del semáforo.'
      ]
    },
    EFICACIA: {
      title: 'Riesgo de baja eficacia',
      body: [
        'Riesgo de que el producto no llegue al blanco o no actúe bien, de 0 a 100: más alto, peor.',
        'Pondera la lluvia (lavado) 45 %, el ΔT (evaporación de la gota) 30 % y el viento 25 %, con la misma escala de 20, 55 y 85 puntos por criterio.',
        'Menos de 35, bajo; de 35 a 65, medio; más de 65, alto.',
        'Pesos y rangos: criterio propio. Los umbrales de cada criterio y sus fuentes están en la ayuda del semáforo.'
      ]
    },
    DIRECCION: { title: 'Dirección', body: ['Si sopla hacia zonas sensibles, evitar aplicar.'] },
    LLUVIA: {
      title: 'Lluvia',
      body: [
        'Riesgo de lavado y pérdida de eficacia según rainfastness.',
        'Una lluvia de más de 0,2 mm en el registro pone la fila en rojo. Hasta 0,2 mm (un registro de la estación) puede ser rocío y no cuenta (Kogan et al., 2017).'
      ]
    },

    SCORES: { title: 'Riesgos', body: ['Menos de 35, bajo; de 35 a 65, medio; más de 65, alto.'] },
    FORECAST_HELP: {
      title: 'Cómo leer la tabla',
      body: [
        'Temp/HR: evaporación.',
        'Viento: deriva (la referencia es la ráfaga).',
        'Lluvia: lavado.',
        'Semáforo: síntesis deriva/eficacia según método y prioridad.',
        'Sin evaluar (gris): falta o es inválido algún dato del registro.'
      ]
    },
    CONSEJOS: {
      title: 'Por qué recomienda esto',
      body: [
        'Seleccioná una fila para ver razones y recomendaciones en el panel inferior.'
      ]
    }
  };
  // Tooltip final (title) — lo dejo simple y robusto
  tooltip(key: InfoKey): string {
    const item = this.infoContent[key];
    const lines = [item.title, ...item.body];
    return lines.join('\n');
  }

  openInfoSimple(key: string, title: string): void {
    this.infoTitle = title;
    const txt = this.getInfo(key);
    this.infoBody = txt ? [txt] : ['Sin información disponible.'];

    this.dialog.open(this.infoDialogTpl, {
      panelClass: 'instr-dialog',
      autoFocus: false,
      restoreFocus: false,
      width: 'min(720px, 94vw)'
    });
  }

  getRazones(ev?: EvaluacionAplicacion | null): string[] {
    return ev?.razones ?? [];
  }
  getRecomendaciones(ev?: EvaluacionAplicacion | null): string[] {
    return ev?.recomendaciones ?? [];
  }
}
