import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ComparisonByYearComponent } from './comparison-by-year.component';

describe('ComparisonByYearComponent', () => {
  let component: ComparisonByYearComponent;
  let fixture: ComponentFixture<ComparisonByYearComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ComparisonByYearComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ComparisonByYearComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
