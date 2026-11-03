import { AfterViewInit, Component, OnDestroy, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { FeatureCollection } from 'geojson';
import * as L from 'leaflet';
import { firstValueFrom } from 'rxjs';
import { OPCIONES_GESTOS } from '../maps/gestos';
import { seguirTamanioMapa } from '../maps/map-size';
import { leyendaPlegable } from '../maps/leyenda-plegable';
import { ZonaProductiva, alternarZona, cargarCapasZonas, crearZonasProductivas, ESTILO_PROVINCIAS } from '../maps/zonas-productivas';
import { KmzLayerService } from '../services/kmz-layer.service';

/**
 * Capa de NASA GIBS (https://gibs.earthdata.nasa.gov): mosaicos WMTS gratuitos y sin clave.
 * El nivel máximo y la paleta salen del catálogo WMTSCapabilities.xml y de /colormaps/v1.3/.
 */
interface CapaSatelital {
  id: string;
  titulo: string;
  detalle: string;
  /** Último nivel de zoom con mosaicos propios (GoogleMapsCompatible_LevelN). */
  nivelMaximo: number;
  leyenda: { titulo: string; colores: string[]; min: string; max: string };
}

const CAPAS: CapaSatelital[] = [
  {
    id: 'MODIS_Terra_NDVI_8Day',
    titulo: 'NDVI (vegetación)',
    detalle: 'MODIS Terra, compuesto de 8 días, 250 m',
    nivelMaximo: 9,
    leyenda: {
      titulo: 'NDVI',
      colores: ['#f1ecec', '#cdba9f', '#9d7c5f', '#a0c031', '#64a601', '#1d7501', '#001801'],
      min: '0',
      max: '1'
    }
  },
  {
    id: 'SMAP_L4_Analyzed_Surface_Soil_Moisture',
    titulo: 'Humedad del suelo superficial',
    detalle: 'SMAP nivel 4, primeros 5 cm, 9 km',
    nivelMaximo: 6,
    leyenda: {
      titulo: 'Humedad (m³/m³)',
      colores: ['#ffa200', '#ffdb00', '#d5ea00', '#41a000', '#00ab57', '#00f9f3', '#0082ff', '#0000f4', '#00009a'],
      min: '0',
      max: '0,55'
    }
  },
  {
    id: 'SMAP_L4_Analyzed_Root_Zone_Soil_Moisture',
    titulo: 'Humedad del suelo en la zona de raíces',
    detalle: 'SMAP nivel 4, hasta 1 m, 9 km',
    nivelMaximo: 6,
    leyenda: {
      titulo: 'Humedad (m³/m³)',
      colores: ['#ffa200', '#ffdb00', '#d5ea00', '#41a000', '#00ab57', '#00f9f3', '#0082ff', '#0000f4', '#00009a'],
      min: '0',
      max: '0,55'
    }
  }
];

@Component({
  selector: 'app-map-ndvi',
  templateUrl: './map-ndvi.component.html',
  styleUrls: ['./map-ndvi.component.css'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCheckboxModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule
  ],
  encapsulation: ViewEncapsulation.None
})
export class MapNdviComponent implements AfterViewInit, OnDestroy {
  /** Deja de observar el tamaño del contenedor del mapa (ver seguirTamanioMapa). */
  private dejarDeSeguirTamanio?: () => void;
  readonly capas = CAPAS;
  /** Ayer: GIBS publica con uno o más días de atraso. */
  readonly fechaMaxima = this.aIso(new Date(Date.now() - 86400000));
  form: FormGroup;
  map?: L.Map;
  baseMapsList = [
    {
      value: 'osm',
      layer: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: 'OpenStreetMap contributors'
      })
    },
    {
      value: 'esri',
      layer: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles © Esri'
      })
    }
  ];
  currentBaseLayer = this.baseMapsList[0].layer;
  capaSatelital?: L.TileLayer;
  zoneLayers: ZonaProductiva[] = crearZonasProductivas();
  provincesLayer: L.GeoJSON | null = null;
  // Arranca en true: la primera capa se pide en ngAfterViewInit.
  cargando = true;
  sinImagen = false;
  private leyenda?: L.Control;

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    private kmzLayerService: KmzLayerService,
    public dialogRef: MatDialogRef<MapNdviComponent>
  ) {
    this.form = this.fb.group({
      capa: [CAPAS[0].id],
      // Vacía: la imagen más reciente que tenga GIBS.
      fecha: [''],
      opacidad: [80],
      baseMap: [this.baseMapsList[0].value]
    });
  }

  get capaActual(): CapaSatelital {
    return CAPAS.find(c => c.id === this.form.value.capa) ?? CAPAS[0];
  }

  async ngAfterViewInit() {
    this.map = L.map('ndviMapContainer', {
      center: [-27, -65],
      zoom: 8,
      maxZoom: 13,
      ...OPCIONES_GESTOS   // gestos táctiles y Ctrl+rueda (ver maps/gestos.ts)
    });
    this.dejarDeSeguirTamanio = seguirTamanioMapa(this.map);

    this.currentBaseLayer.addTo(this.map);
    this.map.createPane('satelitePane').style.zIndex = '350';
    this.map.createPane('zonePane').style.zIndex = '450';
    this.mostrarCapa();
    await this.loadProvinces();
    await cargarCapasZonas(this.zoneLayers, this.kmzLayerService);
  }

  /** Reemplaza la capa satelital según la capa, la fecha y la opacidad elegidas. */
  mostrarCapa(): void {
    if (!this.map) return;
    if (this.capaSatelital) {
      this.map.removeLayer(this.capaSatelital);
    }

    const capa = this.capaActual;
    const fecha = this.form.value.fecha || 'default';
    this.sinImagen = false;
    this.cargando = true;
    let mosaicosConError = 0;

    this.capaSatelital = L.tileLayer(
      `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${capa.id}/default/${fecha}/GoogleMapsCompatible_Level${capa.nivelMaximo}/{z}/{y}/{x}.png`,
      {
        pane: 'satelitePane',
        maxNativeZoom: capa.nivelMaximo,
        maxZoom: 13,
        opacity: this.form.value.opacidad / 100,
        attribution: 'Imágenes: NASA EOSDIS GIBS'
      }
    )
      .on('tileerror', () => mosaicosConError++)
      .on('load', () => {
        this.cargando = false;
        // Fuera del período de la imagen GIBS responde 404 en todos los mosaicos.
        this.sinImagen = mosaicosConError > 0;
      })
      .addTo(this.map);

    this.actualizarLeyenda(capa);
  }

  cambiarOpacidad(): void {
    this.capaSatelital?.setOpacity(this.form.value.opacidad / 100);
  }

  usarMasReciente(): void {
    this.form.patchValue({ fecha: '' });
    this.mostrarCapa();
  }

  private actualizarLeyenda(capa: CapaSatelital): void {
    if (!this.map) return;
    this.leyenda?.remove();
    this.leyenda = new L.Control({ position: 'bottomright' });
    this.leyenda.onAdd = () => {
      const div = L.DomUtil.create('div', 'info legend ndvi-leyenda');
      div.innerHTML = `
        <strong>${capa.leyenda.titulo}</strong>
        <div class="ndvi-leyenda__barra" style="background: linear-gradient(90deg, ${capa.leyenda.colores.join(', ')})"></div>
        <div class="ndvi-leyenda__valores"><span>${capa.leyenda.min}</span><span>${capa.leyenda.max}</span></div>
      `;
      return leyendaPlegable(div);
    };
    this.leyenda.addTo(this.map);
  }

  toggleZoneLayer(zone: ZonaProductiva, selected: boolean): void {
    alternarZona(this.map, zone, selected);
  }

  private async loadProvinces(): Promise<void> {
    try {
      const provincesData = await firstValueFrom(
        this.http.get<FeatureCollection>('../../assets/shapes/provincias.geojson')
      );
      this.provincesLayer = L.geoJSON(provincesData, {
        style: ESTILO_PROVINCIAS,
        onEachFeature: (feature, layer) => {
          const name = feature.properties?.['nam'];
          if (name) layer.bindPopup(name);
        }
      });
      if (this.map) {
        this.provincesLayer.addTo(this.map);
      }
    } catch (error) {
      console.error('Error al cargar provincias:', error);
    }
  }

  onBaseMapChange(): void {
    const selectedBase = this.baseMapsList.find(b => b.value === this.form.value.baseMap);
    if (selectedBase && this.map) {
      this.map.removeLayer(this.currentBaseLayer);
      this.currentBaseLayer = selectedBase.layer;
      this.currentBaseLayer.addTo(this.map);
    }
  }

  private aIso(fecha: Date): string {
    const mes = ('0' + (fecha.getMonth() + 1)).slice(-2);
    const dia = ('0' + fecha.getDate()).slice(-2);
    return `${fecha.getFullYear()}-${mes}-${dia}`;
  }

  ngOnDestroy(): void {
    this.dejarDeSeguirTamanio?.();
    this.map?.remove();
  }

  close(): void {
    this.dialogRef.close();
  }
}
