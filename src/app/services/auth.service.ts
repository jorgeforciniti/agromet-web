import { inject, Injectable, Injector, runInInjectionContext } from '@angular/core';
import {
  Auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  User,
  user,
  GoogleAuthProvider,
  signInWithPopup
} from '@angular/fire/auth';
import { Observable, firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root'
})

export class AuthService {

  private auth = inject(Auth); // ✅ en vez de usar constructor
  private injector = inject(Injector);

  async login(email: string, password: string) {
    return await runInInjectionContext(this.injector, () =>
      signInWithEmailAndPassword(this.auth, email, password)
    );
  }

  async register(email: string, password: string) {
    return await runInInjectionContext(this.injector, () =>
      createUserWithEmailAndPassword(this.auth, email, password)
    );
  }

  async resetPassword(email: string) {
    return await runInInjectionContext(this.injector, () =>
      sendPasswordResetEmail(this.auth, email)
    );
  }

  async logout() {
    return await runInInjectionContext(this.injector, () =>
      signOut(this.auth)
    );
  }

  async loginWithGoogle() {
    const provider = new GoogleAuthProvider();

    return await runInInjectionContext(this.injector, () =>
      signInWithPopup(this.auth, provider)
    );
  }

  // ✅ Devuelve un observable del usuario autenticado
  getUserObservable(): Observable<User | null> {
    return user(this.auth);
  }

  async getCurrentUser(): Promise<User | null> {
    return await firstValueFrom(this.getUserObservable());
  }


}
