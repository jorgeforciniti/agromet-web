import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { esAdministrador } from '../shared/administradores';

/** /admin sólo para las cuentas de ADMINISTRADORES; el resto vuelve al inicio. */
export const adminGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const usuario = await inject(AuthService).getCurrentUser();
  return esAdministrador(usuario) ? true : router.parseUrl('/');
};
