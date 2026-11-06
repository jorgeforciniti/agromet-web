import { Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** Más días faltantes que esto (en %) y el aviso pasa a advertencia */
const UMBRAL_ADVERTENCIA = 20;

/**
 * Aviso de calidad del dato (G3 del informe de mejoras): cuántos días del período no se pudieron
 * calcular por falta de registros, para que un acumulado con huecos no parezca igual de
 * confiable que uno completo. No se muestra si no falta ninguno.
 *   <app-aviso-calidad [validos]="validDays" [total]="rows.length"></app-aviso-calidad>
 */
@Component({
  selector: 'app-aviso-calidad',
  standalone: true,
  imports: [MatIconModule],
  template: `
    @if (faltan > 0) {
      <p class="aviso-calidad" [class.aviso-calidad--alto]="porcentaje > umbral" role="status">
        <mat-icon aria-hidden="true">{{ porcentaje > umbral ? 'warning_amber' : 'info' }}</mat-icon>
        <span>
          <strong>Sin cálculo en {{ faltan }} de {{ total }} {{ total === 1 ? 'día' : 'días' }} ({{ porcentaje }} %)</strong>
          por falta de registros. Esos días no suman: el acumulado puede ser menor que el real.
        </span>
      </p>
    }
  `,
  styles: [`
    .aviso-calidad {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      padding: 8px 12px;
      border: 1px solid #fde68a;
      border-radius: 12px;
      background: #fffbeb;
      color: #78350f;
      font-size: .88rem;
      line-height: 1.38;
    }
    .aviso-calidad--alto { border-color: #fdba74; background: #fff7ed; color: #9a3412; }
    mat-icon { flex: 0 0 auto; width: 20px; height: 20px; font-size: 20px; }
  `]
})
export class AvisoCalidadComponent {
  @Input() validos = 0;
  @Input() total = 0;
  readonly umbral = UMBRAL_ADVERTENCIA;

  get faltan(): number {
    return Math.max(0, this.total - this.validos);
  }

  get porcentaje(): number {
    return this.total ? Math.round((this.faltan / this.total) * 100) : 0;
  }
}
