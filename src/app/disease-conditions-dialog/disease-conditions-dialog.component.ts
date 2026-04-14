import { Component, Injectable, OnInit, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import {
  DateAdapter,
  MAT_DATE_FORMATS,
  MAT_DATE_LOCALE,
  MatNativeDateModule,
  NativeDateAdapter
} from '@angular/material/core';
import { DiseaseApiRecord, WeatherService, WeatherStation } from '../services/weather.service';

interface DiseaseOption {
  code: number;
  label: string;
  crop: string;
  scientificName: string;
}

interface DiseaseGroup {
  label: string;
  options: DiseaseOption[];
}

interface DiseaseColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
}

interface DiseaseResultRow {
  date: string;
  classification: string;
  tone: string;
  values: Record<string, string>;
}

interface SummaryItem {
  label: string;
  value: string;
  tone: string;
}

const DISEASE_DATE_FORMATS = {
  parse: {
    dateInput: 'DD/MM/YYYY',
  },
  display: {
    dateInput: 'DD/MM/YYYY',
    monthYearLabel: 'MMM YYYY',
    dateA11yLabel: 'LL',
    monthYearA11yLabel: 'MMMM YYYY',
  },
};

const DISEASE_GROUPS: DiseaseGroup[] = [
  {
    label: 'Soja',
    options: [
      { code: 1, label: 'Roya de la soja', crop: 'Soja', scientificName: 'Phakopsora pachyrhizi' },
      { code: 3, label: 'Mancha marron', crop: 'Soja', scientificName: 'Septoria glycines' },
      { code: 4, label: 'Tizon de la hoja y mancha purpura', crop: 'Soja', scientificName: 'Cercospora kikuchii' },
      { code: 5, label: 'Mancha anillada', crop: 'Soja', scientificName: 'Corynespora cassiicola' },
      { code: 6, label: 'Tizon bacteriano', crop: 'Soja', scientificName: 'Pseudomonas syringae pv. glycinea' }
    ]
  },
  {
    label: 'Maiz',
    options: [
      { code: 10, label: 'Tizon foliar', crop: 'Maiz', scientificName: 'Exserohilum turcicum' },
      { code: 11, label: 'Roya polisora', crop: 'Maiz', scientificName: 'Puccinia polysora' },
      { code: 15, label: 'Mancha gris', crop: 'Maiz', scientificName: 'Cercospora zeae-maydis' },
      { code: 16, label: 'Fusarium', crop: 'Maiz', scientificName: 'Fusarium graminearum' }
    ]
  },
  {
    label: 'Trigo',
    options: [
      { code: 14, label: 'Roya estriada', crop: 'Trigo', scientificName: 'Puccinia striiformis f. sp. tritici' }
    ]
  },
  {
    label: 'Cana de azucar',
    options: [
      { code: 2, label: 'Roya de la cana', crop: 'Cana de azucar', scientificName: 'Puccinia melanocephala' }
    ]
  },
  {
    label: 'Limon',
    options: [
      { code: 9, label: 'Melanosis', crop: 'Limon', scientificName: 'Diaporthe citri' }
    ]
  }
];

@Injectable()
class DiseaseDateAdapter extends NativeDateAdapter {
  override parse(value: unknown): Date | null {
    if (typeof value === 'string' && value.indexOf('/') > -1) {
      const [day, month, year] = value.split('/');
      const date = new Date(+year, +month - 1, +day);
      return isNaN(date.getTime()) ? null : date;
    }
    return super.parse(value);
  }

  override format(date: Date): string {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }
}

@Component({
  selector: 'app-disease-conditions-dialog',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatProgressBarModule
  ],
  providers: [
    { provide: MAT_DATE_LOCALE, useValue: 'es-AR' },
    { provide: DateAdapter, useClass: DiseaseDateAdapter },
    { provide: MAT_DATE_FORMATS, useValue: DISEASE_DATE_FORMATS }
  ],
  templateUrl: './disease-conditions-dialog.component.html',
  styleUrls: ['./disease-conditions-dialog.component.css']
})
export class DiseaseConditionsDialogComponent implements OnInit {
  stations: WeatherStation[] = [];
  selectedStation = '2049';
  selectedDisease = 1;
  fromDate = '';
  toDate = '';
  appliedStation = '';
  appliedDisease = 1;
  appliedFromDate = '';
  appliedToDate = '';
  rows: DiseaseResultRow[] = [];
  columns: DiseaseColumn[] = [];
  summaryItems: SummaryItem[] = [];
  loadError = '';
  isLoading = false;
  readonly diseaseGroups = DISEASE_GROUPS;

  constructor(
    private weatherService: WeatherService,
    private dialogRef: MatDialogRef<DiseaseConditionsDialogComponent>
  ) { }

  ngOnInit(): void {
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

    this.selectedStation = '2049';
    this.selectedDisease = 1;
    this.fromDate = this.formatApiDate(monthStart);
    this.toDate = this.formatApiDate(today);
    this.appliedStation = this.selectedStation;
    this.appliedDisease = this.selectedDisease;
    this.appliedFromDate = this.fromDate;
    this.appliedToDate = this.toDate;

    this.weatherService.getStationsAll().subscribe({
      next: (stations) => {
        this.stations = [...stations]
          .filter(st => st.Identificacion !== '20')
          .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
        this.loadReport();
      },
      error: () => {
        this.loadError = 'No se pudieron cargar las estaciones para el modulo fitosanitario.';
      }
    });
  }

  close(): void {
    this.dialogRef.close();
  }

  loadReport(): void {
    this.loadError = '';

    const station = this.selectedStation;
    const disease = this.selectedDisease;
    const fromDate = this.coerceDate(this.fromDate);
    const toDate = this.coerceDate(this.toDate);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime()) || fromDate > toDate) {
      this.resetReport();
      this.loadError = 'Revisa el rango de fechas antes de consultar las condiciones sanitarias.';
      return;
    }

    this.isLoading = true;
    this.weatherService.getDiseaseData<DiseaseApiRecord>(
      this.formatApiDate(fromDate),
      this.formatApiDate(toDate),
      String(station)
    ).subscribe({
      next: (response) => {
        const diseaseCode = Number(disease);
        const records = Array.isArray(response.data) ? response.data : [];
        const grouped = this.groupRecordsByDate(records);
        const dates = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b));

        this.columns = this.getColumns(diseaseCode);
        this.rows = dates.map((date) => this.buildRow(diseaseCode, date, grouped.get(date) ?? []));
        this.summaryItems = this.buildSummaryItems(diseaseCode, this.rows);
        this.appliedStation = station;
        this.appliedDisease = diseaseCode;
        this.appliedFromDate = this.formatApiDate(fromDate);
        this.appliedToDate = this.formatApiDate(toDate);
        this.isLoading = false;
      },
      error: () => {
        this.resetReport();
        this.loadError = 'No se pudieron recuperar los datos horarios para calcular las condiciones predisponentes.';
        this.isLoading = false;
      }
    });
  }

  selectedDiseaseLabel(diseaseCode = Number(this.selectedDisease)): string {
    for (const group of this.diseaseGroups) {
      const match = group.options.find(option => option.code === diseaseCode);
      if (match) {
        return `${match.label} (${match.scientificName})`;
      }
    }

    return 'Sin seleccionar';
  }

  diseaseHelp(diseaseCode = Number(this.appliedDisease || this.selectedDisease)): string {
    switch (Number(diseaseCode)) {
      case 1:
        return 'Roya de la soja: evalua horas de mojado, temperatura media durante el mojado y horas con humedad alta para calificar riesgo diario.';
      case 2:
        return 'Roya de la cana: suma lapsos de 15 minutos con 17-23 °C, humedad relativa alta y hoja mojada. Con 8 horas o mas, el dia queda apto.';
      case 3:
        return 'Mancha marron: distingue progreso de enfermedad por mojado y temperatura, y dispersion por lluvia o viento fuerte.';
      case 4:
        return 'Cercospora kikuchii: separa infeccion, germinacion y dispersion segun horas favorables, mojado foliar y eventos de viento o lluvia.';
      case 5:
        return 'Mancha anillada: considera infeccion solo con 24 horas o mas en el rango termico y de humedad requerido.';
      case 6:
        return 'Tizon bacteriano: necesita temperatura favorable, lluvia y viento maximo fuerte para marcar infeccion.';
      case 9:
        return 'Melanosis: clasifica el dia en bajo, ligero, moderado, alto o muy alto segun horas de mojado en rangos termicos amplios y optimos.';
      case 10:
        return 'Tizon foliar: usa horas de mojado dentro de rangos amplios y optimos para escalar el riesgo diario.';
      case 11:
        return 'Roya polisora: pondera mojado foliar en bandas termicas amplia, intermedia y optima para definir la categoria diaria.';
      case 14:
        return 'Roya estriada: informa horas aptas por dia cuando hay mojado foliar y temperatura entre 10 y 20 °C.';
      case 15:
        return 'Mancha gris: marca condicion positiva cuando se acumulan 12 horas o mas de mojado con 22-30 °C.';
      case 16:
        return 'Fusarium: marca condicion positiva con 20 horas o mas de mojado y temperatura entre 25 y 28 °C.';
      default:
        return 'Las condiciones predisponentes se calculan en forma nativa a partir de la API horaria de enfermedades.';
    }
  }

  diseaseCriteria(diseaseCode = Number(this.appliedDisease || this.selectedDisease)): string {
    switch (Number(diseaseCode)) {
      case 1:
        return [
          'Condiciones predisponentes para roya de la soja.',
          'Alto: entre 6 y 12 horas de mojado foliar con temperaturas entre 19 °C y 24 °C.',
          'Alto: más de 12 horas de mojado foliar con temperaturas entre 11 °C y 28 °C.',
          'Moderado: entre 6 y 12 horas de mojado foliar con temperaturas entre 11 °C y 18.9 °C.',
          'Moderado: entre 6 y 12 horas de mojado foliar con temperaturas entre 24.1 °C y 28 °C.',
          'Ligero: más de 6 horas de mojado foliar con temperaturas debajo de 11 °C o mayores a 28 °C.'
        ].join('\n');
      case 2:
        return [
          'Condiciones predisponentes para roya en caña de azúcar.',
          'Condición positiva: más de 8 horas de mojado foliar, temperaturas entre 17 °C y 23 °C y humedad relativa mayor a 90 %.'
        ].join('\n');
      case 3:
        return [
          'Condiciones predisponentes para mancha marrón (Septoria glycines).',
          '(Pro) Progreso: temperaturas entre 15 °C y 30 °C con más de 6 horas de mojado foliar.',
          '(Dis) Dispersión: viento y salpicado de lluvia.'
        ].join('\n');
      case 4:
        return [
          'Condiciones predisponentes para tizón de la hoja y mancha púrpura de la semilla (Cercospora kikuchii).',
          '(Inf) Infección primaria: temperaturas entre 24 °C y 32 °C con humedad relativa por encima de 70 % durante más de 6 horas.',
          '(Ger) Germinación: más de 6 horas de mojado foliar.',
          '(Dis) Dispersión: viento por sobre los 15 km/h y salpicado de lluvia.'
        ].join('\n');
      case 5:
        return [
          'Condiciones predisponentes para mancha anillada de la soja (Corynespora cassiicola).',
          '(Inf) Infección: temperaturas entre 18 °C y 21 °C, humedad relativa por encima de 80 % y mojado foliar mínimo de 24 horas.',
          'Nota: luego de la infección el período de incubación es de 7 días.'
        ].join('\n');
      case 6:
        return [
          'Condiciones predisponentes para tizón bacteriano (Pseudomonas syringae pv. glycinea).',
          '(Inf) Infección: temperaturas entre 20 °C y 26 °C, lluvias intensas y vientos durante 6 horas o más.'
        ].join('\n');
      case 9:
        return [
          'Condiciones predisponentes para infección de melanosis en limón.',
          'Muy alto: más de 12 horas de mojado foliar con temperaturas entre 20 °C y 28 °C.',
          'Alto: más de 12 horas de mojado foliar con temperaturas entre 10 °C y 35 °C.',
          'Alto: entre 8 y 12 horas de mojado foliar con temperaturas entre 20 °C y 28 °C.',
          'Moderado: entre 8 y 12 horas de mojado foliar con temperaturas entre 10 °C y 35 °C.',
          'Moderado: entre 4 y 8 horas de mojado foliar con temperaturas entre 20 °C y 28 °C.',
          'Ligero: entre 4 y 8 horas de mojado foliar con temperaturas entre 10 °C y 35 °C.'
        ].join('\n');
      case 10:
        return [
          'Condiciones predisponentes para desarrollo de tizón foliar (Exserohilum turcicum).',
          'Muy alto: más de 12 horas de mojado foliar con temperaturas entre 24 °C y 28 °C.',
          'Alto: más de 12 horas de mojado foliar con temperaturas entre 20 °C y 32 °C.',
          'Alto: entre 6 y 12 horas de mojado foliar con temperaturas entre 24 °C y 28 °C.',
          'Moderado: entre 6 y 12 horas de mojado foliar con temperaturas entre 20 °C y 32 °C.',
          'Moderado: entre 2 y 6 horas de mojado foliar con temperaturas entre 24 °C y 28 °C.',
          'Ligero: entre 2 y 6 horas de mojado foliar con temperaturas entre 20 °C y 32 °C.'
        ].join('\n');
      case 11:
        return [
          'Condiciones predisponentes para desarrollo de Roya polisora (Puccinia polysora).',
          'Muy alto: más de 12 horas de mojado foliar con temperaturas entre 22 °C y 24 °C.',
          'Alto: más de 12 horas de mojado foliar con temperaturas entre 21 °C y 27 °C.',
          'Alto: entre 6 y 12 horas de mojado foliar con temperaturas entre 22 °C y 24 °C.',
          'Moderado: más de 12 horas de mojado foliar con temperaturas entre 16 °C y 33 °C.',
          'Moderado: entre 8 y 12 horas de mojado foliar con temperaturas entre 21 °C y 27 °C.',
          'Ligero: entre 8 y 12 horas de mojado foliar con temperaturas entre 16 °C y 33 °C.'
        ].join('\n');
      case 14:
        return [
          'Condiciones predisponentes para roya estriada en trigo.',
          'Apto para el desarrollo: más de 3 horas de mojado foliar con temperaturas entre 10 °C y 20 °C.'
        ].join('\n');
      case 15:
        return [
          'Condiciones predisponentes para desarrollo de mancha gris (Cercospora zeae-maydis).',
          'Si: más de 12 horas de mojado foliar con temperaturas entre 22 °C y 30 °C.'
        ].join('\n');
      case 16:
        return [
          'Condiciones predisponentes para desarrollo de fusarium (Fusarium graminearum).',
          'Si: más de 20 horas de mojado foliar con temperaturas entre 25 °C y 28 °C.'
        ].join('\n');
      default:
        return this.diseaseHelp(diseaseCode);
    }
  }

  stationLabel(stationId: string): string {
    const station = this.stations.find(item => item.Identificacion === stationId);
    return station ? `${station.Identificacion} - ${station.nombre}` : stationId;
  }

  formatDisplayDate(date: string): string {
    const [year, month, day] = date.split('-');
    return `${day}/${month}/${year}`;
  }

  rowTrackBy(_: number, row: DiseaseResultRow): string {
    return row.date;
  }

  private resetReport(): void {
    this.rows = [];
    this.columns = [];
    this.summaryItems = [];
  }

  private getColumns(diseaseCode: number): DiseaseColumn[] {
    switch (diseaseCode) {
      case 1:
        return [
          { key: 'wetHours', label: 'Hs mojado', align: 'right' },
          { key: 'wetTemp', label: 'Temp. mojado', align: 'right' },
          { key: 'humHighHours', label: 'Hs HR >= 90%', align: 'right' },
          { key: 'rain', label: 'Lluvia (mm)', align: 'right' }
        ];
      case 2:
      case 5:
      case 15:
      case 16:
        return [
          { key: 'favHours', label: 'Hs favorables', align: 'right' },
          { key: 'rain', label: 'Lluvia (mm)', align: 'right' }
        ];
      case 3:
        return [
          { key: 'wetHours', label: 'Hs mojado', align: 'right' },
          { key: 'wetTemp', label: 'Temp. mojado', align: 'right' },
          { key: 'windMax', label: 'Viento max.', align: 'right' },
          { key: 'rain', label: 'Lluvia (mm)', align: 'right' }
        ];
      case 4:
        return [
          { key: 'infHours', label: 'Hs infeccion', align: 'right' },
          { key: 'gerHours', label: 'Hs germinacion', align: 'right' },
          { key: 'windMax', label: 'Viento max.', align: 'right' },
          { key: 'rain', label: 'Lluvia (mm)', align: 'right' }
        ];
      case 6:
        return [
          { key: 'infHours', label: 'Hs termicas', align: 'right' },
          { key: 'windMax', label: 'Viento max.', align: 'right' },
          { key: 'rain', label: 'Lluvia (mm)', align: 'right' }
        ];
      case 9:
      case 10:
        return [
          { key: 'wetWide', label: 'Hs rango amplio', align: 'right' },
          { key: 'wetNarrow', label: 'Hs rango optimo', align: 'right' }
        ];
      case 11:
        return [
          { key: 'wetWide', label: 'Hs rango amplio', align: 'right' },
          { key: 'wetMid', label: 'Hs rango medio', align: 'right' },
          { key: 'wetNarrow', label: 'Hs rango optimo', align: 'right' }
        ];
      case 14:
        return [
          { key: 'aptHours', label: 'Hs aptas', align: 'right' }
        ];
      default:
        return [];
    }
  }

  private buildSummaryItems(diseaseCode: number, rows: DiseaseResultRow[]): SummaryItem[] {
    if (!rows.length) {
      return [];
    }

    if (diseaseCode === 14) {
      const apt = rows.filter((row) => row.classification === 'APTO').length;
      const notApt = rows.length - apt;
      const totalHours = rows.reduce((acc, row) => acc + this.num(row.values['aptHours']), 0);
      return [
        { label: 'Dias aptos', value: String(apt), tone: 'high' },
        { label: 'Dias no aptos', value: String(notApt), tone: 'low' },
        { label: 'Horas aptas', value: `${this.f1(totalHours)} h`, tone: 'moderate' }
      ];
    }

    const counts = new Map<string, number>();
    rows.forEach((row) => counts.set(row.tone, (counts.get(row.tone) ?? 0) + 1));

    const ordered: Array<{ tone: string; label: string }> = [
      { tone: 'very-high', label: 'Muy alto / positivo' },
      { tone: 'high', label: 'Alto' },
      { tone: 'moderate', label: 'Moderado' },
      { tone: 'mild', label: 'Ligero / transicion' },
      { tone: 'low', label: 'Bajo / no apto' }
    ];

    return ordered
      .filter((item) => counts.has(item.tone))
      .map((item) => ({
        label: item.label,
        value: String(counts.get(item.tone) ?? 0),
        tone: item.tone
      }));
  }

  private buildRow(diseaseCode: number, date: string, records: DiseaseApiRecord[]): DiseaseResultRow {
    switch (diseaseCode) {
      case 1:
        return this.buildSoyRustRow(date, records);
      case 2:
        return this.buildSugarcaneRustRow(date, records);
      case 3:
        return this.buildBrownSpotRow(date, records);
      case 4:
        return this.buildCercosporaRow(date, records);
      case 5:
        return this.buildTargetSpotRow(date, records);
      case 6:
        return this.buildBacterialBlightRow(date, records);
      case 9:
        return this.buildMelanosisRow(date, records);
      case 10:
        return this.buildLeafBlightRow(date, records);
      case 11:
        return this.buildPolysoraRow(date, records);
      case 14:
        return this.buildStripeRustRow(date, records);
      case 15:
        return this.buildGrayLeafSpotRow(date, records);
      case 16:
        return this.buildFusariumRow(date, records);
      default:
        return { date, classification: 'Sin regla', tone: 'low', values: {} };
    }
  }

  private buildSoyRustRow(date: string, records: DiseaseApiRecord[]): DiseaseResultRow {
    const wetHours = this.hours(records, (record) => this.num(record.hum_hoja) > 10);
    const wetTempSum = this.sum(records, (record) => this.num(record.hum_hoja) >= 10 ? this.num(record.temp_af) : 0);
    const wetTemp = wetHours > 0 ? wetTempSum / (wetHours * 4) : 0;
    const humHighHours = this.hours(records, (record) => this.num(record.hum_af) >= 90);
    const rain = this.sum(records, (record) => this.num(record.lluvia));

    let classification = 'BAJO';
    let tone = 'low';

    if (wetHours >= 6 && wetHours < 12) {
      classification = 'LIGERO';
      tone = 'mild';
      if (this.inRange(wetTemp, 19, 24)) {
        classification = 'ALTO';
        tone = 'high';
      } else if (this.inRange(wetTemp, 11, 19) || this.inRange(wetTemp, 24, 28)) {
        classification = 'MODERADO';
        tone = 'moderate';
      }
    } else if (wetHours >= 12) {
      if (this.inRange(wetTemp, 11, 28)) {
        classification = 'ALTO';
        tone = 'high';
      } else {
        classification = 'LIGERO';
        tone = 'mild';
      }
    }

    return {
      date,
      classification,
      tone,
      values: {
        wetHours: this.f1(wetHours),
        wetTemp: this.f1(wetTemp),
        humHighHours: this.f1(humHighHours),
        rain: this.f1(rain)
      }
    };
  }

  private buildSugarcaneRustRow(date: string, records: DiseaseApiRecord[]): DiseaseResultRow {
    const favHours = this.hours(records, (record) =>
      this.inRange(this.num(record.temp_af), 17, 23) &&
      this.num(record.hum_af) >= 90 &&
      this.num(record.hum_hoja) > 9
    );
    const rain = this.sum(records, (record) => this.num(record.lluvia));
    const positive = favHours >= 8;

    return {
      date,
      classification: positive ? 'SI' : 'NO',
      tone: positive ? 'high' : 'low',
      values: {
        favHours: this.f1(favHours),
        rain: this.f1(rain)
      }
    };
  }

  private buildBrownSpotRow(date: string, records: DiseaseApiRecord[]): DiseaseResultRow {
    const wetHours = this.hours(records, (record) => this.num(record.hum_hoja) > 10);
    const wetTempSum = this.sum(records, (record) => this.num(record.hum_hoja) >= 10 ? this.num(record.temp_af) : 0);
    const wetTemp = wetHours > 0 ? wetTempSum / (wetHours * 4) : 0;
    const windMax = this.max(records, (record) => this.num(record.viento_max));
    const rain = this.sum(records, (record) => this.num(record.lluvia));
    const progression = wetHours >= 6 && this.inRange(wetTemp, 15, 30);
    const dispersion = windMax >= 15 || rain >= 5;

    let classification = 'Bajas condiciones';
    let tone = 'low';
    if (progression && dispersion) {
      classification = '(Pro) (Dis)';
      tone = 'high';
    } else if (progression) {
      classification = '(Pro)';
      tone = 'moderate';
    } else if (dispersion) {
      classification = '(Dis)';
      tone = 'mild';
    }

    return {
      date,
      classification,
      tone,
      values: {
        wetHours: this.f1(wetHours),
        wetTemp: this.f1(wetTemp),
        windMax: this.f1(windMax),
        rain: this.f1(rain)
      }
    };
  }

  private buildCercosporaRow(date: string, records: DiseaseApiRecord[]): DiseaseResultRow {
    const infHours = this.hours(records, (record) =>
      this.inRange(this.num(record.temp_af), 24, 32) &&
      this.num(record.hum_af) >= 70
    );
    const gerHours = this.hours(records, (record) => this.num(record.hum_hoja) > 9);
    const windMax = this.max(records, (record) => this.num(record.viento_max));
    const rain = this.sum(records, (record) => this.num(record.lluvia));
    const dispersion = windMax >= 15 || rain >= 5;

    const pieces: string[] = [];
    let tone = 'low';
    if (infHours >= 6) {
      pieces.push('(Inf)');
      tone = 'moderate';
    }
    if (gerHours >= 6) {
      pieces.push('(Ger)');
      tone = 'high';
    }
    if (dispersion) {
      pieces.push('(Dis)');
      tone = pieces.length > 1 ? 'very-high' : 'mild';
    }

    return {
      date,
      classification: pieces.length ? pieces.join(' ') : 'NO',
      tone: pieces.length ? tone : 'low',
      values: {
        infHours: this.f1(infHours),
        gerHours: this.f1(gerHours),
        windMax: this.f1(windMax),
        rain: this.f1(rain)
      }
    };
  }

  private buildTargetSpotRow(date: string, records: DiseaseApiRecord[]): DiseaseResultRow {
    const favHours = this.hours(records, (record) =>
      this.inRange(this.num(record.temp_af), 18, 21) &&
      this.num(record.hum_af) >= 80 &&
      this.num(record.hum_hoja) > 9
    );
    const rain = this.sum(records, (record) => this.num(record.lluvia));
    const positive = favHours >= 24;

    return {
      date,
      classification: positive ? '(Inf)' : 'NO',
      tone: positive ? 'high' : 'low',
      values: {
        favHours: this.f1(favHours),
        rain: this.f1(rain)
      }
    };
  }

  private buildBacterialBlightRow(date: string, records: DiseaseApiRecord[]): DiseaseResultRow {
    const infHours = this.hours(records, (record) => this.inRange(this.num(record.temp_af), 20, 26));
    const windMax = this.max(records, (record) => this.num(record.viento_max));
    const rain = this.sum(records, (record) => this.num(record.lluvia));
    const positive = infHours >= 6 && windMax >= 15 && rain >= 0.5;

    return {
      date,
      classification: positive ? '(Inf)' : 'NO',
      tone: positive ? 'high' : 'low',
      values: {
        infHours: this.f1(infHours),
        windMax: this.f1(windMax),
        rain: this.f1(rain)
      }
    };
  }

  private buildMelanosisRow(date: string, records: DiseaseApiRecord[]): DiseaseResultRow {
    const wetWide = this.hours(records, (record) =>
      this.num(record.hum_hoja) >= 10 && this.inRange(this.num(record.temp_af), 10, 35)
    );
    const wetNarrow = this.hours(records, (record) =>
      this.num(record.hum_hoja) >= 10 && this.inRange(this.num(record.temp_af), 20, 28)
    );
    const { classification, tone } = this.scaleRisk(wetWide, wetNarrow);

    return {
      date,
      classification,
      tone,
      values: {
        wetWide: this.f1(wetWide),
        wetNarrow: this.f1(wetNarrow)
      }
    };
  }

  private buildLeafBlightRow(date: string, records: DiseaseApiRecord[]): DiseaseResultRow {
    const wetWide = this.hours(records, (record) =>
      this.num(record.hum_hoja) >= 10 && this.inRange(this.num(record.temp_af), 20, 32)
    );
    const wetNarrow = this.hours(records, (record) =>
      this.num(record.hum_hoja) >= 10 && this.inRange(this.num(record.temp_af), 24, 28)
    );
    const { classification, tone } = this.scaleRisk(wetWide, wetNarrow, 2, 6, 2, 12, 6, 12);

    return {
      date,
      classification,
      tone,
      values: {
        wetWide: this.f1(wetWide),
        wetNarrow: this.f1(wetNarrow)
      }
    };
  }

  private buildPolysoraRow(date: string, records: DiseaseApiRecord[]): DiseaseResultRow {
    const wetWide = this.hours(records, (record) =>
      this.num(record.hum_hoja) >= 10 && this.inRange(this.num(record.temp_af), 16, 33)
    );
    const wetMid = this.hours(records, (record) =>
      this.num(record.hum_hoja) >= 10 && this.inRange(this.num(record.temp_af), 21, 27)
    );
    const wetNarrow = this.hours(records, (record) =>
      this.num(record.hum_hoja) >= 10 && this.inRange(this.num(record.temp_af), 22, 24)
    );
    const { classification, tone } = this.scalePolisora(wetWide, wetMid, wetNarrow);

    return {
      date,
      classification,
      tone,
      values: {
        wetWide: this.f1(wetWide),
        wetMid: this.f1(wetMid),
        wetNarrow: this.f1(wetNarrow)
      }
    };
  }

  private buildStripeRustRow(date: string, records: DiseaseApiRecord[]): DiseaseResultRow {
    const aptHours = this.hours(records, (record) =>
      this.num(record.hum_hoja) >= 10 && this.inRange(this.num(record.temp_af), 10, 20)
    );
    const apt = aptHours >= 3;

    return {
      date,
      classification: apt ? 'APTO' : 'NO APTO',
      tone: apt ? 'high' : 'low',
      values: {
        aptHours: this.f1(aptHours)
      }
    };
  }

  private buildGrayLeafSpotRow(date: string, records: DiseaseApiRecord[]): DiseaseResultRow {
    const favHours = this.hours(records, (record) =>
      this.num(record.hum_hoja) >= 10 && this.inRange(this.num(record.temp_af), 22, 30)
    );
    const rain = this.sum(records, (record) => this.num(record.lluvia));
    const positive = favHours >= 12;

    return {
      date,
      classification: positive ? 'SI' : 'NO',
      tone: positive ? 'high' : 'low',
      values: {
        favHours: this.f1(favHours),
        rain: this.f1(rain)
      }
    };
  }

  private buildFusariumRow(date: string, records: DiseaseApiRecord[]): DiseaseResultRow {
    const favHours = this.hours(records, (record) =>
      this.num(record.hum_hoja) >= 10 && this.inRange(this.num(record.temp_af), 25, 28)
    );
    const rain = this.sum(records, (record) => this.num(record.lluvia));
    const positive = favHours >= 20;

    return {
      date,
      classification: positive ? 'SI' : 'NO',
      tone: positive ? 'very-high' : 'low',
      values: {
        favHours: this.f1(favHours),
        rain: this.f1(rain)
      }
    };
  }

  private scaleRisk(
    wetWide: number,
    wetNarrow: number,
    lightWide = 4,
    moderateWide = 8,
    moderateNarrow = 4,
    highWide = 12,
    highNarrow = 8,
    veryHighNarrow = 12
  ): { classification: string; tone: string } {
    let classification = 'Bajo';
    let tone = 'low';

    if (wetWide >= lightWide) {
      classification = 'Ligero';
      tone = 'mild';
    }
    if (wetWide >= moderateWide || wetNarrow >= moderateNarrow) {
      classification = 'Moderado';
      tone = 'moderate';
    }
    if (wetWide >= highWide || wetNarrow >= highNarrow) {
      classification = 'Alto';
      tone = 'high';
    }
    if (wetNarrow >= veryHighNarrow) {
      classification = 'Muy Alto';
      tone = 'very-high';
    }

    return { classification, tone };
  }

  private scalePolisora(wetWide: number, wetMid: number, wetNarrow: number): { classification: string; tone: string } {
    let classification = 'Bajo';
    let tone = 'low';

    if (wetWide >= 8) {
      classification = 'Ligero';
      tone = 'mild';
    }
    if (wetWide >= 12 || wetMid >= 8) {
      classification = 'Moderado';
      tone = 'moderate';
    }
    if (wetMid >= 12 || wetNarrow >= 8) {
      classification = 'Alto';
      tone = 'high';
    }
    if (wetNarrow >= 12) {
      classification = 'Muy Alto';
      tone = 'very-high';
    }

    return { classification, tone };
  }

  private groupRecordsByDate(records: DiseaseApiRecord[]): Map<string, DiseaseApiRecord[]> {
    return records.reduce((map, record) => {
      const date = String(record.fecha ?? '').slice(0, 10);
      if (!date) {
        return map;
      }

      if (!map.has(date)) {
        map.set(date, []);
      }

      map.get(date)?.push(record);
      return map;
    }, new Map<string, DiseaseApiRecord[]>());
  }

  private coerceDate(value: Date | string): Date {
    if (value instanceof Date) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }

    if (typeof value === 'string' && value.includes('/')) {
      const [day, month, year] = value.split('/').map(Number);
      return new Date(year, month - 1, day);
    }

    return new Date(value);
  }

  private formatApiDate(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private num(value: unknown): number {
    const parsed = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private sum(records: DiseaseApiRecord[], mapper: (record: DiseaseApiRecord) => number): number {
    return records.reduce((acc, record) => acc + mapper(record), 0);
  }

  private max(records: DiseaseApiRecord[], mapper: (record: DiseaseApiRecord) => number): number {
    return records.reduce((acc, record) => Math.max(acc, mapper(record)), 0);
  }

  private hours(records: DiseaseApiRecord[], predicate: (record: DiseaseApiRecord) => boolean): number {
    return records.reduce((acc, record) => acc + (predicate(record) ? 0.25 : 0), 0);
  }

  private inRange(value: number, min: number, max: number): boolean {
    return value >= min && value <= max;
  }

  private f1(value: number): string {
    return value.toFixed(1);
  }
}





