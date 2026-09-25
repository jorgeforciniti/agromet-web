import { Component, OnDestroy, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { FaIconLibrary, FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faTwitter, faYoutube, faInstagram, faFacebook } from '@fortawesome/free-brands-svg-icons';
import { ReactiveFormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatDialogModule } from '@angular/material/dialog';
import { HeaderComponent } from './components/header/header.component';
import { FooterComponent } from './components/footer/footer.component';

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
    HeaderComponent,
    FooterComponent
  ],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'agromet-web';
  private readonly onScroll = this.onWindowScroll.bind(this);
  private headerResizeObserver?: ResizeObserver;

  constructor(library: FaIconLibrary, public dialog: MatDialog) {
    library.addIcons(faTwitter, faYoutube, faInstagram, faFacebook);
  }

  ngOnInit(): void {
    window.addEventListener('scroll', this.onScroll);
    this.observeHeaderHeight();
  }

  ngOnDestroy(): void {
    window.removeEventListener('scroll', this.onScroll);
    this.headerResizeObserver?.disconnect();
  }

  onWindowScroll(): void {
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const isScrolled = scrollTop > 50;
    document.querySelector('.header-container')?.classList.toggle('scrolled', isScrolled);
  }

  /**
   * El header cambia de alto según el contenido (badge de alerta presente/ausente,
   * si el menú mobile envuelve a dos líneas, el efecto "shrink" al hacer scroll, etc.).
   * En vez de adivinar un margin-top fijo para .main-content, medimos el alto real
   * del header y lo exponemos como variable CSS para que siempre calce.
   */
  private observeHeaderHeight(): void {
    const header = document.querySelector<HTMLElement>('.header-container');
    if (!header || typeof ResizeObserver === 'undefined') {
      return;
    }

    const syncHeight = () => {
      document.documentElement.style.setProperty('--header-h', `${header.getBoundingClientRect().height}px`);
    };

    this.headerResizeObserver = new ResizeObserver(syncHeight);
    this.headerResizeObserver.observe(header);
    syncHeight();
  }

  
  async openDiseaseDebugDialog(): Promise<void> {
    const { DiseaseConditionsDialogComponent } = await import('./disease-conditions-dialog/disease-conditions-dialog.component');

    this.dialog.open(DiseaseConditionsDialogComponent, {
      width: 'min(1120px, 95vw)',
      maxWidth: '95vw',
      height: '92vh',
      maxHeight: '92vh',
      panelClass: 'do-dialog',
      autoFocus: false,
      restoreFocus: false
    });
  }
  async openDialog(): Promise<void> {
    const { AuthComponent } = await import('./auth/auth.component');

    this.dialog.open(AuthComponent, {
      width: 'min(460px, 94vw)',
      maxWidth: '94vw',
      panelClass: 'auth-dialog',
      autoFocus: false,
      restoreFocus: false,
      data: {
        info: 'Ingreso a usuarios'
      }
    });
  }
}
