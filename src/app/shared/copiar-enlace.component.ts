import { Component, Input, OnDestroy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/**
 * Botón "Copiar enlace a esta consulta". Recibe una función que arma el enlace en el momento
 * del clic (así refleja lo que el formulario tiene en ese instante).
 */
@Component({
  selector: 'app-copiar-enlace',
  standalone: true,
  imports: [MatIconModule],
  template: `
    <button type="button" class="copiar-enlace" (click)="copiar()">
      <mat-icon aria-hidden="true">{{ copiado ? 'check' : 'link' }}</mat-icon>
      {{ copiado ? 'Enlace copiado' : 'Copiar enlace a esta consulta' }}
    </button>
    <span class="cdk-visually-hidden" role="status" aria-live="polite">{{ copiado ? 'Enlace copiado al portapapeles' : '' }}</span>
  `,
  styles: [`
    :host {
      display: flex;
      justify-content: flex-end;
      margin: 6px 0 0;
    }

    .copiar-enlace {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 32px;
      padding: 0 10px;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: var(--brand);
      font: inherit;
      font-size: .82rem;
      font-weight: 700;
      cursor: pointer;
    }

    .copiar-enlace:hover {
      background: color-mix(in srgb, var(--brand) 8%, white);
    }

    .copiar-enlace mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
  `]
})
export class CopiarEnlaceComponent implements OnDestroy {
  @Input({ required: true }) enlace!: () => string;

  copiado = false;
  private timer?: ReturnType<typeof setTimeout>;

  ngOnDestroy(): void {
    clearTimeout(this.timer);
  }

  async copiar(): Promise<void> {
    const url = this.enlace();
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Sin acceso al portapapeles (http, permisos): copia por selección de texto
      const area = document.createElement('textarea');
      area.value = url;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    this.copiado = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.copiado = false, 2500);
  }
}
