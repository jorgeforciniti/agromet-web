import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { Subject, debounceTime } from 'rxjs';
import { AdminApiService, InformeCargado } from '../../services/admin-api.service';
import { CATEGORIAS_INFORME, nombreCategoria } from '../categorias';

interface Edicion {
  titulo: string;
  categoria: string;
  creado: string;
  guardando: boolean;
  error: string;
}

/** Lista de informes publicados con búsqueda, corrección de datos y despublicación. */
@Component({
  selector: 'app-admin-publicados',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule],
  templateUrl: './admin-publicados.component.html',
  styleUrl: './admin-publicados.component.css'
})
export class AdminPublicadosComponent implements OnInit {
  private readonly api = inject(AdminApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly categorias = CATEGORIAS_INFORME;
  readonly nombreCategoria = nombreCategoria;
  readonly anios = Array.from({ length: new Date().getFullYear() - 2000 }, (_, i) => String(new Date().getFullYear() - i));

  q = '';
  categoria = '';
  anio = '';

  informes: InformeCargado[] = [];
  total = 0;
  private pagina = 1;
  cargando = true;
  cargandoMas = false;
  error = '';
  aviso = '';

  editando = new Map<number, Edicion>();
  despublicando = new Set<number>();

  private readonly busqueda$ = new Subject<void>();
  // Descarta respuestas de búsquedas anteriores que lleguen tarde
  private consulta = 0;

  ngOnInit(): void {
    this.busqueda$.pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef)).subscribe(() => this.buscar());
    this.buscar();
  }

  /** Para el campo de texto (espera a que se deje de escribir). */
  buscarLuego(): void {
    this.busqueda$.next();
  }

  async buscar(): Promise<void> {
    const consulta = ++this.consulta;
    this.cargando = true;
    this.error = '';
    this.pagina = 1;
    try {
      const r = await this.api.informes({ q: this.q.trim(), categoria: this.categoria, anio: this.anio, pagina: 1 });
      if (consulta !== this.consulta) return;
      this.informes = r.informes;
      this.total = r.total;
    } catch (e) {
      if (consulta !== this.consulta) return;
      this.error = (e as Error).message;
      this.informes = [];
      this.total = 0;
    } finally {
      if (consulta === this.consulta) this.cargando = false;
    }
  }

  async cargarMas(): Promise<void> {
    if (this.cargandoMas) return;
    const consulta = this.consulta;
    this.cargandoMas = true;
    try {
      const r = await this.api.informes({ q: this.q.trim(), categoria: this.categoria, anio: this.anio, pagina: this.pagina + 1 });
      if (consulta !== this.consulta) return;
      this.pagina++;
      this.informes = [...this.informes, ...r.informes];
      this.total = r.total;
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.cargandoMas = false;
    }
  }

  /** Llamado desde la pestaña de carga después de publicar uno nuevo. */
  recargar(): void {
    this.buscar();
  }

  editar(i: InformeCargado): void {
    this.aviso = '';
    this.editando.set(i.id, { titulo: i.titulo, categoria: i.categoria, creado: i.creado, guardando: false, error: '' });
  }

  cancelar(i: InformeCargado): void {
    this.editando.delete(i.id);
  }

  async guardar(i: InformeCargado): Promise<void> {
    const e = this.editando.get(i.id);
    if (!e || e.guardando) return;
    e.guardando = true;
    e.error = '';
    try {
      const nuevo = await this.api.editarInforme({ id: i.id, titulo: e.titulo.trim(), categoria: e.categoria, creado: e.creado });
      this.informes = this.informes.map(x => x.id === i.id ? nuevo : x);
      this.editando.delete(i.id);
      this.aviso = `Se guardaron los cambios de "${nuevo.titulo}".`;
    } catch (err) {
      e.error = (err as Error).message;
    } finally {
      e.guardando = false;
    }
  }

  async despublicar(i: InformeCargado): Promise<void> {
    if (this.despublicando.has(i.id)) return;
    const seguro = confirm(`¿Despublicar "${i.titulo}"?\n\nDeja de verse en Informes. El archivo se guarda en PDFS/_despublicados del servidor.`);
    if (!seguro) return;
    this.despublicando.add(i.id);
    this.aviso = '';
    try {
      await this.api.despublicarInforme(i.id);
      this.informes = this.informes.filter(x => x.id !== i.id);
      this.total--;
      this.aviso = `Se despublicó "${i.titulo}".`;
    } catch (err) {
      this.error = (err as Error).message;
    } finally {
      this.despublicando.delete(i.id);
    }
  }

  trackId(_: number, i: InformeCargado): number {
    return i.id;
  }

  urlArchivo(archivo: string): string {
    return `https://agromet.eeaoc.gob.ar/PDFS/${encodeURIComponent(archivo)}`;
  }

  /** dd/mm/aaaa */
  fecha(iso: string): string {
    return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
  }
}
