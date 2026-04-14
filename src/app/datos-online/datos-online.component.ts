import { Component, OnInit, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import * as L from 'leaflet';
import { DatosOnlineService, Estacion } from '../services/datos-online.service';
import { ChartType, ChartOptions } from 'chart.js';
import { WeatherService } from '../services/weather.service';
import { Chart } from 'chart.js';
import { HttpClient } from '@angular/common/http';
import { ChartConfiguration } from 'chart.js';
import { FeatureCollection, Point } from 'geojson';

// Tipo para las claves de los mapas base
type BaseMapKey = 'satellite' | 'osm';

interface BaseMapOption {
  name: string;
  url: string;
  attribution: string;
  maxZoom: number;
}

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

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './datos-online.component.html',
  styleUrls: ['./datos-online.component.css']
})
export class DatosOnlineComponent implements OnInit, AfterViewInit {
  chart: Chart | null = null;
  selectedStationId: string = '';
  selectedVariable: string = 'temp_af';
  fechasPeriodo: string = '';

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
  private baseMapLayer?: L.TileLayer;
  private stationsLayer?: L.GeoJSON;
  private ctrlZoomTimeout?: ReturnType<typeof setTimeout>;
  private focusBounds: L.LatLngBounds = L.latLngBounds(
    L.latLng(-25.994679, -66.390178),
    L.latLng(-28.092109, -63.895287)
  );

  public selectedBaseMap: BaseMapKey = 'osm';
  public baseMaps: Record<BaseMapKey, BaseMapOption> = {
    osm: {
      name: 'OSM Estándar',
      url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    },
    satellite: {
      name: 'ESRI Satelital',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles © Esri',
      maxZoom: 17
    }
  };

  constructor(
    private http: HttpClient,
    private weatherService: WeatherService,
    private datosService: DatosOnlineService,
    private dialogRef: MatDialogRef<DatosOnlineComponent>
  ) { }

  ngOnInit(): void {
    this.datosService.getEstaciones().subscribe({
      next: data => {
        this.estaciones = data;
        this.loading = false;
        if (this.map) this.addMarkers(this.estaciones);
        this.selectedStationId = '2049';
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
    this.loadProvincias();
    setTimeout(() => {
      this.selectedStationId = '2049';
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
        this.map.remove();
        this.map = undefined;
      }

      this.map = L.map('mapDatosOnline', {
        center: [-27, -65],
        zoom: 5,
        maxBoundsViscosity: 0.0,
        preferCanvas: true,
        scrollWheelZoom: false  // Desactivar zoom por rueda
      });

      const bm = this.baseMaps[this.selectedBaseMap];
      this.baseMapLayer = L.tileLayer(bm.url, {
        attribution: bm.attribution,
        maxZoom: bm.maxZoom,
        detectRetina: true
      }).addTo(this.map);

      L.control.scale({ imperial: false }).addTo(this.map);
      this.map.fitBounds(this.focusBounds);

      if (this.estaciones.length > 0) this.addMarkers(this.estaciones);
      setTimeout(() => this.map!.invalidateSize({ animate: false }), 200);

      // Mostrar mensaje si gira la rueda sin Ctrl
      this.map.getContainer().addEventListener('wheel', (e: WheelEvent) => {
        if (!e.ctrlKey) {
          this.map?.getContainer().classList.add('ctrl-zoom-message');
          clearTimeout(this.ctrlZoomTimeout);
          this.ctrlZoomTimeout = setTimeout(() => {
            this.map?.getContainer().classList.remove('ctrl-zoom-message');
          }, 1000);
        }
      });

      // Habilitar zoom si Ctrl está presionado
      this.map.getContainer().addEventListener('wheel', (e: WheelEvent) => {
        if (e.ctrlKey) {
          this.map?.scrollWheelZoom.enable();
        } else {
          this.map?.scrollWheelZoom.disable();
        }
      });

    } catch (error) {
      console.error('Error al inicializar el mapa:', error);
    }
  }

  public setBaseMap(key: BaseMapKey): void {
    if (!this.map) return;
    if (this.baseMapLayer) this.map.removeLayer(this.baseMapLayer);
    const bm = this.baseMaps[key];
    this.baseMapLayer = L.tileLayer(bm.url, {
      attribution: bm.attribution,
      maxZoom: bm.maxZoom,
      detectRetina: true
    }).addTo(this.map);
    this.selectedBaseMap = key;
  }

  private addMarkers(stations: Estacion[]): void {
    if (!this.map || !stations.length) return;
    if (this.stationsLayer) this.map.removeLayer(this.stationsLayer);

    this.stationsLayer = L.geoJSON(
      this.createStationsGeoJSON(stations),
      {
        pointToLayer: (feature, latlng) =>
          L.circleMarker(latlng, {
            radius: 6,
            fillColor: this.getStationColor(feature.properties.id),
            color: 'rgba(0,0,0,.35)',
            fillOpacity: 0.85,
            weight: 1,
            opacity: 1
          }),
        onEachFeature: (feature, layer) => {
          layer.on('click', () => {
            this.selectedStationId = feature.properties.id;
            this.actualizarGrafico();
          });
          layer.bindPopup(this.makePopupHTML(feature.properties));
        }
      }
    ).addTo(this.map);

    const bounds = this.stationsLayer.getBounds();
    if (bounds.isValid()) this.map.fitBounds(bounds, { padding: [30, 30] });
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

  private makePopupHTML(props: StationFeatureProperties): string {
    return `
      <div class="station-popup">
        <h4>${props.nombre}</h4>
        <div class="popup-grid">
          <div>ID: ${props.id}</div>
          <div>Altura: ${props.alt} msnm</div>
          <div>Fecha: ${props.fecha_i}</div>
          <div>Temp: ${this.fmt(props.temp_af)} °C</div>
          <div>Hum: ${this.fmt(props.hum_af)}%</div>
          <div>Precip: ${this.fmt(props.rr_dia)} mm</div>
          <div>Viento medio: ${this.fmt(props.viento_medio)} km/h</div>
          <div>Ráfaga: ${this.fmt(props.viento_max)} km/h</div>
        </div>
      </div>`;
  }

  public fmt(v: string | number | null | undefined): string {
    return String(v) === '10000' || String(v) === '10000.0' ? '---' : (v != null ? String(v) : '');
  }
  /** Cierra el diálogo */
  public closeWindow(): void {
    this.dialogRef.close();
  }

  get baseMapKeys(): BaseMapKey[] {
    return Object.keys(this.baseMaps) as BaseMapKey[];
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

    // gradiente y colores
    const root = getComputedStyle(document.documentElement);
    const brand = (root.getPropertyValue('--brand') || '#4f7932').trim();      // verde
    const text = (root.getPropertyValue('--text') || '#111827').trim();
    const muted = (root.getPropertyValue('--muted') || '#6b7280').trim();
    const border = (root.getPropertyValue('--border') || '#e5e7eb').trim();

    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, 'rgba(79,121,50,.35)');
    gradient.addColorStop(1, 'rgba(79,121,50,.04)');

    const colorLinea = brand;

    const config: ChartConfiguration<ChartType> = {
      type: chartType,
      data: {
        labels: datos.map((d) => this.formatHora(d.hora)),
        datasets: [{
          label: this.getLabel(variable),
          data: datos.map((d) => {
            const value = d[variable as WeatherVariableKey];
            return value == null ? null : Number(value);
          }),
          borderColor: colorLinea,
          backgroundColor: chartType === 'bar' ? 'rgba(79,121,50,.25)' : gradient,
          pointBackgroundColor: brand,
          pointBorderColor: '#ffffff',
          pointRadius: 3,
          pointHoverRadius: 5,
          borderWidth: 2,
          tension: 0.3,
          fill: chartType !== 'bar',
          spanGaps: true
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
              label: ctx => `${this.getLabel(variable)}: ${ctx.parsed.y}`
            }
          }
        },
        scales: {
          x: {
            ticks: { color: muted, maxRotation: 45, minRotation: 45 },
            grid: { color: 'rgba(17,24,39,0.06)' },
            title: { display: true, text: 'Hora', color: muted }
          },
          y: {
            ticks: { color: muted },
            grid: { color: 'rgba(17,24,39,0.06)' }
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

  private provinceLayer?: L.GeoJSON;

  /** Llama a esto una vez que el mapa ya esté creado (`initMap()` listo) */
  loadProvincias(): void {
    const url = 'assets/shapes/provincias.geojson';

    this.http.get<GeoJSON.FeatureCollection>(url).subscribe(geojson => {

      /* 1. crea (una sola vez) un pane con z-index bajo            */
      if (!this.map!.getPane('provincePane')) {
        this.map!.createPane('provincePane');
        this.map!.getPane('provincePane')!.style.zIndex = '350';   // overlayPane = 400
      }

      /* 2. elimina capa previa si existía                          */
      if (this.provinceLayer) this.provinceLayer.remove();

      /* 3. pinta toda la colección en ese pane, sin interactividad */
      const style: L.PathOptions = {
        color: '#4fa6ff',
        weight: 2,
        opacity: 0.2
      };

      this.provinceLayer = L.geoJSON(geojson, {
        style,
        pane: 'provincePane',   // ← se dibuja debajo de los markers
        interactive: false      // ← no captura clic ni hover
      }).addTo(this.map!);

      /* 4. ajusta la vista si lo necesitas                          */
      // this.map!.fitBounds(this.provinceLayer.getBounds(), { padding: [20, 20] });
    });
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
} 
