import { Component, ElementRef, HostListener, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export const GLOSARIO: Record<string, { titulo: string; texto: string }> = {
  normal: {
    titulo: 'Normal climatológica',
    texto: 'Promedio del período de referencia 1991–2020 para el mismo mes. Es el valor "esperable" con el que se compara cada año.'
  },
  anomalia: {
    titulo: 'Anomalía',
    texto: 'Diferencia entre el valor observado y la normal 1991–2020. Positiva: por encima de lo normal; negativa: por debajo.'
  },
  percentil: {
    titulo: 'Clasificación percentilar',
    texto: 'Ubica el valor dentro de la distribución 1991–2020 usando los percentiles P10, P20, P40, P60, P80 y P90. Entre P40 y P60 se considera normal.'
  },
  record: {
    titulo: 'Récord histórico',
    texto: 'Se indica cuando el valor supera el máximo registrado para el mismo mes en todos los años anteriores de la serie (desde 1910). Es independiente de la clasificación percentilar.'
  },
  completo: {
    titulo: 'Mes completo',
    texto: 'Mes con información válida para todos sus días según el control de calidad del servicio. Los meses incompletos se muestran como parciales y no se clasifican.'
  },
  extremo: {
    titulo: 'Extremo térmico',
    texto: 'Cantidad de días en que la temperatura igualó o superó el umbral indicado. No es un récord absoluto de temperatura.'
  },
  amplitud: {
    titulo: 'Amplitud térmica',
    texto: 'Diferencia entre la temperatura máxima y la mínima. La amplitud media del mes es la Tmax media menos la Tmin media; su normal es la diferencia entre las normales 1991–2020 de Tmax y Tmin.'
  },
  retorno: {
    titulo: 'Período de retorno',
    texto: 'Tiempo medio, en años, entre dos eventos que igualan o superan un valor. Una lluvia de 10 años de retorno tiene un 10 % de probabilidad de ser superada en un año cualquiera; no significa que ocurra cada 10 años exactos.'
  },
  gumbel: {
    titulo: 'Distribución de Gumbel',
    texto: 'Modelo estadístico de valores extremos (Fisher-Tippett tipo I) que se ajusta a los máximos anuales para estimar la lluvia esperable para cada período de retorno.'
  },
  confianza: {
    titulo: 'Intervalo de confianza del 80 %',
    texto: 'Rango en el que se encuentra el valor estimado con un 80 % de probabilidad; queda un 20 % de probabilidad de que el valor real esté por debajo o por encima. Se ensancha en los períodos de retorno largos.'
  },
  episodio: {
    titulo: 'Episodio cálido',
    texto: 'Período de al menos 3 días consecutivos en que Tmax y Tmin superan simultáneamente su percentil 90 diario (1991–2020). El excedente es la suma de los grados por encima de ese umbral.'
  }
};

/** Botón "?" con una ayuda breve; se abre con clic o toque (compatible con móviles). */
@Component({
  selector: 'app-ayuda-termino',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="ayuda">
      <button type="button" class="ayuda__btn" (click)="abierto = !abierto" [attr.aria-expanded]="abierto"
        [attr.aria-label]="'¿Qué es ' + (item?.titulo ?? termino) + '?'">?</button>
      <span class="ayuda__pop" *ngIf="abierto && item" role="note">
        <strong>{{ item.titulo }}.</strong> {{ item.texto }}
      </span>
    </span>
  `,
  styles: [`
    :host { display: inline-flex; vertical-align: middle; }
    .ayuda { position: relative; display: inline-flex; }
    .ayuda__btn { width: 18px; height: 18px; border-radius: 50%; border: 1px solid var(--border); background: var(--surface);
      color: var(--muted); font-size: .7rem; font-weight: 800; line-height: 1; cursor: pointer; padding: 0; position: relative; }
    /* Área táctil de 26 px (WCAG 2.5.8) sin agrandar el círculo visible de 18 px */
    .ayuda__btn::before { content: ''; position: absolute; inset: -4px; border-radius: 50%; }
    .ayuda__btn:hover, .ayuda__btn[aria-expanded="true"] { border-color: var(--accent); color: var(--accent); }
    .ayuda__btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .ayuda__pop { position: absolute; z-index: 20; top: calc(100% + 6px); left: 50%; transform: translateX(-50%);
      width: min(280px, 80vw); padding: 10px 12px; border-radius: 12px; background: #1f2937; color: #f9fafb;
      font-size: .8rem; font-weight: 400; line-height: 1.4; text-align: left; box-shadow: var(--shadow-sm); white-space: normal; }
  `]
})
export class AyudaTerminoComponent {
  @Input() termino = '';
  abierto = false;

  constructor(private el: ElementRef<HTMLElement>) { }

  get item(): { titulo: string; texto: string } | undefined {
    return GLOSARIO[this.termino];
  }

  @HostListener('document:click', ['$event'])
  cerrarFuera(ev: MouseEvent): void {
    if (this.abierto && !this.el.nativeElement.contains(ev.target as Node)) {
      this.abierto = false;
    }
  }

  @HostListener('document:keydown.escape')
  cerrar(): void {
    this.abierto = false;
  }
}
