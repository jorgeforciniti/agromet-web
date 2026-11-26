import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { Subject, debounceTime, filter, map, switchMap, catchError, of, tap } from 'rxjs';
import { DatosService, FiltroInformes, Informe, InformesResponse } from '../services/datos.service';

type InformeDialogInput = Partial<Informe> & {
  nombreOriginal?: string;
  nombre?: string;
  file?: string;
  pdf?: string;
  path?: string;
  url?: string;
};

interface CategoryMeta {
  /** Nombre corto: botones de filtro y etiqueta de tema en la lista */
  label: string;
  /** Ícono de Material del tema (en el verde de la marca) */
  icono: string;
}

/** Informes de un tema en la vista sin filtros (los más recientes de cada uno) */
interface TemaInformes {
  categoria: string;
  titulo: string;
  informes: Informe[];
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const POR_PAGINA = 20;

@Component({
  selector: 'app-informes',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatIconModule
  ],
  templateUrl: './informes.component.html',
  styleUrls: ['./informes.component.css']
})
export class InformesComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  informes: Informe[] = [];
  /** Vista sin filtros: los informes agrupados por tema */
  temas: TemaInformes[] = [];

  tiposInformes = [
    { value: '', viewValue: 'Todos' },
    { value: 'll', viewValue: 'Informes de lluvias' },
    { value: 'he', viewValue: 'Informes de heladas' },
    { value: 'bo', viewValue: 'Boletín agrometeorológico' },
    { value: 'co', viewValue: 'Presentaciones en congresos' },
    { value: 'ad', viewValue: 'Seguimiento de adversidades' },
    { value: 'rv', viewValue: 'Artículos en revistas' },
    { value: 'et', viewValue: 'Estadísticas agrometeorológicas' },
    { value: 'ta', viewValue: 'Talleres y reuniones técnicas' }
  ];

  private readonly categoryMeta: Record<string, CategoryMeta> = {
    ll: { label: 'Lluvias', icono: 'water_drop' },
    he: { label: 'Heladas', icono: 'ac_unit' },
    bo: { label: 'Boletín', icono: 'article' },
    co: { label: 'Congresos', icono: 'co_present' },
    ad: { label: 'Adversidades', icono: 'warning_amber' },
    rv: { label: 'Revistas', icono: 'menu_book' },
    et: { label: 'Estadísticas', icono: 'bar_chart' },
    ta: { label: 'Talleres', icono: 'groups' }
  };

  // Filtros vigentes (vienen de la URL: /informes?categoria=ll&anio=2019&q=...)
  selectedCategoria = '';
  anio = '';
  busqueda = '';
  /** Lo que está escrito en el buscador (puede no estar aplicado todavía). */
  textoBusqueda = '';

  modo: InformesResponse['modo'] = 'resumen';
  total = 0;
  anios: number[] = [];
  private siguiente: string | null = null;

  loading = true;
  cargandoMas = false;
  error = false;

  private readonly busqueda$ = new Subject<string>();
  // Descarta las páginas de "Cargar más" que llegan después de cambiar los filtros.
  private consulta = 0;

  constructor(
    private datosService: DatosService,
    private dialog: MatDialog
  ) { }

  ngOnInit() {
    this.route.queryParamMap.pipe(
      map(params => ({
        categoria: this.tiposInformes.some(t => t.value === params.get('categoria')) ? params.get('categoria')! : '',
        anio: /^\d{4}$/.test(params.get('anio') ?? '') ? params.get('anio')! : '',
        q: (params.get('q') ?? '').trim()
      })),
      tap(filtro => {
        this.selectedCategoria = filtro.categoria;
        this.anio = filtro.anio;
        this.busqueda = filtro.q;
        if (filtro.q !== this.textoBusqueda.trim()) this.textoBusqueda = filtro.q;
        this.loading = true;
        this.error = false;
        this.consulta++;
      }),
      switchMap(filtro => this.datosService.getInformes({ ...filtro, limite: POR_PAGINA }).pipe(
        catchError(() => of(null))
      )),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(resp => {
      this.loading = false;
      if (!resp) {
        this.error = true;
        this.informes = [];
        this.temas = [];
        this.total = 0;
        this.siguiente = null;
        return;
      }
      this.modo = resp.modo;
      this.informes = resp.data;
      this.temas = this.armarTemas();
      this.total = resp.total;
      this.siguiente = resp.siguiente;
      this.anios = resp.anios;
    });

    this.busqueda$.pipe(
      map(texto => texto.trim()),
      debounceTime(300),
      filter(q => q !== this.busqueda),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(q => this.actualizarUrl({ q }, true));
  }

  get hayMas(): boolean {
    return this.siguiente !== null;
  }

  get hayFiltros(): boolean {
    return !!(this.selectedCategoria || this.anio || this.busqueda);
  }

  /**
   * Sin filtros, la API trae los últimos de cada tema: se agrupan por tema, en el orden en que
   * aparecen (el primero es el del informe más reciente).
   */
  private armarTemas(): TemaInformes[] {
    const temas: TemaInformes[] = [];
    for (const informe of this.informes) {
      let tema = temas.find(t => t.categoria === informe.categoria);
      if (!tema) {
        tema = { categoria: informe.categoria, titulo: this.nombreTema(informe.categoria), informes: [] };
        temas.push(tema);
      }
      tema.informes.push(informe);
    }
    return temas;
  }

  get vistaPorTemas(): boolean {
    return this.modo === 'resumen' && !this.hayFiltros;
  }

  /** "2026-11-06" → "6 nov 2026" */
  fecha(iso: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '');
    return m ? `${Number(m[3])} ${MESES[Number(m[2]) - 1]} ${m[1]}` : iso;
  }

  /** Los títulos cargados todo en mayúsculas («HELADAS AGOSTO 2026») se muestran en minúscula. */
  tituloInforme(titulo: string): string {
    const t = (titulo ?? '').trim();
    if (!/[A-ZÁÉÍÓÚÑ]/.test(t) || t !== t.toUpperCase()) return t;
    const minusculas = t.toLocaleLowerCase('es-AR');
    return minusculas.charAt(0).toLocaleUpperCase('es-AR') + minusculas.slice(1);
  }

  get titulo(): string {
    if (!this.hayFiltros) return 'Informes';
    const tipo = this.tiposInformes.find(t => t.value === this.selectedCategoria);
    const base = this.selectedCategoria && tipo ? tipo.viewValue : 'Informes y publicaciones';
    return this.anio ? `${base} de ${this.anio}` : base;
  }

  get resumenResultados(): string {
    if (this.modo === 'resumen') return 'Los últimos de cada tema';
    const n = this.total;
    if (n === 0) return '';
    const base = n === 1 ? '1 informe' : `${n.toLocaleString('es-AR')} informes`;
    return this.informes.length < n ? `Mostrando ${this.informes.length} de ${base}` : base;
  }

  selectCategoria(value: string): void {
    // Los años disponibles cambian con la categoría.
    this.actualizarUrl({ categoria: value, anio: '' });
  }

  selectAnio(value: string): void {
    this.actualizarUrl({ anio: value });
  }

  buscar(texto: string): void {
    this.textoBusqueda = texto;
    this.busqueda$.next(texto);
  }

  limpiarFiltros(): void {
    this.actualizarUrl({ categoria: '', anio: '', q: '' });
  }

  cargarMas(): void {
    if (!this.siguiente || this.cargandoMas) return;
    const consulta = this.consulta;
    const filtro: FiltroInformes = {
      categoria: this.selectedCategoria,
      anio: this.anio,
      q: this.busqueda,
      despues: this.siguiente,
      limite: POR_PAGINA
    };
    this.cargandoMas = true;
    this.datosService.getInformes(filtro).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: resp => {
        if (consulta !== this.consulta) return;
        this.informes = [...this.informes, ...resp.data];
        this.siguiente = resp.siguiente;
        this.total = resp.total;
        this.cargandoMas = false;
      },
      error: () => {
        this.cargandoMas = false;
      }
    });
  }

  private actualizarUrl(cambios: Record<string, string>, reemplazar = false): void {
    const queryParams: Record<string, string | null> = {};
    for (const [clave, valor] of Object.entries(cambios)) {
      queryParams[clave] = valor || null;
    }
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: reemplazar
    });
  }

  categoriaLabel(categoria: string): string {
    return this.categoryMeta[categoria]?.label ?? categoria;
  }

  /** Nombre corto para los botones de filtro («Todos», «Lluvias», …) */
  etiquetaFiltro(value: string): string {
    return value ? this.categoriaLabel(value) : 'Todos';
  }

  iconoTema(categoria: string): string {
    return this.categoryMeta[categoria]?.icono ?? 'description';
  }

  /** Nombre largo del tema («Informes de lluvias») */
  nombreTema(categoria: string): string {
    return this.tiposInformes.find(t => t.value === categoria)?.viewValue ?? this.categoriaLabel(categoria);
  }

  /** Sin filtros, el informe más reciente de todos va destacado arriba (la API los ordena por fecha). */
  get destacado(): Informe | null {
    return this.vistaPorTemas ? this.informes[0] ?? null : null;
  }

  async openDialog(informe: InformeDialogInput): Promise<void> {
    const filename =
      informe?.archivo ??
      informe?.nombreOriginal ??
      informe?.nombre ??
      informe?.file ??
      informe?.pdf ??
      informe?.path ??
      informe?.url;

    if (!filename || typeof filename !== 'string') {
      console.error('[openDialog] Informe sin archivo válido:', informe);
      return;
    }

    const pdfUrl = filename.startsWith('http://') || filename.startsWith('https://')
      ? filename
      : `https://agromet.eeaoc.gob.ar/PDFS/${filename.replace(/^\/+/, '')}`;

    const { DialogComponent } = await import('./dialog/dialog.component');

    this.dialog.open(DialogComponent, {
      data: {
        titulo: informe?.titulo ?? 'Informe',
        fecha: informe?.creado,
        archivo: pdfUrl,
        nombreOriginal: filename
      },
      width: 'min(1200px, 96vw)',
      maxWidth: '96vw',
      height: '92vh',
      maxHeight: '92vh',
      panelClass: 'pdf-dialog',
      autoFocus: false,
      restoreFocus: false
    });
  }
}
