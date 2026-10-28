import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { Subscription } from 'rxjs';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule, MatDialogModule],
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css']
})
export class NavbarComponent implements OnInit, OnDestroy {
  userEmail: string | null = null;
  /** Cuenta con correo y contraseña cuyo email todavía no se confirmó */
  emailSinConfirmar = false;
  reenvio: 'listo' | 'enviando' | 'enviado' | 'error' = 'listo';
  private userSubscription!: Subscription;

  constructor(private authService: AuthService, private dialog: MatDialog) {}

  ngOnInit() {
    this.userSubscription = this.authService.getUserObservable().subscribe(user => {
      this.userEmail = user?.displayName || user?.email || null; // Guarda el email del usuario autenticado
      // Las cuentas de Google ya llegan verificadas; sólo aplica a correo y contraseña
      this.emailSinConfirmar = !!user && !user.emailVerified
        && user.providerData.some(p => p.providerId === 'password');
    });
  }

  async reenviarVerificacion(): Promise<void> {
    this.reenvio = 'enviando';
    try {
      // Si ya la confirmó en otra pestaña, alcanza con releer el usuario
      const usuario = await this.authService.recargarUsuario();
      if (usuario?.emailVerified) {
        this.emailSinConfirmar = false;
        return;
      }
      await this.authService.enviarVerificacion(usuario);
      this.reenvio = 'enviado';
    } catch {
      this.reenvio = 'error';
    }
  }

  logout() {
    this.authService.logout();
  }

  async openAuthDialog(): Promise<void> {
    const { AuthComponent } = await import('../../auth/auth.component');

    // Ancho fluido y alto automático: con 400×550 fijos el formulario se cortaba en teléfonos.
    // Sin disableClose, para que Escape y el fondo cierren el diálogo como en el resto del sitio.
    this.dialog.open(AuthComponent, {
      width: 'min(460px, 94vw)',
      maxWidth: '94vw',
      maxHeight: 'calc(100dvh - 32px)',
      panelClass: 'auth-dialog'
    });
  }

  ngOnDestroy() {
    if (this.userSubscription) {
      this.userSubscription.unsubscribe();
    }
  }
}
