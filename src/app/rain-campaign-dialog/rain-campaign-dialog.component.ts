import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';
import { WeatherService } from '../services/weather.service';
import { forkJoin } from 'rxjs';


export interface RainCampaignData { }

/* ─── INTERFACES ────────────────────────────────────────── */
interface CurrentMonthRow {
  id: number;
  mm: number;
  ultimo: string;
}

interface DatasetItem extends RainRecord {
  isCurrent?: boolean;
  ultimo?: string;
}

interface RainRecord {
  year: number;
  month: string;
  value: number;
  normal: number;
}

interface StationRain {
  id: number;
  name: string;
  lat: number;
  lon: number;
  reference_period: string;
  dataset: RainRecord[];
}

@Component({
  selector: 'app-rain-campaign-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatTableModule,
    MatTooltipModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatButtonModule,
    FormsModule
  ],
  templateUrl: './rain-campaign-dialog.component.html',
  styleUrls: ['./rain-campaign-dialog.component.css']
})
export class RainCampaignDialogComponent implements OnInit {
  public showTotalColumn = true;
  public currentMonthIdx = -1;
  public currentMonthName = '';
  public stations: StationRain[] = [];
  public months: string[] = [];
  public displayedColumns: string[] = [];
  public dataSource: StationRain[] = [];


  public monthsList = [
    { value: 1, label: 'Ene' }, { value: 2, label: 'Feb' }, { value: 3, label: 'Mar' },
    { value: 4, label: 'Abr' }, { value: 5, label: 'May' }, { value: 6, label: 'Jun' },
    { value: 7, label: 'Jul' }, { value: 8, label: 'Ago' }, { value: 9, label: 'Sep' },
    { value: 10, label: 'Oct' }, { value: 11, label: 'Nov' }, { value: 12, label: 'Dic' }
  ];
  public selectedMonth!: number;
  public selectedYear!: number;

  constructor(
    private weatherService: WeatherService,
    private dialogRef: MatDialogRef<RainCampaignDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: RainCampaignData
  ) { }

  ngOnInit(): void {
    const today = new Date();                     // p.e. 24-Jul-2025

    const startMonth = (today.getMonth() + 2) > 12 ? 1 : (today.getMonth() + 2);
    const startYear = startMonth === 1           // ← corrección clave
      ? today.getFullYear()
      : today.getFullYear() - 1;

    this.selectedMonth = startMonth;              // 8  (Ago)
    this.selectedYear = startYear;               // 2024
    this.currentMonthName = this.monthsList[today.getMonth()].label; // Jul

    this.loadCampaign();
  }

  loadCampaign(): void {
     const startMonth = this.selectedMonth;   // 1-12
  const startYear  = this.selectedYear;    // 4-dígitos

  /* 2. diferencia entre hoy y el inicio de la ventana */
  const today       = new Date();
  const todayMonth0 = today.getMonth();                     // 0-11
  const monthsDiff  = (today.getFullYear() - startYear) * 12 +
                      (todayMonth0 - (startMonth - 1));     // puede ser <0 o ≥12

  const currentPos  = (monthsDiff >= 0 && monthsDiff < 12) ? monthsDiff : -1;
  this.currentMonthIdx = currentPos;
  const includeCurrent = currentPos > -1;

  /* 3. llamadas al backend */
  forkJoin({
    campaign: this.weatherService.getRainCampaign<StationRain>(startMonth, startYear),
    current : this.weatherService.getRainCurrentMonth<CurrentMonthRow>()
  }).subscribe(({ campaign, current }) => {

      if (campaign.status !== 'success') return;

      /* 1. dataset base */
      this.stations = campaign.data.filter(
        (st: StationRain) => st.dataset.some(d => d.value !== -999.9)
      );
      if (!this.stations.length) {
        this.months = this.displayedColumns = this.dataSource = [];
        return;
      }

      /* 2. meses de la ventana */
      this.months = this.buildMonthsArray(startMonth);   // etiqueta mes

      /* 3. ¿dónde cae el mes-actual (mes+año) en la ventana? */
      const today = new Date();
      const todayMonth0 = today.getMonth();              // 0-11
      const monthsDiff = (today.getFullYear() - startYear) * 12 +
        (todayMonth0 - (startMonth - 1));   // 0-11 ó fuera

      const currentPos = monthsDiff >= 0 && monthsDiff < 12 ? monthsDiff : -1;
      const includeCurrent = currentPos > -1;

      /* 4. fusionar dato parcial sólo si la ventana lo contiene */
      if (includeCurrent && current.status === 'success') {
        const map = new Map<number, CurrentMonthRow>(
          current.data.map((r: CurrentMonthRow) => [r.id, r])
        );

        this.stations = this.stations.map(st => {
          const clone: StationRain = { ...st, dataset: [] as DatasetItem[] };
          st.dataset.forEach((d, idx) => {
            const ds: DatasetItem = { ...d };
            if (idx === currentPos && map.has(st.id)) {
              const cur = map.get(st.id)!;
              ds.value = cur.mm;
              ds.isCurrent = true;
              ds.ultimo = cur.ultimo;
            }
            clone.dataset.push(ds);
          });
          return clone;
        });
      }

      /* 5. columnas a mostrar */
      this.displayedColumns = [
        'name', 'lat', 'lon',
        ...this.months,
        ...(includeCurrent ? ['ultimo'] : []),
        ...(includeCurrent ? [] : ['total'])
      ];

      this.showTotalColumn = !includeCurrent;
      this.dataSource = this.stations;
    });
  }


  /** genera 12 etiquetas empezando en startMonth (1-12) */
  private buildMonthsArray(startMonth: number): string[] {
    const out: string[] = [];
    let m = startMonth;                // 1-12
    for (let i = 0; i < 12; i++) {
      out.push(this.monthsList[(m - 1) % 12].label);
      m++;
    }
    return out;
  }


  /* ─── MÉTODOS DE CELDA ───────────────────────────────── */
  cellClass(value: number, normal: number, isCurrent = false): string {
    if (isCurrent) return 'current-month';
    if (value === -999.9) return 'no-data';
    const ratio = value / normal;
    if (ratio < 0.33) return 'below-33';
    if (ratio < 0.66) return 'below-66';
    if (ratio < 0.99) return 'below-99';
    if (ratio <= 1.5) return 'above-100-50';
    if (ratio <= 2) return 'above-150-100';
    return 'above-200';
  }

  public close(): void {
    this.dialogRef.close();
  }

  /** Devuelve true si falta algún valor en el dataset */
  public hasMissingData(dataset: RainRecord[]): boolean {
    return dataset.some(d => d.value === -999.9);
  }

  /** Suma de valores válidos */
  public totalPeriod(dataset: RainRecord[]): number {
    return dataset
      .filter(d => d.value !== -999.9)
      .reduce((sum, d) => sum + d.value, 0);
  }

  /** Suma de los valores normales */
  public totalNormal(dataset: RainRecord[]): number {
    return dataset.reduce((sum, d) => sum + d.normal, 0);
  }

  /** Texto para tooltip de celdas */
  public tooltipText(normal: number, period: string): string {
    return `Normal: ${normal} mm\nPeríodo referencia: ${period}`;
  }
}
