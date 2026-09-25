import { Component, OnInit, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import * as L from 'leaflet';
import { WeatherService, WeatherStation } from '../services/weather.service';

interface StationRow extends WeatherStation {
  temp: number | null;
  hum: number | null;
  rain: number | null;
  updated: Date | null;
}

const ZONA_LABELS: Record<string, string> = {
  '1': 'Llanura Tucumana',
  '2': 'Pedemonte Tucumano',
  '3': 'Valles Intermontanos',
  '4': 'Valles Intermontanos',
  '5': 'Provincias Adyacentes'
};

@Component({
  selector: 'app-estaciones',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './estaciones.component.html',
  styleUrl: './estaciones.component.css'
})
export class EstacionesComponent implements OnInit, AfterViewInit {
  stations: StationRow[] = [];
  loading = true;
  error: string | null = null;
  selectedStationId: string | null = null;

  private map: L.Map | undefined;
  private markers = new Map<string, L.Marker>();

  private readonly focusBounds: L.LatLngBounds = L.latLngBounds(
    L.latLng(-25.994679, -66.390178),
    L.latLng(-28.092109, -63.895287)
  );

  private readonly redIcon = L.icon({
    iconUrl: 'assets/icons/red-marker.png',
    iconSize: [25, 25],
    iconAnchor: [12, 25],
    popupAnchor: [0, -20]
  });

  private readonly blueIcon = L.icon({
    iconUrl: 'assets/icons/blue-marker.png',
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -24]
  });

  constructor(private weatherService: WeatherService) { }

  ngOnInit(): void {
    this.weatherService.getStationsAll().subscribe({
      next: (stations) => {
        this.stations = stations
          .filter(s => (s.habilitada ?? 0) > 0)
          .map(s => this.toRow(s))
          .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
        this.loading = false;
        this.renderMarkers();
      },
      error: () => {
        this.error = 'No se pudo cargar la red de estaciones';
        this.loading = false;
      }
    });
  }

  ngAfterViewInit(): void {
    this.initMap();
  }

  get totalCount(): number {
    return this.stations.length;
  }

  zonaLabel(zona?: string): string {
    return zona ? (ZONA_LABELS[zona] ?? '') : '';
  }

  locationLabel(station: WeatherStation): string {
    return [station.Localidad || station.nombre, station.departamento, station.provincia]
      .filter(Boolean)
      .join(', ');
  }

  private toRow(s: WeatherStation): StationRow {
    const temp = parseFloat(s.temp_af ?? '');
    const hum = parseFloat(s.hum_af ?? '');
    const rain = parseFloat(s.RR_dia ?? '');
    return {
      ...s,
      // Descarta lecturas fuera de rango físico posible (valores de error del sensor,
      // ej. 1802.6 °C / 255 % vistos en producción) en vez de mostrarlas tal cual.
      temp: isNaN(temp) || temp < -25 || temp > 55 ? null : temp,
      hum: isNaN(hum) || hum < 0 || hum > 100 ? null : hum,
      rain: isNaN(rain) || rain < 0 || rain > 400 ? null : rain,
      updated: s.fecha_I ? new Date(s.fecha_I) : null
    };
  }

  private initMap(): void {
    this.map = L.map('estaciones-map', {
      center: this.focusBounds.getCenter(),
      zoom: 7,
      scrollWheelZoom: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 18
    }).addTo(this.map);

    this.map.fitBounds(this.focusBounds);

    this.map.getContainer().addEventListener('wheel', (e: WheelEvent) => {
      if (e.ctrlKey) {
        this.map?.scrollWheelZoom.enable();
      } else {
        this.map?.scrollWheelZoom.disable();
      }
    });

    setTimeout(() => this.map?.invalidateSize(), 150);
    this.renderMarkers();
  }

  private renderMarkers(): void {
    if (!this.map || !this.stations.length) return;

    this.markers.forEach(marker => marker.remove());
    this.markers.clear();

    this.stations.forEach(station => {
      const lat = parseFloat(station.lat);
      const lon = parseFloat(station.lon);
      if (isNaN(lat) || isNaN(lon)) return;

      const marker = L.marker([lat, lon], {
        icon: this.redIcon
      }).addTo(this.map!);

      const location = this.locationLabel(station);
      const zona = this.zonaLabel(station.zona);
      const altura = station.alt != null ? station.alt + ' msnm' : 'S/D';

      marker.bindPopup(`
        <div class="station-popup">
          <h4>${station.nombre}</h4>
          ${location ? `<div class="popup-location">${location}${zona ? ' · ' + zona : ''}</div>` : ''}
          <div class="popup-location popup-location--coords">Lat ${lat.toFixed(4)}° · Lon ${lon.toFixed(4)}° · ${altura}</div>
          <div class="popup-grid">
            <div>Temperatura: ${station.temp !== null ? station.temp.toFixed(1) + ' °C' : 'S/D'}</div>
            <div>Humedad: ${station.hum !== null ? station.hum.toFixed(0) + ' %' : 'S/D'}</div>
            <div>Lluvia hoy: ${station.rain !== null ? station.rain.toFixed(1) + ' mm' : 'S/D'}</div>
          </div>
        </div>
      `, { autoPanPadding: [24, 24] });

      marker.on('click', () => this.selectStation(station.Identificacion));

      if (station.Identificacion) {
        this.markers.set(station.Identificacion, marker);
      }
    });
  }

  selectStation(id: string): void {
    this.selectedStationId = id;
    const station = this.stations.find(s => s.Identificacion === id);
    const marker = this.markers.get(id);

    if (!station || !marker || !this.map) return;

    this.markers.forEach(m => m.setIcon(this.redIcon));
    marker.setIcon(this.blueIcon);

    const lat = parseFloat(station.lat);
    const lon = parseFloat(station.lon);
    if (!isNaN(lat) && !isNaN(lon)) {
      // Sin animación: así el mapa ya está en su posición final cuando abrimos el popup
      // y el autoPan de Leaflet calcula bien si hace falta correrlo más para que no se corte.
      this.map.setView([lat, lon], 10, { animate: false });
    }
    marker.openPopup();
  }
}
