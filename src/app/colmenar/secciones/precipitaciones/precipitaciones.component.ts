import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions, TooltipItem } from 'chart.js';
import { ClasificacionLluviasResponse, LluviaMensualClasificada, NormalesResponse, Recurso } from '../../colmenar.models';
import {
  CATEGORIAS,
  categoriaDe,
  coloresCategoria,
  COLOR,
  fmt,
  fmtSigno,
  MESES,
  MESES_CORTOS,
  normalDeMes,
  opcionesBase,
  porMes,
  rayado
} from '../../colmenar.utils';
import { ClasificacionBadgeComponent } from '../../shared/clasificacion-badge.component';
import { AyudaTerminoComponent } from '../../shared/ayuda-termino.component';
import { EstadoCargaComponent } from '../../shared/estado-carga.component';
import { completitudLluvia, CompletitudLluviaComponent } from './completitud-lluvia.component';

interface FilaLluvia {
  mes: number;
  d: LluviaMensualClasificada | null;
  normal: number | null;
  diferencia: number | null;
  acumulado: number | null;
  normalAcumulada: number | null;
}

@Component({
  selector: 'app-colmenar-precipitaciones',
  standalone: true,
  imports: [CommonModule, BaseChartDirective, ClasificacionBadgeComponent, AyudaTerminoComponent, EstadoCargaComponent, CompletitudLluviaComponent],
  templateUrl: './precipitaciones.component.html',
  styleUrls: ['../../shared/seccion.css', './precipitaciones.component.css']
})
export class PrecipitacionesComponent implements OnChanges {
  @Input({ required: true }) anio!: number;
  @Input({ required: true }) lluvias!: Recurso<ClasificacionLluviasResponse>;
  @Input({ required: true }) normales!: Recurso<NormalesResponse>;
  @Output() reintentar = new EventEmitter<void>();

  readonly fmt = fmt;
  readonly fmtSigno = fmtSigno;
  readonly MESES = MESES;
  readonly MESES_CORTOS = MESES_CORTOS;
  readonly CATEGORIAS = CATEGORIAS;

  filas: FilaLluvia[] = [];
  mesesCompletos = 0;
  totalCompletos = 0;
  normalCompletos: number | null = null;
  nuevosRecords = 0;

  datos: ChartData<'bar' | 'line'> = { labels: [], datasets: [] };
  opciones: ChartOptions<'bar'> = opcionesBase('mm', { minCero: true }) as ChartOptions<'bar'>;

  ngOnChanges(): void {
    const meses = porMes(this.lluvias.datos?.datos);
    const normales = this.normales.datos?.datos;
    let acum: number | null = 0;
    let acumNormal: number | null = 0;
    this.filas = meses.map((d, i) => {
      const normal = normalDeMes(normales, i + 1)?.pp_normal ?? null;
      const completo = !!d && d.lluvia_completa && d.lluvia_mm !== null;
      // El acumulado sólo continúa mientras todos los meses previos estén completos.
      acum = completo && acum !== null ? acum + (d.lluvia_mm as number) : null;
      acumNormal = completo && acumNormal !== null && normal !== null ? acumNormal + normal : null;
      return {
        mes: i + 1,
        d,
        normal,
        diferencia: completo && normal !== null ? (d.lluvia_mm as number) - normal : null,
        acumulado: acum,
        normalAcumulada: acum !== null ? acumNormal : null
      };
    });

    const completos = this.filas.filter((f) => f.d?.lluvia_completa && f.d.lluvia_mm !== null);
    this.mesesCompletos = completos.length;
    this.totalCompletos = completos.reduce((s, f) => s + (f.d?.lluvia_mm ?? 0), 0);
    this.normalCompletos = completos.every((f) => f.normal !== null) ? completos.reduce((s, f) => s + (f.normal ?? 0), 0) : null;
    this.nuevosRecords = this.filas.filter((f) => f.d?.estado_record === 'NUEVO_RECORD').length;
    this.armarGrafico();
  }

  /** Estado de récord en lenguaje claro; independiente de la clasificación percentilar. */
  textoRecord(d: LluviaMensualClasificada | null): string {
    if (!d) {
      return 'Sin datos';
    }
    if (!d.lluvia_completa) {
      return 'No evaluable (mes incompleto)';
    }
    switch (d.estado_record) {
      case 'NUEVO_RECORD':
        return 'Nuevo récord mensual';
      case 'SIN_RECORD':
        return 'Sin récord';
      case null:
        return d.maximo_historico_anterior_mm === null ? 'Sin referencia previa' : 'Sin evaluar';
      default:
        return d.estado_record.replace(/_/g, ' ').toLowerCase();
    }
  }

  private armarGrafico(): void {
    const completos = this.filas.map((f) => (f.d?.lluvia_completa ? f.d.lluvia_mm : null));
    const parciales = this.filas.map((f) => this.parcial(f.d));
    const colores = this.filas.map((f) => {
      const cat = categoriaDe(f.d?.clasificacion);
      return cat ? coloresCategoria('lluvia', cat).fondo : COLOR.lluvia;
    });

    this.datos = {
      labels: MESES_CORTOS,
      datasets: [
        {
          type: 'bar',
          label: `Precipitación ${this.anio} (mes completo)`,
          data: completos,
          backgroundColor: colores,
          borderColor: 'rgba(17,24,39,.25)',
          borderWidth: 1,
          borderRadius: 4,
          maxBarThickness: 34,
          skipNull: true,
          order: 2
        },
        {
          type: 'bar',
          label: 'Parcial (mes incompleto)',
          data: parciales,
          backgroundColor: rayado(COLOR.lluvia),
          borderColor: COLOR.lluvia,
          borderWidth: 1,
          borderRadius: 4,
          maxBarThickness: 34,
          skipNull: true,
          order: 2
        },
        {
          type: 'line',
          label: 'Normal 1991–2020',
          data: this.filas.map((f) => f.normal),
          borderColor: COLOR.normal,
          backgroundColor: COLOR.normal,
          borderDash: [6, 4],
          borderWidth: 2,
          pointRadius: 3,
          order: 1
        }
      ]
    } as ChartData<'bar' | 'line'>;

    const base = opcionesBase('mm', { minCero: true }) as ChartOptions<'bar'>;
    base.plugins = {
      ...base.plugins,
      legend: {
        ...base.plugins?.legend,
        labels: { ...base.plugins?.legend?.labels, usePointStyle: true },
        // La leyenda de colores por categoría se muestra debajo del gráfico.
        display: true
      },
      tooltip: {
        ...base.plugins?.tooltip,
        callbacks: {
          ...base.plugins?.tooltip?.callbacks,
          afterLabel: (ctx: TooltipItem<'bar'>) => {
            const f = this.filas[ctx.dataIndex];
            if (ctx.datasetIndex === 0 && f?.d?.clasificacion) {
              return `Clasificación: ${f.d.clasificacion}`;
            }
            if (ctx.datasetIndex === 1 && f?.d) {
              const c = completitudLluvia(f.d);
              return `${c.etiqueta}${c.detalle ? ' (' + c.detalle + ')' : ''}. Acumulado parcial, no se clasifica.`;
            }
            return '';
          }
        }
      }
    };
    this.opciones = base;
  }

  /** Acumulado parcial sólo si hay días con precipitación informada: nunca se muestra 0 por ausencia de datos. */
  parcial(d: LluviaMensualClasificada | null): number | null {
    return d && !d.lluvia_completa && d.dias_disponibles_pp > 0 ? d.lluvia_parcial_mm : null;
  }

  etiquetaFranja(d: LluviaMensualClasificada | null): string {
    const tipo = completitudLluvia(d).tipo;
    return tipo === 'sin-datos' ? 'Sin datos' : tipo === 'verificar' ? 'A verificar' : 'Incompleto';
  }

  coloresLeyenda(nivel: number) {
    return coloresCategoria('lluvia', CATEGORIAS[nivel + 3]);
  }
}
