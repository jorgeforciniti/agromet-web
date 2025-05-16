import { Component, Inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  MatDialogRef,
  MAT_DIALOG_DATA,
  MatDialogModule
} from '@angular/material/dialog';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule } from '@angular/forms';
import { WeatherService } from '../services/weather.service';

export interface RainCampaignData {}

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
  ) {}

  ngOnInit(): void {
    const today = new Date();
    this.selectedMonth = today.getMonth() + 1;
    this.selectedYear = today.getFullYear() - 1;
    this.loadCampaign();
  }

  public loadCampaign(): void {
    this.weatherService
      .getRainCampaign(this.selectedMonth, this.selectedYear)
      .subscribe((resp: { status: string; data: StationRain[] }) => {
        if (resp.status === 'success') {
          // Filtrar estaciones que tienen al menos un dato válido
          this.stations = resp.data.filter((st: StationRain) =>
            st.dataset.some((d: RainRecord) => d.value !== -999.9)
          );

          if (!this.stations.length) {
            this.months = [];
            this.displayedColumns = [];
            this.dataSource = [];
            return;
          }

          this.months = this.stations[0].dataset.map((d: RainRecord) => d.month);
          this.displayedColumns = [
            'name', 'lat', 'lon',
            ...this.months,
            'total'
          ];
          this.dataSource = this.stations;
        }
      });
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

  /** Clase para colorear celdas de valor */
  public cellClass(value: number, normal: number): string {
    if (value === -999.9) return 'no-data';
    const ratio = value / normal;
    if (ratio < 0.33) return 'below-33';
    if (ratio < 0.66) return 'below-66';
    if (ratio < 0.99) return 'below-99';
    if (ratio <= 1.5) return 'above-100-50';
    if (ratio <= 2) return 'above-150-100';
    return 'above-200';
  }

  /** Texto para tooltip de celdas */
  public tooltipText(normal: number, period: string): string {
    return `Normal: ${normal} mm\nPeríodo referencia: ${period}`;
  }
}
