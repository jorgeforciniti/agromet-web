import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Política de privacidad del sitio web (la app móvil tiene la suya, Policy.php).
 * Describe lo que el sitio recopila hoy: preferencias en el navegador, Google Analytics,
 * cuentas de Firebase con sus preferencias, consultas y alertas, y las solicitudes de
 * servicios. Si se agrega otro dato personal o servicio externo, hay que actualizarla.
 */
@Component({
  selector: 'app-privacidad',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './privacidad.component.html',
  styleUrl: './privacidad.component.css'
})
export class PrivacidadComponent {
  /** Fecha de la última revisión del texto; cambiarla al modificarlo */
  readonly actualizada = '28/10/2026';

  /** Índice: con <base href="/"> un href="#x" llevaría al inicio, así que se desplaza a mano. */
  ir(evento: Event, id: string): void {
    evento.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
