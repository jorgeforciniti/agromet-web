import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import * as L from 'leaflet';
import { OPCIONES_GESTOS } from '../maps/gestos';
import { ZonaProductiva, alternarZona, cargarCapasZonas, crearZonasProductivas, ESTILO_PROVINCIAS } from '../maps/zonas-productivas';
import { seguirTamanioMapa } from '../maps/map-size';
import { leyendaPlegable } from '../maps/leyenda-plegable';
import { formatDecimal } from '../pipes/valor.pipe';
import { WeatherService } from '../services/weather.service';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { GeoJsonObject } from 'geojson';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { DateAdapter, MatNativeDateModule } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CommonModule } from '@angular/common';
import { finalize } from 'rxjs/operators';
import { MAT_DATE_FORMATS, MAT_DATE_LOCALE } from '@angular/material/core';
import { NativeDateAdapter } from '@angular/material/core';
import { Injectable } from '@angular/core';
import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { KmzLayerService } from '../services/kmz-layer.service';

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

interface TemperatureData {
  lat: number;
  lon: number;
  nombre: string;
  [key: string]: string | number;
}

export function dmyDateValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const val = control.value;
    if (!val || typeof val !== 'string') return null;
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(val);
    if (!match) return { invalidDate: true };
    const [, dd, mm, yyyy] = match;
    const d = +dd, m = +mm, y = +yyyy;
    const date = new Date(y, m - 1, d);
    if (
      date.getFullYear() !== y ||
      date.getMonth() + 1 !== m ||
      date.getDate() !== d
    ) {
      return { invalidDate: true };
    }
    return null;
  };
}

export const MY_DATE_FORMATS = {
  parse: {
    dateInput: 'dd/MM/yyyy', // Formato de entrada
  },
  display: {
    dateInput: 'dd/MM/yyyy', // Visualización principal
    monthYearLabel: 'MMM yyyy', // Ej: "Jul 2024"
    dateA11yLabel: 'dd/MM/yyyy', // Formato accesible
    monthYearA11yLabel: 'MMMM yyyy' // Mes completo accesible
  },
};

@Component({
  selector: 'app-map-temperature',
  templateUrl: './map-temperature.component.html',
  styleUrls: ['./map-temperature.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    HttpClientModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatCheckboxModule
  ],
  providers: [
    { provide: DateAdapter, useClass: DmyDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: MY_DATE_FORMATS },
    { provide: MAT_DATE_LOCALE, useValue: 'es-AR' },
  ]
})

export class MapTemperatureComponent implements OnInit, AfterViewInit, OnDestroy {
  /** Deja de observar el tamaño del contenedor del mapa (ver seguirTamanioMapa). */
  private dejarDeSeguirTamanio?: () => void;
  public currentVariableLabel: string = '';
  form!: FormGroup;
  map!: L.Map;
  layerGroup!: L.LayerGroup;
  provincesLayer!: L.GeoJSON;
  zoneLayers: ZonaProductiva[] = crearZonasProductivas();
  baseMaps: { [key: string]: L.TileLayer } = {};
  loading = false;
  errorMessage?: string;

  variables: { key: string; label: string }[] = [
    { key: 'abs_min_temp', label: 'Temp. Mínima Absoluta' },
    { key: 'avg_temp_min', label: 'Temp. Mínima Media' },
    { key: 'avg_temp_period', label: 'Temp. Media' },
    { key: 'avg_temp_max', label: 'Temp. Máxima Media' },
    { key: 'abs_max_temp', label: 'Temp. Máxima Absoluta' }
  ];

  baseMapsList = [
    { value: 'osm', label: 'OSM Estándar' },
    { value: 'sat', label: 'Satélite' }
  ];

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    private weatherService: WeatherService,
    private dialogRef: MatDialogRef<MapTemperatureComponent>,
    private kmzLayerService: KmzLayerService
  ) { }

  ngOnInit() {
    const defaultDates = this.getDefaultDates();
    this.form = this.fb.group({
      desde: [defaultDates.desde, [Validators.required, dmyDateValidator()]],
      hasta: [defaultDates.hasta, [Validators.required, dmyDateValidator()]],
      variable: [this.variables[0].key, Validators.required],
      baseMap: ['osm', Validators.required]
    });
  }
  async ngAfterViewInit() {
    this.map = L.map('mapContainer', {
      center: [-27, -65],
      zoom: 8,
      maxBoundsViscosity: 0.0,
      ...OPCIONES_GESTOS   // gestos táctiles y Ctrl+rueda (ver maps/gestos.ts)
    });
    this.dejarDeSeguirTamanio = seguirTamanioMapa(this.map);

    // Capas base
    this.baseMaps['osm'] = L.tileLayer(
      'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      { attribution: '&copy; OSM' }
    );

    this.baseMaps['sat'] = L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { attribution: '&copy; Satélite' }
    );
    this.baseMaps['osm'].addTo(this.map);
    this.map.createPane('zonePane').style.zIndex = '450';
    this.map.createPane('temperatureMarkersPane').style.zIndex = '600';

    // Cargar provincias
    await this.loadProvinces();
    await this.loadZoneLayers();

    // Grupo de marcadores
    this.layerGroup = L.layerGroup().addTo(this.map);
    this.addColorLegend();
    setTimeout(() => this.map?.invalidateSize(), 50);
  }

  private async loadZoneLayers(): Promise<void> {
    await cargarCapasZonas(this.zoneLayers, this.kmzLayerService);
  }

  toggleZoneLayer(zone: ZonaProductiva, selected: boolean): void {
    alternarZona(this.map, zone, selected);
  }

  private async loadProvinces(): Promise<void> {
    try {
      const provincesUrl = '../../assets/shapes/provincias.geojson';
      const provincesData = await firstValueFrom(
        this.http.get<GeoJsonObject>(provincesUrl)
      );

      this.provincesLayer = L.geoJSON(provincesData, {
        style: ESTILO_PROVINCIAS,
        onEachFeature: (feature, layer) => {
          // @ts-ignore
          const name = feature.properties?.nam;
          if (name) {
            layer.bindPopup(name);
          }
        }
      });

      if (this.map) {
        this.provincesLayer.addTo(this.map);
        this.provincesLayer.setZIndex(2);
      }
    } catch (error) {
      console.error('Error al cargar provincias:', error);
      this.errorMessage = 'No se pudieron cargar los límites provinciales';
    }
  }

  private formatDate(date: Date): string {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = ('0' + (d.getMonth() + 1)).slice(-2);
    const day = ('0' + d.getDate()).slice(-2);
    return `${year}-${month}-${day}`;
  }

  onBaseMapChange() {
    const sel: string = this.form.value.baseMap;

    // Remover solo las capas base, no las superpuestas
    Object.values(this.baseMaps).forEach(layer => {
      if (this.map.hasLayer(layer)) {
        this.map.removeLayer(layer);
      }
    });

    // Añadir la nueva capa base
    this.baseMaps[sel].addTo(this.map);

    // Asegurar que las provincias permanezcan en el mapa
    if (this.provincesLayer && !this.map.hasLayer(this.provincesLayer)) {
      this.provincesLayer.addTo(this.map).bringToBack(); // Opcional: enviar al fondo
    }

    // Reagregar el grupo de marcadores si es necesario
    if (this.layerGroup && !this.map.hasLayer(this.layerGroup)) {
      this.layerGroup.addTo(this.map);
    }
  }

  loadData() {
    if (!this.layerGroup) return;
    if (this.form.invalid) return;

    this.loading = true;
    this.layerGroup.clearLayers();

    const variableKey = this.form.value.variable;
    this.currentVariableLabel = this.variables.find(v => v.key === variableKey)?.label || '';

    const desde = this.formatDate(this.form.value.desde);
    const hasta = this.formatDate(this.form.value.hasta);

    const variable: string = this.form.value.variable;

    const desdeDate = this.form.value.desde;
    const hastaDate = this.form.value.hasta;
    const diffTime = hastaDate.getTime() - desdeDate.getTime();
    const totalDias = Math.floor(diffTime / (1000 * 3600 * 24)) + 1;

    this.weatherService.getTMinMax<TemperatureData>(desde, hasta)
      .pipe(finalize(() => (this.loading = false)))
      .subscribe({
        next: (res) => {
          if (res.status !== 'success' || !res.data?.length) {
            this.errorMessage = 'Sin datos para el período seleccionado.';
            return;
          }

          const data: TemperatureData[] = res.data.filter(d => {
            const raw = d[variable];

            // Convertimos a número (sirve si viene string)
            const value = raw == null ? NaN : Number(raw);

            // Si no es un número válido, descartamos
            if (!Number.isFinite(value)) return false;

            // Solo filtrar rango en ABS (como ya hacías)
            if (variable === 'abs_min_temp' || variable === 'abs_max_temp') {
              return value >= -25 && value <= 50;
            }

            return true;
          });

          data.forEach((d: TemperatureData) => {
            const raw = d[variable];
            const value = raw == null ? NaN : Number(raw);

            // Guardas extra
            if (!Number.isFinite(value)) return;
            if (!Number.isFinite(d.lat) || !Number.isFinite(d.lon)) return;

            const color = this.getColor(value);
            const varLabel = this.variables.find(v => v.key === variable)?.label ?? variable;

            const countRecords = Number(d['count_records']) || 0;
            const recordsColor = this.getRecordsColor(countRecords, totalDias);

            L.circleMarker([d.lat, d.lon], {
              pane: 'temperatureMarkersPane',
              radius: 6,
              fillColor: color,
              color: '#333',
              weight: 1,
              fillOpacity: 1
            })
              .bindPopup(
                `<b>${d.nombre}</b><br><br>
             <span style="padding:2px 5px;border-radius:3px;">
               ${varLabel}: ${formatDecimal(value, 1)}°C
             </span><br>
             <span style="background:${recordsColor};padding:2px 5px;border-radius:3px;">
               Registros: ${countRecords} de ${totalDias}
             </span>`
              )
              .addTo(this.layerGroup);
          });

          // (Opcional) si querés centrar el mapa en los puntos:
          // const bounds = L.latLngBounds(data.map(d => [d.lat, d.lon] as [number, number]));
          // if (bounds.isValid()) this.map.fitBounds(bounds, { padding: [30, 30] });
        },
        error: (err) => {
          console.error('Error en API:', err);
          this.errorMessage = 'Error al consultar datos de temperatura.';
        }
      });
  }

  private getRecordsColor(count: number, totalDays: number): string {
    if (!totalDays || count === undefined) return 'transparent';

    const missingDays = totalDays - count;
    const missingPercentage = (missingDays / totalDays) * 100;

    if (missingPercentage == 0) return '#92e95e';  // verde
    if (missingPercentage < 10) return '#ffeb3b';  // Amarillo
    if (missingPercentage <= 20) return '#ff9800'; // Naranja
    return '#f44336';                              // Rojo
  }

  private addColorLegend() {
    const existingLegend = document.getElementById('temperature-legend');
    if (existingLegend) existingLegend.remove();

    const legend = new L.Control({ position: 'bottomright' });

    legend.onAdd = () => {
      const div = L.DomUtil.create('div', 'temperature-legend');
      // Estilo de la caja: .temperature-legend en styles.css

      div.innerHTML = `
            <h4 style="margin: 0 0 8px 0; font-size:14px">Escala de Temperatura (°C)</h4>
            <div style="background: linear-gradient(to right, 
                rgb(0,0,255), 
                rgb(0,255,255), 
                rgb(0,255,0), 
                rgb(255,255,0), 
                rgb(255,0,0));
                height: 20px;
                margin-bottom: 5px;">
            </div>
            <div style="display: flex; justify-content: space-between;">
                <span>-5</span>
                <span>5</span>
                <span>15</span>
                <span>25</span>
                <span>&ge;35</span>
            </div>
        `;
      return leyendaPlegable(div);
    };

    legend.addTo(this.map);
  }

  private getColor(temperature: number): string {
    if (!Number.isFinite(temperature)) return 'rgb(128,128,128)'; // gris fallback
    // Escala fija de -5 °C a 35 °C; fuera de ese rango se usa el color del extremo
    const clampedTemp = Math.max(-5, Math.min(35, temperature));
    const p = (clampedTemp + 5) / 40; // Normalizar a rango 0-1

    const colorStops = [
      { pos: 0, color: [0, 0, 255] },    // -5 °C - Azul
      { pos: 0.25, color: [0, 255, 255] }, // 5 °C - Cian
      { pos: 0.5, color: [0, 255, 0] },    // 15 °C - Verde
      { pos: 0.75, color: [255, 255, 0] }, // 25 °C - Amarillo
      { pos: 1, color: [255, 0, 0] }       // 35 °C o más - Rojo
    ];


    let lowerStop = colorStops[0];
    let upperStop = colorStops[colorStops.length - 1];

    for (let i = 0; i < colorStops.length - 1; i++) {
      if (p >= colorStops[i].pos && p <= colorStops[i + 1].pos) {
        lowerStop = colorStops[i];
        upperStop = colorStops[i + 1];
        break;
      }
    }

    const factor = (p - lowerStop.pos) / (upperStop.pos - lowerStop.pos);
    const r = Math.round(lowerStop.color[0] + factor * (upperStop.color[0] - lowerStop.color[0]));
    const g = Math.round(lowerStop.color[1] + factor * (upperStop.color[1] - lowerStop.color[1]));
    const b = Math.round(lowerStop.color[2] + factor * (upperStop.color[2] - lowerStop.color[2]));

    return `rgb(${r},${g},${b})`;
  }

  get selectedVariableLabel(): string {
    return this.variables.find(v => v.key === this.form.value.variable)?.label || '';
  }

  private getDefaultDates(): { desde: Date; hasta: Date } {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    const currentDate = today.getDate();

    const desde = new Date(currentYear, currentMonth, 1);

    let hasta: Date;
    if (currentDate >= 3) {
      hasta = new Date(today);
      hasta.setDate(today.getDate() - 1);
    } else {
      hasta = new Date(currentYear, currentMonth, 0); // Último día del mes anterior
    }

    return { desde, hasta };
  }


  close() {
    this.dialogRef.close();
  }

  ngOnDestroy(): void {
    this.dejarDeSeguirTamanio?.();
    this.map?.remove();
  }
}
