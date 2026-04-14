import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialog } from '@angular/material/dialog';
import { MatDialogModule } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { ViewChild, ElementRef, AfterViewInit } from '@angular/core';


@Component({
  selector: 'app-bienvenida',
  standalone: true,
  imports: [
    MatDialogModule,
    CommonModule,
    MatIconModule
  ],
  templateUrl: './bienvenida.component.html',
  styleUrl: './bienvenida.component.css'
})

export class BienvenidaComponent implements AfterViewInit {
  constructor(private dialog: MatDialog) { }
  @ViewChild('heroVideo', { static: true }) heroVideo!: ElementRef<HTMLVideoElement>;
  showPlayButton = false;

  ngAfterViewInit(): void {
    const video = this.heroVideo.nativeElement;
    video.play()
      .catch(error => {
        void error;
        this.showPlayButton = true;
      });
  }

  async openDialog(): Promise<void> {
    const { DialogComponent } = await import('./dialog/dialog.component');

    this.dialog.open(DialogComponent, {
      panelClass: 'about-dialog',
      width: 'min(880px, calc(100vw - 32px))',
      maxWidth: 'calc(100vw - 32px)',
      maxHeight: '90vh',
      autoFocus: false,
      restoreFocus: false
    });
  }

  forcePlay() {
    this.heroVideo.nativeElement.play()
      .catch(() => {
        this.showPlayButton = true;
      });
    this.showPlayButton = false;
  }

  onClickPlay() {
    this.heroVideo.nativeElement.play()
      .catch(() => {
        this.showPlayButton = true;
      });
  }

}
