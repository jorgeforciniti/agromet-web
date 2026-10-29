import { User } from '@angular/fire/auth';

/**
 * Cuentas que ven la administración (/admin). Sólo decide qué se muestra: el control real lo
 * hace la API (server/admin/api/config.php, misma lista), que además exige el email confirmado.
 */
export const ADMINISTRADORES = [
  'jmedina@eeaoc.org.ar',
  'lorenasoule@eeaoc.org.ar',
  'jorgeforciniti@eeaoc.org.ar',
  'amleal@eeaoc.org.ar'
];

export function esAdministrador(usuario: User | null | undefined): boolean {
  const email = usuario?.email?.toLowerCase();
  return !!email && !!usuario?.emailVerified && ADMINISTRADORES.includes(email);
}
