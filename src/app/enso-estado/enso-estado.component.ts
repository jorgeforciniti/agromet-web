import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions } from 'chart.js';
import { Subscription } from 'rxjs';
import '../charts/chart-theme';
import { GRID_COLOR, fmtNum } from '../charts/chart-theme';
import { FUENTE_TEXTO } from '../shared/fuente';
import { ExportarGraficoComponent } from '../shared/exportar-grafico.component';
import {
  Enso,
  EnsoService,
  FASE_ENSO,
  TemporadaEnso,
  UMBRAL_ENSO,
  intensidadEnso,
  nombreTemporada
} from '../services/enso.service';

/** Temporadas que muestra el gráfico (dos años). */
const TEMPORADAS_GRAFICO = 24;

/**
 * Estado actual del ENSO (El Niño / La Niña) para la página Estado actual: fase y último RONI de
 * NOAA CPC, estado de alerta de CPC y la evolución de los últimos dos años. Lleva a la sección
 * «El Niño y La Niña» de El Colmenar para ver cómo fueron las campañas en cada fase.
 */
@Component({
  selector: 'app-enso-estado',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule, BaseChartDirective, ExportarGraficoComponent],
  templateUrl: './enso-estado.component.html',
  styleUrl: './enso-estado.component.css'
})
export class EnsoEstadoComponent implements OnInit, OnDestroy {
  readonly FASE_ENSO = FASE_ENSO;
  readonly nombreTemporada = nombreTemporada;
  readonly intensidadEnso = intensidadEnso;

  enso: Enso | null = null;
  ultima: TemporadaEnso | null = null;
  error = false;

  datos: ChartData<'bar'> = { labels: [], datasets: [] };
  opciones: ChartOptions<'bar'> = {};

  private sub?: Subscription;

  constructor(private api: EnsoService) { }

  ngOnInit(): void {
    this.cargar();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  cargar(): void {
    this.error = false;
    this.sub?.unsubscribe();
    this.sub = this.api.get().subscribe({
      next: (e) => {
        this.enso = e;
        this.ultima = e.temporadas[e.temporadas.length - 1] ?? null;
        this.armarGrafico(e.temporadas.slice(-TEMPORADAS_GRAFICO));
      },
      error: () => (this.error = true)
    });
  }

  /** «+1,97 °C» */
  fmtRoni(v: number): string {
    return `${v >= 0 ? '+' : '−'}${fmtNum(Math.abs(v), 2)} °C`;
  }

  /** Texto de la fase: «El Niño fuerte», «Neutro»… La intensidad es la del pico hasta ahora. */
  get textoFase(): string {
    const t = this.ultima;
    if (!t) {
      return '';
    }
    if (t.fase === 'neutro') {
      return 'Neutro';
    }
    const i = intensidadEnso(t.pico);
    return `${FASE_ENSO[t.fase].nombre}${i ? ' ' + i : ''}`;
  }

  private armarGrafico(temporadas: TemporadaEnso[]): void {
    const color = (t: TemporadaEnso) =>
      t.roni >= UMBRAL_ENSO ? FASE_ENSO.nino.color : t.roni <= -UMBRAL_ENSO ? FASE_ENSO.nina.color : FASE_ENSO.neutro.color;
    this.datos = {
      labels: temporadas.map(nombreTemporada),
      datasets: [
        {
          label: 'RONI',
          data: temporadas.map((t) => t.roni),
          backgroundColor: temporadas.map(color),
          borderRadius: 3,
          maxBarThickness: 22
        }
      ]
    };
    this.opciones = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        subtitle: { display: true, text: `${FUENTE_TEXTO} · RONI: NOAA CPC` },
        tooltip: {
          callbacks: {
            label: (ctx) => `RONI: ${this.fmtRoni(ctx.parsed.y)}`
          }
        },
        referencias: {
          lineas: [
            { valor: UMBRAL_ENSO, etiqueta: 'El Niño +0,5', color: FASE_ENSO.nino.color },
            { valor: -UMBRAL_ENSO, etiqueta: 'La Niña −0,5', color: FASE_ENSO.nina.color }
          ]
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxRotation: 60, autoSkip: true, font: { size: 10 } } },
        y: {
          suggestedMin: -1,
          suggestedMax: 1,
          grid: { color: GRID_COLOR },
          ticks: { callback: (v) => `${Number(v).toLocaleString('es-AR')} °C` }
        }
      }
    };
  }
}
