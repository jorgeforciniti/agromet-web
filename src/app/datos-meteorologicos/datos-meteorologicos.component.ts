import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { StationService } from '../services/station.service';
import { Consulta, Herramienta } from '../shared/enlace-consulta';

/** Qué tipo de dato muestra cada herramienta (etiqueta de la tarjeta) */
type TipoDato = 'En vivo' | 'Histórico' | 'Cálculo';

interface Tarjeta {
  herramienta: Herramienta;
  titulo: string;
  descripcion: string;
  tipo: TipoDato;
  /** Miniatura; sin imagen se muestra el ícono */
  imagen?: string;
  icono: string;
}

interface Grupo {
  titulo: string;
  descripcion: string;
  tarjetas: Tarjeta[];
}

const IMG = 'assets/images/datosmeteorologicos/';

/**
 * Herramientas agrupadas por para qué sirven (A3 del informe de mejoras): lo de ahora, lo de la
 * campaña y el cultivo, y lo histórico. Antes eran 7 tarjetas grandes y 5 enlaces en una barra
 * lateral, sin distinguir si el dato era actual o histórico.
 */
const GRUPOS: Grupo[] = [
  {
    titulo: 'Ahora y próximos días',
    descripcion: 'Lo que está pasando en las estaciones y las condiciones para trabajar hoy.',
    tarjetas: [
      { herramienta: 'tiempo-real', titulo: 'Datos en tiempo real', tipo: 'En vivo', imagen: IMG + 'datostiemporeal.png', icono: 'sensors',
        descripcion: 'Estaciones en el mapa con su último dato y las últimas 48 horas de cada variable.' },
      { herramienta: 'aplicar', titulo: 'Condiciones para aplicar agroquímicos', tipo: 'En vivo', imagen: IMG + 'aplicacion.png', icono: 'agriculture',
        descripcion: 'Viento, temperatura, humedad y Delta T por estación para elegir la ventana de aplicación.' }
    ]
  },
  {
    titulo: 'Campaña y cultivo',
    descripcion: 'Cómo viene la campaña: agua, temperatura y sanidad desde una fecha o por etapa del cultivo.',
    tarjetas: [
      { herramienta: 'campania-lluvias', titulo: 'Lluvias por campaña', tipo: 'Histórico', imagen: IMG + 'tormenta.png', icono: 'water_drop',
        descripcion: 'Lluvia mensual de todas las estaciones frente a la normal, desde el mes de inicio.' },
      { herramienta: 'fenologia', titulo: 'Meteorología por estadíos fenológicos', tipo: 'Histórico', imagen: IMG + 'estadios-fenologicos-card.png', icono: 'eco',
        descripcion: 'Lluvia, ETo, demanda hídrica y temperaturas de cada etapa del cultivo.' },
      { herramienta: 'balance-hidrico', titulo: 'Balance hidrológico seriado', tipo: 'Cálculo', imagen: IMG + 'balance-hidrico-card.png', icono: 'water',
        descripcion: 'Almacenaje de agua en el suelo, déficit y excedentes de cada década.' },
      { herramienta: 'enfermedades', titulo: 'Condiciones para enfermedades', tipo: 'Cálculo', imagen: IMG + 'condiciones-enfermedades-card.png', icono: 'biotech',
        descripcion: 'Días con condiciones predisponentes según los registros horarios de la estación.' },
      { herramienta: 'horas-frio', titulo: 'Horas de frío', tipo: 'Cálculo', imagen: IMG + 'horas-frio-card.jpg', icono: 'ac_unit',
        descripcion: 'Horas bajo el umbral y unidades Utah acumuladas en el período.' },
      { herramienta: 'suma-termica', titulo: 'Sumas térmicas', tipo: 'Cálculo', imagen: IMG + 'sumas-termicas-card.jpg', icono: 'functions',
        descripcion: 'Grados-día por promedio o seno simple, con la base del cultivo.' },
      { herramienta: 'rinde-soja', titulo: 'Estimador de rindes de soja', tipo: 'Cálculo', imagen: IMG + 'rinde-soja-card.jpg', icono: 'grass',
        descripcion: 'Rendimiento a partir del conteo de vainas y el peso de mil semillas.' }
    ]
  },
  {
    titulo: 'Histórico y comparación',
    descripcion: 'Series diarias de una estación y comparaciones entre años o entre localidades.',
    tarjetas: [
      { herramienta: 'datos-localidad', titulo: 'Datos por localidad', tipo: 'Histórico', imagen: IMG + 'datosporlocalidad.png', icono: 'table_chart',
        descripcion: 'Resumen, gráficos y tablas diarias de una estación en el período elegido.' },
      { herramienta: 'comparar-anios', titulo: 'Comparación entre años', tipo: 'Histórico', imagen: IMG + 'comparar-anios-card.svg', icono: 'insights',
        descripcion: 'El mismo período de dos años en una estación, con la normal de referencia.' },
      { herramienta: 'comparar-localidades', titulo: 'Comparación entre localidades', tipo: 'Histórico', imagen: IMG + 'comparar-localidades-card.svg', icono: 'compare',
        descripcion: 'Dos estaciones en el mismo período, día por día o agrupado.' }
    ]
  }
];

@Component({
  selector: 'app-datos-meteorologicos',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatIconModule],
  templateUrl: './datos-meteorologicos.component.html',
  styleUrls: ['./datos-meteorologicos.component.css']
})
export class DatosMeteorologicosComponent implements OnInit {
  readonly grupos = GRUPOS;

  constructor(
    private dialog: MatDialog,
    private route: ActivatedRoute,
    private router: Router,
    private stationService: StationService
  ) { }

  abrir(t: Tarjeta): void {
    void this.abrirPorEnlace[t.herramienta]({});
  }

  /** Herramientas que se pueden abrir desde un enlace (?herramienta=...) */
  private readonly abrirPorEnlace: Record<Herramienta, (c: Consulta) => Promise<void>> = {
    'datos-localidad': c => this.openDatosxLocalidad(c),
    'tiempo-real': c => this.openDatosOnline(c),
    'campania-lluvias': c => this.openRainDialog(c),
    'aplicar': c => this.openConditionsDialog(c),
    'comparar-anios': c => this.openComparisonByYear(c),
    'comparar-localidades': c => this.openComparisonByLocation(c),
    'horas-frio': c => this.openChillHoursDialog(c),
    'suma-termica': c => this.openThermalSumDialog(c),
    'enfermedades': c => this.openDiseaseConditionsDialog(c),
    'fenologia': c => this.openPhenologyWeatherDialog(c),
    'rinde-soja': c => this.openSoyYieldDialog(c),
    'balance-hidrico': c => this.openWaterBalanceDialog(c)
  };

  ngOnInit(): void {
    if (typeof window !== 'undefined' && window.location.search.includes('debugDiseaseDialog=1')) {
      setTimeout(() => { void this.openDiseaseConditionsDialog(); }, 300);
    }
    this.abrirDesdeEnlace();
  }

  /**
   * Enlace compartido (ver shared/enlace-consulta.ts): fija la estación activa, abre la
   * herramienta con la consulta y, al cerrarla, limpia la URL para no reabrirla al recargar.
   */
  private abrirDesdeEnlace(): void {
    const params = this.route.snapshot.queryParamMap;
    const herramienta = params.get('herramienta') as Herramienta | null;
    const abrir = herramienta ? this.abrirPorEnlace[herramienta] : undefined;
    if (!abrir) return;

    const consulta: Consulta = {};
    params.keys.filter(k => k !== 'herramienta').forEach(k => consulta[k] = params.get(k) ?? '');
    this.stationService.setActiva(consulta['estacion']);

    void abrir(consulta).then(() => {
      this.dialog.openDialogs[this.dialog.openDialogs.length - 1]?.afterClosed().subscribe(() =>
        this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true }));
    });
  }

  async openDatosOnline(consulta: Consulta = {}): Promise<void> {
    const { DatosOnlineComponent } = await import('../datos-online/datos-online.component');

    this.dialog.open(DatosOnlineComponent, {
      data: { consulta },
      panelClass: 'do-dialog',
      width: 'min(1400px, 96vw)',
      maxWidth: '96vw',
      height: '92vh',
      maxHeight: '92vh',
      autoFocus: false,
      restoreFocus: false,
    });
  }

  async openDatosxLocalidad(consulta: Consulta = {}): Promise<void> {
    const { WeatherDashboardComponent } = await import('../weather-dashboard/weather-dashboard.component');

    this.dialog.open(WeatherDashboardComponent, {
      data: { consulta },
      panelClass: 'do-dialog',          // <- clave: mismo panelClass que el otro
      width: 'min(1200px, 96vw)',
      maxWidth: '96vw',
      height: '92vh',
      maxHeight: '92vh',
      autoFocus: false,
      restoreFocus: false,
    });
  }

  async openRainDialog(consulta: Consulta = {}): Promise<void> {
    const { RainCampaignDialogComponent } = await import('../rain-campaign-dialog/rain-campaign-dialog.component');

    this.dialog.open(RainCampaignDialogComponent, {
      data: { consulta },
      width: 'min(1600px, 98vw)',
      maxWidth: '98vw',
      height: '95vh',
      panelClass: 'do-dialog'
    });
  }

  async openConditionsDialog(consulta: Consulta = {}): Promise<void> {
    const { ConditionsToApplyComponent } = await import('../conditions-to-apply/conditions-to-apply.component');

    this.dialog.open(ConditionsToApplyComponent, {
      data: { consulta },
      width: 'min(1600px, 98vw)',
      maxWidth: '98vw',
      height: '95vh',
      panelClass: 'do-dialog'
    });
  }

  async openComparisonByYear(consulta: Consulta = {}): Promise<void> {
    const { ComparisonByYearComponent } = await import('../comparison-by-year/comparison-by-year.component');

    this.dialog.open(ComparisonByYearComponent, {
      data: { consulta },
      width: 'min(1300px, 95vw)',
      maxWidth: '95vw',
      height: '92vh',
      maxHeight: '92vh',
      panelClass: 'do-dialog'
    });
  }

  async openComparisonByLocation(consulta: Consulta = {}): Promise<void> {
    const { ComparisonByLocationComponent } = await import('../comparison-by-location/comparison-by-location.component');

    this.dialog.open(ComparisonByLocationComponent, {
      data: { consulta },
      width: 'min(1300px, 95vw)',
      maxWidth: '95vw',
      height: '92vh',
      maxHeight: '92vh',
      panelClass: 'do-dialog'
    });
  }

  async openSoyYieldDialog(consulta: Consulta = {}): Promise<void> {
    const { SoyYieldDialogComponent } = await import('../soy-yield-dialog/soy-yield-dialog.component');

    this.dialog.open(SoyYieldDialogComponent, {
      data: { consulta },
      width: 'min(980px, 94vw)',
      maxWidth: '94vw',
      height: '92vh',
      maxHeight: '92vh',
      panelClass: 'do-dialog',
      autoFocus: false,
      restoreFocus: false
    });
  }

  async openChillHoursDialog(consulta: Consulta = {}): Promise<void> {
    const { ChillHoursDialogComponent } = await import('../chill-hours-dialog/chill-hours-dialog.component');

    this.dialog.open(ChillHoursDialogComponent, {
      data: { consulta },
      width: 'min(1120px, 95vw)',
      maxWidth: '95vw',
      height: '92vh',
      maxHeight: '92vh',
      panelClass: 'do-dialog',
      autoFocus: false,
      restoreFocus: false
    });
  }

  async openWaterBalanceDialog(consulta: Consulta = {}): Promise<void> {
    const { WaterBalanceDialogComponent } = await import('../water-balance-dialog/water-balance-dialog.component');

    this.dialog.open(WaterBalanceDialogComponent, {
      data: { consulta },
      width: 'min(1120px, 95vw)',
      maxWidth: '95vw',
      height: '92vh',
      maxHeight: '92vh',
      panelClass: 'do-dialog',
      autoFocus: false,
      restoreFocus: false
    });
  }

  async openThermalSumDialog(consulta: Consulta = {}): Promise<void> {
    const { ThermalSumDialogComponent } = await import('../thermal-sum-dialog/thermal-sum-dialog.component');

    this.dialog.open(ThermalSumDialogComponent, {
      data: { consulta },
      width: 'min(1120px, 95vw)',
      maxWidth: '95vw',
      height: '92vh',
      maxHeight: '92vh',
      panelClass: 'do-dialog',
      autoFocus: false,
      restoreFocus: false
    });
  }

  async openDiseaseConditionsDialog(consulta: Consulta = {}): Promise<void> {
    const { DiseaseConditionsDialogComponent } = await import('../disease-conditions-dialog/disease-conditions-dialog.component');

    this.dialog.open(DiseaseConditionsDialogComponent, {
      data: { consulta },
      width: 'min(1280px, 96vw)',
      maxWidth: '96vw',
      height: '94vh',
      maxHeight: '94vh',
      panelClass: 'do-dialog',
      autoFocus: false,
      restoreFocus: false
    });
  }

  async openPhenologyWeatherDialog(consulta: Consulta = {}): Promise<void> {
    const { PhenologyWeatherDialogComponent } = await import('../phenology-weather-dialog/phenology-weather-dialog.component');

    this.dialog.open(PhenologyWeatherDialogComponent, {
      data: { consulta },
      width: 'min(1400px, 97vw)',
      maxWidth: '97vw',
      height: '95vh',
      maxHeight: '95vh',
      panelClass: 'do-dialog',
      autoFocus: false,
      restoreFocus: false
    });
  }
}

