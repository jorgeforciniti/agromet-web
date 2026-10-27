import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import {
  AnomaliasResponse,
  ClasificacionLluviasResponse,
  EstadoCarga,
  ExtremosTermicosResponse,
  IndicadorExtremo,
  MensualesResponse,
  NormalesResponse,
  Recurso
} from '../../colmenar.models';
import { fmt, fmtSigno, INDICADORES, listaMeses, media, MESES, normalDeMes, suma } from '../../colmenar.utils';
import { ClasificacionBadgeComponent } from '../../shared/clasificacion-badge.component';
import { AyudaTerminoComponent } from '../../shared/ayuda-termino.component';
import { EstadoCargaComponent } from '../../shared/estado-carga.component';

interface ResumenLluvia {
  total: number;
  normal: number | null;
  meses: number[];
  anual: boolean;
  parciales: { mes: number; mm: number | null; dias: number; diasMes: number }[];
}

interface ResumenTemp {
  media: number;
  anomalia: number | null;
  meses: number[];
  anual: boolean;
}

interface Absoluta {
  valor: number;
  meses: number[];
}

interface ResumenExtremo {
  clave: IndicadorExtremo;
  etiqueta: string;
  observado: number | null;
  completo: boolean;
  clasificacion: string | null;
  mesesCompletos: number;
  anomaliaCompletos: number | null;
}

@Component({
  selector: 'app-colmenar-resumen',
  standalone: true,
  imports: [CommonModule, MatIconModule, ClasificacionBadgeComponent, AyudaTerminoComponent, EstadoCargaComponent],
  templateUrl: './resumen.component.html',
  styleUrls: ['../../shared/seccion.css', './resumen.component.css']
})
export class ResumenComponent implements OnChanges {
  @Input({ required: true }) anio!: number;
  @Input({ required: true }) mensuales!: Recurso<MensualesResponse>;
  @Input({ required: true }) anomalias!: Recurso<AnomaliasResponse>;
  @Input({ required: true }) lluvias!: Recurso<ClasificacionLluviasResponse>;
  @Input({ required: true }) extremos!: Recurso<ExtremosTermicosResponse>;
  @Input({ required: true }) normales!: Recurso<NormalesResponse>;
  @Output() reintentar = new EventEmitter<void>();

  readonly fmt = fmt;
  readonly fmtSigno = fmtSigno;
  readonly listaMeses = listaMeses;
  readonly MESES = MESES;

  lluvia: ResumenLluvia | null = null;
  tmax: ResumenTemp | null = null;
  tmin: ResumenTemp | null = null;
  absMax: Absoluta | null = null;
  absMin: Absoluta | null = null;
  extremosRes: ResumenExtremo[] = [];
  mesesCompletosMax = 0;
  mesesCompletosMin = 0;

  get estadoGeneral(): EstadoCarga {
    const r = [this.mensuales, this.anomalias, this.lluvias, this.extremos];
    if (r.some((x) => x.estado === 'cargando')) {
      return 'cargando';
    }
    if (r.every((x) => x.estado === 'error')) {
      return 'error';
    }
    if (r.every((x) => x.estado !== 'ok')) {
      return 'vacio';
    }
    return 'ok';
  }

  get errores(): string[] {
    const fuentes: [Recurso<unknown>, string][] = [
      [this.mensuales, 'estadísticas mensuales'],
      [this.anomalias, 'anomalías'],
      [this.lluvias, 'clasificación de lluvias'],
      [this.extremos, 'extremos térmicos']
    ];
    return fuentes.filter(([r]) => r.estado === 'error').map(([, n]) => n);
  }

  ngOnChanges(): void {
    this.calcularLluvia();
    this.calcularTemperaturas();
    this.calcularExtremos();
  }

  private calcularLluvia(): void {
    const datos = this.lluvias.datos?.datos;
    if (!datos?.length) {
      this.lluvia = null;
      return;
    }
    const completos = datos.filter((d) => d.lluvia_completa && d.lluvia_mm !== null);
    const normales = this.normales.datos?.datos;
    const normalesMeses = completos.map((d) => normalDeMes(normales, d.mes)?.pp_normal ?? null);
    this.lluvia = {
      total: suma(completos.map((d) => d.lluvia_mm as number)),
      normal: normalesMeses.every((n) => n !== null) && completos.length ? suma(normalesMeses as number[]) : null,
      meses: completos.map((d) => d.mes),
      anual: completos.length === 12,
      parciales: datos
        .filter((d) => !d.lluvia_completa && d.dias_validos_pp > 0)
        .map((d) => ({ mes: d.mes, mm: d.lluvia_parcial_mm, dias: d.dias_validos_pp, diasMes: d.dias_mes }))
    };
  }

  private calcularTemperaturas(): void {
    const anom = this.anomalias.datos?.datos ?? [];
    const temp = (val: 'tmax_media_valida' | 'tmin_media_valida', an: 'anomalia_tmax' | 'anomalia_tmin'): ResumenTemp | null => {
      const validos = anom.filter((d) => d[val] !== null);
      if (!validos.length) {
        return null;
      }
      const anomalias = validos.map((d) => d[an]).filter((v): v is number => v !== null);
      return {
        media: media(validos.map((d) => d[val] as number)) as number,
        anomalia: anomalias.length === validos.length ? media(anomalias) : null,
        meses: validos.map((d) => d.mes),
        anual: validos.length === 12
      };
    };
    this.tmax = temp('tmax_media_valida', 'anomalia_tmax');
    this.tmin = temp('tmin_media_valida', 'anomalia_tmin');

    const mens = this.mensuales.datos?.datos ?? [];
    const absoluta = (campo: 'tmax_absoluta' | 'tmin_absoluta', mayor: boolean): Absoluta | null => {
      const v = mens.filter((m) => m[campo] !== null);
      if (!v.length) {
        return null;
      }
      const valores = v.map((m) => m[campo] as number);
      const valor = mayor ? Math.max(...valores) : Math.min(...valores);
      return { valor, meses: v.filter((m) => m[campo] === valor).map((m) => m.mes) };
    };
    this.absMax = absoluta('tmax_absoluta', true);
    this.absMin = absoluta('tmin_absoluta', false);
  }

  private calcularExtremos(): void {
    const e = this.extremos.datos;
    if (!e) {
      this.extremosRes = [];
      this.mesesCompletosMax = this.mesesCompletosMin = 0;
      return;
    }
    const comp = e.comparacion_meses_completos;
    this.mesesCompletosMax = comp?.meses_completos_max ?? 0;
    this.mesesCompletosMin = comp?.meses_completos_min ?? 0;
    this.extremosRes = INDICADORES.map((ind) => {
      const cl = e.clasificacion_anual?.[ind.clave];
      const completo = cl?.anio_completo_variable ?? (ind.variable === 'max' ? e.resumen_anual.completa_max : e.resumen_anual.completa_min);
      return {
        clave: ind.clave,
        etiqueta: ind.etiqueta,
        observado: e.resumen_anual[ind.clave],
        completo,
        // La clasificación anual sólo se muestra si la API indica año completo para esa variable.
        clasificacion: completo ? cl?.clasificacion ?? null : null,
        mesesCompletos: ind.variable === 'max' ? this.mesesCompletosMax : this.mesesCompletosMin,
        anomaliaCompletos: comp?.anomalia?.[ind.clave] ?? null
      };
    });
  }

  mesesTexto(meses: number[]): string {
    return meses.map((m) => MESES[m - 1].toLowerCase()).join(', ');
  }

  get diasRegistrados(): string | null {
    const r = this.extremos.datos?.resumen_anual;
    return r ? `${r.dias_registrados} de ${r.dias_anio}` : null;
  }
}
