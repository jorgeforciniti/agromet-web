import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

interface YieldBreakdown {
  seedsPerMeter: number;
  rawYield: number;
  moistureFactor: number;
  moistureAdjustment: number;
  estimatedYield: number;
}

@Component({
  selector: 'app-soy-yield-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './soy-yield-dialog.component.html',
  styleUrls: ['./soy-yield-dialog.component.css']
})
export class SoyYieldDialogComponent {
  readonly form;
  result: YieldBreakdown | null = null;

  constructor(
    private fb: FormBuilder,
    private dialogRef: MatDialogRef<SoyYieldDialogComponent>
  ) {
    this.form = this.fb.nonNullable.group({
      s1: [0, [Validators.required, Validators.min(0), Validators.max(500)]],
      s2: [0, [Validators.required, Validators.min(0), Validators.max(500)]],
      s3: [0, [Validators.required, Validators.min(0), Validators.max(500)]],
      s4: [0, [Validators.required, Validators.min(0), Validators.max(500)]],
      ps: [150, [Validators.required, Validators.min(50), Validators.max(200)]],
      hg: [13.5, [Validators.required, Validators.min(7), Validators.max(20)]]
    });

    this.result = this.calculateCurrentResult();
    this.form.valueChanges.subscribe(() => {
      this.result = this.calculateCurrentResult();
    });
  }

  calculate(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.result = null;
      return;
    }

    this.result = this.calculateCurrentResult();
  }

  close(): void {
    this.dialogRef.close();
  }

  fieldError(fieldName: keyof typeof this.form.controls): string {
    const field = this.form.controls[fieldName];
    if (!field.touched && !field.dirty) {
      return '';
    }

    if (field.hasError('required')) {
      return 'Campo obligatorio';
    }

    if (field.hasError('min') || field.hasError('max')) {
      switch (fieldName) {
        case 'ps':
          return 'Valor permitido: 50 a 200 g';
        case 'hg':
          return 'Valor permitido: 7 a 20 %';
        default:
          return 'Valor permitido: 0 a 500';
      }
    }

    return 'Valor inválido';
  }

  private calculateCurrentResult(): YieldBreakdown | null {
    if (this.form.invalid) {
      return null;
    }

    const { s1, s2, s3, s4, ps, hg } = this.form.getRawValue();

    const seedsPerMeter = s1 + s2 * 2 + s3 * 3 + s4 * 4;
    const rawYield = ((seedsPerMeter * 100 * 192) * (ps / 1000)) / 1000;

    let moistureFactor: number;
    if (hg > 13.5) {
      moistureFactor = (hg - 13.6) * 1.15 + 0.685;
    } else {
      moistureFactor = (13.4 - hg) * 1.15 + 0.685;
    }

    const moistureAdjustment = hg === 13.5 ? 0 : (rawYield * moistureFactor) / 100;
    const estimatedYield = hg > 13.5
      ? rawYield - moistureAdjustment
      : rawYield + moistureAdjustment;

    return {
      seedsPerMeter,
      rawYield,
      moistureFactor,
      moistureAdjustment,
      estimatedYield
    };
  }
}
