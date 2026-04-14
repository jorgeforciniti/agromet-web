import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AlertInstructionDialogComponent } from './alert-instruction-dialog.component';

describe('AlertInstructionDialogComponent', () => {
  let component: AlertInstructionDialogComponent;
  let fixture: ComponentFixture<AlertInstructionDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AlertInstructionDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AlertInstructionDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
