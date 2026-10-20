// Interfaz: solo DOM y navegación. La lógica vive en js/logica/ (módulos puros).
import { parsearPalabras, parsearFrecuencias } from './logica/diccionario.js';
import { palabrasAlAzar, filtrarPorTerminacion } from './logica/generador.js';
import { crearIndiceRimas, buscarRimas, agruparRimas } from './logica/rimas.js';
import { contarSilabasVerso } from './logica/silabas.js';
import { nuevaLetra, listarLetras } from './logica/sesiones.js';

const $ = id => document.getElementById(id);

const todasLasPalabras = parsearPalabras(textoPalabras);
const palabrasSimples = parsearPalabras(textoPalabrasSimples);

// El índice de rimas tarda un par de segundos en armarse: se arma una sola vez.
let indice = null;
const indiceRimas = () => indice ??= crearIndiceRimas(todasLasPalabras, parsearFrecuencias(textoFrecuencias));

// ---------- Pestañas (TabView) ----------
function mostrarPestana(nombre) {
    document.querySelectorAll('.pantalla').forEach(p => p.classList.toggle('activa', p.dataset.pestana === nombre));
    document.querySelectorAll('#barra-pestanas button').forEach(b => b.setAttribute('aria-selected', b.dataset.pestana === nombre));
    if (nombre === 'palabras') reanudarPalabras(); else pausarPalabras();
}
document.querySelectorAll('#barra-pestanas button').forEach(b => b.addEventListener('click', () => mostrarPestana(b.dataset.pestana)));

// ---------- Letras (NavigationStack: lista -> editor) ----------
function mostrarVista(id) {
    document.querySelectorAll('#pantalla-letras .vista').forEach(v => v.classList.toggle('activa', v.id === id));
    document.body.classList.toggle('editando', id === 'vista-editor');
}

function renderizarLetras() {
    const letras = listarLetras(localStorage);
    $('lista-letras').replaceChildren(...letras.map(letra => {
        const celda = document.createElement('li');
        celda.className = 'celda';
        celda.textContent = letra.titulo || 'Sin título';
        return celda;
    }));
    $('letras-vacio').hidden = letras.length > 0;
}

const editorTexto = $('editor-texto');

function abrirEditor(letra) {
    $('editor-titulo').value = letra.titulo;
    editorTexto.value = letra.texto;
    actualizarEditor();
    mostrarVista('vista-editor');
    $('editor-titulo').focus();
}

function actualizarEditor() {
    editorTexto.style.height = 'auto';
    editorTexto.style.height = editorTexto.scrollHeight + 'px';

    const versos = editorTexto.value.split('\n');

    // Sílabas por verso (vacío en los versos sin palabras).
    $('silabas').replaceChildren(...versos.map(verso => {
        const fila = document.createElement('div');
        fila.textContent = contarSilabasVerso(verso) || '';
        return fila;
    }));

    // Rimas pintadas: la última palabra de cada verso, con el color de su grupo.
    const finales = versos.map(verso => verso.match(/(\p{L}+)[^\p{L}]*$/u));
    const grupos = $('alternar-colores').getAttribute('aria-pressed') === 'true'
        ? agruparRimas(finales.map(f => f?.[1])) : [];
    $('editor-fondo').replaceChildren(...versos.flatMap((verso, i) => {
        const fin = i < versos.length - 1 ? '\n' : '';
        if (grupos[i] == null) return [verso + fin];
        const marca = document.createElement('mark');
        marca.className = `rima-${grupos[i] % 5}`;
        marca.textContent = finales[i][1];
        return [verso.slice(0, finales[i].index), marca, verso.slice(finales[i].index + finales[i][1].length) + fin];
    }));

    // Sugerencias para la última palabra escrita (en un verso vacío, la del verso anterior).
    const ultima = editorTexto.value.slice(0, editorTexto.selectionEnd).match(/(\p{L}+)[^\p{L}]*$/u)?.[1];
    const rimas = ultima ? buscarRimas(ultima, indiceRimas()).slice(0, 20) : [];
    if (rimas.length) {
        $('sugerencias').replaceChildren(...rimas.map(rima => {
            const boton = document.createElement('button');
            boton.className = 'sugerencia';
            boton.textContent = rima;
            return boton;
        }));
    } else {
        const vacio = document.createElement('span');
        vacio.className = 'sugerencias-vacio';
        vacio.textContent = ultima ? `No encontré rimas para «${ultima}»` : 'Acá van a aparecer rimas mientras escribís';
        $('sugerencias').replaceChildren(vacio);
    }
}

// Tocar una sugerencia la agrega donde está el cursor, sin cerrar el teclado.
$('sugerencias').addEventListener('pointerdown', e => e.preventDefault());
$('sugerencias').addEventListener('click', e => {
    const boton = e.target.closest('.sugerencia');
    if (!boton) return;
    const { value, selectionStart, selectionEnd } = editorTexto;
    const espacio = selectionStart > 0 && !/\s/.test(value[selectionStart - 1]) ? ' ' : '';
    editorTexto.setRangeText(espacio + boton.textContent, selectionStart, selectionEnd, 'end');
    editorTexto.focus();
    actualizarEditor();
});

$('nueva-letra').addEventListener('click', () => abrirEditor(nuevaLetra()));
$('editor-atras').addEventListener('click', () => { mostrarVista('vista-lista-letras'); renderizarLetras(); });
editorTexto.addEventListener('input', actualizarEditor);
for (const id of ['alternar-colores', 'alternar-silabas']) {
    $(id).addEventListener('click', e => {
        const boton = e.currentTarget;
        boton.setAttribute('aria-pressed', boton.getAttribute('aria-pressed') !== 'true');
        $('silabas').classList.toggle('oculto', $('alternar-silabas').getAttribute('aria-pressed') !== 'true');
        actualizarEditor();
    });
}

// ---------- Rimas ----------
let tipoRima = 'consonante';

function renderizarRimas() {
    const palabra = $('buscar-rima').value.trim().toLowerCase();
    const rimas = palabra ? buscarRimas(palabra, indiceRimas(), { tipo: tipoRima }).slice(0, 100) : [];
    $('resultados-rimas').replaceChildren(...rimas.map(rima => {
        const celda = document.createElement('li');
        celda.className = 'celda';
        celda.textContent = rima;
        return celda;
    }));
    $('rimas-vacio').textContent = !palabra
        ? 'Escribí una palabra para ver con qué rima.'
        : `No encontré rimas ${tipoRima}s para «${palabra}».`;
    $('rimas-vacio').hidden = rimas.length > 0;
}

$('buscar-rima').addEventListener('input', renderizarRimas);
document.querySelectorAll('#tipo-rima button').forEach(b => b.addEventListener('click', () => {
    tipoRima = b.dataset.tipo;
    document.querySelectorAll('#tipo-rima button').forEach(o => o.setAttribute('aria-selected', o === b));
    renderizarRimas();
}));

// ---------- Palabras al azar ----------
const CANTIDAD = 6;
const SEGUNDOS = 5;
let temporizador = null;
let pausadoPorUsuario = false;

function poolActual() {
    const base = $('palabras-simples').checked ? palabrasSimples : todasLasPalabras;
    return filtrarPorTerminacion(base, $('terminacion').value);
}

function refrescarPalabras() {
    const pool = poolActual();
    $('grilla-palabras').replaceChildren(...palabrasAlAzar(pool, CANTIDAD).map(palabra => {
        const tarjeta = document.createElement('div');
        tarjeta.className = 'palabra';
        tarjeta.textContent = palabra;
        return tarjeta;
    }));
    $('palabras-total').textContent = `${pool.length.toLocaleString('es-AR')} palabras disponibles`;
    animarProgreso();
}

function animarProgreso() {
    const barra = $('progreso');
    barra.style.transition = 'none';
    barra.style.transform = 'scaleX(1)';
    if (temporizador === null) return;
    barra.getBoundingClientRect();
    barra.style.transition = `transform ${SEGUNDOS}s linear`;
    barra.style.transform = 'scaleX(0)';
}

function reanudarPalabras() {
    if (pausadoPorUsuario || temporizador !== null) return;
    temporizador = setInterval(refrescarPalabras, SEGUNDOS * 1000);
    refrescarPalabras();
}

function pausarPalabras() {
    clearInterval(temporizador);
    temporizador = null;
    animarProgreso();
}

$('pausar-palabras').addEventListener('click', () => {
    pausadoPorUsuario = !pausadoPorUsuario;
    $('pausar-palabras').textContent = pausadoPorUsuario ? 'Reanudar' : 'Pausar';
    pausadoPorUsuario ? pausarPalabras() : reanudarPalabras();
});
$('refrescar-palabras').addEventListener('click', () => {
    if (temporizador === null) return refrescarPalabras();
    pausarPalabras();
    reanudarPalabras();
});
$('palabras-simples').addEventListener('change', refrescarPalabras);
$('terminacion').addEventListener('input', refrescarPalabras);

// ---------- Inicio ----------
renderizarLetras();
refrescarPalabras();
// Armamos el índice de rimas apenas la app termina de aparecer, para que esté listo al buscar.
setTimeout(indiceRimas, 300);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js');
}
