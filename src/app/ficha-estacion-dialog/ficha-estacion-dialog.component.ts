import { AfterViewInit, Component, ElementRef, Inject, OnDestroy, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import * as L from 'leaflet';
import { WeatherStation } from '../services/weather.service';
import { StationService } from '../services/station.service';
import { OPCIONES_GESTOS } from '../maps/gestos';
import { seguirTamanioMapa } from '../maps/map-size';
import { ZOOM_TUCUMAN } from '../maps/encuadre';
import { formatDecimal } from '../pipes/valor.pipe';
import { Herramienta } from '../shared/enlace-consulta';
import { estadoComunicacion, EstadoComunicacion, leerFechaEstacion, textoActualizado } from '../shared/estado-estacion';

const ZONAS: Record<string, string> = {
  '1': 'Llanura Tucumana',
  '2': 'Pedemonte Tucumano',
  '3': 'Valles Intermontanos',
  '4': 'Valles Intermontanos',
  '5': 'Provincias Adyacentes'
};

interface Acceso {
  herramienta: Herramienta;
  texto: string;
  icono: string;
}

/** Herramientas que se abren con la estación ya elegida (/datos?herramienta=…&estacion=…) */
const ACCESOS: Acceso[] = [
  { herramienta: 'datos-localidad', texto: 'Datos diarios y resumen', icono: 'insights' },
  { herramienta: 'comparar-anios', texto: 'Comparar con otro año', icono: 'compare_arrows' },
  { herramienta: 'horas-frio', texto: 'Horas de frío', icono: 'ac_unit' },
  { herramienta: 'suma-termica', texto: 'Sumas térmicas', icono: 'functions' },
  { herramienta: 'fenologia', texto: 'Por estadíos fenológicos', icono: 'eco' },
  { herramienta: 'balance-hidrico', texto: 'Balance hidrológico', icono: 'water' },
  { herramienta: 'enfermedades', texto: 'Condiciones para enfermedades', icono: 'biotech' }
];

/**
 * Ficha de una estación (A4 del informe de mejoras): ubicación, último dato con su estado,
 * sensores y accesos a las herramientas con esa estación ya elegida. Se abre desde la Red de
 * estaciones (tabla y popup del mapa).
 */
@Component({
  selector: 'app-ficha-estacion-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatIconModule],
  templateUrl: './ficha-estacion-dialog.component.html',
  styleUrls: ['./ficha-estacion-dialog.component.css']
})
export class FichaEstacionDialogComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapa') private mapaRef!: ElementRef<HTMLDivElement>;

  private readonly router = inject(Router);
  private readonly stationService = inject(StationService);
  private mapa?: L.Map;
  private dejarDeSeguirTamanio?: () => void;

  readonly accesos = ACCESOS;
  readonly lat: number;
  readonly lon: number;
  readonly lugar: string;
  readonly zona: string;
  readonly actualizado: string;
  readonly estado: EstadoComunicacion;
  readonly medidas: { etiqueta: string; valor: string }[];
  readonly sensores: { etiqueta: string; tiene: boolean | null }[];

  constructor(
    @Inject(MAT_DIALOG_DATA) public readonly e: WeatherStation,
    private readonly dialogRef: MatDialogRef<FichaEstacionDialogComponent>
  ) {
    this.lat = Number(e.lat);
    this.lon = Number(e.lon);
    this.lugar = [e.Localidad, e.departamento, e.provincia].filter(Boolean).join(', ');
    this.zona = e.zona ? (ZONAS[e.zona] ?? '') : '';
    const fecha = leerFechaEstacion(e.fecha_I);
    this.actualizado = textoActualizado(fecha);
    this.estado = estadoComunicacion(fecha);
    // Mismos rangos físicos que la Red: descarta errores del sensor
    this.medidas = [
      { etiqueta: 'Temperatura', valor: this.valor(e.temp_af, -25, 55, 1, ' °C') },
      { etiqueta: 'Humedad', valor: this.valor(e.hum_af, 0, 100, 0, ' %') },
      { etiqueta: 'Lluvia hoy', valor: this.valor(e.RR_dia, 0, 400, 1, ' mm') },
      { etiqueta: 'Viento medio', valor: this.valor(e.viento_medio, 0, 200, 0, ' km/h') }
    ];
    this.sensores = [
      { etiqueta: 'Radiación solar', tiene: this.sensor(e.isRadiation) },
      { etiqueta: 'Suelo', tiene: this.sensor(e.isSoil) }
    ];
  }

  ngAfterViewInit(): void {
    if (!Number.isFinite(this.lat) || !Number.isFinite(this.lon) || (!this.lat && !this.lon)) return;
    // Zoom común de los mapas, centrado en la estación: se ve dónde queda dentro de la provincia
    this.mapa = L.map(this.mapaRef.nativeElement, { center: [this.lat, this.lon], zoom: ZOOM_TUCUMAN, ...OPCIONES_GESTOS });
    this.dejarDeSeguirTamanio = seguirTamanioMapa(this.mapa);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 18 }).addTo(this.mapa);
    L.circleMarker([this.lat, this.lon], { radius: 8, color: '#ffffff', weight: 2, fillColor: '#f94c3c', fillOpacity: 1 })
      .addTo(this.mapa);
  }

  ngOnDestroy(): void {
    this.dejarDeSeguirTamanio?.();
    this.mapa?.remove();
  }

  fmt(n: number, decimales: number): string {
    return formatDecimal(n, decimales);
  }

  /** Abre la herramienta con esta estación: pasa a ser la activa y se ejecuta la consulta. */
  abrir(a: Acceso): void {
    this.stationService.setActiva(this.e.Identificacion);
    this.dialogRef.close();
    void this.router.navigate(['/datos'], { queryParams: { herramienta: a.herramienta, estacion: this.e.Identificacion } });
  }

  cerrar(): void {
    this.dialogRef.close();
  }

  private valor(v: string | undefined, min: number, max: number, decimales: number, unidad: string): string {
    const n = parseFloat(v ?? '');
    return isNaN(n) || n < min || n > max ? '—' : formatDecimal(n, decimales) + unidad;
  }

  /** 1/"1" = tiene; 0/"0" = no tiene; sin dato = null (no se afirma nada) */
  private sensor(v: number | string | undefined): boolean | null {
    if (v === undefined || v === null || v === '') return null;
    return Number(v) > 0;
  }
}
