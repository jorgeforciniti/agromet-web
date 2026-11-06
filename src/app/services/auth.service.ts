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
  signInWithPopup,
  sendEmailVerification
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

  /** Crea la cuenta y envía el correo para confirmar la dirección (en castellano). */
  async register(email: string, password: string) {
    const credencial = await runInInjectionContext(this.injector, () =>
      createUserWithEmailAndPassword(this.auth, email, password)
    );
    await this.enviarVerificacion(credencial.user);
    return credencial;
  }

  /** (Re)envía el correo de confirmación al usuario actual o al indicado. */
  async enviarVerificacion(usuario: User | null = this.auth.currentUser) {
    if (!usuario || usuario.emailVerified) return;
    this.auth.languageCode = 'es';
    await runInInjectionContext(this.injector, () => sendEmailVerification(usuario));
  }

  /** Relee el usuario desde Firebase (por ejemplo, después de confirmar el email). */
  async recargarUsuario(): Promise<User | null> {
    await this.auth.currentUser?.reload();
    return this.auth.currentUser;
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
    return await runInInjectionContext(this.injector, () => {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      return signInWithPopup(this.auth, provider);
    });
  }

  // ✅ Devuelve un observable del usuario autenticado
  getUserObservable(): Observable<User | null> {
    return runInInjectionContext(this.injector, () => user(this.auth));
  }

  async getCurrentUser(): Promise<User | null> {
    return await firstValueFrom(this.getUserObservable());
  }


}
