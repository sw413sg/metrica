// Interfaz: solo DOM y navegación. La lógica vive en js/logica/ (módulos puros).
import { parsearPalabras, parsearFrecuencias } from './logica/diccionario.js';
import { palabrasAlAzar } from './logica/generador.js';
import { crearIndiceRimas, buscarRimas, agruparRimas, rimanConsonante, rimasInternas, claveAsonante, ANGLICISMOS } from './logica/rimas.js';
import { contarSilabasVerso, inicioTonica, rimasMultisilabicas, separarSilabas } from './logica/silabas.js';
import { CATALOGO_BEATS, GENEROS_BEAT, beatsDeGenero, beatVecino, DURACIONES, DURACION_INICIAL, cambiaLaPalabra, silabaFuerte, estadoRonda, elegirDuracion, fuenteFreestyle, patronDeBeat, archivoDeBeat, etiquetaBeat, proximasPalabras, avanzarPalabras, msPorPalabra, leerVelocidad, guardarVelocidad, compasesDeVelocidad, VELOCIDAD_MAXIMA } from './logica/freestyle.js';
import { iniciarBeat, iniciarArchivo, detenerBeat, precargarArchivo } from './beats.js';
import { nuevaLetra, listarLetras, guardarLetra, borrarLetra, moverLetra, lugarEnGrilla, listarFavoritos, alternarFavorito } from './logica/sesiones.js';
import { crearCorrector } from './logica/ortografia.js';
import { AJUSTES_LIBRETA, leerAjustesLibreta, guardarAjusteLibreta, estiloLibreta } from './logica/libreta.js';
import { SECCIONES, separador, esSeparador } from './logica/secciones.js';
import { crearIndiceSinonimos, buscarSinonimos } from './logica/sinonimos.js';
import { crearEfecto } from './efectos.js';
import { moodDeTitulo, moodDeBeat, tiemposEn, leerCantidadEfectos, guardarCantidadEfectos, EFECTOS_MAXIMO } from './logica/ambiente.js';
import { leerLink, esLista, formatoTiempo, fraccionDe, segundosEn, imantar, LADO_YOUTUBE, urlWidgetSoundCloud, resolverLinkSoundCloud, plegarVideo, alternarReproduccion, pausarAlOcultar, tarjetaGrande, portadaSoundCloud } from './logica/musica.js';
import { leerRecientes, agregarReciente, quitarReciente, titularReciente, sufijoReciente, tituloDeArchivo } from './logica/recientes.js';
import { APARIENCIAS, leerApariencia, elegirApariencia } from './logica/apariencia.js';
import { PRODUCTO, TEMAS, tieneExtras, comprarExtras, borrarCompra, mostrarPublicidad, temaDisponible, temaActual, elegirTema } from './logica/compra.js';

const $ = id => document.getElementById(id);
const COLORES_RIMA = 12;

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
// Las palabras en inglés que se usan en letras (face, mail...) no se corrigen.
const bienEscrita = palabra => palabra && (ANGLICISMOS.has(palabra.toLowerCase()) ? palabra : corregir(palabra) ?? palabra);

// ---------- Pestañas (TabView) ----------
function mostrarPestana(nombre) {
    document.querySelectorAll('.pantalla').forEach(p => p.classList.toggle('activa', p.dataset.pestana === nombre));
    document.querySelectorAll('#barra-pestanas button').forEach(b => b.setAttribute('aria-selected', b.dataset.pestana === nombre));
    if (nombre === 'rimas') reanudarPalabras(); else pausarPalabras();
    // En Ajustes el reproductor no se ve, pero lo que suena sigue (salvo YouTube).
    document.body.classList.toggle('en-ajustes', nombre === 'ajustes');
    // «Recientes» se pliega al cambiar de sección (pedido de Swa).
    $('fs-recientes-caja').open = false;
    sincronizarLinkFreestyle();
    ubicarReproductor();
}
document.querySelectorAll('#barra-pestanas button').forEach(b => b.addEventListener('click', () => mostrarPestana(b.dataset.pestana)));

// ---------- Letras (NavigationStack: lista -> editor) ----------
function mostrarVista(id) {
    document.querySelectorAll('#pantalla-letras .vista').forEach(v => v.classList.toggle('activa', v.id === id));
    document.body.classList.toggle('editando', id === 'vista-editor');
    ocultarMusicaSiHaceFalta();
    if (musica) aplicarVideo();
    ubicarReproductor();
}

// Las tarjetas en el orden en que se ven (cambia mientras se arrastra una).
let tarjetasLetras = [];

function renderizarLetras() {
    const letras = listarLetras(localStorage);
    // Cada letra es una tarjeta con el título y el principio del texto.
    const parte = (clase, texto) => {
        const span = document.createElement('span');
        span.className = clase;
        span.textContent = texto;
        return span;
    };
    tarjetasLetras = letras.map(letra => {
        const tarjeta = document.createElement('li');
        tarjeta.className = 'tarjeta-letra';
        const boton = document.createElement('button');
        boton.append(parte('titulo-letra', letra.titulo || 'Sin título'), parte('texto-letra', letra.texto.trim()));
        const fueArrastrada = arrastrarTarjeta(tarjeta, boton, letra);
        boton.addEventListener('click', () => { if (!fueArrastrada()) abrirEditor(letra); });
        tarjeta.append(boton);
        return tarjeta;
    });
    ubicarTarjetas();
    $('lista-letras').replaceChildren(...tarjetasLetras);
    $('letras-vacio').hidden = letras.length > 0;
}

// Cada tarjeta va en su lugar de la grilla (la "+" es el lugar 0): de a tres, dos chicas y
// una larga, y en el grupo siguiente al revés.
function ubicarTarjetas() {
    tarjetasLetras.forEach((tarjeta, i) => {
        const { columna, fila, larga } = lugarEnGrilla(i + 1);
        tarjeta.style.gridColumn = columna;
        tarjeta.style.gridRow = `${fila} / span ${larga ? 2 : 1}`;
        tarjeta.classList.toggle('destacada', larga);
    });
}

// Mueve la tarjeta a otro lugar mientras se arrastra; las demás se corren con una animación.
function reacomodar(tarjeta, lugar) {
    const grilla = $('lista-letras').parentElement.getBoundingClientRect();
    const antes = new Map(tarjetasLetras.map(t => [t, t.getBoundingClientRect()]));
    tarjetasLetras.splice(tarjetasLetras.indexOf(tarjeta), 1);
    tarjetasLetras.splice(lugar, 0, tarjeta);
    ubicarTarjetas();
    for (const t of tarjetasLetras) {
        if (t === tarjeta) continue;
        const a = antes.get(t);
        const x = a.left - grilla.left - t.offsetLeft, y = a.top - grilla.top - t.offsetTop;
        t.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: 'none' }], { duration: 250, easing: 'ease-out' });
    }
}

// Mantener apretada una tarjeta la levanta: pasarla por arriba de otra la cambia de lugar, y
// soltarla en el tacho (que aparece entre el título y las tarjetas) la borra.
// En SwiftUI: .draggable en la tarjeta, y .dropDestination en las otras y en el tacho.
function arrastrarTarjeta(tarjeta, boton, letra) {
    let espera = null, arrastrando = false, arrastrada = false, inicio = null, desde = null, dedo = null, cuadro = null;
    let sobre = null, lugarInicial = 0, scrollInicial = 0;
    const tacho = $('tacho');
    const lista = $('vista-lista-letras');
    const sobreTacho = () => {
        const r = tacho.getBoundingClientRect();
        return dedo.x >= r.left && dedo.x <= r.right && dedo.y >= r.top - 12 && dedo.y <= r.bottom + 12;
    };
    // Qué otra tarjeta tiene el dedo encima, según su lugar en la grilla (sin las animaciones).
    const tarjetaBajoElDedo = () => {
        const g = $('lista-letras').parentElement.getBoundingClientRect();
        return tarjetasLetras.find(t => {
            if (t === tarjeta) return false;
            const x = dedo.x - g.left - t.offsetLeft, y = dedo.y - g.top - t.offsetTop;
            return x >= 0 && y >= 0 && x <= t.offsetWidth && y <= t.offsetHeight;
        });
    };
    // La tarjeta sigue al dedo aunque la grilla se corra (cuando aparece el tacho, cuando cambia
    // de lugar o cuando la pantalla se desplaza): offsetLeft/offsetTop no cambian con el transform.
    const seguir = () => {
        // Cerca de los bordes, la lista se desplaza sola para llegar al tacho o a las de abajo.
        const alto = lista.getBoundingClientRect();
        if (dedo.y < alto.top + 90) lista.scrollTop -= 8;
        else if (dedo.y > alto.bottom - 130) lista.scrollTop += 8;
        const x = dedo.x - inicio.x - (tarjeta.offsetLeft - desde.left);
        const y = dedo.y - inicio.y - (tarjeta.offsetTop - desde.top) + (lista.scrollTop - scrollInicial);
        tarjeta.style.transform = `translate(${x}px, ${y}px)`;
        const enTacho = sobreTacho();
        tacho.classList.toggle('encima', enTacho);
        tarjeta.classList.toggle('sobre-tacho', enTacho);
        const otra = enTacho ? null : tarjetaBajoElDedo();
        if (otra && otra !== sobre) reacomodar(tarjeta, tarjetasLetras.indexOf(otra));
        sobre = otra;
        cuadro = requestAnimationFrame(seguir);
    };
    const empezar = () => {
        arrastrando = arrastrada = true;
        desde = { left: tarjeta.offsetLeft, top: tarjeta.offsetTop };
        scrollInicial = lista.scrollTop;
        lugarInicial = tarjetasLetras.indexOf(tarjeta);
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
        sobre = null;
        cancelAnimationFrame(cuadro);
        const borrar = sobreTacho();
        // Mientras pregunta, la tarjeta queda sobre el tacho.
        const soltar = () => {
            tacho.classList.remove('visible', 'encima');
            tarjeta.classList.remove('arrastrando', 'sobre-tacho');
        };
        // Vuelve a su lugar (el nuevo, si se la cambió) y se guarda el orden.
        const volver = () => {
            soltar();
            tarjeta.classList.add('volviendo');
            tarjeta.style.transform = '';
            const lugar = tarjetasLetras.indexOf(tarjeta);
            if (lugar !== lugarInicial) moverLetra(localStorage, letra.id, lugar);
            setTimeout(() => { tarjeta.classList.remove('volviendo'); if (lugar !== lugarInicial) renderizarLetras(); }, 300);
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

    // Rimas pintadas: la última palabra de cada verso, con el color de su grupo, y las
    // rimas internas (palabras que riman con otras cercanas), con el color de su rima.
    const pintar = $('alternar-colores').getAttribute('aria-pressed') === 'true';
    // Lo que va entre paréntesis son coros o agregados, "(nos)": no rima ni corta el verso.
    // Si el verso entero va entre paréntesis, es un verso más y rima como cualquiera.
    const sinAgregados = versos.map(verso => {
        const sin = verso.replace(/\([^)]*\)/g, agregado => ' '.repeat(agregado.length));
        return /\p{L}/u.test(sin) ? sin : verso;
    });
    const palabras = sinAgregados.map((verso, i) => esSeparador(versos[i]) ? [] : (verso.match(/\p{L}+/gu) ?? []).map(bienEscrita));
    const palabrasFinales = palabras.map(p => p.at(-1));
    const grupos = pintar ? agruparRimas(palabrasFinales) : [];
    // Consonante con el fondo lleno; asonante con el mismo color, más suave.
    const consonantes = rimanConsonante(palabrasFinales);
    // Multisilábicas: si las sílabas de antes de la tónica también riman, se pintan desde ahí.
    const multis = pintar ? rimasMultisilabicas(palabras, grupos) : [];
    const internas = pintar ? rimasInternas(palabras, estiloLibreta(leerAjustesLibreta(localStorage)).internas) : [];
    // Cada terminación, un color fijo en toda la letra (12 en estilos.css, .rima-0 a .rima-11):
    // las internas que suenan como un grupo de finales usan su color.
    const colores = new Map();
    grupos.forEach((grupo, i) => { if (grupo != null) colores.set(claveAsonante(palabrasFinales[i]), grupo); });
    const colorDe = clave => {
        if (!colores.has(clave)) colores.set(clave, colores.size);
        return colores.get(clave);
    };
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
        // Se corta sin los agregados, pero se muestra el texto como está escrito.
        let desdeTrozo = 0;
        const trozos = sinAgregados[i].split(/(\p{L}+)/u)
            .map(trozo => verso.slice(desdeTrozo, desdeTrozo += trozo.length));
        const partes = trozos.map((parte, j) => {
            if (j % 2 === 0) return parte;
            const n = (j - 1) / 2;
            const esFinal = j === trozos.length - 2;
            const multi = multis[i]?.[n];
            let clase = null;
            if ((esFinal || multi != null) && grupos[i] != null) clase = `rima-${grupos[i] % COLORES_RIMA}${consonantes[i] ? '' : ' suave'}`;
            else if (internas[i]?.[n]) clase = `rima-${colorDe(internas[i][n].clave) % COLORES_RIMA}${internas[i][n].suave ? ' suave' : ''}`;
            if (!clase) return parte;
            // Se pinta solo desde la sílaba tónica (o desde antes, si es multisilábica).
            // Si se corrigió más que una tilde, se mira lo escrito.
            const corregida = palabras[i][n];
            const igual = corregida.length === parte.length;
            const desde = multi != null ? (igual ? multi : 0) : Math.max(0, inicioTonica(igual ? corregida : parte));
            return [parte.slice(0, desde), marca(clase, parte.slice(desde))];
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

// La barra aparece solo al tocar: si se cierra el teclado o se desliza la letra para leerla, se va.
const ocultarSugerencias = () => {
    $('sugerencias').hidden = true;
    reemplazo = null;
};
editorTexto.addEventListener('blur', ocultarSugerencias);
for (const evento of ['touchmove', 'wheel']) editorTexto.closest('.editor').addEventListener(evento, ocultarSugerencias, { passive: true });
// Deslizar bastante (más de 150px) también cierra el teclado; poco, no: capaz solo querías ver un verso de abajo.
let inicioDeslizar = 0;
editorTexto.closest('.editor').addEventListener('touchstart', e => { inicioDeslizar = e.touches[0].clientY; }, { passive: true });
editorTexto.closest('.editor').addEventListener('touchmove', e => {
    if (Math.abs(e.touches[0].clientY - inicioDeslizar) > 150) editorTexto.blur();
}, { passive: true });

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

// Estado del reproductor. Vive arriba porque el teclado, al abrirse, pregunta si hay que pausar.
let musica = null; // { fuente, reproducir(), pausar(), mover(segundos), ir(segundos), cerrar() }
let sonando = false, plegado = false, plegarAlPausar = false, falloMusica = false;
let generacionMusica = 0;
let actual = 0, duracion = 0, arrastrando = false, progresoTimer = null;
// La marca imantada del tema que suena (en segundos) y si al terminar vuelve a ella.
let marca = null, volverAMarca = false, cancionActual = null;

// Lo que queda visible de la pantalla con el teclado abierto (ver estilos.css).
if (window.visualViewport) {
    const ajustarAlTeclado = () => {
        document.documentElement.style.setProperty('--alto-visible', `${visualViewport.height}px`);
        document.documentElement.style.setProperty('--arriba-visible', `${visualViewport.offsetTop}px`);
        // Con el teclado abierto no hace falta dejar lugar para la barrita de inicio del iPhone.
        document.body.classList.toggle('teclado-abierto', visualViewport.height < innerHeight * 0.8);
        ocultarMusicaSiHaceFalta();
        if (document.body.classList.contains('editando')) {
            ajustarAltoTexto();
            if (document.activeElement === editorTexto) mostrarCursor();
        }
        ubicarReproductor();
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
$('mostrar-silabas').checked = localStorage.getItem('metrica.alternar-silabas') === 'true';
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

// Ajustes de la libreta (la ruedita): sílabas, tamaño de letra, separaciones, rimas internas y fuente.
function aplicarEstiloLibreta() {
    const { tamano, alto, letras, fuente } = estiloLibreta(leerAjustesLibreta(localStorage));
    document.documentElement.style.setProperty('--libreta-letra', `${tamano}px`);
    document.documentElement.style.setProperty('--libreta-alto', `${alto}px`);
    document.documentElement.style.setProperty('--libreta-fuente', fuente);
    document.documentElement.style.setProperty('--libreta-letras', `${letras}em`);
}

// Barra de 10 puntos imantados (Slider con step en SwiftUI): al soltar cae siempre en un punto.
function deslizadorLibreta(clave, ajuste, elegida) {
    const opciones = Object.keys(ajuste.opciones);
    const barra = document.createElement('input');
    barra.type = 'range';
    barra.className = 'deslizador';
    barra.min = 0;
    barra.max = opciones.length - 1;
    barra.step = 1;
    barra.value = opciones.indexOf(elegida);
    barra.dataset.ajuste = clave;
    barra.setAttribute('aria-label', ajuste.nombre);
    barra.addEventListener('input', () => {
        guardarAjusteLibreta(localStorage, clave, opciones[barra.value]);
        aplicarEstiloLibreta();
        actualizarEditor();
    });
    const puntos = document.createElement('div');
    puntos.className = 'puntos-deslizador';
    puntos.append(...opciones.map(() => document.createElement('span')));
    const fila = document.createElement('div');
    fila.className = 'fila-deslizador';
    fila.append(barra, puntos);
    return fila;
}

function aplicarAjustesLibreta() {
    aplicarEstiloLibreta();
    const ajustes = leerAjustesLibreta(localStorage);
    $('opciones-libreta').replaceChildren(...Object.entries(AJUSTES_LIBRETA).flatMap(([clave, ajuste]) => {
        const titulo = document.createElement('h3');
        titulo.className = 'encabezado-grupo';
        titulo.textContent = ajuste.nombre;
        if (ajuste.deslizador) return [titulo, deslizadorLibreta(clave, ajuste, ajustes[clave])];
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

// La sílaba que rima, desde la tónica, sin espacio adentro del resaltado ("can" + "ción").
function fragmentoRima(palabra, clase) {
    const frag = document.createDocumentFragment();
    const desde = inicioTonica(palabra);
    if (desde < 0) {
        frag.append(document.createTextNode(palabra));
        return frag;
    }
    if (desde > 0) frag.append(document.createTextNode(palabra.slice(0, desde)));
    const mark = document.createElement('mark');
    mark.className = clase;
    mark.textContent = palabra.slice(desde);
    frag.append(mark);
    return frag;
}

// Celda con la palabra (tocarla busca sus rimas) y la estrella.
function celdaPalabra(palabra, clase, alCambiar) {
    const celda = document.createElement('li');
    celda.className = 'celda';
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'celda-boton';
    boton.append(fragmentoRima(palabra, clase));
    boton.addEventListener('click', () => { $('buscar-rima').value = palabra; buscarRima(); });
    celda.append(boton, botonFavorito(palabra, alCambiar));
    return celda;
}

const palabraBuscada = () => $('buscar-rima').value.trim().toLowerCase();
const rimasDeLaBusqueda = () => buscarRimas(palabraBuscada(), indiceRimas(), { tipo: tipoRima });
const rimasBuscadas = () => rimasDeLaBusqueda().slice(0, 100);
const claseRima = () => `rima-0${tipoRima === 'asonante' ? ' suave' : ''}`;

function actualizarLimpiar() {
    $('limpiar-rima').hidden = !palabraBuscada();
}

// Abajo de las tarjetas, la lista completa de rimas (o las favoritas si no se buscó nada).
function renderizarRimas() {
    const palabra = palabraBuscada();
    const todas = palabra ? rimasDeLaBusqueda() : null;
    const lista = palabra ? todas.slice(0, 100) : listarFavoritos(localStorage);
    const clase = claseRima();
    $('resultados-rimas').replaceChildren(...lista.map((p, i) => celdaPalabra(p, palabra ? clase : `rima-${i % 12}`, palabra ? undefined : renderizarRimas)));
    $('encabezado-resultados').hidden = !lista.length;
    $('encabezado-resultados').textContent = palabra ? `Todas · ${todas.length.toLocaleString('es-AR')}` : 'Favoritas';
    $('rimas-vacio').textContent = !palabra
        ? 'Escribí una palabra para ver con qué rima. Tocá la estrella para guardarla en favoritas.'
        : `No encontré rimas ${tipoRima}s para «${palabra}».`;
    $('rimas-vacio').hidden = lista.length > 0;
    actualizarLimpiar();
}

function buscarRima() {
    renderizarRimas();
    if (temporizador === null) return refrescarPalabras();
    pausarPalabras();
    reanudarPalabras();
}

$('buscar-rima').addEventListener('input', buscarRima);
$('limpiar-rima').addEventListener('click', () => { $('buscar-rima').value = ''; buscarRima(); });
document.querySelectorAll('#tipo-rima button').forEach(b => b.addEventListener('click', () => {
    tipoRima = b.dataset.tipo;
    document.querySelectorAll('#tipo-rima button').forEach(o => o.setAttribute('aria-selected', o === b));
    buscarRima();
}));

// Las 6 tarjetas cambian cada 6 segundos.
const CANTIDAD = 6;
const SEGUNDOS = 6;
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

// Tarjeta de la grilla: la palabra (con la rima pintada) y, abajo, cuántas sílabas tiene.
function cajaPalabra(palabra, clase) {
    const caja = document.createElement('div');
    caja.className = 'palabra-caja';
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'palabra';
    boton.append(fragmentoRima(palabra, clase));
    boton.setAttribute('aria-pressed', listarFavoritos(localStorage).includes(palabra));
    boton.addEventListener('click', () => {
        boton.setAttribute('aria-pressed', alternarFavorito(localStorage, palabra));
        if (!palabraBuscada()) renderizarRimas();
    });
    const silabas = document.createElement('span');
    silabas.className = 'silabas-tarjeta';
    const n = separarSilabas(palabra).length;
    silabas.textContent = n ? `${n} ${n === 1 ? 'sílaba' : 'sílabas'}` : '';
    caja.append(boton, silabas);
    return caja;
}

function refrescarPalabras() {
    const pool = poolActual();
    const clase = claseRima();
    $('grilla-palabras').replaceChildren(...palabrasAlAzar(pool, CANTIDAD).map((palabra, i) =>
        cajaPalabra(palabra, palabraBuscada() ? clase : `rima-${i % 12}`)));
    $('fila-usadas').hidden = pool.length === 0;
    $('encabezado-usadas').textContent = palabraBuscada() ? 'Más usadas' : 'Al azar';
    $('palabras-total').textContent = palabraBuscada()
        ? `Tocá una palabra para guardarla en favoritas. Las tarjetas muestran ${pool.length} rimas que se usan mucho.`
        : `Tocá una palabra para guardarla en favoritas. ${pool.length.toLocaleString('es-AR')} palabras disponibles.`;
}

function reanudarPalabras() {
    if (pausadoPorUsuario || temporizador !== null) return;
    temporizador = setInterval(refrescarPalabras, SEGUNDOS * 1000);
    refrescarPalabras();
}

function pausarPalabras() {
    clearInterval(temporizador);
    temporizador = null;
}

$('pausar-palabras').addEventListener('click', () => {
    pausadoPorUsuario = !pausadoPorUsuario;
    $('pausar-palabras').textContent = pausadoPorUsuario ? 'en pausa' : 'cambian cada 6 s';
    pausadoPorUsuario ? pausarPalabras() : reanudarPalabras();
});
$('refrescar-palabras').addEventListener('click', () => {
    if (temporizador === null) return refrescarPalabras();
    pausarPalabras();
    reanudarPalabras();
});
$('palabras-simples').addEventListener('change', refrescarPalabras);

// ---------- Freestyle ----------
let ronda = null; // { inicio, duracion, pausa, modo } mientras se está jugando
let cola = []; // [ahora, después, luego]
let beatId = CATALOGO_BEATS[0].id;
let duracionId = DURACION_INICIAL;
let linkFreestyle = null; // el link ya leído (o { fuente: 'archivo' }), o null si suena un beat
let recienteActual = null; // el reciente que está sonando, para ponerle el título cuando llega
let relojTimer = null;
let indicePalabra = 0;
const BPM_FS = 90;
// Cuántos compases dura cada palabra: sale de la velocidad de Ajustes > Freestyle.
let compasesPorPalabra = compasesDeVelocidad(leerVelocidad(localStorage));
const SILENCIO = { bombo: Array(16).fill(0), caja: Array(16).fill(0), hihat: Array(16).fill(0) };
const ICONO_PLAY_FS = '<svg viewBox="0 0 24 24" class="icono icono-relleno"><path d="M8 5l11 7-11 7z"/></svg>';
const ICONO_PAUSA_FS = '<svg viewBox="0 0 24 24" class="icono"><path d="M8 5v14M16 5v14"/></svg>';
const palabraAlAzar = () => palabrasAlAzar(palabrasSimples, 1)[0];

// La palabra junta, con la sílaba tónica en violeta (sin separar con puntos).
function pintarPalabra(elemento, palabra) {
    if (!palabra) return elemento.replaceChildren();
    const fuerte = silabaFuerte(palabra);
    const silabas = fuerte?.silabas ?? [palabra];
    const tonica = fuerte ? fuerte.tonica : -1;
    elemento.replaceChildren(...silabas.map((silaba, i) => {
        const span = document.createElement('span');
        span.textContent = silaba;
        if (i === tonica) span.className = 'tonica';
        return span;
    }));
}

// La palabra del aro va en una línea: si no entra, se achica la letra hasta que entre.
// En SwiftUI: .lineLimit(1).minimumScaleFactor(0.4).
function ajustarPalabraFs() {
    const palabra = $('fs-palabra');
    palabra.style.fontSize = '';
    if (!palabra.clientWidth || palabra.scrollWidth <= palabra.clientWidth) return;
    const tamano = parseFloat(getComputedStyle(palabra).fontSize);
    palabra.style.fontSize = `${Math.floor(tamano * palabra.clientWidth / palabra.scrollWidth * 0.97)}px`;
}
new ResizeObserver(ajustarPalabraFs).observe($('fs-reloj'));

// La barrita de abajo de la palabra se vacía mientras dura (2 compases del beat).
// Arranca llena con cada palabra nueva y se frena en pausa (CSS). En SwiftUI:
// Capsule().scaleEffect(x:) con withAnimation(.linear(duration:)).
function reiniciarBarraPalabra() {
    const barra = $('fs-barra-palabra');
    const archivo = linkFreestyle ? null : archivoDeBeat(beatId);
    const ms = ronda?.modo === 'archivo' && archivo ? msPorPalabra(archivo.bpm, compasesPorPalabra) : msPorPalabra(BPM_FS, compasesPorPalabra);
    barra.style.setProperty('--ms-palabra', `${ms}ms`);
    barra.classList.remove('corriendo');
    void barra.offsetWidth;
    if (ronda) barra.classList.add('corriendo');
}

function mostrarCola() {
    const { ahora, despues, luego } = proximasPalabras(cola);
    pintarPalabra($('fs-palabra'), ahora);
    ajustarPalabraFs();
    pintarPalabra($('fs-despues'), despues);
    pintarPalabra($('fs-luego'), luego);
}

function asegurarCola() {
    if (cola.length >= 3 && cola[0]) return;
    cola = [palabraAlAzar(), palabraAlAzar(), palabraAlAzar()];
    mostrarCola();
}

function duracionElegida() {
    return elegirDuracion(duracionId, tieneExtras(localStorage)) ?? DURACIONES[0];
}

function pintarCuenta(estado) {
    $('fs-cuenta').textContent = estado.texto;
    $('fs-reloj').style.setProperty('--avance', String(estado.avance));
}

function mostrarCuentaIdle() {
    if (ronda) return;
    pintarCuenta(estadoRonda(0, 0, duracionElegida().segundos));
}

function alPasoBeat(paso, bombo) {
    // Para verificar-app.cjs: el beat sigue andando aunque la ronda esté en pausa.
    document.documentElement.dataset.pasoBeat = paso;
    if (!ronda || ronda.pausa) return;
    // El resplandor late en cada kick del beat.
    if (bombo) efecto.golpe(paso % 16 === 0 ? 1 : 0.8);
    if (paso === 0) return reiniciarBarraPalabra();
    if (!cambiaLaPalabra(paso, compasesPorPalabra)) return;
    cola = avanzarPalabras(cola, palabraAlAzar());
    mostrarCola();
    reiniciarBarraPalabra();
}

function tickReloj() {
    if (!ronda || ronda.pausa) return;
    const ahora = performance.now();
    const estado = estadoRonda(ronda.inicio, ahora, ronda.duracion);
    pintarCuenta(estado);
    pintarBeatSonando();
    if (estado.restantes === 0) return terminarRonda(true);
    if (ronda.modo !== 'reloj') return;
    const indice = Math.floor((ahora - ronda.inicio) / msPorPalabra(BPM_FS, compasesPorPalabra));
    while (indicePalabra < indice) {
        indicePalabra++;
        cola = avanzarPalabras(cola, palabraAlAzar());
        mostrarCola();
        reiniciarBarraPalabra();
    }
}

// Luces del aro: el mood sale del título del link o del género del beat. Con un link
// los tiempos salen de la posición del tema (y de los BPM del título, si los dice);
// con un beat propio, de cada paso del beat.
const efecto = crearEfecto($('fs-efecto'), $('fs-reloj'));
// Ajustes > Freestyle: barra de 0 (sin efectos) a 10, imantada a cada punto.
function aplicarCantidadEfectos() {
    const cantidad = leerCantidadEfectos(localStorage);
    $('cantidad-efectos').value = cantidad;
    $('valor-efectos').textContent = String(cantidad);
    efecto.cantidad(cantidad / EFECTOS_MAXIMO);
}
$('puntos-efectos').append(...Array.from({ length: EFECTOS_MAXIMO + 1 }, () => document.createElement('span')));
$('cantidad-efectos').addEventListener('input', () => {
    guardarCantidadEfectos(localStorage, $('cantidad-efectos').value);
    aplicarCantidadEfectos();
});
aplicarCantidadEfectos();
// Ajustes > Freestyle: velocidad de cambio de palabra, de 1 a 10 (5 son 2 compases).
function aplicarVelocidad() {
    const velocidad = leerVelocidad(localStorage);
    $('velocidad-palabras').value = velocidad;
    $('valor-velocidad').textContent = String(velocidad);
    compasesPorPalabra = compasesDeVelocidad(velocidad);
}
$('puntos-velocidad').append(...Array.from({ length: VELOCIDAD_MAXIMA }, () => document.createElement('span')));
$('velocidad-palabras').addEventListener('input', () => {
    guardarVelocidad(localStorage, $('velocidad-palabras').value);
    aplicarVelocidad();
});
aplicarVelocidad();
function ambienteActual() {
    // Con un link el resplandor no late: el audio de YouTube y SoundCloud no se puede leer.
    if (linkFreestyle) {
        const titulo = musica ? $('reproductor-titulo').textContent : '';
        return { mood: moodDeTitulo(titulo), reloj: null };
    }
    const { beat } = fuenteFreestyle({ beatId });
    const bpm = archivoDeBeat(beat.id)?.bpm ?? BPM_FS;
    // Si el beat no suena (falló el mp3), late con el reloj de la ronda.
    return { mood: moodDeBeat(beat), bpm, reloj: () => ronda?.modo === 'reloj' && !ronda.pausa ? tiemposEn((performance.now() - ronda.inicio) / 1000, bpm) : null };
}
// El título llega después de cargar el tema: ahí se sabe el mood.
new MutationObserver(() => { if (linkFreestyle) actualizarEfecto(); }).observe($('reproductor-titulo'), { childList: true, characterData: true, subtree: true });
function actualizarEfecto() {
    efecto.configurar(ambienteActual());
    const jugando = Boolean(ronda && !ronda.pausa);
    // Mientras se juega, el título «Freestyle» se va (y vuelve al pausar o parar).
    $('pantalla-freestyle').classList.toggle('jugando', jugando);
    if (jugando) efecto.prender();
    else efecto.apagar();
    pintarBeatSonando();
}

// Con una ronda con beat de la app se ve el reproductor chico, como con SoundCloud, en
// lugar de los botones de beats y del cajón del link. Pausado queda a la vista: solo
// la cruz lo cierra (pedido de Swa).
function pintarBeatSonando() {
    const hay = Boolean(ronda && !linkFreestyle);
    if (document.body.classList.contains('beat-sonando') !== hay) {
        document.body.classList.toggle('beat-sonando', hay);
        ubicarReproductor();
    }
    if (!hay) return;
    const suena = !ronda.pausa || ronda.sigueSonando;
    $('fs-beat-pausar').setAttribute('aria-label', suena ? 'Pausar' : 'Reproducir');
    $('fs-beat-pausar').innerHTML = suena ? ICONO_PAUSA_FS : ICONO_PLAY_FS;
    const beat = CATALOGO_BEATS.find(b => b.id === beatId);
    const i = CATALOGO_BEATS.indexOf(beat);
    $('fs-sonando-titulo').textContent = etiquetaBeat(beat);
    $('fs-sonando-fuente').textContent = `Métrica · ${beat.bpm ?? BPM_FS} BPM`;
    $('fs-beat-anterior').setAttribute('aria-disabled', String(i === 0));
    $('fs-beat-siguiente').setAttribute('aria-disabled', String(i === CATALOGO_BEATS.length - 1));
    const segundos = ((ronda.pausa ?? performance.now()) - ronda.inicio) / 1000;
    $('fs-sonando-tiempo').textContent = formatoTiempo(segundos);
    $('fs-sonando-total').textContent = ronda.duracion == null ? '' : formatoTiempo(ronda.duracion);
    $('fs-sonando-llenado').style.width = ronda.duracion ? `${Math.min(1, segundos / ronda.duracion) * 100}%` : '0%';
}

// El play de la bandeja: Empezar, Pausar (jugando) o Seguir (en pausa).
function marcarSonando(activo) {
    $('pantalla-freestyle').classList.toggle('sonando', activo);
    const enPausa = Boolean(ronda?.pausa);
    $('fs-play').setAttribute('aria-label', !activo ? 'Empezar' : enPausa ? 'Seguir' : 'Pausar');
    $('fs-play').innerHTML = activo && !enPausa ? ICONO_PAUSA_FS : ICONO_PLAY_FS;
    $('fs-play').hidden = Boolean(linkFreestyle && ronda);
}

function empezarBeat() {
    iniciarBeat(() => ({ beat: patronDeBeat(beatId) ?? SILENCIO, bpm: BPM_FS }), alPasoBeat);
}

// Sintetizador, mp3 o el reloj de respaldo. El mp3 usa su propio BPM.
function arrancarSonido() {
    const fuente = fuenteFreestyle({ beatId, link: linkFreestyle });
    if (fuente.tipo !== 'beat') return 'reloj';
    const archivo = archivoDeBeat(fuente.beat.id);
    if (archivo) {
        delete document.documentElement.dataset.beatSonando;
        iniciarArchivo(archivo.archivo, archivo.bpm, (paso, bombo) => {
            document.documentElement.dataset.beatSonando = 'archivo';
            alPasoBeat(paso, bombo);
        }, () => { if (ronda?.modo === 'archivo') ronda.modo = 'reloj'; });
        return 'archivo';
    }
    if (patronDeBeat(fuente.beat.id)) {
        empezarBeat();
        return 'beat';
    }
    return 'reloj';
}

function empezarRonda() {
    if (ronda) return;
    asegurarCola();
    ronda = {
        inicio: performance.now(),
        duracion: duracionElegida().segundos,
        pausa: null,
        modo: 'reloj',
    };
    indicePalabra = 0;
    marcarSonando(true);
    if (!relojTimer) relojTimer = setInterval(tickReloj, 200);
    ronda.modo = arrancarSonido();
    reiniciarBarraPalabra();
    actualizarEfecto();
}

// Con pararSonido en false se frenan el tiempo y las palabras, pero el beat sigue.
function pausarRonda(pararSonido = true) {
    if (!ronda || ronda.pausa) return;
    ronda.pausa = performance.now();
    ronda.sigueSonando = !pararSonido;
    if (pararSonido) detenerBeat();
    marcarSonando(true);
    actualizarEfecto();
}

function reanudarRonda() {
    if (!ronda?.pausa) return;
    ronda.inicio += performance.now() - ronda.pausa;
    ronda.pausa = null;
    if (!ronda.sigueSonando && (ronda.modo === 'beat' || ronda.modo === 'archivo')) ronda.modo = arrancarSonido();
    ronda.sigueSonando = false;
    marcarSonando(true);
    actualizarEfecto();
}

// Pausar mientras se juega (tocando el círculo): se frenan el tiempo
// y las palabras, y el beat (o el link) sigue sonando (pedido de Swa). Tocar el círculo
// en pausa sigue la ronda.
function pausarJugando() {
    if (!ronda || ronda.pausa) return;
    pausarRonda(false);
}

function terminarRonda(porTiempo = false) {
    if (!ronda) return;
    ronda = null;
    reiniciarBarraPalabra();
    detenerBeat();
    actualizarEfecto();
    clearInterval(relojTimer);
    relojTimer = null;
    marcarSonando(false);
    if (porTiempo) {
        $('fs-cuenta').textContent = '0:00';
        $('fs-reloj').style.setProperty('--avance', '1');
        $('fs-palabra').textContent = '¡Tiempo!';
        ajustarPalabraFs();
        $('fs-despues').replaceChildren();
        $('fs-luego').replaceChildren();
        cola = [];
        return;
    }
    cola = [];
    asegurarCola();
    mostrarCuentaIdle();
}

// La ronda sigue andando aunque se cambie de sección, con su reproductor arriba de la
// barra: solo se pausa al pausar el beat (pedido de Swa). Con un link, sigue a su play.
function rondaSigueAlReproductor() {
    return Boolean(linkFreestyle);
}

function sincronizarLinkFreestyle() {
    const hay = Boolean(linkFreestyle);
    const enFs = $('pantalla-freestyle').classList.contains('activa');
    document.body.classList.toggle('freestyle-link', hay && enFs);
    $('pantalla-freestyle').classList.toggle('con-link', hay);
    $('pantalla-freestyle').classList.toggle('con-youtube', linkFreestyle?.fuente === 'youtube');
    $('fs-elegir').hidden = hay;
    // Con un link, el play de la ronda es el de la tarjeta; el de la bandeja solo aparece
    // sin ronda (por ejemplo, cuando se terminó el tiempo y la canción sigue).
    $('fs-play').hidden = hay && Boolean(ronda);
    ocultarMusicaSiHaceFalta();
    if (musica) aplicarVideo();
    else ubicarReproductor();
}

function renderizarDuraciones() {
    const extras = tieneExtras(localStorage);
    if (!elegirDuracion(duracionId, extras)) duracionId = DURACION_INICIAL;
    $('fs-duraciones').replaceChildren(...DURACIONES.map(d => {
        const bloqueada = Boolean(d.premium && !extras);
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'chip-fs' + (d.premium ? ' premium' : '');
        boton.role = 'radio';
        boton.dataset.duracion = d.id;
        boton.setAttribute('aria-checked', String(!bloqueada && d.id === duracionId));
        boton.textContent = d.premium ? `★ ${d.etiqueta}` : d.etiqueta;
        if (bloqueada) {
            boton.setAttribute('aria-disabled', 'true');
            boton.dataset.paywall = '';
            boton.setAttribute('aria-label', `${d.etiqueta}, con Métrica Extras`);
        }
        boton.addEventListener('click', () => {
            if (bloqueada) return;
            duracionId = d.id;
            renderizarDuraciones();
            if (ronda) ronda.duracion = d.segundos;
            else mostrarCuentaIdle();
        });
        return boton;
    }));
}

// Un botón por género (Boombap y Trap), uno al lado del otro. Deslizarlo pasa al beat de
// al lado de ese género; los puntitos de abajo dicen cuál es. Tocarlo elige ese género.
// En SwiftUI: TabView(.page) chico adentro de cada botón.
const beatPorGenero = Object.fromEntries(GENEROS_BEAT.map(g => [g, beatsDeGenero(g)[0].id]));
beatPorGenero[CATALOGO_BEATS.find(b => b.id === beatId).genero] = beatId;

function elegirBeat(id) {
    const beat = CATALOGO_BEATS.find(b => b.id === id);
    const cambio = beatId !== id;
    beatId = id;
    beatPorGenero[beat.genero] = id;
    renderizarBeats();
    if (cambio && ronda && (!ronda.pausa || ronda.sigueSonando)) ronda.modo = arrancarSonido();
    if (cambio) actualizarEfecto();
}

function renderizarBeats() {
    $('fs-beats').replaceChildren(...GENEROS_BEAT.map(genero => {
        const lista = beatsDeGenero(genero);
        const elegido = CATALOGO_BEATS.find(b => b.id === beatPorGenero[genero]);
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'beat-fs';
        boton.role = 'radio';
        boton.dataset.genero = genero;
        boton.dataset.beat = elegido.id;
        boton.setAttribute('aria-checked', String(elegido.id === beatId));
        boton.setAttribute('aria-label', `${etiquetaBeat(elegido)}. Deslizá para cambiar.`);
        const nombre = document.createElement('span');
        nombre.className = 'nombre-beat';
        nombre.textContent = etiquetaBeat(elegido);
        const puntos = document.createElement('span');
        puntos.className = 'puntos-beat';
        puntos.setAttribute('aria-hidden', 'true');
        puntos.append(...lista.map(b => {
            const punto = document.createElement('span');
            if (b.id === elegido.id) punto.className = 'activo';
            return punto;
        }));
        boton.append(nombre, puntos);
        for (const b of lista) if (b.archivo) precargarArchivo(b.archivo);
        // Deslizar: más de 24 px de costado cambia de beat (y no cuenta como toque).
        let desde = null, deslizo = false;
        boton.addEventListener('pointerdown', e => { desde = e.clientX; deslizo = false; });
        boton.addEventListener('pointermove', e => {
            if (desde === null || deslizo || Math.abs(e.clientX - desde) < 24) return;
            deslizo = true;
            elegirBeat(beatVecino(elegido.id, e.clientX < desde ? 1 : -1));
        });
        boton.addEventListener('pointerup', () => { desde = null; });
        boton.addEventListener('pointercancel', () => { desde = null; });
        boton.addEventListener('click', () => { if (!deslizo) elegirBeat(elegido.id); });
        return boton;
    }));
}

function avisoFs(texto) {
    $('fs-link-aviso').textContent = texto;
    $('fs-link-aviso').hidden = !texto;
}

async function usarLinkFreestyle(texto) {
    const link = leerLink(texto);
    if (!link) return avisoFs('Ese link no es de YouTube ni de SoundCloud.');
    if (!navigator.onLine) return avisoFs('Sin internet no se puede escuchar música. Lo demás de Métrica anda igual.');
    avisoFs('');
    if (ronda) terminarRonda();
    linkFreestyle = link;
    recienteActual = { fuente: link.fuente, link: String(texto).trim(), titulo: '' };
    sumarReciente(recienteActual);
    sincronizarLinkFreestyle();
    await escucharMusica(texto);
}

// El cajón del link es uno solo (pedido de Swa): en Freestyle va abajo de todo y en la
// libreta se abre en la hoja de la nota musical. Desde la libreta, lo que suena no es de
// Freestyle (la ronda no lo sigue) y la hoja se cierra.
const cajonEnLibreta = () => !$('hoja-musica').hidden;

async function usarLink(texto) {
    if (!cajonEnLibreta()) return usarLinkFreestyle(texto);
    const link = leerLink(texto);
    if (!link) return avisoFs('Ese link no es de YouTube ni de SoundCloud.');
    if (!navigator.onLine) return avisoFs('Sin internet no se puede escuchar música. Lo demás de Métrica anda igual.');
    soltarLoQueSuena(true);
    cerrarHojaMusica();
    recienteActual = { fuente: link.fuente, link: String(texto).trim(), titulo: '' };
    sumarReciente(recienteActual);
    await escucharMusica(texto);
}

function usarArchivo(archivo, reciente) {
    if (!cajonEnLibreta()) return usarArchivoFreestyle(archivo, reciente);
    soltarLoQueSuena(true);
    cerrarHojaMusica();
    recienteActual = reciente;
    sumarReciente(reciente);
    escucharArchivo(archivo, reciente.titulo);
}

// Un beat del teléfono: suena en el mismo reproductor de abajo, como un link.
async function usarArchivoFreestyle(archivo, reciente) {
    avisoFs('');
    if (ronda) terminarRonda();
    linkFreestyle = { fuente: 'archivo' };
    recienteActual = reciente;
    sumarReciente(reciente);
    sincronizarLinkFreestyle();
    escucharArchivo(archivo, reciente.titulo);
}

// ---------- Recientes (Freestyle) ----------
// Los archivos del teléfono se guardan en IndexedDB para poder volver a usarlos
// (en SwiftUI, copiados a Documents). Si el navegador no deja, quedan solo en la lista.
function baseRecientes() {
    return new Promise((listo, error) => {
        const pedido = indexedDB.open('metrica', 1);
        pedido.onupgradeneeded = () => pedido.result.createObjectStore('beats');
        pedido.onsuccess = () => listo(pedido.result);
        pedido.onerror = () => error(pedido.error);
    });
}
async function usarBaseRecientes(modo, hacer) {
    const base = await baseRecientes();
    return new Promise((listo, error) => {
        const tienda = base.transaction('beats', modo).objectStore('beats');
        const pedido = hacer(tienda);
        pedido.onsuccess = () => listo(pedido.result);
        pedido.onerror = () => error(pedido.error);
    });
}
const guardarArchivo = (id, archivo) => usarBaseRecientes('readwrite', t => t.put(archivo, id)).catch(() => {});
const leerArchivo = id => usarBaseRecientes('readonly', t => t.get(id)).catch(() => null);
const borrarArchivo = id => usarBaseRecientes('readwrite', t => t.delete(id)).catch(() => {});

function sumarReciente(reciente) {
    for (const caido of agregarReciente(localStorage, reciente)) if (caido.fuente === 'archivo') borrarArchivo(caido.id);
    renderizarRecientes();
}

function renderizarRecientes() {
    const lista = leerRecientes(localStorage);
    // Sin recientes no hay desplegable: el cajón es solo el campo.
    $('fs-recientes-caja').hidden = !lista.length;
    $('fs-recientes').replaceChildren(...lista.map(reciente => {
        const fila = document.createElement('li');
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'usar-reciente';
        // El título llega hasta el borde y se corta con «…»; el sufijo siempre se ve.
        const titulo = document.createElement('span');
        titulo.className = 'titulo-reciente';
        titulo.textContent = reciente.titulo || 'Sin título';
        const sufijo = document.createElement('span');
        sufijo.className = 'sufijo-reciente';
        sufijo.textContent = ` (${sufijoReciente(reciente)})`;
        boton.append(titulo, sufijo);
        boton.addEventListener('click', async () => {
            // Elegir un reciente pliega la lista (pedido de Swa).
            $('fs-recientes-caja').open = false;
            if (reciente.fuente !== 'archivo') {
                $('fs-link').value = reciente.link;
                return usarLink(reciente.link);
            }
            const archivo = await leerArchivo(reciente.id);
            if (!archivo) return avisoFs('Ese archivo ya no está guardado: buscalo de nuevo.');
            usarArchivo(archivo, reciente);
        });
        const borrar = document.createElement('button');
        borrar.type = 'button';
        borrar.className = 'borrar-reciente';
        borrar.setAttribute('aria-label', `Borrar ${reciente.titulo || 'este reciente'} de recientes`);
        borrar.innerHTML = '<svg viewBox="0 0 24 24" class="icono"><path d="M7 7l10 10M17 7L7 17"/></svg>';
        borrar.addEventListener('click', () => {
            quitarReciente(localStorage, reciente);
            if (reciente.fuente === 'archivo') borrarArchivo(reciente.id);
            renderizarRecientes();
        });
        fila.append(boton, borrar);
        return fila;
    }));
}

// El título del tema llega cuando carga el reproductor: ahí se anota en el reciente.
new MutationObserver(() => {
    const titulo = $('reproductor-titulo').textContent.trim();
    // Se queda con el primero: en una playlist, el título de la que arrancó.
    if (!recienteActual || recienteActual.titulo || !titulo || titulo === 'Cargando…' || titulo.startsWith('No se pudo')) return;
    recienteActual.titulo = titulo;
    titularReciente(localStorage, recienteActual, titulo);
    renderizarRecientes();
}).observe($('reproductor-titulo'), { childList: true, characterData: true, subtree: true });

$('fs-buscar').addEventListener('click', () => $('fs-archivo').click());
$('fs-archivo').addEventListener('change', async () => {
    const archivo = $('fs-archivo').files?.[0];
    $('fs-archivo').value = '';
    if (!archivo) return;
    const reciente = { fuente: 'archivo', id: `${archivo.name}-${archivo.size}`, titulo: tituloDeArchivo(archivo.name) };
    // Primero suena (todavía dentro del toque, para que iOS deje), después se guarda.
    // Desde la libreta, la hoja se cierra.
    usarArchivo(archivo, reciente);
    await guardarArchivo(reciente.id, archivo);
});
renderizarRecientes();

// Si viene sonando (o en pausa) una canción, de la libreta o de una ronda que ya terminó,
// el play de la bandeja la toma para la ronda en vez de sumar un beat encima (pedido de
// Swa: se duplicaba el audio).
function empezarConLaMusica() {
    if (!linkFreestyle) {
        linkFreestyle = { fuente: musica.fuente };
        sincronizarLinkFreestyle();
    }
    if (sonando) empezarRonda();
    else musica.reproducir?.();
}

$('fs-play').addEventListener('click', () => {
    if (!ronda && musica) return empezarConLaMusica();
    if (!ronda) return empezarRonda();
    if (ronda.pausa) return reanudarRonda();
    pausarRonda();
});
// El reproductor de los beats de la app: pausa del todo (beat incluido), pasa de beat
// en el orden del catálogo y la cruz termina la ronda.
$('fs-beat-pausar').addEventListener('click', () => {
    if (!ronda) return;
    if (!ronda.pausa) return pausarRonda();
    if (!ronda.sigueSonando) return reanudarRonda();
    detenerBeat();
    ronda.sigueSonando = false;
    actualizarEfecto();
});
for (const [id, paso] of [['fs-beat-anterior', -1], ['fs-beat-siguiente', 1]]) {
    $(id).addEventListener('click', () => {
        const beat = CATALOGO_BEATS[CATALOGO_BEATS.findIndex(b => b.id === beatId) + paso];
        if (beat) elegirBeat(beat.id);
    });
}
$('fs-beat-cerrar').addEventListener('click', () => terminarRonda());
$('fs-reloj').addEventListener('click', () => {
    if (ronda?.pausa) reanudarRonda();
    else pausarJugando();
});
// La bandeja solo se ve en pausa: ahí la flecha vuelve todo al principio (cronómetro y
// palabras). Con un link, la música queda donde estaba.
$('fs-reiniciar').addEventListener('click', () => {
    const boton = $('fs-reiniciar');
    boton.classList.remove('girando');
    void boton.offsetWidth;
    boton.classList.add('girando');
    if (ronda) return terminarRonda();
    if (!cola.length) asegurarCola();
    mostrarCuentaIdle();
});
// OK usa el link del campo; si está vacío, prueba con lo copiado.
$('fs-pegar').addEventListener('click', async () => {
    if (!$('fs-link').value.trim()) {
        try {
            const texto = (await navigator.clipboard.readText())?.trim();
            if (texto) $('fs-link').value = texto;
        } catch { /* sin permiso para leer lo copiado */ }
    }
    await usarLink($('fs-link').value);
});
$('fs-link').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    usarLink($('fs-link').value);
});
renderizarDuraciones();
renderizarBeats();
asegurarCola();
mostrarCuentaIdle();

// ---------- Métrica Extras (paywall) ----------
const CANDADO = '<svg viewBox="0 0 24 24" class="icono"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
const TILDE = '<svg viewBox="0 0 24 24" class="icono"><path d="M5 12l5 5 9-10"/></svg>';

function renderizarExtras() {
    const extras = tieneExtras(localStorage);
    renderizarDuraciones();
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
// YouTube se ve a 200×200 dentro de la tarjeta (no se puede ocultar ni tapar). SoundCloud va fuera de vista.
const VOLUMEN_INICIAL = 70;

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

const ICONO_PAUSA = '<svg viewBox="0 0 24 24" class="icono"><path d="M8 5v14M16 5v14"/></svg>';
const ICONO_PLAY = '<svg viewBox="0 0 24 24" class="icono icono-relleno"><path d="M8 5l11 7-11 7z"/></svg>';

function pintarProgreso() {
    const fraccion = fraccionDe(actual, duracion);
    $('musica-tiempo').textContent = formatoTiempo(actual);
    $('musica-duracion').textContent = formatoTiempo(duracion);
    $('musica-llenado').style.width = `${fraccion * 100}%`;
    $('musica-punto').style.left = `${fraccion * 100}%`;
    $('musica-pista').setAttribute('aria-valuemax', String(Math.round(duracion)));
    $('musica-pista').setAttribute('aria-valuenow', String(Math.round(actual)));
    $('reproductor').classList.toggle('arrastrando', arrastrando);
    pintarMarca();
}

function pintarMarca() {
    const hay = marca != null && duracion > 0;
    $('musica-marca-punto').hidden = !hay;
    if (hay) $('musica-marca-punto').style.left = `${fraccionDe(marca, duracion) * 100}%`;
    $('musica-marca').setAttribute('aria-pressed', String(marca != null));
    $('musica-bucle').setAttribute('aria-disabled', String(marca == null));
    $('musica-bucle').setAttribute('aria-pressed', String(volverAMarca && marca != null));
    // El archivo del teléfono va en loop desde el principio; con el bucle, vuelve a la marca.
    const audio = $('reproductor-oculto').querySelector('audio');
    if (audio) audio.loop = !(volverAMarca && marca != null);
}

// La marca es del tema: si la playlist pasa a otro, se borra (cambiar de sección no la toca).
function anotarCancion(id) {
    if (!id || id === cancionActual) return;
    const habia = cancionActual != null;
    cancionActual = id;
    if (!habia || marca == null) return;
    marca = null;
    volverAMarca = false;
    pintarMarca();
}

// Cuando el tema termina: con el bucle prendido, sigue desde la marca.
function volverALaMarca() {
    if (!volverAMarca || marca == null || !musica?.ir) return false;
    musica.ir(marca);
    musica.reproducir?.();
    return true;
}

function mostrarEstadoMusica() {
    const nombre = { youtube: 'YouTube', soundcloud: 'SoundCloud', archivo: 'Del teléfono' }[musica?.fuente] ?? '';
    const enPausa = musica?.fuente === 'youtube' && plegado;
    $('reproductor-fuente').textContent = nombre ? (enPausa ? `${nombre} · en pausa` : nombre) : '';
    // Sin playlist no hay a qué canción pasar: las flechas quedan apagadas.
    for (const id of ['musica-anterior', 'musica-siguiente']) $(id).setAttribute('aria-disabled', String(!musica?.lista));
    if (falloMusica) {
        $('musica-play').setAttribute('aria-label', 'No se puede reproducir');
        $('musica-play').setAttribute('aria-disabled', 'true');
        $('musica-play').innerHTML = ICONO_PLAY;
        return;
    }
    const pausado = enPausa || !sonando;
    $('musica-play').setAttribute('aria-label', pausado ? 'Reproducir' : 'Pausar');
    $('musica-play').setAttribute('aria-disabled', String(enPausa));
    $('musica-play').innerHTML = pausado ? ICONO_PLAY : ICONO_PAUSA;
}

function aplicarVideo() {
    const esYouTube = musica?.fuente === 'youtube';
    const fueraDelEditor = !document.body.classList.contains('editando');
    const grande = tarjetaGrande({ fuente: musica?.fuente, plegado, fueraDelEditor });
    const card = $('reproductor');
    card.classList.toggle('youtube', Boolean(esYouTube));
    card.classList.toggle('plegado', Boolean(esYouTube && plegado));
    card.classList.toggle('grande', grande);
    $('musica-plegar').hidden = !grande;
    $('musica-mostrar').hidden = !(esYouTube && plegado);
    $('musica-nota-youtube').hidden = !(esYouTube && plegado);
    // SoundCloud chico arriba de la barra: la flechita lo vuelve a agrandar.
    $('musica-agrandar').hidden = !(musica?.fuente === 'soundcloud' && fueraDelEditor && plegado);
    mostrarEstadoMusica();
    ubicarReproductor();
}

function alCambiarEstado(activo) {
    sonando = activo;
    if (plegarAlPausar && !sonando) {
        plegarAlPausar = false;
        aplicarVideo();
    }
    mostrarEstadoMusica();
    // Con un link, el play de la tarjeta es el de la ronda: no hay otro.
    if (!rondaSigueAlReproductor()) return;
    if (activo) {
        if (!ronda) empezarRonda();
        else if (ronda.pausa) reanudarRonda();
    } else pausarRonda();
}

// La tarjeta se esconde con el teclado y fuera del editor. YouTube se pausa en los dos
// casos; SoundCloud solo al salir del editor (con el teclado puede seguir).
function ocultarMusicaSiHaceFalta() {
    if (!musica?.pausar) return;
    if (pausarAlOcultar({ fuente: musica.fuente, sonando, visible: reproductorVisible() })) musica.pausar();
}
new MutationObserver(ocultarMusicaSiHaceFalta).observe(document.body, { attributes: true, attributeFilter: ['class'] });


function seguirProgreso(leer) {
    clearInterval(progresoTimer);
    progresoTimer = setInterval(leer, 250);
}

function anotarTiempo(segundos, total = duracion) {
    if (arrastrando) return;
    actual = Math.max(0, Number(segundos) || 0);
    if (total > 0) duracion = total;
    pintarProgreso();
}

// Suena una cosa a la vez: un link o archivo nuevo para el beat de la app, y uno pegado
// en la libreta deja de ser el de Freestyle.
function soltarLoQueSuena(desdeLaLibreta) {
    if (ronda && !linkFreestyle) terminarRonda();
    if (!desdeLaLibreta || !linkFreestyle) return;
    linkFreestyle = null;
    recienteActual = null;
    $('fs-link').value = '';
    sincronizarLinkFreestyle();
}

async function escucharMusica(texto) {
    const link = leerLink(texto);
    if (!link) return avisoFs('Ese link no es de YouTube ni de SoundCloud.');
    avisoFs('');
    soltarLoQueSuena(false);
    cerrarMusica();
    // SoundCloud arranca achicado (pedido de Swa): la flechita lo agranda.
    plegado = link.fuente === 'soundcloud';
    const generacion = generacionMusica;
    $('reproductor-titulo').textContent = 'Cargando…';
    $('reproductor').hidden = false;
    document.body.classList.add('con-musica');
    musica = { fuente: link.fuente, lista: esLista(link) };
    aplicarVideo();
    try {
        if (link.fuente === 'youtube') {
            // Visible antes de reproducir: la política no deja el autoplay con el player a medias.
            await apiYouTube();
            // Si se cerró durante la descarga de la API, no se crea el reproductor.
            if (generacion !== generacionMusica) return;
            const lugar = document.createElement('div');
            $('reproductor-marco').replaceChildren(lugar);
            let reproductor;
            const leerYouTube = () => {
                if (arrastrando || musica?.fuente !== 'youtube') return;
                try {
                    const t = Number(reproductor.getCurrentTime?.());
                    const d = Number(reproductor.getDuration?.());
                    if (Number.isFinite(t)) anotarTiempo(t, Number.isFinite(d) ? d : 0);
                } catch { /* el reproductor ya se cerró */ }
            };
            reproductor = new YT.Player(lugar, {
                ...(link.id ? { videoId: link.id } : {}), width: LADO_YOUTUBE, height: LADO_YOUTUBE,
                // controls: 0 es un parámetro de la API. Así 200×200 alcanza: con la barra
                // de YouTube el player tiene que poder mostrarla entera.
                playerVars: {
                    // Sin autoplay del iframe: playVideo() corre en onReady, y solo si la tarjeta se ve.
                    autoplay: 0, playsinline: 1, start: link.inicio, controls: 0, rel: 0,
                    // Una playlist: las flechas de la tarjeta pasan de video.
                    ...(link.lista ? { listType: 'playlist', list: link.lista } : {}),
                    ...(location.origin && location.origin !== 'null' ? { origin: location.origin } : {}),
                },
                events: {
                    onReady: e => {
                        if (generacion !== generacionMusica) return;
                        e.target.setVolume(VOLUMEN_INICIAL);
                        leerYouTube();
                        if (!plegado && reproductorVisible()) e.target.playVideo();
                    },
                    onStateChange: e => {
                        if (generacion !== generacionMusica || falloMusica) return;
                        const datos = reproductor.getVideoData?.();
                        anotarCancion(datos?.video_id || datos?.title);
                        const titulo = reproductor.getVideoData?.().title;
                        if (titulo) $('reproductor-titulo').textContent = titulo;
                        leerYouTube();
                        alCambiarEstado(e.data === YT.PlayerState.PLAYING || e.data === YT.PlayerState.BUFFERING);
                        if (e.data === YT.PlayerState.ENDED) volverALaMarca();
                    },
                    onAutoplayBlocked: () => { if (!falloMusica) alCambiarEstado(false); },
                    onError: () => {
                        if (generacion !== generacionMusica) return;
                        falloMusica = true;
                        sonando = false;
                        $('reproductor-titulo').textContent = 'No se pudo reproducir este video';
                        mostrarEstadoMusica();
                    },
                },
            });
            seguirProgreso(leerYouTube);
            const irYouTube = segundos => {
                reproductor.seekTo(segundos, true);
                anotarTiempo(segundos);
            };
            Object.assign(musica, {
                reproducir: () => reproductor.playVideo(),
                pausar: () => reproductor.pauseVideo(),
                anterior: () => reproductor.previousVideo(),
                siguiente: () => reproductor.nextVideo(),
                ir: irYouTube,
                cerrar: () => reproductor.destroy(),
            });
        } else {
            // El link corto se resuelve antes de armar el iframe. play() sigue en READY,
            // igual que con un link largo: el widget recién puede sonar cuando avisa que
            // está listo, y eso ya llega después de cargar. Llamarlo en el click, con el
            // await de por medio, no encuentra un widget. Si iOS ignora el play() de
            // READY (entra por postMessage, fuera del toque), el botón de la tarjeta lo
            // llama dentro del click.
            let urlCancion;
            try {
                urlCancion = await resolverLinkSoundCloud(link.url);
            } catch {
                if (generacion !== generacionMusica) return;
                $('reproductor-titulo').textContent = 'No se pudo reproducir esta canción';
                return;
            }
            if (generacion !== generacionMusica) return;
            await apiSoundCloud();
            if (generacion !== generacionMusica) return;
            const marco = document.createElement('iframe');
            marco.allow = 'autoplay; encrypted-media';
            marco.title = 'SoundCloud';
            marco.src = urlWidgetSoundCloud(urlCancion);
            $('reproductor-oculto').replaceChildren(marco);
            const widget = SC.Widget(marco);
            const { Events } = SC.Widget;
            const leerPosicion = () => widget.getPosition(ms => {
                if (!arrastrando) anotarTiempo(ms / 1000);
            });
            // Título y portada de la canción que suena: cambian al pasar de canción en un set.
            const mostrarCancion = () => widget.getCurrentSound(cancion => {
                if (generacion !== generacionMusica) return;
                anotarCancion(cancion?.id ?? cancion?.title);
                if (cancion?.title) $('reproductor-titulo').textContent = cancion.title;
                widget.getDuration(ms => {
                    if (generacion !== generacionMusica) return;
                    duracion = (Number(ms) || 0) / 1000;
                    pintarProgreso();
                });
                const portada = portadaSoundCloud(cancion);
                if (!portada || $('reproductor-marco').querySelector('img')?.src === portada) return;
                const imagen = document.createElement('img');
                imagen.src = portada;
                imagen.alt = '';
                $('reproductor-marco').replaceChildren(imagen);
            });
            widget.bind(Events.READY, () => {
                if (generacion !== generacionMusica) return;
                widget.setVolume(VOLUMEN_INICIAL);
                mostrarCancion();
                // Un link corto puede ser un set: se sabe recién acá.
                widget.getSounds(canciones => {
                    if (generacion !== generacionMusica || !Array.isArray(canciones)) return;
                    musica.lista = canciones.length > 1;
                    mostrarEstadoMusica();
                });
                // Si saliste del editor (o cerraste) mientras cargaba, no arranca oculto.
                if (reproductorVisible()) widget.play();
                else widget.pause();
                leerPosicion();
            });
            widget.bind(Events.PLAY, () => { alCambiarEstado(true); leerPosicion(); mostrarCancion(); });
            widget.bind(Events.PAUSE, () => { alCambiarEstado(false); leerPosicion(); });
            widget.bind(Events.FINISH, () => { alCambiarEstado(false); volverALaMarca(); });
            widget.bind(Events.PLAY_PROGRESS, data => {
                const ms = typeof data === 'number' ? data : Number(data?.currentPosition);
                if (!Number.isFinite(ms)) return;
                anotarTiempo(ms / 1000);
            });
            widget.bind(Events.ERROR, () => { $('reproductor-titulo').textContent = 'No se pudo reproducir esta canción'; });
            Object.assign(musica, {
                reproducir: () => widget.play(),
                pausar: () => widget.pause(),
                anterior: () => widget.prev(),
                siguiente: () => widget.next(),
                ir: segundos => { widget.seekTo(Math.round(segundos * 1000)); anotarTiempo(segundos); },
                cerrar: () => marco.remove(),
            });
        }
    } catch {
        if (generacion !== generacionMusica) return;
        $('reproductor-titulo').textContent = 'No se pudo cargar el reproductor. ¿Hay internet?';
        $('musica-plegar').hidden = true;
        $('musica-mostrar').hidden = true;
        $('musica-nota-youtube').hidden = true;
        $('musica-agrandar').hidden = true;
    }
}

// Un archivo del teléfono, con un <audio> fuera de vista y en loop (es un beat).
// En SwiftUI: AVAudioPlayer con numberOfLoops = -1.
function escucharArchivo(archivo, titulo) {
    soltarLoQueSuena(false);
    cerrarMusica();
    $('reproductor-titulo').textContent = titulo;
    $('reproductor').hidden = false;
    document.body.classList.add('con-musica');
    musica = { fuente: 'archivo', lista: false };
    aplicarVideo();
    const audio = new Audio(URL.createObjectURL(archivo));
    audio.loop = true;
    audio.volume = VOLUMEN_INICIAL / 100;
    $('reproductor-oculto').replaceChildren(audio);
    audio.addEventListener('loadedmetadata', () => anotarTiempo(audio.currentTime, audio.duration));
    audio.addEventListener('timeupdate', () => anotarTiempo(audio.currentTime, audio.duration));
    audio.addEventListener('play', () => alCambiarEstado(true));
    audio.addEventListener('pause', () => alCambiarEstado(false));
    audio.addEventListener('ended', volverALaMarca);
    audio.addEventListener('error', () => {
        falloMusica = true;
        sonando = false;
        $('reproductor-titulo').textContent = 'No se pudo reproducir este archivo';
        mostrarEstadoMusica();
    });
    Object.assign(musica, {
        reproducir: () => audio.play().catch(() => alCambiarEstado(false)),
        pausar: () => audio.pause(),
        ir: segundos => { audio.currentTime = segundos; anotarTiempo(segundos); },
        cerrar: () => { audio.pause(); URL.revokeObjectURL(audio.src); audio.remove(); },
    });
    if (reproductorVisible()) musica.reproducir();
}

// La tarjeta se ve en todas las secciones menos Ajustes, y se esconde con el teclado.
function reproductorVisible() {
    const clases = document.body.classList;
    return !$('reproductor').hidden && !clases.contains('teclado-abierto') && !clases.contains('en-ajustes');
}

function cerrarMusica() {
    generacionMusica++;
    clearInterval(progresoTimer);
    progresoTimer = null;
    musica?.cerrar?.();
    musica = null;
    marca = null;
    volverAMarca = false;
    cancionActual = null;
    sonando = false;
    plegado = false;
    plegarAlPausar = false;
    falloMusica = false;
    arrastrando = false;
    actual = 0;
    duracion = 0;
    $('reproductor-marco').replaceChildren();
    $('reproductor-oculto').replaceChildren();
    $('reproductor').hidden = true;
    $('reproductor').classList.remove('youtube', 'plegado', 'grande', 'arrastrando');
    document.body.classList.remove('con-musica');
    pintarProgreso();
    aplicarVideo();
}

// La tarjeta (la de los links o la de los beats de la app) va pegada abajo por CSS. Acá
// solo se reserva aire para que no tape nada: en la letra (--alto-reproductor) y, arriba
// de la barra de pestañas, en las otras secciones (--alto-sobre-barra, con 10 de aire).
function ubicarReproductor() {
    const tarjeta = [$('reproductor'), $('fs-sonando')].find(t => t.offsetHeight > 0);
    const alto = tarjeta?.offsetHeight ?? 0;
    const editando = document.body.classList.contains('editando');
    const raiz = document.documentElement.style;
    raiz.setProperty('--alto-sobre-barra', tarjeta && !editando ? `${alto + 10}px` : '0px');
    const enLetra = tarjeta ? `${alto + 24}px` : '0px';
    if (raiz.getPropertyValue('--alto-reproductor').trim() === enLetra) return;
    raiz.setProperty('--alto-reproductor', enLetra);
    if (editando) ajustarAltoTexto();
}
new ResizeObserver(ubicarReproductor).observe($('reproductor'));
new ResizeObserver(ubicarReproductor).observe($('fs-sonando'));
addEventListener('resize', ubicarReproductor);

// La nota musical de la libreta abre una hoja con el mismo cajón de Freestyle (el
// elemento se muda a la hoja y vuelve al cerrarla).
$('abrir-musica').addEventListener('click', () => {
    avisoFs(navigator.onLine ? '' : 'Sin internet no se puede escuchar música. Lo demás de Métrica anda igual.');
    $('hoja-musica-cajon').append($('fs-cajon'));
    $('hoja-musica').hidden = false;
    $('fs-link').focus();
});
function cerrarHojaMusica() {
    $('hoja-musica').hidden = true;
    $('pantalla-freestyle').querySelector('.contenido').append($('fs-cajon'));
}
// Con el camino del toque y no con contains: la cruz de un reciente ya no está en la página
// cuando el toque llega acá (la lista se vuelve a armar) y cerraba la hoja.
$('hoja-musica').addEventListener('click', e => { if (!e.composedPath().includes($('fs-cajon'))) cerrarHojaMusica(); });
$('musica-play').addEventListener('click', () => {
    if (falloMusica || !musica?.reproducir || (musica.fuente === 'youtube' && plegado)) return;
    musica[sonando ? 'pausar' : 'reproducir']?.();
});
$('musica-mostrar').addEventListener('click', () => {
    if (musica?.fuente !== 'youtube' || !plegado) return;
    const decision = alternarReproduccion({ fuente: musica.fuente, plegado, sonando: false });
    plegado = decision.plegado;
    plegarAlPausar = false;
    aplicarVideo();
    if (decision.accion === 'reproducir') musica.reproducir();
});
$('musica-plegar').addEventListener('click', () => {
    if (!musica || plegado) return;
    // SoundCloud se achica y sigue sonando: no hay video que tenga que verse.
    if (musica.fuente === 'soundcloud') {
        plegado = true;
        return aplicarVideo();
    }
    const decision = plegarVideo(sonando);
    plegado = true;
    if (decision.pausar) {
        plegarAlPausar = true;
        musica.pausar();
    } else aplicarVideo();
});
$('musica-agrandar').addEventListener('click', () => {
    if (musica?.fuente !== 'soundcloud') return;
    plegado = false;
    aplicarVideo();
});
// Las flechas cambian de canción en una playlist. Para moverse en el tema está la barra.
$('musica-anterior').addEventListener('click', () => { if (musica?.lista) musica.anterior?.(); });
$('musica-siguiente').addEventListener('click', () => { if (musica?.lista) musica.siguiente?.(); });
$('musica-cerrar').addEventListener('click', () => {
    const eraFreestyle = Boolean(linkFreestyle);
    cerrarMusica();
    recienteActual = null;
    if (!eraFreestyle) return;
    linkFreestyle = null;
    $('fs-link').value = '';
    if (ronda) terminarRonda();
    sincronizarLinkFreestyle();
});

function segundosDesdePuntero(clientX) {
    const r = $('musica-pista').getBoundingClientRect();
    return imantar(segundosEn(clientX - r.left, r.width, duracion), marca, duracion, r.width);
}
// La marca: tocarla (sonando o en pausa) marca este momento; el bucle vuelve ahí al terminar.
$('musica-marca').addEventListener('click', () => {
    if (!musica || !duracion) return;
    marca = actual;
    pintarMarca();
});
$('musica-bucle').addEventListener('click', () => {
    if (marca == null) return;
    volverAMarca = !volverAMarca;
    pintarMarca();
});
$('musica-pista').addEventListener('pointerdown', e => {
    if (!duracion || !musica?.ir) return;
    arrastrando = true;
    e.preventDefault();
    $('musica-pista').setPointerCapture?.(e.pointerId);
    actual = segundosDesdePuntero(e.clientX);
    pintarProgreso();
});
$('musica-pista').addEventListener('pointermove', e => {
    if (!arrastrando) return;
    actual = segundosDesdePuntero(e.clientX);
    pintarProgreso();
});
const soltarPista = e => {
    if (!arrastrando) return;
    actual = segundosDesdePuntero(e.clientX);
    arrastrando = false;
    pintarProgreso();
    musica?.ir?.(actual);
};
$('musica-pista').addEventListener('pointerup', soltarPista);
$('musica-pista').addEventListener('pointercancel', soltarPista);
// Tocar los botones de la tarjeta no le saca el foco al texto.
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

// Forzar actualización: le pide al service worker que busque la versión nueva. Si hay,
// la baja y la app se recarga sola; si no, avisa. No borra nada, así nunca se queda sin la app
// (borrar todo y recargar dejaba el iPhone bajando 8 MB de diccionario dos veces).
function avisarVersion(texto) {
    $('forzar-actualizacion').classList.remove('girando');
    $('version').textContent = texto;
    setTimeout(mostrarVersion, 2000);
}
$('forzar-actualizacion').addEventListener('click', async () => {
    if ($('forzar-actualizacion').classList.contains('girando')) return;
    if (!navigator.onLine) return avisarVersion('Sin internet');
    $('forzar-actualizacion').classList.add('girando');
    try {
        const registro = await navigator.serviceWorker.getRegistration();
        await registro.update();
        const nueva = registro.installing ?? registro.waiting;
        if (!nueva) return avisarVersion('Ya tenés la última');
        navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
        nueva.addEventListener('statechange', () => { if (nueva.state === 'redundant') avisarVersion('No se pudo bajar'); });
    } catch {
        avisarVersion('No se pudo buscar');
    }
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
