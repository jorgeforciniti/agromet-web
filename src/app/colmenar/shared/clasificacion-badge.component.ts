import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { categoriaDe, coloresCategoria, EscalaClasificacion } from '../colmenar.utils';

/**
 * Muestra una categoría percentilar con color, símbolo y texto (nunca sólo color).
 * Si no hay clasificación, muestra el motivo (`sinDato`), p. ej. "Mes incompleto".
 */
@Component({
  selector: 'app-clasificacion-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span *ngIf="cat as c; else sin" class="badge" [class.badge--compacta]="compacta"
      [style.background]="colores?.fondo" [style.color]="colores?.texto" [attr.title]="c.nombre + ' (' + c.rango + ')'">
      <span class="badge__sim" aria-hidden="true">{{ c.simbolo }}</span>
      <span class="badge__txt">{{ compacta ? abreviar(c.nombre) : c.nombre }}</span>
    </span>
    <ng-template #sin>
      <span class="badge badge--sin" [class.badge--compacta]="compacta">{{ sinDato }}</span>
    </ng-template>
  `,
  styles: [`
    .badge { display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px; border-radius: 999px;
      font-size: .78rem; font-weight: 700; line-height: 1.25; border: 1px solid rgba(0,0,0,.08); max-width: 100%; }
    .badge--compacta, .badge--sin { white-space: nowrap; }
    .badge--compacta { padding: 2px 7px; font-size: .72rem; }
    .badge__sim { font-size: .62rem; letter-spacing: -1px; }
    .badge--sin { background: transparent; color: var(--muted); border: 1px dashed var(--border); font-weight: 600; }
  `]
})
export class ClasificacionBadgeComponent {
  @Input() clasificacion: string | null | undefined = null;
  @Input() escala: EscalaClasificacion = 'lluvia';
  @Input() compacta = false;
  @Input() sinDato = 'Sin clasificar';

  get cat() {
    return categoriaDe(this.clasificacion);
  }

  get colores() {
    const c = this.cat;
    return c ? coloresCategoria(this.escala, c) : null;
  }

  abreviar(nombre: string): string {
    return nombre
      .replace('Extremadamente', 'Extr.')
      .replace(' a lo normal', '')
      .replace('inferior', 'inf.')
      .replace('superior', 'sup.');
  }
}
