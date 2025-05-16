import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ComparisonByLocationComponent } from './comparison-by-location.component';

describe('ComparisonByLocationComponent', () => {
  let component: ComparisonByLocationComponent;
  let fixture: ComponentFixture<ComparisonByLocationComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ComparisonByLocationComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ComparisonByLocationComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
