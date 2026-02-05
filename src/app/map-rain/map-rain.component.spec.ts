import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MapRainComponent } from './map-rain.component';

describe('MapRainComponent', () => {
  let component: MapRainComponent;
  let fixture: ComponentFixture<MapRainComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapRainComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MapRainComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
