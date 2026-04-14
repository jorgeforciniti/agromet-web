import { Component, Inject, OnInit } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-alert-instruction-dialog',
  standalone: true,
  imports: [CommonModule, MatButtonModule],
  template: `
    <div class="instr-wrap">
      <h2 class="instr-title">Instrucciones</h2>

      <ol class="instr-list" *ngIf="lines.length; else empty">
        <li *ngFor="let line of lines">{{ line }}</li>
      </ol>

      <ng-template #empty>
        <p class="instr-empty">Sin instrucciones disponibles.</p>
      </ng-template>

      <div class="instr-actions">
        <button mat-button class="instr-close" (click)="close()">Cerrar</button>
      </div>
    </div>
  `,
  // Importante: NO estilos oscuros inline acá
  styles: []
})
export class AlertInstructionDialogComponent implements OnInit {
  lines: string[] = [];

  constructor(
    @Inject(MAT_DIALOG_DATA) public data: { instruction: string },
    private dialogRef: MatDialogRef<AlertInstructionDialogComponent>
  ) {}

  ngOnInit(): void {
    const raw = (this.data?.instruction ?? '').split('\n');

    this.lines = raw
      .map(l => l.trim())
      .filter(Boolean)
      // Quita "1-" / "1." / "1)" etc al inicio
      .map(l => l.replace(/^\s*\d+\s*[-.)]\s*/, ''));
  }

  close(): void {
    this.dialogRef.close();
  }
}