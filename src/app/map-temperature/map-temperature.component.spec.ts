import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MapTemperatureComponent } from './map-temperature.component';

describe('MapTemperatureComponent', () => {
  let component: MapTemperatureComponent;
  let fixture: ComponentFixture<MapTemperatureComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapTemperatureComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MapTemperatureComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
