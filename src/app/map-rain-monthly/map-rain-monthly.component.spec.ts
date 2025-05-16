import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MapRainMonthlyComponent } from './map-rain-monthly.component';

describe('MapRainMonthlyComponent', () => {
  let component: MapRainMonthlyComponent;
  let fixture: ComponentFixture<MapRainMonthlyComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapRainMonthlyComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MapRainMonthlyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
