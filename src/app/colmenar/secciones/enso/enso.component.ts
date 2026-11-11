import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions } from 'chart.js';
import { Subscription, catchError, forkJoin, map, of } from 'rxjs';
import { COLMENAR_MAX_ANIOS_RANGO, ColmenarService } from '../../../services/colmenar.service';
import {
  Enso,
  EnsoService,
  FASE_ENSO,
  FaseEnso,
  TemporadaEnso,
  intensidadEnso,
  nombreTemporada
} from '../../../services/enso.service';
import { EstadoCarga, Mensual, MensualesResponse } from '../../colmenar.models';
import { COLOR, MESES, MESES_CORTOS, fmt, fmtSigno, media, opcionesBase, redondear } from '../../colmenar.utils';
import { EstadoCargaComponent } from '../../shared/estado-carga.component';
import { ExportarGraficoComponent } from '../../../shared/exportar-grafico.component';
import { ComoSeLeeComponent } from '../../../shared/como-se-lee.component';
import { FUENTE_TEXTO } from '../../../shared/fuente';

/** El RONI empieza en 1950. */
const ANIO_INICIO_ENSO = 1950;
/** Pico desde el que un El Niño se cuenta como fuerte (fuerte y muy fuerte). */
const PICO_FUERTE = 1.5;

type VariableId = 'pp' | 'tmax' | 'tmin';
type GrupoId = FaseEnso | 'nino-fuerte';

interface Variable {
  id: VariableId;
  etiqueta: string;
  unidad: string;
  tipo: 'suma' | 'media';
}

interface Periodo {
  id: string;
  etiqueta: string;
  /** Meses de la campaña que empieza en el año `anio`: [desplazamiento de año, mes]. */
  meses: [number, number][];
}

interface Campania {
  anio: number;
  etiqueta: string;
  valor: number;
  temporada: TemporadaEnso;
}

interface FilaGrupo {
  id: GrupoId;
  nombre: string;
  n: number;
  media: number | null;
  mediana: number | null;
  /** Diferencia de la media con la de los años neutros: % en lluvia, °C en temperaturas. */
  difNeutro: number | null;
  /** Porcentaje de campañas por encima de la mediana de todas. */
  pctSobreMediana: number | null;
}

interface FilaMes {
  mes: number;
  porFase: Record<FaseEnso, { media: number | null; n: number }>;
}

const FASES: FaseEnso[] = ['nina', 'neutro', 'nino'];

@Component({
  selector: 'app-colmenar-enso',
  standalone: true,
  imports: [CommonModule, BaseChartDirective, EstadoCargaComponent, ExportarGraficoComponent, ComoSeLeeComponent],
  templateUrl: './enso.component.html',
  styleUrls: ['../../shared/seccion.css', './enso.component.css']
})
export class EnsoComponent implements OnInit, OnDestroy {
  readonly fmt = fmt;
  readonly fmtSigno = fmtSigno;
  readonly MESES = MESES;
  readonly FASES = FASES;
  readonly FASE_ENSO = FASE_ENSO;
  readonly anioInicio = ANIO_INICIO_ENSO;

  readonly variables: Variable[] = [
    { id: 'pp', etiqueta: 'Precipitación', unidad: 'mm', tipo: 'suma' },
    { id: 'tmax', etiqueta: 'Tmax media', unidad: '°C', tipo: 'media' },
    { id: 'tmin', etiqueta: 'Tmin media', unidad: '°C', tipo: 'media' }
  ];

  readonly periodos: Periodo[] = [
    { id: 'oct-mar', etiqueta: 'Octubre a marzo', meses: [[0, 10], [0, 11], [0, 12], [1, 1], [1, 2], [1, 3]] },
    { id: 'oct-dic', etiqueta: 'Octubre a diciembre', meses: [[0, 10], [0, 11], [0, 12]] },
    { id: 'ene-mar', etiqueta: 'Enero a marzo', meses: [[1, 1], [1, 2], [1, 3]] }
  ];

  variable = this.variables[0];
  periodo = this.periodos[0];

  estado: EstadoCarga = 'cargando';
  mensaje?: string;
  enso: Enso | null = null;

  campanias: Campania[] = [];
  grupos: FilaGrupo[] = [];
  medianaGeneral: number | null = null;
  aniosNinoFuerte: string[] = [];
  filasMes: FilaMes[] = [];

  datosDispersion: ChartData<'scatter'> = { datasets: [] };
  opcionesDispersion: ChartOptions<'scatter'> = {};
  datosMeses: ChartData<'bar'> = { labels: [], datasets: [] };
  opcionesMeses: ChartOptions<'bar'> = {};

  private mensuales = new Map<string, Mensual>();
  private fases = new Map<string, TemporadaEnso>();
  private sub?: Subscription;

  constructor(private api: ColmenarService, private ensoApi: EnsoService) { }

  ngOnInit(): void {
    this.cargar();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  cargar(): void {
    this.estado = 'cargando';
    this.mensaje = undefined;
    const hasta = new Date().getFullYear();
    const tramos: [number, number][] = [];
    for (let a = ANIO_INICIO_ENSO; a <= hasta; a += COLMENAR_MAX_ANIOS_RANGO) {
      tramos.push([a, Math.min(hasta, a + COLMENAR_MAX_ANIOS_RANGO - 1)]);
    }
    this.sub?.unsubscribe();
    this.sub = forkJoin({
      enso: this.ensoApi.get(),
      mensuales: forkJoin(tramos.map(([d, h]) => this.api.getMensuales(d, h))).pipe(
        map((r: MensualesResponse[]) => r.flatMap((t) => t.datos ?? []))
      )
    })
      .pipe(
        catchError((err: unknown) => {
          this.estado = 'error';
          this.mensaje = this.api.mensajeError(err);
          return of(null);
        })
      )
      .subscribe((r) => {
        if (!r) {
          return;
        }
        this.enso = r.enso;
        this.mensuales = new Map(r.mensuales.map((m) => [`${m.anio}-${m.mes}`, m]));
        this.fases = new Map(r.enso.temporadas.map((t) => [`${t.anio}-${t.mes}`, t]));
        this.estado = r.mensuales.length ? 'ok' : 'vacio';
        this.calcular();
      });
  }

  setVariable(id: string): void {
    this.variable = this.variables.find((v) => v.id === id) ?? this.variables[0];
    this.calcular();
  }

  setPeriodo(id: string): void {
    this.periodo = this.periodos.find((p) => p.id === id) ?? this.periodos[0];
    this.calcular();
  }

  get decimales(): number {
    return this.variable.tipo === 'suma' ? 0 : 1;
  }

  /** Unidad de la diferencia con los años neutros. */
  get unidadDif(): string {
    return this.variable.tipo === 'suma' ? '%' : '°C';
  }

  /** Valor mensual validado por la API; null si el mes no está completo. */
  private valorMes(anio: number, mes: number): number | null {
    const m = this.mensuales.get(`${anio}-${mes}`);
    if (!m) {
      return null;
    }
    if (this.variable.id === 'pp') {
      return m.lluvia_completa ? m.lluvia_mensual_valida : null;
    }
    return this.variable.id === 'tmax' ? m.tmax_media_valida : m.tmin_media_valida;
  }

  private calcular(): void {
    if (this.estado !== 'ok') {
      return;
    }
    this.calcularCampanias();
    this.calcularMeses();
    this.armarGraficos();
  }

  /**
   * Cada campaña se clasifica con la temporada NDJ (nov–dic–ene) del año en que empieza, que suele
   * ser la del pico del evento. Sólo entran las campañas con todos sus meses completos.
   */
  private calcularCampanias(): void {
    const campanias: Campania[] = [];
    const ultimo = new Date().getFullYear();
    for (let anio = ANIO_INICIO_ENSO; anio <= ultimo; anio++) {
      const temporada = this.fases.get(`${anio}-12`);
      if (!temporada) {
        continue;
      }
      const vals = this.periodo.meses.map(([d, mes]) => this.valorMes(anio + d, mes));
      if (vals.some((v) => v === null)) {
        continue;
      }
      const nums = vals as number[];
      const valor = this.variable.tipo === 'suma' ? nums.reduce((s, x) => s + x, 0) : (media(nums) as number);
      const cruza = this.periodo.meses.some(([d]) => d > 0) && this.periodo.meses.some(([d]) => d === 0);
      const etiqueta = cruza ? `${anio}–${String(anio + 1).slice(2)}` : String(this.periodo.meses[0][0] ? anio + 1 : anio);
      campanias.push({ anio, etiqueta, valor, temporada });
    }
    this.campanias = campanias;

    const todos = campanias.map((c) => c.valor);
    this.medianaGeneral = mediana(todos);
    const neutros = campanias.filter((c) => c.temporada.fase === 'neutro').map((c) => c.valor);
    const mediaNeutro = media(neutros);

    const grupo = (id: GrupoId, nombre: string, lista: Campania[]): FilaGrupo => {
      const v = lista.map((c) => c.valor);
      const m = media(v);
      let dif: number | null = null;
      if (m !== null && mediaNeutro !== null && id !== 'neutro') {
        dif = this.variable.tipo === 'suma' ? (mediaNeutro ? ((m - mediaNeutro) / mediaNeutro) * 100 : null) : m - mediaNeutro;
      }
      const med = this.medianaGeneral;
      return {
        id,
        nombre,
        n: v.length,
        media: m,
        mediana: mediana(v),
        difNeutro: dif,
        pctSobreMediana: v.length && med !== null ? (v.filter((x) => x > med).length / v.length) * 100 : null
      };
    };
    const fuertes = campanias.filter((c) => c.temporada.fase === 'nino' && (c.temporada.pico ?? 0) >= PICO_FUERTE);
    this.grupos = [
      grupo('nina', 'La Niña', campanias.filter((c) => c.temporada.fase === 'nina')),
      grupo('neutro', 'Neutro', campanias.filter((c) => c.temporada.fase === 'neutro')),
      grupo('nino', 'El Niño', campanias.filter((c) => c.temporada.fase === 'nino')),
      grupo('nino-fuerte', 'El Niño fuerte o muy fuerte', fuertes)
    ];
    this.aniosNinoFuerte = fuertes.map((c) => c.etiqueta);
  }

  /** Media de cada mes calendario según la fase de la temporada centrada en ese mes. */
  private calcularMeses(): void {
    const ultimo = new Date().getFullYear();
    this.filasMes = MESES.map((_, i) => {
      const mes = i + 1;
      const listas: Record<FaseEnso, number[]> = { nino: [], neutro: [], nina: [] };
      for (let anio = ANIO_INICIO_ENSO; anio <= ultimo; anio++) {
        const t = this.fases.get(`${anio}-${mes}`);
        const v = this.valorMes(anio, mes);
        if (t && v !== null) {
          listas[t.fase].push(v);
        }
      }
      const porFase = {} as FilaMes['porFase'];
      FASES.forEach((f) => (porFase[f] = { media: media(listas[f]), n: listas[f].length }));
      return { mes, porFase };
    });
  }

  private armarGraficos(): void {
    const v = this.variable;
    const dec = this.decimales;
    const fuente = `${FUENTE_TEXTO} · RONI: NOAA CPC`;

    // Campañas de cada serie, en el mismo orden que sus puntos (para el tooltip).
    const porFase = FASES.map((f) => this.campanias.filter((c) => c.temporada.fase === f));
    this.datosDispersion = {
      datasets: FASES.map((f, i) => ({
        label: FASE_ENSO[f].nombre,
        data: porFase[i].map((c) => ({ x: c.temporada.roni, y: redondear(c.valor, 1) })),
        backgroundColor: FASE_ENSO[f].color,
        borderColor: FASE_ENSO[f].color,
        pointRadius: 5,
        pointHoverRadius: 7
      }))
    };
    const base = opcionesBase(v.unidad, { minCero: v.tipo === 'suma', decimales: dec }) as ChartOptions<'scatter'>;
    this.opcionesDispersion = {
      ...base,
      interaction: { mode: 'nearest', intersect: true },
      plugins: {
        ...base.plugins,
        subtitle: { display: true, text: fuente },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const c = porFase[ctx.datasetIndex]?.[ctx.dataIndex];
              const t = c ? ` (RONI ${nombreTemporada(c.temporada)}: ${fmtSigno(c.temporada.roni, 2)} °C)` : '';
              return `${c?.etiqueta ?? ''}: ${fmt(ctx.parsed.y, dec)} ${v.unidad}${t}`;
            }
          }
        },
        referencias: {
          lineas: this.medianaGeneral !== null
            ? [{ valor: this.medianaGeneral, etiqueta: `Mediana ${fmt(this.medianaGeneral, dec)} ${v.unidad}`, color: COLOR.normal }]
            : []
        }
      },
      scales: {
        ...base.scales,
        x: {
          type: 'linear',
          title: { display: true, text: 'RONI de nov–dic–ene (°C)', color: COLOR.texto },
          grid: { color: COLOR.grilla },
          ticks: { color: COLOR.texto, callback: (x) => fmtSigno(Number(x), 1) }
        }
      }
    };

    this.datosMeses = {
      labels: MESES_CORTOS,
      datasets: FASES.map((f) => ({
        label: FASE_ENSO[f].nombre,
        data: this.filasMes.map((m) => {
          const x = m.porFase[f].media;
          return x === null ? null : redondear(x, 1);
        }),
        backgroundColor: FASE_ENSO[f].color,
        borderColor: FASE_ENSO[f].color,
        borderRadius: 3,
        maxBarThickness: 18
      })) as ChartData<'bar'>['datasets']
    };
    const baseMeses = opcionesBase(v.unidad, { minCero: v.tipo === 'suma', decimales: 1 }) as ChartOptions<'bar'>;
    this.opcionesMeses = {
      ...baseMeses,
      plugins: { ...baseMeses.plugins, subtitle: { display: true, text: fuente } }
    };
  }

  /** Diferencia de un mes entre una fase y la neutra, en la misma unidad que la tabla de campañas. */
  difMes(fila: FilaMes, fase: FaseEnso): number | null {
    const a = fila.porFase[fase].media;
    const n = fila.porFase.neutro.media;
    if (a === null || n === null) {
      return null;
    }
    if (this.variable.tipo === 'suma') {
      return n ? ((a - n) / n) * 100 : null;
    }
    return a - n;
  }

  /** Clase de color de una diferencia: en lluvia, más es azul; en temperatura, más es rojo. */
  claseDif(v: number | null): string {
    if (v === null || Math.abs(v) < 0.05) {
      return '';
    }
    if (this.variable.tipo === 'suma') {
      return v > 0 ? 'pos-pp' : 'neg-pp';
    }
    return v > 0 ? 'pos' : 'neg';
  }

  get temporadaActual(): TemporadaEnso | null {
    const t = this.enso?.temporadas;
    return t?.length ? t[t.length - 1] : null;
  }

  readonly nombreTemporada = nombreTemporada;
  readonly intensidadEnso = intensidadEnso;
}

function mediana(v: number[]): number | null {
  if (!v.length) {
    return null;
  }
  const o = [...v].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}
