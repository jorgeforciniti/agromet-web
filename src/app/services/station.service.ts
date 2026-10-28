import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { WeatherStation } from './weather.service';

/** Estación inicial cuando el usuario todavía no eligió ninguna */
export const ESTACION_INICIAL = '2049'; // El Colmenar

/** Máximo de favoritas: más que esto deja de ser un acceso rápido */
export const MAX_FAVORITAS = 8;

const CLAVE_PREFERENCIAS = 'agromet.estaciones';

/** Preferencias de estaciones que se guardan en el navegador */
interface PreferenciasEstaciones {
  favoritas: string[];
  predeterminada: string | null;
  ultima: string | null;
}

/**
 * Estación activa, favoritas y predeterminada.
 *
 * - Activa: la estación con la que se está trabajando. Es una sola para todo el sitio:
 *   cada herramienta arranca con ella y, si el usuario elige otra, pasa a ser la activa.
 * - Predeterminada: la que se carga al entrar al sitio (una sola, opcional).
 * - Favoritas: las estaciones de interés del usuario, en el orden en que las marcó.
 *
 * Por ahora se guardan sólo en este navegador (localStorage); la lectura y la escritura
 * toleran que el almacenamiento no esté disponible (modo privado, bloqueado).
 */
@Injectable({
  providedIn: 'root'
})
export class StationService {
  private selectedStationSubject = new BehaviorSubject<WeatherStation | null>(null);
  public selectedStation$: Observable<WeatherStation | null> = this.selectedStationSubject.asObservable();

  private readonly preferencias = this.leerPreferencias();

  private readonly activaSubject = new BehaviorSubject<string>(
    this.preferencias.predeterminada ?? this.preferencias.ultima ?? ESTACION_INICIAL
  );
  /** Identificación de la estación activa */
  readonly activa$ = this.activaSubject.asObservable();

  private readonly favoritasSubject = new BehaviorSubject<string[]>(this.preferencias.favoritas);
  readonly favoritas$ = this.favoritasSubject.asObservable();

  private readonly predeterminadaSubject = new BehaviorSubject<string | null>(this.preferencias.predeterminada);
  readonly predeterminada$ = this.predeterminadaSubject.asObservable();

  /**
   * Objeto completo de la estación seleccionada (pronóstico y visor de Estado actual).
   * Con activar=false no cambia la activa (por ejemplo, al caer en una estación de respaldo
   * porque la activa no figura en la lista de esa sección).
   */
  setSelectedStation(station: WeatherStation | null, activar = true): void {
    this.selectedStationSubject.next(station);
    if (activar && station?.Identificacion) {
      this.setActiva(station.Identificacion);
    }
  }

  getSelectedStation(): WeatherStation | null {
    return this.selectedStationSubject.value;
  }

  get activa(): string {
    return this.activaSubject.value;
  }

  /** La herramienta en uso cambió de estación: pasa a ser la activa y se recuerda. */
  setActiva(id: string | null | undefined): void {
    const valor = String(id ?? '').trim();
    if (!valor || valor === this.activaSubject.value) return;
    this.activaSubject.next(valor);
    this.guardar();
  }

  get favoritas(): string[] {
    return this.favoritasSubject.value;
  }

  get predeterminada(): string | null {
    return this.predeterminadaSubject.value;
  }

  esFavorita(id: string): boolean {
    return this.favoritasSubject.value.includes(id);
  }

  /** Agrega o quita una favorita. Devuelve false si se alcanzó el máximo y no se agregó. */
  alternarFavorita(id: string): boolean {
    const actuales = this.favoritasSubject.value;
    if (actuales.includes(id)) {
      this.favoritasSubject.next(actuales.filter(f => f !== id));
      if (this.predeterminadaSubject.value === id) {
        this.predeterminadaSubject.next(null);
      }
    } else {
      if (actuales.length >= MAX_FAVORITAS) return false;
      this.favoritasSubject.next([...actuales, id]);
    }
    this.guardar();
    return true;
  }

  /** Marca (o desmarca con null) la predeterminada; siempre es también favorita. */
  setPredeterminada(id: string | null): void {
    if (id && !this.esFavorita(id)) {
      if (this.favoritasSubject.value.length >= MAX_FAVORITAS) return;
      this.favoritasSubject.next([...this.favoritasSubject.value, id]);
    }
    this.predeterminadaSubject.next(id);
    this.guardar();
  }

  private leerPreferencias(): PreferenciasEstaciones {
    const vacias: PreferenciasEstaciones = { favoritas: [], predeterminada: null, ultima: null };
    try {
      const guardadas = JSON.parse(localStorage.getItem(CLAVE_PREFERENCIAS) ?? 'null');
      if (!guardadas || typeof guardadas !== 'object') return vacias;
      const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
      return {
        favoritas: Array.isArray(guardadas.favoritas)
          ? [...new Set(guardadas.favoritas.map(texto).filter(Boolean) as string[])].slice(0, MAX_FAVORITAS)
          : [],
        predeterminada: texto(guardadas.predeterminada),
        ultima: texto(guardadas.ultima)
      };
    } catch {
      return vacias;
    }
  }

  private guardar(): void {
    const datos: PreferenciasEstaciones = {
      favoritas: this.favoritasSubject.value,
      predeterminada: this.predeterminadaSubject.value,
      ultima: this.activaSubject.value
    };
    try {
      localStorage.setItem(CLAVE_PREFERENCIAS, JSON.stringify(datos));
    } catch {
      // Sin almacenamiento disponible: las preferencias duran sólo esta visita.
    }
  }
}
