import { Component, OnInit } from '@angular/core';
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
import { NavbarComponent } from './components/navbar/navbar.component';
import { provideFirebaseApp, initializeApp } from '@angular/fire/app';
import { provideAuth, getAuth } from '@angular/fire/auth';
import { environment } from '../app/environments/environment';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    MatGridListModule,
    RouterOutlet,
    MatToolbarModule,
    MatButtonModule,
    MatMenuModule,
    MatIconModule,
    MatDialogModule,
    FontAwesomeModule,
    ReactiveFormsModule,
    NavbarComponent
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  title = 'agromet-web';
  
  constructor(library: FaIconLibrary, public dialog: MatDialog) {
    library.addIcons(faTwitter, faYoutube, faInstagram, faFacebook);
  }

  ngOnInit(): void {
    window.addEventListener('scroll', this.onWindowScroll.bind(this));
  }

  onWindowScroll(): void {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const header = document.querySelector('.header-container');
    if (header) {
      if (scrollTop > 50) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    }
  }

  openDialog(): void {
    const dialogRef = this.dialog.open(AuthComponent, {
      width: '50%', 
      maxWidth: '95vw',
      panelClass: 'custom-dialog-container',
      data: {
        info: 'Información extra para el diálogo'
      }
    });
  }
}

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter([]),
    provideFirebaseApp(() => initializeApp(environment.firebaseConfig)),
    provideAuth(() => getAuth())
  ]
});
