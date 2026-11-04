import { AfterViewInit, Component, ElementRef, Input } from '@angular/core';
import { Chart } from 'chart.js';
import { fechaIso } from './enlace-consulta';
import { FUENTE_NOMBRE, FUENTE_TEXTO, MAX_DIAS_DESCARGA } from './fuente';
import { descargarCsv } from './descargar-csv';

/**
 * Botones "PNG" y "CSV" para descargar un gráfico de Chart.js. Busca el gráfico con
 * Chart.getChart al momento del clic, así que sirve igual para ng2-charts y para new Chart().
 *
 * Política de descargas: el PNG está en todos los gráficos y siempre lleva la fuente. El CSV
 * sólo aparece cuando se indica [maxFilas], que tiene que equivaler a 31 días de datos como
 * máximo (31 filas diarias, 31 × 96 registros de 15 minutos…). Quien necesite más datos los
 * pide a la Sección. En El Colmenar no se pasa [maxFilas]: ahí no hay CSV.
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
    @if (maxFilas) {
      <button type="button" (click)="csv()" title="Descargar los datos del gráfico en CSV (hasta 31 días)"
        aria-label="Descargar los datos del gráfico en CSV, hasta 31 días">CSV</button>
    }
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
  /**
   * Filas del CSV, equivalentes a 31 días como máximo (ver MAX_DIAS_DESCARGA): se incluyen las
   * últimas N. Sin este valor el gráfico sólo se descarga como imagen.
   */
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
    // La fuente va siempre en la imagen. Casi todos los gráficos la dibujan al pie (subtítulo de
    // chart-theme); a los que usan el subtítulo para otra cosa se les agrega una franja abajo.
    const subtitulo = chart.options.plugins?.subtitle;
    const conFuente = !!subtitulo?.display && subtitulo.text === FUENTE_TEXTO;
    const escala = origen.width / (origen.clientWidth || origen.width);
    const franja = conFuente ? 0 : Math.round(22 * escala);
    const lienzo = document.createElement('canvas');
    lienzo.width = origen.width;
    lienzo.height = origen.height + franja;
    const ctx = lienzo.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    ctx.drawImage(origen, 0, 0);
    if (franja) {
      ctx.fillStyle = '#5f6670';
      ctx.font = `${Math.round(12 * escala)}px sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(FUENTE_TEXTO, lienzo.width - 8 * escala, origen.height + franja / 2);
    }
    this.descargar(lienzo.toDataURL('image/png'), 'png');
  }

  /** Datos del gráfico en CSV (formato y pie de shared/descargar-csv.ts). */
  csv(): void {
    const chart = this.grafico();
    if (!chart || !this.maxFilas) return;
    const datasets = chart.data.datasets;
    const etiquetas = (chart.data.labels ?? []) as unknown[];
    const filas = Math.max(etiquetas.length, ...datasets.map(d => d.data.length));

    const etiquetaFila = (i: number): unknown => {
      if (etiquetas.length) return etiquetas[i];
      const punto = datasets[0]?.data[i] as { x?: unknown } | undefined;
      return punto?.x ?? i + 1;
    };

    const desde = Math.max(0, filas - this.maxFilas);
    const tabla: unknown[][] = [['', ...datasets.map(d => d.label ?? '')]];
    for (let i = desde; i < filas; i++) {
      tabla.push([etiquetaFila(i), ...datasets.map(d => d.data[i])]);
    }
    const notas = desde > 0 ? [`Se incluyen los últimos ${MAX_DIAS_DESCARGA} días del gráfico (máximo de descarga).`] : [];
    notas.push(`Para períodos más largos, solicite los datos a la ${FUENTE_NOMBRE}.`);
    descargarCsv(this.nombre, tabla, notas);
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
