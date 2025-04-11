import { TestBed } from '@angular/core/testing';

import { SunriseSunsetService } from './sunrise-sunset.service';

describe('SunriseSunsetService', () => {
  let service: SunriseSunsetService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SunriseSunsetService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
