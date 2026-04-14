import { CommonModule } from '@angular/common';
import { Component, Inject, SecurityContext } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MatIconModule } from '@angular/material/icon';
import { MatDialogModule } from '@angular/material/dialog';
import { NgxExtendedPdfViewerModule } from 'ngx-extended-pdf-viewer';

interface DialogData {
  archivo: string;          // ✅ solo string
  nombreOriginal: string;
  titulo?: string;
  fecha?: string | Date;
}


@Component({
  standalone: true,
  selector: 'app-dialog',
  imports: [CommonModule, MatIconModule, MatDialogModule, NgxExtendedPdfViewerModule],
  templateUrl: './dialog.component.html',
  styleUrls: ['./dialog.component.css']
})
export class DialogComponent {


  constructor(
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
    public dialogRef: MatDialogRef<DialogComponent>,
    private sanitizer: DomSanitizer
  ) {
    // 1) Normalizar archivo a string
    const url = typeof this.data.archivo === 'string'
  ? this.data.archivo
  : (this.sanitizer.sanitize(SecurityContext.RESOURCE_URL, this.data.archivo) || '');

if (!url || url === 'undefined') {
  console.error('[Dialog] archivo inválido:', this.data.archivo);
  this.data.archivo = '';
  return;
}

const base = 'https://agromet.eeaoc.gob.ar/PDFS/';
const finalUrl =
  url.startsWith('http://') || url.startsWith('https://')
    ? url
    : base + url.replace(/^\/+/, '');

this.data.archivo = finalUrl;

  }

  get formattedDate(): string {
    if (!this.data.fecha) return '';

    try {
      const date = new Date(this.data.fecha);
      return isNaN(date.getTime())
        ? 'Fecha inválida'
        : date.toLocaleDateString('es-AR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
    } catch {
      return 'Fecha inválida';
    }
  }

  async downloadPdf(): Promise<void> {
    const url = typeof this.data.archivo === 'string'
      ? this.data.archivo
      : (this.sanitizer.sanitize(SecurityContext.RESOURCE_URL, this.data.archivo) || '');

    try {
      const res = await fetch(url, { mode: 'cors' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = this.data.nombreOriginal || 'informe.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      // fallback: abrir en pestaña si no se puede descargar por CORS
      window.open(url, '_blank', 'noopener');
    }
  }

  close(): void {
    this.dialogRef.close();
  }
}