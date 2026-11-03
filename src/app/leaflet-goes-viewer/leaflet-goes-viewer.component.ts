import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';
import { OPCIONES_GESTOS } from '../maps/gestos';
import { seguirTamanioMapa } from '../maps/map-size';
import { encuadrarTucuman, LIMITES_TUCUMAN } from '../maps/encuadre';
import { estadoComunicacion, leerFechaEstacion } from '../shared/estado-estacion';
import { agregarMapaBase, cargarProvincias } from '../maps/mapa-base';
import { conectarBotonesFicha, popupEstacion } from '../maps/popup';
import { FichaEstacionService } from '../services/ficha-estacion.service';
import { leyendaPlegable } from '../maps/leyenda-plegable';
import { formatDecimal } from '../pipes/valor.pipe';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, Subscription } from 'rxjs';
import { WeatherService, WeatherStation } from '../services/weather.service';
import { StationService } from '../services/station.service';
import { FeatureCollection, Feature, Point } from 'geojson';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatOptionModule } from '@angular/material/core';
import { MatIconModule } from '@angular/material/icon';

interface LayerOption {
  name: string;
  url: (date: string, time: string) => string;
  attribution: string;
  isGeoJSON?: boolean;
  isTileLayer?: boolean;
  isCSV?: boolean;
}

interface StationFeatureProperties {
  id: string;
  nombre: string;
  temperatura: string;
  lat: number;
  lon: number;
  altitud: string;
  humedad: string;
  lluvia: string;
  /** fecha_I: hora del último dato */
  actualizado: string;
}

interface FirmsCsvRow {
  latitude: string;
  longitude: string;
  bright_ti4: string;
  confidence: string;
  acq_date?: string;
  acq_time?: string;
}

interface FireFeatureProperties {
  brightness: number;
  confidence: number;
  acq_date: string;
  acq_time: string;
}

type FireGeoJson = FeatureCollection<Point, FireFeatureProperties>;

// Clases de leyendas (sin cambios)
class LegendControl extends L.Control {
  private component: LeafletGoesViewerComponent;

  constructor(component: LeafletGoesViewerComponent, options?: L.ControlOptions) {
    super(options);
    this.component = component;
  }

  override onAdd(_map: L.Map): HTMLElement {
    const div = L.DomUtil.create('div', 'info legend');
    const labels = [];

    labels.push('<strong>Temperatura (°C)</strong>');

    const ranges = [
      { min: 25, max: 45, color: this.component.getColorForTemperature(30) },
      { min: 45, max: 65, color: this.component.getColorForTemperature(50) },
      { min: 65, max: 85, color: this.component.getColorForTemperature(70) },
      { min: 85, max: Infinity, color: this.component.getColorForTemperature(90) }
    ];

    for (const range of ranges) {
      const label = range.max === Infinity
        ? `${range.min}+`
        : `${range.min}–${range.max}`;
      labels.push(
        `<div class="legend-item"><i style="background:${range.color}"></i> ${label}</div>`
      );
    }

    div.innerHTML = labels.join('');
    return leyendaPlegable(div);
  }
}

class TemperatureLegendControl extends L.Control {
  private component: LeafletGoesViewerComponent;

  constructor(component: LeafletGoesViewerComponent, options?: L.ControlOptions) {
    super(options);
    this.component = component;
  }

  override onAdd(_map: L.Map): HTMLElement {
    const div = L.DomUtil.create('div', 'info legend');
    div.innerHTML = '<strong>Temperatura (°C)</strong>';

    // Usar los stops exactos de OpenWeatherMap
    const stops = [
      { limit: -65, color: 'rgba(130, 22, 146, 1)' },
      { limit: -55, color: 'rgba(130, 22, 146, 1)' },
      { limit: -45, color: 'rgba(130, 22, 146, 1)' },
      { limit: -40, color: 'rgba(130, 22, 146, 1)' },
      { limit: -30, color: 'rgba(130, 87, 219, 1)' },
      { limit: -20, color: 'rgba(32, 140, 236, 1)' },
      { limit: -10, color: 'rgba(32, 196, 232, 1)' },
      { limit: 0, color: 'rgba(35, 221, 221, 1)' },
      { limit: 10, color: 'rgba(194, 255, 40, 1)' },
      { limit: 20, color: 'rgba(255, 240, 40, 1)' },
      { limit: 25, color: 'rgba(255, 194, 40, 1)' },
      { limit: 30, color: 'rgba(252, 128, 20, 1)' }
    ];

    for (let i = 0; i < stops.length - 1; i++) {
      const from = stops[i].limit;
      const to = stops[i + 1].limit;
      const color = stops[i].color;

      const label = i === stops.length - 2 ? `${from}+` : `${from}–${to}`;
      div.innerHTML += `
        <div class="legend-item">
          <i style="background:${color}"></i> ${label}
        </div>
      `;
    }

    return leyendaPlegable(div);
  }
}

class PrecipitationLegendControl extends L.Control {
  override onAdd(_map: L.Map): HTMLElement {
    const div = L.DomUtil.create('div', 'info legend');
    div.innerHTML = '<strong>Precipitación (mm)</strong><br>';

    // Usar los stops exactos de OpenWeatherMap
    const stops = [
      { limit: 0, color: 'rgba(225, 200, 100, 0)' },
      { limit: 0.1, color: 'rgba(200, 150, 150, 0)' },
      { limit: 0.2, color: 'rgba(150, 150, 170, 0)' },
      { limit: 0.5, color: 'rgba(120, 120, 190, 0)' },
      { limit: 1, color: 'rgba(110, 110, 205, 0.3)' },
      { limit: 10, color: 'rgba(80, 80, 225, 0.7)' },
      { limit: 140, color: 'rgba(20, 20, 255, 0.9)' }
    ];

    // Desde el segundo stop: cada fila es el rango entre el stop anterior y el actual
    // (empezando en 0 salía «0–0,1» dos veces).
    for (let i = 1; i < stops.length; i++) {
      const { limit, color } = stops[i];
      let label: string;

      const coma = (n: number) => String(n).replace('.', ',');   // coma decimal, como el resto del sitio
      if (i === stops.length - 1) {
        label = `${coma(stops[i - 1].limit)}+`;
      } else {
        label = `${coma(stops[i - 1].limit)}–${coma(limit)}`;
      }

      div.innerHTML += `
        <div class="legend-item">
          <i style="background:${color}"></i> ${label}
        </div>
      `;
    }

    return leyendaPlegable(div);
  }
}

class WindLegendControl extends L.Control {
  private component: LeafletGoesViewerComponent;

  constructor(component: LeafletGoesViewerComponent, options?: L.ControlOptions) {
    super(options);
    this.component = component;
  }

  override onAdd(_map: L.Map): HTMLElement {
    const div = L.DomUtil.create('div', 'info legend');
    div.innerHTML = '<strong>Viento (m/s)</strong>';

    // Usar los stops exactos de OpenWeatherMap
    const stops = [
      { limit: 1, color: 'rgba(255, 255, 255, 0)' },
      { limit: 5, color: 'rgba(238, 206, 206, 0.4)' },
      { limit: 15, color: 'rgba(179, 100, 188, 0.7)' },
      { limit: 25, color: 'rgba(63, 33, 59, 0.8)' },
      { limit: 50, color: 'rgba(116, 76, 172, 0.9)' },
      { limit: 100, color: 'rgba(70, 0, 175, 1)' },
      { limit: 200, color: 'rgba(13, 17, 38, 1)' }
    ];

    for (let i = 0; i < stops.length - 1; i++) {
      const from = stops[i].limit;
      const to = stops[i + 1].limit;
      const color = stops[i].color;

      const label = i === stops.length - 2 ? `${from}+` : `${from}–${to}`;
      div.innerHTML += `
        <div class="legend-item">
          <i style="background:${color}"></i> ${label}
        </div>
      `;
    }

    return leyendaPlegable(div);
  }
}

@Component({
  selector: 'app-leaflet-goes-viewer',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatSelectModule,
    MatFormFieldModule,
    MatIconModule,
    MatOptionModule
  ],
  templateUrl: './leaflet-goes-viewer.component.html',
  styleUrls: ['./leaflet-goes-viewer.component.css']
})
export class LeafletGoesViewerComponent implements OnInit, OnDestroy {
  /** Deja de observar el tamaño del contenedor del mapa (ver seguirTamanioMapa). */
  private dejarDeSeguirTamanio?: () => void;
  private map: L.Map | undefined;
  private baseLayer: L.ImageOverlay | L.GeoJSON | L.TileLayer | undefined;
  private legend: L.Control | undefined;
  public selectedLayer: string = 'precipitacion';
  public currentDateTime: string = '';
  public isLoading: boolean = false;
  public errorMessage: string | null = null;
  public loadingGifUrl: string = 'assets/icons/ZKZg.gif';
  public radarIsPlaying: boolean = true;
  public radarFrameDelay: number = 900;
  public radarHasRecentEchoes: boolean | null = null;
  private stationsLayer: L.GeoJSON | undefined;
  public selectedStationId: string | null = null;
  private stations: WeatherStation[] = [];
  private stationServiceSub?: Subscription;
  private rainViewerHost: string = '';
  private rainViewerPath: string = '';
  private rainViewerFrames: Array<{ time: number; path: string }> = [];
  private rainViewerAnimationIndex: number = 0;
  private rainViewerAnimationTimer?: ReturnType<typeof setInterval>;

  // Ancla en el centro inferior, como en Red de estaciones (antes era la esquina y, al resaltar
  // una estación, los demás marcadores se corrían de su lugar)
  private redIcon = L.icon({
    iconUrl: 'assets/icons/red-marker.png',
    iconSize: [25, 25],
    iconAnchor: [12, 25],
    popupAnchor: [0, -20]
  });

  private blueIcon = L.icon({
    iconUrl: 'assets/icons/blue-marker.png',
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -24]
  });

  /** Variantes de los íconos por estado de comunicación (.marcador--* en styles.css) */
  private readonly iconosEstado = new Map<string, L.Icon>();

  private iconoConEstado(base: L.Icon, actualizado: string): L.Icon {
    const estado = estadoComunicacion(leerFechaEstacion(actualizado));
    if (estado === 'al-dia') return base;
    const clave = `${base.options.iconUrl}|${estado}`;
    let icono = this.iconosEstado.get(clave);
    if (!icono) {
      icono = L.icon({ ...base.options, className: `marcador--${estado}` });
      this.iconosEstado.set(clave, icono);
    }
    return icono;
  }

  /** Zona donde se buscan ecos de radar: la provincia de Tucumán. */
  private focusBounds: L.LatLngBounds = LIMITES_TUCUMAN;

  private filterBbox = {
    west: -180,
    south: -90,
    east: 180,
    north: 90
  };

  private openWeatherMapApiKey = 'ea2faa440ccc747a20a042317dadac3f';
  private nasaFirmsMapKey = '05a7411727303e238b4b425a1b7fef16';


  public layers: Record<string, LayerOption> = {
    precipitacion: {
      name: 'Precipitación',
      url: (date: string, time: string) => {
        return `https://tile.openweathermap.org/map/precipitation_new/{z}/{x}/{y}.png?appid=${this.openWeatherMapApiKey}`;
      },
      attribution: 'OpenWeatherMap',
      isTileLayer: true
    },
    nubosidad: {
      name: 'Nubosidad',
      url: (date: string, time: string) => {
        return `https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=${this.openWeatherMapApiKey}`;
      },
      attribution: 'OpenWeatherMap',
      isTileLayer: true
    },
    temperatura: {
      name: 'Temperatura de la Superficie',
      url: (date: string, time: string) => {
        return `https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=${this.openWeatherMapApiKey}`;
      },
      attribution: 'OpenWeatherMap',
      isTileLayer: true
    },
    incendios: {
      name: 'Incendios (VIIRS_NOAA21_NRT)',
      url: (date: string, time: string) => {
        const formattedDate = `${date.substring(0, 4)}-${date.substring(4, 6)}-${date.substring(6, 8)}`;
        return `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${this.nasaFirmsMapKey}/VIIRS_NOAA21_NRT/world/1/${formattedDate}`;
      },
      attribution: 'NASA FIRMS (VIIRS_NOAA21_NRT Fire Data)',
      isCSV: true
    },
    vientos: {
      name: 'Vientos',
      url: (date: string, time: string) => {
        return `https://tile.openweathermap.org/map/wind_new/{z}/{x}/{y}.png?appid=${this.openWeatherMapApiKey}`;
      },
      attribution: 'OpenWeatherMap',
      isTileLayer: true
    }
  };

  constructor(private http: HttpClient,
    private weatherService: WeatherService, // Inyectar servicio
    private stationService: StationService,
    private fichaEstacion: FichaEstacionService
  ) {

  }

  async ngOnInit(): Promise<void> {
    const control = this.initMap();
    // 450: el límite queda sobre las capas de lluvia, nubes, etc. (owmPane, 401) y bajo las estaciones
    if (this.map) await cargarProvincias(this.map, this.http, { control, zIndex: 450 });
    await this.loadStations();
    this.loadLatestData();

    // Sincroniza con la estación elegida en el selector de "Estado actual" (weather-forecast):
    // si cambia desde ahí, resalta el marcador correspondiente en el mapa y actualiza/mueve
    // el popup (si no, quedaba "pegado" en la última estación clickeada manualmente).
    this.stationServiceSub = this.stationService.selectedStation$.subscribe(station => {
      this.selectedStationId = station?.Identificacion ?? null;
      this.highlightSelectedStation();
      this.syncPopupToSelectedStation();
    });

    setTimeout(() => {
      this.map?.invalidateSize();
    }, 200);
  }

  ngOnDestroy(): void {
    this.stopRainViewerAnimation();
    this.dejarDeSeguirTamanio?.();
    this.map?.remove();
    this.stationServiceSub?.unsubscribe();
  }

  private async loadStations(): Promise<void> {
    try {
      const stations = await firstValueFrom(this.weatherService.getStations());
      this.stations = stations;

      this.stationsLayer = L.geoJSON(this.createStationsGeoJSON(stations), {
        pointToLayer: (feature, latlng) =>
          L.marker(latlng, { icon: this.iconoConEstado(this.redIcon, feature.properties.actualizado) }),
        onEachFeature: (feature, layer) => {
          const p = feature.properties;
          layer.bindPopup(popupEstacion({
            titulo: p.nombre,
            subtitulos: [`Lat: ${formatDecimal(p.lat, 2)}° · Lon: ${formatDecimal(p.lon, 2)}° · ${p.altitud} msnm`],
            filas: [
              { etiqueta: 'Temperatura', valor: `${p.temperatura} °C` },
              { etiqueta: 'Humedad', valor: `${p.humedad} %` },
              { etiqueta: 'Lluvia', valor: `${p.lluvia} mm` }
            ],
            actualizado: leerFechaEstacion(p.actualizado),
            ficha: { id: p.id, lat: Number(p.lat), lon: Number(p.lon) }
          }));

          layer.on('click', () => {
            this.selectedStationId = feature.properties.id;
            const marker = layer as L.Marker;
            this.map?.panTo(marker.getLatLng());
            this.highlightSelectedStation();

            const fullStation = this.stations.find(s => s.Identificacion === feature.properties.id);
            if (fullStation) {
              this.stationService.setSelectedStation(fullStation);
            }
          });
        }
      });

      if (this.map) {
        this.stationsLayer.addTo(this.map);
        this.stationsLayer.setZIndex(3);
      }
    } catch {
      this.errorMessage = 'No se pudieron cargar las estaciones';
    }
  }

  private createStationsGeoJSON(stations: WeatherStation[]): FeatureCollection<Point, StationFeatureProperties> {
    return {
      type: 'FeatureCollection',
      features: stations.map(station => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [
            parseFloat(station.lon),  // Mantener como número
            parseFloat(station.lat)   // Mantener como número
          ]
        } as Point,
        properties: {
          id: station.Identificacion,
          nombre: station.nombre,
          // != null (no un simple truthy): 0 °C o 0 mm son datos válidos, no faltantes
          temperatura: station.temp_af != null && station.temp_af !== '' ? formatDecimal(Number(station.temp_af), 1) : '—',
          lat: parseFloat(station.lat),  // Guardar como número
          lon: parseFloat(station.lon),  // Guardar como número
          altitud: station.alt != null ? formatDecimal(Number(station.alt), 0) : '—',
          humedad: station.hum_af != null && station.hum_af !== '' ? formatDecimal(Number(station.hum_af), 0) : '—',
          lluvia: station.RR_dia != null && station.RR_dia !== '' ? formatDecimal(Number(station.RR_dia), 1) : '—',
          actualizado: station.fecha_I ?? ''
        }
      })) as Feature<Point, StationFeatureProperties>[]
    };
  }
  public getStationColor(stationId: string): string {
    return stationId === this.selectedStationId ? '#0084ff' : '#ff0000';
  }

  public highlightSelectedStation(): void {
    if (this.stationsLayer) {
      this.stationsLayer.eachLayer(layer => {
        const marker = layer as L.Marker;
        const props = marker.feature?.properties as StationFeatureProperties | undefined;
        if (!props) return;
        const base = props.id === this.selectedStationId ? this.blueIcon : this.redIcon;
        marker.setIcon(this.iconoConEstado(base, props.actualizado));
      });
    }
  }

  /**
   * Si ya había un popup abierto (de un click manual anterior en el mapa), lo mueve a la
   * estación recién seleccionada en vez de dejarlo "pegado" en la anterior. Si no había
   * ninguno abierto (ej. selección por defecto al cargar la página), no fuerza uno nuevo.
   * Mueve el mapa sólo si la estación elegida quedó fuera de la vista: centrarla siempre
   * desplazaba el encuadre inicial y pisaba lo que el usuario había movido.
   */
  private syncPopupToSelectedStation(): void {
    if (!this.stationsLayer) return;

    let anyPopupWasOpen = false;
    this.stationsLayer.eachLayer(layer => {
      if ((layer as L.Marker).isPopupOpen()) anyPopupWasOpen = true;
    });

    this.stationsLayer.eachLayer(layer => {
      const marker = layer as L.Marker;
      const props = marker.feature?.properties as StationFeatureProperties | undefined;
      if (!props) return;

      if (props.id === this.selectedStationId) {
        if (anyPopupWasOpen) {
          marker.openPopup();
        }
        if (this.map && !this.map.getBounds().contains(marker.getLatLng())) {
          this.map.panTo(marker.getLatLng());
        }
      } else if (marker.isPopupOpen()) {
        marker.closePopup();
      }
    });
  }

  private toggleStations(show: boolean): void {
    if (!this.stationsLayer || !this.map) return;

    if (show) {
      if (!this.map.hasLayer(this.stationsLayer)) {
        this.stationsLayer.addTo(this.map).setZIndex(3);
      }
    } else {
      if (this.map.hasLayer(this.stationsLayer)) {
        this.map.removeLayer(this.stationsLayer);
      }
    }
  }


  /** Devuelve el control de capas del mapa base, para sumarle las provincias. */
  private initMap(): L.Control.Layers | undefined {
    const center: L.LatLng = this.focusBounds.getCenter();
    this.map = L.map('map', {
      center: center,
      zoom: 6,
      ...OPCIONES_GESTOS   // gestos táctiles y Ctrl+rueda (ver maps/gestos.ts)
    });
    this.dejarDeSeguirTamanio = seguirTamanioMapa(this.map);

    // Pane propio para las capas climáticas de OWM: así el filtro CSS de contraste/saturación
    // de cada capa no afecta a las provincias ni a las estaciones (que comparten 'overlayPane').
    this.map.createPane('owmPane');

    // El mapa base tiene zIndex 0: las capas de mosaicos de datos (zIndex 1) quedan encima
    const control = agregarMapaBase(this.map);
    conectarBotonesFicha(this.map, this.fichaEstacion);
    encuadrarTucuman(this.map);
    return control;
  }

  public setLayer(layerKey: string): void {
    this.selectedLayer = layerKey;
    if (layerKey !== 'radar_lluvia') {
      this.stopRainViewerAnimation();
      this.radarHasRecentEchoes = null;
    }
    this.loadLatestData();

    // 👉 Ocultar estaciones solo para “incendios”
    const hideStations = layerKey === 'incendios';
    this.toggleStations(!hideStations);
  }

  private async loadLatestData(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = null;
    this.stopRainViewerAnimation();

    // Remover la capa anterior inmediatamente
    if (this.baseLayer && this.map) {
      this.map.removeLayer(this.baseLayer);
      this.baseLayer = undefined;
    }

    // Remover la leyenda
    if (this.legend && this.map) {
      this.map.removeControl(this.legend);
      this.legend = undefined;
    }

    try {
      const layer = this.layers[this.selectedLayer];
      const currentDate = this.getCurrentDateString();

      if (layer.isGeoJSON) {
        const geojsonUrl = layer.url(currentDate, '');
        const geojsonData = await firstValueFrom(this.http.get<FireGeoJson>(geojsonUrl));
        this.displayGeoJSON(geojsonData, layer.attribution, currentDate);
        return;
      }

      if (layer.isCSV) {
        const csvUrl = layer.url(currentDate, '');
        const csvData = await firstValueFrom(this.http.get(csvUrl, { responseType: 'text' }));
        const geojsonData = this.csvToGeoJSON(csvData);
        this.displayGeoJSON(geojsonData, layer.attribution, currentDate);
        return;
      }

      if (layer.isTileLayer) {
        if (this.selectedLayer === 'radar_lluvia') {
          await this.startRainViewerAnimation(layer.attribution);
          return;
        }

        this.displayTileLayer(layer.url(currentDate, ''), layer.attribution, currentDate);
        return;
      }

      this.errorMessage = `No se encontraron datos para ${layer.name}`;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Desconocido';
      this.errorMessage = 'Error al cargar los datos: ' + errorMessage;
    } finally {
      setTimeout(() => {
        this.isLoading = false;
      }, 500);
    }
  }

  private getCurrentDateString(): string {
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const MM = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(now.getUTCDate()).padStart(2, '0');
    return `${yyyy}${MM}${dd}`;
  }

  public toggleRainViewerAnimation(): void {
    if (this.selectedLayer !== 'radar_lluvia') return;

    if (this.radarIsPlaying) {
      this.stopRainViewerAnimation(false);
      return;
    }

    this.radarIsPlaying = true;
    this.resumeRainViewerAnimation();
  }

  public setRainViewerSpeed(delay: number | string): void {
    this.radarFrameDelay = Number(delay);
    if (this.selectedLayer === 'radar_lluvia' && this.radarIsPlaying) {
      this.resumeRainViewerAnimation();
    }
  }

  private async loadRainViewerFrames(): Promise<Array<{ time: number; path: string }>> {
    const apiUrl = 'https://api.rainviewer.com/public/weather-maps.json';
    const data = await firstValueFrom(this.http.get<any>(apiUrl));

    const host = data?.host;
    const frames = data?.radar?.past ?? [];

    if (!host || !frames.length) {
      throw new Error('RainViewer no devolvió frames de radar');
    }

    const lastFrame = frames[frames.length - 1];
    this.rainViewerHost = host;
    this.rainViewerPath = lastFrame.path;

    return frames.slice(-8).map((frame: { time: number; path: string }) => ({
      time: frame.time,
      path: frame.path
    }));
  }

  private buildRainViewerTileUrl(path: string): string {
    return `${this.rainViewerHost}${path}/256/{z}/{x}/{y}/2/1_1.png`;
  }

  private async startRainViewerAnimation(attribution: string): Promise<void> {
    this.rainViewerFrames = await this.loadRainViewerFrames();
    this.radarHasRecentEchoes = null;

    if (!this.rainViewerFrames.length) {
      throw new Error('RainViewer no devolvió frames de radar');
    }

    this.rainViewerAnimationIndex = this.rainViewerFrames.length - 1;
    this.radarIsPlaying = true;
    this.renderRainViewerFrame(attribution);
    this.evaluateRainViewerEchoes();

    if (this.rainViewerFrames.length === 1) {
      this.radarIsPlaying = false;
      return;
    }

    this.resumeRainViewerAnimation();
  }

  private renderRainViewerFrame(attribution: string): void {
    const frame = this.rainViewerFrames[this.rainViewerAnimationIndex];
    if (!frame) return;

    this.currentDateTime = this.formatUnixTimestamp(frame.time);
    this.updateTileLayer(this.buildRainViewerTileUrl(frame.path), attribution);
    this.isLoading = false;

    if (this.legend && this.map) {
      this.map.removeControl(this.legend);
      this.legend = undefined;
    }
  }

  private resumeRainViewerAnimation(): void {
    this.stopRainViewerAnimation(false);

    if (!this.radarIsPlaying || this.rainViewerFrames.length <= 1) {
      return;
    }

    this.rainViewerAnimationTimer = setInterval(() => {
      this.rainViewerAnimationIndex =
        (this.rainViewerAnimationIndex + 1) % this.rainViewerFrames.length;
      this.renderRainViewerFrame('RainViewer');
    }, this.radarFrameDelay);
  }

  private stopRainViewerAnimation(resetPlayState: boolean = true): void {
    if (this.rainViewerAnimationTimer) {
      clearInterval(this.rainViewerAnimationTimer);
      this.rainViewerAnimationTimer = undefined;
    }

    if (resetPlayState) {
      this.radarIsPlaying = false;
    }
  }

  private formatUnixTimestamp(unixTime: number): string {
    const date = new Date(unixTime * 1000);
    const dd = String(date.getUTCDate()).padStart(2, '0');
    const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = date.getUTCFullYear();
    const hh = String(date.getUTCHours()).padStart(2, '0');
    const min = String(date.getUTCMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${min} UTC`;
  }

  private async evaluateRainViewerEchoes(): Promise<void> {
    try {
      this.radarHasRecentEchoes = await this.detectRainViewerEchoesInFocusArea();
    } catch {
      this.radarHasRecentEchoes = null;
    }
  }

  private async detectRainViewerEchoesInFocusArea(): Promise<boolean> {
    const framesToCheck = this.rainViewerFrames.slice(-4);
    const bounds = this.focusBounds;
    const samplePoints = [
      bounds.getCenter(),
      bounds.getNorthWest(),
      bounds.getNorthEast(),
      bounds.getSouthWest(),
      bounds.getSouthEast()
    ];
    const zoom = 6;

    for (const frame of framesToCheck) {
      for (const point of samplePoints) {
        const { x, y } = this.latLngToTile(point.lat, point.lng, zoom);
        const tileUrl = `${this.rainViewerHost}${frame.path}/256/${zoom}/${x}/${y}/2/1_1.png`;
        const hasEcho = await this.tileHasVisibleRadar(tileUrl);
        if (hasEcho) {
          return true;
        }
      }
    }

    return false;
  }

  private latLngToTile(lat: number, lng: number, zoom: number): { x: number; y: number } {
    const latRad = (lat * Math.PI) / 180;
    const n = Math.pow(2, zoom);
    const x = Math.floor(((lng + 180) / 360) * n);
    const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
    return { x, y };
  }

  private tileHasVisibleRadar(url: string): Promise<boolean> {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            resolve(false);
            return;
          }

          ctx.drawImage(img, 0, 0);
          const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
          let opaquePixels = 0;

          for (let i = 3; i < data.length; i += 4) {
            if (data[i] > 24) {
              opaquePixels += 1;
              if (opaquePixels > 50) {
                resolve(true);
                return;
              }
            }
          }

          resolve(false);
        } catch {
          resolve(false);
        }
      };

      img.onerror = () => resolve(false);
      img.src = url;
    });
  }

  public getColorForTemperature(temperature: number): string {
    if (temperature > 85) return '#ff0000';
    if (temperature > 65) return '#ff8000';
    if (temperature > 45) return '#ffff00';
    return '#00ff00';
  }

  private csvToGeoJSON(csv: string): FireGeoJson {
    if (!csv || csv.trim() === '') {
      return { type: 'FeatureCollection', features: [] };
    }

    const lines = csv.trim().split('\n');
    if (lines.length <= 1) {
      return { type: 'FeatureCollection', features: [] };
    }

    const headers = lines[0].split(',').map(header => header.trim());
    const features: Feature<Point, FireFeatureProperties>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = line.split(',').map(value => value.trim());
      if (values.length !== headers.length) {
        continue;
      }

      const row = {} as Record<string, string>;
      headers.forEach((header, index) => {
        row[header] = values[index];
      });
      const csvRow = row as unknown as FirmsCsvRow;

      const lat = parseFloat(csvRow.latitude);
      const lon = parseFloat(csvRow.longitude);
      if (isNaN(lat) || isNaN(lon)) {
        continue;
      }

      if (
        lon < this.filterBbox.west ||
        lon > this.filterBbox.east ||
        lat < this.filterBbox.south ||
        lat > this.filterBbox.north
      ) {
        continue;
      }

      const brightnessKelvin = parseFloat(csvRow.bright_ti4);
      const brightnessCelsius = brightnessKelvin - 273.15;
      const confidence = csvRow.confidence === 'h' ? 100 : csvRow.confidence === 'n' ? 50 : parseInt(csvRow.confidence);
      if (isNaN(brightnessCelsius) || isNaN(confidence)) {
        continue;
      }

      const feature: Feature<Point, FireFeatureProperties> = {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [lon, lat]
        },
        properties: {
          brightness: brightnessCelsius,
          confidence: confidence,
          acq_date: csvRow.acq_date || 'Desconocido',
          acq_time: csvRow.acq_time || 'Desconocido'
        }
      };
      features.push(feature);
    }

    return {
      type: 'FeatureCollection',
      features: features
    };
  }

  private displayGeoJSON(geojson: FireGeoJson, attribution: string, date: string): void {
    this.currentDateTime = `${date.substring(6, 8)}/${date.substring(4, 6)}/${date.substring(0, 4)}`;
    this.updateGeoJSONLayer(geojson, attribution);
    this.addLegend();
    this.isLoading = false;
  }

  private displayTileLayer(url: string, attribution: string, date: string): void {
    this.currentDateTime = `${date.substring(6, 8)}/${date.substring(4, 6)}/${date.substring(0, 4)}`;
    this.updateTileLayer(url, attribution);
    this.isLoading = false;

    if (this.selectedLayer === 'temperatura') {
      this.addTemperatureLegend();
    } else if (this.selectedLayer === 'precipitacion') {
      this.addPrecipitationLegend();
    } else if (this.selectedLayer === 'vientos') {
      this.addWindLegend();
    } else if (this.selectedLayer === 'radar_lluvia') {
      if (this.legend && this.map) {
        this.map.removeControl(this.legend);
        this.legend = undefined;
      }
    } else if (this.legend && this.map) {
      this.map.removeControl(this.legend);
      this.legend = undefined;
    }
  }

  private addTemperatureLegend(): void {
    if (!this.map) return;
    if (this.legend) {
      this.map.removeControl(this.legend);
      this.legend = undefined;
    }
    this.legend = new TemperatureLegendControl(this, { position: 'bottomright' });
    this.legend.addTo(this.map);
    this.appendLegendStyle();
  }

  private addPrecipitationLegend(): void {
    if (!this.map) return;
    if (this.legend) {
      this.map.removeControl(this.legend);
      this.legend = undefined;
    }
    this.legend = new PrecipitationLegendControl({ position: 'bottomright' });
    this.legend.addTo(this.map);
    this.appendLegendStyle();
  }

  private addWindLegend(): void {
    if (!this.map) return;
    if (this.legend) {
      this.map.removeControl(this.legend);
      this.legend = undefined;
    }
    this.legend = new WindLegendControl(this, { position: 'bottomright' });
    this.legend.addTo(this.map);
    this.appendLegendStyle();
  }

  private addLegend(): void {
    if (!this.map) return;
    this.legend = new LegendControl(this, { position: 'bottomright' });
    this.legend.addTo(this.map);
    this.appendLegendStyle();
  }

  private appendLegendStyle(): void {
    if (document.getElementById('leaflet-goes-viewer-legend-style')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'leaflet-goes-viewer-legend-style';
    style.innerHTML = `
      .info.legend {
        background: white;
        padding: 6px 8px;
        font: 14px/16px var(--font-sans, Arial, Helvetica, sans-serif);
        box-shadow: 0 0 15px rgba(0,0,0,0.2);
        border-radius: 5px;
        line-height: 18px;
      }
      .legend-item {
        display: flex;
        align-items: left;
        margin-bottom: 4px;
      }
      .info.legend i {
        width: 18px;
        height: 18px;
        margin-right: 8px;
        display: inline-block;
        opacity: 0.7;
        fillOpacity: 0;
      }
    `;
    document.head.appendChild(style);
  }

  private updateGeoJSONLayer(geojson: FireGeoJson, attribution: string): void {
    if (this.baseLayer) {
      this.map?.removeLayer(this.baseLayer);
    }

    if (!geojson.features || geojson.features.length === 0) {
      this.errorMessage = 'No se encontraron datos de incendios para la fecha seleccionada';
      return;
    }

    this.baseLayer = L.geoJSON(geojson, {
      pointToLayer: (feature, latlng) => {
        const brightness = feature.properties.brightness;
        const radius = Math.min(10, Math.max(3, (brightness + 273.15) / 50));
        const color = this.getColorForTemperature(brightness);
        return L.circleMarker(latlng, {
          radius: radius,
          fillColor: color,
          color: color,
          weight: 1,
          opacity: 1,
          fillOpacity: 1
        });
      },
      onEachFeature: (feature, layer) => {
        layer.bindPopup(
          `Brillo: ${formatDecimal(feature.properties.brightness, 2)} °C<br>` +
          `Confianza: ${feature.properties.confidence}%<br>` +
          `Fecha: ${feature.properties.acq_date} ${feature.properties.acq_time}`
        );
      },
      attribution: attribution
    });

    this.baseLayer.addTo(this.map!);
  }

  /**
   * Opacidad y filtro CSS (contraste/saturación) por capa climática de OpenWeatherMap,
   * ajustados para que coincidan con el criterio visual afinado en la app móvil:
   * - temperatura: se muestra tal cual la entrega OWM (escala regional propia).
   * - nubosidad: en escala de grises para no competir visualmente con el mapa base.
   * - vientos: contraste/saturación realzados para distinguir mejor las zonas de calma.
   * - precipitación: contraste y saturación al máximo (la capa más débil de origen).
   * Equivalencia usada: filter contrast()/saturate() = 1 + valor Mapbox raster-contrast/-saturation
   * (0 = neutro/sin cambios en ambos sistemas).
   */
  private estiloParaCapa(layerKey: string): { opacity: number; filter: string } {
    switch (layerKey) {
      case 'temperatura':
        return { opacity: 0.7, filter: 'none' };
      case 'nubosidad':
        return { opacity: 0.9, filter: 'saturate(0)' };
      case 'vientos':
        return { opacity: 1, filter: 'contrast(1.55) saturate(1.7)' };
      case 'precipitacion':
        return { opacity: 1, filter: 'contrast(2) saturate(2)' };
      default:
        return { opacity: 1, filter: 'none' };
    }
  }

  private updateTileLayer(url: string, attribution: string): void {
    if (this.baseLayer) {
      this.map?.removeLayer(this.baseLayer);
    }

    const estilo = this.estiloParaCapa(this.selectedLayer);

    const tileOptions: L.TileLayerOptions = {
      attribution: attribution,
      opacity: estilo.opacity,
      maxZoom: 18,
      pane: 'owmPane'
    };

    if (this.selectedLayer === 'radar_lluvia') {
      tileOptions.maxNativeZoom = 7;
      tileOptions.maxZoom = 18;
    }

    this.baseLayer = L.tileLayer(url, tileOptions);

    this.baseLayer.on('error', () => {
      this.errorMessage = 'Error al cargar la capa';
    });

    this.baseLayer.addTo(this.map!);
    this.baseLayer.setOpacity(estilo.opacity);

    if (this.map && this.baseLayer instanceof L.TileLayer) {
      const pane = this.baseLayer.getPane();
      if (pane) {
        pane.style.zIndex = '401';
        pane.style.filter = estilo.filter;
      }
    }
  }

  get layerKeys(): string[] {
    return Object.keys(this.layers);
  }
}
