import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, shareReplay } from 'rxjs';

export type FaseEnso = 'nino' | 'neutro' | 'nina';
export type IntensidadEnso = 'débil' | 'moderado' | 'fuerte' | 'muy fuerte';

export const TEMPORADAS_ENSO = ['DJF', 'JFM', 'FMA', 'MAM', 'AMJ', 'MJJ', 'JJA', 'JAS', 'ASO', 'SON', 'OND', 'NDJ'];

/** Umbral de CPC (°C) y temporadas seguidas que tiene que sostenerse para ser un episodio. */
export const UMBRAL_ENSO = 0.5;
export const TEMPORADAS_EPISODIO = 5;

export const FASE_ENSO: Record<FaseEnso, { nombre: string; color: string }> = {
  nino: { nombre: 'El Niño', color: '#dc2626' },
  neutro: { nombre: 'Neutro', color: '#a8a29e' },
  nina: { nombre: 'La Niña', color: '#2563eb' }
};

/** Una temporada de 3 meses; `mes` es el central (DJF de 1950 → enero de 1950). */
export interface TemporadaEnso {
  anio: number;
  mes: number;
  roni: number;
  fase: FaseEnso;
  /** Pico del episodio al que pertenece (|RONI| máximo); null en neutro. */
  pico: number | null;
  /** Racha que sigue abierta al final de la serie y todavía no llega a 5 temporadas. */
  provisoria: boolean;
}

export interface EstadoEnso {
  alerta: string;
  fecha_discusion: string | null;
  proxima_discusion: string | null;
  resumen: string | null;
  url: string;
}

export interface Enso {
  /** Origen de la tabla: bajada de NOAA, caché del servidor o copia fija del PHP. */
  origen: 'noaa' | 'cache' | 'fijo';
  actualizado: string;
  temporadas: TemporadaEnso[];
  estado: EstadoEnso;
}

interface RespuestaEnso {
  status: string;
  origen: Enso['origen'];
  actualizado: string;
  datos: { anio: number; valores: (number | null)[] }[];
  estado: EstadoEnso;
}

/** Intensidad del episodio según su pico, con los cortes que usa CPC. */
export function intensidadEnso(pico: number | null): IntensidadEnso | null {
  if (pico === null) return null;
  const v = Math.abs(pico);
  return v >= 2 ? 'muy fuerte' : v >= 1.5 ? 'fuerte' : v >= 1 ? 'moderado' : v >= UMBRAL_ENSO ? 'débil' : null;
}

/** «ASO 2026» para la temporada centrada en septiembre de 2026. */
export function nombreTemporada(t: { anio: number; mes: number }): string {
  return `${TEMPORADAS_ENSO[t.mes - 1]} ${t.anio}`;
}

/**
 * Clasifica cada temporada como CPC: es El Niño (La Niña) si forma parte de una racha de al menos
 * 5 temporadas seguidas con RONI ≥ +0,5 (≤ −0,5). Una racha que sigue abierta al final de la serie
 * y todavía no llega a 5 se toma como episodio en curso, marcado como provisorio (puede no completarse).
 */
export function clasificarEnso(valores: { anio: number; mes: number; roni: number }[]): TemporadaEnso[] {
  const signo = (v: number) => (v >= UMBRAL_ENSO ? 1 : v <= -UMBRAL_ENSO ? -1 : 0);
  const res: TemporadaEnso[] = valores.map((v) => ({ ...v, fase: 'neutro', pico: null, provisoria: false }));
  let i = 0;
  while (i < res.length) {
    const s = signo(res[i].roni);
    let j = i;
    while (j + 1 < res.length && signo(res[j + 1].roni) === s) j++;
    const abierta = j === res.length - 1;
    if (s !== 0 && (j - i + 1 >= TEMPORADAS_EPISODIO || abierta)) {
      const racha = res.slice(i, j + 1);
      const pico = s > 0 ? Math.max(...racha.map((t) => t.roni)) : Math.min(...racha.map((t) => t.roni));
      racha.forEach((t) => {
        t.fase = s > 0 ? 'nino' : 'nina';
        t.pico = pico;
        t.provisoria = j - i + 1 < TEMPORADAS_EPISODIO;
      });
    }
    i = j + 1;
  }
  return res;
}

/**
 * Índice RONI de NOAA CPC y estado del ENSO (enso.php). El PHP lo baja de NOAA una vez por día y,
 * si NOAA no responde, usa una copia guardada. Se pide una sola vez por visita.
 */
@Injectable({ providedIn: 'root' })
export class EnsoService {
  // `v` evita la copia que algunos navegadores guardaron antes de instalar el PHP (el servidor
  // devolvía index.html sin Cache-Control). Si se cambia la respuesta de forma incompatible, subirlo.
  private readonly url = 'https://agromet.eeaoc.gob.ar/services/enso.php?v=1';
  private enso$?: Observable<Enso>;

  constructor(private http: HttpClient) { }

  get(): Observable<Enso> {
    if (!this.enso$) {
      this.enso$ = this.http.get<RespuestaEnso>(this.url).pipe(
        map((r) => {
          if (r?.status !== 'success' || !Array.isArray(r.datos)) {
            throw new Error('El servicio del índice ENSO no respondió como se esperaba.');
          }
          const valores = r.datos.flatMap((a) =>
            a.valores.flatMap((v, i) => (v === null ? [] : [{ anio: a.anio, mes: i + 1, roni: v }]))
          );
          return { origen: r.origen, actualizado: r.actualizado, temporadas: clasificarEnso(valores), estado: r.estado };
        }),
        shareReplay(1)
      );
      // Si falla, se descarta para poder reintentar.
      this.enso$.subscribe({ error: () => (this.enso$ = undefined) });
    }
    return this.enso$;
  }
}
