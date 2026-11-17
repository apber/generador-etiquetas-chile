// Entorno: el que escribió scripts/app-entorno.mjs al publicar (producción o dev, con su servidor, su app de Microsoft
// y su carpeta de OneDrive) o, en el repositorio, local (servidor de desarrollo: npm run app) o demo (marca ficticia,
// sin cuenta ni servidor). Nada de esto es secreto: el identificador de la app de Microsoft y el servidor son públicos.
import publicado from '../entorno.js';

function elegir() {
  if (publicado) return publicado;
  if (['localhost', '127.0.0.1'].includes(location.hostname)) return { id: 'local', nombre: 'Etiquetas (local)', api: '', microsoft: null };
  return { id: 'demo', nombre: 'Etiquetas demo', api: null, microsoft: null };
}

export const ENTORNO = elegir();
/** La app usa OneDrive solo si el entorno tiene la app de Microsoft registrada. */
export const conOneDrive = () => Boolean(ENTORNO.microsoft?.clientId);
