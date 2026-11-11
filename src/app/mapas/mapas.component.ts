import { Component, DestroyRef, OnInit, Type, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

/** Valor de ?ver= en /mapas: cada mapa tiene su enlace (/mapas?ver=heladas). */
type MapaId = 'lluvias-diarias' | 'lluvias-mensuales' | 'lluvia-acumulada' | 'temperaturas' | 'heladas' | 'vegetacion';

type Variable = 'lluvia' | 'temperatura';

interface Mapa {
  id: MapaId;
  variable: Variable;
  titulo: string;
  /** Qué período abarca el mapa */
  periodo: string;
  descripcion: string;
  imagen: string;
  cargar: () => Promise<Type<unknown>>;
  data?: unknown;
}

const MAPAS: Mapa[] = [
  {
    id: 'lluvias-diarias',
    variable: 'lluvia',
    titulo: 'Lluvias diarias',
    periodo: 'Un día o un período',
    descripcion: 'Lluvia caída en cada estación, en un día o en el período que elijas.',
    imagen: 'assets/images/mapas/lluviasdiarias.jpg',
    cargar: () => import('../map-rain/map-rain.component').then(m => m.MapRainComponent),
    data: { hoy: false }
  },
  {
    id: 'lluvias-mensuales',
    variable: 'lluvia',
    titulo: 'Lluvias mensuales',
    periodo: 'Mes a mes, en la campaña',
    descripcion: 'Acumulado de cada mes de la campaña, para comparar zonas.',
    imagen: 'assets/images/mapas/lluviasmensuales.webp',
    cargar: () => import('../map-rain-monthly/map-rain-monthly.component').then(m => m.MapRainMonthlyComponent)
  },
  {
    id: 'lluvia-acumulada',
    variable: 'lluvia',
    titulo: 'Lluvia acumulada',
    periodo: 'Últimos 30, 60 y 90 días',
    descripcion: 'Lluvia de los últimos 30, 60 y 90 días en cada estación, comparada con la normal.',
    imagen: 'assets/images/mapas/lluviaacumulada.webp',
    cargar: () => import('../mapa-lluvia-acumulada/mapa-lluvia-acumulada.component').then(m => m.MapaLluviaAcumuladaComponent)
  },
  {
    id: 'temperaturas',
    variable: 'temperatura',
    titulo: 'Temperaturas',
    periodo: 'Un período',
    descripcion: 'Máximas, mínimas y medias de cada estación en el período que elijas.',
    imagen: 'assets/images/mapas/temperaturas.webp',
    cargar: () => import('../map-temperature/map-temperature.component').then(m => m.MapTemperatureComponent)
  },
  {
    id: 'heladas',
    variable: 'temperatura',
    titulo: 'Heladas',
    periodo: 'Un período o la temporada',
    descripcion: 'Mínima absoluta, horas bajo 0 °C, días con helada y fechas de primera y última helada.',
    imagen: 'assets/images/mapas/heladas.webp',
    cargar: () => import('../map-frost/map-frost.component').then(m => m.MapFrostComponent),
    data: { hoy: false }
  }
  /*
   * Retirado por ahora (B6 del informe de mejoras): no se reactiva sin pedido explícito.
   * Antes de publicarlo falta mostrar la fecha real de la imagen, agregar «¿Cómo se lee?», que
   * lo revise SRySIG y prever el reemplazo de MODIS Terra; además, NASA GIBS responde 404 al azar.
  {
    id: 'vegetacion',
    titulo: 'Vegetación y humedad del suelo',
    descripcion: 'Índice verde (NDVI) y humedad del suelo estimados por satélite (NASA).',
    imagen: 'assets/images/mapas/ndvi.webp',
    cargar: () => import('../map-ndvi/map-ndvi.component').then(m => m.MapNdviComponent)
  }
  */
];

interface GrupoMapas {
  titulo: string;
  icono: string;
  mapas: Mapa[];
}

/**
 * Mapas agrupados por variable. De mayo a septiembre va primero Temperatura, con Heladas
 * arriba; el resto del año, Lluvia.
 */
function gruposDeLaEpoca(fecha = new Date()): GrupoMapas[] {
  const mes = fecha.getMonth() + 1;
  const invierno = mes >= 5 && mes <= 9;
  const lluvia: GrupoMapas = { titulo: 'Lluvia', icono: 'water_drop', mapas: MAPAS.filter(m => m.variable === 'lluvia') };
  const temperaturas = MAPAS.filter(m => m.variable === 'temperatura');
  const temperatura: GrupoMapas = {
    titulo: 'Temperatura',
    icono: 'device_thermostat',
    mapas: invierno ? [...temperaturas.filter(m => m.id === 'heladas'), ...temperaturas.filter(m => m.id !== 'heladas')] : temperaturas
  };
  return invierno ? [temperatura, lluvia] : [lluvia, temperatura];
}

@Component({
  selector: 'app-mapas',
  imports: [
    MatDialogModule,
    MatIconModule
  ],
  templateUrl: './mapas.component.html',
  styleUrl: './mapas.component.css',
})
export class MapasComponent implements OnInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  readonly grupos = gruposDeLaEpoca();

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
