import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, map, shareReplay } from 'rxjs';

export interface Informe {
  id: number;
  titulo: string;
  archivo: string;
  creado: string;
  categoria: string;
  posicion: number;
  url_img: string;
}

export interface FiltroInformes {
  categoria?: string;
  anio?: string;
  q?: string;
  /** Cursor que devolvió la página anterior en `siguiente`. */
  despues?: string;
  limite?: number;
}

export interface InformesResponse {
  /** 'resumen' (sin filtros): los últimos 3 de cada categoría. 'lista': una página de resultados. */
  modo: 'resumen' | 'lista';
  data: Informe[];
  total: number;
  siguiente: string | null;
  /** Años con informes, para el selector. */
  anios: number[];
}

@Injectable({
  providedIn: 'root'
})
export class DatosService {
  private apiUrl = 'https://agromet.eeaoc.gob.ar/services/informes-v2.php';
  // API anterior: devuelve todo junto (con corte por antigüedad para lluvias y heladas).
  // Se usa si informes-v2.php todavía no está publicado o falla.
  private apiAnterior = 'https://agromet.eeaoc.gob.ar/services/informes.php';
  private informesAnteriores$?: Observable<Informe[]>;
  private usarAnterior = false;

  constructor(private http: HttpClient) { }

  getInformes(filtro: FiltroInformes = {}): Observable<InformesResponse> {
    let params = new HttpParams();
    for (const [clave, valor] of Object.entries(filtro)) {
      if (valor !== undefined && valor !== null && valor !== '') {
        params = params.set(clave, String(valor));
      }
    }
    if (this.usarAnterior) return this.informesDeRespaldo(filtro);
    return this.http.get<InformesResponse>(this.apiUrl, { params }).pipe(
      map(resp => {
        if (!resp || !Array.isArray(resp.data) || !resp.modo) throw new Error('Respuesta inesperada');
        return resp;
      }),
      catchError(() => {
        this.usarAnterior = true;
        return this.informesDeRespaldo(filtro);
      })
    );
  }

  /** Arma la misma respuesta que informes-v2.php filtrando en el navegador la lista de la API anterior. */
  private informesDeRespaldo(filtro: FiltroInformes): Observable<InformesResponse> {
    this.informesAnteriores$ ??= this.http.get<{ data: Informe[] }>(this.apiAnterior).pipe(
      map(resp => resp.data.filter(i => CATEGORIAS_INFORMES.includes(i.categoria))),
      shareReplay(1)
    );
    return this.informesAnteriores$.pipe(map(todos => filtrarInformes(todos, filtro)));
  }
}

const CATEGORIAS_INFORMES = ['ll', 'he', 'bo', 'co', 'ad', 'rv', 'et', 'ta'];

const masNuevoPrimero = (a: Informe, b: Informe) => b.creado.localeCompare(a.creado) || b.id - a.id;

function filtrarInformes(todos: Informe[], filtro: FiltroInformes): InformesResponse {
  const { categoria = '', anio = '', q = '', despues = '', limite = 20 } = filtro;
  const anios = [...new Set(
    todos.filter(i => !categoria || i.categoria === categoria).map(i => +i.creado.slice(0, 4))
  )].sort((a, b) => b - a);

  if (!categoria && !anio && !q.trim()) {
    const data = CATEGORIAS_INFORMES
      .flatMap(c => todos.filter(i => i.categoria === c).sort(masNuevoPrimero).slice(0, 3))
      .sort(masNuevoPrimero);
    return { modo: 'resumen', data, total: data.length, siguiente: null, anios };
  }

  const palabras = q.toLocaleLowerCase('es').split(/\s+/).filter(Boolean);
  let lista = todos
    .filter(i => !categoria || i.categoria === categoria)
    .filter(i => !anio || i.creado.startsWith(anio))
    .filter(i => palabras.every(p => i.titulo.toLocaleLowerCase('es').includes(p)))
    .sort(masNuevoPrimero);
  const total = lista.length;
  if (despues) {
    const [fecha, id] = despues.split('_');
    lista = lista.filter(i => i.creado.slice(0, 10) < fecha || (i.creado.slice(0, 10) === fecha && i.id < +id));
  }
  const data = lista.slice(0, limite);
  const ultimo = data[data.length - 1];
  const siguiente = lista.length > limite && ultimo ? `${ultimo.creado.slice(0, 10)}_${ultimo.id}` : null;
  return { modo: 'lista', data, total, siguiente, anios };
}
