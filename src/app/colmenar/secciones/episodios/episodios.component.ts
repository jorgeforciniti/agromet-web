import { Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions } from 'chart.js';
import { Subscription, forkJoin } from 'rxjs';
import {
  COLMENAR_ANIO_INICIO,
  COLMENAR_MAX_ANIOS_RANGO,
  ColmenarService
} from '../../../services/colmenar.service';
import { EpisodioCalido, EpisodiosAnualResponse, EpisodiosDetalleResponse, Recurso } from '../../colmenar.models';
import { COLOR, fmt, opcionesBase } from '../../colmenar.utils';
import { AyudaTerminoComponent } from '../../shared/ayuda-termino.component';
import { EstadoCargaComponent } from '../../shared/estado-carga.component';

type ColumnaEpisodio = keyof EpisodioCalido;

@Component({
  selector: 'app-colmenar-episodios',
  standalone: true,
  imports: [CommonModule, MatIconModule, BaseChartDirective, AyudaTerminoComponent, EstadoCargaComponent],
  templateUrl: './episodios.component.html',
  styleUrls: ['../../shared/seccion.css']
})
export class EpisodiosComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) anio!: number;

  readonly fmt = fmt;
  readonly maxRango = COLMENAR_MAX_ANIOS_RANGO;
  readonly anioActual = new Date().getFullYear();
  readonly aniosDisponibles = Array.from({ length: this.anioActual - COLMENAR_ANIO_INICIO + 1 }, (_, i) => this.anioActual - i);

  desde = COLMENAR_ANIO_INICIO;
  hasta = COLMENAR_ANIO_INICIO;
  errorRango = '';

  detalle: Recurso<EpisodiosDetalleResponse> = { estado: 'cargando', datos: null };
  anual: Recurso<EpisodiosAnualResponse> = { estado: 'cargando', datos: null };

  orden: { col: ColumnaEpisodio; asc: boolean } = { col: 'fecha_inicio', asc: false };
  filasOrdenadas: EpisodioCalido[] = [];

  datosAnual: ChartData<'bar'> = { labels: [], datasets: [] };
  readonly opcionesAnual = (() => {
    const o = opcionesBase('', { minCero: true, decimales: 0 }) as ChartOptions<'bar'>;
    o.plugins = { ...o.plugins, legend: { display: false } };
    return o;
  })();

  readonly columnas: { col: ColumnaEpisodio; titulo: string; num: boolean; unidad?: string }[] = [
    { col: 'fecha_inicio', titulo: 'Inicio', num: false },
    { col: 'fecha_fin', titulo: 'Fin', num: false },
    { col: 'duracion', titulo: 'Duración (días)', num: true },
    { col: 'excedente_max_acum', titulo: 'Excedente Tmax acum. (°C)', num: true },
    { col: 'excedente_min_acum', titulo: 'Excedente Tmin acum. (°C)', num: true },
    { col: 'mayor_excedente_max', titulo: 'Mayor excedente Tmax (°C)', num: true },
    { col: 'mayor_excedente_min', titulo: 'Mayor excedente Tmin (°C)', num: true }
  ];

  private sub?: Subscription;

  constructor(private api: ColmenarService) { }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['anio']) {
      this.hasta = this.anio;
      this.desde = Math.max(COLMENAR_ANIO_INICIO, this.anio - 9);
      this.consultar();
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  setDesde(v: string): void {
    this.desde = Number(v);
  }

  setHasta(v: string): void {
    this.hasta = Number(v);
  }

  consultar(): void {
    if (this.desde > this.hasta) {
      this.errorRango = 'El año inicial no puede ser posterior al final.';
      return;
    }
    if (this.hasta - this.desde + 1 > COLMENAR_MAX_ANIOS_RANGO) {
      this.errorRango = `El servicio admite hasta ${COLMENAR_MAX_ANIOS_RANGO} años por consulta.`;
      return;
    }
    this.errorRango = '';
    this.detalle = { estado: 'cargando', datos: null };
    this.anual = { estado: 'cargando', datos: null };
    this.sub?.unsubscribe();
    this.sub = forkJoin({
      detalle: this.api.recurso(this.api.getEpisodios(this.desde, this.hasta), (r) => !r.datos?.length),
      anual: this.api.recurso(this.api.getEpisodiosAnuales(this.desde, this.hasta), (r) => !r.datos?.length)
    }).subscribe((r) => {
      this.detalle = r.detalle;
      this.anual = r.anual;
      this.ordenar();
      this.armarGrafico();
    });
  }

  ordenarPor(col: ColumnaEpisodio): void {
    this.orden = { col, asc: this.orden.col === col ? !this.orden.asc : col.startsWith('fecha') };
    this.ordenar();
  }

  ariaSort(col: ColumnaEpisodio): 'ascending' | 'descending' | 'none' {
    return this.orden.col === col ? (this.orden.asc ? 'ascending' : 'descending') : 'none';
  }

  private ordenar(): void {
    const { col, asc } = this.orden;
    const filas = [...(this.detalle.datos?.datos ?? [])];
    filas.sort((a, b) => {
      const va = a[col];
      const vb = b[col];
      if (va === null) return 1;
      if (vb === null) return -1;
      const r = va < vb ? -1 : va > vb ? 1 : 0;
      return asc ? r : -r;
    });
    this.filasOrdenadas = filas;
  }

  /** Años del rango sin episodios: la API anual sólo devuelve años con al menos uno. */
  private armarGrafico(): void {
    const porAnio = new Map((this.anual.datos?.datos ?? []).map((d) => [d.anio, d]));
    const anios = Array.from({ length: this.hasta - this.desde + 1 }, (_, i) => this.desde + i);
    this.datosAnual = {
      labels: anios.map(String),
      datasets: [
        {
          label: 'Episodios',
          data: anios.map((a) => porAnio.get(a)?.episodios ?? 0),
          backgroundColor: COLOR.positivoTermico,
          borderRadius: 4,
          maxBarThickness: 28
        }
      ]
    };
  }

  formatoFecha(iso: string): string {
    const [a, m, d] = iso.split('-');
    return `${d}/${m}/${a}`;
  }
}
