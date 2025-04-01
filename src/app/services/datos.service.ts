import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
@Injectable({
  providedIn: 'root'
})
export class DatosService {
  private apiUrl = 'https://agromet.eeaoc.gob.ar/services/informes.php';

  constructor(private http: HttpClient) { }

  getInformes(): Observable<any> {
    return this.http.get<any>(this.apiUrl);
  }
}