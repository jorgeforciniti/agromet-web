import { Component, Inject, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import {
  MatDialogRef,
  MAT_DIALOG_DATA,
  MatDialogModule,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';

import * as L from 'leaflet';
import { OPCIONES_GESTOS } from '../maps/gestos';
import { ZonaProductiva, alternarZona, cargarCapasZonas, crearZonasProductivas, ESTILO_PROVINCIAS } from '../maps/zonas-productivas';
import { seguirTamanioMapa } from '../maps/map-size';
import { encuadrarTucuman } from '../maps/encuadre';
import { leyendaPlegable } from '../maps/leyenda-plegable';
import { formatDecimal } from '../pipes/valor.pipe';
import { WeatherService } from '../services/weather.service'; // Assuming path to your service
import { firstValueFrom } from 'rxjs';
import { GeoJsonObject } from 'geojson';
import { KmzLayerService } from '../services/kmz-layer.service';

// Interfaces based on your provided JSON structure and rain-campaign-dialog.component.ts
interface RainRecord {
  year: number;
  month: string; // e.g., "MAY"
  value: number;
  normal: number;
}

interface StationRainData {
  id: number;
  name: string;
  lat: number;
  lon: number;
  reference_period: string;
  dataset: RainRecord[];
}

export interface RainMonthlyMapDialogData {
  // Potential data to pass to the dialog, if any
}

interface Month {
  value: number;
  label: string;
}

@Component({
  selector: 'app-rain-monthly-map',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatCheckboxModule,
  ],
  templateUrl: './map-rain-monthly.component.html',
  styleUrls: ['./map-rain-monthly.component.css'],
})
export class MapRainMonthlyComponent implements OnInit, AfterViewInit, OnDestroy {
  /** Deja de observar el tamaño del contenedor del mapa (ver seguirTamanioMapa). */
  private dejarDeSeguirTamanio?: () => void;
  public map!: L.Map;
  public errorMessage: string | null = null;
  private stationsLayerGroup: L.LayerGroup = L.layerGroup();
  public zoneLayers: ZonaProductiva[] = crearZonasProductivas();
  public isLoading = false;
  private provincesLayer: L.GeoJSON | undefined;
  public noDataForSelection = false;
  public osmLayer!: L.TileLayer;
  public satLayer!: L.TileLayer;

  public selectedStartMonth!: number;
  public selectedEndMonth!: number;
  public selectedStartYear!: number;
  public selectedBaseMap: string = 'osm';

  public monthsList: Month[] = [
    { value: 1, label: 'Ene' }, { value: 2, label: 'Feb' }, { value: 3, label: 'Mar' },
    { value: 4, label: 'Abr' }, { value: 5, label: 'May' }, { value: 6, label: 'Jun' },
    { value: 7, label: 'Jul' }, { value: 8, label: 'Ago' }, { value: 9, label: 'Sep' },
    { value: 10, label: 'Oct' }, { value: 11, label: 'Nov' }, { value: 12, label: 'Dic' },
  ];

  public yearsList: number[] = [];

  // Listado de mapas base
  baseMapsList = [
    { value: 'osm', label: 'OSM Estándar' },
    { value: 'sat', label: 'Satelital' }
  ];

  private monthMap: { [key: string]: number } = {
    ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6,
    JUL: 7, AGO: 8, SEP: 9, OCT: 10, NOV: 11, DIC: 12,
  };

  private defaultMapCenter: L.LatLngTuple = [-26.8305, -65.2226]; // Tucuman
  private defaultMapZoom = 8;


  constructor(
    private weatherService: WeatherService,
    private http: HttpClient,
    private kmzLayerService: KmzLayerService,
    public dialogRef: MatDialogRef<MapRainMonthlyComponent>,
    @Inject(MAT_DIALOG_DATA) public data: RainMonthlyMapDialogData
  ) { }

  ngOnInit(): void {
    const today = new Date();
    // Default to current month for start and end, and current year for start year.
    // User might want to define a typical campaign period, e.g., May to April of next year.
    // For now, simple defaults:

    const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);

    // 3) Inicializar selects al mes anterior
    this.selectedStartMonth = lastMonthDate.getMonth() + 1;
    this.selectedEndMonth = lastMonthDate.getMonth() + 1;
    this.selectedStartYear = lastMonthDate.getFullYear();

    const currentYear = new Date().getFullYear();
    for (let y = currentYear; y >= currentYear - 20; y--) {
      this.yearsList.push(y);
    }
    this.loadRainData();
  }

  async ngAfterViewInit(): Promise<void> {
    this.initMap();
    await this.loadProvinces();
    await this.loadZoneLayers();

    this.dialogRef.afterOpened().subscribe(() => {
      setTimeout(() => {
        if (this.map && this.map.getContainer().offsetHeight > 0) {
          this.map.invalidateSize();
        }
      }, 200); // esperar al menos 200ms
    });
    this.addRainLegendControl();
  }

  ngOnDestroy(): void {
    this.dejarDeSeguirTamanio?.();
    if (this.map) {
      this.map.remove();
    }
  }

  private initMap(): void {
    if (document.getElementById('rainMapDialog')) {
      this.map = L.map('rainMapDialog', {
        center: this.defaultMapCenter,
        zoom: this.defaultMapZoom,
        ...OPCIONES_GESTOS   // gestos táctiles y Ctrl+rueda (ver maps/gestos.ts)
      });
      this.dejarDeSeguirTamanio = seguirTamanioMapa(this.map);
      encuadrarTucuman(this.map);
      this.map.createPane('zonePane').style.zIndex = '450';
      this.map.createPane('rainMarkersPane').style.zIndex = '600';

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
      }).addTo(this.map);

      this.satLayer = L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        {
          attribution: 'Tiles © Esri',
          maxZoom: 18,
        }
      );

      this.stationsLayerGroup.addTo(this.map);
      setTimeout(() => {
        if (this.map) {
          this.map.invalidateSize();
        }
      }, 300);
    } else {
      console.error('Map container "rainMapDialog" not found.');
    }
    this.updateBaseMap();

  }

  private async loadZoneLayers(): Promise<void> {
    await cargarCapasZonas(this.zoneLayers, this.kmzLayerService);
  }

  public toggleZoneLayer(zone: ZonaProductiva, selected: boolean): void {
    alternarZona(this.map, zone, selected);
  }

  onBaseMapChange(): void {
    this.updateBaseMap();
  }

  private updateBaseMap(): void {
    if (!this.map) {
      return;
    }
    // Remover capas sólo si existen
    if (this.osmLayer && this.map.hasLayer(this.osmLayer)) {
      this.map.removeLayer(this.osmLayer);
    }
    if (this.satLayer && this.map.hasLayer(this.satLayer)) {
      this.map.removeLayer(this.satLayer);
    }

    // Añadir capa seleccionada
    if (this.selectedBaseMap === 'osm' && this.osmLayer) {
      this.osmLayer.addTo(this.map);
    } else if (this.selectedBaseMap === 'sat' && this.satLayer) {
      this.satLayer.addTo(this.map);
    }
  }

  public loadRainData(): void {
    if (!this.selectedStartMonth || !this.selectedEndMonth || !this.selectedStartYear) {
      alert('Por favor, seleccione el período completo.');
      return;
    }

    this.isLoading = true;
    this.noDataForSelection = false;
    this.stationsLayerGroup.clearLayers();

    this.weatherService
      .getRainCampaign(this.selectedStartMonth, this.selectedStartYear)
      .subscribe({
        next: (resp: { status: string; data: StationRainData[] }) => {
          if (resp.status === 'success' && resp.data && resp.data.length > 0) {
            const validStations: StationRainData[] = [];
            resp.data.forEach((station: StationRainData) => {
              if (station.lat && station.lon) {
                const { sumValue, sumNormal, periodMonths, hasMissingDataInPeriod } = this.calculatePeriodRain(station.dataset);
                if (!hasMissingDataInPeriod && periodMonths > 0 && sumNormal > 0) {
                  const color = this.getRainColor(sumValue, sumNormal);
                  const marker = L.circleMarker([station.lat, station.lon], {
                    pane: 'rainMarkersPane',
                    radius: 8,
                    fillColor: color,
                    color: '#000',
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8
                  });

                  // Popup con detalles
                  marker.bindPopup(
                    `<b>${station.name}</b><br>
                     Lluvia período: ${formatDecimal(sumValue, 1)} mm<br>
                     Normal período: ${formatDecimal(sumNormal, 1)} mm<br>
                     Porcentaje: ${formatDecimal((sumValue / sumNormal) * 100, 1)}%`
                  );

                  // Tooltip permanente con solo el valor
                  marker.bindTooltip(`${formatDecimal(sumValue, 1)} mm`, {
                    direction: 'right',
                    offset: [8, 0],
                    className: 'rain-value-label'
                  });

                  this.stationsLayerGroup.addLayer(marker);
                  validStations.push(station);
                }
              }
            });
            if (validStations.length === 0) {
              this.noDataForSelection = true;
            }
          } else {
            this.noDataForSelection = true;
            console.error('Error o datos vacíos:', resp);
          }
          this.isLoading = false;
        },
        error: (err) => {
          console.error('Error en API:', err);
          this.isLoading = false;
          this.noDataForSelection = true;
        }
      });
  }

  private calculatePeriodRain(dataset: RainRecord[]): {
    sumValue: number;
    sumNormal: number;
    periodMonths: number;
    hasMissingDataInPeriod: boolean; // Flag to indicate missing data within the user-selected period
  } {
    let sumValue = 0;
    let sumNormal = 0;
    let periodMonths = 0;
    let hasMissingDataInPeriod = false;

    const userStartDate = new Date(this.selectedStartYear, this.selectedStartMonth - 1, 1);
    let userEndDateYear = this.selectedStartYear;
    if (this.selectedEndMonth < this.selectedStartMonth) {
      userEndDateYear = this.selectedStartYear + 1;
    }
    // Create the date for the first day of the end month
    const userEndDate = new Date(userEndDateYear, this.selectedEndMonth - 1, 1);
    // To include the whole end month, set date to the last day of that month
    userEndDate.setMonth(userEndDate.getMonth() + 1);
    userEndDate.setDate(0); // Sets it to the last day of the previous month (which is selectedEndMonth)


    dataset.forEach(record => {
      const recordMonthNumber = this.monthMap[record.month.toUpperCase()];
      if (!recordMonthNumber) return; // Skip if month name is unknown

      const recordDate = new Date(record.year, recordMonthNumber - 1, 15); // Use mid-month for comparison

      // Check if the record's date is within the user-selected period
      if (recordDate >= userStartDate && recordDate <= userEndDate) {
        periodMonths++; // This month is part of the user's selected period
        if (record.value === -999.9) {
          hasMissingDataInPeriod = true; // Mark that there's missing data in this period
          // We don't add its value to sumValue.
          // sumNormal will still include its normal, as per discussion.
        } else {
          sumValue += record.value;
        }
        sumNormal += record.normal; // Sum normal for all months in the selected period
      }
    });
    return { sumValue, sumNormal, periodMonths, hasMissingDataInPeriod };
  }

  private getRainColor(value: number, normal: number): string {
    if (normal === 0) {
      return '#808080'; // Grey for no normal data or normal is zero
    }
    const ratio = value / normal;

    if (ratio < 0.33) return '#FF0000'; // Rojo
    if (ratio < 0.66) return '#FFA500'; // Naranja
    if (ratio < 1.00) return '#FFFF00'; // Amarillo
    if (ratio <= 1.5) return '#87CEEB'; // Celeste (Sky Blue)
    if (ratio < 2.0) return '#00BFFF';  // Azul claro (Deep Sky Blue)
    return '#00008B'; // Azul oscuro (Dark Blue)
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

  private addRainLegendControl(): void {
    const legend = new L.Control({ position: 'bottomright' });

    legend.onAdd = () => {
      const div = L.DomUtil.create('div', 'info legend');

      div.innerHTML = `
  <div class="legend-title">Relación al normal</div>
    <i style="background:#FF0000; width:16px; height:16px; display:inline-block; margin-right:6px; border-radius:3px;"></i> &lt; 33%<br>
    <i style="background:#FFA500; width:16px; height:16px; display:inline-block; margin-right:6px; border-radius:3px;"></i> 33–66%<br>
    <i style="background:#FFFF00; width:16px; height:16px; display:inline-block; margin-right:6px; border-radius:3px;"></i> 66–99%<br>
    <i style="background:#87CEEB; width:16px; height:16px; display:inline-block; margin-right:6px; border-radius:3px;"></i> 100–150%<br>
    <i style="background:#00BFFF; width:16px; height:16px; display:inline-block; margin-right:6px; border-radius:3px;"></i> 150–200%<br>
    <i style="background:#00008B; width:16px; height:16px; display:inline-block; margin-right:6px; border-radius:3px;"></i> &gt; 200%<br>
`;
      return leyendaPlegable(div);
    };

    legend.addTo(this.map);
  }

  public close(): void {
    this.dialogRef.close();
  }
}
