import { Component, OnInit, AfterViewInit, OnDestroy, Inject, Injectable } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import * as L from 'leaflet';
import { Subscription } from 'rxjs';
import { WeatherService } from '../services/weather.service';
import { MatSelectChange } from '@angular/material/select';
import { MatDialogRef } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { FeatureCollection } from 'geojson';
import { CommonModule } from '@angular/common';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MAT_DATE_FORMATS, DateAdapter, NativeDateAdapter } from '@angular/material/core';
import { ViewEncapsulation } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog'; // Añade esta importación

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

export const MY_DATE_FORMATS = {
  parse: { dateInput: 'dd/MM/yyyy' },
  display: {
    dateInput: 'dd/MM/yyyy',
    monthYearLabel: 'MMM yyyy',
    dateA11yLabel: 'dd/MM/yyyy',
    monthYearA11yLabel: 'MMMM yyyy'
  },
};

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
  ],
  providers: [
    { provide: DateAdapter, useClass: DmyDateAdapter }, // Cambiar NativeDateAdapter por DmyDateAdapter
    { provide: MAT_DATE_FORMATS, useValue: MY_DATE_FORMATS },
  ],
  encapsulation: ViewEncapsulation.None
})
export class MapRainComponent implements OnInit, AfterViewInit, OnDestroy {
  hoy: boolean = false;
  form: FormGroup;
  map: any;
  baseMapsList = [
    {
      label: 'OpenStreetMap',
      value: 'osm',
      layer: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: 'OpenStreetMap contributors'
      })
    },
    {
      label: 'ESRI Satelital',
      value: 'esri',
      layer: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles © Esri'
      })
    }
  ];
  currentBaseLayer = this.baseMapsList[0].layer;
  rainData: any[] = [];
  rainSubscription: Subscription | undefined;
  markersLayer = L.layerGroup();
  provincesLayer: L.GeoJSON<any> | null = null;
  loading = false;

  constructor(
    private fb: FormBuilder,
    private weatherService: WeatherService,
    private dialogRef: MatDialogRef<MapRainComponent>,
    private http: HttpClient,
    private dateAdapter: DateAdapter<Date>,
    @Inject(MAT_DIALOG_DATA) public data: { hoy: boolean }
  ) {
    this.hoy = data.hoy;
    this.dateAdapter.setLocale('es-AR');
    const currentYear = new Date().getFullYear();
    const firstDay = new Date(currentYear, 0, 1);
    this.form = this.fb.group({
      desde: [firstDay, [Validators.required]],
      hasta: [new Date(), [Validators.required]],
      baseMap: [this.baseMapsList[0].value]
    });
  }

  ngOnInit(): void {
    // Automatically load data if hoy is true
    if (this.hoy) {
      this.loadData();
    }
  }

  async ngAfterViewInit() {
    this.map = L.map('mapContainer',).setView([-27, -65], 8);
    this.currentBaseLayer.addTo(this.map);
    this.markersLayer.addTo(this.map);
    await this.loadProvinces();
    this.addLegend(); // Add the color scale legend to the map
  }

  private async loadProvinces(): Promise<void> {
    try {
      const provincesUrl = '../../assets/shapes/provincias.geojson';
      const provincesData = await firstValueFrom(
        this.http.get<FeatureCollection>(provincesUrl)
      );
      this.provincesLayer = L.geoJSON(provincesData, {
        style: { color: 'blue', weight: 1, opacity: 0.8, fillOpacity: 0 },
        onEachFeature: (feature, layer) => {
          const name = feature.properties?.['nam'];
          if (name) layer.bindPopup(name);
        }
      });
      if (this.map && this.provincesLayer) {
        this.provincesLayer.addTo(this.map);
        this.provincesLayer.setZIndex(2);
      }
    } catch (error) {
      console.error('Error al cargar provincias:', error);
    }
  }

  onBaseMapChange(event?: MatSelectChange): void {
    const selectedBase = this.baseMapsList.find(b => b.value === this.form.value.baseMap);
    if (selectedBase) {
      this.map.removeLayer(this.currentBaseLayer);
      this.currentBaseLayer = selectedBase.layer;
      this.currentBaseLayer.addTo(this.map);
    }
  }

  loadData(): void {
    this.loading = true; // Activa el spinner
    this.markersLayer.clearLayers();

    if (this.hoy) {
      this.rainSubscription = this.weatherService.getAlerts().subscribe({
        next: (resp: any) => {
          this.rainData = resp.data;
          this.plotRain();
          this.loading = false; // Desactiva el spinner al finalizar
        },
        error: () => {
          this.loading = false; // Desactiva el spinner en caso de error
        }
      });
    } else {
      const desde = this.formatDate(this.form.value.desde);
      const hasta = this.formatDate(this.form.value.hasta);
      this.rainSubscription = this.weatherService.getRains(desde, hasta).subscribe({
        next: (resp: any) => {
          this.rainData = resp.data;
          this.plotRain();
          this.loading = false;
        },
        error: () => {
          this.loading = false;
        }
      });
    }
  }

  plotRain(): void {
    if (!this.rainData || this.rainData.length === 0) return;

    this.rainData.forEach(d => {
      if (!d.lat || !d.lon) return;

      const color = this.getRainColor(parseFloat(d.totalLluvia), parseInt(d.registrosLluvia));
      const marker = L.circleMarker([d.lat, d.lon], {
        radius: 8,
        fillColor: color,
        color: '#000',
        weight: 1,
        fillOpacity: 0.8
      }).bindPopup(`
        <b>${d.nombre}</b><br>
        Total Lluvia: ${d.totalLluvia} mm<br>
        Max Lluvia: ${d.maxLluvia} mm<br>
        Horas de Lluvia: ${d.registrosLluvia * d.frecuenciaDato / 60}
      `);
      this.markersLayer.addLayer(marker);
    });
  }

  getRainColor(totalLluvia: number, registrosLluvia: number): string {
    if (totalLluvia === 0) return 'gray';
    if (registrosLluvia === 0 && totalLluvia > 0) return 'lightgreen'; // Dew or negligible rain
    if (totalLluvia < 0.3) return 'lightgreen';
    if (totalLluvia >= 0.5 && totalLluvia <= 10) return 'lightblue';
    if (totalLluvia > 10 && totalLluvia <= 50) return 'deepskyblue';
    if (totalLluvia > 50) return 'blue';
    return 'gray'; // Default
  }

  private addLegend(): void {
    const legend = new L.Control({ position: 'bottomright' });

    legend.onAdd = () => {
      const div = L.DomUtil.create('div', 'info legend');
      div.innerHTML = `
        <strong>Precipitaciones</strong><br>
        <i style="background:gray"></i> 0 mm<br>
        <i style="background:lightgreen"></i> < 0.3 mm (rocío)<br>
        <i style="background:lightblue"></i> 0.5 - 10 mm<br>
        <i style="background:deepskyblue"></i> 10 - 50 mm<br>
        <i style="background:blue"></i> > 50 mm
      `;
      return div;
    };

    legend.addTo(this.map);
  }

  private formatDate(date: Date): string {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = ('0' + (d.getMonth() + 1)).slice(-2);
    const day = ('0' + d.getDate()).slice(-2);
    return `${year}-${month}-${day}`;
  }

  ngOnDestroy(): void {
    this.rainSubscription?.unsubscribe();
  }

  close(): void {
    this.dialogRef.close();
  }
}