import { Component, OnInit, AfterViewInit, OnDestroy, Inject, Injectable } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import * as L from 'leaflet';
import { OPCIONES_GESTOS } from '../maps/gestos';
import { ZonaProductiva, alternarZona, cargarCapasZonas, crearZonasProductivas } from '../maps/zonas-productivas';
import { agregarMapaBase, cargarProvincias } from '../maps/mapa-base';
import { FilaPopup, conectarBotonesFicha, popupEstacion } from '../maps/popup';
import { FichaEstacionService } from '../services/ficha-estacion.service';
import { seguirTamanioMapa } from '../maps/map-size';
import { encuadrarTucuman } from '../maps/encuadre';
import { leyendaPlegable } from '../maps/leyenda-plegable';
import { formatDecimal } from '../pipes/valor.pipe';
import { Subscription, catchError, forkJoin, of } from 'rxjs';
import { DiaLluvia, LluviaPeriodoResponse, WeatherService, WeatherStation } from '../services/weather.service';
import { EstadoComunicacion, estadoComunicacion, leerFechaEstacion } from '../shared/estado-estacion';
import { MatDialogRef } from '@angular/material/dialog';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_DATE_FORMATS, DateAdapter, NativeDateAdapter } from '@angular/material/core';
import { ViewEncapsulation } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog'; // Añade esta importación
import { KmzLayerService } from '../services/kmz-layer.service';
import { ComoSeLeeComponent } from '../shared/como-se-lee.component';


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

export const MY_DATE_FORMATS = {
  parse: { dateInput: 'dd/MM/yyyy' },
  display: {
    dateInput: 'dd/MM/yyyy',
    monthYearLabel: 'MMM yyyy',
    dateA11yLabel: 'dd/MM/yyyy',
    monthYearA11yLabel: 'MMMM yyyy'
  },
};

interface RainMapRecord {
  identificacion?: number | string;
  lat: number | string;
  lon: number | string;
  habilitada: number;
  nombre: string;
  totalLluvia: number | string | null;
  maxLluvia: number | string | null;
  registrosLluvia: number | string | null;
  frecuenciaDato: number | string;
  /** Horas cubiertas por los registros y horas del período (lluvia-periodo.php); sin dato si no respondió */
  horasCubiertas?: number;
  horasPeriodo?: number;
}

/** Con registros que cubren menos de esta fracción del período, la estación se marca incompleta */
const COBERTURA_MINIMA = 0.9;

/**
 * lluvia-periodo.php (día de 9 a 9 h y cantidad de registros). La primera versión trabó la base de
 * estaciones (tablas con bloqueo por tabla); la actual usa el índice de fecha (un mes, en menos de 1 s).
 * Si vuelve a haber problemas, con false no se consulta y el botón «De 9 a 9 h» no se muestra.
 */
export const LLUVIA_PERIODO_HABILITADA = true;

/** Período máximo que acepta lluvia-periodo.php (MAX_DIAS); con uno más largo no se consulta */
const MAX_DIAS_PERIODO = 31;

/**
 * Debajo de este valor (un registro de ~0,25 mm o la suma de unos pocos) la lluvia no se distingue
 * del rocío: puede ser condensación acumulada durante varios días en el pluviómetro.
 */
const UMBRAL_ROCIO_MM = 0.3;
const COLOR_ROCIO = '#edf8b1';
const COLOR_CERO = '#808080';

interface RainScale {
  min: number;
  max: number;
  color: string;
}

@Component({
  selector: 'app-map-rain',
  templateUrl: './map-rain.component.html',
  styleUrls: ['./map-rain.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSelectModule,
    MatButtonModule,
    ReactiveFormsModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatCheckboxModule,
    MatButtonToggleModule,
    ComoSeLeeComponent,
  ],
  providers: [
    { provide: DateAdapter, useClass: DmyDateAdapter }, // Cambiar NativeDateAdapter por DmyDateAdapter
    { provide: MAT_DATE_FORMATS, useValue: MY_DATE_FORMATS },
  ],
  encapsulation: ViewEncapsulation.None
})
export class MapRainComponent implements OnInit, AfterViewInit, OnDestroy {
  /** Deja de observar el tamaño del contenedor del mapa (ver seguirTamanioMapa). */
  private dejarDeSeguirTamanio?: () => void;
  hoy: boolean = false;
  form: FormGroup;
  map?: L.Map;
  rainData: RainMapRecord[] = [];
  rainSubscription: Subscription | undefined;
  markersLayer = L.layerGroup();
  zoneLayers: ZonaProductiva[] = crearZonasProductivas();
  loading = false;
  rainScales: RainScale[] = [];
  maxRainValue: number = 0;
  /**
   * Vista «Hoy»: fecha del último dato de cada estación (estaciones.php, por identificación), para
   * no confundir una estación sin datos con 0 mm y marcar las que dejaron de transmitir.
   */
  private ultimoDato = new Map<string, Date | null>();
  /** Día de la lluvia: de 0 a 24 h o pluviométrico (de 9 a 9 h) */
  dia: DiaLluvia = 'calendario';
  /** Día de la última carga (el título no cambia hasta volver a cargar) */
  diaCargado: DiaLluvia = 'calendario';
  /** Aviso cuando no se pudo traer la lluvia de 9 a 9 h o la cantidad de registros */
  aviso = '';
  readonly lluviaPeriodoHabilitada = LLUVIA_PERIODO_HABILITADA;
  /** La última carga trajo la cantidad de registros (se pueden marcar las estaciones incompletas) */
  conRegistros = false;
  /** Período de la última carga, para el título del mapa */
  tituloPeriodo = '';

  constructor(
    private fb: FormBuilder,
    private weatherService: WeatherService,
    private dialogRef: MatDialogRef<MapRainComponent>,
    private http: HttpClient,
    private kmzLayerService: KmzLayerService,
    private fichaEstacion: FichaEstacionService,
    private dateAdapter: DateAdapter<Date>,
    @Inject(MAT_DIALOG_DATA) public data: { hoy: boolean }
  ) {
    this.hoy = data.hoy;
    this.dateAdapter.setLocale('es-AR');
    const currentYear = new Date().getFullYear();
    const firstDay = new Date(currentYear, 0, 1);
    this.form = this.fb.group({
      desde: [firstDay, [Validators.required]],
      hasta: [new Date(), [Validators.required]]
    });
  }

  ngOnInit(): void {
    // Automatically load data if hoy is true
    if (this.hoy) {
      this.loadData();
    }
  }

  async ngAfterViewInit() {
    this.map = L.map('mapContainer', {
      center: [-27, -65],
      zoom: 8,
      ...OPCIONES_GESTOS   // gestos táctiles y Ctrl+rueda (ver maps/gestos.ts)
    });
    this.dejarDeSeguirTamanio = seguirTamanioMapa(this.map);
    encuadrarTucuman(this.map);

    const control = agregarMapaBase(this.map);
    conectarBotonesFicha(this.map, this.fichaEstacion);
    this.map.createPane('zonePane').style.zIndex = '450';
    this.map.createPane('rainMarkersPane').style.zIndex = '600';
    this.markersLayer.addTo(this.map);
    await cargarProvincias(this.map, this.http, { control });
    await this.loadZoneLayers();
    this.addLegend(); // Add the color scale legend to the map

    setTimeout(() => this.map?.invalidateSize(), 50);
  }

  private async loadZoneLayers(): Promise<void> {
    await cargarCapasZonas(this.zoneLayers, this.kmzLayerService);
  }

  toggleZoneLayer(zone: ZonaProductiva, selected: boolean): void {
    alternarZona(this.map, zone, selected);
  }

  /** Cambia entre el día de 0 a 24 h y el pluviométrico; en «Hoy» recarga al momento. */
  cambiarDia(dia: DiaLluvia): void {
    this.dia = dia;
    if (this.hoy) this.loadData();
  }

  loadData(): void {
    this.loading = true; // Activa el spinner
    this.aviso = '';
    this.markersLayer.clearLayers();
    this.rainSubscription?.unsubscribe();

    const dia = this.dia;
    // «Hoy» de 9 a 9 h es el día pluviométrico en curso: pasadas las 9 h, el que termina mañana a las 9 h
    const ahora = new Date();
    const fechaHoy = new Date(ahora);
    if (dia === 'pluviometrico' && ahora.getHours() >= 9) fechaHoy.setDate(fechaHoy.getDate() + 1);
    const hoyTexto = this.formatDate(fechaHoy);
    const desde = this.hoy ? hoyTexto : this.formatDate(this.form.value.desde);
    const hasta = this.hoy ? hoyTexto : this.formatDate(this.form.value.hasta);

    // datos-alerta.php da la ubicación y, en el día de 0 a 24 h, la lluvia. lluvia-periodo.php da la
    // cantidad de registros y la lluvia de 9 a 9 h; si falla, el mapa se dibuja igual sin marcar
    // las incompletas (y sin la vista de 9 a 9 h).
    const base$ = this.hoy ? this.weatherService.getAlerts<RainMapRecord>() : this.weatherService.getRains<RainMapRecord>(desde, hasta);
    const dias = Math.round((Date.parse(hasta) - Date.parse(desde)) / 86400000) + 1;
    const consultaPeriodo = LLUVIA_PERIODO_HABILITADA && dias <= MAX_DIAS_PERIODO;
    const periodo$ = consultaPeriodo
      ? this.weatherService.getLluviaPeriodo(desde, hasta, dia).pipe(catchError(() => of(null)))
      : of(null);
    // Vista «Hoy»: fecha del último dato de cada estación (si falla, sin marcar las que no transmiten)
    const estaciones$ = this.hoy
      ? this.weatherService.getStations().pipe(catchError(() => of([] as WeatherStation[])))
      : of([] as WeatherStation[]);

    this.rainSubscription = forkJoin([base$, periodo$, estaciones$]).subscribe({
      next: ([resp, periodo, estaciones]) => {
        this.ultimoDato = new Map((estaciones ?? []).map(e => [String(e.Identificacion), leerFechaEstacion(e.fecha_I)]));
        this.diaCargado = dia;
        this.tituloPeriodo = this.textoPeriodo(desde, hasta, dia);
        this.conRegistros = periodo?.status === 'success';
        if (dia === 'pluviometrico' && periodo?.status !== 'success') {
          this.aviso = consultaPeriodo
            ? 'La lluvia de 9 a 9 h no está disponible en este momento.'
            : `La lluvia de 9 a 9 h se puede ver para períodos de hasta ${MAX_DIAS_PERIODO} días.`;
          this.rainData = [];
        } else {
          if (consultaPeriodo && periodo?.status !== 'success') this.aviso = 'No se pudo consultar la cantidad de registros: no se marcan las estaciones incompletas.';
          this.rainData = this.combinar(resp.data.filter(station => station.habilitada > 0), dia, periodo);
        }
        this.plotRain();
        this.loading = false; // Desactiva el spinner al finalizar
      },
      error: () => {
        this.loading = false; // Desactiva el spinner en caso de error
      }
    });
  }

  /**
   * Agrega a cada estación las horas cubiertas por sus registros y, en el día pluviométrico,
   * reemplaza la lluvia por la de 9 a 9 h (la ubicación sigue saliendo de datos-alerta.php).
   */
  private combinar(base: RainMapRecord[], dia: DiaLluvia, periodo: LluviaPeriodoResponse | null): RainMapRecord[] {
    if (periodo?.status !== 'success') return base;
    const porId = new Map(periodo.estaciones.map(e => [String(e.id), e]));
    return base.map(d => {
      const p = porId.get(String(d.identificacion ?? ''));
      if (!p) return dia === 'pluviometrico' ? { ...d, totalLluvia: null } : d;
      const cobertura = { horasCubiertas: p.horas, horasPeriodo: periodo.horasPeriodo };
      if (dia === 'calendario') {
        return { ...d, ...cobertura, totalLluvia: p.registros > 0 ? d.totalLluvia : null };
      }
      return { ...d, ...cobertura, totalLluvia: p.mm, maxLluvia: p.maxRegistro, registrosLluvia: p.registrosLluvia };
    });
  }

  plotRain(): void {
    if (!this.rainData || this.rainData.length === 0) return;

    // Calculate dynamic scales based on actual data
    this.calculateDynamicScales();

    this.rainData.forEach(d => {
      if (!d.lat || !d.lon) return;

      const totalLluvia = d.totalLluvia == null ? NaN : parseFloat(String(d.totalLluvia));
      const registrosLluvia = parseInt(String(d.registrosLluvia), 10) || 0;
      const maxLluvia = parseFloat(String(d.maxLluvia));
      const frecuenciaDato = parseFloat(String(d.frecuenciaDato));
      const lat = Number(d.lat);
      const lon = Number(d.lon);

      // Estado de los datos: en «Hoy», según el último dato de la estación; en un período sólo se
      // sabe si la API no devolvió la lluvia (no informa cuántos registros tiene cada estación)
      const fechaUltimo = this.hoy ? this.ultimoDato.get(String(d.identificacion ?? '')) : undefined;
      let estado: EstadoComunicacion = 'al-dia';
      if (!Number.isFinite(totalLluvia)) estado = 'sin-datos-hoy';
      else if (fechaUltimo !== undefined) estado = estadoComunicacion(fechaUltimo);
      const sinDatos = estado === 'sin-datos-hoy';
      // Incompleta: dejó de transmitir («Hoy») o sus registros cubren menos del 90 % del período
      const cubiertas = d.horasCubiertas;
      const delPeriodo = d.horasPeriodo;
      const conCobertura = cubiertas != null && delPeriodo != null && delPeriodo > 0;
      const pocosRegistros = conCobertura && (cubiertas as number) < COBERTURA_MINIMA * (delPeriodo as number);
      const incompleta = !sinDatos && (estado === 'atrasada' || pocosRegistros);

      const filas: FilaPopup[] = sinDatos
        ? [{ etiqueta: 'Lluvia', valor: this.hoy ? 'sin datos hoy' : 'sin datos', destacada: true }]
        : [
          { etiqueta: 'Lluvia total', valor: `${formatDecimal(totalLluvia, 1)} mm`, destacada: true },
          { etiqueta: 'Lluvia máxima en un registro', valor: `${formatDecimal(maxLluvia, 1)} mm` },
          { etiqueta: 'Horas de lluvia', valor: formatDecimal((registrosLluvia * frecuenciaDato) / 60, 1) }
        ];
      if (!sinDatos && conCobertura) {
        filas.push({ etiqueta: 'Registros', valor: `cubren ${formatDecimal(Math.min(cubiertas as number, delPeriodo as number), 1)} h de ${formatDecimal(delPeriodo as number, 1)} h` });
      }
      if (estado === 'atrasada') {
        filas.push({ etiqueta: 'Atención', valor: 'dejó de transmitir: el total puede estar incompleto' });
      } else if (incompleta) {
        filas.push({ etiqueta: 'Atención', valor: 'faltan registros: el total puede estar incompleto' });
      }

      // Sin datos: hueco con borde gris punteado (no es 0 mm). Incompleta: relleno tenue y borde
      // punteado. Mismo criterio que el mapa de datos en línea (shared/estado-estacion.ts).
      const marker = L.circleMarker([lat, lon], {
        pane: 'rainMarkersPane',
        radius: 8,
        fillColor: sinDatos ? '#ffffff' : this.getRainColor(totalLluvia),
        color: sinDatos ? '#9ca3af' : '#000',
        weight: sinDatos || incompleta ? 1.5 : 1,
        dashArray: sinDatos || incompleta ? '2 2' : undefined,
        fillOpacity: incompleta ? 0.4 : 1
      }).bindPopup(popupEstacion({
        titulo: d.nombre,
        filas,
        actualizado: this.hoy && fechaUltimo !== undefined ? fechaUltimo : undefined,
        ficha: { lat, lon }
      }));
      this.markersLayer.addLayer(marker);
    });

    // Update legend with new scales
    this.updateLegend();
  }

  private calculateDynamicScales(): void {
    // Valores de lluvia desde 0,3 mm: por debajo es la clase fija «lluvia o rocío»
    const precipitationValues = this.rainData
      .map(d => (d.totalLluvia == null ? NaN : parseFloat(String(d.totalLluvia))))
      .filter(v => Number.isFinite(v) && v >= UMBRAL_ROCIO_MM)
      .sort((a, b) => a - b);

    // YlGnBu (apta para daltonismo): el primer color es el de rocío; luego hasta cuatro clases
    // por percentil y la última sin tope
    const colors = [COLOR_ROCIO, '#a1dab4', '#41b6c4', '#2c7fb8', '#253494', '#081d58'];

    const scales: RainScale[] = [
      { min: 0, max: 0, color: COLOR_CERO },                       // 0 mm
      { min: 0.001, max: UMBRAL_ROCIO_MM, color: COLOR_ROCIO }     // lluvia < 0,3 mm o rocío
    ];

    if (precipitationValues.length === 0) {
      this.rainScales = scales;
      this.maxRainValue = 0;
      return;
    }

    this.maxRainValue = precipitationValues[precipitationValues.length - 1];

    // Intervalos por percentiles (20, 40, 60 y 80 %); el último llega al máximo
    const stepSize = Math.ceil(precipitationValues.length / 5);
    let lastMax = UMBRAL_ROCIO_MM;

    for (let i = 1; i < 5 && i * stepSize < precipitationValues.length; i++) {
      const index = Math.min((i * stepSize) - 1, precipitationValues.length - 1);
      const currentMax = precipitationValues[index];

      if (currentMax > lastMax) {
        const colorIndex = Math.min(i, colors.length - 1);
        scales.push({ min: lastMax, max: currentMax, color: colors[colorIndex] });
        lastMax = currentMax;
      }
    }

    // Última clase, sin tope
    scales.push({ min: lastMax, max: this.maxRainValue, color: colors[colors.length - 1] });

    this.rainScales = scales;
  }

  getRainColor(totalLluvia: number): string {
    if (totalLluvia === 0) return COLOR_CERO; // gris (mismo valor que la leyenda)
    if (totalLluvia < UMBRAL_ROCIO_MM) return COLOR_ROCIO; // lluvia < 0,3 mm o rocío

    for (const scale of this.rainScales) {
      if (scale.min === 0.001) continue; // la de rocío ya se resolvió arriba
      if (totalLluvia >= scale.min && totalLluvia <= scale.max) {
        return scale.color;
      }
    }

    // Fallback color if no scale matches
    return 'gray';
  }

  private addLegend(): void {
    const legend = new L.Control({ position: 'bottomright' });
    const self = this;

    legend.onAdd = () => {
      const div = L.DomUtil.create('div', 'info legend');
      div.id = 'rainLegend';
      div.innerHTML = `
        <strong>Precipitaciones</strong><br>
        <p style="font-size: 12px; margin: 5px 0;">Cargando datos...</p>
      `;
      return leyendaPlegable(div);
    };

    if (this.map) {
      legend.addTo(this.map);
    }

    // Con hoy=true los datos se piden en ngOnInit y pueden llegar antes que la leyenda.
    if (this.rainData?.length) {
      this.updateLegend();
    }
  }

  private updateLegend(): void {
    const legendDiv = document.getElementById('rainLegend');
    if (!legendDiv) return;

    let html = '<strong>Precipitaciones</strong><br>';

    // Add static entries
    html += `<i style="background:${COLOR_CERO}"></i> 0 mm<br>`;

    // Add dynamic scales
    for (const scale of this.rainScales) {
      if (scale.min === 0 && scale.max === 0) continue; // Skip zero entry
      
      let label = '';
      if (scale.min === 0.001) {
        label = `lluvia < ${formatDecimal(scale.max, 1)} mm o rocío`;
      } else if (scale.max === this.maxRainValue) {
        // Sin tope: un valor erróneo de una estación (p. ej. 27007,6 mm) no aparece en la leyenda
        label = `> ${formatDecimal(scale.min, 1)} mm`;
      } else {
        label = `${formatDecimal(scale.min, 1)} - ${formatDecimal(scale.max, 1)} mm`;
      }

      html += `<i style="background:${scale.color}"></i> ${label}<br>`;
    }

    // Estado de los datos (mismas muestras que el mapa de datos en línea)
    html += '<i style="background:#ffffff;box-shadow:none;border:1.5px dashed #9ca3af;border-radius:50%;box-sizing:border-box"></i> Sin datos<br>';
    if (this.conRegistros || this.hoy) {
      const etiqueta = !this.conRegistros ? 'Dejó de transmitir'
        : this.hoy ? 'Faltan registros o dejó de transmitir' : 'Faltan registros';
      html += `<i style="background:#41b6c4;opacity:.4;box-shadow:none;border:1.5px dashed #000;border-radius:50%;box-sizing:border-box"></i> ${etiqueta}<br>`;
    }

    legendDiv.innerHTML = html;
  }

  /**
   * Título del período cargado. De 9 a 9 h, cada fecha es el día que termina a las 9 h, así que el
   * período empieza a las 9 h del día anterior a `desde` (el primer registro es el siguiente a las 9:00).
   */
  private textoPeriodo(desde: string, hasta: string, dia: DiaLluvia): string {
    const fecha = (texto: string, dias = 0): string => {
      const [a, m, d] = texto.split('-').map(Number);
      const f = new Date(a, m - 1, d + dias);
      return `${('0' + f.getDate()).slice(-2)}/${('0' + (f.getMonth() + 1)).slice(-2)}/${f.getFullYear()}`;
    };
    if (this.hoy) {
      if (dia === 'calendario') return 'Hoy, desde las 0 h hasta el último registro';
      const desdeAyer = desde === this.formatDate(new Date());
      return `Día pluviométrico en curso: desde las 9 h de ${desdeAyer ? 'ayer' : 'hoy'} hasta el último registro`;
    }
    if (dia === 'pluviometrico') {
      return `Período: ${fecha(desde, -1)} 9 h a ${fecha(hasta)} 9 h (días de 9 a 9 h)`;
    }
    if (desde === hasta) return `Día: ${fecha(desde)}${LLUVIA_PERIODO_HABILITADA ? ', de 0 a 24 h' : ''}`;
    return `Período: ${fecha(desde)} a ${fecha(hasta)}${LLUVIA_PERIODO_HABILITADA ? ' (días de 0 a 24 h)' : ''}`;
  }

  private formatDate(date: Date): string {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = ('0' + (d.getMonth() + 1)).slice(-2);
    const day = ('0' + d.getDate()).slice(-2);
    return `${year}-${month}-${day}`;
  }

  ngOnDestroy(): void {
    this.dejarDeSeguirTamanio?.();
    this.map?.remove();
    // Sin mapa: los pasos que siguen a las cargas asíncronas no tocan un mapa ya destruido
    this.map = undefined;
    this.rainSubscription?.unsubscribe();
  }

  close(): void {
    this.dialogRef.close();
  }
}
