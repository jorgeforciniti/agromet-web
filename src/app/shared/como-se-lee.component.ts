import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * «¿Cómo se lee?» plegable bajo la descripción de un diálogo (G1 del informe de mejoras): qué
 * mide la herramienta, cómo se calcula y sus limitaciones, sin ocupar lugar cuando no hace falta.
 * El contenido va proyectado (párrafos o una lista):
 *   <app-como-se-lee><p>Un registro equivale a 0,25 horas…</p></app-como-se-lee>
 */
@Component({
  selector: 'app-como-se-lee',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <details class="como-se-lee">
      <summary><mat-icon aria-hidden="true">help_outline</mat-icon>¿Cómo se lee?</summary>
      <div class="como-se-lee__cuerpo"><ng-content></ng-content></div>
    </details>
  `,
  styles: [`
    :host { display: block; margin-top: 4px; }
    summary {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      cursor: pointer;
      list-style: none;
      color: var(--brand, #4a7a2c);
      font-size: .84rem;
      font-weight: 800;
      user-select: none;
    }
    summary::-webkit-details-marker { display: none; }
    summary::after { content: '▾'; font-size: .8em; transition: transform .2s ease; }
    details[open] summary::after { transform: rotate(180deg); }
    summary:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; border-radius: 4px; }
    mat-icon { width: 18px; height: 18px; font-size: 18px; }
    .como-se-lee__cuerpo {
      margin-top: 6px;
      padding: 8px 12px;
      border-left: 3px solid color-mix(in srgb, var(--brand, #4a7a2c) 40%, transparent);
      border-radius: 4px;
      background: color-mix(in srgb, var(--brand, #4a7a2c) 5%, white);
      color: var(--text, #1f2937);
      font-size: .88rem;
      line-height: 1.45;
    }
    .como-se-lee__cuerpo ::ng-deep p { margin: 0 0 4px; }
    .como-se-lee__cuerpo ::ng-deep p:last-child { margin-bottom: 0; }
    .como-se-lee__cuerpo ::ng-deep code { font-size: .92em; }
  `]
})
export class ComoSeLeeComponent { }
