import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions, TooltipItem } from 'chart.js';
import {
  ClasificacionAnualIndicador,
  ExtremoMensual,
  ExtremosTermicosResponse,
  IndicadorExtremo,
  Recurso
} from '../../colmenar.models';
import {
  CATEGORIAS,
  coloresCategoria,
  COLOR,
  fmt,
  fmtSigno,
  IndicadorInfo,
  INDICADORES,
  listaMeses,
  MESES,
  MESES_CORTOS,
  opcionesBase,
  porMes,
  rayado
} from '../../colmenar.utils';
import { ClasificacionBadgeComponent } from '../../shared/clasificacion-badge.component';
import { AyudaTerminoComponent } from '../../shared/ayuda-termino.component';
import { EstadoCargaComponent } from '../../shared/estado-carga.component';

interface TarjetaAnual {
  ind: IndicadorInfo;
  observado: number | null;
  completo: boolean;
  clasificacion: string | null;
  percentiles: ClasificacionAnualIndicador['percentiles_1991_2020'] | null;
  /** Posición (0–100 %) del valor observado sobre la regla de percentiles. */
  posicion: number | null;
  mesesCompletos: number[];
  obsCompletos: number | null;
  normalCompletos: number | null;
  anomaliaCompletos: number | null;
}

@Component({
  selector: 'app-colmenar-extremos',
  standalone: true,
  imports: [CommonModule, BaseChartDirective, ClasificacionBadgeComponent, AyudaTerminoComponent, EstadoCargaComponent],
  templateUrl: './extremos.component.html',
  styleUrls: ['../../shared/seccion.css', './extremos.component.css']
})
export class ExtremosComponent implements OnChanges {
  @Input({ required: true }) anio!: number;
  @Input({ required: true }) extremos!: Recurso<ExtremosTermicosResponse>;
  @Output() reintentar = new EventEmitter<void>();

  readonly fmt = fmt;
  readonly fmtSigno = fmtSigno;
  readonly listaMeses = listaMeses;
  readonly MESES = MESES;
  readonly INDICADORES = INDICADORES;
  readonly CATEGORIAS = CATEGORIAS;

  indicador: IndicadorInfo = INDICADORES[0];
  meses: (ExtremoMensual | null)[] = [];
  tarjetas: TarjetaAnual[] = [];

  datosFrecuencia: ChartData<'bar' | 'line'> = { labels: [], datasets: [] };
  datosAnomalia: ChartData<'bar'> = { labels: [], datasets: [] };
  opcionesFrecuencia = opcionesBase('días', { minCero: true, decimales: 0 }) as ChartOptions<'bar'>;
  readonly opcionesAnomalia = (() => {
    const o = opcionesBase('días') as ChartOptions<'bar'>;
    o.plugins = { ...o.plugins, legend: { display: false } };
    return o;
  })();

  ngOnChanges(): void {
    this.meses = porMes(this.extremos.datos?.datos);
    this.armarTarjetas();
    this.armarGraficos();
  }

  seleccionar(ind: IndicadorInfo): void {
    this.indicador = ind;
    this.armarGraficos();
  }

  completoMes(m: ExtremoMensual | null, ind: IndicadorInfo): boolean {
    return !!m && (ind.variable === 'max' ? m.completa_max : m.completa_min);
  }

  valor(m: ExtremoMensual | null, clave: IndicadorExtremo): number | null {
    return m ? m[clave] : null;
  }

  private armarTarjetas(): void {
    const e = this.extremos.datos;
    if (!e) {
      this.tarjetas = [];
      return;
    }
    const comp = e.comparacion_meses_completos;
    this.tarjetas = INDICADORES.map((ind) => {
      const cl = e.clasificacion_anual?.[ind.clave] ?? null;
      const completo = cl?.anio_completo_variable ?? false;
      const observado = e.resumen_anual?.[ind.clave] ?? cl?.observado_dias ?? null;
      const p = cl?.percentiles_1991_2020 ?? null;
      return {
        ind,
        observado,
        completo,
        // Nunca se muestra una clasificación anual si la API no indica año completo para la variable.
        clasificacion: completo ? cl?.clasificacion ?? null : null,
        percentiles: p,
        posicion: completo && p && observado !== null ? this.posicionEnRegla(observado, p) : null,
        mesesCompletos: this.meses.filter((m) => this.completoMes(m, ind)).map((m) => (m as ExtremoMensual).mes),
        obsCompletos: comp?.observado?.[ind.clave] ?? null,
        normalCompletos: comp?.normal_1991_2020?.[ind.clave] ?? null,
        anomaliaCompletos: comp?.anomalia?.[ind.clave] ?? null
      };
    });
  }

  /** La regla tiene 7 tramos iguales (<P10 … >P90); se interpola dentro del tramo correspondiente. */
  private posicionEnRegla(v: number, p: ClasificacionAnualIndicador['percentiles_1991_2020']): number | null {
    const cortes = [p.p10, p.p20, p.p40, p.p60, p.p80, p.p90];
    if (cortes.some((c) => c === null)) {
      return null;
    }
    const c = cortes as number[];
    const ancho = 100 / 7;
    if (v < c[0]) {
      return ancho * 0.5;
    }
    if (v > c[5]) {
      return ancho * 6.5;
    }
    for (let i = 0; i < 5; i++) {
      if (v <= c[i + 1]) {
        const frac = c[i + 1] === c[i] ? 0.5 : (v - c[i]) / (c[i + 1] - c[i]);
        return ancho * (i + 1 + frac);
      }
    }
    return ancho * 6;
  }

  colorTramo(nivel: number): string {
    return coloresCategoria('termica', CATEGORIAS[nivel + 3]).fondo;
  }

  private armarGraficos(): void {
    const ind = this.indicador;
    const color = ind.variable === 'max' ? COLOR.tmax : COLOR.tmin;
    const completos = this.meses.map((m) => (this.completoMes(m, ind) ? this.valor(m, ind.clave) : null));
    const parciales = this.meses.map((m) => (m && !this.completoMes(m, ind) ? this.valor(m, ind.clave) : null));
    const normales = this.meses.map((m) => m?.normales_1991_2020?.[ind.clave] ?? null);
    const anomalias = this.meses.map((m) => (this.completoMes(m, ind) ? m?.anomalias_dias?.[ind.clave] ?? null : null));

    this.datosFrecuencia = {
      labels: MESES_CORTOS,
      datasets: [
        {
          type: 'bar',
          label: `Observado ${this.anio}`,
          data: completos,
          backgroundColor: color,
          borderRadius: 4,
          maxBarThickness: 34,
          skipNull: true,
          order: 2
        },
        {
          type: 'bar',
          label: 'Conteo parcial (mes incompleto)',
          data: parciales,
          backgroundColor: rayado(color),
          borderColor: color,
          borderWidth: 1,
          borderRadius: 4,
          maxBarThickness: 34,
          skipNull: true,
          order: 2
        },
        {
          type: 'line',
          label: 'Normal 1991–2020',
          data: normales,
          borderColor: COLOR.normal,
          backgroundColor: COLOR.normal,
          borderDash: [6, 4],
          borderWidth: 2,
          pointRadius: 3,
          order: 1
        }
      ]
    } as ChartData<'bar' | 'line'>;

    const o = opcionesBase('días', { minCero: true, decimales: 0 }) as ChartOptions<'bar'>;
    o.plugins = {
      ...o.plugins,
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'bar'>) => {
            const v = ctx.parsed.y;
            if (v === null || v === undefined) {
              return '';
            }
            const dec = ctx.datasetIndex === 2 ? 1 : 0;
            return `${ctx.dataset.label}: ${fmt(v, dec)} días`;
          },
          afterLabel: (ctx: TooltipItem<'bar'>) => {
            const m = this.meses[ctx.dataIndex];
            if (ctx.datasetIndex === 1 && m) {
              const val = ind.variable === 'max' ? m.validos_max : m.validos_min;
              return `${val} de ${m.dias_mes} días válidos`;
            }
            return '';
          }
        }
      }
    };
    this.opcionesFrecuencia = o;

    this.datosAnomalia = {
      labels: MESES_CORTOS,
      datasets: [
        {
          label: 'Anomalía (días)',
          data: anomalias,
          backgroundColor: anomalias.map((v) => ((v ?? 0) >= 0 ? COLOR.positivoTermico : COLOR.negativoTermico)),
          borderRadius: 4,
          maxBarThickness: 28
        }
      ]
    };
  }

}
