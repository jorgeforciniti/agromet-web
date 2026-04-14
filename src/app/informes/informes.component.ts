import { Component, OnInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatRadioModule } from '@angular/material/radio';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { DatosService, Informe } from '../services/datos.service';

interface InformeViewModel extends Informe {
  safeArchivo?: SafeResourceUrl;
}

type InformeDialogInput = Partial<InformeViewModel> & {
  nombreOriginal?: string;
  nombre?: string;
  file?: string;
  pdf?: string;
  path?: string;
  url?: string;
};

@Component({
  selector: 'app-informes',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatRadioModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule
  ],
  templateUrl: './informes.component.html',
  styleUrls: ['./informes.component.css']
})
export class InformesComponent implements OnInit {
  datos: InformeViewModel[] = [];
  filteredDatos: InformeViewModel[] = [];

  tiposInformes = [
    { value: '', viewValue: 'Todos' },
    { value: 'll', viewValue: 'Informes de lluvias' },
    { value: 'he', viewValue: 'Informes de heladas' },
    { value: 'bo', viewValue: 'Boletín agrometeorológico' },
    { value: 'co', viewValue: 'Presentaciones en congresos' },
    { value: 'ad', viewValue: 'Seguimiento de adversidades' },
    { value: 'rv', viewValue: 'Artículos en revistas' },
    { value: 'et', viewValue: 'Estadísticas agrometeorológicas' }
  ];

  selectedCategoria = '';

  @ViewChild('scrollContainer', { static: false }) scrollContainer!: ElementRef;

  constructor(
    private datosService: DatosService,
    private sanitizer: DomSanitizer,
    private dialog: MatDialog
  ) { }

  ngOnInit() {
    this.datosService.getInformes().subscribe(resp => {
      this.datos = resp.data.map((inf) => ({
        ...inf,
        safeArchivo: this.sanitizeUrl(inf.archivo)
      }));
      this.applyFilter();
    });
  }

  applyFilter() {
    if (this.selectedCategoria === '') {
      const categorias = ['ll', 'he', 'bo', 'co', 'ad', 'rv', 'et'];
      const agrupados: InformeViewModel[] = [];

      categorias.forEach(cat => {
        const ultimosTres = this.datos
          .filter(i => i.categoria === cat)
          .sort((a, b) => b.creado.localeCompare(a.creado))
          .slice(0, 3);
        agrupados.push(...ultimosTres);
      });

      this.filteredDatos = agrupados.sort((a, b) => b.creado.localeCompare(a.creado));
    } else {
      this.filteredDatos = this.datos
        .filter(i => i.categoria === this.selectedCategoria)
        .sort((a, b) => b.creado.localeCompare(a.creado));
    }
  }

  sanitizeUrl(archivo: string): SafeResourceUrl {
    const url = `https://agromet.eeaoc.gob.ar/PDFS/${archivo}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  }

  async openDialog(informe: InformeDialogInput): Promise<void> {
    const filename =
      informe?.archivo ??
      informe?.nombreOriginal ??
      informe?.nombre ??
      informe?.file ??
      informe?.pdf ??
      informe?.path ??
      informe?.url;

    if (!filename || typeof filename !== 'string') {
      console.error('[openDialog] Informe sin archivo válido:', informe);
      return;
    }

    const pdfUrl = filename.startsWith('http://') || filename.startsWith('https://')
      ? filename
      : `https://agromet.eeaoc.gob.ar/PDFS/${filename.replace(/^\/+/, '')}`;

    const { DialogComponent } = await import('./dialog/dialog.component');

    this.dialog.open(DialogComponent, {
      data: {
        titulo: informe?.titulo ?? 'Informe',
        fecha: informe?.creado,
        archivo: pdfUrl,
        nombreOriginal: filename
      },
      width: 'min(1200px, 96vw)',
      maxWidth: '96vw',
      height: '92vh',
      maxHeight: '92vh',
      panelClass: 'pdf-dialog',
      autoFocus: false,
      restoreFocus: false
    });
  }

  scrollLeft(): void {
    this.scrollContainer.nativeElement.scrollLeft -= 300;
  }

  scrollRight(): void {
    this.scrollContainer.nativeElement.scrollLeft += 300;
  }

  onCategoriaChange(): void {
    this.applyFilter();

    setTimeout(() => {
      if (this.scrollContainer?.nativeElement) {
        this.scrollContainer.nativeElement.scrollLeft = 0;
      }
    }, 50);
  }
}
