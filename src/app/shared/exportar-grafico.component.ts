import { AfterViewInit, Component, ElementRef, Input } from '@angular/core';
import { Chart } from 'chart.js';
import { fechaIso } from './enlace-consulta';
import { FUENTE_NOMBRE, FUENTE_URL } from './fuente';

/**
 * Botones "PNG" y "CSV" para descargar un gráfico de Chart.js. Busca el gráfico con
 * Chart.getChart al momento del clic, así que sirve igual para ng2-charts y para new Chart().
 *
 * Dentro del contenedor del <canvas> queda flotando arriba a la derecha:
 *   <div class="chart-container">
 *     <app-exportar-grafico nombre="comparacion-anios"></app-exportar-grafico>
 *     <canvas baseChart ...></canvas>
 *   </div>
 * Justo antes del contenedor (por ejemplo, si éste tiene role="img", que oculta los botones
 * a los lectores de pantalla) queda como una barra alineada a la derecha:
 *   <app-exportar-grafico nombre="..."></app-exportar-grafico>
 *   <div class="grafico" role="img"><canvas baseChart ...></canvas></div>
 */
@Component({
  selector: 'app-exportar-grafico',
  standalone: true,
  template: `
    <button type="button" (click)="png()" title="Descargar el gráfico como imagen PNG"
      aria-label="Descargar el gráfico como imagen PNG">PNG</button>
    <button type="button" (click)="csv()" title="Descargar los datos del gráfico en CSV"
      aria-label="Descargar los datos del gráfico en CSV">CSV</button>
  `,
  styles: [`
    :host {
      position: absolute;
      top: 4px;
      right: 4px;
      z-index: 2;
      display: flex;
      gap: 4px;
    }

    :host(.barra) {
      position: static;
      justify-content: flex-end;
      margin-bottom: 4px;
    }

    button {
      min-height: 26px;
      padding: 0 8px;
      border: 1px solid var(--border, #d9dee5);
      border-radius: 999px;
      background: rgba(255, 255, 255, .92);
      color: var(--muted, #5b6470);
      font: inherit;
      font-size: .7rem;
      font-weight: 800;
      letter-spacing: .03em;
      cursor: pointer;
    }

    button:hover {
      color: var(--brand, #4a7a2c);
      border-color: currentColor;
    }

    @media print {
      :host { display: none; }
    }
  `]
})
export class ExportarGraficoComponent implements AfterViewInit {
  /** Base del nombre del archivo; se le agrega la fecha de hoy */
  @Input() nombre = 'grafico';
  /** Para series de datos diarios: el CSV incluye sólo las últimas N filas (ver MAX_DIAS_DESCARGA) */
  @Input() maxFilas: number | null = null;

  /** Está antes del contenedor del gráfico (barra) en vez de adentro (flotante) */
  enBarra = false;

  constructor(private host: ElementRef<HTMLElement>) { }

  ngAfterViewInit(): void {
    const siguiente = this.host.nativeElement.nextElementSibling;
    this.enBarra = !!siguiente && siguiente.tagName !== 'CANVAS' && !!siguiente.querySelector('canvas');
    // Clase directa (no binding): se decide después de la detección de cambios
    this.host.nativeElement.classList.toggle('barra', this.enBarra);
    if (this.enBarra) return;
    // Los botones flotan sobre el gráfico: el contenedor tiene que ser la referencia
    const contenedor = this.host.nativeElement.parentElement;
    if (contenedor && getComputedStyle(contenedor).position === 'static') {
      contenedor.style.position = 'relative';
    }
  }

  png(): void {
    const chart = this.grafico();
    if (!chart) return;
    // Fondo blanco: el canvas es transparente y la imagen quedaría negra en algunos visores
    const origen = chart.canvas;
    const lienzo = document.createElement('canvas');
    lienzo.width = origen.width;
    lienzo.height = origen.height;
    const ctx = lienzo.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    ctx.drawImage(origen, 0, 0);
    this.descargar(lienzo.toDataURL('image/png'), 'png');
  }

  /** CSV con ";" y coma decimal (lo que espera Excel en castellano), en UTF-8 con BOM. */
  csv(): void {
    const chart = this.grafico();
    if (!chart) return;
    const datasets = chart.data.datasets;
    const etiquetas = (chart.data.labels ?? []) as unknown[];
    const filas = Math.max(etiquetas.length, ...datasets.map(d => d.data.length));

    const celda = (v: unknown): string => {
      if (v === null || v === undefined || (typeof v === 'number' && isNaN(v))) return '';
      // Hasta 2 decimales: las sumas del gráfico arrastran restos de punto flotante (229,34000000000006)
      if (typeof v === 'number') return String(Math.round(v * 100) / 100).replace('.', ',');
      if (typeof v === 'object' && 'y' in (v as object)) return celda((v as { y: unknown }).y);
      const texto = Array.isArray(v) ? v.join(' ') : String(v);
      return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
    };
    const etiquetaFila = (i: number): unknown => {
      if (etiquetas.length) return etiquetas[i];
      const punto = datasets[0]?.data[i] as { x?: unknown } | undefined;
      return punto?.x ?? i + 1;
    };

    const desde = this.maxFilas ? Math.max(0, filas - this.maxFilas) : 0;
    const lineas = [['', ...datasets.map(d => celda(d.label ?? ''))].join(';')];
    for (let i = desde; i < filas; i++) {
      lineas.push([celda(etiquetaFila(i)), ...datasets.map(d => celda(d.data[i]))].join(';'));
    }
    lineas.push('');
    if (desde > 0) {
      lineas.push(celda(`Se incluyen las últimas ${this.maxFilas} filas del gráfico (máximo de descarga).`));
    }
    lineas.push(celda('Los datos son de carácter provisorio y pueden estar sujetos a revisión.'));
    lineas.push(celda(`Fuente: ${FUENTE_NOMBRE} - ${FUENTE_URL}`));
    const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    this.descargar(url, 'csv');
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private grafico(): Chart | undefined {
    const zona = this.enBarra ? this.host.nativeElement.nextElementSibling : this.host.nativeElement.parentElement;
    const canvas = zona?.querySelector('canvas');
    return canvas ? Chart.getChart(canvas) : undefined;
  }

  private descargar(href: string, extension: string): void {
    const a = document.createElement('a');
    a.href = href;
    a.download = `${this.nombre}_${fechaIso(new Date())}.${extension}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}
