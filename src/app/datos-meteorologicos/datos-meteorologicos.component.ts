import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { StationService } from '../services/station.service';
import { WeatherService, WeatherStation } from '../services/weather.service';
import { SelectorEstacionComponent } from '../shared/selector-estacion.component';
import { Consulta, Herramienta } from '../shared/enlace-consulta';

interface Tarjeta {
  herramienta: Herramienta;
  /** Lo que la herramienta responde, como lo preguntaría quien la usa */
  pregunta: string;
  /** Nombre de la herramienta */
  titulo: string;
  /** Aclaración junto al nombre (por ejemplo, que el resultado es una estimación) */
  nota?: string;
  /** Ícono de Material que anticipa qué muestra la herramienta */
  icono: string;
}

interface Grupo {
  titulo: string;
  descripcion: string;
  tarjetas: Tarjeta[];
}

/**
 * Herramientas ordenadas según cuándo pasó lo que muestran: hoy, la campaña en curso y otros
 * años. Cada una se presenta por la pregunta que responde, con el nombre técnico debajo.
 */
const GRUPOS: Grupo[] = [
  {
    titulo: 'Hoy',
    descripcion: 'Datos en vivo de las estaciones.',
    tarjetas: [
      { herramienta: 'tiempo-real', icono: 'sensors', pregunta: '¿Qué marcan las estaciones ahora?', titulo: 'Datos en tiempo real' },
      { herramienta: 'resumen-diario', icono: 'view_list', pregunta: '¿Cómo vino el día en cada estación?', titulo: 'Resumen diario de la red' },
      { herramienta: 'aplicar', icono: 'agriculture', pregunta: '¿Puedo aplicar hoy?', titulo: 'Condiciones para aplicar agroquímicos' }
    ]
  },
  {
    titulo: 'Esta campaña',
    descripcion: 'Desde una fecha o por etapa del cultivo.',
    tarjetas: [
      { herramienta: 'campania-lluvias', icono: 'water_drop', pregunta: '¿Cuánto llovió desde que empezó la campaña?', titulo: 'Lluvias por campaña' },
      { herramienta: 'balance-hidrico', icono: 'water', pregunta: '¿Cuánta agua tendría el suelo?', titulo: 'Balance hidrológico seriado',
        nota: 'Estimación teórica' },
      { herramienta: 'fenologia', icono: 'eco', pregunta: '¿Cómo fue el tiempo en cada etapa del cultivo?', titulo: 'Meteorología por estadíos fenológicos' },
      { herramienta: 'enfermedades', icono: 'coronavirus', pregunta: '¿Hubo condiciones para enfermedades?', titulo: 'Condiciones para enfermedades' },
      { herramienta: 'horas-frio', icono: 'ac_unit', pregunta: '¿Cuántas horas de frío se acumularon?', titulo: 'Horas de frío' },
      { herramienta: 'suma-termica', icono: 'device_thermostat', pregunta: '¿Cuántos grados-día lleva el cultivo?', titulo: 'Sumas térmicas' },
      { herramienta: 'rinde-soja', icono: 'grass', pregunta: '¿Cuánto puede rendir la soja?', titulo: 'Estimador de rindes de soja' }
    ]
  },
  {
    titulo: 'Otros años',
    descripcion: 'Series diarias y comparaciones.',
    tarjetas: [
      { herramienta: 'datos-localidad', icono: 'table_chart', pregunta: '¿Qué registró la estación en un período?', titulo: 'Datos por localidad' },
      { herramienta: 'comparar-anios', icono: 'date_range', pregunta: '¿Este año viene distinto a otro?', titulo: 'Comparación entre años' },
      { herramienta: 'comparar-localidades', icono: 'compare_arrows', pregunta: '¿Cómo se compara con otra localidad?', titulo: 'Comparación entre localidades' }
    ]
  }
];

@Component({
  selector: 'app-datos-meteorologicos',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatIconModule, SelectorEstacionComponent],
  templateUrl: './datos-meteorologicos.component.html',
  styleUrls: ['./datos-meteorologicos.component.css']
})
export class DatosMeteorologicosComponent implements OnInit {
  readonly grupos = GRUPOS;

  /** Estaciones para el selector de arriba (todas las de la red) */
  estaciones: WeatherStation[] = [];

  constructor(
    private dialog: MatDialog,
    private route: ActivatedRoute,
    private router: Router,
    private stationService: StationService,
    private weatherService: WeatherService
  ) { }

  get activa(): string {
    return this.stationService.activa;
  }

  /** Localidad, departamento y provincia de la estación activa, junto al selector */
  get lugarActiva(): string {
    const e = this.estaciones.find(s => s.Identificacion === this.activa);
    if (!e) return '';
    return [...new Set([e.Localidad, e.departamento, e.provincia].map(t => (t ?? '').trim()).filter(Boolean))].join(', ');
  }

  /** La estación elegida arriba pasa a ser la activa: con ella arranca cada herramienta. */
  elegirEstacion(id: string): void {
    this.stationService.setActiva(id);
  }

  abrir(t: Tarjeta): void {
    void this.abrirPorEnlace[t.herramienta]({});
  }

  /** Herramientas que se pueden abrir desde un enlace (?herramienta=...) */
  private readonly abrirPorEnlace: Record<Herramienta, (c: Consulta) => Promise<void>> = {
    'datos-localidad': c => this.openDatosxLocalidad(c),
    'tiempo-real': c => this.openDatosOnline(c),
    'resumen-diario': c => this.openResumenDiario(c),
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
    this.weatherService.getStationsAll().subscribe({
      next: lista => this.estaciones = [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
      error: () => this.estaciones = []
    });

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

  async openResumenDiario(consulta: Consulta = {}): Promise<void> {
    const { ResumenDiarioDialogComponent } = await import('../resumen-diario-dialog/resumen-diario-dialog.component');

    this.dialog.open(ResumenDiarioDialogComponent, {
      data: { consulta },
      width: 'min(1180px, 95vw)',
      maxWidth: '95vw',
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

