import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DatosMeteorologicosComponent } from './datos-meteorologicos.component';

describe('DatosMeteorologicosComponent', () => {
  let component: DatosMeteorologicosComponent;
  let fixture: ComponentFixture<DatosMeteorologicosComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DatosMeteorologicosComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DatosMeteorologicosComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
