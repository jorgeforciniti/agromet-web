import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../services/auth.service';
import { Auth, signInWithPopup, GoogleAuthProvider } from '@angular/fire/auth';
import { MatDialogRef, MatDialogModule } from '@angular/material/dialog';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule], // ✅ Agregamos los módulos necesarios
  templateUrl: './auth.component.html',
  styleUrls: ['./auth.component.css']
})
export class AuthComponent {
  authForm: FormGroup;
  isLoginMode: boolean = true;
  errorMessage: string = '';

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

  toggleMode() {
    this.isLoginMode = !this.isLoginMode;
    this.errorMessage = '';
  }

  async onSubmit() {
    if (this.authForm.valid) {
      const { email, password } = this.authForm.value;
      
      try {
        if (this.isLoginMode) {
          await this.authService.login(email, password);
        } else {
          await this.authService.register(email, password);
        }
        this.dialogRef.close(); 
      } catch (error: any) {
        this.errorMessage = error.message;
        console.error('Error en autenticación', error);
      }
    }
  }

  async loginWithGoogle() {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' }); // ✅ Forzar elección de cuenta
  
    try {
      await signInWithPopup(this.auth, provider);
      this.dialogRef.close();
    } catch (error: any) {
      this.errorMessage = error.message;
      console.error('Error en login con Google', error);
    }
  }

  close() {
    this.dialogRef.close();
  }
}
