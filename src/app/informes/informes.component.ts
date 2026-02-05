import { Component, OnInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatRadioModule } from '@angular/material/radio';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { DatosService } from '../services/datos.service';
import { DialogComponent } from './dialog/dialog.component';

interface Informe {
  id: number;
  titulo: string;
  archivo: string;
  creado: string;
  categoria: string;
  posicion: number;
  url_img: string;
  safeArchivo?: SafeResourceUrl;
}

@Component({
  selector: 'app-informes',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatRadioModule,
    MatDialogModule,
    MatFormFieldModule
  ],
  templateUrl: './informes.component.html',
  styleUrls: ['./informes.component.css']
})
export class InformesComponent implements OnInit {
  datos: Informe[] = [];
  filteredDatos: Informe[] = [];

  tiposInformes = [
    { value: 'll', viewValue: 'Informes de lluvias' },
    { value: 'he', viewValue: 'Informes de heladas' },
    { value: 'bo', viewValue: 'Boletín agrometeorológico' },
    { value: 'co', viewValue: 'Presentaciones en congresos' },
    { value: 'ad', viewValue: 'Seguimiento de adversidades' },
    { value: 'rv', viewValue: 'Artículos en revistas' },
    { value: 'et', viewValue: 'Estadísticas agrometeorológicas' }
  ];

  selectedCategoria = 'll';

  @ViewChild('scrollContainer', { static: false }) scrollContainer!: ElementRef;

  constructor(
    private datosService: DatosService,
    private sanitizer: DomSanitizer,
    private dialog: MatDialog
  ) {}

  ngOnInit() {
    this.datosService.getInformes().subscribe(resp => {
      this.datos = resp.data.map((inf: Informe) => ({
        ...inf,
        safeArchivo: this.sanitizeUrl(inf.archivo)
      }));
      this.applyFilter();
    });
  }

  applyFilter() {
    this.filteredDatos = this.datos.filter(i => i.categoria === this.selectedCategoria);
  }

  sanitizeUrl(archivo: string): SafeResourceUrl {
    const url = `https://agromet.eeaoc.gob.ar/PDFS/${archivo}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  onCategoriaChange() {
    this.applyFilter();
  }

  openDialog(nombreArchivo: string): void {
    const informe = this.datos.find(item => item.archivo === nombreArchivo);
    this.dialog.open(DialogComponent, {
      width: '80vw',
      height: '90vw',
      maxWidth: '95vw',
      panelClass: 'custom-dialog-container',
      data: {
        archivo: informe?.safeArchivo,
        nombreOriginal: nombreArchivo,
        titulo: informe?.titulo,
        fecha: informe?.creado
      }
    });
  }

  scrollLeft(): void {
    this.scrollContainer.nativeElement.scrollBy({ left: -300, behavior: 'smooth' });
  }

  scrollRight(): void {
    this.scrollContainer.nativeElement.scrollBy({ left: 300, behavior: 'smooth' });
  }
}
