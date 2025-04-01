import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { FaIconLibrary, FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faTwitter, faYoutube, faInstagram, faFacebook } from '@fortawesome/free-brands-svg-icons';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { ReactiveFormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatDialogModule } from '@angular/material/dialog';
import { AuthComponent } from './auth/auth.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [MatGridListModule,
    RouterOutlet,
    MatToolbarModule,
    MatButtonModule,
    MatMenuModule,
    MatIconModule,
    MatDialogModule,
    FontAwesomeModule,
    ReactiveFormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {
  title = 'agromet-web';
  constructor(library: FaIconLibrary, public dialog: MatDialog) {
    // Añade los íconos a la librería
    library.addIcons(faTwitter, faYoutube, faInstagram, faFacebook);
  }
  openDialog(): void {
    const dialogRef = this.dialog.open(AuthComponent, {
      width: '50%', // o '1000px' si querés fijo
      maxWidth: '95vw', // Para evitar que desborde en pantallas pequeñas
      panelClass: 'custom-dialog-container', // clase para CSS adicional si querés
      data: {
        info: 'Información extra para el diálogo'
      }
    });
  }
}

bootstrapApplication(AppComponent, {
  providers: [provideRouter([])],
});
