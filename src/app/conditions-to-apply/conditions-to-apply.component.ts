import { Component, OnInit, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import * as L from 'leaflet';
import { WeatherService } from '../services/weather.service';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { DateAdapter, MAT_DATE_FORMATS, MAT_DATE_LOCALE, NativeDateAdapter } from '@angular/material/core';
import { Injectable } from '@angular/core';

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
  temp_af: number;
  temp_50: number;
  temp_20: number;
  hum_af: number;
  viento_medio: number;
  viento_max: number;
  direccion: string;
  lluvia: number;
  apto?: boolean;
}

// Definir el formato de fechas
export const MY_DATE_FORMATS = {
  parse: {
    dateInput: 'dd/MM/yyyy',
  },
  display: {
    dateInput: 'dd/MM/yyyy',
    monthYearLabel: 'MMM yyyy',
    dateA11yLabel: 'dd/MM/yyyy',
    monthYearA11yLabel: 'MMMM yyyy'
  },
};

// Adaptador de fechas personalizado
@Injectable()
export class DmyDateAdapter extends NativeDateAdapter {
  override parse(value: any): Date | null {
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

@Component({
  selector: 'app-conditions-to-apply',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatDatepickerModule, MatFormFieldModule, MatInputModule],
  providers: [
    { provide: DateAdapter, useClass: DmyDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: MY_DATE_FORMATS },
    { provide: MAT_DATE_LOCALE, useValue: 'es-AR' },
  ],
  templateUrl: './conditions-to-apply.component.html',
  styleUrls: ['./conditions-to-apply.component.css']
})
export class ConditionsToApplyComponent implements OnInit, AfterViewInit {
  estaciones: Estacion[] = [];
  estacionesRecientes: Estacion[] = [];
  loadingEstaciones = true;
  errorEstaciones = false;

  private map?: L.Map;
  private stationsLayer?: L.GeoJSON;

  selectedStation: string = '';
  selectedDate: Date = new Date();
  weatherData: WeatherData[] = [];

  constructor(
    private weatherService: WeatherService,
    private dialogRef: MatDialogRef<ConditionsToApplyComponent>
  ) { }

  ngOnInit(): void {
    this.selectedDate = new Date();
    this.loadStations();
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.initMap(), 0);
  }

  private loadStations(): void {
    this.weatherService.getStationsAll().subscribe({
      next: (data: any[]) => {
        this.estaciones = data.map(item => ({
          identificacion: String(item.Identificacion || item.identificacion),
          nombre: item.nombre,
          lat: parseFloat(item.lat) || 0,
          lon: parseFloat(item.lon) || 0,
          temp_af: parseFloat(item.temp_af) || 0,
          hum_af: parseFloat(item.hum_af) || 0,
          viento_max: parseFloat(item.viento_max) || 0,
          fecha_I: item.fecha_I || item.ultregrecibido
        }));

        const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000);
        this.estacionesRecientes = this.estaciones.filter(est =>
          new Date(est.fecha_I) >= twoHoursAgo
        );

        console.log('🗺️ estacionesRecientes =', this.estacionesRecientes);

        if (this.estacionesRecientes.length > 0) {
          const defaultEst = this.estacionesRecientes.find(est => est.identificacion === '2049');
          this.selectedStation = defaultEst
            ? defaultEst.identificacion
            : this.estacionesRecientes[0].identificacion;
          console.log('🎯 selectedStation inicial =', this.selectedStation);
        }

        this.loadingEstaciones = false;
        this.searchData();

        if (this.map) {
          this.addMarkers(this.estacionesRecientes);
        }
      },
      error: err => {
        console.error('Error cargando estaciones:', err);
        this.errorEstaciones = true;
        this.loadingEstaciones = false;
      }
    });
  }

  public get selectedStationName(): string {
    const est = this.estacionesRecientes.find(e => e.identificacion === this.selectedStation);
    return est ? est.nombre : '';
  }

  public searchData(): void {
    console.log('💡 Al buscar datos, selectedStation =', this.selectedStation);

    if (!this.selectedStation) {
      console.warn('No hay estación seleccionada, abortando la búsqueda.');
      return;
    }

    const formattedDate = this.formatDate(this.selectedDate);
    console.log("Fecha: "+formattedDate)
    this.weatherService
      .getWeatherDataHourly(formattedDate, this.selectedStation)
      .subscribe({
        next: resp => {
          const arr = resp.data || [];
          this.weatherData = arr.map((item: any) => ({
            ...item,
            apto:
              item.temp_af < 30 &&
              item.hum_af > 55 &&
              item.viento_max < 10 &&
              item.lluvia === 0
          }));
        },
        error: err => console.error('Error al obtener datos horarios:', err)
      });
  }

  private initMap(): void {
    const mapId = 'mapConditions';
    const el = document.getElementById(mapId);
    if (!el) {
      console.error('Contenedor de mapa no encontrado:', mapId);
      return;
    }
    if (this.map) this.map.remove();
    this.map = L.map(mapId, { center: [-26.8, -65.2], zoom: 8, preferCanvas: true });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OSM'
    }).addTo(this.map);
  }

  private addMarkers(stations: Estacion[]): void {
    if (!this.map) return;
    if (this.stationsLayer) this.map.removeLayer(this.stationsLayer);
    this.stationsLayer = L.geoJSON(
      {
        type: 'FeatureCollection',
        features: stations.map(est => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [est.lon, est.lat] },
          properties: est
        }))
      } as any,
      {
        pointToLayer: (f, latlng) => {
          const p: any = f.properties;
          const color =
            p.temp_af < 30 && p.hum_af > 55 && p.viento_max < 10
              ? 'green'
              : 'red';
          return L.circleMarker(latlng, {
            radius: 6,
            fillColor: color,
            color: '#000',
            weight: 1,
            fillOpacity: 0.8
          });
        }
      }
    ).addTo(this.map!);
  }

  public closeWindow(): void {
    this.dialogRef.close();
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = ('0' + (date.getMonth() + 1)).slice(-2);
    const day = ('0' + date.getDate()).slice(-2);
    return `${year}-${month}-${day}`;
  }
}