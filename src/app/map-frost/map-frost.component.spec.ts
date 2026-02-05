import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MapFrostComponent } from './map-frost.component';

describe('MapFrostComponent', () => {
  let component: MapFrostComponent;
  let fixture: ComponentFixture<MapFrostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapFrostComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MapFrostComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
