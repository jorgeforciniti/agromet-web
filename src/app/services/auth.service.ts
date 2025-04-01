import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  login(email: string, password: string): Observable<any> {
    console.log(`Autenticando usuario: ${email}`);
    return of({ message: 'Login exitoso', token: 'fake-jwt-token' });
  }

  register(email: string, password: string): Observable<any> {
    console.log(`Registrando usuario: ${email}`);
    return of({ message: 'Registro exitoso', user: { email } });
  }
}