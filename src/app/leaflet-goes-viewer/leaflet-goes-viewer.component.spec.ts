import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LeafletGoesViewerComponent } from './leaflet-goes-viewer.component';

describe('LeafletGoesViewerComponent', () => {
  let component: LeafletGoesViewerComponent;
  let fixture: ComponentFixture<LeafletGoesViewerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LeafletGoesViewerComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LeafletGoesViewerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
