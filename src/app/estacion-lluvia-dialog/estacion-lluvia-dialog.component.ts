import { AfterViewInit, Component, ElementRef, Inject, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { BaseChartDirective } from 'ng2-charts';
import { Chart, ChartData, ChartOptions, Plugin, registerables, TooltipItem } from 'chart.js';
import * as L from 'leaflet';
import { LluviasEstacionResponse, WeatherService } from '../services/weather.service';
import { OPCIONES_GESTOS } from '../maps/gestos';
import { seguirTamanioMapa } from '../maps/map-size';

Chart.register(...registerables);

/** Mes de la campaña tal como lo muestra el diálogo de Lluvias por campaña. */
export interface MesCampania {
  year: number;
  month: string;
  /** mm; -999.9 si no hay dato. */
  value: number;
  normal: number;
  /** Mes en curso: el valor es un acumulado parcial. */
  isCurrent?: boolean;
}

export interface EstacionLluviaDialogData {
  id: number;
  name: string;
  lat: number;
  lon: number;
  referencePeriod: string;
  /** Mes (1–12) y año de inicio de la campaña consultada. */
  inicioMes: number;
  inicioAnio: number;
  campania: MesCampania[];
  /** Índice (0–11) del mes en el que se hizo clic; null si fue en el total. */
  mesIdx: number | null;
}

type Vista = 'mes' | 'serie' | 'campania';

interface Estadistica {
  n: number;
  min: number;
  p25: number;
  mediana: number;
  p75: number;
  max: number;
}

/** Estadística de un mes calendario a lo largo de toda la serie. */
interface EstadisticaSerieMes extends Estadistica {
  media: number;
  desvio: number;
  anioMin: number;
  anioMax: number;
  /** Porcentaje de años por encima de la normal del mes. */
  sobreNormal: number | null;
}

interface TotalCampania {
  inicio: number;
  /** null si a la campaña le falta algún mes. */
  total: number | null;
}

/**
 * Pinta en gris el fondo de las columnas sin dato. `indices` se consulta en cada dibujo, así que
 * refleja siempre los datos actuales del gráfico.
 */
function pluginSinDato(indices: () => number[]): Plugin {
  return {
    id: 'zonasSinDato',
    beforeDatasetsDraw: (chart) => {
      const x = chart.scales['x'];
      const area = chart.chartArea;
      const cantidad = chart.data.labels?.length ?? 0;
      if (!x || !cantidad) return;
      const ancho = (area.right - area.left) / cantidad;
      const ctx = chart.ctx;
      ctx.save();
      ctx.fillStyle = 'rgba(107, 114, 128, .16)';
      for (const i of indices()) {
        const centro = x.getPixelForValue(i);
        ctx.fillRect(centro - ancho / 2, area.top, ancho, area.bottom - area.top);
      }
      ctx.restore();
    }
  };
}

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const SIN_DATO = -999.9;

const COLOR = {
  campania: '#2a78d6',
  parcial: '#9ec5f4',
  normal: '#52514e',
  mediana: '#0f766e',
  banda: 'rgba(15, 118, 110, .16)',
  rango: 'rgba(15, 118, 110, .07)',
  actual: '#eb6834',
  texto: '#52514e',
  grilla: 'rgba(17, 24, 39, .08)'
};

/** Percentil con interpolación lineal sobre valores ordenados. */
function percentil(ordenados: number[], p: number): number {
  const pos = (ordenados.length - 1) * p;
  const i = Math.floor(pos);
  const f = pos - i;
  return i + 1 < ordenados.length ? ordenados[i] + f * (ordenados[i + 1] - ordenados[i]) : ordenados[i];
}

function estadistica(valores: number[]): Estadistica | null {
  if (!valores.length) return null;
  const o = [...valores].sort((a, b) => a - b);
  return { n: o.length, min: o[0], p25: percentil(o, 0.25), mediana: percentil(o, 0.5), p75: percentil(o, 0.75), max: o[o.length - 1] };
}

const fmtNum = (v: number | null | undefined, dec = 1) =>
  v === null || v === undefined || Number.isNaN(v)
    ? '—'
    : new Intl.NumberFormat('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(v);

/**
 * Diálogo chico de una estación de Lluvias por campaña: ubicación en el mapa y estadísticas de su
 * serie histórica (lluvias-estacion.php), por mes de la campaña o por campaña completa.
 */
@Component({
  selector: 'app-estacion-lluvia-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatIconModule, BaseChartDirective],
  templateUrl: './estacion-lluvia-dialog.component.html',
  styleUrls: ['./estacion-lluvia-dialog.component.css']
})
export class EstacionLluviaDialogComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('mapa', { static: true }) mapaRef!: ElementRef<HTMLDivElement>;

  readonly fmt = fmtNum;
  readonly MESES = MESES;
  vista: Vista;
  estado: 'cargando' | 'ok' | 'vacio' | 'error' = 'cargando';
  mensaje = '';

  /** Etiquetas de los 12 meses de la campaña («Oct 2025»…). */
  etiquetas: string[] = [];
  estadisticas: (Estadistica | null)[] = [];
  totales: TotalCampania[] = [];
  primerAnio: number | null = null;
  ultimoAnio: number | null = null;
  normalCampania: number | null = null;
  totalActual: number | null = null;

  datosMes: ChartData<'bar' | 'line'> = { labels: [], datasets: [] };
  opcionesMes: ChartOptions<'bar'> = {};
  datosCampania: ChartData<'bar' | 'line'> = { labels: [], datasets: [] };

  /** Mes calendario (1–12) de la pestaña «Serie del mes». */
  mesSerie = 1;
  /** Año del mes consultado, que se resalta en la serie. */
  anioResaltado: number | null = null;
  serieMes: { anio: number; mm: number | null }[] = [];
  estadisticaSerie: EstadisticaSerieMes | null = null;
  normalSerieMes: number | null = null;
  datosSerieMes: ChartData<'bar' | 'line'> = { labels: [], datasets: [] };
  opcionesSerieMes: ChartOptions<'bar'> = {};
  opcionesCampania: ChartOptions<'bar'> = {};

  readonly pluginMes = [pluginSinDato(() => this.data.campania.map((m, i) => (m.value === SIN_DATO ? i : -1)).filter((i) => i >= 0))];
  readonly pluginSerieMes = [pluginSinDato(() => this.serieMes.map((s, i) => (s.mm === null ? i : -1)).filter((i) => i >= 0))];
  readonly pluginCampania = [pluginSinDato(() => this.totales.map((c, i) => (c.total === null ? i : -1)).filter((i) => i >= 0))];

  private mapa?: L.Map;
  private dejarDeSeguirTamanio?: () => void;
  private serie = new Map<number, (number | null)[]>();

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: EstacionLluviaDialogData,
    private dialogRef: MatDialogRef<EstacionLluviaDialogComponent>,
    private weather: WeatherService
  ) {
    this.vista = data.mesIdx === null ? 'campania' : 'mes';
    // La serie del mes arranca en el mes en el que se hizo clic (o en el primero de la campaña).
    const k = data.inicioMes - 1 + (data.mesIdx ?? 0);
    this.mesSerie = (k % 12) + 1;
    this.anioResaltado = data.mesIdx === null ? null : data.inicioAnio + Math.floor(k / 12);
  }

  get mesElegido(): MesCampania | null {
    return this.data.mesIdx === null ? null : this.data.campania[this.data.mesIdx] ?? null;
  }

  get nombreMesElegido(): string {
    const m = this.data.mesIdx === null ? null : this.mesDeIndice(this.data.mesIdx);
    return m ? `${MESES[m.mes - 1]} ${m.anio}` : '';
  }

  ngOnInit(): void {
    this.etiquetas = this.data.campania.map((_, i) => {
      const m = this.mesDeIndice(i);
      return `${MESES_CORTOS[m.mes - 1]} ${String(m.anio).slice(2)}`;
    });
    this.weather.getLluviasEstacion(this.data.id).subscribe({
      next: (r) => this.procesar(r),
      error: () => {
        this.estado = 'error';
        this.mensaje = 'No se pudo obtener la serie histórica de la estación.';
      }
    });
  }

  ngAfterViewInit(): void {
    this.crearMapa();
  }

  ngOnDestroy(): void {
    this.dejarDeSeguirTamanio?.();
    this.mapa?.remove();
  }

  cerrar(): void {
    this.dialogRef.close();
  }

  setVista(v: Vista): void {
    this.vista = v;
  }

  setMesSerie(valor: string): void {
    this.mesSerie = Number(valor);
    // Al cambiar de mes se resalta el año en que ese mes cae dentro de la campaña consultada.
    const pos = (this.mesSerie - this.data.inicioMes + 12) % 12;
    this.anioResaltado = this.mesDeIndice(pos).anio;
    this.armarSerieMes();
  }

  /** Mes (1–12) y año del índice i de la campaña. */
  private mesDeIndice(i: number): { mes: number; anio: number } {
    const k = this.data.inicioMes - 1 + i;
    return { mes: (k % 12) + 1, anio: this.data.inicioAnio + Math.floor(k / 12) };
  }

  private crearMapa(): void {
    const { lat, lon } = this.data;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (!lat && !lon)) return;
    this.mapa = L.map(this.mapaRef.nativeElement, { center: [lat, lon], zoom: 9, attributionControl: true, ...OPCIONES_GESTOS });
    this.dejarDeSeguirTamanio = seguirTamanioMapa(this.mapa);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 18 }).addTo(this.mapa);
    L.circleMarker([lat, lon], { radius: 8, color: '#ffffff', weight: 2, fillColor: COLOR.campania, fillOpacity: 1 })
      .addTo(this.mapa)
      .bindTooltip(this.data.name, { direction: 'top', offset: [0, -8] });
  }

  private procesar(r: LluviasEstacionResponse): void {
    if (r.status !== 'success' || !r.anios?.length) {
      this.estado = r.status === 'error' ? 'error' : 'vacio';
      this.mensaje = r.message ?? '';
      return;
    }
    // El mes en curso y los posteriores pueden ser parciales: no entran en la estadística histórica.
    const hoy = new Date();
    const anioHoy = hoy.getFullYear();
    const mesHoy = hoy.getMonth() + 1;
    for (const a of r.anios) {
      const meses = a.meses.map((v, i) => (a.anio > anioHoy || (a.anio === anioHoy && i + 1 >= mesHoy) ? null : v));
      if (meses.some((v) => v !== null)) this.serie.set(a.anio, meses);
    }
    if (!this.serie.size) {
      this.estado = 'vacio';
      return;
    }
    const anios = [...this.serie.keys()].sort((a, b) => a - b);
    this.primerAnio = anios[0];
    this.ultimoAnio = anios[anios.length - 1];

    // Estadística de cada mes de la campaña sobre todos los años con dato.
    this.estadisticas = this.data.campania.map((_, i) => {
      const { mes } = this.mesDeIndice(i);
      return estadistica(anios.map((a) => this.serie.get(a)![mes - 1]).filter((v): v is number => v !== null));
    });

    // Totales de cada campaña con el mismo mes de inicio, desde el primer año de la serie
    // (null si le falta algún mes: se muestra como hueco gris).
    const inicio = this.data.inicioMes;
    this.totales = [];
    for (let a = anios[0]; a <= anios[anios.length - 1]; a++) {
      let total: number | null = 0;
      for (let i = 0; i < 12 && total !== null; i++) {
        const k = inicio - 1 + i;
        const v = this.serie.get(a + Math.floor(k / 12))?.[k % 12] ?? null;
        total = v === null ? null : total + v;
      }
      this.totales.push({ inicio: a, total });
    }
    // Las campañas finales sin ningún mes con dato no se muestran (la serie termina antes).
    while (this.totales.length && !this.tieneDatos(this.totales[this.totales.length - 1].inicio)) {
      this.totales.pop();
    }

    const normales = this.data.campania.map((m) => m.normal);
    this.normalCampania = normales.every((n) => Number.isFinite(n)) ? normales.reduce((s, n) => s + n, 0) : null;
    const actuales = this.data.campania;
    this.totalActual = actuales.every((m) => m.value !== SIN_DATO && !m.isCurrent) ? actuales.reduce((s, m) => s + m.value, 0) : null;

    this.estado = 'ok';
    this.armarSerieMes();
    this.armarGraficoMes();
    this.armarGraficoCampania();
  }

  /** Posición del mes elegido dentro de la serie: porcentaje de años con menos lluvia. */
  get posicionMes(): { menores: number; n: number } | null {
    const m = this.mesElegido;
    const i = this.data.mesIdx;
    if (!m || i === null || m.value === SIN_DATO || m.isCurrent || this.estado !== 'ok') return null;
    const { mes } = this.mesDeIndice(i);
    const valores = [...this.serie.values()].map((v) => v[mes - 1]).filter((v): v is number => v !== null);
    if (!valores.length) return null;
    return { menores: valores.filter((v) => v < m.value).length, n: valores.length };
  }

  /** Totales de las campañas completas de la serie. */
  get completas(): number[] {
    return this.totales.filter((c) => c.total !== null).map((c) => c.total as number);
  }

  get incompletas(): number {
    return this.totales.length - this.completas.length;
  }

  get mesesSinDato(): number {
    return this.data.campania.filter((m) => m.value === SIN_DATO).length;
  }

  get posicionCampania(): { menores: number; n: number } | null {
    const completas = this.completas;
    if (this.totalActual === null || !completas.length) return null;
    const t = this.totalActual;
    return { menores: completas.filter((v) => v < t).length, n: completas.length };
  }

  /** true si la campaña que empieza en `anio` tiene al menos un mes con dato. */
  private tieneDatos(anio: number): boolean {
    const inicio = this.data.inicioMes;
    for (let i = 0; i < 12; i++) {
      const k = inicio - 1 + i;
      if ((this.serie.get(anio + Math.floor(k / 12))?.[k % 12] ?? null) !== null) return true;
    }
    return false;
  }

  private armarGraficoMes(): void {
    const est = this.estadisticas;
    const campania = this.data.campania;
    const sel = this.data.mesIdx;
    const linea = (label: string, valores: (number | null)[], extra: Record<string, unknown>) => ({
      type: 'line' as const, label, data: valores, pointRadius: 0, pointHoverRadius: 3, borderWidth: 0, ...extra
    });
    this.datosMes = {
      labels: this.etiquetas,
      datasets: [
        {
          type: 'bar',
          label: 'Campaña consultada',
          data: campania.map((m) => (m.value === SIN_DATO ? null : m.value)),
          backgroundColor: campania.map((m, i) => (m.isCurrent ? COLOR.parcial : i === sel ? COLOR.actual : COLOR.campania)),
          borderRadius: 4,
          maxBarThickness: 26,
          order: 3
        },
        linea('Normal', campania.map((m) => m.normal), { borderColor: COLOR.normal, borderWidth: 2, borderDash: [6, 4], order: 1 }),
        linea('Mediana histórica', est.map((e) => e?.mediana ?? null), { borderColor: COLOR.mediana, borderWidth: 2, order: 2 }),
        linea('Rango 25–75 %', est.map((e) => e?.p75 ?? null), { backgroundColor: COLOR.banda, fill: '+1', order: 4 }),
        linea('p25', est.map((e) => e?.p25 ?? null), { order: 4 }),
        linea('Mínimo–máximo', est.map((e) => e?.max ?? null), { backgroundColor: COLOR.rango, fill: '+1', order: 5 }),
        linea('min', est.map((e) => e?.min ?? null), { order: 5 })
      ]
    } as ChartData<'bar' | 'line'>;

    this.opcionesMes = this.opciones((ctx) => {
      const i = ctx.dataIndex;
      const label = ctx.dataset.label ?? '';
      if (label === 'p25' || label === 'min') return '';
      if (label === 'Rango 25–75 %') return `Rango 25–75 %: ${fmtNum(est[i]?.p25)} a ${fmtNum(est[i]?.p75)} mm`;
      if (label === 'Mínimo–máximo') return `Mínimo–máximo: ${fmtNum(est[i]?.min)} a ${fmtNum(est[i]?.max)} mm (${est[i]?.n ?? 0} años)`;
      const v = ctx.parsed.y;
      if (label === 'Campaña consultada' && campania[i]?.value === SIN_DATO) return 'Campaña consultada: sin dato';
      const sufijo = label === 'Campaña consultada' && campania[i]?.isCurrent ? ' (parcial, mes en curso)' : '';
      return `${label}: ${fmtNum(v)} mm${sufijo}`;
    });
  }

  /** Pestaña «Serie del mes»: el mes elegido en cada año de la serie. */
  private armarSerieMes(): void {
    if (this.primerAnio === null || this.ultimoAnio === null) return;
    const m = this.mesSerie;
    this.serieMes = [];
    for (let a = this.primerAnio; a <= this.ultimoAnio; a++) {
      this.serieMes.push({ anio: a, mm: this.serie.get(a)?.[m - 1] ?? null });
    }
    // La normal del mes se toma de la campaña (misma tabla de normales de la estación).
    const pos = (m - this.data.inicioMes + 12) % 12;
    const normal = this.data.campania[pos]?.normal;
    this.normalSerieMes = Number.isFinite(normal) ? normal : null;

    const conDato = this.serieMes.filter((s) => s.mm !== null) as { anio: number; mm: number }[];
    const est = estadistica(conDato.map((s) => s.mm));
    if (est) {
      const media = conDato.reduce((s, v) => s + v.mm, 0) / conDato.length;
      const desvio = conDato.length > 1 ? Math.sqrt(conDato.reduce((s, v) => s + (v.mm - media) ** 2, 0) / (conDato.length - 1)) : 0;
      const nn = this.normalSerieMes;
      this.estadisticaSerie = {
        ...est,
        media,
        desvio,
        anioMin: conDato.find((s) => s.mm === est.min)!.anio,
        anioMax: conDato.find((s) => s.mm === est.max)!.anio,
        sobreNormal: nn ? (100 * conDato.filter((s) => s.mm > nn).length) / conDato.length : null
      };
    } else {
      this.estadisticaSerie = null;
    }

    const e = this.estadisticaSerie;
    this.datosSerieMes = {
      labels: this.serieMes.map((s) => String(s.anio)),
      datasets: [
        {
          type: 'bar',
          label: `${MESES[m - 1]} de cada año`,
          data: this.serieMes.map((s) => s.mm),
          backgroundColor: this.serieMes.map((s) => (s.anio === this.anioResaltado ? COLOR.actual : COLOR.campania)),
          borderRadius: 3,
          maxBarThickness: 16,
          order: 2
        },
        {
          type: 'line',
          label: 'Normal',
          data: this.serieMes.map(() => this.normalSerieMes),
          borderColor: COLOR.normal,
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
          order: 1
        },
        {
          type: 'line',
          label: 'Mediana de la serie',
          data: this.serieMes.map(() => e?.mediana ?? null),
          borderColor: COLOR.mediana,
          borderWidth: 2,
          pointRadius: 0,
          order: 1
        }
      ]
    } as ChartData<'bar' | 'line'>;
    this.opcionesSerieMes = this.opciones((ctx) =>
      ctx.datasetIndex === 0 && this.serieMes[ctx.dataIndex]?.mm === null
        ? 'Sin dato'
        : `${ctx.dataset.label}: ${fmtNum(ctx.parsed.y)} mm`);
  }

  private armarGraficoCampania(): void {
    const t = this.totales;
    const inicioAct = this.data.inicioAnio;
    const etiqueta = (a: number) => (this.data.inicioMes === 1 ? String(a) : `${a}-${String(a + 1).slice(2)}`);
    const completas = this.completas;
    const media = completas.length ? completas.reduce((s, v) => s + v, 0) / completas.length : null;
    this.datosCampania = {
      labels: t.map((c) => etiqueta(c.inicio)),
      datasets: [
        {
          type: 'bar',
          label: 'Total de la campaña',
          data: t.map((c) => c.total),
          backgroundColor: t.map((c) => (c.inicio === inicioAct ? COLOR.actual : COLOR.campania)),
          borderRadius: 3,
          maxBarThickness: 18,
          order: 2
        },
        {
          type: 'line',
          label: 'Normal de la campaña',
          data: t.map(() => this.normalCampania),
          borderColor: COLOR.normal,
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
          order: 1
        },
        {
          type: 'line',
          label: 'Promedio de la serie',
          data: t.map(() => media),
          borderColor: COLOR.mediana,
          borderWidth: 2,
          pointRadius: 0,
          order: 1
        }
      ]
    } as ChartData<'bar' | 'line'>;
    this.opcionesCampania = this.opciones((ctx) =>
      ctx.dataset.label === 'Total de la campaña' && t[ctx.dataIndex]?.total === null
        ? 'Campaña incompleta: faltan meses con dato'
        : `${ctx.dataset.label}: ${fmtNum(ctx.parsed.y)} mm`);
  }

  private opciones(etiqueta: (ctx: TooltipItem<'bar'>) => string): ChartOptions<'bar'> {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          align: 'start',
          labels: {
            usePointStyle: true, boxWidth: 9, boxHeight: 9, color: COLOR.texto, font: { size: 11 },
            // Las series auxiliares de las bandas no se muestran en la leyenda.
            filter: (item) => item.text !== 'p25' && item.text !== 'min'
          }
        },
        tooltip: {
          filter: (item) => item.dataset.label !== 'p25' && item.dataset.label !== 'min',
          callbacks: { label: etiqueta }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: COLOR.texto, maxRotation: 0, autoSkip: true } },
        y: { beginAtZero: true, grid: { color: COLOR.grilla }, ticks: { color: COLOR.texto, callback: (v) => `${v} mm` } }
      }
    };
  }
}
