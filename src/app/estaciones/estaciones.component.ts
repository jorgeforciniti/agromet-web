import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import * as L from 'leaflet';
import { Subscription } from 'rxjs';
import { OPCIONES_GESTOS } from '../maps/gestos';
import { seguirTamanioMapa } from '../maps/map-size';
import { encuadrarTucuman, LIMITES_TUCUMAN } from '../maps/encuadre';
import { formatDecimal } from '../pipes/valor.pipe';
import { WeatherService, WeatherStation } from '../services/weather.service';
import { MAX_FAVORITAS, StationService } from '../services/station.service';
import { FichaEstacionService } from '../services/ficha-estacion.service';
import { estadoComunicacion, EstadoComunicacion, leerFechaEstacion } from '../shared/estado-estacion';
import { leyendaEstados } from '../maps/leyenda-estados';
import { agregarMapaBase, cargarProvincias } from '../maps/mapa-base';
import { escaparHtml, popupEstacion } from '../maps/popup';
import { ComoSeLeeComponent } from '../shared/como-se-lee.component';

/** Columnas por las que se puede ordenar la lista (D1 del informe de mejoras) */
export type ColumnaOrden = 'nombre' | 'temp' | 'hum' | 'rain' | 'updated';

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
  '4': 'Valles de Altura',
  '5': 'Provincias Adyacentes'
};


@Component({
  selector: 'app-estaciones',
  standalone: true,
  imports: [CommonModule, ComoSeLeeComponent],
  templateUrl: './estaciones.component.html',
  styleUrl: './estaciones.component.css'
})
export class EstacionesComponent implements OnInit, AfterViewInit, OnDestroy {
  /** Deja de observar el tamaño del contenedor del mapa (ver seguirTamanioMapa). */
  private dejarDeSeguirTamanio?: () => void;
  stations: StationRow[] = [];

  /** Orden de la lista: por nombre al entrar; los valores, de mayor a menor en el primer clic */
  orden: { columna: ColumnaOrden; asc: boolean } = { columna: 'nombre', asc: true };
  loading = true;
  error: string | null = null;
  selectedStationId: string | null = null;

  private map: L.Map | undefined;
  private markers = new Map<string, L.Marker>();

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

  /** Favorita: el mismo marcador, en dorado (ver .marcador-favorita en styles.css) */
  private readonly favIcon = L.icon({
    iconUrl: 'assets/icons/red-marker.png',
    iconSize: [27, 27],
    iconAnchor: [13, 27],
    popupAnchor: [0, -22],
    className: 'marcador-favorita'
  });

  /** Aviso breve cuando no se puede agregar otra favorita */
  avisoFavoritas = '';
  private subFavoritas?: Subscription;
  private avisoTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private weatherService: WeatherService,
    readonly stationService: StationService,
    private fichaEstacion: FichaEstacionService,
    private http: HttpClient
  ) { }

  ngOnInit(): void {
    // Al iniciar o cerrar sesión cambia el juego de favoritas: se repintan marcadores y popups
    this.subFavoritas = this.stationService.favoritas$.subscribe(() => this.actualizarMarcadores());

    this.weatherService.getStationsAll().subscribe({
      next: (stations) => {
        this.stations = stations
          .filter(s => (s.habilitada ?? 0) > 0)
          .map(s => this.toRow(s));
        this.aplicarOrden();
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

  /** Solo un conteo, no compara valores entre estaciones con distinta antigüedad de dato. */
  get reportingTodayCount(): number {
    const todayStr = this.formatDateYMD(new Date());
    return this.stations.filter(s => (s.fecha_I ?? '').startsWith(todayStr)).length;
  }

  private formatDateYMD(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /** Hora de la última medición si es de hoy; si es más vieja, el día (así se nota el atraso). */
  horaLabel(fecha: Date | null): string {
    if (!fecha || isNaN(fecha.getTime())) return '—';
    const pad = (n: number) => String(n).padStart(2, '0');
    return this.formatDateYMD(fecha) === this.formatDateYMD(new Date())
      ? `${pad(fecha.getHours())}:${pad(fecha.getMinutes())}`
      : `${pad(fecha.getDate())}/${pad(fecha.getMonth() + 1)}`;
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
      updated: leerFechaEstacion(s.fecha_I)
    };
  }

  ngOnDestroy(): void {
    this.subFavoritas?.unsubscribe();
    clearTimeout(this.avisoTimer);
    this.dejarDeSeguirTamanio?.();
    this.map?.remove();
  }

  private initMap(): void {
    this.map = L.map('estaciones-map', {
      center: LIMITES_TUCUMAN.getCenter(),
      zoom: 7,
      ...OPCIONES_GESTOS   // gestos táctiles y Ctrl+rueda (ver maps/gestos.ts)
    });
    this.dejarDeSeguirTamanio = seguirTamanioMapa(this.map);

    const control = agregarMapaBase(this.map);
    void cargarProvincias(this.map, this.http, { control });

    encuadrarTucuman(this.map);
    // #f94c3c: el rojo de assets/icons/red-marker.png
    leyendaEstados({ color: '#f94c3c', forma: 'pin' }).addTo(this.map);

    // Botones "favorita" y "Ver ficha" de los popups (el contenido del popup es HTML de Leaflet)
    L.DomEvent.on(this.map.getContainer(), 'click', (e: Event) => {
      const objetivo = e.target as HTMLElement;
      const fav = objetivo.closest<HTMLElement>('.popup-fav');
      if (fav?.dataset['id']) this.alternarFavorita(fav.dataset['id']);
      const ficha = objetivo.closest<HTMLElement>('.popup-ficha');
      if (ficha?.dataset['id']) void this.abrirFicha(ficha.dataset['id']);
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
        icon: this.iconoPara(station.Identificacion)
      }).addTo(this.map!);

      marker.bindPopup(this.popupHtml(station, lat, lon), { autoPanPadding: [24, 24] });

      marker.on('click', () => this.selectStation(station.Identificacion));

      if (station.Identificacion) {
        this.markers.set(station.Identificacion, marker);
      }
    });

    // Al entrar, la estación activa del sitio queda marcada (sin abrir su popup)
    const activa = this.stationService.activa;
    if (!this.selectedStationId && this.markers.has(activa)) {
      this.selectedStationId = activa;
      this.markers.get(activa)!.setIcon(this.blueIcon);
    }
  }

  private actualizarMarcadores(): void {
    this.markers.forEach((marker, id) => {
      marker.setIcon(this.iconoPara(id));
      const station = this.stations.find(s => s.Identificacion === id);
      if (station) {
        marker.setPopupContent(this.popupHtml(station, parseFloat(station.lat), parseFloat(station.lon)));
      }
    });
  }

  /** Ícono por selección, favorita y estado de comunicación (ver .marcador--* en styles.css) */
  private iconoPara(id: string): L.Icon {
    const base = id === this.selectedStationId ? this.blueIcon
      : this.stationService.esFavorita(id) ? this.favIcon : this.redIcon;
    const estado = this.estadoDe(id);
    if (estado === 'al-dia') return base;
    const clave = `${base.options.iconUrl}|${base.options.className ?? ''}|${estado}`;
    let icono = this.iconosEstado.get(clave);
    if (!icono) {
      icono = L.icon({ ...base.options, className: [base.options.className, `marcador--${estado}`].filter(Boolean).join(' ') });
      this.iconosEstado.set(clave, icono);
    }
    return icono;
  }

  private readonly iconosEstado = new Map<string, L.Icon>();

  private estadoDe(id: string): EstadoComunicacion {
    return estadoComunicacion(this.stations.find(s => s.Identificacion === id)?.updated ?? null);
  }

  private popupHtml(station: StationRow, lat: number, lon: number): string {
    const location = this.locationLabel(station);
    const zona = this.zonaLabel(station.zona);
    const altura = station.alt != null ? station.alt + ' msnm' : 'S/D';
    const fav = this.stationService.esFavorita(station.Identificacion);
    return popupEstacion({
      titulo: station.nombre,
      subtitulos: [
        location ? `${location}${zona ? ' · ' + zona : ''}` : '',
        `Lat: ${formatDecimal(lat, 2)}° · Lon: ${formatDecimal(lon, 2)}° · ${altura}`
      ],
      filas: [
        { etiqueta: 'Temperatura', valor: station.temp !== null ? formatDecimal(station.temp, 1) + ' °C' : '—' },
        { etiqueta: 'Humedad', valor: station.hum !== null ? formatDecimal(station.hum, 0) + ' %' : '—' },
        { etiqueta: 'Lluvia hoy', valor: station.rain !== null ? formatDecimal(station.rain, 1) + ' mm' : '—' }
      ],
      actualizado: station.updated,
      botonesExtra: `<button type="button" class="popup-fav${fav ? ' is-fav' : ''}" data-id="${escaparHtml(station.Identificacion)}"` +
        ` aria-pressed="${fav}">${fav ? '★ Favorita' : '☆ Agregar a favoritas'}</button>`,
      ficha: { id: station.Identificacion, lat, lon }
    });
  }

  /** Ficha de la estación (ubicación, último dato, sensores y accesos a las herramientas). */
  async abrirFicha(id: string, evento?: Event): Promise<void> {
    evento?.stopPropagation();
    const estacion = this.stations.find(s => s.Identificacion === id);
    if (estacion) await this.fichaEstacion.abrir(estacion);
  }

  ordenarPor(columna: ColumnaOrden): void {
    this.orden = this.orden.columna === columna
      ? { columna, asc: !this.orden.asc }
      : { columna, asc: columna === 'nombre' };
    this.aplicarOrden();
  }

  /** Valor de aria-sort del encabezado */
  ariaSort(columna: ColumnaOrden): string {
    return this.orden.columna !== columna ? 'none' : this.orden.asc ? 'ascending' : 'descending';
  }

  /**
   * Ordena la lista; las estaciones sin dato quedan siempre al final. Al ordenar por un valor,
   * también las que no reportaron hoy: su último valor es viejo y no se compara con los actuales.
   */
  private aplicarOrden(): void {
    const { columna, asc } = this.orden;
    const signo = asc ? 1 : -1;
    const valor = (s: StationRow): number | null => {
      if (columna === 'updated') return s.updated ? s.updated.getTime() : null;
      if (estadoComunicacion(s.updated) === 'sin-datos-hoy') return null;
      return s[columna as 'temp' | 'hum' | 'rain'] ?? null;
    };
    this.stations = [...this.stations].sort((a, b) => {
      if (columna === 'nombre') return signo * (a.nombre || '').localeCompare(b.nombre || '');
      const va = valor(a);
      const vb = valor(b);
      if (va === null || vb === null) return va === vb ? 0 : va === null ? 1 : -1;
      return signo * (va - vb) || (a.nombre || '').localeCompare(b.nombre || '');
    });
  }

  /** Estrella de la lista o del popup. */
  alternarFavorita(id: string, evento?: Event): void {
    evento?.stopPropagation();
    if (!this.stationService.alternarFavorita(id)) {
      this.mostrarAviso(`Podés tener hasta ${MAX_FAVORITAS} favoritas. Quitá alguna para agregar otra.`);
      return;
    }
    const station = this.stations.find(s => s.Identificacion === id);
    const marker = this.markers.get(id);
    if (station && marker) {
      marker.setIcon(this.iconoPara(id));
      marker.setPopupContent(this.popupHtml(station, parseFloat(station.lat), parseFloat(station.lon)));
    }
  }

  private mostrarAviso(texto: string): void {
    this.avisoFavoritas = texto;
    clearTimeout(this.avisoTimer);
    this.avisoTimer = setTimeout(() => this.avisoFavoritas = '', 5000);
  }

  /**
   * Marca la estación en el mapa y en la lista. Desde la lista, en pantallas angostas (mapa
   * arriba de la lista) lleva el mapa a la vista; desde el mapa, desplaza la lista hasta la fila.
   */
  selectStation(id: string, desdeLista = false): void {
    this.selectedStationId = id;
    this.stationService.setActiva(id);
    if (desdeLista) {
      this.mostrarMapa();
    } else {
      this.mostrarFila(id);
    }
    const station = this.stations.find(s => s.Identificacion === id);
    const marker = this.markers.get(id);

    if (!station || !marker || !this.map) return;

    this.markers.forEach((m, mid) => m.setIcon(this.iconoPara(mid)));

    // Sin cambiar el zoom: el autoPan del popup corre el mapa sólo si la estación queda
    // fuera de la vista o el popup se cortaría.
    marker.openPopup();
  }

  private mostrarMapa(): void {
    const contenedor = this.map?.getContainer();
    if (!contenedor) return;
    const r = contenedor.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) {
      contenedor.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  /** Desplaza sólo el contenedor de la lista (no la página) para que la fila quede visible. */
  private mostrarFila(id: string): void {
    const fila = document.getElementById('estacion-' + id);
    const lista = fila?.closest('.tabla-fija') as HTMLElement | null;
    if (!fila || !lista || lista.scrollHeight <= lista.clientHeight) return;
    const encabezado = lista.querySelector('thead')?.offsetHeight ?? 0;
    const top = fila.offsetTop - encabezado;
    if (top < lista.scrollTop || fila.offsetTop + fila.offsetHeight > lista.scrollTop + lista.clientHeight) {
      lista.scrollTo({ top: Math.max(0, top - 8), behavior: 'smooth' });
    }
  }
}
