// Recientes del cajón del link (Freestyle y la libreta): los últimos 10 beats que sonaron con un link (YouTube o
// SoundCloud) o desde un archivo del teléfono. Sin DOM: la lista va en localStorage
// y los archivos, aparte (en el navegador, IndexedDB; en SwiftUI, en Documents).

const CLAVE = 'metrica.recientes';
export const MAXIMO_RECIENTES = 10;
const SUFIJOS = { youtube: 'YT', soundcloud: 'SCLOUD', archivo: 'CELULAR' };

// Qué hace iguales a dos recientes: el mismo link, o el mismo archivo.
function claveDe(reciente) {
    return reciente.fuente === 'archivo' ? `archivo:${reciente.id}` : `link:${reciente.link}`;
}

export function leerRecientes(almacen) {
    try {
        const lista = JSON.parse(almacen.getItem(CLAVE) ?? '[]');
        return Array.isArray(lista) ? lista.filter(r => SUFIJOS[r?.fuente]).slice(0, MAXIMO_RECIENTES) : [];
    } catch {
        return [];
    }
}

// Suma uno arriba de todo (el último usado primero), sin repetir, y se queda con 10. Devuelve los que se cayeron
// de la lista, para borrar sus archivos.
export function agregarReciente(almacen, reciente) {
    const anteriores = leerRecientes(almacen);
    const viejo = anteriores.find(r => claveDe(r) === claveDe(reciente));
    const nuevo = { ...reciente, titulo: reciente.titulo || viejo?.titulo || '' };
    const todos = [nuevo, ...anteriores.filter(r => claveDe(r) !== claveDe(reciente))];
    almacen.setItem(CLAVE, JSON.stringify(todos.slice(0, MAXIMO_RECIENTES)));
    return todos.slice(MAXIMO_RECIENTES);
}

// El título llega después, cuando carga el reproductor.
export function titularReciente(almacen, reciente, titulo) {
    const lista = leerRecientes(almacen);
    const encontrado = lista.find(r => claveDe(r) === claveDe(reciente));
    if (!encontrado || !titulo) return;
    encontrado.titulo = titulo;
    almacen.setItem(CLAVE, JSON.stringify(lista));
}

// Sacar uno de la lista (la cruz de cada fila). Devuelve true si estaba.
export function quitarReciente(almacen, reciente) {
    const lista = leerRecientes(almacen);
    const quedan = lista.filter(r => claveDe(r) !== claveDe(reciente));
    almacen.setItem(CLAVE, JSON.stringify(quedan));
    return quedan.length < lista.length;
}

// De dónde viene, entre paréntesis: «YT», «SCLOUD» o «CELULAR» (un archivo del teléfono).
export function sufijoReciente(reciente) {
    return SUFIJOS[reciente.fuente];
}

// «Lofi chill beat para escr… (YT)»: el título acortado y de dónde viene, en un renglón.
// En la pantalla el título se corta con «…» donde se acaba el lugar (CSS), y el sufijo queda.
export function etiquetaReciente(reciente, largo = 30) {
    const titulo = String(reciente.titulo || 'Sin título').trim();
    const corto = titulo.length > largo ? `${titulo.slice(0, largo - 1).trimEnd()}…` : titulo;
    return `${corto} (${SUFIJOS[reciente.fuente]})`;
}

// «mi_beat-trap.mp3» -> «mi beat-trap».
export function tituloDeArchivo(nombre) {
    return String(nombre ?? '').replace(/\.[^.]+$/, '').replace(/_+/g, ' ').trim() || 'Beat del teléfono';
}
