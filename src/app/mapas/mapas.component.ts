import { Component, DestroyRef, OnInit, Type, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { ScrollRevealDirective } from '../directives/scroll-reveal.directive';

/** Valor de ?ver= en /mapas: cada mapa tiene su enlace (/mapas?ver=heladas). */
type MapaId = 'lluvias-diarias' | 'lluvias-mensuales' | 'temperaturas' | 'heladas';

interface Mapa {
  id: MapaId;
  titulo: string;
  descripcion: string;
  imagen: string;
  cargar: () => Promise<Type<unknown>>;
  data?: unknown;
}

const MAPAS: Mapa[] = [
  {
    id: 'lluvias-diarias',
    titulo: 'Lluvias diarias',
    descripcion: 'Lluvia caída en cada estación, en un día o en el período que elijas.',
    imagen: 'assets/images/mapas/lluviasdiarias.png',
    cargar: () => import('../map-rain/map-rain.component').then(m => m.MapRainComponent),
    data: { hoy: false }
  },
  {
    id: 'lluvias-mensuales',
    titulo: 'Lluvias mensuales',
    descripcion: 'Acumulado de cada mes de la campaña, para comparar zonas.',
    imagen: 'assets/images/mapas/lluviasmensuales.png',
    cargar: () => import('../map-rain-monthly/map-rain-monthly.component').then(m => m.MapRainMonthlyComponent)
  },
  {
    id: 'temperaturas',
    titulo: 'Temperaturas',
    descripcion: 'Máximas, mínimas y medias de cada estación en el período que elijas.',
    imagen: 'assets/images/mapas/temperaturas.png',
    cargar: () => import('../map-temperature/map-temperature.component').then(m => m.MapTemperatureComponent)
  },
  {
    id: 'heladas',
    titulo: 'Heladas',
    descripcion: 'Mínima absoluta, horas bajo 0 °C, días con helada y fechas de primera y última helada.',
    imagen: 'assets/images/mapas/heladas.png',
    cargar: () => import('../map-frost/map-frost.component').then(m => m.MapFrostComponent),
    data: { hoy: false }
  }
];

/** De mayo a septiembre las heladas van primero; el resto del año, las lluvias. */
function mapasDeLaEpoca(fecha = new Date()): Mapa[] {
  const mes = fecha.getMonth() + 1;
  if (mes >= 5 && mes <= 9) {
    return [...MAPAS.filter(m => m.id === 'heladas'), ...MAPAS.filter(m => m.id !== 'heladas')];
  }
  return MAPAS;
}

@Component({
  selector: 'app-mapas',
  imports: [
    MatCardModule,
    MatDialogModule,
    MatIconModule,
    ScrollRevealDirective
  ],
  templateUrl: './mapas.component.html',
  styleUrl: './mapas.component.css',
})
export class MapasComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  readonly mapas = mapasDeLaEpoca();

  private abierto: { id: MapaId; ref: MatDialogRef<unknown> } | null = null;
  // true si el mapa se abrió desde esta página (agregó ?ver= al historial): al cerrarlo
  // se vuelve atrás en vez de dejar una entrada repetida.
  private agregadoAlHistorial = false;

  constructor(private dialog: MatDialog) { }

  ngOnInit(): void {
    // La URL manda: ?ver=... abre el mapa; sin ?ver= (por ejemplo con el botón Atrás) se cierra.
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const mapa = MAPAS.find(m => m.id === params.get('ver'));
        if (mapa && this.abierto?.id !== mapa.id) {
          this.abierto?.ref.close();
          void this.mostrar(mapa);
        } else if (!mapa && this.abierto) {
          this.agregadoAlHistorial = false;
          this.abierto.ref.close();
        }
      });
  }

  abrir(mapa: Mapa): void {
    this.agregadoAlHistorial = true;
    this.router.navigate([], { relativeTo: this.route, queryParams: { ver: mapa.id } });
  }

  private async mostrar(mapa: Mapa): Promise<void> {
    const componente = await mapa.cargar();
    const ref = this.dialog.open(componente, {
      width: 'min(1300px, 95vw)',
      maxWidth: '95vw',
      height: '92vh',
      maxHeight: '92vh',
      panelClass: 'do-dialog',
      autoFocus: false,
      restoreFocus: false,
      // La URL ya cierra el diálogo al ir atrás.
      closeOnNavigation: false,
      data: mapa.data
    });
    this.abierto = { id: mapa.id, ref };

    ref.afterClosed().subscribe(() => {
      if (this.abierto?.ref !== ref) return;
      this.abierto = null;
      if (this.route.snapshot.queryParamMap.get('ver') !== mapa.id) return;
      if (this.agregadoAlHistorial) {
        this.agregadoAlHistorial = false;
        this.location.back();
      } else {
        // Llegó por un enlace compartido: se limpia la URL sin salir del sitio.
        this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
      }
    });
  }
}
