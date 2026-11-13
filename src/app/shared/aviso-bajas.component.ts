import { Component, Input, OnChanges, OnDestroy, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { SensoresBajaService } from '../services/sensores-baja.service';
import { SensorBaja, VariableSensor, textoBaja } from './depuracion';

/** Consulta de una herramienta: estación y período (AAAA-MM-DD) */
export interface ConsultaBajas {
  estacion: string;
  desde: string;
  hasta: string;
  /** Nombre de la estación, para anteponerlo cuando la herramienta compara dos */
  nombre?: string;
}

/**
 * Aviso de los sensores dados de baja en la consulta (depuración de datos): sus valores no se
 * muestran ni se usan, y sin el aviso un hueco o un total más bajo podría leerse como dato. Se pone
 * junto a los resultados de cada herramienta por estación:
 *   <app-aviso-bajas [consulta]="consultaBajas" [variables]="['temperatura']"></app-aviso-bajas>
 * variables: sólo las que usa la herramienta (sin indicarlas, todas salvo la radiación de las
 * estaciones que no tienen ese sensor).
 */
@Component({
  selector: 'app-aviso-bajas',
  standalone: true,
  template: `
    @if (textos.length) {
      <p class="aviso-bajas" role="note">
        <span class="aviso-bajas__titulo">Datos que no se usan en este período</span>
        @for (t of textos; track t) {
          <span class="aviso-bajas__item">{{ t }}</span>
        }
      </p>
    }
  `,
  styles: [`
    .aviso-bajas {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin: 0;
      padding: 8px 12px;
      border: 1px solid color-mix(in srgb, var(--warning, #f59f00) 35%, white);
      border-radius: 10px;
      background: color-mix(in srgb, var(--warning, #f59f00) 10%, white);
      color: #7a5200;
      font-size: .85rem;
      line-height: 1.4;
    }

    .aviso-bajas__titulo {
      font-weight: 700;
    }
  `]
})
export class AvisoBajasComponent implements OnChanges, OnDestroy {
  private readonly sensoresBaja = inject(SensoresBajaService);

  /** Una consulta o varias (las comparaciones consultan dos estaciones o dos períodos) */
  @Input() consulta: ConsultaBajas | ConsultaBajas[] | null = null;
  @Input() variables: VariableSensor[] | null = null;

  textos: string[] = [];
  private pedido?: Subscription;

  ngOnChanges(): void {
    this.pedido?.unsubscribe();
    const consultas = (Array.isArray(this.consulta) ? this.consulta : [this.consulta])
      .filter((c): c is ConsultaBajas => !!c?.estacion && !!c.desde && !!c.hasta);
    if (!consultas.length) {
      this.textos = [];
      return;
    }
    this.pedido = this.sensoresBaja.depurador().subscribe(d => {
      const usar = (b: SensorBaja): boolean => this.variables
        ? this.variables.includes(b.variable)
        : !(b.variable === 'radiacion' && b.desde <= '1900-01-01');
      const textos = consultas.flatMap(c => d.bajasEnPeriodo(String(c.estacion), c.desde, c.hasta).filter(usar).map(b => {
        const periodo = b.desde <= '1900-01-01' ? '' : ` Desde el ${fecha(b.desde)}${b.hasta ? ` hasta el ${fecha(b.hasta)}` : ''}.`;
        return `${c.nombre ? `${c.nombre}. ` : ''}${textoBaja(b)}.${periodo}`;
      }));
      this.textos = [...new Set(textos)];
    });
  }

  ngOnDestroy(): void {
    this.pedido?.unsubscribe();
  }
}

function fecha(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
