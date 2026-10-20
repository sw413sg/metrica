// Interfaz: solo DOM y navegación. La lógica vive en js/logica/ (módulos puros).
import { parsearPalabras, parsearFrecuencias } from './logica/diccionario.js';
import { palabrasAlAzar, filtrarPorTerminacion } from './logica/generador.js';
import { crearIndiceRimas, buscarRimas, agruparRimas } from './logica/rimas.js';
import { contarSilabasVerso } from './logica/silabas.js';
import { BEATS, tiempoDelPaso, cambiaLaPalabra, silabaFuerte, segundosRestantes, formatoReloj } from './logica/freestyle.js';
import { iniciarBeat, detenerBeat } from './beats.js';
import { nuevaLetra, listarLetras, guardarLetra, borrarLetra, listarFavoritos, alternarFavorito } from './logica/sesiones.js';

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
    if (nombre !== 'freestyle') terminarRonda();
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
        const boton = document.createElement('button');
        boton.className = 'celda-boton';
        const titulo = document.createElement('span');
        titulo.textContent = letra.titulo || 'Sin título';
        const primerVerso = document.createElement('span');
        primerVerso.className = 'subtitulo';
        primerVerso.textContent = letra.texto.split('\n').find(v => v.trim()) ?? '';
        boton.append(titulo, primerVerso);
        boton.addEventListener('click', () => abrirEditor(letra));
        celda.append(boton);
        return celda;
    }));
    $('letras-vacio').hidden = letras.length > 0;
}

const editorTexto = $('editor-texto');
let letraActual = null;

// Se guarda sola en cada cambio (como Notas de iOS).
function guardarActual() {
    letraActual = guardarLetra(localStorage, { ...letraActual, titulo: $('editor-titulo').value, texto: editorTexto.value });
}

function abrirEditor(letra) {
    letraActual = letra;
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
    guardarActual();
});

// Lo que queda visible de la pantalla con el teclado abierto (ver estilos.css).
if (window.visualViewport) {
    const ajustarAlTeclado = () => {
        document.documentElement.style.setProperty('--alto-visible', `${visualViewport.height}px`);
        document.documentElement.style.setProperty('--arriba-visible', `${visualViewport.offsetTop}px`);
    };
    visualViewport.addEventListener('resize', ajustarAlTeclado);
    visualViewport.addEventListener('scroll', ajustarAlTeclado);
    ajustarAlTeclado();
}

$('nueva-letra').addEventListener('click', () => abrirEditor(nuevaLetra()));
$('editor-atras').addEventListener('click', () => { mostrarVista('vista-lista-letras'); renderizarLetras(); });
$('borrar-letra').addEventListener('click', () => {
    if (!confirm('¿Borrar esta letra? No se puede deshacer.')) return;
    borrarLetra(localStorage, letraActual.id);
    mostrarVista('vista-lista-letras');
    renderizarLetras();
});
editorTexto.addEventListener('input', () => { actualizarEditor(); guardarActual(); });
$('editor-titulo').addEventListener('input', guardarActual);
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

// Botón de estrella para marcar una palabra como favorita.
function botonFavorito(palabra, alCambiar = () => {}) {
    const boton = document.createElement('button');
    boton.className = 'estrella';
    boton.setAttribute('aria-label', `Favorita: ${palabra}`);
    boton.setAttribute('aria-pressed', listarFavoritos(localStorage).includes(palabra));
    boton.innerHTML = '<svg viewBox="0 0 24 24" class="icono"><path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8 6.6 19.7l1.1-6.1-4.5-4.2 6.1-.8z"/></svg>';
    boton.addEventListener('click', e => {
        e.stopPropagation();
        boton.setAttribute('aria-pressed', alternarFavorito(localStorage, palabra));
        alCambiar();
    });
    return boton;
}

// Celda con la palabra (tocarla busca sus rimas) y la estrella.
function celdaPalabra(palabra, alCambiar) {
    const celda = document.createElement('li');
    celda.className = 'celda';
    const boton = document.createElement('button');
    boton.className = 'celda-boton';
    boton.textContent = palabra;
    boton.addEventListener('click', () => { $('buscar-rima').value = palabra; renderizarRimas(); });
    celda.append(boton, botonFavorito(palabra, alCambiar));
    return celda;
}

function renderizarRimas() {
    const palabra = $('buscar-rima').value.trim().toLowerCase();
    // Sin búsqueda se muestran las favoritas.
    const lista = palabra ? buscarRimas(palabra, indiceRimas(), { tipo: tipoRima }).slice(0, 100) : listarFavoritos(localStorage);
    $('resultados-rimas').replaceChildren(...lista.map(p => celdaPalabra(p, palabra ? undefined : renderizarRimas)));
    $('encabezado-favoritas').hidden = Boolean(palabra) || !lista.length;
    $('rimas-vacio').textContent = !palabra
        ? 'Escribí una palabra para ver con qué rima. Tocá la estrella para guardarla en favoritas.'
        : `No encontré rimas ${tipoRima}s para «${palabra}».`;
    $('rimas-vacio').hidden = lista.length > 0;
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
        // Tocar la tarjeta la marca como favorita.
        const tarjeta = document.createElement('button');
        tarjeta.className = 'palabra';
        tarjeta.textContent = palabra;
        tarjeta.setAttribute('aria-pressed', listarFavoritos(localStorage).includes(palabra));
        tarjeta.addEventListener('click', () => tarjeta.setAttribute('aria-pressed', alternarFavorito(localStorage, palabra)));
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

// ---------- Freestyle ----------
let ronda = null; // { inicio, palabra, proxima } mientras se está jugando

$('fs-beat').replaceChildren(...Object.entries(BEATS).map(([clave, beat]) => new Option(beat.nombre, clave)));
const ajustesFreestyle = () => ({ beat: BEATS[$('fs-beat').value], bpm: Number($('fs-bpm').value) });
const palabraAlAzar = () => palabrasAlAzar(palabrasSimples, 1)[0];

// La palabra separada en sílabas, con la tónica marcada.
function mostrarPalabra(palabra) {
    const { silabas, tonica } = silabaFuerte(palabra) ?? { silabas: [palabra], tonica: 0 };
    $('fs-palabra').replaceChildren(...silabas.flatMap((silaba, i) => {
        const span = document.createElement('span');
        span.textContent = silaba;
        if (i === tonica) span.className = 'tonica';
        const separador = document.createElement('span');
        separador.className = 'separador';
        separador.textContent = '·';
        return i ? [separador, span] : [span];
    }));
}

function alPasoFreestyle(paso) {
    const restantes = segundosRestantes(ronda.inicio, performance.now(), Number($('fs-duracion').value));
    $('fs-reloj').textContent = formatoReloj(restantes);
    if (restantes === 0) return terminarRonda(true);
    document.querySelectorAll('#fs-tiempos span').forEach((s, i) => s.classList.toggle('activo', i + 1 === tiempoDelPaso(paso)));
    if (cambiaLaPalabra(paso, Number($('fs-compases').value))) {
        ronda.palabra = ronda.proxima ?? palabraAlAzar();
        ronda.proxima = palabraAlAzar();
        mostrarPalabra(ronda.palabra);
        $('fs-proxima').textContent = `Después: ${ronda.proxima}`;
    }
}

function empezarRonda() {
    ronda = { inicio: performance.now() };
    $('fs-reloj').classList.remove('terminado');
    $('fs-empezar').textContent = 'Parar';
    iniciarBeat(ajustesFreestyle, alPasoFreestyle);
}

function terminarRonda(porTiempo = false) {
    if (!ronda) return;
    ronda = null;
    detenerBeat();
    $('fs-empezar').textContent = 'Empezar';
    document.querySelectorAll('#fs-tiempos span').forEach(s => s.classList.remove('activo'));
    if (porTiempo) {
        $('fs-reloj').textContent = '¡Tiempo!';
        $('fs-reloj').classList.add('terminado');
    }
}

$('fs-empezar').addEventListener('click', () => ronda ? terminarRonda() : empezarRonda());
$('fs-bpm').addEventListener('input', () => { $('fs-bpm-valor').textContent = `${$('fs-bpm').value} BPM`; });
$('fs-duracion').addEventListener('change', () => { if (!ronda) $('fs-reloj').textContent = formatoReloj(Number($('fs-duracion').value)); });

// ---------- Inicio ----------
renderizarLetras();
renderizarRimas();
refrescarPalabras();
// Armamos el índice de rimas apenas la app termina de aparecer, para que esté listo al buscar.
setTimeout(indiceRimas, 300);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // Cuando llega una versión nueva, recargamos una vez para usarla (las letras
    // están en localStorage, así que no se pierde nada).
    const habiaVersion = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (habiaVersion) location.reload(); });
    navigator.serviceWorker.register('sw.js');
    // Pedimos que el navegador no borre las letras guardadas si le falta espacio.
    navigator.storage?.persist?.();
}
