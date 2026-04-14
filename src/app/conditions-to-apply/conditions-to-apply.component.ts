import { Component, OnInit, AfterViewInit, Injectable, TemplateRef, ViewChild } from '@angular/core';
import { CommonModule, registerLocaleData } from '@angular/common';
import { Feature, FeatureCollection, Point } from 'geojson';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import * as L from 'leaflet';

import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DateAdapter, MAT_DATE_FORMATS, MAT_DATE_LOCALE, NativeDateAdapter } from '@angular/material/core';

import localeEs from '@angular/common/locales/es';
registerLocaleData(localeEs);

// ✅ Ajustá estos imports a tu estructura real
import { StationsApiResponse, WeatherService, WeatherStation } from '../services/weather.service';
import { KpLatest, KpService } from '../services/kp.service';
import {
  SprayAdvisorService,
  MetodoAplicacion,
  Prioridad,
  Cultivo,
  EvaluacionAplicacion,
  Semaforo
} from '../services/spray-advisor.service';

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
  lat: number;
  lon: number;
  temp_af: number;
  hum_af: number;
  viento_max: number;
  fecha_I: string;
}

interface WeatherData {
  hora: string;
  temp_af: number | null;
  hum_af: number | null;
  viento_medio: number | null;
  viento_max: number | null;
  direccion: string | null;
  lluvia: number | null;

  eval?: EvaluacionAplicacion;
  rowClass?: 'apto-row' | 'precaucion-row' | 'no-apto-row';
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

type TipoProducto = 'HERBICIDA' | 'FUNGICIDA' | 'INSECTICIDA';
type TamGota = 'MUY_FINA' | 'FINA' | 'MEDIA' | 'GRUESA' | 'MUY_GRUESA';
type InfoKey =
  | 'ESTACION' | 'FECHA' | 'METODO' | 'PRIORIDAD' | 'CULTIVO' | 'PRODUCTO' | 'GOTA'
  | 'KP' | 'GNSS'
  | 'SEMAFORO' | 'DELTA_T' | 'INVERSION' | 'DERIVA' | 'EFICACIA' | 'DIRECCION' | 'LLUVIA'
  | 'FORECAST_HELP' | 'SCORES' | 'CONSEJOS';

@Component({
  selector: 'app-conditions-to-apply',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatSelectModule,
    MatTooltipModule,
  ],
  providers: [
    { provide: DateAdapter, useClass: DmyDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: MY_DATE_FORMATS },
    { provide: MAT_DATE_LOCALE, useValue: 'es-AR' },
  ],
  templateUrl: './conditions-to-apply.component.html',
  styleUrls: ['./conditions-to-apply.component.css']
})
export class ConditionsToApplyComponent implements OnInit, AfterViewInit {

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

  // ===== KP =====
  kpIndex = 1;
  kpTimeTag: string | null = null;
  kpLoading = false;

  sats = 12; // opcional para DRON/AVION (si tu advisor lo usa)


  infoText: Record<string, string> = {
    estacion: 'Seleccioná la estación meteorológica a evaluar.',
    fecha: 'Fecha para la cual se evaluarán las condiciones.',
    metodo: 'Método de aplicación. Afecta umbrales de deriva/eficacia.',
    prioridad: 'SEGURIDAD (más restrictivo), EFICACIA (más permisivo), EQUILIBRADO (intermedio).',
    cultivo: 'El cultivo puede modificar recomendaciones y umbrales.',
    producto: 'Tipo de producto: ajusta reglas de deriva/eficacia.',
    gota: 'Tamaño de gota: más gruesa reduce deriva, puede afectar cobertura.',
    kp: 'Kp (NOAA): actividad geomagnética. Puede afectar GNSS/compás (dron/avión).',
    gnss: 'Satélites GNSS: relevante en dron/avión para precisión de guiado.',
  };

  infoCols: Record<string, string> = {
    semaforo: 'Resumen global (deriva + eficacia + restricciones).',
    delta_t: 'ΔT (Delta T): potencial de evaporación de la gota.',
    inversion: 'Inversión térmica: atmósfera estable → aumenta deriva a larga distancia.',
    deriva: 'Score de deriva (más alto = peor).',
    eficacia: 'Score de eficacia (más alto = mejor).',
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

  constructor(
    private weatherService: WeatherService,
    private kp: KpService,
    private dialog: MatDialog,
    private dialogRef: MatDialogRef<ConditionsToApplyComponent>,
    private advisor: SprayAdvisorService
  ) { }

  ngOnInit(): void {
    this.selectedDate = new Date();
    this.loadKp();
    this.loadStations();
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.initMap(), 0);
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
  this.infoBody = item.body;

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
    lines.push(`Extras: Kp=${Number(this.kpIndex).toFixed(1)}${this.usarGnssEnDecision() ? ` · Satélites=${this.sats}` : ''}`);

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

  private extrasDecision() {
    return {
      kpIndex: this.kpIndex,
      sats: this.usarGnssEnDecision() ? this.sats : undefined
    };
  }

  // ===== KP =====
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
      }
    });
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
            lat: parseFloat(item.lat) || 0,
            lon: parseFloat(item.lon) || 0,
            temp_af: parseFloat(item.temp_af ?? '') || 0,
            hum_af: parseFloat(item.hum_af ?? '') || 0,
            viento_max: parseFloat(item.viento_max ?? '') || 0,
            fecha_I: item.fecha_I || ''
          };
        });

        const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000);
        this.estacionesRecientes = this.estaciones.filter(est => new Date(est.fecha_I) >= twoHoursAgo);

        const defaultEst =
          this.estacionesRecientes.find(est => est.identificacion === '2049') ||
          this.estaciones.find(est => est.identificacion === '2049') ||
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
  searchData(): void {
    if (!this.selectedStation) return;

    this.loadingData = true;
    this.selectedRow = null;

    const ymd = this.formatDate(this.selectedDate);

    this.weatherService.getWeatherDataHourly<HourlyWeatherRow>(ymd, this.selectedStation).subscribe({
      next: (resp) => {
        this.weatherDataRaw = resp.data || [];
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
    const ymd = this.formatDate(this.selectedDate);

    this.weatherData = this.weatherDataRaw.map((item) => {
      const evBase = this.evaluarDesdeWebRow(item, ymd);
      const ev = this.applyProductoExtras(evBase, {
        tC: this.numOrNull(item.temp_af),
        rh: this.numOrNull(item.hum_af),
        windMs: item.viento_medio != null ? Number(item.viento_medio) / 3.6 : null
      });

      return {
        ...item,
        eval: ev,
        rowClass: this.rowClass(ev.semaforo)
      } as WeatherData;
    });
  }

  selectRow(row: WeatherData): void {
    this.selectedRow = row;
  }

  // ===== Evaluación (motor) =====
  private evaluarDesdeWebRow(item: HourlyWeatherRow, ymd: string): EvaluacionAplicacion {
    const hora = String(item?.hora ?? '00:00');
    const isoLocal = `${ymd}T${hora}:00-03:00`;
    const dtUtc = Math.floor(new Date(isoLocal).getTime() / 1000);
    const tzSeconds = -10800;

    const tC = Number(item?.temp_af ?? 0);
    const rh = Number(item?.hum_af ?? 0);

    const windMs = item?.viento_medio != null ? Number(item.viento_medio) / 3.6 : 0;
    const gustMs = item?.viento_max != null ? Number(item.viento_max) / 3.6 : undefined;

    const lluvia = Number(item?.lluvia ?? 0);
    const pop = lluvia > 0 ? 1 : 0;

    return this.advisor.evaluar(
      {
        tC,
        rh,
        windMs,
        gustMs,
        pop,
        dtUtc,
        tzSeconds,
        sunriseUtc: undefined,
        sunsetUtc: undefined,
        weather: undefined
      },
      this.metodo,
      this.cultivo,
      this.prioridad,
      this.extrasDecision()
    );
  }

  private rowClass(semaforo: Semaforo): 'apto-row' | 'precaucion-row' | 'no-apto-row' {
    if (semaforo === 'VERDE') return 'apto-row';
    if (semaforo === 'AMARILLO') return 'precaucion-row';
    return 'no-apto-row';
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
  private initMap(): void {
    const el = document.getElementById('mapConditions');
    if (!el) return;

    if (this.map) this.map.remove();
    this.map = L.map('mapConditions', { center: [-26.8, -65.2], zoom: 8, preferCanvas: true });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OSM'
    }).addTo(this.map);
  }

  private refreshMarkers(): void {
    if (this.map) this.addMarkers(this.estacionesRecientes);
  }

  private addMarkers(stations: Estacion[]): void {
    if (!this.map) return;
    if (this.stationsLayer) this.map.removeLayer(this.stationsLayer);

    const featureCollection: FeatureCollection<Point, Estacion> = {
      type: 'FeatureCollection',
      features: stations.map((est): Feature<Point, Estacion> => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [est.lon, est.lat] },
        properties: est
      }))
    };

    this.stationsLayer = L.geoJSON(
      featureCollection,
      {
        pointToLayer: (f, latlng) => {
          const p = f.properties as Estacion;

          const dtUtc = Math.floor(Date.now() / 1000);
          const tzSeconds = -10800;

          const evBase = this.advisor.evaluar(
            {
              tC: Number(p.temp_af ?? 0),
              rh: Number(p.hum_af ?? 0),
              windMs: Number(p.viento_max ?? 0) / 3.6,
              gustMs: undefined,
              pop: 0,
              dtUtc,
              tzSeconds
            },
            this.metodo,
            this.cultivo,
            this.prioridad,
            this.extrasDecision()
          );

          const ev = this.applyProductoExtras(evBase, {
            tC: this.numOrNull(p.temp_af),
            rh: this.numOrNull(p.hum_af),
            windMs: (p.viento_max != null ? Number(p.viento_max) / 3.6 : null)
          });

          const color = this.semaforoColor(ev.semaforo);

          return L.circleMarker(latlng, {
            radius: 7,
            fillColor: color,
            color: '#000',
            weight: 1,
            fillOpacity: 0.85
          }).bindTooltip(
            `<b>${p.nombre}</b><br>
             Semáforo: <b>${ev.semaforo}</b><br>
             ΔT: ${ev.deltaT?.toFixed ? ev.deltaT.toFixed(1) : ev.deltaT} °C ${ev.inversionProbable ? '(Inv.)' : ''}<br>
             Deriva: ${ev.scoreDeriva} | Efic.: ${ev.scoreEficacia}<br>
             Kp: ${this.kpIndex}${this.usarGnssEnDecision() ? ` | Sats: ${this.sats}` : ''}`,
            { sticky: true }
          );
        }
      }
    ).addTo(this.map);

    setTimeout(() => this.map?.invalidateSize(), 50);
  }

  private semaforoColor(s: Semaforo): string {
    if (s === 'VERDE') return '#2e7d32';
    if (s === 'AMARILLO') return '#ffeb3b';
    return '#c0392b';
  }

  // ===== helpers =====
  private formatDate(date: Date): string {
    const y = date.getFullYear();
    const m = ('0' + (date.getMonth() + 1)).slice(-2);
    const d = ('0' + date.getDate()).slice(-2);
    return `${y}-${m}-${d}`;
  }

  private numOrNull(v: unknown): number | null {
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
        'Más gruesa: menos deriva pero puede bajar cobertura.'
      ]
    },

    KP: {
      title: 'Kp (índice geomagnético)',
      body: [
        'Mide actividad geomagnética; puede afectar GNSS/compás.',
        'Guía: <4 normal; 4–5 precaución; ≥5 puede degradar precisión (dron/aéreo).'
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

    SEMAFORO: { title: 'Semáforo', body: ['VERDE: aplicar · AMARILLO: precaución · ROJO: no aplicar'] },
    DELTA_T: {
      title: 'ΔT (Delta T)',
      body: [
        'Indicador del potencial de evaporación de la gota.',
        'ΔT alto: aumenta evaporación → más deriva y menor depósito.',
        'Guía: 2–8 mejor; 8–10 precaución; >10–12 alto riesgo.'
      ]
    },
    INVERSION: {
      title: 'Inversión térmica',
      body: [
        'Aire estable: la nube puede viajar lejos sin dispersarse.',
        'Típico noche/madrugada con viento muy bajo y HR alta.',
        'Riesgo alto de deriva a larga distancia.'
      ]
    },
    DERIVA: { title: 'Deriva (score)', body: ['Más alto = peor. Resume riesgo por viento/ráfagas/ΔT/inversión.'] },
    EFICACIA: { title: 'Eficacia (score)', body: ['Más alto = peor. Resume riesgo de baja eficacia por condiciones.'] },
    DIRECCION: { title: 'Dirección', body: ['Si sopla hacia zonas sensibles, evitar aplicar.'] },
    LLUVIA: { title: 'Lluvia', body: ['Riesgo de lavado y pérdida de eficacia según rainfastness.'] },

    SCORES: { title: 'Riesgos (scores)', body: ['0–34 bajo · 35–65 medio · >65 alto'] },
    FORECAST_HELP: {
      title: 'Cómo leer la tabla',
      body: [
        'Temp/HR: evaporación.',
        'Viento: deriva.',
        'Lluvia: lavado.',
        'Semáforo: síntesis deriva/eficacia según método y prioridad.'
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
