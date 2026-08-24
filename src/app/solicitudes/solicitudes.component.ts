import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { SolicitudesService, ServicioAgromet, ClienteAgromet } from '../services/solicitudes.service';
import { AuthService } from '../services/auth.service';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-solicitudes',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './solicitudes.component.html',
  styleUrl: './solicitudes.component.css'
})
export class SolicitudesComponent implements OnInit {
  private fb = inject(FormBuilder);
  private solicitudesService = inject(SolicitudesService);
  private authService = inject(AuthService);


  servicios: ServicioAgromet[] = [];
  cargandoServicios = false;
  enviando = false;
  error = '';
  codigoGenerado = '';

  form = this.fb.group({
    origen: ['externo', Validators.required],
    tipo_solicitud: ['informe', Validators.required],

    solicitante_nombre: ['', Validators.required],
    solicitante_institucion: [''],
    solicitante_cuit: [''],
    solicitante_condicion_iva: [''],
    solicitante_area: [''],
    solicitante_email: ['', [Validators.required, Validators.email]],
    solicitante_telefono: [''],

    servicio_id: [''],
    localidad_zona: [''],
    fecha_desde: [''],
    fecha_hasta: [''],

    descripcion: ['', Validators.required],
    finalidad: [''],
    prioridad: ['normal']
  });

  async ngOnInit() {
    await this.precargarUsuario();
    await this.cargarServicios();
  }

  async precargarUsuario() {
    const user = await this.authService.getCurrentUser();

    if (user) {
      const nombreActual = this.form.value.solicitante_nombre || '';
      const emailActual = this.form.value.solicitante_email || '';

      this.form.patchValue({
        solicitante_nombre: nombreActual || user.displayName || '',
        solicitante_email: emailActual || user.email || ''
      });
    }

    try {
      const cliente: ClienteAgromet | null = await this.solicitudesService.miCliente();

      if (!cliente) {
        return;
      }

      this.form.patchValue({
        solicitante_nombre: cliente.nombre || this.form.value.solicitante_nombre || '',
        solicitante_institucion: cliente.institucion || '',
        solicitante_cuit: cliente.cuit || '',
        solicitante_condicion_iva: cliente.condicion_iva || '',
        solicitante_area: cliente.area || '',
        solicitante_email: cliente.email || this.form.value.solicitante_email || '',
        solicitante_telefono: cliente.telefono || ''
      });

    } catch (e) {
      // Si falla la precarga del cliente, no bloqueamos el formulario.
    }
  }
  async cargarServicios() {
    try {
      this.cargandoServicios = true;
      this.servicios = await this.solicitudesService.listarServicios();
    } catch (e: any) {
      this.error = e.message || 'No se pudieron cargar los servicios.';
    } finally {
      this.cargandoServicios = false;
    }
  }

  async enviar() {
    this.error = '';
    this.codigoGenerado = '';

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error = 'Complete los campos obligatorios.';
      return;
    }

    try {
      this.enviando = true;

      const respuesta = await this.solicitudesService.crearSolicitud({
        origen: this.form.value.origen || 'externo',
        tipo_solicitud: this.form.value.tipo_solicitud || 'informe',

        solicitante_nombre: this.form.value.solicitante_nombre || '',
        solicitante_institucion: this.form.value.solicitante_institucion || '',
        solicitante_cuit: this.form.value.solicitante_cuit || '',
        solicitante_condicion_iva: this.form.value.solicitante_condicion_iva || '',
        solicitante_area: this.form.value.solicitante_area || '',
        solicitante_email: this.form.value.solicitante_email || '',
        solicitante_telefono: this.form.value.solicitante_telefono || '',

        servicio_id: this.form.value.servicio_id || '',
        localidad_zona: this.form.value.localidad_zona || '',
        fecha_desde: this.form.value.fecha_desde || '',
        fecha_hasta: this.form.value.fecha_hasta || '',

        descripcion: this.form.value.descripcion || '',
        finalidad: this.form.value.finalidad || '',
        prioridad: this.form.value.prioridad || 'normal'
      });

      this.codigoGenerado = respuesta.codigo;

      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 50);

      this.form.patchValue({
        descripcion: '',
        finalidad: ''
      });

      this.form.markAsPristine();
    } catch (e: any) {
      this.error = e.message || 'No se pudo enviar la solicitud.';
    } finally {
      this.enviando = false;
    }
  }

  campoInvalido(nombre: string): boolean {
    const campo = this.form.get(nombre);
    return !!campo && campo.invalid && (campo.dirty || campo.touched);
  }

  async nuevaSolicitud() {
    this.codigoGenerado = '';
    this.error = '';

    this.form.reset({
      origen: 'externo',
      tipo_solicitud: 'informe',
      prioridad: 'normal',
      servicio_id: '',
      solicitante_nombre: '',
      solicitante_institucion: '',
      solicitante_cuit: '',
      solicitante_condicion_iva: '',
      solicitante_area: '',
      solicitante_email: '',
      solicitante_telefono: '',
      localidad_zona: '',
      fecha_desde: '',
      fecha_hasta: '',
      descripcion: '',
      finalidad: ''
    });

    await this.precargarUsuario();

    this.form.markAsPristine();
    this.form.markAsUntouched();
  }
}