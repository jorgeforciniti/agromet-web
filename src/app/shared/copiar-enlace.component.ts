import { Component, ElementRef, Input, OnDestroy, ViewChild, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../services/auth.service';
import { ConsultasGuardadasService } from '../services/consultas-guardadas.service';
import { Herramienta, NOMBRE_HERRAMIENTA } from './enlace-consulta';

/**
 * Botones "Copiar enlace a esta consulta" y, con sesión iniciada, "Guardar consulta"
 * (Mis consultas). Recibe una función que arma el enlace en el momento del clic, así refleja
 * lo que el formulario tiene en ese instante.
 */
@Component({
  selector: 'app-copiar-enlace',
  standalone: true,
  imports: [MatIconModule, FormsModule, AsyncPipe],
  template: `
    @if (!guardando) {
    <div class="acciones">
      <button type="button" class="accion" (click)="copiar()">
        <mat-icon aria-hidden="true">{{ copiado ? 'check' : 'link' }}</mat-icon>
        {{ copiado ? 'Enlace copiado' : 'Copiar enlace a esta consulta' }}
      </button>
      @if (usuario$ | async) {
        <button type="button" class="accion" (click)="empezarGuardado()">
          <mat-icon aria-hidden="true">{{ guardada ? 'check' : 'bookmark_add' }}</mat-icon>
          {{ guardada ? 'Guardada en Mis consultas' : 'Guardar consulta' }}
        </button>
      }
    </div>
    } @else {
      <form class="guardar" (ngSubmit)="guardar()">
        <label for="nombre-consulta-{{ uid }}">Nombre de la consulta</label>
        <input #campo id="nombre-consulta-{{ uid }}" name="nombre" [(ngModel)]="nombre" maxlength="80" required
          autocomplete="off">
        <button type="submit" class="accion accion--principal" [disabled]="enviando || !nombre.trim()">Guardar</button>
        <button type="button" class="accion" (click)="guardando = false">Cancelar</button>
        @if (error) {
          <span class="error" role="alert">{{ error }}</span>
        }
      </form>
    }

    <span class="cdk-visually-hidden" role="status" aria-live="polite">
      {{ copiado ? 'Enlace copiado al portapapeles' : guardada ? 'Consulta guardada' : '' }}
    </span>
  `,
  styles: [`
    :host {
      display: block;
      margin: 6px 0 0;
    }

    .acciones {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 4px;
    }

    .accion {
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

    .accion:hover {
      background: color-mix(in srgb, var(--brand) 8%, white);
    }

    .accion:disabled {
      opacity: .5;
      cursor: default;
    }

    .accion--principal {
      border: 1px solid color-mix(in srgb, var(--brand) 40%, var(--border));
    }

    .accion mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .guardar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: flex-end;
      gap: 6px 8px;
    }

    .guardar label {
      font-size: .8rem;
      font-weight: 700;
      color: var(--muted);
    }

    .guardar input {
      flex: 1 1 220px;
      max-width: 420px;
      min-height: 34px;
      padding: 0 10px;
      border: 1px solid var(--border);
      border-radius: 10px;
      font: inherit;
      font-size: .9rem;
    }

    .error {
      flex-basis: 100%;
      text-align: right;
      color: #9a3412;
      font-size: .8rem;
      font-weight: 700;
    }
  `]
})
export class CopiarEnlaceComponent implements OnDestroy {
  @Input({ required: true }) enlace!: () => string;
  @ViewChild('campo') campo?: ElementRef<HTMLInputElement>;

  readonly usuario$ = inject(AuthService).getUserObservable();
  private readonly consultas = inject(ConsultasGuardadasService);
  private static siguiente = 0;
  readonly uid = ++CopiarEnlaceComponent.siguiente;

  copiado = false;
  guardada = false;
  guardando = false;
  enviando = false;
  nombre = '';
  error = '';
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
    this.avisar('copiado');
  }

  /** Propone un nombre con la herramienta y el período (se puede cambiar). */
  empezarGuardado(): void {
    const params = new URL(this.enlace()).searchParams;
    const herramienta = NOMBRE_HERRAMIENTA[params.get('herramienta') as Herramienta] ?? 'Consulta';
    const fecha = (v: string | null) => v ? v.split('-').reverse().join('/') : '';
    const desde = fecha(params.get('desde'));
    const hasta = fecha(params.get('hasta'));
    this.nombre = desde && hasta ? `${herramienta} ${desde} a ${hasta}` : herramienta;
    this.error = '';
    this.guardando = true;
    setTimeout(() => this.campo?.nativeElement.select());
  }

  async guardar(): Promise<void> {
    if (!this.nombre.trim()) return;
    this.enviando = true;
    this.error = '';
    try {
      await this.consultas.guardarEnlace(this.nombre.trim(), this.enlace());
      this.guardando = false;
      this.avisar('guardada');
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'No se pudo guardar la consulta.';
    } finally {
      this.enviando = false;
    }
  }

  private avisar(cual: 'copiado' | 'guardada'): void {
    this[cual] = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.copiado = false; this.guardada = false; }, 2500);
  }
}
