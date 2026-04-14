import { inject, Injectable } from '@angular/core';
import { Auth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, User } from '@angular/fire/auth';
import { user } from 'rxfire/auth';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})

export class AuthService {
  
  private auth = inject(Auth); // ✅ en vez de usar constructor

  async login(email: string, password: string) {
    return await signInWithEmailAndPassword(this.auth, email, password);
  }

  async register(email: string, password: string) {
    return await createUserWithEmailAndPassword(this.auth, email, password);
  }

  // ✅ Devuelve un observable del usuario autenticado
  getUserObservable(): Observable<User | null> {
    return user(this.auth);
  }

  // ✅ Método para cerrar sesión
  async logout() {
    return await signOut(this.auth);
  }
}
