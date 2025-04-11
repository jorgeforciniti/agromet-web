import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { Subscription } from 'rxjs';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { AuthComponent } from '../../auth/auth.component'; // ✅ Importa el componente de login

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule, MatDialogModule], // ✅ Agregar MatDialogModule
  templateUrl: './navbar.component.html',
  styleUrls: ['./navbar.component.css']
})
export class NavbarComponent implements OnInit, OnDestroy {
  userEmail: string | null = null;
  private userSubscription!: Subscription;

  constructor(private authService: AuthService, private dialog: MatDialog) {} // ✅ Inyectar MatDialog

  ngOnInit() {
    this.userSubscription = this.authService.getUserObservable().subscribe(user => {
      this.userEmail = user?.displayName || user?.email || null; // Guarda el email del usuario autenticado
      console.log('Usuario autenticado:', user);
      console.log('Usuario autenticado:', this.userEmail);
    });
  }

  logout() {
    this.authService.logout();
  }

  openAuthDialog() {
    this.dialog.open(AuthComponent, {
      width: '400px', // ✅ Ajusta el tamaño del diálogo
      height: '550px',
      disableClose: true // ✅ Evita que se cierre al hacer clic afuera
    });
  }

  ngOnDestroy() {
    if (this.userSubscription) {
      this.userSubscription.unsubscribe();
    }
  }
}
