import { CommonModule } from '@angular/common';
import { Component, Inject, SecurityContext } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

interface DialogData {
  archivo: SafeResourceUrl | string;  // Acepta ambos tipos
  nombreOriginal: string;
  titulo?: string;
  fecha?: string | Date;
}

@Component({
  standalone: true,
  selector: 'app-dialog',
  imports: [CommonModule],
  templateUrl: './dialog.component.html',
  styleUrls: ['./dialog.component.css']
})
export class DialogComponent {
  safePdfUrl: SafeResourceUrl;

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: DialogData,
    public dialogRef: MatDialogRef<DialogComponent>,
    private sanitizer: DomSanitizer
  ) {
    // Convierte SafeResourceUrl a string o usa el string directamente
    const baseUrl = typeof this.data.archivo === 'string' 
      ? this.data.archivo 
      : this.sanitizer.sanitize(SecurityContext.RESOURCE_URL, this.data.archivo) || '';

    // Añade parámetros de visualización y sanitiza
    this.safePdfUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
      `${baseUrl}#toolbar=0&navpanes=0&scrollbar=0`
    );
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

  closeDialog(): void {
    this.dialogRef.close();
  }
}