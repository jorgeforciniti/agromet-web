import { Component, OnInit, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import * as L from 'leaflet';
import { DatosOnlineService, Estacion } from '../services/datos-online.service';

// Tipo para las claves de los mapas base
type BaseMapKey = 'satellite' | 'osm';

interface BaseMapOption {
  name: string;
  url: string;
  attribution: string;
  maxZoom: number;
}

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule],
  templateUrl: './datos-online.component.html',
  styleUrls: ['./datos-online.component.css']
})
export class DatosOnlineComponent implements OnInit, AfterViewInit {
  estaciones: Estacion[] = [];
  loading = true;
  error = false;

  private map?: L.Map;
  private baseMapLayer?: L.TileLayer;
  private stationsLayer?: L.GeoJSON;
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
      name: 'Satelital',
      url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
      attribution: '&copy; OpenTopoMap contributors',
      maxZoom: 17
    }
  };

  constructor(
    private datosService: DatosOnlineService,
    private dialogRef: MatDialogRef<DatosOnlineComponent>
  ) {}

  ngOnInit(): void {
    this.datosService.getEstaciones().subscribe({
      next: data => {
        this.estaciones = data;
        this.loading = false;
        if (this.map) this.addMarkers(this.estaciones);
      },
      error: () => {
        this.error = true;
        this.loading = false;
      }
    });
  }

  ngAfterViewInit(): void {
    this.initMap();
  }

  private initMap(): void {
    try {
      const container = document.getElementById('mapDatosOnline');
      if (container) delete (container as any)._leaflet_id;

      if (this.map) {
        this.map.remove();
        this.map = undefined;
      }

      this.map = L.map('mapDatosOnline', {
        zoomControl: true,
        center: [-26.8, -65.2],
        zoom: 7,
        preferCanvas: true
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
            color: '#333',
            weight: 1,
            opacity: 1,
            fillOpacity: 0.8
          }),
        onEachFeature: (feature, layer) =>
          layer.bindPopup(this.makePopupHTML(feature.properties))
      }
    ).addTo(this.map);

    const bounds = this.stationsLayer.getBounds();
    if (bounds.isValid()) this.map.fitBounds(bounds, { padding: [30, 30] });
  }

  private createStationsGeoJSON(
    st: Estacion[]
  ): GeoJSON.FeatureCollection<GeoJSON.Point, any> {
    const features = st.map(e => ({
      type: 'Feature' as const,
      properties: {
        id: e.identificacion,
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
    return '#ff5722';
  }

  private makePopupHTML(props: any): string {
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
    return v === '10000' || v == 10000 ? '---' : (v != null ? String(v) : '');
  }

  /** Cierra el diálogo */
  public closeWindow(): void {
    this.dialogRef.close();
  }

  get baseMapKeys(): BaseMapKey[] {
    return Object.keys(this.baseMaps) as BaseMapKey[];
  }
} 