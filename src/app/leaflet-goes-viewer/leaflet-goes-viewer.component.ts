import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import * as L from 'leaflet';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { GeoJsonObject } from 'geojson';
import { WeatherForecastComponent } from '../weather-forecast/weather-forecast.component';
import { WeatherService } from '../services/weather.service'; // Añadir este import
import { FeatureCollection, Feature, Geometry } from 'geojson';

interface LayerOption {
  name: string;
  url: (date: string, time: string) => string;
  attribution: string;
  isGeoJSON?: boolean;
  isTileLayer?: boolean;
  isCSV?: boolean;
}

interface BaseMapOption {
  name: string;
  url: string;
  attribution: string;
  maxZoom: number;
}

// Clases de leyendas (sin cambios)
class LegendControl extends L.Control {
  private component: LeafletGoesViewerComponent;
  
  constructor(component: LeafletGoesViewerComponent, options?: L.ControlOptions) {
    super(options);
    this.component = component;
  }

  override onAdd(_map: L.Map): HTMLElement {
    const div = L.DomUtil.create('div', 'info legend');
    const grades = [25, 45, 65, 85];
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
    return div;
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

    const grades = [-40, -35, -30, -25, -20, -15, -10, -5,
                     0,   5,   10,  15,  20,  25,  30,  35,  40];
    const colors = [
      '#0000FF', // -40
      '#0033FF', // -35
      '#0066FF', // -30
      '#0099FF', // -25
      '#00CCFF', // -20
      '#00FFFF', // -15
      '#33FFCC', // -10
      '#66FF99', // -5
      '#99FF66', // 0
      '#CCFF33', // 5
      '#FFFF00', // 10
      '#FFCC00', // 15
      '#FFA500', // 20
      '#FF8000', // 25
      '#FF5500', // 30
      '#FF2A00', // 35
      '#FF0000'  // 40
    ];

    const title = '<strong>Temperatura (°C)</strong>';
    div.innerHTML = title;

    for (let i = 0; i < grades.length - 1; i++) {
      const from = grades[i];
      const to = grades[i + 1];
      const color = colors[i];

      const label = `${from}—${to}`;
      div.innerHTML += `
        <div class="legend-item">
          <i style="background:${color}"></i> ${label}
        </div>
      `;
    }

    const lastValue = grades[grades.length - 1];
    const lastColor = colors[colors.length - 1];
    div.innerHTML += `
      <div class="legend-item">
        <i style="background:${lastColor}"></i> ${lastValue}+
      </div>
    `;

    return div;
  }
}

class PrecipitationLegendControl extends L.Control {
  private component: LeafletGoesViewerComponent;

  constructor(component: LeafletGoesViewerComponent, options?: L.ControlOptions) {
    super(options);
    this.component = component;
  }

  override onAdd(_map: L.Map): HTMLElement {
    const div = L.DomUtil.create('div', 'info legend');

    const grades = [0, 0.1, 0.2, 0.5, 1, 10, 140];
    const colors = [
      'rgba(240, 240, 255, 0.1)', // 0-0.1 mm
      'rgba(220, 220, 255, 0.2)', // 0.1-0.2 mm
      'rgba(200, 200, 255, 0.3)', // 0.2-0.5 mm
      'rgba(180, 180, 255, 0.4)', // 0.5-1 mm
      'rgba(160, 160, 255, 0.5)', // 1-10 mm
      'rgba(100, 100, 255, 0.7)', // 10+ mm
      'rgba(50, 50, 255, 0.9)'    // 140+ mm
    ];

    const title = '<strong>Precipitación (mm)</strong>';
    div.innerHTML = title;

    for (let i = 0; i < grades.length - 1; i++) {
      const from = grades[i];
      const to = grades[i + 1];
      const color = colors[i];

      const label = i === grades.length - 2 ? `${from}+` : `${from}–${to}`;
      div.innerHTML += `
        <div class="legend-item">
          <i style="background:${color}"></i> ${label}
        </div>
      `;
    }

    return div;
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

    const grades = [1, 5, 15, 25, 50, 100, 200];
    const colors = [
      'rgba(255, 255, 255, 0)',     // 1-5 m/s
      'rgba(238, 206, 206, 0.4)',   // 5-15 m/s
      'rgba(179, 100, 188, 0.7)',   // 15-25 m/s
      'rgba(63, 33, 59, 0.8)',      // 25-50 m/s
      'rgba(116, 76, 172, 0.9)',    // 50-100 m/s
      'rgba(70, 0, 175, 1)',        // 100-200 m/s
      'rgba(13, 17, 38, 1)'         // 200+ m/s
    ];

    const title = '<strong>Viento (m/s)</strong>';
    div.innerHTML = title;

    for (let i = 0; i < grades.length - 1; i++) {
      const from = grades[i];
      const to = grades[i + 1];
      const color = colors[i];

      const label = i === grades.length - 2 ? `${from}+` : `${from}–${to}`;
      div.innerHTML += `
        <div class="legend-item">
          <i style="background:${color}"></i> ${label}
        </div>
      `;
    }

    return div;
  }
}

@Component({
  selector: 'app-leaflet-goes-viewer',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    WeatherForecastComponent,
  ],
  templateUrl: './leaflet-goes-viewer.component.html',
  styleUrls: ['./leaflet-goes-viewer.component.css']
})
export class LeafletGoesViewerComponent implements OnInit {
  private map: L.Map | undefined;
  private baseLayer: L.ImageOverlay | L.GeoJSON | L.TileLayer | undefined;
  private baseMapLayer: L.TileLayer | undefined; // Mapa base
  private legend: L.Control | undefined;
  private provincesLayer: L.GeoJSON | undefined;
  public selectedLayer: string = 'precipitacion';
  public selectedBaseMap: string = 'satellite'; // Mapa satelital por defecto
  public currentDateTime: string = '';
  public isLoading: boolean = false;
  public errorMessage: string | null = null;
  public loadingGifUrl: string = 'assets/icons/ZKZg.gif';
  private stationsLayer: L.GeoJSON | undefined;
  public selectedStationId: string | null = null;

  private focusBounds: L.LatLngBounds = L.latLngBounds(
    L.latLng(-25.994679, -66.390178),
    L.latLng(-28.092109, -63.895287)
  );

  private filterBbox = {
    west: -180,
    south: -90,
    east: 180,
    north: 90
  };

  private openWeatherMapApiKey = 'ea2faa440ccc747a20a042317dadac3f';
  private nasaFirmsMapKey = '05a7411727303e238b4b425a1b7fef16';

  public baseMaps: Record<string, BaseMapOption> = {
    satellite: {
      name: 'Satelital',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles © Esri',
      maxZoom: 18
    },
    osm: {
      name: 'OSM Estándar',
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '© OpenStreetMap',
      maxZoom: 19
    }
  };

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
    private weatherService: WeatherService // Inyectar servicio
) {
    
  }

  async ngOnInit(): Promise<void> {
    this.initMap();
    await this.loadProvinces();
    await this.loadStations(); // Nuevo método
    this.loadLatestData();
  }

  private async loadStations(): Promise<void> {
    try {
      const stations = await firstValueFrom(
        this.weatherService.getStations() // Usar servicio existente
      );

      this.stationsLayer = L.geoJSON(this.createStationsGeoJSON(stations), {
        pointToLayer: (feature, latlng) => {
          return L.circleMarker(latlng, {
            radius: 6,
            fillColor: this.getStationColor(feature.properties.id),
            color: '#333',
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8
          });
        },
        onEachFeature: (feature, layer) => {
          layer.bindPopup(`
            <div class="station-popup">
              <h4>${feature.properties.nombre}</h4>
              <div class="popup-grid">
                <div>Latitud: ${feature.properties.lat.toFixed(2)}°</div>
                <div>Longitud: ${feature.properties.lon.toFixed(2)}°</div>
                <div>Altitud: ${feature.properties.altitud} msnm</div>
                <div>Temperatura: ${feature.properties.temperatura} °C</div>
                <div>Humedad: ${feature.properties.humedad}%</div>
                <div>Lluvia: ${feature.properties.lluvia} mm</div>
              </div>
            </div>
          `);
          
          layer.on('click', () => {
            this.selectedStationId = feature.properties.id;
            this.highlightSelectedStation();
          });
        }
      });

      if (this.map) {
        this.stationsLayer.addTo(this.map);
        this.stationsLayer.setZIndex(3);
      }
    } catch (error) {
      console.error('Error cargando estaciones:', error);
    }
  }

  private createStationsGeoJSON(stations: any[]): FeatureCollection {
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
        } as Geometry,
        properties: {
          id: station.Identificacion,
          nombre: station.nombre,
          temperatura: station.temp_af,
          lat: parseFloat(station.lat),  // Guardar como número
          lon: parseFloat(station.lon),  // Guardar como número
          altitud: station.alt ? Number(station.alt).toFixed(0) : 'N/D',
          humedad: station.hum_af,
          lluvia: station.precipitacion || 0
        }
      })) as Feature<Geometry>[]
    };
  }  
  public getStationColor(stationId: string): string {
    return stationId === this.selectedStationId ? '#00ff00' : '#ff0000';
  }

  public highlightSelectedStation(): void {
    if (this.stationsLayer) {
      this.stationsLayer.eachLayer(layer => {
        if (layer instanceof L.CircleMarker) {
          const stationId = (layer.feature as any).properties.id;
          layer.setStyle({
            fillColor: this.getStationColor(stationId)
          });
        }
      });
    }
  }

  private initMap(): void {
    const center: L.LatLng = this.focusBounds.getCenter();
    this.map = L.map('map', {
      center: center,
      zoom: 6,
      maxBounds: this.focusBounds,
      maxBoundsViscosity: 1.0
    });

    // Inicializar con el mapa base seleccionado
    this.setBaseMap(this.selectedBaseMap);
    this.map.fitBounds(this.focusBounds);
  }

  private async loadProvinces(): Promise<void> {
    try {
      const provincesUrl = 'https://wms.ign.gob.ar/geoserver/wfs?request=GetFeature&service=WFS&version=1.1.0&typeName=ign:provincia&outputFormat=application/json';
      const provincesData = await firstValueFrom(
        this.http.get<GeoJsonObject>(provincesUrl)
      );

      this.provincesLayer = L.geoJSON(provincesData, {
        style: {
          color: 'blue',
          weight: 2,
          opacity: 0.8,
          fillOpacity: 0 // Sin relleno para no interferir con la capa de temperaturas
        },
        onEachFeature: (feature, layer) => {
          if (feature.properties && feature.properties.nam) {
            layer.bindPopup(feature.properties.nam);
          }
        }
      });

      if (this.map) {
        this.provincesLayer.addTo(this.map);
        this.provincesLayer.setZIndex(2); // Provincias en el frente
      }
    } catch (error) {
      console.error('Error al cargar provincias:', error);
      this.errorMessage = 'No se pudieron cargar los límites provinciales';
    }
  }

  public setLayer(layerKey: string): void {
    this.selectedLayer = layerKey;
    this.loadLatestData();
  }

  public setBaseMap(baseMapKey: string): void {
    this.selectedBaseMap = baseMapKey;

    if (this.baseMapLayer && this.map) {
      this.map.removeLayer(this.baseMapLayer);
    }

    const baseMap = this.baseMaps[baseMapKey];
    this.baseMapLayer = L.tileLayer(baseMap.url, {
      attribution: baseMap.attribution,
      maxZoom: baseMap.maxZoom,
      pane: 'tilePane' // Renderizar en el panel de mapas base (por defecto)
    });

    if (this.map) {
      this.baseMapLayer.addTo(this.map);
      this.baseMapLayer.setZIndex(0); // Mapa base en el fondo
      if (this.baseLayer) {
        this.baseLayer.setZIndex(1); // Capa de datos en medio
      }
      if (this.provincesLayer) {
        this.provincesLayer.setZIndex(2); // Provincias en el frente
      }
    }
  }

  private async loadLatestData(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = null;
    
    await new Promise(resolve => setTimeout(resolve, 50));
  
    if (this.legend && this.map) {
      this.map.removeControl(this.legend);
      this.legend = undefined;
    }
  
    try {
      const layer = this.layers[this.selectedLayer];
      const currentDate = this.getCurrentDateString();
  
      if (layer.isGeoJSON) {
        const geojsonUrl = layer.url(currentDate, '');
        const geojsonData = await firstValueFrom(this.http.get(geojsonUrl));
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
        this.displayTileLayer(layer.url(currentDate, ''), layer.attribution, currentDate);
        return;
      }
  
      this.errorMessage = `No se encontraron datos para ${layer.name}`;
    } catch (error: unknown) {
      console.error('Error al cargar los datos:', error);
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

  public getColorForTemperature(temperature: number): string {
    if (temperature > 85) return '#ff0000';
    if (temperature > 65) return '#ff8000';
    if (temperature > 45) return '#ffff00';
    return '#00ff00';
  }

  private csvToGeoJSON(csv: string): any {
    if (!csv || csv.trim() === '') {
      console.warn('El CSV está vacío');
      return { type: 'FeatureCollection', features: [] };
    }

    const lines = csv.trim().split('\n');
    if (lines.length <= 1) {
      console.warn('El CSV no contiene datos válidos');
      return { type: 'FeatureCollection', features: [] };
    }

    const headers = lines[0].split(',').map(header => header.trim());
    const features = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = line.split(',').map(value => value.trim());
      if (values.length !== headers.length) {
        console.warn(`Fila ${i} tiene un número incorrecto de columnas: ${line}`);
        continue;
      }

      const row: any = {};
      headers.forEach((header, index) => {
        row[header] = values[index];
      });

      const lat = parseFloat(row.latitude);
      const lon = parseFloat(row.longitude);
      if (isNaN(lat) || isNaN(lon)) {
        console.warn(`Fila ${i} tiene latitud o longitud inválida: lat=${row.latitude}, lon=${row.longitude}`);
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

      const brightnessKelvin = parseFloat(row.bright_ti4);
      const brightnessCelsius = brightnessKelvin - 273.15;
      const confidence = row.confidence === 'h' ? 100 : row.confidence === 'n' ? 50 : parseInt(row.confidence);
      if (isNaN(brightnessCelsius) || isNaN(confidence)) {
        console.warn(`Fila ${i} tiene brillo o confianza inválida: bright_ti4=${row.bright_ti4}, confidence=${row.confidence}`);
        continue;
      }

      const feature = {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [lon, lat]
        },
        properties: {
          brightness: brightnessCelsius,
          confidence: confidence,
          acq_date: row.acq_date || 'Desconocido',
          acq_time: row.acq_time || 'Desconocido'
        }
      };
      features.push(feature);
    }

    console.log(`Se procesaron ${features.length} incendios dentro del bbox`);
    return {
      type: 'FeatureCollection',
      features: features
    };
  }

  private displayGeoJSON(geojson: any, attribution: string, date: string): void {
    this.currentDateTime = `${date.substring(6,8)}/${date.substring(4,6)}/${date.substring(0,4)}`;
    this.updateGeoJSONLayer(geojson, attribution);
    this.addLegend();
    this.isLoading = false;
    this.map?.fitBounds(this.focusBounds);
  }

  private displayTileLayer(url: string, attribution: string, date: string): void {
    this.currentDateTime = `${date.substring(6,8)}/${date.substring(4,6)}/${date.substring(0,4)}`;
    this.updateTileLayer(url, attribution);
    this.isLoading = false;

    if (this.selectedLayer === 'temperatura') {
      this.addTemperatureLegend();
    } else if (this.selectedLayer === 'precipitacion') {
      this.addPrecipitationLegend();
    } else if (this.selectedLayer === 'vientos') {
      this.addWindLegend();
    } else if (this.legend && this.map) {
      this.map.removeControl(this.legend);
      this.legend = undefined;
    }
    this.map?.fitBounds(this.focusBounds);
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
    this.legend = new PrecipitationLegendControl(this, { position: 'bottomright' });
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
    const style = document.createElement('style');
    style.innerHTML = `
      .info.legend {
        background: white;
        padding: 6px 8px;
        font: 14px/16px Arial, Helvetica, sans-serif;
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
      }
    `;
    document.head.appendChild(style);
  }

  private updateGeoJSONLayer(geojson: any, attribution: string): void {
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
          `Brillo: ${feature.properties.brightness.toFixed(2)} °C<br>` +
          `Confianza: ${feature.properties.confidence}%<br>` +
          `Fecha: ${feature.properties.acq_date} ${feature.properties.acq_time}`
        );
      },
      attribution: attribution
    });

    this.baseLayer.addTo(this.map!);
    if (this.map && this.baseMapLayer) {
      this.baseMapLayer.setZIndex(0); // Mapa base en el fondo
      this.baseLayer.setZIndex(1); // Capa de datos en medio
      if (this.provincesLayer) {
        this.provincesLayer.setZIndex(2); // Provincias en el frente
      }
    }
  }

private updateTileLayer(url: string, attribution: string): void {
  if (this.baseLayer) {
    this.map?.removeLayer(this.baseLayer);
  }

  this.baseLayer = L.tileLayer(url, {
    attribution: attribution,
    opacity: 1, // Máxima opacidad (sin transparencia)
    maxZoom: 18,
    pane: 'overlayPane' // Asegura renderizado sobre el mapa base
  });

  this.baseLayer.on('error', () => {
    console.error(`Error al cargar la capa de teselas para ${this.selectedLayer}`);
    this.errorMessage = 'Error al cargar la capa';
  });

  this.baseLayer.addTo(this.map!);

  if (this.map) {
    // Asegura que la capa esté encima del mapa base
    (this.baseLayer as any).getPane().style.zIndex = 401; // Mayor que tilePane (zIndex: 200)
  }
// Asegurar el orden de renderizado
  if (this.map && this.baseMapLayer) {
    this.baseMapLayer.setZIndex(0); // Mapa base detrás
    this.baseLayer.setZIndex(1);    // Capa meteorológica encima
    if (this.provincesLayer) {
      this.provincesLayer.setZIndex(2); // Provincias en frente
    }
  }
}

  get layerKeys(): string[] {
    return Object.keys(this.layers);
  }

  get baseMapKeys(): string[] {
    return Object.keys(this.baseMaps);
  }
}