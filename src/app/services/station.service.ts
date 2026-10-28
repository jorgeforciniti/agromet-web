import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { WeatherStation } from './weather.service';
import { AnalyticsService } from './analytics.service';

/** Estación inicial cuando el usuario todavía no eligió ninguna */
export const ESTACION_INICIAL = '2049'; // El Colmenar

/** Máximo de favoritas: más que esto deja de ser un acceso rápido */
export const MAX_FAVORITAS = 8;

const CLAVE_PREFERENCIAS = 'agromet.estaciones';
/** Copia local de las preferencias de la cuenta (se borra al cerrar sesión) */
const CLAVE_CUENTA = 'agromet.estaciones.cuenta';

/** Favoritas y predeterminada: un juego para el visitante y otro para la cuenta */
export interface FavoritasEstaciones {
  favoritas: string[];
  predeterminada: string | null;
}

/** Preferencias de estaciones que se guardan en el navegador */
interface PreferenciasEstaciones extends FavoritasEstaciones {
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
 * Hay dos juegos de favoritas/predeterminada que nunca se mezclan solos:
 * - el del visitante, en este navegador (localStorage);
 * - el de la cuenta, cuando hay sesión: lo carga y lo guarda CuentaPreferenciasService en el
 *   servidor (usarCuenta / volverAVisitante). Mientras tanto, el del visitante no se toca.
 * La estación activa (y la última usada) es una sola, con o sin sesión.
 * La lectura y la escritura toleran que el almacenamiento no esté disponible.
 */
@Injectable({
  providedIn: 'root'
})
export class StationService {
  private selectedStationSubject = new BehaviorSubject<WeatherStation | null>(null);
  public selectedStation$: Observable<WeatherStation | null> = this.selectedStationSubject.asObservable();

  private readonly analytics = inject(AnalyticsService);
  private readonly preferencias = this.leerPreferencias();

  /** Favoritas del visitante (se conservan aunque se esté usando la cuenta) */
  private visitante: FavoritasEstaciones = {
    favoritas: this.preferencias.favoritas,
    predeterminada: this.preferencias.predeterminada
  };

  /** Con sesión: a quién pertenecen las favoritas en pantalla y cómo guardarlas */
  private cuenta: { uid: string; guardar: (p: FavoritasEstaciones) => void } | null = null;

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
    this.analytics.registrar('elegir_estacion', { estacion: valor });
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
      this.analytics.registrar('agregar_favorita', { estacion: id });
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

  get enCuenta(): boolean {
    return this.cuenta !== null;
  }

  /** Favoritas del visitante en este navegador (para ofrecer pasarlas a la cuenta). */
  get favoritasVisitante(): FavoritasEstaciones {
    return { ...this.visitante };
  }

  /**
   * Pasa a mostrar las favoritas de la cuenta. Cada cambio posterior se guarda con `guardar`
   * (al servidor) y en una copia local para la próxima carga; el juego del visitante no cambia.
   */
  usarCuenta(uid: string, prefs: FavoritasEstaciones, guardar: (p: FavoritasEstaciones) => void): void {
    this.cuenta = { uid, guardar };
    const favoritas = prefs.favoritas.slice(0, MAX_FAVORITAS);
    // Lo que vino del servidor no se vuelve a enviar
    this.ultimasGuardadas = { favoritas, predeterminada: prefs.predeterminada };
    this.favoritasSubject.next(favoritas);
    this.predeterminadaSubject.next(prefs.predeterminada);
    this.guardarCopiaCuenta();
    if (prefs.predeterminada) {
      this.setActiva(prefs.predeterminada);
    }
  }

  /** Copia local de la cuenta `uid` (para mostrarla al instante mientras responde el servidor). */
  copiaCuenta(uid: string): FavoritasEstaciones | null {
    try {
      const c = JSON.parse(localStorage.getItem(CLAVE_CUENTA) ?? 'null');
      return c && c.uid === uid && Array.isArray(c.favoritas)
        ? { favoritas: c.favoritas.map(String), predeterminada: c.predeterminada ?? null }
        : null;
    } catch {
      return null;
    }
  }

  /** Sin sesión: vuelven las favoritas del visitante y se borra la copia de la cuenta. */
  volverAVisitante(): void {
    if (!this.cuenta) return;
    this.cuenta = null;
    try {
      localStorage.removeItem(CLAVE_CUENTA);
    } catch {
      // nada que borrar
    }
    this.favoritasSubject.next(this.visitante.favoritas);
    this.predeterminadaSubject.next(this.visitante.predeterminada);
  }

  private guardarCopiaCuenta(): void {
    if (!this.cuenta) return;
    try {
      localStorage.setItem(CLAVE_CUENTA, JSON.stringify({
        uid: this.cuenta.uid,
        favoritas: this.favoritasSubject.value,
        predeterminada: this.predeterminadaSubject.value
      }));
    } catch {
      // sin almacenamiento: sólo queda en el servidor
    }
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
    if (this.cuenta) {
      // Con sesión, favoritas y predeterminada son de la cuenta: al servidor y a su copia local
      const actuales = { favoritas: this.favoritasSubject.value, predeterminada: this.predeterminadaSubject.value };
      if (!this.mismas(actuales, this.ultimasGuardadas)) {
        this.ultimasGuardadas = actuales;
        this.guardarCopiaCuenta();
        this.cuenta.guardar(actuales);
      }
    } else {
      this.visitante = { favoritas: this.favoritasSubject.value, predeterminada: this.predeterminadaSubject.value };
    }
    const datos: PreferenciasEstaciones = { ...this.visitante, ultima: this.activaSubject.value };
    try {
      localStorage.setItem(CLAVE_PREFERENCIAS, JSON.stringify(datos));
    } catch {
      // Sin almacenamiento disponible: las preferencias duran sólo esta visita.
    }
  }

  /** Último juego enviado a la cuenta: evita guardar cuando sólo cambió la estación activa */
  private ultimasGuardadas: FavoritasEstaciones | null = null;

  private mismas(a: FavoritasEstaciones, b: FavoritasEstaciones | null): boolean {
    return !!b && a.predeterminada === b.predeterminada && a.favoritas.join() === b.favoritas.join();
  }
}
