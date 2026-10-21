// Interfaz: solo DOM y navegación. La lógica vive en js/logica/ (módulos puros).
import { parsearPalabras, parsearFrecuencias } from './logica/diccionario.js';
import { palabrasAlAzar, filtrarPorTerminacion } from './logica/generador.js';
import { crearIndiceRimas, buscarRimas, agruparRimas } from './logica/rimas.js';
import { contarSilabasVerso } from './logica/silabas.js';
import { BEATS, tiempoDelPaso, cambiaLaPalabra, silabaFuerte, segundosRestantes, formatoReloj } from './logica/freestyle.js';
import { iniciarBeat, detenerBeat } from './beats.js';
import { nuevaLetra, listarLetras, guardarLetra, borrarLetra, listarFavoritos, alternarFavorito } from './logica/sesiones.js';
import { crearCorrector } from './logica/ortografia.js';
import { AJUSTES_LIBRETA, leerAjustesLibreta, guardarAjusteLibreta, estiloLibreta } from './logica/libreta.js';
import { SECCIONES, separador, esSeparador } from './logica/secciones.js';
import { PRODUCTO, TEMAS, tieneExtras, comprarExtras, borrarCompra, mostrarPublicidad, temaDisponible, temaActual, elegirTema } from './logica/compra.js';

const $ = id => document.getElementById(id);

const todasLasPalabras = parsearPalabras(textoPalabras);
const palabrasSimples = parsearPalabras(textoPalabrasSimples);

// El índice de rimas tarda un par de segundos en armarse: se arma una sola vez.
let indice = null, frecuencias = null, corrector = null;
const frecuenciasDePalabras = () => frecuencias ??= parsearFrecuencias(textoFrecuencias);
const indiceRimas = () => indice ??= crearIndiceRimas(todasLasPalabras, frecuenciasDePalabras());
// Errores de tipeo: corregir('balcon') -> 'balcón' (null si está bien escrita).
const corregir = palabra => (corrector ??= crearCorrector(todasLasPalabras, frecuenciasDePalabras()))(palabra);
// La palabra como se quiso escribir, para que rime bien aunque falte la tilde.
const bienEscrita = palabra => palabra && (corregir(palabra) ?? palabra);

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
    // Cada letra es una tarjeta con la fecha, el título y el principio del texto.
    const parte = (clase, texto) => {
        const span = document.createElement('span');
        span.className = clase;
        span.textContent = texto;
        return span;
    };
    $('lista-letras').replaceChildren(...letras.map(letra => {
        const tarjeta = document.createElement('li');
        tarjeta.className = 'tarjeta-letra';
        const boton = document.createElement('button');
        const fecha = new Date(letra.editada).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
        boton.append(parte('fecha-letra', fecha), parte('titulo-letra', letra.titulo || 'Sin título'), parte('texto-letra', letra.texto.trim()));
        const fueArrastrada = arrastrarParaBorrar(tarjeta, boton, letra);
        boton.addEventListener('click', () => { if (!fueArrastrada()) abrirEditor(letra); });
        tarjeta.append(boton);
        return tarjeta;
    }));
    $('letras-vacio').hidden = letras.length > 0;
}

// Para borrar una letra se mantiene apretada la tarjeta y se la arrastra al tacho, que aparece
// entre el título y las tarjetas. En SwiftUI: .draggable en la tarjeta y .dropDestination en el tacho.
function arrastrarParaBorrar(tarjeta, boton, letra) {
    let espera = null, arrastrando = false, arrastrada = false, inicio = null, desde = null, dedo = null, cuadro = null;
    const tacho = $('tacho');
    const sobreTacho = () => {
        const r = tacho.getBoundingClientRect();
        return dedo.x >= r.left && dedo.x <= r.right && dedo.y >= r.top - 12 && dedo.y <= r.bottom + 12;
    };
    // La tarjeta sigue al dedo aunque la grilla se corra cuando aparece el tacho
    // (offsetLeft/offsetTop no cambian con el transform, solo con la grilla).
    const seguir = () => {
        const x = dedo.x - inicio.x - (tarjeta.offsetLeft - desde.left);
        const y = dedo.y - inicio.y - (tarjeta.offsetTop - desde.top);
        tarjeta.style.transform = `translate(${x}px, ${y}px)`;
        tacho.classList.toggle('encima', sobreTacho());
        tarjeta.classList.toggle('sobre-tacho', sobreTacho());
        cuadro = requestAnimationFrame(seguir);
    };
    const empezar = () => {
        arrastrando = arrastrada = true;
        desde = { left: tarjeta.offsetLeft, top: tarjeta.offsetTop };
        tarjeta.classList.add('arrastrando');
        tacho.classList.add('visible');
        navigator.vibrate?.(10);
        seguir();
    };
    const terminar = () => {
        clearTimeout(espera);
        inicio = null;
        if (!arrastrando) return;
        arrastrando = false;
        cancelAnimationFrame(cuadro);
        const borrar = sobreTacho();
        tacho.classList.remove('visible', 'encima');
        tarjeta.classList.remove('arrastrando', 'sobre-tacho');
        if (borrar) {
            tarjeta.classList.add('tirada');
            setTimeout(() => { borrarLetra(localStorage, letra.id); renderizarLetras(); }, 250);
        } else {
            tarjeta.classList.add('volviendo');
            tarjeta.style.transform = '';
            setTimeout(() => tarjeta.classList.remove('volviendo'), 300);
        }
    };
    boton.addEventListener('pointerdown', e => {
        arrastrada = false;
        inicio = dedo = { x: e.clientX, y: e.clientY };
        boton.setPointerCapture?.(e.pointerId);
        espera = setTimeout(empezar, 350);
    });
    boton.addEventListener('pointermove', e => {
        if (!inicio) return; // el mouse pasando por arriba, sin apretar
        dedo = { x: e.clientX, y: e.clientY };
        // Si se mueve antes de tiempo es que quiere desplazar la pantalla, no arrastrar.
        if (!arrastrando && Math.hypot(dedo.x - inicio.x, dedo.y - inicio.y) > 10) clearTimeout(espera);
    });
    boton.addEventListener('pointerup', terminar);
    boton.addEventListener('pointercancel', terminar);
    // Mientras se arrastra, que el dedo no desplace la pantalla (iOS).
    boton.addEventListener('touchmove', e => { if (arrastrando) e.preventDefault(); }, { passive: false });
    boton.addEventListener('contextmenu', e => e.preventDefault());
    // Después de arrastrar no se abre la letra.
    return () => { const fue = arrastrada; arrastrada = false; return fue; };
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
    mostrarVista('vista-editor');
    actualizarEditor();
    $('editor-titulo').focus();
}

// Alto del texto, o de toda la libreta si es corto (así se puede tocar en cualquier parte).
function ajustarAltoTexto() {
    editorTexto.style.height = 'auto';
    editorTexto.style.height = Math.max(editorTexto.scrollHeight, editorTexto.closest('.editor-cuerpo').clientHeight) + 'px';
}

function actualizarEditor() {
    ajustarAltoTexto();

    const versos = editorTexto.value.split('\n');

    // Sílabas por verso (vacío en los versos sin palabras), contando las palabras como se quisieron escribir.
    $('silabas').replaceChildren(...versos.map(verso => {
        const fila = document.createElement('div');
        fila.textContent = esSeparador(verso) ? '' : contarSilabasVerso(verso.replace(/\p{L}+/gu, bienEscrita)) || '';
        return fila;
    }));

    // Rimas pintadas: la última palabra de cada verso, con el color de su grupo.
    const finales = versos.map(verso => esSeparador(verso) ? null : verso.match(/(\p{L}+)[^\p{L}]*$/u));
    const grupos = $('alternar-colores').getAttribute('aria-pressed') === 'true'
        ? agruparRimas(finales.map(f => bienEscrita(f?.[1]))) : [];
    const marca = (clase, texto) => {
        const elemento = document.createElement('mark');
        elemento.className = clase;
        elemento.textContent = texto;
        return elemento;
    };
    $('editor-fondo').replaceChildren(...versos.flatMap((verso, i) => {
        const fin = i < versos.length - 1 ? '\n' : '';
        const renglon = document.createElement('span');
        if (esSeparador(verso)) {
            renglon.append(marca('seccion', verso));
            return [renglon, fin];
        }
        const partes = verso.split(/(\p{L}+)/u).map((parte, j) => {
            if (j % 2 === 0) return parte;
            const esFinal = grupos[i] != null && j === verso.split(/(\p{L}+)/u).length - 2;
            return esFinal ? marca(`rima-${grupos[i] % 5}`, parte) : parte;
        });
        renglon.append(...partes);
        return [renglon, fin];
    }));

    // Un verso largo ocupa varios renglones: la fila de sílabas mide lo mismo que su verso.
    const renglones = $('editor-fondo').children;
    const alto = parseFloat(getComputedStyle(editorTexto).lineHeight);
    [...$('silabas').children].forEach((fila, i) => {
        const lineas = new Set([...renglones[i]?.getClientRects() ?? []].map(r => Math.round(r.top))).size;
        fila.style.height = `${Math.max(1, lineas) * alto}px`;
    });

    // Sugerencias para la última palabra escrita (en un verso vacío, la del verso anterior).
    const antes = editorTexto.value.slice(0, editorTexto.selectionEnd).split('\n').filter(v => !esSeparador(v)).join('\n');
    const ultima = bienEscrita(antes.match(/(\p{L}+)[^\p{L}]*$/u)?.[1]);
    reemplazo = null;
    mostrarSugerencias(ultima);
}

// Si se está cambiando una palabra, dónde está: { inicio, fin }. Si no, las sugerencias se agregan.
let reemplazo = null;

function mostrarSugerencias(palabra, etiqueta, rimas = palabra ? buscarRimas(palabra, indiceRimas()).slice(0, 20) : []) {
    if (rimas.length) {
        const botones = rimas.map(rima => {
            const boton = document.createElement('button');
            boton.className = 'sugerencia';
            boton.textContent = rima;
            return boton;
        });
        if (etiqueta) {
            const texto = document.createElement('span');
            texto.className = 'sugerencias-etiqueta';
            texto.textContent = etiqueta;
            botones.unshift(texto);
        }
        $('sugerencias').replaceChildren(...botones);
    } else {
        const vacio = document.createElement('span');
        vacio.className = 'sugerencias-vacio';
        vacio.textContent = palabra ? `No encontré rimas para «${palabra}»` : 'Acá van a aparecer rimas mientras escribís';
        $('sugerencias').replaceChildren(vacio);
    }
    $('sugerencias').scrollLeft = 0;
}

// Tocar un renglón vacío ofrece marcar una parte de la letra; tocar una palabra muestra
// otras que riman con ella, para cambiarla.
editorTexto.addEventListener('click', () => {
    const { value, selectionStart } = editorTexto;
    const inicioVerso = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const finVerso = value.indexOf('\n', selectionStart) < 0 ? value.length : value.indexOf('\n', selectionStart);
    if (!value.slice(inicioVerso, finVerso).trim()) {
        mostrarSugerencias(null, 'Marcar:', SECCIONES);
        reemplazo = { inicio: inicioVerso, fin: finVerso, seccion: true };
        return;
    }
    // Solo si no está al final de todo (ahí se sigue escribiendo).
    if (selectionStart === value.length) return;
    const antes = value.slice(0, selectionStart).match(/\p{L}*$/u)[0];
    const despues = value.slice(selectionStart).match(/^\p{L}*/u)[0];
    if (!antes && !despues) return;
    // Si está mal escrita no se avisa: solo se muestran las rimas de la palabra que se quiso escribir.
    mostrarSugerencias(bienEscrita(antes + despues), `Cambiar «${antes + despues}»:`);
    reemplazo = { inicio: selectionStart - antes.length, fin: selectionStart + despues.length };
});

// Tocar una sugerencia la agrega donde está el cursor (o cambia la palabra tocada), sin cerrar el teclado.
$('sugerencias').addEventListener('pointerdown', e => e.preventDefault());
$('sugerencias').addEventListener('click', e => {
    const boton = e.target.closest('.sugerencia');
    if (!boton) return;
    if (reemplazo?.seccion) {
        // Si el renglón de arriba tiene texto, deja uno en blanco antes del separador.
        const arriba = editorTexto.value.slice(0, Math.max(0, reemplazo.inicio - 1));
        const espacio = arriba.slice(arriba.lastIndexOf('\n') + 1).trim() ? '\n' : '';
        editorTexto.setRangeText(espacio + separador(boton.textContent), reemplazo.inicio, reemplazo.fin, 'end');
    } else if (reemplazo) {
        // Si la palabra empezaba con mayúscula, la nueva también.
        const mayuscula = /^\p{Lu}/u.test(editorTexto.value[reemplazo.inicio]);
        const nueva = mayuscula ? boton.textContent[0].toUpperCase() + boton.textContent.slice(1) : boton.textContent;
        editorTexto.setRangeText(nueva, reemplazo.inicio, reemplazo.fin, 'end');
    } else {
        const { value, selectionStart, selectionEnd } = editorTexto;
        const espacio = selectionStart > 0 && !/\s/.test(value[selectionStart - 1]) ? ' ' : '';
        editorTexto.setRangeText(espacio + boton.textContent, selectionStart, selectionEnd, 'end');
    }
    editorTexto.focus();
    actualizarEditor();
    guardarActual();
});

// Lo que queda visible de la pantalla con el teclado abierto (ver estilos.css).
if (window.visualViewport) {
    const ajustarAlTeclado = () => {
        document.documentElement.style.setProperty('--alto-visible', `${visualViewport.height}px`);
        document.documentElement.style.setProperty('--arriba-visible', `${visualViewport.offsetTop}px`);
        // Con el teclado abierto no hace falta dejar lugar para la barrita de inicio del iPhone.
        document.body.classList.toggle('teclado-abierto', visualViewport.height < innerHeight * 0.8);
        if (document.body.classList.contains('editando')) ajustarAltoTexto();
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
// Colores, renglones y sílabas se prenden y apagan, y se recuerda la elección.
function aplicarAlternables() {
    $('silabas').classList.toggle('oculto', !$('mostrar-silabas').checked);
    document.querySelector('.editor-capas').classList.toggle('renglones', $('alternar-renglones').getAttribute('aria-pressed') === 'true');
}
$('mostrar-silabas').checked = localStorage.getItem('metrica.alternar-silabas') !== 'false';
$('mostrar-silabas').addEventListener('change', () => {
    localStorage.setItem('metrica.alternar-silabas', $('mostrar-silabas').checked);
    aplicarAlternables();

    actualizarEditor();
});
for (const id of ['alternar-colores', 'alternar-renglones']) {
    if (localStorage.getItem(`metrica.${id}`) === 'false') $(id).setAttribute('aria-pressed', 'false');
    $(id).addEventListener('click', e => {
        const boton = e.currentTarget;
        boton.setAttribute('aria-pressed', boton.getAttribute('aria-pressed') !== 'true');
        localStorage.setItem(`metrica.${id}`, boton.getAttribute('aria-pressed'));
        aplicarAlternables();
        actualizarEditor();
    });
}
aplicarAlternables();

// Ajustes de la libreta (la ruedita): sílabas, tamaño de letra, separación y fuente.
function aplicarAjustesLibreta() {
    const ajustes = leerAjustesLibreta(localStorage);
    const { tamano, alto, fuente } = estiloLibreta(ajustes);
    document.documentElement.style.setProperty('--libreta-letra', `${tamano}px`);
    document.documentElement.style.setProperty('--libreta-alto', `${alto}px`);
    document.documentElement.style.setProperty('--libreta-fuente', fuente);
    $('opciones-libreta').replaceChildren(...Object.entries(AJUSTES_LIBRETA).flatMap(([clave, ajuste]) => {
        const titulo = document.createElement('h3');
        titulo.className = 'encabezado-grupo';
        titulo.textContent = ajuste.nombre;
        const grupo = document.createElement('div');
        grupo.className = 'segmentado';
        grupo.setAttribute('role', 'tablist');
        grupo.dataset.ajuste = clave;
        grupo.append(...Object.entries(ajuste.opciones).map(([opcion, { nombre }]) => {
            const boton = document.createElement('button');
            boton.setAttribute('role', 'tab');
            boton.setAttribute('aria-selected', opcion === ajustes[clave]);
            boton.dataset.opcion = opcion;
            boton.textContent = nombre;
            boton.addEventListener('click', () => {
                guardarAjusteLibreta(localStorage, clave, opcion);
                aplicarAjustesLibreta();
                actualizarEditor();
            });
            return boton;
        }));
        return [titulo, grupo];
    }));
}
aplicarAjustesLibreta();
$('abrir-ajustes-libreta').addEventListener('click', () => { $('ajustes-libreta').hidden = false; });
$('cerrar-ajustes-libreta').addEventListener('click', () => { $('ajustes-libreta').hidden = true; });
$('ajustes-libreta').addEventListener('click', e => { if (e.target === $('ajustes-libreta')) $('ajustes-libreta').hidden = true; });

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

// ---------- Métrica Extras (paywall) ----------
const CANDADO = '<svg viewBox="0 0 24 24" class="icono"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
const TILDE = '<svg viewBox="0 0 24 24" class="icono"><path d="M5 12l5 5 9-10"/></svg>';

function renderizarExtras() {
    const extras = tieneExtras(localStorage);
    document.querySelectorAll('.publicidad').forEach(p => { p.hidden = !mostrarPublicidad(localStorage); });
    $('estado-extras').textContent = extras ? 'Comprado. ¡Gracias!' : `Sin publicidad, temas y widgets · ${PRODUCTO.precio}`;
    $('comprar-extras').textContent = extras ? 'Ya tenés Métrica Extras' : `Desbloquear por ${PRODUCTO.precio}`;
    $('comprar-extras').disabled = extras;
    document.body.dataset.libreta = temaActual(localStorage);
    // Lista de temas (Picker .inline): tilde en el elegido, candado en los bloqueados.
    $('temas-libreta').replaceChildren(...TEMAS.map(tema => {
        const celda = document.createElement('li');
        celda.className = 'celda';
        const boton = document.createElement('button');
        boton.className = 'celda-boton celda-tema';
        boton.dataset.tema = tema.clave;
        const muestra = document.createElement('span');
        muestra.className = 'muestra-tema';
        muestra.dataset.libreta = tema.clave;
        const nombre = document.createElement('span');
        nombre.textContent = tema.nombre;
        const marca = document.createElement('span');
        marca.className = 'marca-tema';
        marca.innerHTML = !temaDisponible(tema.clave, localStorage) ? CANDADO : tema.clave === temaActual(localStorage) ? TILDE : '';
        boton.append(muestra, nombre, marca);
        boton.addEventListener('click', () => elegirTema(localStorage, tema.clave) ? renderizarExtras() : abrirPaywall());
        celda.append(boton);
        return celda;
    }));
}

function abrirPaywall() {
    // Los widgets de muestra usan datos reales: una palabra y la última letra.
    const palabra = palabraAlAzar();
    $('widget-palabra').textContent = palabra;
    $('widget-rimas').textContent = `rima con ${buscarRimas(palabra, indiceRimas())[0] ?? '…'}`;
    $('widget-letra').textContent = listarLetras(localStorage)[0]?.titulo || 'Tu última letra';
    $('paywall-nota').textContent = 'Prueba: la compra es simulada, no se cobra nada.';
    $('paywall').hidden = false;
}

document.addEventListener('click', e => { if (e.target.closest('[data-paywall]')) abrirPaywall(); });
$('cerrar-paywall').addEventListener('click', () => { $('paywall').hidden = true; });
$('paywall').addEventListener('click', e => { if (e.target === $('paywall')) $('paywall').hidden = true; });
$('comprar-extras').addEventListener('click', () => {
    comprarExtras(localStorage);
    renderizarExtras();
    $('paywall-nota').textContent = '¡Listo! Ya tenés Métrica Extras.';
});
$('restaurar-compra').addEventListener('click', () => {
    $('paywall-nota').textContent = tieneExtras(localStorage) ? 'Tu compra ya está activa.' : 'No encontramos compras para restaurar.';
});
$('borrar-compra').addEventListener('click', () => { borrarCompra(localStorage); renderizarExtras(); });

// ---------- Inicio ----------
renderizarExtras();
renderizarLetras();
renderizarRimas();
refrescarPalabras();
// Armamos el índice de rimas apenas la app termina de aparecer, para que esté listo al buscar.
setTimeout(() => { indiceRimas(); corregir(''); }, 300);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // Cuando llega una versión nueva, recargamos una vez para usarla (las letras
    // están en localStorage, así que no se pierde nada).
    const habiaVersion = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (habiaVersion) location.reload(); });
    navigator.serviceWorker.register('sw.js');
    // Pedimos que el navegador no borre las letras guardadas si le falta espacio.
    navigator.storage?.persist?.();
}
