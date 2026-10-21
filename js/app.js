// Interfaz: solo DOM y navegación. La lógica vive en js/logica/ (módulos puros).
import { parsearPalabras, parsearFrecuencias } from './logica/diccionario.js';
import { palabrasAlAzar } from './logica/generador.js';
import { crearIndiceRimas, buscarRimas, agruparRimas, rimanConsonante } from './logica/rimas.js';
import { contarSilabasVerso, inicioTonica } from './logica/silabas.js';
import { BEATS, tiempoDelPaso, cambiaLaPalabra, silabaFuerte, segundosRestantes, formatoReloj } from './logica/freestyle.js';
import { iniciarBeat, detenerBeat } from './beats.js';
import { nuevaLetra, listarLetras, guardarLetra, borrarLetra, listarFavoritos, alternarFavorito } from './logica/sesiones.js';
import { crearCorrector } from './logica/ortografia.js';
import { AJUSTES_LIBRETA, leerAjustesLibreta, guardarAjusteLibreta, estiloLibreta } from './logica/libreta.js';
import { SECCIONES, separador, esSeparador } from './logica/secciones.js';
import { crearIndiceSinonimos, buscarSinonimos } from './logica/sinonimos.js';
import { leerLink, moverSegundos, cambiarVolumen } from './logica/musica.js';
import { APARIENCIAS, leerApariencia, elegirApariencia } from './logica/apariencia.js';
import { PRODUCTO, TEMAS, tieneExtras, comprarExtras, borrarCompra, mostrarPublicidad, temaDisponible, temaActual, elegirTema } from './logica/compra.js';

const $ = id => document.getElementById(id);

const todasLasPalabras = parsearPalabras(textoPalabras);
const palabrasSimples = parsearPalabras(textoPalabrasSimples);

// El índice de rimas tarda un par de segundos en armarse: se arma una sola vez.
let indice = null, frecuencias = null, corrector = null, sinonimos = null;
const frecuenciasDePalabras = () => frecuencias ??= parsearFrecuencias(textoFrecuencias);
const indiceRimas = () => indice ??= crearIndiceRimas(todasLasPalabras, frecuenciasDePalabras());
const indiceSinonimos = () => sinonimos ??= crearIndiceSinonimos(textoSinonimos, textoFormasSinonimos);
// Errores de tipeo: corregir('balcon') -> 'balcón' (null si está bien escrita).
const corregir = palabra => (corrector ??= crearCorrector(todasLasPalabras, frecuenciasDePalabras()))(palabra);
// La palabra como se quiso escribir, para que rime bien aunque falte la tilde.
const bienEscrita = palabra => palabra && (corregir(palabra) ?? palabra);

// ---------- Pestañas (TabView) ----------
function mostrarPestana(nombre) {
    document.querySelectorAll('.pantalla').forEach(p => p.classList.toggle('activa', p.dataset.pestana === nombre));
    document.querySelectorAll('#barra-pestanas button').forEach(b => b.setAttribute('aria-selected', b.dataset.pestana === nombre));
    if (nombre === 'rimas') reanudarPalabras(); else pausarPalabras();
    if (nombre !== 'freestyle') terminarRonda();
}
document.querySelectorAll('#barra-pestanas button').forEach(b => b.addEventListener('click', () => mostrarPestana(b.dataset.pestana)));

// ---------- Letras (NavigationStack: lista -> editor) ----------
function mostrarVista(id) {
    document.querySelectorAll('#pantalla-letras .vista').forEach(v => v.classList.toggle('activa', v.id === id));
    document.body.classList.toggle('editando', id === 'vista-editor');
    ubicarReproductor();
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
    $('lista-letras').replaceChildren(...letras.map((letra, i) => {
        const tarjeta = document.createElement('li');
        // La primera (la última que se tocó) va grande, arriba; el resto de a dos.
        tarjeta.className = i === 0 ? 'tarjeta-letra destacada' : 'tarjeta-letra';
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
        // Mientras pregunta, la tarjeta queda sobre el tacho.
        const soltar = () => {
            tacho.classList.remove('visible', 'encima');
            tarjeta.classList.remove('arrastrando', 'sobre-tacho');
        };
        const volver = () => {
            soltar();
            tarjeta.classList.add('volviendo');
            tarjeta.style.transform = '';
            setTimeout(() => tarjeta.classList.remove('volviendo'), 300);
        };
        if (!borrar) return volver();
        confirmarBorrado(letra, ok => {
            if (!ok) return volver();
            soltar();
            tarjeta.classList.add('tirada');
            setTimeout(() => { borrarLetra(localStorage, letra.id); renderizarLetras(); }, 250);
        });
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

// Pregunta antes de borrar (como .alert de iOS); avisa con true si se confirmó.
function confirmarBorrado(letra, responder) {
    const alerta = $('confirmar-borrado');
    const titulo = letra.titulo?.trim() || 'Sin título';
    $('confirmar-borrado-texto').textContent = `«${titulo}» se va a borrar y no se puede deshacer.`;
    alerta.hidden = false;
    const cerrar = ok => {
        alerta.hidden = true;
        $('aceptar-borrado').onclick = $('cancelar-borrado').onclick = null;
        responder(ok);
    };
    $('aceptar-borrado').onclick = () => cerrar(true);
    $('cancelar-borrado').onclick = () => cerrar(false);
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
    // Al entrar a una letra empezada no se abre el teclado (se lee primero, pedido de Swa);
    // en una nueva sí, en el título.
    if (!letra.texto) $('editor-titulo').focus();
}

// Desplaza la libreta para que el cursor (la palabra tocada) quede a la vista, arriba del teclado.
// La posición sale de la copia de abajo del texto, que tiene las mismas letras en el mismo lugar.
function mostrarCursor() {
    const cuerpo = editorTexto.closest('.editor');
    let falta = editorTexto.selectionStart;
    const recorrido = document.createTreeWalker($('editor-fondo'), NodeFilter.SHOW_TEXT);
    let nodo;
    while ((nodo = recorrido.nextNode()) && falta > nodo.length) falta -= nodo.length;
    if (!nodo) return;
    const rango = document.createRange();
    rango.setStart(nodo, Math.min(falta, nodo.length));
    const cursor = rango.getClientRects()[0] ?? nodo.parentElement.getBoundingClientRect();
    const visible = cuerpo.getBoundingClientRect();
    const margen = parseFloat(getComputedStyle(editorTexto).lineHeight);
    if (cursor.bottom + margen > visible.bottom) cuerpo.scrollTop += cursor.bottom + margen - visible.bottom;
    else if (cursor.top - margen < visible.top) cuerpo.scrollTop -= visible.top - cursor.top + margen;
}
// El teclado tarda en subir: se acomoda de nuevo cuando termina.
function mostrarCursorDespues() {
    for (const ms of [0, 300, 600]) setTimeout(mostrarCursor, ms);
}

// Alto del texto, o de toda la libreta si es corto (así se puede tocar en cualquier parte).
function ajustarAltoTexto() {
    editorTexto.style.height = 'auto';
    const libreta = editorTexto.closest('.editor');
    const abajo = parseFloat(getComputedStyle(editorTexto.closest('.editor-cuerpo')).paddingBottom) || 0;
    editorTexto.style.height = Math.max(editorTexto.scrollHeight, libreta.clientHeight - $('editor-titulo').offsetHeight - abajo) + 'px';
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
    const palabrasFinales = finales.map(f => bienEscrita(f?.[1]));
    const grupos = $('alternar-colores').getAttribute('aria-pressed') === 'true' ? agruparRimas(palabrasFinales) : [];
    // Consonante con el fondo lleno; asonante con el mismo color, más suave.
    const consonantes = rimanConsonante(palabrasFinales);
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
            if (!esFinal) return parte;
            // Se pinta solo desde la sílaba tónica. Si se corrigió más que una tilde, se mira lo escrito.
            const corregida = bienEscrita(parte);
            const desde = Math.max(0, inicioTonica(corregida.length === parte.length ? corregida : parte));
            return [parte.slice(0, desde), marca(`rima-${grupos[i] % 5}${consonantes[i] ? '' : ' suave'}`, parte.slice(desde))];
        });
        renglon.append(...partes.flat());
        return [renglon, fin];
    }));

    // Un verso largo ocupa varios renglones: la fila de sílabas mide lo mismo que su verso.
    const renglones = $('editor-fondo').children;
    const alto = parseFloat(getComputedStyle(editorTexto).lineHeight);
    [...$('silabas').children].forEach((fila, i) => {
        const lineas = new Set([...renglones[i]?.getClientRects() ?? []].map(r => Math.round(r.top))).size;
        fila.style.height = `${Math.max(1, lineas) * alto}px`;
    });

    // Mientras se escribe no se sugiere nada: las sugerencias aparecen al tocar una palabra.
    reemplazo = null;
    $('sugerencias').hidden = true;
}

// Si se está cambiando una palabra, dónde está: { inicio, fin }. Si no, las sugerencias se agregan.
let reemplazo = null;

// Al cambiar una palabra, la etiqueta es un botón que alterna entre rimas y sinónimos.
function mostrarSugerencias(palabra, etiqueta, rimas = palabra ? buscarRimas(palabra, indiceRimas()).slice(0, 20) : [], alternable = false) {
    const botones = rimas.map(rima => {
        const boton = document.createElement('button');
        boton.className = 'sugerencia';
        boton.textContent = rima;
        return boton;
    });
    if (!rimas.length) {
        const vacio = document.createElement('span');
        vacio.className = 'sugerencias-vacio';
        const que = alternable && verSinonimos ? 'sinónimos' : 'rimas';
        vacio.textContent = `No encontré ${que} para «${palabra}»`;
        botones.push(vacio);
    }
    if (etiqueta && (rimas.length || alternable)) {
        const texto = document.createElement(alternable ? 'button' : 'span');
        texto.className = alternable ? 'sugerencias-etiqueta sugerencias-alternar' : 'sugerencias-etiqueta';
        texto.textContent = etiqueta;
        botones.unshift(texto);
    }
    $('sugerencias').replaceChildren(...botones);
    $('sugerencias').scrollLeft = 0;
    $('sugerencias').hidden = false;
}

// La palabra que se tocó para cambiarla: primero muestra rimas y, si se toca «Cambiar», sinónimos.
let tocada = null, verSinonimos = false;
function mostrarCambio() {
    const palabra = bienEscrita(tocada);
    const lista = verSinonimos ? buscarSinonimos(palabra, indiceSinonimos()).slice(0, 30) : buscarRimas(palabra, indiceRimas()).slice(0, 20);
    mostrarSugerencias(palabra, `${verSinonimos ? 'Sinónimos' : 'Cambiar'} «${tocada}»:`, lista, true);
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
        mostrarCursorDespues();
        return;
    }
    $('sugerencias').hidden = true;
    reemplazo = null;
    // Solo si no está al final de todo (ahí se sigue escribiendo).
    if (selectionStart === value.length) return;
    const antes = value.slice(0, selectionStart).match(/\p{L}*$/u)[0];
    const despues = value.slice(selectionStart).match(/^\p{L}*/u)[0];
    if (!antes && !despues) return;
    mostrarCursorDespues();
    // Si está mal escrita no se avisa: solo se muestran las rimas (o sinónimos) de la palabra que se quiso escribir.
    tocada = antes + despues;
    verSinonimos = false;
    mostrarCambio();
    reemplazo = { inicio: selectionStart - antes.length, fin: selectionStart + despues.length };
});

// Tocar una sugerencia la agrega donde está el cursor (o cambia la palabra tocada), sin cerrar el teclado.
// En iOS el toque llega como mousedown: sin esto el texto pierde el foco y el teclado se cierra.
for (const evento of ['pointerdown', 'mousedown']) $('sugerencias').addEventListener(evento, e => e.preventDefault());
$('sugerencias').addEventListener('click', e => {
    if (e.target.closest('.sugerencias-alternar')) {
        verSinonimos = !verSinonimos;
        mostrarCambio();
        editorTexto.focus();
        return;
    }
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
        if (document.body.classList.contains('editando')) {
            ajustarAltoTexto();
            if (document.activeElement === editorTexto) mostrarCursor();
        }
    };
    visualViewport.addEventListener('resize', ajustarAlTeclado);
    visualViewport.addEventListener('scroll', ajustarAlTeclado);
    ajustarAlTeclado();
}

$('nueva-letra').addEventListener('click', () => abrirEditor(nuevaLetra()));
$('editor-atras').addEventListener('click', () => { mostrarVista('vista-lista-letras'); renderizarLetras(); });
$('borrar-letra').addEventListener('click', () => confirmarBorrado(letraActual, ok => {
    if (!ok) return;
    $('ajustes-libreta').hidden = true;
    borrarLetra(localStorage, letraActual.id);
    mostrarVista('vista-lista-letras');
    renderizarLetras();
}));
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
    const { tamano, alto, letras, fuente } = estiloLibreta(ajustes);
    document.documentElement.style.setProperty('--libreta-letra', `${tamano}px`);
    document.documentElement.style.setProperty('--libreta-alto', `${alto}px`);
    document.documentElement.style.setProperty('--libreta-fuente', fuente);
    document.documentElement.style.setProperty('--libreta-letras', `${letras}em`);
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

// ---------- Rimas (palabras al azar o que riman con la que se escribe) ----------
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
    boton.addEventListener('click', () => { $('buscar-rima').value = palabra; buscarRima(); });
    celda.append(boton, botonFavorito(palabra, alCambiar));
    return celda;
}

const palabraBuscada = () => $('buscar-rima').value.trim().toLowerCase();
const rimasBuscadas = () => buscarRimas(palabraBuscada(), indiceRimas(), { tipo: tipoRima }).slice(0, 100);

// Abajo de las tarjetas, la lista completa de rimas (o las favoritas si no se buscó nada).
function renderizarRimas() {
    const palabra = palabraBuscada();
    const lista = palabra ? rimasBuscadas() : listarFavoritos(localStorage);
    $('resultados-rimas').replaceChildren(...lista.map(p => celdaPalabra(p, palabra ? undefined : renderizarRimas)));
    $('encabezado-resultados').hidden = !lista.length;
    $('encabezado-resultados').textContent = palabra ? `Todas las rimas ${tipoRima}s` : 'Favoritas';
    $('rimas-vacio').textContent = !palabra
        ? 'Escribí una palabra para ver con qué rima. Tocá la estrella para guardarla en favoritas.'
        : `No encontré rimas ${tipoRima}s para «${palabra}».`;
    $('rimas-vacio').hidden = lista.length > 0;
}

function buscarRima() {
    renderizarRimas();
    if (temporizador === null) return refrescarPalabras();
    pausarPalabras();
    reanudarPalabras();
}

$('buscar-rima').addEventListener('input', buscarRima);
document.querySelectorAll('#tipo-rima button').forEach(b => b.addEventListener('click', () => {
    tipoRima = b.dataset.tipo;
    document.querySelectorAll('#tipo-rima button').forEach(o => o.setAttribute('aria-selected', o === b));
    buscarRima();
}));

// Las 6 tarjetas cambian cada 5 segundos.
const CANTIDAD = 6;
const SEGUNDOS = 5;
let temporizador = null;
let pausadoPorUsuario = false;

// De dónde salen las tarjetas: las rimas más usadas de la palabra escrita, o todo el diccionario.
function poolActual() {
    const simples = $('palabras-simples').checked;
    if (!palabraBuscada()) return simples ? palabrasSimples : todasLasPalabras;
    const rimas = rimasBuscadas().slice(0, 60);
    if (!simples) return rimas;
    const conjunto = new Set(palabrasSimples);
    return rimas.filter(p => conjunto.has(p));
}

function refrescarPalabras() {
    const pool = poolActual();
    $('grilla-palabras').replaceChildren(...palabrasAlAzar(pool, CANTIDAD).map(palabra => {
        // Tocar la tarjeta la marca como favorita.
        const tarjeta = document.createElement('button');
        tarjeta.className = 'palabra';
        tarjeta.textContent = palabra;
        tarjeta.setAttribute('aria-pressed', listarFavoritos(localStorage).includes(palabra));
        tarjeta.addEventListener('click', () => {
            tarjeta.setAttribute('aria-pressed', alternarFavorito(localStorage, palabra));
            if (!palabraBuscada()) renderizarRimas();
        });
        return tarjeta;
    }));
    $('palabras-total').textContent = palabraBuscada()
        ? `Tocá una palabra para guardarla en favoritas. Las tarjetas muestran ${pool.length} rimas que se usan mucho.`
        : `Tocá una palabra para guardarla en favoritas. ${pool.length.toLocaleString('es-AR')} palabras disponibles.`;
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

// ---------- Freestyle ----------
let ronda = null; // { inicio, palabra, proxima } mientras se está jugando
const COMPASES_POR_PALABRA = 2;
const BPM_POR_DEFECTO = 90;

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
    $('fs-reloj').style.setProperty('--avance', 1 - restantes / Number($('fs-duracion').value));
    if (cambiaLaPalabra(paso, COMPASES_POR_PALABRA)) {
        ronda.palabra = ronda.proxima ?? palabraAlAzar();
        ronda.proxima = palabraAlAzar();
        mostrarPalabra(ronda.palabra);
        $('fs-proxima').textContent = `Después: ${ronda.proxima}`;
    }
}

function empezarRonda() {
    ronda = { inicio: performance.now() };
    $('fs-reloj').classList.remove('terminado');
    $('fs-reloj').style.setProperty('--avance', 0);
    $('fs-empezar').textContent = 'Parar';
    iniciarBeat(ajustesFreestyle, alPasoFreestyle);
}

function terminarRonda(porTiempo = false) {
    if (!ronda) return;
    ronda = null;
    detenerBeat();
    $('fs-empezar').textContent = 'Empezar';
    document.querySelectorAll('#fs-tiempos span').forEach(s => s.classList.remove('activo'));
    if (!porTiempo) $('fs-reloj').style.setProperty('--avance', 0);
    if (porTiempo) {
        $('fs-reloj').textContent = '¡Tiempo!';
        $('fs-reloj').classList.add('terminado');
    }
}

$('fs-empezar').addEventListener('click', () => ronda ? terminarRonda() : empezarRonda());
$('fs-bpm').addEventListener('input', () => { $('fs-bpm-valor').textContent = `${$('fs-bpm').value} BPM`; });
$('fs-bpm-reiniciar').addEventListener('click', () => {
    $('fs-bpm').value = BPM_POR_DEFECTO;
    $('fs-bpm').dispatchEvent(new Event('input'));
});
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

// ---------- Música para escribir encima (YouTube o SoundCloud) ----------
// Usa los reproductores oficiales, que se bajan recién cuando se pega un link (necesitan internet).
const PASO_SEGUNDOS = 10, PASO_VOLUMEN = 10;
let musica = null; // { fuente, alternar(), mover(segundos), volumen(0-100), cerrar() }
let volumen = 70, sonando = false;

function cargarScript(src) {
    return new Promise((listo, error) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = listo;
        script.onerror = error;
        document.head.append(script);
    });
}
const apiYouTube = () => window.YT?.Player ? Promise.resolve() : new Promise((listo, error) => {
    window.onYouTubeIframeAPIReady = listo;
    cargarScript('https://www.youtube.com/iframe_api').catch(error);
});
const apiSoundCloud = () => window.SC?.Widget ? Promise.resolve() : cargarScript('https://w.soundcloud.com/player/api.js');

function mostrarEstadoMusica() {
    const nombre = { youtube: 'YouTube', soundcloud: 'SoundCloud' }[musica?.fuente] ?? '';
    $('reproductor-fuente').textContent = `${nombre} · volumen ${volumen}%`;
    $('musica-play').setAttribute('aria-label', sonando ? 'Pausar' : 'Reproducir');
    $('musica-play').innerHTML = sonando
        ? '<svg viewBox="0 0 24 24" class="icono"><path d="M8 5v14M16 5v14"/></svg>'
        : '<svg viewBox="0 0 24 24" class="icono icono-relleno"><path d="M7 4l13 8-13 8z"/></svg>';
}

function avisoMusica(texto) {
    $('musica-aviso').textContent = texto;
    $('musica-aviso').hidden = !texto;
}

async function escucharMusica() {
    const link = leerLink($('link-musica').value);
    if (!link) return avisoMusica('Ese link no es de YouTube ni de SoundCloud.');
    if (!navigator.onLine) return avisoMusica('Sin internet no se puede escuchar música. Lo demás de Métrica anda igual.');
    avisoMusica('');
    cerrarMusica();
    $('hoja-musica').hidden = true;
    $('reproductor-titulo').textContent = 'Cargando…';
    $('reproductor').hidden = false;
    document.body.classList.add('con-musica');
    musica = { fuente: link.fuente };
    mostrarEstadoMusica();
    const lugar = document.createElement('div');
    $('reproductor-marco').replaceChildren(lugar);
    try {
        if (link.fuente === 'youtube') {
            await apiYouTube();
            const reproductor = new YT.Player(lugar, {
                videoId: link.id, width: 64, height: 64,
                playerVars: { autoplay: 1, playsinline: 1, start: link.inicio, controls: 0, rel: 0 },
                events: {
                    onReady: e => { e.target.setVolume(volumen); e.target.playVideo(); },
                    onStateChange: e => {
                        sonando = e.data === YT.PlayerState.PLAYING;
                        const titulo = reproductor.getVideoData?.().title;
                        if (titulo) $('reproductor-titulo').textContent = titulo;
                        mostrarEstadoMusica();
                    },
                    onError: () => { $('reproductor-titulo').textContent = 'No se pudo reproducir este video'; },
                },
            });
            Object.assign(musica, {
                alternar: () => sonando ? reproductor.pauseVideo() : reproductor.playVideo(),
                mover: cambio => reproductor.seekTo(moverSegundos(reproductor.getCurrentTime(), cambio, reproductor.getDuration()), true),
                volumen: v => reproductor.setVolume(v),
                cerrar: () => reproductor.destroy(),
            });
        } else {
            await apiSoundCloud();
            const marco = document.createElement('iframe');
            marco.allow = 'autoplay';
            marco.title = 'SoundCloud';
            marco.src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(link.url)}&auto_play=true&visual=true&hide_related=true&show_comments=false&show_user=false&show_reposts=false&show_teaser=false`;
            lugar.replaceWith(marco);
            const widget = SC.Widget(marco);
            const { Events } = SC.Widget;
            widget.bind(Events.READY, () => {
                widget.setVolume(volumen);
                widget.play();
                widget.getCurrentSound(cancion => { if (cancion?.title) $('reproductor-titulo').textContent = cancion.title; });
            });
            widget.bind(Events.PLAY, () => { sonando = true; mostrarEstadoMusica(); });
            widget.bind(Events.PAUSE, () => { sonando = false; mostrarEstadoMusica(); });
            widget.bind(Events.FINISH, () => { sonando = false; mostrarEstadoMusica(); });
            widget.bind(Events.ERROR, () => { $('reproductor-titulo').textContent = 'No se pudo reproducir esta canción'; });
            Object.assign(musica, {
                alternar: () => widget.toggle(),
                mover: cambio => widget.getPosition(ms => widget.getDuration(total =>
                    widget.seekTo(moverSegundos(ms / 1000, cambio, total / 1000) * 1000))),
                volumen: v => widget.setVolume(v),
                cerrar: () => marco.remove(),
            });
        }
    } catch {
        $('reproductor-titulo').textContent = 'No se pudo cargar el reproductor. ¿Hay internet?';
    }
}

function cerrarMusica() {
    musica?.cerrar?.();
    musica = null;
    sonando = false;
    $('reproductor-marco').replaceChildren();
    $('reproductor').hidden = true;
    document.body.classList.remove('con-musica');
}

// El banner va abajo: en la libreta, arriba de las sugerencias (o del teclado); en las pestañas, arriba de la barra.
function ubicarReproductor() {
    const banner = $('reproductor');
    if (banner.hidden) return;
    let abajo;
    if (document.body.classList.contains('editando')) {
        const visible = window.visualViewport;
        const teclado = visible ? Math.max(0, innerHeight - visible.offsetTop - visible.height) : 0;
        abajo = teclado + $('sugerencias').offsetHeight;
    } else {
        abajo = innerHeight - $('barra-pestanas').getBoundingClientRect().top;
    }
    banner.style.bottom = `${abajo + 8}px`;
    banner.classList.toggle('sobre-borde', document.body.classList.contains('editando') && abajo === 0);
    document.documentElement.style.setProperty('--alto-reproductor', `${banner.offsetHeight + 16}px`);
}
new ResizeObserver(ubicarReproductor).observe($('sugerencias'));
new ResizeObserver(ubicarReproductor).observe($('reproductor'));
window.visualViewport?.addEventListener('resize', ubicarReproductor);
window.visualViewport?.addEventListener('scroll', ubicarReproductor);
addEventListener('resize', ubicarReproductor);

$('abrir-musica').addEventListener('click', () => {
    avisoMusica(navigator.onLine ? '' : 'Sin internet no se puede escuchar música. Lo demás de Métrica anda igual.');
    $('hoja-musica').hidden = false;
    $('link-musica').focus();
});
$('cerrar-musica').addEventListener('click', () => { $('hoja-musica').hidden = true; });
$('hoja-musica').addEventListener('click', e => { if (e.target === $('hoja-musica')) $('hoja-musica').hidden = true; });
$('pegar-musica').addEventListener('click', async () => {
    try { $('link-musica').value = await navigator.clipboard.readText(); } catch { avisoMusica('No pude leer lo copiado: pegalo con el dedo en el campo.'); }
});
$('escuchar-musica').addEventListener('click', escucharMusica);
$('link-musica').addEventListener('keydown', e => { if (e.key === 'Enter') escucharMusica(); });
$('musica-play').addEventListener('click', () => musica?.alternar?.());
$('musica-atrasar').addEventListener('click', () => musica?.mover?.(-PASO_SEGUNDOS));
$('musica-adelantar').addEventListener('click', () => musica?.mover?.(PASO_SEGUNDOS));
for (const [id, cambio] of [['musica-bajar', -PASO_VOLUMEN], ['musica-subir', PASO_VOLUMEN]]) {
    $(id).addEventListener('click', () => {
        volumen = cambiarVolumen(volumen, cambio);
        musica?.volumen?.(volumen);
        mostrarEstadoMusica();
    });
}
$('musica-cerrar').addEventListener('click', cerrarMusica);
// Tocar los botones del banner no le saca el foco al texto (el teclado queda abierto).
for (const evento of ['pointerdown', 'mousedown']) $('reproductor').addEventListener(evento, e => { if (e.target.closest('button')) e.preventDefault(); });

// ---------- Apariencia (claro / oscuro / sistema) ----------
function renderizarApariencia() {
    const actual = leerApariencia(localStorage);
    document.documentElement.dataset.apariencia = actual;
    // La franja de la hora en Safari sigue a la apariencia elegida.
    const [claro, oscuro] = document.querySelectorAll('meta[name="theme-color"]');
    claro.content = actual === 'oscuro' ? '#202123' : '#eaedee';
    oscuro.content = actual === 'claro' ? '#eaedee' : '#202123';
    $('apariencia').replaceChildren(...Object.entries(APARIENCIAS).map(([clave, nombre]) => {
        const celda = document.createElement('li');
        celda.className = 'celda';
        const boton = document.createElement('button');
        boton.className = 'celda-boton celda-tema';
        boton.dataset.apariencia = clave;
        boton.setAttribute('aria-pressed', clave === actual);
        const texto = document.createElement('span');
        texto.textContent = nombre;
        const marca = document.createElement('span');
        marca.className = 'marca-apariencia';
        marca.innerHTML = clave === actual ? TILDE : '';
        boton.append(texto, marca);
        boton.addEventListener('click', () => { elegirApariencia(localStorage, clave); renderizarApariencia(); });
        celda.append(boton);
        return celda;
    }));
}

// ---------- Inicio ----------
renderizarApariencia();
renderizarExtras();
renderizarLetras();
renderizarRimas();
refrescarPalabras();
// Armamos el índice de rimas apenas la app termina de aparecer, para que esté listo al buscar.
setTimeout(() => { indiceRimas(); corregir(''); }, 300);

// La versión es el nombre de la caché del service worker ("metrica-0.2" -> "0.2").
async function mostrarVersion() {
    const claves = await caches.keys();
    const version = claves.find(c => c.startsWith('metrica-'))?.slice('metrica-'.length);
    if (version) $('version').textContent = version;
}

// Forzar actualización: borra la caché y el service worker y recarga, así baja todo de nuevo.
// Sin internet no se hace, para no quedarse sin la app.
$('forzar-actualizacion').addEventListener('click', async () => {
    if (!navigator.onLine) {
        $('version').textContent = 'Sin internet';
        return setTimeout(mostrarVersion, 2000);
    }
    $('forzar-actualizacion').classList.add('girando');
    const registros = await navigator.serviceWorker?.getRegistrations() ?? [];
    await Promise.all(registros.map(r => r.unregister()));
    await Promise.all((await caches.keys()).map(c => caches.delete(c)));
    location.reload();
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // Cuando llega una versión nueva, recargamos una vez para usarla (las letras
    // están en localStorage, así que no se pierde nada).
    const habiaVersion = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (habiaVersion) location.reload(); });
    navigator.serviceWorker.register('sw.js');
    mostrarVersion();
    navigator.serviceWorker.ready.then(mostrarVersion);
    // Pedimos que el navegador no borre las letras guardadas si le falta espacio.
    navigator.storage?.persist?.();
}
