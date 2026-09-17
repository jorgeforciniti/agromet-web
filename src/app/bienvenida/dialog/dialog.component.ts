import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

interface WelcomeDialogData {
  [key: string]: unknown;
}

@Component({
  selector: 'app-dialog',
  imports: [MatIconModule],
  templateUrl: './dialog.component.html',
  styleUrl: './dialog.component.css'
})
export class DialogComponent {
  constructor(@Inject(MAT_DIALOG_DATA) public data: WelcomeDialogData, public dialogRef: MatDialogRef<DialogComponent>) { }
  
  closeDialog(): void {
    this.dialogRef.close();  // Cierra el diálogo
  }
}
