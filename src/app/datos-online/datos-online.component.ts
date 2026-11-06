import { Component, OnInit, AfterViewInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MatDialogModule, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import * as L from 'leaflet';
import { OPCIONES_GESTOS } from '../maps/gestos';
import { seguirTamanioMapa } from '../maps/map-size';
import { encuadrarTucuman } from '../maps/encuadre';
import { leyendaEstados } from '../maps/leyenda-estados';
import { agregarMapaBase, cargarProvincias } from '../maps/mapa-base';
import { conectarBotonesFicha, popupEstacion } from '../maps/popup';
import { FichaEstacionService } from '../services/ficha-estacion.service';
import { estadoComunicacion, leerFechaEstacion } from '../shared/estado-estacion';
import { DatosOnlineService, Estacion } from '../services/datos-online.service';
import { ChartType, ChartOptions } from 'chart.js';
import { WeatherService } from '../services/weather.service';
import { StationService } from '../services/station.service';
import { Chart } from 'chart.js';
import { HttpClient } from '@angular/common/http';
import { ChartConfiguration } from 'chart.js';
import { FeatureCollection, Point } from 'geojson';
import { SIN_DATO, formatDecimal, formatValor } from '../pipes/valor.pipe';
import { VAR_COLOR, GRID_COLOR, conAlfa } from '../charts/chart-theme';
import { referenciasHelada } from '../charts/referencias';
import { ExportarGraficoComponent } from '../shared/exportar-grafico.component';
import { CopiarEnlaceComponent } from '../shared/copiar-enlace.component';
import { ComoSeLeeComponent } from '../shared/como-se-lee.component';
import { armarEnlace, consultaDe } from '../shared/enlace-consulta';
import { descargarCsv } from '../shared/descargar-csv';
import { pluginFranjasSinDatos } from '../charts/dias-faltantes';

/** Zoom desde el que se muestran las etiquetas con el valor de cada estación */
const ZOOM_ETIQUETAS = 9;

interface StationFeatureProperties {
  id: string;
  nombre: string;
  fecha_i: string;
  temp_af: string;
  hum_af: string;
  rr_dia: number;
  viento_medio: number;
  viento_max: number;
  alt: number;
}

type WeatherVariableKey =
  | 'temp_af'
  | 'hum_af'
  | 'presion'
  | 'lluvia'
  | 'viento_medio'
  | 'viento_max';

interface HourlyWeatherRow {
  hora: string;
  temp_af?: string | number | null;
  hum_af?: string | number | null;
  presion?: string | number | null;
  lluvia?: string | number | null;
  viento_medio?: string | number | null;
  viento_max?: string | number | null;
}

interface ChartWeatherRow extends HourlyWeatherRow {
  fecha: string;
  timestamp: Date;
}

/** Variables del selector (las que acepta un enlace) */
const VARIABLES_ONLINE = ['temp_af', 'hum_af', 'presion', 'lluvia', 'viento_medio', 'viento_max'];

@Component({
  standalone: true,
  imports: [ComoSeLeeComponent, ExportarGraficoComponent, CopiarEnlaceComponent, CommonModule, FormsModule, MatDialogModule, MatIconModule],
  templateUrl: './datos-online.component.html',
  styleUrls: ['./datos-online.component.css']
})
export class DatosOnlineComponent implements OnInit, AfterViewInit, OnDestroy {
  /** Deja de observar el tamaño del contenedor del mapa (ver seguirTamanioMapa). */
  private dejarDeSeguirTamanio?: () => void;
  chart: Chart | null = null;
  /** Registros que faltan en las últimas 48 h: franjas grises en el gráfico y aviso */
  indicesSinRegistro: number[] = [];
  textoSinRegistro = '';
  /** Intervalo habitual entre registros de la estación elegida (calculado en conHuecos) */
  private intervaloMs = 15 * 60000;
  selectedStationId: string = '';
  selectedVariable: string = 'temp_af';
  fechasPeriodo: string = '';

  /** Consulta recibida por enlace (ver shared/enlace-consulta.ts) */
  private readonly consulta = consultaDe(inject(MAT_DIALOG_DATA, { optional: true }));

  /** Enlace a la consulta actual: estación y variable (botón "Copiar enlace") */
  readonly enlaceConsulta = (): string =>
    armarEnlace('tiempo-real', { estacion: this.selectedStationId, variable: this.selectedVariable });

  chartData: ChartWeatherRow[] = [];
  chartLabels: Array<string | number> = [];
  chartOptions: ChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true
      }
    }
  };
  chartType: ChartType = 'line';

  estaciones: Estacion[] = [];
  loading = true;
  error = false;

  private map?: L.Map;
  /** Control de capas del mapa base: las provincias se suman ahí al cargarse. */
  private controlCapas?: L.Control.Layers;
  private stationsLayer?: L.GeoJSON;

  constructor(
    private http: HttpClient,
    private weatherService: WeatherService,
    private stationService: StationService,
    private datosService: DatosOnlineService,
    private fichaEstacion: FichaEstacionService,
    private dialogRef: MatDialogRef<DatosOnlineComponent>
  ) { }

  ngOnInit(): void {
    // Variable recibida por enlace (la estación ya llega como activa); sólo una de las del selector
    const variable = this.consulta['variable'];
    if (VARIABLES_ONLINE.includes(variable)) this.selectedVariable = variable;

    this.datosService.getEstaciones().subscribe({
      next: data => {
        this.estaciones = data;
        this.loading = false;
        if (this.map) this.addMarkers(this.estaciones);
        this.selectedStationId = this.stationService.activa;
        this.actualizarGrafico();
      },
      error: () => {
        this.error = true;
        this.loading = false;
      }
    });

  }

  ngAfterViewInit(): void {
    this.initMap();
    if (this.map) void cargarProvincias(this.map, this.http, { control: this.controlCapas });
    setTimeout(() => {
      this.selectedStationId = this.stationService.activa;
      this.actualizarGrafico();
    }, 200);
    setTimeout(() => {
      this.map?.invalidateSize();
    }, 250);
  }

  private initMap(): void {
    try {
      const container = document.getElementById('mapDatosOnline');
      if (container) {
        delete (container as HTMLElement & { _leaflet_id?: number })._leaflet_id;
      }

      if (this.map) {
        this.dejarDeSeguirTamanio?.();
        this.map.remove();
        this.map = undefined;
      }

      this.map = L.map('mapDatosOnline', {
        center: [-27, -65],
        zoom: 5,
        preferCanvas: true,
        ...OPCIONES_GESTOS   // gestos táctiles y Ctrl+rueda (ver maps/gestos.ts)
      });
      this.dejarDeSeguirTamanio = seguirTamanioMapa(this.map);

      this.controlCapas = agregarMapaBase(this.map);
      conectarBotonesFicha(this.map, this.fichaEstacion);

      L.control.scale({ imperial: false }).addTo(this.map);
      encuadrarTucuman(this.map);
      leyendaEstados({ color: this.getStationColor(''), forma: 'circulo' }).addTo(this.map);

      // Etiquetas con el valor de cada estación (B5): desde zoom 9; más lejos se superponen
      const mostrarEtiquetas = () => this.map?.getContainer()
        .classList.toggle('con-etiquetas', (this.map?.getZoom() ?? 0) >= ZOOM_ETIQUETAS);
      this.map.on('zoomend', mostrarEtiquetas);
      mostrarEtiquetas();

      if (this.estaciones.length > 0) this.addMarkers(this.estaciones);
      setTimeout(() => this.map!.invalidateSize({ animate: false }), 200);

    } catch (error) {
      console.error('Error al inicializar el mapa:', error);
    }
  }

  private addMarkers(stations: Estacion[]): void {
    if (!this.map || !stations.length) return;
    if (this.stationsLayer) this.map.removeLayer(this.stationsLayer);

    this.stationsLayer = L.geoJSON(
      this.createStationsGeoJSON(stations),
      {
        // Estado de comunicación: atrasada = relleno tenue; sin datos hoy = hueco con borde gris punteado
        pointToLayer: (feature, latlng) => {
          const estado = estadoComunicacion(leerFechaEstacion(feature.properties.fecha_i));
          return L.circleMarker(latlng, {
            radius: 6,
            fillColor: estado === 'sin-datos-hoy' ? '#ffffff' : this.getStationColor(feature.properties.id),
            color: estado === 'sin-datos-hoy' ? '#9ca3af' : 'rgba(0,0,0,.35)',
            dashArray: estado === 'sin-datos-hoy' ? '2 2' : undefined,
            fillOpacity: estado === 'atrasada' ? 0.35 : 0.85,
            weight: estado === 'sin-datos-hoy' ? 1.5 : 1,
            opacity: 1
          });
        },
        onEachFeature: (feature, layer) => {
          layer.on('click', () => {
            this.selectedStationId = feature.properties.id;
            this.stationService.setActiva(this.selectedStationId);
            this.actualizarGrafico();
          });
          const { lat, lng } = (layer as L.CircleMarker).getLatLng();
          layer.bindPopup(this.makePopupHTML(feature.properties, lat, lng));
          layer.bindTooltip(this.etiquetaValor(feature.properties), {
            permanent: true, direction: 'top', offset: [0, -6], className: 'etiqueta-valor', interactive: false
          });
        }
      }
    ).addTo(this.map);
  }

  /** Cambió la variable elegida: las etiquetas del mapa pasan a mostrarla */
  actualizarEtiquetas(): void {
    this.stationsLayer?.eachLayer(layer => {
      const props = (layer as L.CircleMarker).feature?.properties as StationFeatureProperties | undefined;
      if (props) layer.setTooltipContent(this.etiquetaValor(props));
    });
  }

  /** Valor de la variable elegida para la etiqueta; vacío si no hay dato de hoy */
  private etiquetaValor(props: StationFeatureProperties): string {
    if (estadoComunicacion(leerFechaEstacion(props.fecha_i)) === 'sin-datos-hoy') return '';
    // [valor, tipo para validar el rango, unidad, decimales]
    const campos: Record<string, [string | number | null | undefined, 'temp' | 'hum' | 'wind' | 'rain', string, number]> = {
      temp_af: [props.temp_af, 'temp', ' °C', 1],
      hum_af: [props.hum_af, 'hum', ' %', 0],
      lluvia: [props.rr_dia, 'rain', ' mm', 1],
      viento_medio: [props.viento_medio, 'wind', ' km/h', 0],
      viento_max: [props.viento_max, 'wind', ' km/h', 0]
    };
    const campo = campos[this.selectedVariable];
    if (!campo || this.fmt(campo[0], campo[1]) === SIN_DATO) return '';
    return formatDecimal(Number(campo[0]), campo[3]) + campo[2];
  }

  private createStationsGeoJSON(
    st: Estacion[]
  ): FeatureCollection<Point, StationFeatureProperties> {
    const features = st.map(e => ({
      type: 'Feature' as const,
      properties: {
        id: String(e.identificacion),
        nombre: e.nombre,
        fecha_i: e.fecha_i,
        temp_af: e.temp_af,
        hum_af: e.hum_af,
        rr_dia: e.rr_dia,
        viento_medio: e.viento_medio,
        viento_max: e.viento_max,
        alt: e.alt
      },
      geometry: { type: 'Point' as const, coordinates: [e.lon, e.lat] }
    }));

    return { type: 'FeatureCollection' as const, features };
  }

  private getStationColor(id: string): string {
    return '#fcfaa5'; // mismo acento que usás en varios lados
  }

  private makePopupHTML(props: StationFeatureProperties, lat: number, lon: number): string {
    return popupEstacion({
      titulo: props.nombre,
      subtitulos: [`ID: ${props.id} · ${props.alt} msnm`],
      filas: [
        { etiqueta: 'Temperatura', valor: `${this.fmt(props.temp_af, 'temp')} °C` },
        { etiqueta: 'Humedad', valor: `${this.fmt(props.hum_af, 'hum')} %` },
        { etiqueta: 'Lluvia hoy', valor: `${this.fmt(props.rr_dia, 'rain')} mm` },
        { etiqueta: 'Viento medio', valor: `${this.fmt(props.viento_medio, 'wind')} km/h` },
        { etiqueta: 'Ráfaga', valor: `${this.fmt(props.viento_max, 'wind')} km/h` }
      ],
      actualizado: leerFechaEstacion(props.fecha_i),
      ficha: { id: props.id, lat, lon }
    });
  }

  public fmt(v: string | number | null | undefined, kind?: 'temp' | 'hum' | 'wind' | 'rain'): string {
    if (String(v) === '10000' || String(v) === '10000.0') return SIN_DATO;
    if (v == null) return SIN_DATO;

    // Descarta lecturas fuera de rango físico posible (valores de error del sensor,
    // ej. 1802.6 °C / 255 % / 410.4 km/h vistos en producción) en vez de mostrarlas tal cual.
    const n = Number(v);
    if (kind && !isNaN(n)) {
      if (kind === 'temp' && (n < -25 || n > 55)) return SIN_DATO;
      if (kind === 'hum' && (n < 0 || n > 100)) return SIN_DATO;
      if (kind === 'wind' && (n < 0 || n > 390)) return SIN_DATO;
      if (kind === 'rain' && (n < 0 || n > 400)) return SIN_DATO;
    }
    return formatValor(v);
  }
  /** Cierra el diálogo */
  public closeWindow(): void {
    this.dialogRef.close();
  }

  actualizarGrafico() {
    if (!this.selectedStationId) return;

    const hoy = new Date();
    const ayer = new Date(); ayer.setDate(hoy.getDate() - 1);

    const fechas = [this.formatDate(ayer), this.formatDate(hoy)];
    this.fechasPeriodo = `${this.formatFechaDMY(fechas[0])} a ${this.formatFechaDMY(fechas[1])}`;

    Promise.all(
      fechas.map((f: string) =>                       // ← f tipado
        this.weatherService
          .getWeatherDataHourly<HourlyWeatherRow>(f, this.selectedStationId)
          .toPromise()
      )
    ).then(respuestas => {

      // 1. inyectar la fecha en cada fila
      const datos: ChartWeatherRow[] = respuestas.flatMap((resp, idx: number) =>
        (resp?.data ?? []).map((d) => ({
          ...d,
          fecha: fechas[idx],                        // «2025-07-25»
          timestamp: new Date(`${fechas[idx]}T${d.hora}`)
        }))
      );

      // 2. ordenar por timestamp completo
      datos.sort((a, b) =>
        a.timestamp.getTime() - b.timestamp.getTime()
      );

      this.chartData = datos;
      this.crearGrafico(datos, this.selectedVariable);
    });
  }


  private variableColor(variable: string): string {
    switch (variable) {
      case 'temp_af': return VAR_COLOR.temp;
      case 'hum_af': return VAR_COLOR.humedad;
      case 'presion': return VAR_COLOR.presion;
      case 'lluvia': return VAR_COLOR.lluvia;
      case 'viento_medio': return VAR_COLOR.viento;
      case 'viento_max': return VAR_COLOR.rafaga;
      default: return VAR_COLOR.normal;
    }
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
    this.dejarDeSeguirTamanio?.();
    this.map?.remove();
  }

  getLabel(variable: string): string {
    switch (variable) {
      case 'temp_af': return 'Temperatura (°C)';
      case 'hum_af': return 'Humedad relativa (%)';
      case 'presion': return 'Presión (hPa)';
      case 'lluvia': return 'Lluvia (mm)';
      case 'viento_medio': return 'Viento (km/h)';
      case 'viento_max': return 'Ráfagas (km/h)';
      default: return variable;
    }
  }

  /** Tipo de magnitud para aplicar en el gráfico los mismos rangos válidos que usa la tabla (fmt). */
  private variableKind(variable: string): 'temp' | 'hum' | 'wind' | 'rain' | undefined {
    switch (variable) {
      case 'temp_af': return 'temp';
      case 'hum_af': return 'hum';
      case 'lluvia': return 'rain';
      case 'viento_medio':
      case 'viento_max': return 'wind';
      default: return undefined;   // presión: solo se descarta el 10000
    }
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = ('0' + (date.getMonth() + 1)).slice(-2);
    const day = ('0' + date.getDate()).slice(-2);
    return `${year}-${month}-${day}`;
  }

  crearGrafico(datos: ChartWeatherRow[], variable: string) {
    const canvas = document.getElementById('graficoVariables') as HTMLCanvasElement;
    if (!canvas) return;
    if (this.chart) this.chart.destroy();

    const chartType: ChartType = variable === 'lluvia' ? 'bar' : 'line';
    const kind = this.variableKind(variable);

    // Color de la variable según la paleta común (el mismo que en el resto de los gráficos)
    const root = getComputedStyle(document.documentElement);
    const text = (root.getPropertyValue('--text') || '#111827').trim();
    const muted = (root.getPropertyValue('--muted') || '#6b7280').trim();
    const border = (root.getPropertyValue('--border') || '#e5e7eb').trim();
    const colorLinea = this.variableColor(variable);

    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, conAlfa(colorLinea, .35));
    gradient.addColorStop(1, conAlfa(colorLinea, .04));

    // Los registros que faltan quedan como hueco (no se une la línea) con una franja gris
    const filas = this.conHuecos(datos);
    this.indicesSinRegistro = filas.map((f, i) => (f.fila ? -1 : i)).filter(i => i >= 0);
    const n = this.indicesSinRegistro.length;
    this.textoSinRegistro = n ? `${n} ${n === 1 ? 'registro' : 'registros'} de ${this.textoIntervalo(this.intervaloMs)}` : '';

    const config: ChartConfiguration<ChartType> = {
      type: chartType,
      plugins: [pluginFranjasSinDatos(() => this.indicesSinRegistro)],
      data: {
        labels: filas.map((f) => this.formatHora(f.hora)),
        datasets: [{
          label: this.getLabel(variable),
          data: filas.map(({ fila: d }) => {
            if (!d) return null;
            const value = d[variable as WeatherVariableKey];
            const shown = this.fmt(value, kind);
            return shown === SIN_DATO ? null : Number(value);
          }),
          borderColor: colorLinea,
          backgroundColor: chartType === 'bar' ? conAlfa(colorLinea, .6) : gradient,
          pointBackgroundColor: colorLinea,
          pointBorderColor: '#ffffff',
          pointRadius: 3,
          pointHoverRadius: 5,
          borderWidth: 2,
          tension: 0.3,
          fill: chartType !== 'bar',
          spanGaps: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: { bottom: 24 }
        },
        interaction: { mode: 'nearest', intersect: false },  // tooltip al pasar
        plugins: {
          referencias: { lineas: this.variableKind(variable) === 'temp' ? referenciasHelada() : [] },
          legend: {
            labels: { color: text, font: { size: 12, weight: 'bold' } }
          },
          tooltip: {
            enabled: true,
            backgroundColor: '#111827',
            borderColor: border,
            borderWidth: 1,
            titleColor: '#fff',
            bodyColor: '#fff',
            callbacks: {
              label: ctx => `${this.getLabel(variable)}: ${formatValor(ctx.parsed.y)}`
            }
          }
        },
        scales: {
          x: {
            // Con datos cada 15 min hay cientos de etiquetas: se limita la cantidad visible.
            ticks: { color: muted, maxRotation: 45, minRotation: 45, autoSkip: true, maxTicksLimit: 12 },
            grid: { color: GRID_COLOR },
            title: { display: true, text: 'Hora', color: muted }
          },
          y: {
            ticks: { color: muted },
            grid: { color: GRID_COLOR }
          }
        }
      } as ChartOptions<ChartType>
    };

    this.chart = new Chart<ChartType>(canvas, config);

    // 👇 fuerza recálculo cuando el layout ya terminó
    setTimeout(() => this.chart?.resize(), 50);
    setTimeout(() => this.chart?.resize(), 250);
  }


  get nombreEstacionSeleccionada(): string {
    const est = this.estaciones.find(e => e.identificacion === Number(this.selectedStationId));
    return est ? est.nombre : '';
  }

  /**
   * Filas ordenadas con un lugar vacío por cada registro que falta entre dos existentes,
   * según el intervalo habitual de la estación (la mediana de los pasos entre registros: no
   * todas las estaciones transmiten cada 15 minutos). Guarda ese intervalo en intervaloMs.
   */
  private conHuecos(datos: ChartWeatherRow[]): { hora: string; fila: ChartWeatherRow | null }[] {
    const pasos = datos.slice(1).map((d, i) => d.timestamp.getTime() - datos[i].timestamp.getTime()).filter(p => p > 0);
    const intervalo = pasos.length ? pasos.sort((a, b) => a - b)[Math.floor(pasos.length / 2)] : 15 * 60000;
    this.intervaloMs = intervalo;
    const filas: { hora: string; fila: ChartWeatherRow | null }[] = [];
    datos.forEach((d, i) => {
      if (i > 0) {
        const faltan = Math.round((d.timestamp.getTime() - datos[i - 1].timestamp.getTime()) / intervalo) - 1;
        for (let k = 1; k <= Math.min(faltan, 500); k++) {
          const t = new Date(datos[i - 1].timestamp.getTime() + k * intervalo);
          filas.push({ hora: `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}:00`, fila: null });
        }
      }
      filas.push({ hora: d.hora, fila: d });
    });
    return filas;
  }

  /** Intervalo entre registros en palabras: «15 minutos», «1 hora», «1 h 30 min». */
  private textoIntervalo(ms: number): string {
    const min = Math.max(1, Math.round(ms / 60000));
    if (min < 60) return `${min} ${min === 1 ? 'minuto' : 'minutos'}`;
    const h = Math.floor(min / 60);
    const resto = min % 60;
    if (resto) return `${h} h ${resto} min`;
    return `${h} ${h === 1 ? 'hora' : 'horas'}`;
  }

  private formatHora(horaStr: string): string {
    const [h, m] = horaStr.split(':');
    return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
  }

  private formatFechaDMY(fechaStr: string): string {
    const [a, m, d] = fechaStr.split('-');
    return `${d}-${m}-${a.slice(2)}`;  // corta el año a 2 dígitos
  }

  public formatFecha(fechaCompleta: string): string {
    const [fecha, hora] = fechaCompleta.split(' ');
    return `${this.formatFechaDMY(fecha)} ${this.formatHora(hora)}`;
  }

  /**
   * Último dato de cada estación (la tabla de abajo) en CSV. Es una sola fila por estación, así
   * que entra en la política de descargas; los valores fuera de rango quedan vacíos, como en la tabla.
   */
  descargarTablaCsv(): void {
    const valor = (v: string | number | null | undefined, kind: 'temp' | 'hum' | 'wind' | 'rain'): string => {
      const texto = this.fmt(v, kind);
      return texto === SIN_DATO ? '' : texto;
    };
    const fecha = (f: string): string => {
      const [dia, hora] = (f ?? '').split(' ');
      const [a, m, d] = (dia ?? '').split('-');
      if (!a || !m || !d) return '';
      return hora?.includes(':') ? `${d}/${m}/${a} ${this.formatHora(hora)}` : `${d}/${m}/${a}`;
    };
    const filas: unknown[][] = [
      ['ID', 'Nombre', 'Fecha', 'Temp. (°C)', 'Humedad (%)', 'Precip. (mm)', 'V. Medio (km/h)', 'Ráfaga (km/h)'],
      ...this.estaciones.map(e => [
        String(e.identificacion), e.nombre, fecha(e.fecha_i), valor(e.temp_af, 'temp'), valor(e.hum_af, 'hum'),
        valor(e.rr_dia, 'rain'), valor(e.viento_medio, 'wind'), valor(e.viento_max, 'wind')
      ])
    ];
    descargarCsv('datos-en-tiempo-real-estaciones', filas);
  }
}
