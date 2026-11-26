import { IconName } from '@fortawesome/fontawesome-svg-core';

/**
 * Redes de la EEAOC, en el orden del sitio institucional. Las usan la barra lateral
 * (components/redes-laterales) y el pie. Los íconos se registran en app.component.ts.
 */
export interface RedSocial {
  nombre: string;
  url: string;
  icono: IconName;
}

export const REDES_SOCIALES: RedSocial[] = [
  { nombre: 'YouTube', url: 'https://www.youtube.com/channel/UC5cr5skGsAzBIoNO_c8KhBg', icono: 'youtube' },
  { nombre: 'Facebook', url: 'https://www.facebook.com/EEAOCOFICIAL/', icono: 'facebook-f' },
  { nombre: 'Instagram', url: 'https://www.instagram.com/eeaocoficial/?hl=es-la', icono: 'instagram' },
  { nombre: 'X (Twitter)', url: 'https://twitter.com/eeaocoficial', icono: 'x-twitter' },
  { nombre: 'TikTok', url: 'https://www.tiktok.com/@eeaoctucumn', icono: 'tiktok' },
  {
    nombre: 'LinkedIn',
    url: 'https://www.linkedin.com/company/estaci-n-experimental-agroindustrial-obispo-colombres-/posts/?feedView=all',
    icono: 'linkedin-in'
  },
  { nombre: 'Spotify', url: 'https://open.spotify.com/show/3uVUtJQ22uvFSxZAMQcJ1S', icono: 'spotify' }
];
