import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { DatosService, Informe } from '../services/datos.service';
import { ScrollRevealDirective } from '../directives/scroll-reveal.directive';

type InformeDialogInput = Partial<Informe> & {
  nombreOriginal?: string;
  nombre?: string;
  file?: string;
  pdf?: string;
  path?: string;
  url?: string;
};

interface CategoryMeta {
  label: string;
  color: string;
}

@Component({
  selector: 'app-informes',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatIconModule,
    ScrollRevealDirective
  ],
  templateUrl: './informes.component.html',
  styleUrls: ['./informes.component.css']
})
export class InformesComponent implements OnInit {
  datos: Informe[] = [];
  filteredDatos: Informe[] = [];

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

  private readonly categoryMeta: Record<string, CategoryMeta> = {
    ll: { label: 'Lluvias', color: '#2563eb' },
    he: { label: 'Heladas', color: '#7c3aed' },
    bo: { label: 'Boletín', color: '#4f7932' },
    co: { label: 'Congresos', color: '#64748b' },
    ad: { label: 'Adversidades', color: '#dc2626' },
    rv: { label: 'Revistas', color: '#db2777' },
    et: { label: 'Estadísticas', color: '#0d9488' }
  };

  selectedCategoria = '';
  loading = true;

  constructor(
    private datosService: DatosService,
    private dialog: MatDialog
  ) { }

  ngOnInit() {
    this.datosService.getInformes().subscribe({
      next: resp => {
        this.datos = resp.data;
        this.applyFilter();
        this.loading = false;
      },
      error: () => {
        this.loading = false;
      }
    });
  }

  selectCategoria(value: string): void {
    this.selectedCategoria = value;
    this.applyFilter();
  }

  applyFilter() {
    if (this.selectedCategoria === '') {
      const categorias = ['ll', 'he', 'bo', 'co', 'ad', 'rv', 'et'];
      const agrupados: Informe[] = [];

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

  categoriaLabel(categoria: string): string {
    return this.categoryMeta[categoria]?.label ?? categoria;
  }

  chipColor(categoria: string): string {
    if (!categoria) {
      return 'var(--brand)';
    }
    return this.categoryMeta[categoria]?.color ?? 'var(--mod-reports)';
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
}
