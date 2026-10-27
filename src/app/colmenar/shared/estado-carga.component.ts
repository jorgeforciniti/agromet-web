import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { EstadoCarga } from '../colmenar.models';

/** Presenta los estados de carga, error y ausencia de datos de un bloque. */
@Component({
  selector: 'app-estado-carga',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div *ngIf="estado === 'cargando'" class="estado" aria-busy="true" aria-live="polite">
      <span class="skeleton sk-linea"></span>
      <span class="skeleton sk-bloque" [style.height.px]="alto"></span>
      <span class="sr-only">Cargando datos…</span>
    </div>
    <div *ngIf="estado === 'error'" class="estado estado--error" role="alert">
      <mat-icon aria-hidden="true">cloud_off</mat-icon>
      <div>
        <strong>No se pudieron obtener los datos{{ fuente ? ' de ' + fuente : '' }}.</strong>
        <p>{{ mensaje || 'Intentá nuevamente en unos minutos.' }}</p>
      </div>
      <button type="button" class="estado__btn" (click)="reintentar.emit()" *ngIf="reintentar.observed">Reintentar</button>
    </div>
    <div *ngIf="estado === 'vacio'" class="estado estado--vacio">
      <mat-icon aria-hidden="true">info</mat-icon>
      <p>{{ mensajeVacio }}</p>
    </div>
  `,
  styles: [`
    .estado { display: flex; flex-direction: column; gap: 10px; }
    .sk-linea { display: block; height: 16px; width: 40%; }
    .sk-bloque { display: block; width: 100%; }
    .estado--error, .estado--vacio { flex-direction: row; align-items: flex-start; gap: 10px; padding: 12px 14px;
      border-radius: 14px; border: 1px solid var(--border); background: var(--surface-2); color: var(--text); font-size: .9rem; }
    .estado--error { border-color: color-mix(in srgb, var(--danger) 30%, var(--border)); background: color-mix(in srgb, var(--danger) 5%, white); }
    .estado--error mat-icon { color: var(--danger); flex: 0 0 auto; }
    .estado--vacio mat-icon { color: var(--muted); flex: 0 0 auto; }
    .estado p { margin: 2px 0 0; color: var(--muted); }
    .estado--error > div { flex: 1; }
    .estado__btn { align-self: center; border: 1px solid var(--border); background: var(--surface); border-radius: 999px;
      padding: 6px 14px; font-weight: 700; cursor: pointer; color: var(--text); }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  `]
})
export class EstadoCargaComponent {
  @Input() estado: EstadoCarga = 'cargando';
  @Input() mensaje?: string;
  @Input() fuente?: string;
  @Input() mensajeVacio = 'No hay datos disponibles para el período seleccionado.';
  @Input() alto = 220;
  @Output() reintentar = new EventEmitter<void>();
}
