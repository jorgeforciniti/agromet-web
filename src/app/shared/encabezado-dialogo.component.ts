import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Encabezado común de los diálogos de "Datos y estadísticas": título, bajada opcional, un aviso
 * corto si hace falta (por ejemplo «Estimación teórica») y el botón de cerrar. Lo que va dentro
 * (en general el «¿Cómo se lee?») se proyecta debajo de la bajada:
 *   <app-encabezado-dialogo titulo="Horas de frío" bajada="Horas por día con…" (cerrar)="close()">
 *     <app-como-se-lee>…</app-como-se-lee>
 *   </app-encabezado-dialogo>
 */
@Component({
  selector: 'app-encabezado-dialogo',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <div class="encabezado__texto">
      <h2 class="encabezado__titulo">
        {{ titulo }}
        @if (aviso) {
          <span class="encabezado__aviso">{{ aviso }}</span>
        }
      </h2>
      @if (bajada) {
        <p class="encabezado__bajada">{{ bajada }}</p>
      }
      <ng-content></ng-content>
    </div>
    <button type="button" class="encabezado__cerrar" (click)="cerrar.emit()" aria-label="Cerrar diálogo">
      <mat-icon>close</mat-icon>
    </button>
  `,
  styles: [`
    :host {
      display: flex;
      align-items: flex-start;
      gap: 16px;
    }
    .encabezado__texto {
      flex: 1;
      min-width: 0;
    }
    .encabezado__titulo {
      margin: 0;
      font-family: var(--font-display);
      font-size: clamp(1.35rem, 1.1rem + .9vw, 1.7rem);
      font-weight: 600;
      line-height: 1.1;
      color: var(--text);
    }
    .encabezado__aviso {
      display: inline-block;
      margin-left: 8px;
      padding: 2px 9px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--warning) 16%, white);
      color: #8a5a00;
      font-family: var(--font-sans);
      font-size: .78rem;
      font-weight: 600;
      line-height: 1.4;
      vertical-align: .3em;
    }
    .encabezado__bajada {
      max-width: 72ch;
      margin: 6px 0 0;
      color: var(--muted);
      font-size: .95rem;
      line-height: 1.45;
    }
    .encabezado__cerrar {
      flex: none;
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      margin-top: -4px;
      border: 1px solid var(--border);
      border-radius: 50%;
      background: var(--surface);
      color: var(--muted);
      cursor: pointer;
    }
    .encabezado__cerrar:hover {
      background: var(--surface-2);
      color: var(--text);
    }
  `]
})
export class EncabezadoDialogoComponent {
  @Input({ required: true }) titulo = '';
  @Input() bajada = '';
  @Input() aviso = '';
  @Output() cerrar = new EventEmitter<void>();
}
