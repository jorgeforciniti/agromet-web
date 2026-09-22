import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { AppComponent } from './app.component';
import { WeatherService } from './services/weather.service';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        {
          provide: WeatherService,
          useValue: {
            getStationsAll: () => of([
              { nombre: 'San Miguel', temp_af: '21.4', Localidad: 'San Miguel' }
            ])
          }
        }
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should have the 'agromet-web' title`, () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.title).toEqual('agromet-web');
  });

  it('should render the locality temperature banner below the header', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const banner = compiled.querySelector('.temperature-location-banner');

    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain('Temperaturas del momento');
    expect(banner?.textContent).toContain('San Miguel');
    expect(banner?.textContent).toContain('21.4 °C');
  });
});
