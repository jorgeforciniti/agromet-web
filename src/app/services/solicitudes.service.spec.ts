import { TestBed } from '@angular/core/testing';

import { SolicitudesServiceTsService } from './solicitudes.service';

describe('SolicitudesServiceTsService', () => {
  let service: SolicitudesServiceTsService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SolicitudesServiceTsService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
