import { Component, ElementRef, ViewChild, inject } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { CORREO_SECCION, DatosIncorporacion, IncorporacionService } from '../services/incorporacion.service';

/**
 * Invitación a productores con estación propia para sumarla a la red (la promociona un video de
 * Instagram que apunta a agromet.eeaoc.gob.ar/suma-tu-estacion: no cambiar la ruta). El pedido llega
 * a la pestaña «Sumar estaciones» de /admin y por correo (server/admin/api/incorporaciones.php).
 */
@Component({
  selector: 'app-suma-tu-estacion',
  standalone: true,
  imports: [FormsModule, RouterLink, MatIconModule],
  templateUrl: './suma-tu-estacion.component.html',
  styleUrl: './suma-tu-estacion.component.css'
})
export class SumaTuEstacionComponent {
  private readonly servicio = inject(IncorporacionService);

  @ViewChild('confirmacion') private confirmacion?: ElementRef<HTMLElement>;

  readonly correo = CORREO_SECCION;

  readonly beneficios = [
    { icono: 'place', texto: 'Tu estación aparece en el mapa y en la lista de la red, con sus datos al día.' },
    { icono: 'map', texto: 'Los mapas de heladas y lluvias, las estadísticas y los informes incluyen sus datos.' },
    { icono: 'notifications_active', texto: 'Podés armar alertas de helada, calor o lluvia con tu propia estación.' },
    { icono: 'groups', texto: 'Mejora la información de toda la región para vos y para los productores vecinos.' }
  ];

  datos: DatosIncorporacion = this.vacio();
  enviando = false;
  error = '';
  enviado = false;

  async enviar(form: NgForm, formEl: HTMLFormElement): Promise<void> {
    if (form.invalid) {
      form.control.markAllAsTouched();
      formEl.querySelector<HTMLElement>('input.ng-invalid')?.focus();
      return;
    }
    this.enviando = true;
    this.error = '';
    try {
      await this.servicio.enviar(this.datos);
      this.enviado = true;
      form.resetForm();
      this.datos = this.vacio();
      // El formulario desaparece: el foco pasa al aviso para que lo lean los lectores de pantalla
      setTimeout(() => this.confirmacion?.nativeElement.focus());
    } catch (e) {
      this.error = (e as Error).message;
    } finally {
      this.enviando = false;
    }
  }

  otroPedido(): void {
    this.enviado = false;
  }

  private vacio(): DatosIncorporacion {
    return { nombre: '', email: '', telefono: '', ubicacion: '', estacion: '', internet: '', comentarios: '', sitio_web: '' };
  }
}
