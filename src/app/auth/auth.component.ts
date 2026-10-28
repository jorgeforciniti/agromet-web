import { Component, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../services/auth.service';
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
  /** Se acaba de registrar: en vez del formulario se muestra el aviso y "Continuar" */
  cuentaCreada = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    @Optional() private dialogRef: MatDialogRef<AuthComponent> | null
  ) {
    this.authForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  /** Mensajes de Firebase en castellano (los originales vienen en inglés y con el código) */
  private getErrorMessage(error: unknown): string {
    const codigo = (error as { code?: string } | null)?.code ?? '';
    const mensajes: Record<string, string> = {
      'auth/email-already-in-use': 'Ya existe una cuenta con ese correo. Iniciá sesión o recuperá la contraseña.',
      'auth/invalid-email': 'El correo electrónico no es válido.',
      'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
      'auth/invalid-credential': 'Correo o contraseña incorrectos.',
      'auth/wrong-password': 'Correo o contraseña incorrectos.',
      'auth/user-not-found': 'No hay una cuenta con ese correo.',
      'auth/user-disabled': 'La cuenta está deshabilitada.',
      'auth/too-many-requests': 'Demasiados intentos. Esperá unos minutos y volvé a probar.',
      'auth/network-request-failed': 'No hay conexión. Revisá tu red y volvé a intentar.',
      'auth/popup-closed-by-user': 'Se cerró la ventana de Google antes de terminar.',
      'auth/popup-blocked': 'El navegador bloqueó la ventana de Google. Permití las ventanas emergentes.'
    };
    return mensajes[codigo] ?? 'No se pudo completar la operación. Volvé a intentar.';
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
        this.finish();
      } else {
        // La cuenta queda creada y con sesión iniciada; se avisa que confirme el correo
        await this.authService.register(email, password);
        this.cuentaCreada = true;
        this.successMessage = `Cuenta creada. Te enviamos un correo a ${email} para confirmar la dirección `
          + '(revisá también la carpeta de correo no deseado).';
      }
    } catch (error: unknown) {
      this.errorMessage = this.getErrorMessage(error);
      console.error('Error en autenticación', error);
    }
  }

  async loginWithGoogle(): Promise<void> {
    try {
      await this.authService.loginWithGoogle();
      this.finish();
    } catch (error: unknown) {
      this.errorMessage = this.getErrorMessage(error);
      console.error('Error en login con Google', error);
    }
  }

  close(): void {
    this.finish();
  }

  continuar(): void {
    this.finish();
  }

  /** Como diálogo, lo cierra; como página (/auth), vuelve a returnUrl o al inicio. */
  private finish(): void {
    if (this.dialogRef) {
      this.dialogRef.close();
      return;
    }
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    this.router.navigateByUrl(returnUrl?.startsWith('/') ? returnUrl : '/');
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