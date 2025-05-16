import { TestBed } from '@angular/core/testing';

import { DatosOnlineService } from './datos-online.service';

describe('DatosOnlineService', () => {
  let service: DatosOnlineService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DatosOnlineService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
