import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConditionsToApplyComponent } from './conditions-to-apply.component';

describe('ConditionsToApplyComponent', () => {
  let component: ConditionsToApplyComponent;
  let fixture: ComponentFixture<ConditionsToApplyComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConditionsToApplyComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ConditionsToApplyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
