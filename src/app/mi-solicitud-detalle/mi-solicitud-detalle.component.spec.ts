import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MiSolicitudDetalleComponent } from './mi-solicitud-detalle.component';

describe('MiSolicitudDetalleComponent', () => {
  let component: MiSolicitudDetalleComponent;
  let fixture: ComponentFixture<MiSolicitudDetalleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MiSolicitudDetalleComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MiSolicitudDetalleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
