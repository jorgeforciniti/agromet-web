import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

interface DialogAlert {
  area: number;
  date: string;
  period: string;
  level: number;
  description?: string;
  instruction?: string;
}

interface AlertDialogData {
  alerts: DialogAlert[];
}

@Component({
  selector: 'app-alert-dialog',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  templateUrl: './alert-dialog.component.html',
  styleUrls: ['./alert-dialog.component.css']
})
export class AlertDialogComponent implements OnInit {
  groupedData: {
    [fecha: string]: {
      [period: string]: {
        [area: number]: DialogAlert[]
      }
    }
  } = {}; groupedDates: string[] = [];

  flattenedAlerts: {
    area: number;
    label: string;
    alertas: DialogAlert[];
    expanded: boolean;
  }[] = [];

  groupedAlerts: DialogAlert[] = [];

  expandedFechas = new Set<string>();
  expandedPeriods: { [fecha: string]: Set<string> } = {};

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: AlertDialogData,
    private dialogRef: MatDialogRef<AlertDialogComponent>
  ) { }

  ngOnInit(): void {
    this.groupedAlerts = this.data?.alerts ?? [];
    if (this.groupedAlerts.length > 0) {
      this.expandedAlertIndex = 0;
    }
    this.groupAlerts();

  }

  expandedAlertIndex: number | null = null;
  expandedAlerts: { [area: number]: number | null } = {};

  toggleAlert(area: number, index: number): void {
    this.expandedAlerts[area] = this.expandedAlerts[area] === index ? null : index;
  }

  isAlertExpanded(area: number, index: number): boolean {
    return this.expandedAlerts[area] === index;
  }

  groupAlerts(): void {
    if (!this.data?.alerts) return;

    const groupedByArea = new Map<number, DialogAlert[]>();

    for (const alerta of this.data.alerts) {
      const area = alerta.area;
      if (!groupedByArea.has(area)) {
        groupedByArea.set(area, []);
      }
      groupedByArea.get(area)!.push(alerta);
    }

    this.flattenedAlerts = Array.from(groupedByArea.entries()).map(([area, alertas]) => ({
      area,
      label: this.areaLabel(area.toString()),
      alertas: alertas.sort((a, b) => a.date.localeCompare(b.date)),
      expanded: true // solo uno expandido por defecto, si querés alternar después
    }));
  }

  expandedAreas: { [fecha: string]: { [period: string]: Set<number> } } = {};

  toggleArea(fecha: string, period: string, area: string): void {
    const areaNum = Number(area);
    if (!this.expandedAreas[fecha]) this.expandedAreas[fecha] = {};
    if (!this.expandedAreas[fecha][period]) this.expandedAreas[fecha][period] = new Set();

    const expandedSet = this.expandedAreas[fecha][period];

    if (expandedSet.has(areaNum)) {
      expandedSet.delete(areaNum);
    } else {
      expandedSet.add(areaNum);
    }
  }

  isAreaExpanded(fecha: string, period: string, area: string): boolean {
    const areaNum = Number(area);
    return this.expandedAreas?.[fecha]?.[period]?.has(areaNum) ?? false;
  }

  areaLabel(area: string): string {
    const areaNum = Number(area);
    return areaNum === 3373 ? 'Provincia de Tucumán' : 'Valles Calchaquíes';
  }

  toggleFecha(fecha: string): void {
    if (this.expandedFechas.has(fecha)) {
      this.expandedFechas.delete(fecha);
    } else {
      this.expandedFechas.add(fecha);
    }
  }

  isFechaExpanded(fecha: string): boolean {
    return this.expandedFechas.has(fecha);
  }

  togglePeriod(fecha: string, period: string): void {
    if (!this.expandedPeriods[fecha]) this.expandedPeriods[fecha] = new Set();
    if (this.expandedPeriods[fecha].has(period)) {
      this.expandedPeriods[fecha].delete(period);
    } else {
      this.expandedPeriods[fecha].add(period);
    }
  }

  isPeriodExpanded(fecha: string, period: string): boolean {
    return this.expandedPeriods[fecha]?.has(period);
  }

  formatPeriod(p: string): string {
    return ({
      early_morning: 'Madrugada',
      morning: 'Mañana',
      afternoon: 'Tarde',
      night: 'Noche'
    })[p] ?? p;
  }

  levelName(level: number): string {
    return { 3: 'amarilla', 4: 'naranja', 5: 'roja' }[level] ?? 'desconocida';
  }

  close(): void {
    this.dialogRef.close();
  }
}
