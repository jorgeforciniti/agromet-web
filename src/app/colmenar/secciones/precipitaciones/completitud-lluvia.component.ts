import { Component, ElementRef, HostListener, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LluviaMensualClasificada } from '../../colmenar.models';

export type TipoCompletitud = 'completo' | 'verificar' | 'incompleto' | 'sin-datos';

export interface CompletitudLluvia {
  tipo: TipoCompletitud;
  /** Texto compacto de la celda, p. ej. «A verificar · 21/31 días». */
  etiqueta: string;
  /** Detalle para el desplegable, p. ej. «19 días con precipitación informada · 2 pendientes de verificación». */
  detalle: string | null;
}

const dias = (n: number) => `${n} ${n === 1 ? 'día' : 'días'}`;

/**
 * Estado de completitud pluviométrica de un mes, a partir de los indicadores de clasificacion_lluvias.php.
 * Los días pendientes de verificación no se interpretan como secos ni como días con lluvia válida.
 */
export function completitudLluvia(d: LluviaMensualClasificada | null | undefined): CompletitudLluvia {
  if (!d || !d.dias_registrados) {
    return { tipo: 'sin-datos', etiqueta: 'Sin datos', detalle: null };
  }
  const registrados = `${d.dias_registrados}/${d.dias_mes} días`;
  const partes = [`${dias(d.dias_disponibles_pp)} con precipitación informada`];
  if (d.dias_pendientes_verificacion > 0) {
    partes.push(`${d.dias_pendientes_verificacion} ${d.dias_pendientes_verificacion === 1 ? 'pendiente' : 'pendientes'} de verificación`);
  }
  if (d.dias_provisionales_pp > 0) {
    partes.push(`${d.dias_provisionales_pp} con dato provisional`);
  }
  const detalle = partes.join(' · ');

  if (d.lluvia_completa) {
    // Mes completo: el detalle sólo se ofrece si hay datos provisionales que informar.
    return { tipo: 'completo', etiqueta: 'Completo', detalle: d.dias_provisionales_pp > 0 ? detalle : null };
  }
  if (d.dias_pendientes_verificacion > 0 || d.estado_verificacion === 'A verificar') {
    return { tipo: 'verificar', etiqueta: `A verificar · ${registrados}`, detalle };
  }
  return { tipo: 'incompleto', etiqueta: `Incompleto · ${registrados}`, detalle };
}

/** Etiqueta de completitud con detalle desplegable (clic, toque o teclado; en escritorio también al pasar el cursor). */
@Component({
  selector: 'app-completitud-lluvia',
  standalone: true,
  imports: [CommonModule],
  template: `
    <ng-container *ngIf="estado as e">
      <span *ngIf="!e.detalle; else conDetalle" class="tag" [ngClass]="'tag--' + e.tipo">{{ e.etiqueta }}</span>
      <ng-template #conDetalle>
        <button type="button" class="tag tag--btn" [ngClass]="'tag--' + e.tipo" (click)="abierto = !abierto"
          [attr.aria-expanded]="abierto" [attr.title]="e.detalle" [attr.aria-label]="e.etiqueta + '. ' + e.detalle">
          <span *ngIf="e.tipo === 'verificar'" class="punto" aria-hidden="true"></span>{{ e.etiqueta }}
          <span class="info" aria-hidden="true">i</span>
        </button>
        <span class="detalle" *ngIf="abierto" role="note">{{ e.detalle }}.</span>
      </ng-template>
    </ng-container>
  `,
  styles: [`
    :host { display: inline-flex; flex-direction: column; align-items: flex-start; gap: 3px; }
    .tag { display: inline-flex; align-items: center; gap: 5px; padding: 1px 8px; border-radius: 999px; font: inherit;
      font-size: .72rem; font-weight: 700; border: 1px solid var(--border); background: var(--surface-2); color: #374151; white-space: nowrap; }
    .tag--btn { cursor: pointer; }
    .tag--btn:focus-visible { outline: 3px solid color-mix(in srgb, var(--accent) 30%, white); outline-offset: 2px; }
    .tag--completo { border-color: color-mix(in srgb, var(--brand) 30%, var(--border)); background: var(--brand-50); color: var(--brand-600); }
    .tag--verificar { border-color: color-mix(in srgb, var(--warning) 60%, var(--border)); background: color-mix(in srgb, var(--warning) 12%, white); color: #92400e; }
    .tag--incompleto { border-style: dashed; color: #4b5563; }
    .tag--sin-datos { background: transparent; color: var(--muted); }
    .punto { width: 7px; height: 7px; border-radius: 50%; background: var(--warning); }
    .info { display: inline-grid; place-items: center; width: 14px; height: 14px; border-radius: 50%; border: 1px solid currentColor;
      font-size: .6rem; font-style: italic; font-family: Georgia, serif; opacity: .8; }
    .detalle { max-width: 260px; font-size: .74rem; line-height: 1.35; color: #374151; white-space: normal; }
  `]
})
export class CompletitudLluviaComponent {
  @Input() mes: LluviaMensualClasificada | null | undefined = null;
  abierto = false;

  constructor(private el: ElementRef<HTMLElement>) { }

  get estado(): CompletitudLluvia {
    return completitudLluvia(this.mes);
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
