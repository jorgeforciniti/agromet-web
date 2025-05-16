import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { DatosService } from '../services/datos.service';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MatDialog } from '@angular/material/dialog';
import { MatDialogModule } from '@angular/material/dialog';
import { DialogComponent } from './dialog/dialog.component';

interface Informe {
  archivo: string;
  safeArchivo: SafeResourceUrl;
  titulo: string;
  fecha: string;
}

@Component({
  selector: 'app-informes',
  standalone: true,
  imports: [CommonModule,
    MatDialogModule,
  ],
  templateUrl: './informes.component.html',
  styleUrls: ['./informes.component.css']
})
export class InformesComponent implements OnInit {
  datos: Informe[] = [];

  @ViewChild('scrollContainer', { static: false }) scrollContainer!: ElementRef;

  constructor(
    private datosService: DatosService,
    private sanitizer: DomSanitizer,
    public dialog: MatDialog
  ) { }

  ngOnInit() {
    this.cargarInformes();
  }

  private cargarInformes(): void {
    this.datosService.getInformes().subscribe({
      next: (res: any[]) => {
        this.datos = this.procesarDatos(res);
      },
      error: (err) => {
        console.error('Error al obtener informes:', err);
      }
    });
  }

  private procesarDatos(response: any): Informe[] {
    const datos = response.data || [];
    return datos.map((item: any) => ({
      archivo: item.archivo || '',
      fecha: item.creado || 'Fecha no disponible',
      titulo: item.titulo || 'Sin título',
      safeArchivo: this.generarUrlSegura(item.archivo)
    }));
  }
  
  private generarUrlSegura(nombreArchivo: string): SafeResourceUrl {
    const urlBase = "https://agromet.eeaoc.gob.ar/PDFS/";
    return this.sanitizer.bypassSecurityTrustResourceUrl(urlBase + nombreArchivo);
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
        fecha: informe?.fecha
      }
    });
  }

  // Métodos para el scroll horizontal
  scrollLeft(): void {
    this.scrollContainer.nativeElement.scrollBy({ left: -300, behavior: 'smooth' });
  }

  scrollRight(): void {
    this.scrollContainer.nativeElement.scrollBy({ left: 300, behavior: 'smooth' });
  }
}
