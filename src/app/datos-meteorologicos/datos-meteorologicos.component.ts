import { Component, OnInit } from '@angular/core';
import { MatCardModule } from '@angular/material/card';

@Component({
  selector: 'app-datos-meteorologicos',
  imports: [
    MatCardModule,
  ],
  templateUrl: './datos-meteorologicos.component.html',
  styleUrl: './datos-meteorologicos.component.css'
})
export class DatosMeteorologicosComponent implements OnInit {

  constructor() { }

  ngOnInit(): void {
  }

}
