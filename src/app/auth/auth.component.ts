import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../services/auth.service';
import { Auth, signInWithPopup, GoogleAuthProvider } from '@angular/fire/auth';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, MatIconModule],
  templateUrl: './auth.component.html',
  styleUrls: ['./auth.component.css']
})
export class AuthComponent {
  authForm: FormGroup;
  isLoginMode = true;
  errorMessage = '';
  successMessage = '';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private auth: Auth,
    private dialogRef: MatDialogRef<AuthComponent>
  ) {
    this.authForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Ocurrió un error inesperado';
  }

  toggleMode(): void {
    this.isLoginMode = !this.isLoginMode;
    this.errorMessage = '';
    this.successMessage = '';
  }

  async onSubmit(): Promise<void> {
    if (!this.authForm.valid) {
      this.authForm.markAllAsTouched();
      return;
    }

    const { email, password } = this.authForm.value;

    this.errorMessage = '';
    this.successMessage = '';

    try {
      if (this.isLoginMode) {
        await this.authService.login(email, password);
      } else {
        await this.authService.register(email, password);
      }
      this.dialogRef.close();
    } catch (error: unknown) {
      this.errorMessage = this.getErrorMessage(error);
      console.error('Error en autenticación', error);
    }
  }

  async loginWithGoogle(): Promise<void> {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
      await signInWithPopup(this.auth, provider);
      this.dialogRef.close();
    } catch (error: unknown) {
      this.errorMessage = this.getErrorMessage(error);
      console.error('Error en login con Google', error);
    }
  }

  close(): void {
    this.dialogRef.close();
  }

  async forgotPassword(): Promise<void> {
    const email = this.authForm.get('email')?.value;

    this.errorMessage = '';
    this.successMessage = '';

    if (!email) {
      this.errorMessage = 'Ingrese su correo electrónico para recuperar la contraseña.';
      this.authForm.get('email')?.markAsTouched();
      return;
    }

    if (this.authForm.get('email')?.invalid) {
      this.errorMessage = 'Ingrese un correo electrónico válido.';
      this.authForm.get('email')?.markAsTouched();
      return;
    }

    try {
      await this.authService.resetPassword(email);
      this.successMessage = 'Le enviamos un correo con las instrucciones para restablecer su contraseña.';
    } catch (error: unknown) {
      this.errorMessage = this.getErrorMessage(error);
      console.error('Error al restablecer contraseña', error);
    }
  }
}