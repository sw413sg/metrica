// Baúl de frases: ideas sueltas para usar después en una letra. Sin DOM: el almacenamiento se
// pasa como parámetro (localStorage en la web; en SwiftUI será SwiftData o similar), igual que
// las letras en sesiones.js.

import { mandarAPapelera } from './papelera.js';
import { temaDisponible, opacidadDeTema } from './compra.js';

const CLAVE_FRASES = 'metrica.frases';
const CLAVE_AJUSTES = 'metrica.baul-ajustes';

export const FILTROS = [
    { id: 'todas', nombre: 'Todas' },
    { id: 'sin-usar', nombre: 'Sin usar' },
    { id: 'usadas', nombre: 'Usadas' },
];

function leer(almacen) {
    try {
        const valor = JSON.parse(almacen.getItem(CLAVE_FRASES));
        return Array.isArray(valor) ? valor : [];
    } catch {
        return [];
    }
}

const escribir = (almacen, frases) => almacen.setItem(CLAVE_FRASES, JSON.stringify(frases));

// Las frases, de la última anotada a la primera. Editar una no la cambia de lugar.
export function listarFrases(almacen) {
    return leer(almacen).sort((a, b) => b.creada - a.creada);
}

// Anota una frase nueva y la devuelve (o null si está vacía).
export function anotarFrase(almacen, texto, ahora = Date.now()) {
    texto = texto.trim();
    if (!texto) return null;
    const frase = { id: String(ahora), texto, usada: false, creada: ahora };
    escribir(almacen, [...leer(almacen), frase]);
    return frase;
}

// Cambia el texto de una frase. Si queda vacía, se borra.
export function editarFrase(almacen, id, texto) {
    texto = texto.trim();
    if (!texto) return sacarFrase(almacen, id);
    escribir(almacen, leer(almacen).map(f => (f.id === id ? { ...f, texto } : f)));
}

// Borrar una frase la manda a la papelera (js/logica/papelera.js), donde queda 7 días.
export function borrarFrase(almacen, id, ahora = Date.now()) {
    const frase = leer(almacen).find(f => f.id === id);
    if (frase) mandarAPapelera(almacen, 'frase', frase, ahora);
    sacarFrase(almacen, id);
}

// La saca sin pasar por la papelera: vaciada al editarla, o sacada con «Al baúl» de nuevo.
export function sacarFrase(almacen, id) {
    escribir(almacen, leer(almacen).filter(f => f.id !== id));
}

export function restaurarFrase(almacen, frase) {
    escribir(almacen, [...leer(almacen).filter(f => f.id !== frase.id), frase]);
}

// Marca o desmarca una frase como usada. Devuelve true si quedó usada.
export function alternarUsada(almacen, id) {
    let usada = false;
    escribir(almacen, leer(almacen).map(f => (f.id === id ? { ...f, usada: (usada = !f.usada) } : f)));
    return usada;
}

// El botón de volver al baúl desde una letra lleva su nombre, hasta 16 letras: «Bypass de mes»
// entra entero, y uno largo queda en las palabras que entran y «…» («Después de ese…»). Si así queda
// casi nada («Yo…»), se corta en la letra.
export function etiquetaVolver(titulo, maximo = 16) {
    titulo = titulo.trim().replace(/\s+/g, ' ');
    if (!titulo) return 'Sin título';
    if (titulo.length <= maximo) return titulo;
    const espacio = titulo.slice(0, maximo + 1).lastIndexOf(' ');
    return `${(espacio >= 4 ? titulo.slice(0, espacio) : titulo.slice(0, maximo)).trim()}…`;
}

// Sin tildes ni mayúsculas, para que «corazon» encuentre «Corazón». La ñ queda.
const normalizar = texto => texto.toLowerCase().normalize('NFD').replace(/(?!\u0303)[\u0300-\u036f]/g, '').normalize('NFC');

// Las frases del filtro elegido que contienen lo buscado.
export function filtrarFrases(frases, { filtro = 'todas', busqueda = '' } = {}) {
    const buscada = normalizar(busqueda.trim());
    return frases.filter(f =>
        (filtro === 'todas' || f.usada === (filtro === 'usadas')) &&
        (!buscada || normalizar(f.texto).includes(buscada)));
}

// Lo que se elige con el pincel (desde Letras o desde una letra): el tema, el tamaño de las tarjetas
// (chicas en tres columnas, medianas en dos y grandes en una) y si se separan las usadas de las
// sin usar con Todas / Sin usar / Usadas. Pedido de Swa.
export const TAMANOS_BAUL = [
    { id: 'chicas', nombre: 'Chicas', columnas: 3 },
    { id: 'medianas', nombre: 'Medianas', columnas: 2 },
    { id: 'grandes', nombre: 'Grandes', columnas: 1 },
];
const AJUSTES_INICIALES = { tema: 'gris', opacidad: 10, tamano: 'medianas', separar: true };

export function ajustesBaul(almacen) {
    let guardados = {};
    try {
        guardados = JSON.parse(almacen.getItem(CLAVE_AJUSTES)) ?? {};
    } catch {}
    const ajustes = { ...AJUSTES_INICIALES, ...guardados };
    if (!TAMANOS_BAUL.some(t => t.id === ajustes.tamano)) ajustes.tamano = AJUSTES_INICIALES.tamano;
    // Un tema de Extras sin la compra vuelve al inicial, como en las letras.
    if (!temaDisponible(ajustes.tema, almacen)) ajustes.tema = AJUSTES_INICIALES.tema;
    ajustes.separar = ajustes.separar !== false;
    ajustes.opacidad = opacidadDeTema(ajustes.opacidad);
    return ajustes;
}

export function guardarAjusteBaul(almacen, cambios) {
    const guardados = (() => { try { return JSON.parse(almacen.getItem(CLAVE_AJUSTES)) ?? {}; } catch { return {}; } })();
    almacen.setItem(CLAVE_AJUSTES, JSON.stringify({ ...guardados, ...cambios }));
}
