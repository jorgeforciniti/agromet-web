import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RainCampaignDialogComponent } from './rain-campaign-dialog.component';

describe('RainCampaignDialogComponent', () => {
  let component: RainCampaignDialogComponent;
  let fixture: ComponentFixture<RainCampaignDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RainCampaignDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RainCampaignDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
