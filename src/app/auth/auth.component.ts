import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ReactiveFormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './auth.component.html',
  styleUrls: ['./auth.component.css']
})
export class AuthComponent {
  authForm: FormGroup;
  isLoginMode: boolean = true;

  constructor(private fb: FormBuilder, private authService: AuthService) {
    this.authForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  toggleMode() {
    this.isLoginMode = !this.isLoginMode;
  }

  onSubmit() {
    if (this.authForm.valid) {
      const { email, password } = this.authForm.value;
      if (this.isLoginMode) {
        this.authService.login(email, password).subscribe(response => {
          console.log('Login exitoso', response);
        }, error => {
          console.error('Error en login', error);
        });
      } else {
        this.authService.register(email, password).subscribe(response => {
          console.log('Registro exitoso', response);
        }, error => {
          console.error('Error en registro', error);
        });
      }
    }
  }

}
