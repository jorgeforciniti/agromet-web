import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Informe {
  id: number;
  titulo: string;
  archivo: string;
  creado: string;
  categoria: string;
  posicion: number;
  url_img: string;
}

export interface InformesResponse {
  data: Informe[];
}

@Injectable({
  providedIn: 'root'
})
export class DatosService {
  private apiUrl = 'https://agromet.eeaoc.gob.ar/services/informes.php';

  constructor(private http: HttpClient) { }

  getInformes(): Observable<InformesResponse> {
    return this.http.get<InformesResponse>(this.apiUrl);
  }
}
