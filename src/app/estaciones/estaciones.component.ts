import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import * as L from 'leaflet';
import { Subscription } from 'rxjs';
import { OPCIONES_GESTOS } from '../maps/gestos';
import { seguirTamanioMapa } from '../maps/map-size';
import { encuadrarTucuman, LIMITES_TUCUMAN } from '../maps/encuadre';
import { formatDecimal } from '../pipes/valor.pipe';
import { WeatherService, WeatherStation } from '../services/weather.service';
import { MAX_FAVORITAS, StationService } from '../services/station.service';
import { estadoComunicacion, EstadoComunicacion, leerFechaEstacion, textoActualizado } from '../shared/estado-estacion';
import { leyendaEstados } from '../maps/leyenda-estados';

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
  imports: [CommonModule],
  templateUrl: './estaciones.component.html',
  styleUrl: './estaciones.component.css'
})
export class EstacionesComponent implements OnInit, AfterViewInit, OnDestroy {
  /** Deja de observar el tamaño del contenedor del mapa (ver seguirTamanioMapa). */
  private dejarDeSeguirTamanio?: () => void;
  stations: StationRow[] = [];
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
    readonly stationService: StationService
  ) { }

  ngOnInit(): void {
    // Al iniciar o cerrar sesión cambia el juego de favoritas: se repintan marcadores y popups
    this.subFavoritas = this.stationService.favoritas$.subscribe(() => this.actualizarMarcadores());

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

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 18
    }).addTo(this.map);

    encuadrarTucuman(this.map);
    // #f94c3c: el rojo de assets/icons/red-marker.png
    leyendaEstados({ color: '#f94c3c', forma: 'pin' }).addTo(this.map);

    // Botón "favorita" de los popups (el contenido del popup es HTML de Leaflet)
    L.DomEvent.on(this.map.getContainer(), 'click', (e: Event) => {
      const boton = (e.target as HTMLElement).closest<HTMLElement>('.popup-fav');
      if (boton?.dataset['id']) this.alternarFavorita(boton.dataset['id']);
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
    return `
      <div class="station-popup">
        <h4>${station.nombre}</h4>
        ${location ? `<div class="popup-location">${location}${zona ? ' · ' + zona : ''}</div>` : ''}
        <div class="popup-location popup-location--coords">Lat: ${formatDecimal(lat, 2)}° · Lon: ${formatDecimal(lon, 2)}° · ${altura}</div>
        <div class="popup-grid">
          <div>Temperatura: ${station.temp !== null ? formatDecimal(station.temp, 1) + ' °C' : '—'}</div>
          <div>Humedad: ${station.hum !== null ? formatDecimal(station.hum, 0) + ' %' : '—'}</div>
          <div>Lluvia hoy: ${station.rain !== null ? formatDecimal(station.rain, 1) + ' mm' : '—'}</div>
        </div>
        <div class="popup-actualizado popup-actualizado--${estadoComunicacion(station.updated)}">${textoActualizado(station.updated)}</div>
        <button type="button" class="popup-fav${fav ? ' is-fav' : ''}" data-id="${station.Identificacion}"
          aria-pressed="${fav}">${fav ? '★ Favorita' : '☆ Agregar a favoritas'}</button>
      </div>
    `;
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
