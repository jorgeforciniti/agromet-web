import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DatosOnlineComponent } from './datos-online.component';

describe('DatosOnlineComponent', () => {
  let component: DatosOnlineComponent;
  let fixture: ComponentFixture<DatosOnlineComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DatosOnlineComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DatosOnlineComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
