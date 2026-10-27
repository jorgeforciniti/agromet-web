import { Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions } from 'chart.js';
import { Subscription, forkJoin } from 'rxjs';
import { COLMENAR_ANIO_INICIO, COLMENAR_MAX_ANIOS_RANGO, ColmenarService } from '../../../services/colmenar.service';
import { AnomaliaMensual, AnomaliasResponse, EstadoCarga, NormalesResponse, NormalMensual, Recurso } from '../../colmenar.models';
import { COLOR, fmt, fmtSigno, MESES, media, opcionesBase, suma } from '../../colmenar.utils';
import { AyudaTerminoComponent } from '../../shared/ayuda-termino.component';
import { EstadoCargaComponent } from '../../shared/estado-carga.component';

type Variable = 'max' | 'min' | 'pp';

interface DefVariable {
  id: Variable;
  boton: string;
  nombre: string;
  corta: string;
  unidad: string;
  /** Temperaturas: promedio de los 12 meses; precipitación: suma de los 12 meses. */
  agregado: 'media' | 'suma';
  color: string;
  colorPositivo: string;
  colorNegativo: string;
  valor: (d: AnomaliaMensual) => number | null;
  normalFila: (d: AnomaliaMensual) => number | null;
  normal: (n: NormalMensual) => number | null;
}

interface PuntoAnual {
  anio: number;
  valor: number | null;
  normal: number | null;
  anomalia: number | null;
  /** Anomalía relativa (sólo precipitación). */
  anomaliaPct: number | null;
  /** Motivo por el que no hay valor (mes o año incompleto, sin registros). */
  motivo: string | null;
}

interface Tendencia {
  pendienteDecada: number;
  n: number;
  /** Valores de la recta para cada año del período (null fuera del tramo con datos). */
  recta: (number | null)[];
}

const VARIABLES: DefVariable[] = [
  {
    id: 'max', boton: 'Máximas', nombre: 'Temperatura máxima media', corta: 'Tmax media', unidad: '°C', agregado: 'media',
    color: COLOR.tmax, colorPositivo: COLOR.positivoTermico, colorNegativo: COLOR.negativoTermico,
    valor: (d) => d.tmax_media_valida, normalFila: (d) => d.tmax_normal, normal: (n) => n.tmax_normal
  },
  {
    id: 'min', boton: 'Mínimas', nombre: 'Temperatura mínima media', corta: 'Tmin media', unidad: '°C', agregado: 'media',
    color: COLOR.tmin, colorPositivo: COLOR.positivoTermico, colorNegativo: COLOR.negativoTermico,
    valor: (d) => d.tmin_media_valida, normalFila: (d) => d.tmin_normal, normal: (n) => n.tmin_normal
  },
  {
    id: 'pp', boton: 'Precipitación', nombre: 'Precipitación', corta: 'Precipitación', unidad: 'mm', agregado: 'suma',
    color: COLOR.lluvia, colorPositivo: COLOR.humedo, colorNegativo: COLOR.seco,
    valor: (d) => d.lluvia_mensual_valida, normalFila: (d) => d.pp_normal, normal: (n) => n.pp_normal
  }
];

@Component({
  selector: 'app-colmenar-evolucion',
  standalone: true,
  imports: [CommonModule, BaseChartDirective, AyudaTerminoComponent, EstadoCargaComponent],
  templateUrl: './evolucion.component.html',
  styleUrls: ['../../shared/seccion.css']
})
export class EvolucionComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) anio!: number;
  @Input({ required: true }) normales!: Recurso<NormalesResponse>;

  readonly fmt = fmt;
  readonly fmtSigno = fmtSigno;
  readonly MESES = MESES;
  readonly VARIABLES = VARIABLES;
  readonly longitudes = [10, 20, 30, 50];

  variable: DefVariable = VARIABLES[0];
  /** 0 = anual; 1–12 = mes. */
  mes = 1;
  longitud = 30;

  estado: EstadoCarga = 'cargando';
  mensaje?: string;
  private datos: AnomaliaMensual[] = [];
  private claveCargada = '';

  puntos: PuntoAnual[] = [];
  validos: PuntoAnual[] = [];
  tendencia: Tendencia | null = null;
  promedio: number | null = null;
  normalPeriodo: number | null = null;
  mayor: PuntoAnual | null = null;
  menor: PuntoAnual | null = null;
  sobreNormal = 0;

  datosSerie: ChartData<'bar' | 'line'> = { labels: [], datasets: [] };
  datosAnomalia: ChartData<'bar'> = { labels: [], datasets: [] };
  opcionesSerie: ChartOptions<'bar'> = opcionesBase('°C') as ChartOptions<'bar'>;
  opcionesAnomalia: ChartOptions<'bar'> = opcionesBase('°C') as ChartOptions<'bar'>;

  private sub?: Subscription;

  constructor(private api: ColmenarService) { }

  get esLluvia(): boolean {
    return this.variable.id === 'pp';
  }

  get desde(): number {
    return Math.max(COLMENAR_ANIO_INICIO, this.anio - this.longitud + 1);
  }

  get etiquetaPeriodo(): string {
    return this.mes ? MESES[this.mes - 1] : 'Anual';
  }

  /** Descripción de lo que representa cada valor anual de la serie. */
  get descripcionValor(): string {
    if (this.esLluvia) {
      return this.mes ? `Precipitación de ${MESES[this.mes - 1].toLowerCase()}` : 'Precipitación anual (enero–diciembre)';
    }
    return `${this.variable.nombre} de ${this.mes ? MESES[this.mes - 1].toLowerCase() : 'cada año'}`;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['anio']) {
      this.cargar();
    } else if (changes['normales']) {
      this.calcular();
    }
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  setVariable(v: DefVariable): void {
    this.variable = v;
    this.calcular();
  }

  setMes(v: string): void {
    this.mes = Number(v);
    this.calcular();
  }

  setLongitud(v: string): void {
    this.longitud = Number(v);
    this.cargar();
  }

  /** La API admite hasta 20 años por consulta: el período se pide en tramos y se combina. */
  cargar(): void {
    const desde = this.desde;
    const hasta = this.anio;
    const clave = `${desde}-${hasta}`;
    if (clave === this.claveCargada && this.estado === 'ok') {
      this.calcular();
      return;
    }
    const tramos: [number, number][] = [];
    for (let a = desde; a <= hasta; a += COLMENAR_MAX_ANIOS_RANGO) {
      tramos.push([a, Math.min(hasta, a + COLMENAR_MAX_ANIOS_RANGO - 1)]);
    }
    this.estado = 'cargando';
    this.mensaje = undefined;
    this.sub?.unsubscribe();
    this.sub = forkJoin(
      tramos.map(([d, h]) => this.api.recurso(this.api.getAnomalias(d, h), (r: AnomaliasResponse) => !r.datos?.length))
    ).subscribe((res) => {
      const error = res.find((r) => r.estado === 'error');
      this.datos = res.flatMap((r) => r.datos?.datos ?? []);
      this.claveCargada = clave;
      if (error) {
        // Un tramo con error invalida la serie: no se muestra una evolución con huecos no explicados.
        this.estado = 'error';
        this.mensaje = error.mensaje;
      } else {
        this.estado = this.datos.length ? 'ok' : 'vacio';
      }
      this.calcular();
    });
  }

  private calcular(): void {
    if (this.estado !== 'ok') {
      this.puntos = [];
      this.validos = [];
      this.tendencia = null;
      return;
    }
    const v = this.variable;
    const agregar = (vals: number[]) => (v.agregado === 'suma' ? suma(vals) : (media(vals) as number));
    const porAnio = new Map<number, AnomaliaMensual[]>();
    for (const d of this.datos) {
      porAnio.set(d.anio, [...(porAnio.get(d.anio) ?? []), d]);
    }

    // Normal del período elegido: la del mes, o el promedio (temperatura) / suma (lluvia) de las 12 normales mensuales.
    const normalesMes = this.normales.datos?.datos ?? [];
    const normalMensual = (m: number) => {
      const n = normalesMes.find((x) => x.mes === m);
      return n ? v.normal(n) : null;
    };
    let normal: number | null;
    if (this.mes) {
      normal = normalMensual(this.mes);
    } else {
      const ns = Array.from({ length: 12 }, (_, i) => normalMensual(i + 1));
      normal = ns.every((n) => n !== null) ? agregar(ns as number[]) : null;
    }
    this.normalPeriodo = normal;

    const anios = Array.from({ length: this.anio - this.desde + 1 }, (_, i) => this.desde + i);
    this.puntos = anios.map((anio): PuntoAnual => {
      const filas = porAnio.get(anio) ?? [];
      let valor: number | null;
      let n: number | null = normal;
      let motivo: string | null = null;
      if (this.mes) {
        const f = filas.find((x) => x.mes === this.mes);
        valor = f ? v.valor(f) : null;
        n = (f ? v.normalFila(f) : null) ?? normal;
        motivo = valor !== null ? null : f ? 'Mes incompleto' : 'Sin registros';
      } else {
        // Anual: sólo con los 12 meses validados; nunca un valor anual con meses faltantes.
        const vals = filas.map(v.valor).filter((x): x is number => x !== null);
        valor = vals.length === 12 ? agregar(vals) : null;
        motivo = valor !== null ? null : filas.length ? `Año incompleto (${vals.length}/12 meses)` : 'Sin registros';
      }
      const anomalia = valor !== null && n !== null ? valor - n : null;
      return {
        anio,
        valor,
        normal: n,
        anomalia,
        anomaliaPct: this.esLluvia && anomalia !== null && n ? (anomalia / n) * 100 : null,
        motivo
      };
    });

    this.validos = this.puntos.filter((p) => p.valor !== null);
    this.promedio = media(this.validos.map((p) => p.valor as number));
    this.sobreNormal = this.validos.filter((p) => (p.anomalia ?? 0) > 0).length;
    this.mayor = this.validos.reduce<PuntoAnual | null>((a, p) => (!a || (p.valor as number) > (a.valor as number) ? p : a), null);
    this.menor = this.validos.reduce<PuntoAnual | null>((a, p) => (!a || (p.valor as number) < (a.valor as number) ? p : a), null);
    this.tendencia = this.calcularTendencia(anios);
    this.armarGraficos(anios);
  }

  /** Recta de mínimos cuadrados sobre los años con valor válido (mínimo 5). */
  private calcularTendencia(anios: number[]): Tendencia | null {
    const pts = this.validos;
    if (pts.length < 5) {
      return null;
    }
    const mx = media(pts.map((p) => p.anio)) as number;
    const my = media(pts.map((p) => p.valor as number)) as number;
    let sxy = 0;
    let sxx = 0;
    for (const p of pts) {
      sxy += (p.anio - mx) * ((p.valor as number) - my);
      sxx += (p.anio - mx) ** 2;
    }
    if (!sxx) {
      return null;
    }
    const b = sxy / sxx;
    const a = my - b * mx;
    const primero = pts[0].anio;
    const ultimo = pts[pts.length - 1].anio;
    return {
      pendienteDecada: b * 10,
      n: pts.length,
      recta: anios.map((x) => (x >= primero && x <= ultimo ? a + b * x : null))
    };
  }

  private armarGraficos(anios: number[]): void {
    const v = this.variable;
    const lluvia = this.esLluvia;
    const decTendencia = lluvia ? 1 : 2;
    this.datosSerie = {
      labels: anios.map(String),
      datasets: [
        {
          type: lluvia ? 'bar' : 'line',
          label: `${v.corta} · ${this.etiquetaPeriodo}`,
          data: this.puntos.map((p) => p.valor),
          borderColor: v.color,
          backgroundColor: v.color,
          borderWidth: 2,
          borderRadius: 3,
          maxBarThickness: 18,
          pointRadius: 3,
          pointHoverRadius: 6,
          spanGaps: false,
          order: 2
        },
        {
          type: 'line',
          label: 'Normal 1991–2020',
          data: this.puntos.map((p) => p.normal),
          borderColor: COLOR.normal,
          backgroundColor: COLOR.normal,
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
          pointHoverRadius: 3,
          order: 1
        },
        ...(this.tendencia
          ? [{
            type: 'line' as const,
            label: `Tendencia lineal (${fmtSigno(this.tendencia.pendienteDecada, decTendencia)} ${v.unidad}/década)`,
            data: this.tendencia.recta,
            borderColor: '#111827',
            backgroundColor: '#111827',
            borderWidth: 1.5,
            borderDash: [2, 3],
            pointRadius: 0,
            pointHoverRadius: 0,
            order: 0
          }]
          : [])
      ]
    } as ChartData<'bar' | 'line'>;
    this.opcionesSerie = opcionesBase(v.unidad, { minCero: lluvia }) as ChartOptions<'bar'>;

    const anomalias = this.puntos.map((p) => p.anomalia);
    this.datosAnomalia = {
      labels: anios.map(String),
      datasets: [
        {
          label: 'Anomalía',
          data: anomalias,
          backgroundColor: anomalias.map((x) => ((x ?? 0) >= 0 ? v.colorPositivo : v.colorNegativo)),
          borderRadius: 3,
          maxBarThickness: 18
        }
      ]
    };
    const o = opcionesBase(v.unidad) as ChartOptions<'bar'>;
    o.plugins = { ...o.plugins, legend: { display: false } };
    this.opcionesAnomalia = o;
  }

  get excluidos(): PuntoAnual[] {
    return this.puntos.filter((p) => p.valor === null);
  }

  get puntosDesc(): PuntoAnual[] {
    return [...this.puntos].reverse();
  }
}
