import { Component, ElementRef, HostListener, inject } from '@angular/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { MatIconModule } from '@angular/material/icon';
import { REDES_SOCIALES } from '../../shared/redes-sociales';

/**
 * Barra fija con las redes de la EEAOC, pegada al borde izquierdo y centrada en el alto
 * de la ventana (como en el sitio institucional). En el celular queda plegada en una
 * pestaña chica que se abre al tocarla, para no tapar el contenido.
 */
@Component({
  selector: 'app-redes-laterales',
  standalone: true,
  imports: [FontAwesomeModule, MatIconModule],
  template: `
    <nav class="redes" [class.abierta]="abierta" aria-label="Redes sociales de la EEAOC">
      <button type="button" class="pestania" (click)="abierta = !abierta"
        [attr.aria-expanded]="abierta" aria-controls="redes-lista"
        [attr.aria-label]="abierta ? 'Cerrar redes sociales' : 'Ver redes sociales'">
        <mat-icon aria-hidden="true">{{ abierta ? 'close' : 'share' }}</mat-icon>
      </button>
      <div class="lista" id="redes-lista">
        @for (red of redes; track red.nombre) {
          <a class="red" [href]="red.url" target="_blank" rel="noopener noreferrer"
            [attr.aria-label]="red.nombre" [title]="red.nombre" (click)="abierta = false">
            <fa-icon [icon]="['fab', red.icono]"></fa-icon>
          </a>
        }
      </div>
    </nav>
  `,
  styles: [`
    .redes {
      position: fixed;
      left: 0;
      top: 50%;
      transform: translateY(-50%);
      z-index: 900;
      padding: 10px 6px;
      background: var(--surface);
      border-radius: 0 16px 16px 0;
      box-shadow: 0 6px 24px rgba(0, 0, 0, .12);
    }

    .lista {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .pestania { display: none; }

    .red {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: 10px;
      color: var(--text);
      font-size: 19px;
      text-decoration: none;
      transition: color .15s ease, background-color .15s ease;
    }

    .red:hover {
      color: var(--brand);
      background: var(--brand-50);
    }

    .red:focus-visible,
    .pestania:focus-visible {
      outline: 3px solid color-mix(in srgb, var(--brand) 55%, white);
      outline-offset: 1px;
    }

    /* Tableta: un poco más chica */
    @media (max-width: 1100px) {
      .redes { padding: 8px 4px; }
      .red { width: 34px; height: 34px; font-size: 16px; }
    }

    /* Celular: plegada en una pestaña; al tocarla se despliegan las redes */
    @media (max-width: 768px) {
      .redes {
        top: auto;
        bottom: 96px;
        transform: none;
        padding: 0;
        border-radius: 0 14px 14px 0;
      }

      .pestania {
        display: grid;
        place-items: center;
        width: 36px;
        height: 44px;
        padding: 0;
        border: 0;
        border-radius: 0 14px 14px 0;
        background: var(--brand);
        color: #fff;
        cursor: pointer;
      }

      .pestania mat-icon {
        width: 20px;
        height: 20px;
        font-size: 20px;
      }

      .lista { display: none; }

      .abierta { padding: 6px 4px; }

      .abierta .pestania {
        width: 34px;
        height: 34px;
        margin-bottom: 4px;
        border-radius: 10px;
      }

      .abierta .lista { display: flex; }
    }
  `]
})
export class RedesLateralesComponent {
  readonly redes = REDES_SOCIALES;
  abierta = false;

  private readonly elemento = inject(ElementRef<HTMLElement>);

  /** Se pliega al tocar fuera de la barra o con Escape. */
  @HostListener('document:click', ['$event'])
  alTocarFuera(evento: MouseEvent): void {
    if (this.abierta && !this.elemento.nativeElement.contains(evento.target as Node)) this.abierta = false;
  }

  @HostListener('document:keydown.escape')
  alEscape(): void {
    this.abierta = false;
  }
}
