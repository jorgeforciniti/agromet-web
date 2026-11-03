import { Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions, TooltipItem } from 'chart.js';
import { Subscription } from 'rxjs';
import { ColmenarService } from '../../../services/colmenar.service';
import { EstadoCarga, LluviaDiariaAnio } from '../../colmenar.models';
import { COLOR, fmt, MESES, MESES_CORTOS, opcionesBase } from '../../colmenar.utils';
import { AyudaTerminoComponent } from '../../shared/ayuda-termino.component';
import { EstadoCargaComponent } from '../../shared/estado-carga.component';
import { ExportarGraficoComponent } from '../../../shared/exportar-grafico.component';
import {
  AjusteGumbel,
  ajustarGumbel,
  calcularMaximos,
  Correlacion,
  correlacion,
  FilaEmpirica,
  frecuenciaEmpirica,
  intervalo80,
  Maximo,
  PERIODOS_RETORNO,
  retornoDeReducida,
  retornoDeValor,
  totalesMensuales,
  valorRetorno,
  variableReducida
} from './extremos-hidricos.calculo';

type PeriodoId = 'referencia' | 'trabajo' | 'ultimos30' | 'serie';
type VistaMensual = 'duracion' | 'totales';

interface Periodo {
  id: PeriodoId;
  etiqueta: string;
  desde: number;
  hasta: number;
}

interface FilaRetorno {
  T: number;
  probabilidad: number;
  valor: number;
  inferior: number;
  superior: number;
  /** Valores publicados (sólo para la lluvia de 1 día). */
  figueroa: number | null;
  medina: number | null;
}

interface AnioSeleccionado {
  maximo: Maximo;
  retorno: number;
  provisional: boolean;
}

/** Cuadro 2 de Figueroa, Lamelas y Forciniti: Gumbel 1970–1999 y Medina y Moyano 1908–1972 (mm/24 h). */
const PUBLICADOS: Record<number, { figueroa: number; medina: number }> = {
  2: { figueroa: 97.3, medina: 88 },
  5: { figueroa: 124.4, medina: 109 },
  10: { figueroa: 142.4, medina: 126 },
  25: { figueroa: 165.0, medina: 149 },
  50: { figueroa: 181.9, medina: 165 },
  100: { figueroa: 198.6, medina: 181 }
};

/** Primer año con lluvia completa (1910 empieza en septiembre). */
const PRIMER_ANIO_LLUVIA = 1911;

@Component({
  selector: 'app-colmenar-extremos-hidricos',
  standalone: true,
  imports: [CommonModule, BaseChartDirective, AyudaTerminoComponent, EstadoCargaComponent, ExportarGraficoComponent],
  templateUrl: './extremos-hidricos.component.html',
  styleUrls: ['../../shared/seccion.css', './extremos-hidricos.component.css']
})
export class ExtremosHidricosComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) anio!: number;

  readonly fmt = fmt;
  readonly MESES = MESES;
  readonly MESES_CORTOS = MESES_CORTOS;
  readonly PERIODOS_RETORNO = PERIODOS_RETORNO;
  readonly duraciones = [1, 2, 3, 4, 5];
  readonly periodos: Periodo[];

  periodo: Periodo;
  duracion = 1;
  vistaMensual: VistaMensual = 'duracion';

  estado: EstadoCarga = 'cargando';
  mensaje?: string;
  descargados = 0;
  aDescargar = 0;

  private datos: LluviaDiariaAnio[] = [];
  aniosValidos: number[] = [];
  aniosExcluidos: number[] = [];

  ajuste: AjusteGumbel | null = null;
  maximos: Maximo[] = [];
  empirica: FilaEmpirica[] = [];
  tablaRetorno: FilaRetorno[] = [];
  /** Valores por mes: [T][mes-1]. */
  matrizMensual: (number | null)[][] = [];
  ocurrenciaPorMes: number[] = [];
  contribucion: { media: number; minimo: number; maximo: number; n: number } | null = null;
  correlacionOctMar: Correlacion | null = null;
  seleccionado: AnioSeleccionado | null = null;
  maximoObservado: Maximo | null = null;

  datosGumbel: ChartData<'scatter'> = { datasets: [] };
  opcionesGumbel: ChartOptions<'scatter'> = {};
  datosOcurrencia: ChartData<'bar'> = { labels: [], datasets: [] };
  opcionesOcurrencia: ChartOptions<'bar'> = {};
  datosCorrelacion: ChartData<'scatter'> = { datasets: [] };
  opcionesCorrelacion: ChartOptions<'scatter'> = {};

  private sub?: Subscription;
  private claveCargada = '';

  constructor(private api: ColmenarService) {
    const ultimo = new Date().getFullYear() - 1;
    this.periodos = [
      { id: 'referencia', etiqueta: '1991–2020 (referencia climatológica)', desde: 1991, hasta: 2020 },
      { id: 'trabajo', etiqueta: '1970–1999 (Figueroa, Lamelas y Forciniti)', desde: 1970, hasta: 1999 },
      { id: 'ultimos30', etiqueta: `Últimos 30 años (${ultimo - 29}–${ultimo})`, desde: ultimo - 29, hasta: ultimo },
      { id: 'serie', etiqueta: `Serie completa (${PRIMER_ANIO_LLUVIA}–${ultimo})`, desde: PRIMER_ANIO_LLUVIA, hasta: ultimo }
    ];
    this.periodo = this.periodos[0];
  }

  get etiquetaDuracion(): string {
    return this.duracion === 1 ? 'lluvia máxima diaria' : `lluvia máxima de ${this.duracion} días consecutivos`;
  }

  get unidad(): string {
    return this.duracion === 1 ? 'mm/día' : `mm/${this.duracion} días`;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['anio']) {
      this.cargar();
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  setPeriodo(id: string): void {
    this.periodo = this.periodos.find((p) => p.id === id) ?? this.periodos[0];
    this.cargar();
  }

  setDuracion(d: number): void {
    this.duracion = d;
    this.calcular();
  }

  setVistaMensual(v: VistaMensual): void {
    this.vistaMensual = v;
    this.calcularMensual();
  }

  /**
   * Descarga la lluvia diaria del período, del año anterior y del posterior (para los eventos que
   * cruzan el 1 de enero) y del año elegido en la página. Los años ya descargados vienen de la caché.
   */
  cargar(): void {
    const { desde, hasta } = this.periodo;
    const actual = new Date().getFullYear();
    const anios = new Set<number>();
    for (let a = Math.max(desde - 1, PRIMER_ANIO_LLUVIA - 1); a <= Math.min(hasta + 1, actual); a++) anios.add(a);
    for (let a = this.anio - 1; a <= Math.min(this.anio + 1, actual); a++) {
      if (a >= PRIMER_ANIO_LLUVIA - 1) anios.add(a);
    }
    const clave = [...anios].join(',');
    if (clave === this.claveCargada && this.estado === 'ok') {
      this.calcular();
      return;
    }
    this.estado = 'cargando';
    this.mensaje = undefined;
    this.descargados = 0;
    this.aDescargar = anios.size;
    this.sub?.unsubscribe();
    this.sub = this.api.getLluviaDiariaAnios([...anios], (n) => (this.descargados = n)).subscribe({
      next: (datos) => {
        this.datos = datos;
        this.claveCargada = clave;
        this.estado = 'ok';
        this.calcular();
      },
      error: (err: unknown) => {
        this.estado = 'error';
        this.mensaje = this.api.mensajeError(err);
      }
    });
  }

  private calcular(): void {
    if (this.estado !== 'ok') {
      return;
    }
    const { desde, hasta } = this.periodo;
    const enPeriodo = this.datos.filter((a) => a.anio >= desde && a.anio <= hasta);
    // Sólo años con lluvia válida todos los días: un año con huecos podría no contener su máximo real.
    this.aniosValidos = enPeriodo.filter((a) => a.completo).map((a) => a.anio);
    this.aniosExcluidos = enPeriodo.filter((a) => !a.completo).map((a) => a.anio);
    const validos = new Set(this.aniosValidos);

    const { anuales } = calcularMaximos(this.datos, this.duracion, validos);
    this.maximos = anuales;
    this.ajuste = ajustarGumbel(anuales.map((m) => m.mm));
    this.empirica = frecuenciaEmpirica(anuales);
    this.maximoObservado = this.empirica[0]?.maximo ?? null;

    const a = this.ajuste;
    this.tablaRetorno = a
      ? PERIODOS_RETORNO.map((T) => {
        const [inferior, superior] = intervalo80(a, T);
        const pub = this.duracion === 1 && this.periodo.id === 'trabajo' ? PUBLICADOS[T] : null;
        return {
          T,
          probabilidad: 1 - 1 / T,
          valor: valorRetorno(a, T),
          inferior,
          superior,
          figueroa: pub?.figueroa ?? null,
          medina: pub?.medina ?? null
        };
      })
      : [];

    // Mes del máximo anual de 1 día y aporte del día más lluvioso al evento máximo de 5 días.
    const diarios = calcularMaximos(this.datos, 1, validos).anuales;
    this.ocurrenciaPorMes = Array.from({ length: 12 }, (_, i) => diarios.filter((m) => m.mes === i + 1).length);
    const cinco = calcularMaximos(this.datos, 5, validos).anuales.filter((m) => m.mm > 0);
    const aportes = cinco.map((m) => (100 * m.maxDiario) / m.mm);
    this.contribucion = aportes.length
      ? { media: aportes.reduce((s, v) => s + v, 0) / aportes.length, minimo: Math.min(...aportes), maximo: Math.max(...aportes), n: aportes.length }
      : null;

    this.calcularSeleccionado();
    this.calcularCorrelacion(validos);
    this.calcularMensual();
    this.armarGraficos();
  }

  /** Máximo del año elegido en la página y su período de retorno según el ajuste del período. */
  private calcularSeleccionado(): void {
    this.seleccionado = null;
    const datosAnio = this.datos.find((d) => d.anio === this.anio);
    if (!this.ajuste || !datosAnio || !datosAnio.mm.some((v) => v !== null)) {
      return;
    }
    const m = calcularMaximos(this.datos, this.duracion, new Set([this.anio])).anuales[0];
    if (!m) {
      return;
    }
    this.seleccionado = { maximo: m, retorno: retornoDeValor(this.ajuste, m.mm), provisional: !datosAnio.completo };
  }

  /** Total octubre–marzo frente a la suma de las máximas diarias de esos seis meses (Cuadro 5). */
  private calcularCorrelacion(validos: Set<number>): void {
    const tot = totalesMensuales(this.datos, validos);
    const maxDia = calcularMaximos(this.datos, 1, validos).mensuales;
    const x: number[] = [];
    const y: number[] = [];
    const etiquetas: string[] = [];
    for (let a = this.periodo.desde; a < this.periodo.hasta; a++) {
      if (!validos.has(a) || !validos.has(a + 1)) continue;
      const meses = [[a, 10], [a, 11], [a, 12], [a + 1, 1], [a + 1, 2], [a + 1, 3]];
      const totales = meses.map(([aa, mm]) => tot.get(`${aa}-${mm}`));
      const maximos = meses.map(([aa, mm]) => maxDia.get(`${aa}-${mm}`)?.mm);
      if (totales.some((v) => v === undefined) || maximos.some((v) => v === undefined)) continue;
      x.push((totales as number[]).reduce((s, v) => s + v, 0));
      y.push((maximos as number[]).reduce((s, v) => s + v, 0));
      etiquetas.push(`${a}-${String(a + 1).slice(2)}`);
    }
    this.correlacionOctMar = correlacion(x, y);
    const c = this.correlacionOctMar;
    const extremosX = x.length ? [Math.min(...x), Math.max(...x)] : [];
    this.datosCorrelacion = {
      datasets: [
        {
          label: 'Campañas octubre–marzo',
          data: x.map((v, i) => ({ x: v, y: y[i], campania: etiquetas[i] })),
          backgroundColor: COLOR.lluvia,
          pointRadius: 4,
          pointHoverRadius: 6
        },
        ...(c
          ? [{
            label: `Recta de regresión (r = ${fmt(c.r, 3)})`,
            data: extremosX.map((v) => ({ x: v, y: c.ordenada + c.pendiente * v })),
            showLine: true,
            borderColor: COLOR.normal,
            borderDash: [6, 4],
            borderWidth: 2,
            pointRadius: 0
          }]
          : [])
      ]
    } as ChartData<'scatter'>;
    this.opcionesCorrelacion = this.opcionesDispersion('Total octubre–marzo (mm)', 'Suma de máximas diarias (mm)', (ctx) => {
      const r = ctx.raw as { x: number; y: number; campania?: string };
      return r.campania ? `${r.campania}: total ${fmt(r.x)} mm · máximas ${fmt(r.y)} mm` : '';
    });
  }

  /** Cuadro 3: valores esperados por mes para cada período de retorno. */
  private calcularMensual(): void {
    if (this.estado !== 'ok') {
      return;
    }
    const validos = new Set(this.aniosValidos);
    const porMes: number[][] = Array.from({ length: 12 }, () => []);
    if (this.vistaMensual === 'totales') {
      totalesMensuales(this.datos, validos).forEach((v, clave) => porMes[Number(clave.split('-')[1]) - 1].push(v));
    } else {
      calcularMaximos(this.datos, this.duracion, validos).mensuales.forEach((m) => porMes[m.mes - 1].push(m.mm));
    }
    const ajustes = porMes.map((vals) => ajustarGumbel(vals));
    this.matrizMensual = PERIODOS_RETORNO.map((T) => ajustes.map((aj) => (aj ? Math.max(0, valorRetorno(aj, T)) : null)));
  }

  private armarGraficos(): void {
    const a = this.ajuste;
    const yMin = variableReducida(1.05);
    const yMax = variableReducida(150);
    const pasos = 40;
    const curva = (fn: (T: number) => number) =>
      Array.from({ length: pasos + 1 }, (_, i) => {
        const y = yMin + ((yMax - yMin) * i) / pasos;
        return { x: y, y: fn(retornoDeReducida(y)) };
      });

    this.datosGumbel = {
      datasets: [
        {
          label: 'Máximos anuales observados',
          data: this.empirica.map((f) => ({ x: variableReducida(f.retorno), y: f.maximo.mm, anio: f.maximo.anio, fecha: f.maximo.fecha, T: f.retorno })),
          backgroundColor: COLOR.lluvia,
          borderColor: '#ffffff',
          borderWidth: 1,
          pointRadius: 4,
          pointHoverRadius: 6,
          order: 0
        },
        ...(a
          ? [
            {
              label: 'Ajuste de Gumbel',
              data: curva((T) => valorRetorno(a, T)),
              showLine: true,
              borderColor: '#1e3a8a',
              borderWidth: 2,
              pointRadius: 0,
              order: 1
            },
            {
              label: 'Intervalo de confianza 80 %',
              data: curva((T) => intervalo80(a, T)[1]),
              showLine: true,
              borderColor: 'rgba(37, 99, 235, .45)',
              backgroundColor: 'rgba(37, 99, 235, .10)',
              borderDash: [5, 4],
              borderWidth: 1.5,
              pointRadius: 0,
              fill: '+1',
              order: 2
            },
            {
              label: 'Límite inferior 80 %',
              data: curva((T) => intervalo80(a, T)[0]),
              showLine: true,
              borderColor: 'rgba(37, 99, 235, .45)',
              borderDash: [5, 4],
              borderWidth: 1.5,
              pointRadius: 0,
              order: 2
            }
          ]
          : [])
      ]
    } as ChartData<'scatter'>;

    const marcasT = [1.1, 2, 5, 10, 25, 50, 100];
    const o = this.opcionesDispersion('Período de retorno (años) · escala de Gumbel', this.unidad, (ctx) => {
      const r = ctx.raw as { x: number; y: number; anio?: number; fecha?: string; T?: number };
      if (r.anio) {
        return `${this.fechaCorta(r.fecha ?? '')}: ${fmt(r.y)} mm · T empírico ${fmt(r.T ?? 0, 1)} años`;
      }
      return `${ctx.dataset.label}: ${fmt(r.y)} mm (T = ${fmt(retornoDeReducida(r.x), 1)} años)`;
    });
    const ejeX = o.scales?.['x'] as Record<string, unknown>;
    Object.assign(ejeX, {
      min: yMin,
      max: yMax,
      afterBuildTicks: (eje: { ticks: { value: number }[] }) => {
        eje.ticks = marcasT.map((T) => ({ value: variableReducida(T) }));
      },
      ticks: { color: COLOR.texto, callback: (v: number | string) => fmt(retornoDeReducida(Number(v)), retornoDeReducida(Number(v)) < 2 ? 1 : 0) }
    });
    // La leyenda omite el límite inferior: la banda ya se describe con «Intervalo de confianza 80 %».
    o.plugins = {
      ...o.plugins,
      legend: {
        ...o.plugins?.legend,
        labels: { ...o.plugins?.legend?.labels, filter: (item) => item.text !== 'Límite inferior 80 %' }
      }
    };
    this.opcionesGumbel = o;

    this.datosOcurrencia = {
      labels: MESES_CORTOS,
      datasets: [{ label: 'Años con el máximo diario en el mes', data: this.ocurrenciaPorMes, backgroundColor: COLOR.lluvia, borderRadius: 4, maxBarThickness: 28 }]
    };
    const oc = opcionesBase('', { minCero: true, decimales: 0 }) as ChartOptions<'bar'>;
    oc.plugins = {
      ...oc.plugins,
      legend: { display: false },
      tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.y} ${ctx.parsed.y === 1 ? 'año' : 'años'}` } }
    };
    this.opcionesOcurrencia = oc;
  }

  private opcionesDispersion(tituloX: string, tituloY: string, etiqueta: (ctx: TooltipItem<'scatter'>) => string): ChartOptions<'scatter'> {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'nearest', intersect: true },
      plugins: {
        legend: { position: 'top', align: 'start', labels: { usePointStyle: true, boxWidth: 10, boxHeight: 10, color: COLOR.texto, font: { size: 12 } } },
        tooltip: { callbacks: { label: etiqueta } }
      },
      scales: {
        x: { type: 'linear', title: { display: true, text: tituloX, color: COLOR.texto }, grid: { color: COLOR.grilla }, ticks: { color: COLOR.texto } },
        y: { title: { display: true, text: tituloY, color: COLOR.texto }, grid: { color: COLOR.grilla }, ticks: { color: COLOR.texto } }
      }
    };
  }

  fechaCorta(iso: string): string {
    if (!iso) return '—';
    const [a, m, d] = iso.split('-');
    return `${Number(d)}/${Number(m)}/${a}`;
  }

  get mesesConMasMaximos(): string {
    const max = Math.max(0, ...this.ocurrenciaPorMes);
    if (!max) return '—';
    return this.ocurrenciaPorMes.map((n, i) => (n === max ? MESES[i] : null)).filter((x) => x).join(', ');
  }

  textoRetorno(T: number): string {
    if (!Number.isFinite(T) || T > 500) return 'más de 500 años';
    return `${fmt(T, T < 10 ? 1 : 0)} años`;
  }

  /** Cuadro 2 se compara con el trabajo sólo para su mismo período y la lluvia de 1 día. */
  get kpisRetorno(): FilaRetorno[] {
    return this.tablaRetorno.filter((f) => [2, 10, 50, 100].includes(f.T));
  }

  /** Mayor valor de la matriz mensual (fila de 100 años), para el sombreado relativo. */
  get maxMensual(): number {
    const ultima = this.matrizMensual[this.matrizMensual.length - 1] ?? [];
    return Math.max(0, ...ultima.map((v) => v ?? 0));
  }

  get comparaConTrabajo(): boolean {
    return this.duracion === 1 && this.periodo.id === 'trabajo';
  }
}
