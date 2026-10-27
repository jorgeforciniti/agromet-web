import { Component, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions } from 'chart.js';
import { Subscription, forkJoin } from 'rxjs';
import { ColmenarService } from '../../../services/colmenar.service';
import {
  ClasificacionLluviasResponse,
  ExtremosTermicosResponse,
  IndicadorExtremo,
  MensualesResponse,
  NormalesResponse,
  Recurso
} from '../../colmenar.models';
import { COLOR, fmt, fmtSigno, INDICADORES, MESES, MESES_CORTOS, normalDeMes, opcionesBase, porMes } from '../../colmenar.utils';
import { EstadoCargaComponent } from '../../shared/estado-carga.component';

type VariableComp = 'pp' | 'tmax' | 'tmin' | IndicadorExtremo;

interface DatosAnio {
  mensuales: Recurso<MensualesResponse>;
  lluvias: Recurso<ClasificacionLluviasResponse>;
  extremos: Recurso<ExtremosTermicosResponse>;
}

interface ValorMes {
  valor: number | null;
  completo: boolean;
  /** Valor observado de un mes incompleto (sólo referencia). */
  parcial: number | null;
}

interface FilaComp {
  mes: number;
  a: ValorMes;
  b: ValorMes;
  normal: number | null;
  /** Año seleccionado (A) menos año de comparación (B). */
  diferencia: number | null;
}

@Component({
  selector: 'app-colmenar-comparacion',
  standalone: true,
  imports: [CommonModule, BaseChartDirective, EstadoCargaComponent],
  templateUrl: './comparacion.component.html',
  styleUrls: ['../../shared/seccion.css']
})
export class ComparacionComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) anio!: number;
  @Input({ required: true }) anios!: number[];
  @Input({ required: true }) mensuales!: Recurso<MensualesResponse>;
  @Input({ required: true }) lluvias!: Recurso<ClasificacionLluviasResponse>;
  @Input({ required: true }) extremos!: Recurso<ExtremosTermicosResponse>;
  @Input({ required: true }) normales!: Recurso<NormalesResponse>;

  readonly fmt = fmt;
  readonly fmtSigno = fmtSigno;
  readonly MESES = MESES;

  readonly variables: { id: VariableComp; etiqueta: string; unidad: string; tipo: 'suma' | 'media'; dec: number }[] = [
    { id: 'pp', etiqueta: 'Precipitación mensual', unidad: 'mm', tipo: 'suma', dec: 1 },
    { id: 'tmax', etiqueta: 'Tmax media', unidad: '°C', tipo: 'media', dec: 1 },
    { id: 'tmin', etiqueta: 'Tmin media', unidad: '°C', tipo: 'media', dec: 1 },
    ...INDICADORES.map((i) => ({ id: i.clave as VariableComp, etiqueta: i.etiqueta, unidad: 'días', tipo: 'suma' as const, dec: 0 }))
  ];

  variable = this.variables[0];
  anioB = 0;
  datosB: DatosAnio | null = null;
  filas: FilaComp[] = [];
  mesesComparables = 0;
  totalA: number | null = null;
  totalB: number | null = null;
  /** Normal 1991–2020 de los mismos meses comparables. */
  normalComparables: number | null = null;
  /** Valor anual (suma o promedio de los 12 meses) sólo si el año tiene los 12 meses completos. */
  anualA: number | null = null;
  anualB: number | null = null;
  /** Normal anual 1991–2020: suma (lluvia, días) o promedio (temperaturas) de las 12 normales mensuales. */
  normalAnual: number | null = null;

  datos: ChartData<'bar' | 'line'> = { labels: [], datasets: [] };
  opciones: ChartOptions<'bar'> = opcionesBase('mm') as ChartOptions<'bar'>;

  private sub?: Subscription;

  constructor(private api: ColmenarService) { }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['anio'] && (this.anioB === 0 || this.anioB === this.anio)) {
      const previo = this.anio - 1;
      this.setAnioB(this.anios.includes(previo) ? previo : this.anio + 1);
      return;
    }
    this.calcular();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  /** Estado combinado de los datos de ambos años para la variable elegida. */
  get estadoB(): Recurso<unknown>['estado'] {
    if (!this.datosB) {
      return 'cargando';
    }
    const ra = this.recursoVariable(this.datosA);
    const rb = this.recursoVariable(this.datosB);
    if (ra.estado === 'cargando' || rb.estado === 'cargando') {
      return 'cargando';
    }
    return ra.estado === 'error' || rb.estado === 'error' ? 'error' : 'ok';
  }

  get mensajeB(): string | undefined {
    const ra = this.recursoVariable(this.datosA);
    const rb = this.datosB ? this.recursoVariable(this.datosB) : null;
    return ra.mensaje ?? rb?.mensaje;
  }

  private get datosA(): DatosAnio {
    return { mensuales: this.mensuales, lluvias: this.lluvias, extremos: this.extremos };
  }

  setAnioB(v: number | string): void {
    this.anioB = Number(v);
    this.datosB = null;
    this.calcular();
    this.sub?.unsubscribe();
    const b = this.anioB;
    this.sub = forkJoin({
      mensuales: this.api.recurso(this.api.getMensuales(b, b), (r) => !r.datos?.length),
      lluvias: this.api.recurso(this.api.getClasificacionLluvias(b), (r) => !r.datos?.length),
      extremos: this.api.recurso(this.api.getExtremosTermicos(b), (r) => !r.datos?.length)
    }).subscribe((r) => {
      this.datosB = r;
      this.calcular();
    });
  }

  setVariable(id: string): void {
    this.variable = this.variables.find((v) => v.id === id) ?? this.variables[0];
    this.calcular();
  }

  private recursoVariable(d: DatosAnio): Recurso<unknown> {
    const id = this.variable.id;
    return id === 'pp' ? d.lluvias : id === 'tmax' || id === 'tmin' ? d.mensuales : d.extremos;
  }

  private valores(d: DatosAnio | null): ValorMes[] {
    const id = this.variable.id;
    const vacio: ValorMes = { valor: null, completo: false, parcial: null };
    if (!d) {
      return Array.from({ length: 12 }, () => vacio);
    }
    if (id === 'pp') {
      return porMes(d.lluvias.datos?.datos).map((m) => m
        ? { valor: m.lluvia_completa ? m.lluvia_mm : null, completo: m.lluvia_completa && m.lluvia_mm !== null, parcial: m.lluvia_completa ? null : m.lluvia_parcial_mm }
        : vacio);
    }
    if (id === 'tmax' || id === 'tmin') {
      return porMes(d.mensuales.datos?.datos).map((m) => {
        if (!m) {
          return vacio;
        }
        const v = id === 'tmax' ? m.tmax_media_valida : m.tmin_media_valida;
        const obs = id === 'tmax' ? m.tmax_media_observada : m.tmin_media_observada;
        return { valor: v, completo: v !== null, parcial: v === null ? obs : null };
      });
    }
    const ind = INDICADORES.find((i) => i.clave === id)!;
    return porMes(d.extremos.datos?.datos).map((m) => {
      if (!m) {
        return vacio;
      }
      const completo = ind.variable === 'max' ? m.completa_max : m.completa_min;
      return { valor: completo ? m[ind.clave] : null, completo, parcial: completo ? null : m[ind.clave] };
    });
  }

  private normalesVariable(): (number | null)[] {
    const id = this.variable.id;
    const n = this.normales.datos?.datos;
    if (id === 'pp' || id === 'tmax' || id === 'tmin') {
      const campo = id === 'pp' ? 'pp_normal' : id === 'tmax' ? 'tmax_normal' : 'tmin_normal';
      return Array.from({ length: 12 }, (_, i) => normalDeMes(n, i + 1)?.[campo] ?? null);
    }
    // Normales de frecuencias: iguales en cualquier año; se toman del año A o, si falta el mes, del B.
    const a = porMes(this.extremos.datos?.datos);
    const b = porMes(this.datosB?.extremos.datos?.datos);
    return a.map((m, i) => m?.normales_1991_2020?.[id] ?? b[i]?.normales_1991_2020?.[id] ?? null);
  }

  private calcular(): void {
    const va = this.valores(this.datosA);
    const vb = this.valores(this.datosB);
    const normales = this.normalesVariable();
    this.filas = va.map((a, i) => ({
      mes: i + 1,
      a,
      b: vb[i],
      normal: normales[i],
      diferencia: a.completo && vb[i].completo && a.valor !== null && vb[i].valor !== null ? (a.valor as number) - (vb[i].valor as number) : null
    }));

    // Totales sólo sobre meses completos en ambos años.
    const comparables = this.filas.filter((f) => f.diferencia !== null);
    this.mesesComparables = comparables.length;
    const agregar = (vals: number[]) => (vals.length ? (this.variable.tipo === 'suma' ? vals.reduce((s, x) => s + x, 0) : vals.reduce((s, x) => s + x, 0) / vals.length) : null);
    this.totalA = agregar(comparables.map((f) => f.a.valor as number));
    this.totalB = agregar(comparables.map((f) => f.b.valor as number));
    const normalesComp = comparables.map((f) => f.normal);
    this.normalComparables = normalesComp.every((n) => n !== null) ? agregar(normalesComp as number[]) : null;

    const anual = (lado: 'a' | 'b') =>
      this.filas.every((f) => f[lado].completo && f[lado].valor !== null) ? agregar(this.filas.map((f) => f[lado].valor as number)) : null;
    this.anualA = anual('a');
    this.anualB = anual('b');
    const normales12 = this.filas.map((f) => f.normal);
    this.normalAnual = normales12.every((n) => n !== null) ? agregar(normales12 as number[]) : null;
    this.armarGrafico();
  }

  private armarGrafico(): void {
    const linea = this.variable.tipo === 'media';
    const tipo = linea ? 'line' : 'bar';
    const serie = (anio: number, vals: ValorMes[], color: string) => ({
      type: tipo,
      label: String(anio),
      data: vals.map((v) => v.valor),
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2,
      borderRadius: 4,
      maxBarThickness: 26,
      pointRadius: 4,
      order: 2
    });
    this.datos = {
      labels: MESES_CORTOS,
      datasets: [
        serie(this.anio, this.filas.map((f) => f.a), COLOR.anioA),
        serie(this.anioB, this.filas.map((f) => f.b), COLOR.anioB),
        {
          type: 'line',
          label: 'Normal 1991–2020',
          data: this.filas.map((f) => f.normal),
          borderColor: COLOR.normal,
          backgroundColor: COLOR.normal,
          borderDash: [6, 4],
          borderWidth: 2,
          pointRadius: 2,
          order: 1
        }
      ]
    } as ChartData<'bar' | 'line'>;
    this.opciones = opcionesBase(this.variable.unidad, { minCero: !linea, decimales: this.variable.dec }) as ChartOptions<'bar'>;
  }

  incompletos(lado: 'a' | 'b'): string {
    const m = this.filas.filter((f) => !f[lado].completo && f[lado].parcial !== null).map((f) => MESES_CORTOS[f.mes - 1].toLowerCase());
    return m.join(', ');
  }
}
