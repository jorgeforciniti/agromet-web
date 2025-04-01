import { Component } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatDialogModule } from '@angular/material/dialog';
import { DialogComponent } from './dialog/dialog.component';

@Component({
  selector: 'app-bienvenida',
  imports: [
    MatDialogModule,
  ],
  templateUrl: './bienvenida.component.html',
  styleUrl: './bienvenida.component.css'
})
export class BienvenidaComponent {
  constructor(public dialog: MatDialog) { }

  openDialog(): void {
    const dialogRef = this.dialog.open(DialogComponent, {
      width: '50%', // o '1000px' si querés fijo
      maxWidth: '95vw', // Para evitar que desborde en pantallas pequeñas
      panelClass: 'custom-dialog-container', // clase para CSS adicional si querés
      data: {
        info: 'Información extra para el diálogo'
      }
    });
  }
}
