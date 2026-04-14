import { CommonModule } from '@angular/common';
import { Component, OnInit, AfterViewInit, OnDestroy, Inject, Optional } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import * as L from 'leaflet';
import { Subscription } from 'rxjs';
import { WeatherDataApiResponse, WeatherService } from '../services/weather.service'; // Asegurarse del path correcto
import { MatSelectChange } from '@angular/material/select';
import { MAT_DATE_LOCALE } from '@angular/material/core';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { MatTabsModule } from '@angular/material/tabs';
import { FeatureCollection } from 'geojson';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MAT_DATE_FORMATS } from '@angular/material/core';
import { NativeDateAdapter, DateAdapter } from '@angular/material/core';
import { ViewEncapsulation } from '@angular/core';
import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

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

export function dmyDateValidator(): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const val = control.value;
    if (!val || typeof val !== 'string') return null;  // deja que required/otro lo manejen

    // regex DD/MM/YYYY
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(val);
    if (!match) {
      return { invalidDate: true };
    }


    const [, dd, mm, yyyy] = match;
    const d = +dd, m = +mm, y = +yyyy;
    const date = new Date(y, m - 1, d);

    // revisa que al construir no “se haya desbordado”
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

interface FrostMapRecord {
  lat: number | string;
  lon: number | string;
  nombre: string;
  minAbs: number;
  cantidadDias: number;
  diasHeladas: number;
  hsDebajo0: number;
  'hsDebajo-2': number;
  'hsDebajo-4': number;
  FPH?: string | Date | null;
  FUH?: string | Date | null;
}

export class DmyDateAdapter extends NativeDateAdapter {
  override parse(value: unknown, parseFormat?: string): Date | null {
    if (typeof value === 'string' && value.includes('/')) {
      const [dd, mm, yyyy] = value.split('/').map(v => Number(v));
      // Si alguno no es número, o no coincide largo, devolvés null
      if (![dd, mm, yyyy].every(n => !isNaN(n))) {
        return null;
      }
      const date = new Date(yyyy, mm - 1, dd);
      // VALIDACIÓN: los getters deben coincidir con los valores parsados
      if (
        date.getFullYear() !== yyyy ||
        date.getMonth() + 1 !== mm ||
        date.getDate() !== dd
      ) {
        return null;            // <-- aquí no caemos al super, devolvemos null
      }
      return date;              // fecha válida
    }
    // otros formatos dejan que el nativo lo maneje
    return super.parse(value, parseFormat);
  }
}
@Component({
  selector: 'app-map-temperature',
  templateUrl: './map-frost.component.html',
  styleUrls: ['./map-frost.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSelectModule,
    MatButtonModule,
    ReactiveFormsModule,
    MatProgressSpinnerModule,
    MatTabsModule,
    HttpClientModule
  ],
  providers: [
    { provide: DateAdapter, useClass: DmyDateAdapter },    // ← nuevo
    { provide: MAT_DATE_FORMATS, useValue: MY_DATE_FORMATS },
    { provide: MAT_DATE_LOCALE, useValue: 'es-AR' },
  ],
  encapsulation: ViewEncapsulation.None
})
export class MapFrostComponent implements OnInit, AfterViewInit, OnDestroy {
  private defaultMapCenter: L.LatLngTuple = [-26.8305, -65.2226];
  today: Date = new Date();
  hoy: boolean = false;
  isCargarDisabled: boolean = false; // New property to control button state
  private formatToString(date: Date): string {
    const d = date.getDate().toString().padStart(2, '0');
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const y = date.getFullYear();
    return `${d}/${m}/${y}`;
  }

  form: FormGroup;
  mapa?: L.Map;
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

  heladasData: FrostMapRecord[] = [];
  heladasSubscription: Subscription | undefined;
  markersLayer = L.layerGroup();
  provincesLayer: L.GeoJSON | null = null;
  loading = false;

  constructor(
    private fb: FormBuilder,
    private weatherService: WeatherService,
    private dialogRef: MatDialogRef<MapFrostComponent>,
    private http: HttpClient, // Añadir HttpClient
    private dateAdapter: DateAdapter<Date>, // Añadir DateAdapter
    @Inject(MAT_DIALOG_DATA) @Optional() public data: { hoy?: boolean } | null

  ) {
    this.hoy = data?.hoy ?? false;
    this.dateAdapter.setLocale('es-AR');
    this.dateAdapter.format = (date: Date, displayFormat: string) => {
      const day = date.getDate().toString().padStart(2, '0');
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    };
    const currentYear = new Date().getFullYear();
    const firstDay = new Date(currentYear, 0, 1); // Primer día del año

    this.form = this.fb.group({
      desde: [firstDay, [Validators.required]],
      hasta: [new Date(), [Validators.required]],
      baseMap: [this.baseMapsList[0].value]
    });
  }

  ngOnInit(): void {
    if (this.hoy) {
      this.loadData();
    }
  }

  async ngAfterViewInit() {
    this.mapa = L.map('mapfrost', {
      center: this.defaultMapCenter,
      zoom: 8,
      maxBoundsViscosity: 0.0,
      scrollWheelZoom: false  // Desactivar zoom por rueda
    });
    this.currentBaseLayer.addTo(this.mapa);
    this.markersLayer.addTo(this.mapa);

    await this.loadProvinces(); // Cargar provincias al inicio

    // Mostrar mensaje si gira la rueda sin Ctrl
    if (!this.mapa) return;
    this.mapa.getContainer().addEventListener('wheel', (e: WheelEvent) => {
      if (!e.ctrlKey) {
        this.mapa?.getContainer().classList.add('ctrl-zoom-message');
        clearTimeout(this.ctrlZoomTimeout);
        this.ctrlZoomTimeout = setTimeout(() => {
          this.mapa?.getContainer().classList.remove('ctrl-zoom-message');
        }, 1000);
      }
    });

    // Habilitar zoom si Ctrl está presionado
    this.mapa.getContainer().addEventListener('wheel', (e: WheelEvent) => {
      if (e.ctrlKey) {
        this.mapa?.scrollWheelZoom.enable();
      } else {
        this.mapa?.scrollWheelZoom.disable();
      }
    });
    this.addLegend();
    setTimeout(() => this.mapa?.invalidateSize(), 50);
  }

  private async loadProvinces(): Promise<void> {
    try {
      const url = 'assets/shapes/provincias.geojson';
      const provincesData = await firstValueFrom(this.http.get<FeatureCollection>(url));

      /* 1 ─ pane específico, z-index bajo */
      if (!this.mapa!.getPane('provincePane')) {
        this.mapa!.createPane('provincePane');
        this.mapa!.getPane('provincePane')!.style.zIndex = '350';   // markerPane = 600
      }

      if (this.provincesLayer) this.provincesLayer.remove();

      /* 2 ─ dibuja TODA la colección, sin capturar eventos */
      this.provincesLayer = L.geoJSON(provincesData, {
        pane: 'provincePane',
        interactive: false,                //  ←  no bloquea los clics
        style: {
          color: 'blue',
          weight: 1,
          opacity: 0.8,
          fillOpacity: 0
        }
      }).addTo(this.mapa!);

      // opcional: ajustar vista
      // this.mapa.fitBounds(this.provincesLayer.getBounds(), { padding: [20, 20] });

    } catch (err) {
      console.error('Error al cargar provincias:', err);
    }
  }


  onBaseMapChange(event?: MatSelectChange): void {
    const selectedBase = this.baseMapsList.find(b => b.value === this.form.value.baseMap);
    if (selectedBase && this.mapa) {
      this.mapa.removeLayer(this.currentBaseLayer);
      this.currentBaseLayer = selectedBase.layer;
      this.currentBaseLayer.addTo(this.mapa);
    }
  }

  public loadData(): void {
    this.loading = true;
    this.heladasData = [];

    // Si el usuario marcó 'hoy', fijamos ambas fechas al día actual
    this.markersLayer.clearLayers();

    if (this.hoy) {
      const today = new Date();
      // Limpiar horas, minutos...
      today.setHours(0, 0, 0, 0);
      this.form.value.desde = today;
      this.form.value.hasta = today;
    }
    const desde = this.formatDate(this.form.value.desde as Date);
    const hasta = this.formatDate(this.form.value.hasta as Date);

    const desdeDate = this.form.value.desde;
    const hastaDate = this.form.value.hasta;
    const diffTime = hastaDate.getTime() - desdeDate.getTime();
    const totalDias = Math.floor(diffTime / (1000 * 3600 * 24)) + 1;

    this.heladasSubscription = this.weatherService.getHeladas<FrostMapRecord>(desde, hasta).subscribe({
      next: (resp) => {
        // solo dejamos los que tienen días de helada > 0
        this.heladasData = resp.data.filter((d) => d.diasHeladas > 0);

        this.plotHeladas(totalDias);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
    // Formatea las fechas
  }

  plotHeladas(totalDias: number): void {
    if (!this.heladasData || this.heladasData.length === 0) return;

    this.heladasData.forEach(d => {
      if (!d.lat || !d.lon) return; // Saltar datos inválidos

      const color = this.getColor(d.minAbs);
      const lat = Number(d.lat);
      const lon = Number(d.lon);
      const marker = L.circleMarker([lat, lon], {
        radius: 8,
        fillColor: color,
        color: '#000',
        weight: 1,
        fillOpacity: 0.8
      }).bindPopup(`
        <b>${d.nombre}</b><br>
        MinAbs: ${d.minAbs}°C<br>
        Horas por debajo de -4°C: ${d['hsDebajo-4']}<br>
        Horas por debajo de -2°C: ${d['hsDebajo-2']}<br>
        Total horas de helada: ${d.hsDebajo0}<br>
        Registros: ${d.cantidadDias} de ${totalDias}
      `);

      this.markersLayer.addLayer(marker);
    });
  }

  getColor(minAbs: number): string {
    if (minAbs >= -2) return '#fffb07';
    if (minAbs >= -4) return '#ff9800';
    if (minAbs >= -6) return 'red';
    return '#8B0000'; // rojo oscuro
  }

  getColorLetra(minAbs: number): string {
    if (minAbs >= -2) return 'black';
    return 'white';
  }

  addLegend(): void {
    const LegendControl = L.Control.extend({
      options: { position: 'bottomright' },

      onAdd: () => {
        const div = L.DomUtil.create('div', 'info legend');
        div.innerHTML = `
        <strong>Intensidad de Helada</strong><br>
        <i style="background:#fffb07"></i> 0 a -2°C<br>
        <i style="background:#ff9800"></i> -2 a -4°C<br>
        <i style="background:red"></i> -4 a -6°C<br>
        <i style="background:#8B0000"></i> < -6°C
      `;
        return div;
      }
    });
    if (this.mapa) {
      new LegendControl().addTo(this.mapa);
    }
  }

  toggleHoy(flag: boolean) {
    this.hoy = flag;
    const desdeCtrl = this.form.get('desde')!;
    const hastaCtrl = this.form.get('hasta')!;

    this.isCargarDisabled = flag; // Update button state

    if (this.hoy) {
      // Set dates to today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      desdeCtrl.setValue(today);
      hastaCtrl.setValue(today);

      // Disable datepickers
      desdeCtrl.disable({ emitEvent: false });
      hastaCtrl.disable({ emitEvent: false });

      // Automatically load data when hoy is true
      this.loadData();
    } else {
      // Enable datepickers for manual editing
      desdeCtrl.enable({ emitEvent: false });
      hastaCtrl.enable({ emitEvent: false });
    }
  }

  private formatDate(date: Date): string {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = ('0' + (d.getMonth() + 1)).slice(-2);
    const day = ('0' + d.getDate()).slice(-2);
    return `${year}-${month}-${day}`;
  }

  ngOnDestroy(): void {
    this.heladasSubscription?.unsubscribe();
    if (this.ctrlZoomTimeout) clearTimeout(this.ctrlZoomTimeout);
  }

  close(): void {
    this.dialogRef.close();
  }
}
