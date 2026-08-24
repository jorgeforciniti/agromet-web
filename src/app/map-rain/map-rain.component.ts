import { Component, OnInit, AfterViewInit, OnDestroy, Inject, Injectable } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import * as L from 'leaflet';
import { Subscription } from 'rxjs';
import { WeatherDataApiResponse, WeatherService } from '../services/weather.service';
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

import { GestureHandling } from 'leaflet-gesture-handling';
L.Map.addInitHook('addHandler', 'gestureHandling', GestureHandling);

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
  lat: number | string;
  lon: number | string;
  nombre: string;
  totalLluvia: number | string;
  maxLluvia: number | string;
  registrosLluvia: number | string;
  frecuenciaDato: number | string;
}

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
  map?: L.Map;
  private ctrlZoomTimeout?: ReturnType<typeof setTimeout>;
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
  rainData: RainMapRecord[] = [];
  rainSubscription: Subscription | undefined;
  markersLayer = L.layerGroup();
  provincesLayer: L.GeoJSON | null = null;
  loading = false;
  rainScales: RainScale[] = [];
  maxRainValue: number = 0;

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
    this.map = L.map('mapContainer', {
      center: [-27, -65],
      zoom: 8,
      maxBoundsViscosity: 0.0,
      scrollWheelZoom: false  // Desactivar zoom por rueda
    });

    this.currentBaseLayer.addTo(this.map);
    this.markersLayer.addTo(this.map);
    await this.loadProvinces();
    this.addLegend(); // Add the color scale legend to the map

    setTimeout(() => this.map?.invalidateSize(), 50);
    
    // Mostrar mensaje si gira la rueda sin Ctrl
    if (!this.map) return;
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
    if (selectedBase && this.map) {
      this.map.removeLayer(this.currentBaseLayer);
      this.currentBaseLayer = selectedBase.layer;
      this.currentBaseLayer.addTo(this.map);
    }
  }

  loadData(): void {
    this.loading = true; // Activa el spinner
    this.markersLayer.clearLayers();

    if (this.hoy) {
      this.rainSubscription = this.weatherService.getAlerts<RainMapRecord>().subscribe({
        next: (resp) => {
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
      this.rainSubscription = this.weatherService.getRains<RainMapRecord>(desde, hasta).subscribe({
        next: (resp) => {
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

    // Calculate dynamic scales based on actual data
    this.calculateDynamicScales();

    this.rainData.forEach(d => {
      if (!d.lat || !d.lon) return;

      const totalLluvia = parseFloat(String(d.totalLluvia));
      const registrosLluvia = parseInt(String(d.registrosLluvia), 10);
      const maxLluvia = parseFloat(String(d.maxLluvia));
      const frecuenciaDato = parseFloat(String(d.frecuenciaDato));
      const lat = Number(d.lat);
      const lon = Number(d.lon);
      const color = this.getRainColor(totalLluvia, registrosLluvia);
      const marker = L.circleMarker([lat, lon], {
        radius: 8,
        fillColor: color,
        color: '#000',
        weight: 1,
        fillOpacity: 0.8
      }).bindPopup(`
          <b>${d.nombre}</b><br>
          Total Lluvia: ${totalLluvia.toFixed(1)} mm<br>
          Max Lluvia: ${maxLluvia.toFixed(1)} mm<br>
          Horas de Lluvia: ${((registrosLluvia * frecuenciaDato) / 60).toFixed(1)}
        `);
      this.markersLayer.addLayer(marker);
    });

    // Update legend with new scales
    this.updateLegend();
  }

  private calculateDynamicScales(): void {
    // Extract all precipitation values excluding 0 and low values
    const precipitationValues = this.rainData
      .map(d => parseFloat(String(d.totalLluvia)))
      .filter(v => v > 0)
      .sort((a, b) => a - b);

    if (precipitationValues.length === 0) {
      this.rainScales = [];
      this.maxRainValue = 0;
      return;
    }

    this.maxRainValue = precipitationValues[precipitationValues.length - 1];

    // Define color palette for progressive scales
    const colors = ['#90EE90', '#87CEEB', '#4169E1', '#2424da', '#06068a'];

    // Calculate percentile-based intervals
    // We'll create up to 5 scales based on percentiles: 20%, 40%, 60%, 80%, 100%
    const scales: RainScale[] = [];
    
    // Always add the "no rain" case
    scales.push({ min: 0, max: 0, color: '#D3D3D3' }); // Gray for 0mm

    if (precipitationValues.length > 0) {
      // Add minimum to trace rain
      const minValue = precipitationValues[0];
      if (minValue > 0) {
        scales.push({ min: 0.001, max: minValue, color: '#90EE90' }); // Light green for trace
      }

      // Calculate intervals using percentiles
      const stepSize = Math.ceil(precipitationValues.length / 5);
      let lastMax = minValue;

      for (let i = 1; i < 5 && i * stepSize < precipitationValues.length; i++) {
        const index = Math.min((i * stepSize) - 1, precipitationValues.length - 1);
        const currentMax = precipitationValues[index];
        
        if (currentMax > lastMax) {
          const colorIndex = Math.min(i, colors.length - 1);
          scales.push({ min: lastMax, max: currentMax, color: colors[colorIndex] });
          lastMax = currentMax;
        }
      }

      // Add the final scale to max value
      const finalColorIndex = Math.min(4, colors.length - 1);
      scales.push({ min: lastMax, max: this.maxRainValue, color: colors[finalColorIndex] });
    }

    this.rainScales = scales;
  }

  getRainColor(totalLluvia: number, registrosLluvia: number): string {
    if (totalLluvia === 0) return 'gray';
    if (registrosLluvia === 0 && totalLluvia > 0) return '#90EE90'; // Light green for dew

    // Find the appropriate scale for this value
    for (const scale of this.rainScales) {
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
      return div;
    };

    if (this.map) {
      legend.addTo(this.map);
    }
  }

  private updateLegend(): void {
    const legendDiv = document.getElementById('rainLegend');
    if (!legendDiv) return;

    let html = '<strong>Precipitaciones</strong><br>';

    // Add static entries
    html += '<i style="background:#D3D3D3"></i> 0 mm<br>';

    // Add dynamic scales
    for (const scale of this.rainScales) {
      if (scale.min === 0 && scale.max === 0) continue; // Skip zero entry
      
      let label = '';
      if (scale.min === 0.001) {
        label = `< ${scale.max.toFixed(1)} mm (rocío)`;
      } else if (scale.max === this.maxRainValue) {
        label = `${scale.min.toFixed(1)} - ${scale.max.toFixed(1)} mm`;
      } else {
        label = `${scale.min.toFixed(1)} - ${scale.max.toFixed(1)} mm`;
      }

      html += `<i style="background:${scale.color}"></i> ${label}<br>`;
    }

    legendDiv.innerHTML = html;
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
    if (this.ctrlZoomTimeout) clearTimeout(this.ctrlZoomTimeout);
  }

  close(): void {
    this.dialogRef.close();
  }
}
