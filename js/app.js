// Interfaz: solo DOM y navegación. La lógica vive en js/logica/ (módulos puros).
import { parsearPalabras, parsearFrecuencias } from './logica/diccionario.js';
import { palabrasAlAzar } from './logica/generador.js';
import { crearIndiceRimas, buscarRimas, agruparRimas, rimanConsonante, rimasInternas, numerarEstrofas, asignarColores, claveAsonante, claveConsonante, ANGLICISMOS } from './logica/rimas.js';
import { contarSilabasVerso, inicioTonica, rimasMultisilabicas, separarSilabas } from './logica/silabas.js';
import { CATALOGO_BEATS, BEATS_CON_SONIDO, GENEROS_BEAT, beatsDeGenero, beatVecino, DURACIONES, DURACION_INICIAL, cambiaLaPalabra, silabaFuerte, estadoRonda, elegirDuracion, fuenteFreestyle, patronDeBeat, archivoDeBeat, etiquetaBeat, proximasPalabras, avanzarPalabras, msPorPalabra, leerVelocidad, guardarVelocidad, compasesDeVelocidad, VELOCIDAD_MAXIMA } from './logica/freestyle.js';
import { iniciarBeat, iniciarArchivo, detenerBeat, precargarArchivo, grabarBeat, usarSalida } from './beats.js';
import { codificarMp3, nombreDeGrabacion, CLAVE_MICROFONO, pedidoMicrofono, inicioDeMuestras, leerVolumenes, guardarVolumen, inicioDeVoz, tipoDeGrabacion, desfaseDeVoz, describirGrabacion, extensionDeAudio, nombreDeArchivo, codificarWav } from './logica/grabaciones.js';
import { nuevaLetra, listarLetras, guardarLetra, borrarLetra, moverLetra, lugaresEnGrilla, listarGuardadas, alternarGuardada } from './logica/sesiones.js';
import { crearCorrector } from './logica/ortografia.js';
import { FILTROS, listarFrases, anotarFrase, editarFrase, borrarFrase, alternarUsada, filtrarFrases, etiquetaVolver } from './logica/baul.js';
import { CATEGORIAS as CATEGORIAS_TEMA, TEMAS as CONSIGNAS } from '../temas/temas.js';
import { marcarUsado, siguienteTema, numeroEnCategoria } from './logica/temas.js';
import { AJUSTES_LIBRETA, leerAjustesLibreta, guardarAjusteLibreta, estiloLibreta } from './logica/libreta.js';
import { SECCIONES, separador, esSeparador } from './logica/secciones.js';
import { crearIndiceSinonimos, buscarSinonimos } from './logica/sinonimos.js';
import { crearIndiceRelacionados, buscarRelacionados } from './logica/relacionados.js';
import { crearEfecto } from './efectos.js';
import { moodDeTitulo, moodDeBeat, tiemposEn, leerCantidadEfectos, guardarCantidadEfectos, EFECTOS_MAXIMO } from './logica/ambiente.js';
import { leerLink, esLista, formatoTiempo, fraccionDe, segundosEn, imantar, LADO_YOUTUBE, urlWidgetSoundCloud, resolverLinkSoundCloud, plegarVideo, alternarReproduccion, pausarAlOcultar, tarjetaGrande, portadaSoundCloud } from './logica/musica.js';
import { leerRecientes, agregarReciente, quitarReciente, titularReciente, sufijoReciente, tituloDeArchivo } from './logica/recientes.js';
import { APARIENCIAS, leerApariencia, elegirApariencia } from './logica/apariencia.js';
import { PRODUCTO, TEMAS, tieneExtras, comprarExtras, borrarCompra, mostrarPublicidad, temaDisponible, temaDeLetra } from './logica/compra.js';

const $ = id => document.getElementById(id);
const COLORES_RIMA = 12;

const todasLasPalabras = parsearPalabras(textoPalabras);
const palabrasSimples = parsearPalabras(textoPalabrasSimples);

// El índice de rimas tarda un par de segundos en armarse: se arma una sola vez.
let indice = null, frecuencias = null, corrector = null, sinonimos = null, relacionados = null;
const frecuenciasDePalabras = () => frecuencias ??= parsearFrecuencias(textoFrecuencias);
const indiceRimas = () => indice ??= crearIndiceRimas(todasLasPalabras, frecuenciasDePalabras());
const indiceSinonimos = () => sinonimos ??= crearIndiceSinonimos(textoSinonimos, textoFormasSinonimos);
const indiceRelacionados = () => relacionados ??= crearIndiceRelacionados(textoRelacionados);
// Errores de tipeo: corregir('balcon') -> 'balcón' (null si está bien escrita).
const corregir = palabra => (corrector ??= crearCorrector(todasLasPalabras, frecuenciasDePalabras()))(palabra);
// La palabra como se quiso escribir, para que rime bien aunque falte la tilde.
// Las palabras en inglés que se usan en letras (face, mail...) no se corrigen.
const bienEscrita = palabra => palabra && (ANGLICISMOS.has(palabra.toLowerCase()) ? palabra : corregir(palabra) ?? palabra);

// ---------- Pestañas (TabView) ----------
function mostrarPestana(nombre) {
    cerrarBusquedaBaul();
    document.querySelectorAll('.pantalla').forEach(p => p.classList.toggle('activa', p.dataset.pestana === nombre));
    document.querySelectorAll('#barra-pestanas button').forEach(b => b.setAttribute('aria-selected', b.dataset.pestana === nombre));
    if (nombre === 'rimas') reanudarPalabras(); else pausarPalabras();
    vigilarMusica();
    // En Ajustes el reproductor no se ve, pero lo que suena sigue (salvo YouTube).
    document.body.classList.toggle('en-ajustes', nombre === 'ajustes');
    // Los nombres de los micrófonos y salidas aparecen recién después del primer permiso.
    if (nombre === 'ajustes') renderizarAudio();
    // Acapella no sigue en otra sección: se detiene (con su grabación), pedido de Swa.
    if (nombre !== 'freestyle' && ronda && !ronda.pausa && esAcapella()) pausarRonda();
    // «Recientes» se pliega al cambiar de sección (pedido de Swa).
    $('fs-recientes-caja').open = false;
    sincronizarLinkFreestyle();
    ubicarReproductor();
}
// Tocar «Letras» estando en el baúl vuelve al inicio de Letras; desde otra sección, el baúl
// sigue abierto donde estaba (pedido de Swa).
document.querySelectorAll('#barra-pestanas button').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.pestana === 'letras' && $('pantalla-letras').classList.contains('activa') && $('vista-baul').classList.contains('activa')) {
        mostrarVista('vista-lista-letras');
        renderizarLetras();
    }
    mostrarPestana(b.dataset.pestana);
}));

// ---------- Letras (NavigationStack: lista -> editor) ----------
function mostrarVista(id) {
    document.querySelectorAll('#pantalla-letras .vista').forEach(v => v.classList.toggle('activa', v.id === id));
    document.body.classList.toggle('editando', id === 'vista-editor');
    ocultarMusicaSiHaceFalta();
    if (musica) aplicarVideo();
    ubicarReproductor();
    vigilarMusica();
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
        tarjeta.dataset.id = letra.id;
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

// Cada tarjeta va en su lugar de la grilla, a la columna más corta, chica o larga según la letra.
function ubicarTarjetas() {
    const lugares = lugaresEnGrilla(tarjetasLetras.map(t => t.dataset.id));
    tarjetasLetras.forEach((tarjeta, i) => {
        const { columna, fila, larga } = lugares[i];
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
function confirmarBorrado(letra, responder, pregunta = '¿Borrar la letra?') {
    const titulo = letra.titulo?.trim() || 'Sin título';
    preguntar({ titulo: pregunta, texto: `«${titulo}» se va a borrar y no se puede deshacer.`, boton: 'Borrar', rojo: true }, responder);
}

// La misma alerta para otras preguntas (por ejemplo, avisar antes de descargar).
function preguntar({ titulo, texto, boton, rojo = false }, responder) {
    const alerta = $('confirmar-borrado');
    $('confirmar-borrado-titulo').textContent = titulo;
    $('confirmar-borrado-texto').textContent = texto;
    $('aceptar-borrado').textContent = boton;
    $('aceptar-borrado').classList.toggle('texto-rojo', rojo);
    alerta.hidden = false;
    const cerrar = ok => {
        alerta.hidden = true;
        $('aceptar-borrado').onclick = $('cancelar-borrado').onclick = null;
        responder(ok);
    };
    $('aceptar-borrado').onclick = () => cerrar(true);
    $('cancelar-borrado').onclick = () => cerrar(false);
}

// ---------- Baúl de frases (NavigationStack: Letras -> baúl) ----------
let filtroBaul = 'todas';
const ICONO_CHECK = '<svg viewBox="0 0 24 24" class="icono"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

// Se entra desde Letras o desde una letra abierta; el botón de volver dice a dónde vuelve.
let baulDesdeLetra = false;
function abrirBaul(desdeLetra) {
    baulDesdeLetra = desdeLetra;
    $('baul-atras-texto').textContent = desdeLetra ? etiquetaVolver($('editor-titulo').value) : 'Letras';
    mostrarVista('vista-baul');
    renderizarBaul();
}
$('abrir-baul').addEventListener('click', () => abrirBaul(false));
$('abrir-baul-libreta').addEventListener('click', () => { ocultarSugerencias(); document.activeElement?.blur(); abrirBaul(true); });
$('baul-atras').addEventListener('click', () => {
    cerrarBusquedaBaul();
    if (baulDesdeLetra) return mostrarVista('vista-editor');
    mostrarVista('vista-lista-letras');
    renderizarLetras();
});

// El campo crece con lo que se escribe (hasta el máximo del CSS) y «Guardar» se prende con texto.
function ajustarCampoBaul() {
    const campo = $('baul-texto');
    campo.style.height = 'auto';
    campo.style.height = `${campo.scrollHeight}px`;
    $('baul-guardar').disabled = !campo.value.trim();
}
$('baul-texto').addEventListener('input', ajustarCampoBaul);
// Que tocar «Guardar» no cierre el teclado: así se puede seguir anotando.
$('baul-guardar').addEventListener('mousedown', e => e.preventDefault());
$('baul-guardar').addEventListener('click', () => {
    if (!anotarFrase(localStorage, $('baul-texto').value)) return;
    $('baul-texto').value = '';
    ajustarCampoBaul();
    renderizarBaul();
});

// La lupa de arriba muestra el buscador; cerrarlo vuelve a mostrar todas.
// La lupa de arriba muestra el buscador. Se cierra y se borra con la lupa, al volver o al
// cambiar de sección (pedido de Swa).
function cerrarBusquedaBaul() {
    if ($('baul-busqueda').hidden) return;
    $('baul-busqueda').hidden = true;
    $('baul-abrir-busqueda').setAttribute('aria-expanded', false);
    $('baul-buscar').value = '';
    renderizarBaul();
}
$('baul-abrir-busqueda').addEventListener('click', () => {
    if (!$('baul-busqueda').hidden) return cerrarBusquedaBaul();
    $('baul-busqueda').hidden = false;
    $('baul-abrir-busqueda').setAttribute('aria-expanded', true);
    $('baul-buscar').focus();
});
$('baul-buscar').addEventListener('input', () => renderizarBaul());

$('baul-filtros').append(...FILTROS.map(({ id, nombre }) => {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.setAttribute('role', 'radio');
    boton.dataset.filtro = id;
    boton.textContent = nombre;
    boton.addEventListener('click', () => { filtroBaul = id; renderizarBaul(); });
    return boton;
}));

function renderizarBaul() {
    $('baul-filtros').querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', b.dataset.filtro === filtroBaul));
    const todas = listarFrases(localStorage);
    const busqueda = $('baul-buscar').value;
    const frases = filtrarFrases(todas, { filtro: filtroBaul, busqueda });
    const columnas = [...$('baul-frases').children];
    columnas.forEach(c => c.replaceChildren());
    // Cada tarjeta va a la columna más corta (en SwiftUI: dos VStack, o un Layout propio).
    for (const frase of frases) {
        const [a, b] = columnas;
        const corta = a.offsetHeight === b.offsetHeight ? (a.children.length <= b.children.length ? a : b) : (a.offsetHeight < b.offsetHeight ? a : b);
        corta.append(tarjetaFrase(frase));
    }
    const vacio = $('baul-vacio');
    vacio.hidden = frases.length > 0;
    vacio.textContent = busqueda.trim() ? `Ninguna frase tiene «${busqueda.trim()}».`
        : !todas.length ? 'Anotá arriba las frases que se te ocurran, para usarlas después en una letra.'
        : filtroBaul === 'usadas' ? 'Todavía no marcaste ninguna como usada.' : 'Ya usaste todas.';
}

// Tocar una tarjeta la edita ahí mismo y se agranda con el texto; al tocar afuera se guarda y
// vuelve a su alto máximo. Mantenerla apretada abre el menú.
function tarjetaFrase(frase) {
    const tarjeta = document.createElement('div');
    tarjeta.className = 'tarjeta-frase';
    const texto = document.createElement('p');
    texto.className = 'texto-frase';
    texto.textContent = frase.texto;
    tarjeta.append(texto);
    if (frase.usada) {
        const check = document.createElement('span');
        check.className = 'check-usada';
        check.setAttribute('aria-label', 'Usada');
        check.innerHTML = ICONO_CHECK;
        tarjeta.append(check);
    }
    let espera = null, inicio = null, abrioMenu = false;
    const editando = () => tarjeta.classList.contains('editando');
    const soltar = () => { clearTimeout(espera); inicio = null; tarjeta.classList.remove('apretada'); };
    tarjeta.addEventListener('pointerdown', e => {
        if (editando()) return;
        abrioMenu = false;
        inicio = { x: e.clientX, y: e.clientY };
        tarjeta.classList.add('apretada');
        espera = setTimeout(() => { soltar(); abrioMenu = true; navigator.vibrate?.(10); abrirMenuFrase(frase, tarjeta); }, 450);
    });
    tarjeta.addEventListener('pointermove', e => {
        // Si se mueve antes de tiempo es que quiere desplazar la pantalla.
        if (inicio && Math.hypot(e.clientX - inicio.x, e.clientY - inicio.y) > 10) soltar();
    });
    tarjeta.addEventListener('pointerup', soltar);
    tarjeta.addEventListener('pointercancel', soltar);
    tarjeta.addEventListener('contextmenu', e => { if (!editando()) e.preventDefault(); });
    tarjeta.addEventListener('click', () => {
        if (abrioMenu || editando()) return;
        tarjeta.classList.add('editando');
        texto.contentEditable = 'plaintext-only';
        texto.focus();
        // El cursor, al final del texto.
        const rango = document.createRange();
        rango.selectNodeContents(texto);
        rango.collapse(false);
        getSelection().removeAllRanges();
        getSelection().addRange(rango);
    });
    texto.addEventListener('blur', () => {
        if (!editando()) return;
        tarjeta.classList.remove('editando');
        texto.contentEditable = 'false';
        editarFrase(localStorage, frase.id, texto.innerText);
        frase.texto = texto.innerText.trim();
        // Vacía se borra; con un buscador, puede que ya no entre.
        if (!frase.texto || $('baul-buscar').value.trim()) renderizarBaul();
        else texto.textContent = frase.texto;
    });
    return tarjeta;
}

// El menú de una frase: la tarjeta queda arriba, con el resto borroneado, y abajo las opciones.
let fraseDelMenu = null;
function abrirMenuFrase(frase, tarjeta) {
    fraseDelMenu = frase;
    const fondo = $('baul-menu'), elevada = $('baul-menu-frase'), opciones = $('baul-menu-opciones');
    elevada.replaceChildren(...[...tarjeta.children].map(n => n.cloneNode(true)));
    elevada.className = 'tarjeta-frase frase-elevada';
    $('baul-usada-texto').textContent = frase.usada ? 'Desmarcar como usada' : 'Marcar como usada';
    fondo.hidden = false;
    const r = tarjeta.getBoundingClientRect();
    elevada.style.left = `${r.left}px`;
    elevada.style.width = `${r.width}px`;
    // Si el menú no entra abajo, sube todo.
    const alto = elevada.offsetHeight;
    const top = Math.max(60, Math.min(r.top, innerHeight - alto - opciones.offsetHeight - 40));
    elevada.style.top = `${top}px`;
    opciones.style.top = `${top + elevada.offsetHeight + 12}px`;
    opciones.style.left = `${Math.min(r.left, innerWidth - opciones.offsetWidth - 16)}px`;
}
const cerrarMenuFrase = () => { $('baul-menu').hidden = true; fraseDelMenu = null; };
$('baul-menu').addEventListener('click', e => { if (e.target === $('baul-menu')) cerrarMenuFrase(); });
$('baul-copiar').addEventListener('click', () => {
    navigator.clipboard?.writeText(fraseDelMenu.texto).catch(() => {});
    cerrarMenuFrase();
});
$('baul-usada').addEventListener('click', () => {
    alternarUsada(localStorage, fraseDelMenu.id);
    cerrarMenuFrase();
    renderizarBaul();
});
$('baul-borrar').addEventListener('click', () => {
    borrarFrase(localStorage, fraseDelMenu.id);
    cerrarMenuFrase();
    renderizarBaul();
});

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
    renderizarTemas();
    mostrarVista('vista-editor');
    actualizarEditor();
    // Al entrar a una letra empezada no se abre el teclado (se lee primero, pedido de Swa);
    // en una nueva sí, en el título.
    if (!letra.texto) $('editor-titulo').focus();
    actualizarDameTema();
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
    // Las finales riman solo dentro de su estrofa (el renglón vacío o la parte la corta).
    const estrofas = numerarEstrofas(palabras);
    const grupos = pintar ? agruparRimas(palabrasFinales, estrofas) : [];
    // Consonante con el fondo lleno; asonante con el mismo color, más suave.
    const consonantes = rimanConsonante(palabrasFinales, estrofas);
    // Internas y multisilábicas, a la distancia elegida en «Rimas internas» («No» las apaga).
    const distancia = estiloLibreta(leerAjustesLibreta(localStorage)).internas;
    // Multisilábicas: si las sílabas de antes de la tónica también riman, se pintan desde ahí.
    // Llegan hasta `distancia` versos de separación (con 2, también las cruzadas ABAB).
    const multis = pintar && distancia ? rimasMultisilabicas(palabras, grupos, distancia + 1) : [];
    const internas = pintar ? rimasInternas(palabras, distancia) : [];
    // Cada terminación, un color fijo en toda la letra (12 en estilos.css, .rima-0 a .rima-11),
    // sin repetir color dentro de una estrofa: las internas que suenan como un grupo de finales usan su color.
    const clavesPorEstrofa = [];
    palabras.forEach((_, i) => {
        const claves = clavesPorEstrofa[estrofas[i]] ??= [];
        if (grupos[i] != null) claves.push(claveAsonante(palabrasFinales[i]));
        internas[i]?.forEach(interna => interna && claves.push(interna.clave));
    });
    const colores = asignarColores(clavesPorEstrofa.filter(Boolean), COLORES_RIMA);
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
            if ((esFinal || multi != null) && grupos[i] != null) clase = `rima-${colores.get(claveAsonante(palabrasFinales[i]))}${consonantes[i] ? '' : ' suave'}`;
            else if (internas[i]?.[n]) clase = `rima-${colores.get(internas[i][n].clave)}${internas[i][n].suave ? ' suave' : ''}`;
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

// La palabra tocada se ve en degradé violeta mientras se la cambia; al soltarla vuelve a su color.
// El texto visible es el del fondo (la caja de texto es transparente), así que se pinta ahí,
// por adentro del resaltado de la rima si lo tiene.
function marcarTocada(rango) {
    const fondo = $('editor-fondo');
    for (const vieja of fondo.querySelectorAll('.tocada')) vieja.replaceWith(vieja.textContent);
    fondo.normalize();
    if (!rango) return;
    const textos = document.createTreeWalker(fondo, NodeFilter.SHOW_TEXT);
    const nodos = [];
    while (textos.nextNode()) nodos.push(textos.currentNode);
    let desde = 0;
    for (const nodo of nodos) {
        const hasta = desde + nodo.length;
        const inicio = Math.max(rango.inicio, desde), fin = Math.min(rango.fin, hasta);
        if (inicio < fin) {
            const medio = nodo.splitText(inicio - desde);
            medio.splitText(fin - inicio);
            const span = document.createElement('span');
            span.className = 'tocada';
            medio.replaceWith(span);
            span.append(medio);
        }
        desde = hasta;
    }
}

// Al cambiar una palabra, la etiqueta es un botón que pasa de rimas a sinónimos y a relacionadas.
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
        const que = alternable ? MODOS_CAMBIO[modoCambio].vacio : 'rimas';
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

// La palabra que se tocó para cambiarla: primero muestra rimas y cada toque a la etiqueta
// pasa a sinónimos, a relacionadas («noche»: luna, madrugada...) y vuelve a rimas.
const MODOS_CAMBIO = [
    { etiqueta: 'Cambiar', vacio: 'rimas', buscar: palabra => buscarRimas(palabra, indiceRimas()).slice(0, 20) },
    { etiqueta: 'Sinónimos', vacio: 'sinónimos', buscar: palabra => buscarSinonimos(palabra, indiceSinonimos()).slice(0, 30) },
    { etiqueta: 'Relacionados', vacio: 'relacionadas', buscar: palabra => buscarRelacionados(palabra, indiceRelacionados()).slice(0, 30) },
];
let tocada = null, modoCambio = 0;
function mostrarCambio() {
    const palabra = bienEscrita(tocada);
    const modo = MODOS_CAMBIO[modoCambio];
    mostrarSugerencias(palabra, `${modo.etiqueta} «${tocada}»:`, modo.buscar(palabra), true);
}

// Tocar un renglón vacío ofrece marcar una parte de la letra; tocar una palabra muestra
// otras que riman con ella, para cambiarla.
editorTexto.addEventListener('click', () => {
    const { value, selectionStart } = editorTexto;
    const inicioVerso = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const finVerso = value.indexOf('\n', selectionStart) < 0 ? value.length : value.indexOf('\n', selectionStart);
    if (!value.slice(inicioVerso, finVerso).trim()) {
        marcarTocada(null);
        mostrarSugerencias(null, 'Marcar:', SECCIONES);
        reemplazo = { inicio: inicioVerso, fin: finVerso, seccion: true };
        mostrarCursorDespues();
        return;
    }
    $('sugerencias').hidden = true;
    reemplazo = null;
    marcarTocada(null);
    // Solo si no está al final de todo (ahí se sigue escribiendo).
    if (selectionStart === value.length) return;
    const antes = value.slice(0, selectionStart).match(/\p{L}*$/u)[0];
    const despues = value.slice(selectionStart).match(/^\p{L}*/u)[0];
    if (!antes && !despues) return;
    mostrarCursorDespues();
    // Si está mal escrita no se avisa: solo se muestran las rimas (o sinónimos) de la palabra que se quiso escribir.
    tocada = antes + despues;
    modoCambio = 0;
    mostrarCambio();
    reemplazo = { inicio: selectionStart - antes.length, fin: selectionStart + despues.length };
    marcarTocada(reemplazo);
});

// La barra aparece solo al tocar: si se cierra el teclado o se desliza la letra para leerla, se va.
const ocultarSugerencias = () => {
    $('sugerencias').hidden = true;
    reemplazo = null;
    marcarTocada(null);
};
editorTexto.addEventListener('blur', ocultarSugerencias);
// En el iPhone tocar algo que no es un campo no cierra el teclado (no hay blur): igual se suelta la palabra.
document.addEventListener('pointerdown', e => {
    if (reemplazo && e.target !== editorTexto && !e.target.closest('#sugerencias')) ocultarSugerencias();
});
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
        modoCambio = (modoCambio + 1) % MODOS_CAMBIO.length;
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
// SoundCloud y los archivos tienen 3 tamaños: grande, chico (plegado) y mini (plegado y mini).
let mini = false;
let generacionMusica = 0;
let actual = 0, duracion = 0, arrastrando = false, progresoTimer = null, momentoActual = 0;
// La marca imantada del tema que suena (en segundos) y si al terminar vuelve a ella.
let marca = null, cancionActual = null;

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
editorTexto.addEventListener('input', () => { actualizarEditor(); guardarActual(); actualizarDameTema(); });
$('editor-titulo').addEventListener('input', () => { guardarActual(); actualizarDameTema(); });

// ---------- Dame un tema ----------
// «¿Por dónde empiezo?»: en una letra vacía (sin título ni texto) va el botón de abajo, y con
// algo escrito, la estrella de arriba, al lado del baúl (pedido de Swa).
function actualizarDameTema() {
    const vacia = !($('editor-titulo').value.trim() || editorTexto.value.trim());
    $('dame-tema').hidden = !vacia;
    $('abrir-tema-libreta').hidden = vacia;
}

let temaActual = null;
let filtroTema = 'todas';
let desamor = false; // la subsección de Amor (pedido de Swa)
// Las categorías en el orden de Swa, y «Todas» al final.
const FILTROS_TEMA = [...CATEGORIAS_TEMA, { id: 'todas', nombre: 'Todas' }];

function sincronizarChips() {
    for (const boton of $('chips-tema').querySelectorAll('button')) {
        const activo = boton.dataset.categoria === filtroTema;
        boton.setAttribute('aria-pressed', activo);
        if (activo && filtroTema !== 'todas') boton.scrollIntoView({ inline: 'center', block: 'nearest' });
    }
}

function pintarTema(animar = true) {
    const categoria = CATEGORIAS_TEMA.find(c => c.id === temaActual.categoria);
    // «Amor 37 de 150»: qué número tocó dentro de su categoría (pedido de Swa).
    const { numero, total } = numeroEnCategoria(CONSIGNAS, temaActual);
    const nombre = temaActual.sub === 'desamor' ? 'Desamor' : categoria?.nombre;
    $('tema-categoria').textContent = nombre ? `${nombre} ${numero} de ${total}` : '';
    // La última palabra va pegada al ícono de mandar a la nota, así nunca queda solo en un renglón.
    const palabras = temaActual.texto.split(' ');
    $('tema-ultima').textContent = palabras.pop();
    $('tema-texto').textContent = palabras.length ? `${palabras.join(' ')} ` : '';
    const empujon = $('tema-empujon');
    empujon.hidden = !temaActual.empujon;
    if (temaActual.empujon) empujon.textContent = `+ ${temaActual.empujon}`;
    const guardada = listarFrases(localStorage).some(f => f.texto === temaActual.texto);
    $('tema-baul-texto').textContent = guardada ? 'En el baúl' : 'Al baúl';
    $('tema-baul').setAttribute('aria-pressed', guardada);
    // La frase nueva entra borroneada y el resplandor de atrás se enciende, como en Rimas.
    if (!animar) return;
    const caja = $('caja-tema');
    caja.classList.remove('cambio');
    void caja.offsetWidth;
    caja.classList.add('cambio');
}

// Las que se vieron desde que se abrió la hoja: la flecha vuelve a la anterior y el
// refrescar, si se había vuelto, avanza por las ya vistas antes de traer una nueva (pedido de Swa).
let historialTema = [];
let posTema = -1;

function mostrarDelHistorial(pos) {
    posTema = pos;
    temaActual = historialTema[pos];
    $('tema-anterior').disabled = posTema <= 0;
    pintarTema();
}

// Una nueva del filtro (al refrescar, cambiar de categoría o prender Desamor).
function otraTema() {
    $('tema-desamor').hidden = filtroTema !== 'amor';
    $('tema-desamor').setAttribute('aria-pressed', desamor);
    const sub = filtroTema === 'amor' && desamor ? 'desamor' : null;
    const tema = siguienteTema(CONSIGNAS, localStorage, { categoria: filtroTema, sub, evitar: temaActual?.id });
    historialTema = [...historialTema.slice(0, posTema + 1), tema];
    mostrarDelHistorial(historialTema.length - 1);
}

function siguienteDelHistorial() {
    if (posTema < historialTema.length - 1) mostrarDelHistorial(posTema + 1);
    else otraTema();
}

function anteriorDelHistorial() {
    if (posTema > 0) mostrarDelHistorial(posTema - 1);
}

function mostrarFichaTema() {
    $('tema-lista').hidden = true;
    $('tema-ficha').hidden = false;
}

function cerrarHojaTema() {
    $('hoja-tema').hidden = true;
    mostrarFichaTema();
}

function usarTemaActual() {
    marcarUsado(localStorage, temaActual.id);
}

$('chips-tema').append(...FILTROS_TEMA.map(categoria => {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'chip-tema';
    boton.dataset.categoria = categoria.id;
    boton.textContent = categoria.nombre;
    boton.addEventListener('click', () => {
        filtroTema = categoria.id;
        sincronizarChips();
        otraTema();
    });
    return boton;
}));

function renderListaTema() {
    $('tema-filas').replaceChildren(...FILTROS_TEMA.map(categoria => {
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'celda fila-cat' + (categoria.id === 'todas' ? ' todas' : '');
        boton.setAttribute('aria-selected', categoria.id === filtroTema);
        if (categoria.icono) {
            const icono = document.createElement('span');
            icono.className = 'marca-cat';
            icono.textContent = categoria.icono;
            boton.append(icono);
        }
        const nombre = document.createElement('span');
        nombre.textContent = categoria.nombre;
        boton.append(nombre);
        const cuenta = document.createElement('span');
        cuenta.className = 'cuenta-cat';
        cuenta.textContent = String(categoria.id === 'todas' ? CONSIGNAS.length : CONSIGNAS.filter(t => t.categoria === categoria.id && !t.sub).length);
        boton.append(cuenta);
        if (categoria.id === filtroTema) {
            const tilde = document.createElement('span');
            tilde.className = 'tilde-cat';
            tilde.textContent = '✓';
            boton.append(tilde);
        }
        boton.addEventListener('click', () => {
            filtroTema = categoria.id;
            sincronizarChips();
            otraTema();
            mostrarFichaTema();
        });
        return boton;
    }));
}

function abrirDameTema() {
    // Arranca en Amor, con Desamor apagado (pedido de Swa).
    filtroTema = 'amor';
    desamor = false;
    mostrarFichaTema();
    $('hoja-tema').hidden = false;
    sincronizarChips();
    $('chips-tema').scrollLeft = 0;
    temaActual = null;
    historialTema = [];
    posTema = -1;
    otraTema();
    document.activeElement?.blur();
}
$('dame-tema').addEventListener('click', abrirDameTema);
$('abrir-tema-libreta').addEventListener('click', abrirDameTema);
$('tema-desamor').addEventListener('click', () => {
    desamor = !desamor;
    otraTema();
});
$('tema-otra').addEventListener('click', () => {
    $('tema-otra').classList.remove('gira');
    void $('tema-otra').offsetWidth;
    $('tema-otra').classList.add('gira');
    siguienteDelHistorial();
});
$('tema-anterior').addEventListener('click', anteriorDelHistorial);
// Deslizar la caja a la izquierda trae otra, como la de Rimas; a la derecha, vuelve a la anterior.
{
    let inicio = null;
    $('caja-tema').addEventListener('pointerdown', e => { inicio = { x: e.clientX, y: e.clientY }; });
    $('caja-tema').addEventListener('pointerup', e => {
        if (!inicio) return;
        const dx = e.clientX - inicio.x;
        const dy = e.clientY - inicio.y;
        inicio = null;
        if (Math.abs(dx) <= 50 || Math.abs(dx) <= Math.abs(dy) * 1.5) return;
        if (dx < 0) siguienteDelHistorial();
        else anteriorDelHistorial();
    });
    $('caja-tema').addEventListener('pointercancel', () => { inicio = null; });
}
$('tema-categoria').addEventListener('click', () => {
    renderListaTema();
    $('tema-ficha').hidden = true;
    $('tema-lista').hidden = false;
});
$('tema-volver').addEventListener('click', mostrarFichaTema);
$('hoja-tema').addEventListener('click', e => { if (e.target === $('hoja-tema')) cerrarHojaTema(); });
// El ícono del final de la frase la manda a la nota (y el empujón, si tiene, entre paréntesis).
$('tema-nota').addEventListener('click', () => {
    if (!temaActual) return;
    const linea = temaActual.empujon ? `${temaActual.texto}\n(${temaActual.empujon})` : temaActual.texto;
    const actual = editorTexto.value.replace(/\s+$/, '');
    editorTexto.value = actual ? `${actual}\n${linea}` : linea;
    usarTemaActual();
    actualizarEditor();
    guardarActual();
    actualizarDameTema();
    cerrarHojaTema();
});
$('tema-baul').addEventListener('click', () => {
    if (!temaActual) return;
    // Tocarlo de nuevo la saca del baúl (pedido de Swa).
    const guardada = listarFrases(localStorage).find(f => f.texto === temaActual.texto);
    if (guardada) borrarFrase(localStorage, guardada.id);
    else {
        anotarFrase(localStorage, temaActual.texto);
        usarTemaActual();
    }
    pintarTema(false);
});
// Colores, renglones y sílabas se prenden y apagan, y se recuerda la elección.
// En pantallas chicas (iPhone 16) el botón de renglones no entra arriba: pasa a un interruptor
// en «Funciones» de la ruedita y arranca apagado; en las grandes (Pro Max) sigue arriba y
// arranca prendido (pedido de Swa).
const pantallaChica = matchMedia('(max-width: 419px)');
const renglonesPrendidos = () => (localStorage.getItem('metrica.alternar-renglones') ?? String(!pantallaChica.matches)) === 'true';
function aplicarAlternables() {
    $('silabas').classList.toggle('oculto', !$('mostrar-silabas').checked);
    const renglones = renglonesPrendidos();
    $('alternar-renglones').setAttribute('aria-pressed', renglones);
    $('mostrar-renglones').checked = renglones;
    document.querySelector('.editor-capas').classList.toggle('renglones', renglones);
}
$('mostrar-silabas').checked = localStorage.getItem('metrica.alternar-silabas') === 'true';
$('mostrar-silabas').addEventListener('change', () => {
    localStorage.setItem('metrica.alternar-silabas', $('mostrar-silabas').checked);
    aplicarAlternables();

    actualizarEditor();
});
if (localStorage.getItem('metrica.alternar-colores') === 'false') $('alternar-colores').setAttribute('aria-pressed', 'false');
$('alternar-colores').addEventListener('click', e => {
    const boton = e.currentTarget;
    boton.setAttribute('aria-pressed', boton.getAttribute('aria-pressed') !== 'true');
    localStorage.setItem('metrica.alternar-colores', boton.getAttribute('aria-pressed'));
    aplicarAlternables();
    actualizarEditor();
});
function cambiarRenglones(prendidos) {
    localStorage.setItem('metrica.alternar-renglones', prendidos);
    aplicarAlternables();
    actualizarEditor();
}
$('alternar-renglones').addEventListener('click', () => cambiarRenglones(!renglonesPrendidos()));
$('mostrar-renglones').addEventListener('change', () => cambiarRenglones($('mostrar-renglones').checked));
pantallaChica.addEventListener('change', aplicarAlternables);
aplicarAlternables();

// Ajustes de la libreta (la ruedita): sílabas, tamaño de letra, separaciones, rimas internas y fuente.
function aplicarEstiloLibreta() {
    const { tamano, alto, letras, fuente } = estiloLibreta(leerAjustesLibreta(localStorage));
    document.documentElement.style.setProperty('--libreta-letra', `${tamano}px`);
    document.documentElement.style.setProperty('--libreta-alto', `${alto}px`);
    document.documentElement.style.setProperty('--libreta-fuente', fuente);
    document.documentElement.style.setProperty('--libreta-letras', `${letras}em`);
}

// Un renglón con pasos de − y + (Stepper en SwiftUI) y el número al medio.
function pasosLibreta(clave, ajuste, elegida) {
    const opciones = Object.keys(ajuste.opciones);
    const i = opciones.indexOf(elegida);
    const fila = document.createElement('div');
    fila.className = 'fila-grupo';
    fila.innerHTML = `
        <span>${ajuste.nombre}</span>
        <span class="pasos-libreta" data-ajuste="${clave}">
            <button type="button" data-paso="-1" aria-label="Menos">−</button>
            <span class="valor-pasos">${ajuste.opciones[elegida].nombre}</span>
            <button type="button" data-paso="1" aria-label="Más">+</button>
        </span>`;
    for (const boton of fila.querySelectorAll('button')) {
        const destino = opciones[i + Number(boton.dataset.paso)];
        boton.disabled = !destino;
        boton.addEventListener('click', () => {
            guardarAjusteLibreta(localStorage, clave, destino);
            aplicarAjustesLibreta();
            actualizarEditor();
        });
    }
    return fila;
}

// La fuente, en un selector segmentado al pie del grupo, cada una con su letra.
function pastillasLibreta(clave, ajuste, elegida) {
    const grupo = document.createElement('div');
    grupo.className = 'pastillas-libreta';
    grupo.setAttribute('role', 'tablist');
    grupo.dataset.ajuste = clave;
    grupo.append(...Object.entries(ajuste.opciones).map(([opcion, { nombre }]) => {
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.setAttribute('role', 'tab');
        boton.setAttribute('aria-selected', opcion === elegida);
        boton.dataset.opcion = opcion;
        boton.textContent = nombre;
        boton.addEventListener('click', () => {
            guardarAjusteLibreta(localStorage, clave, opcion);
            aplicarAjustesLibreta();
            actualizarEditor();
        });
        return boton;
    }));
    return grupo;
}

function aplicarAjustesLibreta() {
    aplicarEstiloLibreta();
    const ajustes = leerAjustesLibreta(localStorage);
    $('opciones-libreta').replaceChildren(
        ...['tamano', 'separacion', 'letras'].map(clave => pasosLibreta(clave, AJUSTES_LIBRETA[clave], ajustes[clave])),
        pastillasLibreta('fuente', AJUSTES_LIBRETA.fuente, ajustes.fuente));
    const internas = AJUSTES_LIBRETA.internas;
    $('rimas-internas').replaceChildren(...Object.entries(internas.opciones).map(([opcion, { nombre }]) => new Option(nombre, opcion)));
    $('rimas-internas').value = ajustes.internas;
    $('valor-internas').textContent = `${internas.etiqueta}: ${internas.opciones[ajustes.internas].nombre}`;
}
$('rimas-internas').addEventListener('change', () => {
    guardarAjusteLibreta(localStorage, 'internas', $('rimas-internas').value);
    aplicarAjustesLibreta();
    actualizarEditor();
});
aplicarAjustesLibreta();
$('abrir-ajustes-libreta').addEventListener('click', () => { $('ajustes-libreta').hidden = false; });
$('cerrar-ajustes-libreta').addEventListener('click', () => { $('ajustes-libreta').hidden = true; });
$('ajustes-libreta').addEventListener('click', e => { if (e.target === $('ajustes-libreta')) $('ajustes-libreta').hidden = true; });

// ---------- Rimas (terminaciones al azar o las que riman con la que se escribe) ----------
let tipoRima = 'consonante';

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

const palabraBuscada = () => $('buscar-rima').value.trim().toLowerCase();
const rimasDeLaBusqueda = () => buscarRimas(palabraBuscada(), indiceRimas(), { tipo: tipoRima });
const conSinonimos = () => $('ver-sinonimos').getAttribute('aria-pressed') === 'true';
// Con «Sinónimos», los de la palabra buscada: primero los que riman consonante, después los
// asonantes y al final el resto.
function sinonimosDeLaBusqueda() {
    const palabra = palabraBuscada();
    const consonante = claveConsonante(palabra), asonante = claveAsonante(palabra);
    const orden = p => (consonante && claveConsonante(p) === consonante ? 0 : asonante && claveAsonante(p) === asonante ? 1 : 2);
    return buscarSinonimos(palabra, indiceSinonimos()).map((p, i) => [orden(p), i, p]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => x[2]);
}
const resultadosBuscados = () => (conSinonimos() ? sinonimosDeLaBusqueda() : rimasDeLaBusqueda());
// Las terminaciones llevan el efecto de la palabra tocada de la libreta.
const CLASE_BUSCADA = 'brillo-violeta';
// En el cajón de todas van hasta 300 (las más usadas primero): más allá son rarezas.
const MAXIMO_TODAS = 300;

// Tocar una palabra (de la caja o del cajón) busca sus rimas.
function buscarPalabra(palabra) {
    $('buscar-rima').value = palabra;
    buscarRima();
    $('pantalla-rimas').scrollTo({ top: 0, behavior: 'smooth' });
}

// El cajón de todas: dos columnas de 10 a la vista, y el resto se desliza adentro.
// Una palabra de los cajones: tocarla busca sus rimas, y al lado va «Guardar».
function itemPalabra(p) {
    const item = document.createElement('li');
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.append(fragmentoRima(p, CLASE_BUSCADA));
    boton.addEventListener('click', () => buscarPalabra(p));
    item.append(boton, botonGuardar(p));
    return item;
}

function renderizarRimas() {
    const palabra = palabraBuscada();
    const todas = palabra ? resultadosBuscados() : [];
    const lista = todas.slice(0, MAXIMO_TODAS);
    $('resultados-rimas').replaceChildren(...lista.map(itemPalabra));
    $('resultados-rimas').scrollTop = 0;
    $('cajon-todas').hidden = !lista.length;
    // Palabras relacionadas (js/logica/relacionados.js), con el mismo formato que «Todas».
    const relacionadas = palabra ? buscarRelacionados(palabra, indiceRelacionados()) : [];
    $('lista-relacionadas').replaceChildren(...relacionadas.map(itemPalabra));
    $('lista-relacionadas').scrollTop = 0;
    $('cajon-relacionadas').hidden = !relacionadas.length;
    $('encabezado-relacionadas').textContent = `Palabras relacionadas · ${relacionadas.length}`;
    const total = todas.length.toLocaleString('es-AR');
    $('encabezado-resultados').textContent = conSinonimos() ? `Todos los sinónimos · ${total}` : todas.length > MAXIMO_TODAS ? `Todas · las ${MAXIMO_TODAS} más usadas de ${total}` : `Todas · ${total}`;
    $('rimas-vacio').textContent = conSinonimos() ? `No encontré sinónimos para «${palabra}».` : `No encontré rimas ${tipoRima}s para «${palabra}».`;
    $('tipo-rima').classList.toggle('apagado', Boolean(palabra) && conSinonimos());
    $('rimas-vacio').hidden = !palabra || lista.length > 0;
    $('limpiar-rima').hidden = !palabra;
}

// Al escribir, el azar se frena y la caja muestra las rimas más usadas de la palabra.
function buscarRima() {
    desde = 0;
    // Si la palabra no tiene sinónimos (o se borró), «Sinónimos» se apaga y no se puede tocar.
    const haySinonimos = Boolean(palabraBuscada()) && buscarSinonimos(palabraBuscada(), indiceSinonimos()).length > 0;
    $('ver-sinonimos').disabled = !haySinonimos;
    if (!haySinonimos) $('ver-sinonimos').setAttribute('aria-pressed', 'false');
    renderizarRimas();
    refrescarPalabras(false);
    frenarReloj();
    arrancarReloj();
}

$('buscar-rima').addEventListener('input', buscarRima);
$('limpiar-rima').addEventListener('click', () => { $('buscar-rima').value = ''; buscarRima(); });
$('ver-sinonimos').addEventListener('click', () => {
    $('ver-sinonimos').setAttribute('aria-pressed', !conSinonimos());
    buscarRima();
});
document.querySelectorAll('#tipo-rima [role="tab"]').forEach(b => b.addEventListener('click', () => {
    tipoRima = b.dataset.tipo;
    document.querySelectorAll('#tipo-rima [role="tab"]').forEach(o => o.setAttribute('aria-selected', o === b));
    buscarRima();
}));

// El «?» de cada opción abre una viñeta corta, con la puntita hacia el «?». Se cierra tocando afuera.
const AYUDA_TIPO = {
    consonante: '<strong>Consonante:</strong> el final suena igual, letra por letra. Ej.: c<mark class="brillo-violeta">asa</mark> y p<mark class="brillo-violeta">asa</mark>, canc<mark class="brillo-violeta">ión</mark> y raz<mark class="brillo-violeta">ón</mark>.',
    asonante: '<strong>Asonante:</strong> el final repite solo las vocales. Ej.: c<mark class="brillo-violeta">a</mark>s<mark class="brillo-violeta">a</mark> y c<mark class="brillo-violeta">a</mark>m<mark class="brillo-violeta">a</mark> (a-a), l<mark class="brillo-violeta">u</mark>n<mark class="brillo-violeta">a</mark> y c<mark class="brillo-violeta">u</mark>r<mark class="brillo-violeta">a</mark> (u-a).',
};
function cerrarAyudaTipo() {
    $('vineta-tipo').hidden = true;
    document.querySelectorAll('.ayuda-tipo').forEach(b => b.setAttribute('aria-expanded', 'false'));
}
document.querySelectorAll('.ayuda-tipo').forEach(b => b.addEventListener('click', e => {
    e.stopPropagation();
    if (b.getAttribute('aria-expanded') === 'true') return cerrarAyudaTipo();
    cerrarAyudaTipo();
    b.setAttribute('aria-expanded', 'true');
    const vineta = $('vineta-tipo');
    vineta.innerHTML = AYUDA_TIPO[b.dataset.ayuda];
    vineta.hidden = false;
    const caja = vineta.getBoundingClientRect(), signo = b.getBoundingClientRect();
    vineta.style.setProperty('--punta', `${signo.left + signo.width / 2 - caja.left}px`);
}));
document.addEventListener('click', e => { if (!$('vineta-tipo').hidden && !e.target.closest('#vineta-tipo')) cerrarAyudaTipo(); });

// Las 4 palabras cambian cada 6 segundos, con la cuenta y una barrita que se vacía.
const CANTIDAD = 4;
const SEGUNDOS = 6;
let rimasALaVista = false; // la pestaña Rimas está abierta
let pausadoPorUsuario = false;
let restante = SEGUNDOS * 1000;
let cuadro = null, antes = 0, cambio = 0;
let desde = 0; // al buscar, desde cuál rima se muestran las 4 (refrescar pasa a las 4 siguientes)
const ICONO_PAUSA_AZAR = '<svg viewBox="0 0 24 24" class="icono"><path d="M8 5v14M16 5v14"/></svg>';
const ICONO_PLAY_AZAR = '<svg viewBox="0 0 24 24" class="icono icono-relleno"><path d="M8 5l11 7-11 7z"/></svg>';

// De dónde salen las palabras: las rimas de la palabra escrita, o todo el diccionario.
function poolActual() {
    const simples = $('palabras-simples').getAttribute('aria-pressed') === 'true';
    if (!palabraBuscada()) return simples ? palabrasSimples : todasLasPalabras;
    const rimas = resultadosBuscados();
    if (!simples) return rimas;
    const conjunto = new Set(palabrasSimples);
    return rimas.filter(p => conjunto.has(p));
}

// Botón «Guardar» (como el marcador de Twitter): guardada, se pinta con el efecto violeta.
const ICONO_GUARDAR = '<span class="icono-guardar"><span></span></span>';
function botonGuardar(palabra) {
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'guardar';
    boton.innerHTML = ICONO_GUARDAR;
    boton.setAttribute('aria-label', `Guardar ${palabra}`);
    boton.dataset.palabra = palabra;
    boton.setAttribute('aria-pressed', listarGuardadas(localStorage).includes(palabra));
    boton.addEventListener('click', () => {
        boton.setAttribute('aria-pressed', alternarGuardada(localStorage, palabra));
        renderizarGuardadas();
    });
    return boton;
}

// Tarjeta de la caja: la palabra (con la rima pintada) y, abajo, cuántas sílabas tiene,
// centradas en el alto; a la derecha, el botón para guardarla.
function cajaPalabra(palabra, i, animar) {
    const caja = document.createElement('div');
    caja.className = `palabra-caja${animar ? ' entra' : ''}`;
    caja.style.setProperty('--i', i);
    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'palabra';
    const texto = document.createElement('span');
    texto.className = 'texto-palabra';
    texto.append(fragmentoRima(palabra, CLASE_BUSCADA));
    const silabas = document.createElement('span');
    silabas.className = 'silabas-tarjeta';
    const n = separarSilabas(palabra).length;
    silabas.textContent = n ? `${n} ${n === 1 ? 'sílaba' : 'sílabas'}` : '';
    boton.append(texto, silabas);
    boton.addEventListener('click', () => buscarPalabra(palabra));
    caja.append(boton, botonGuardar(palabra));
    return caja;
}

// El cajón de las guardadas: como el de todas, con una X para sacar cada una.
function renderizarGuardadas() {
    const guardadas = listarGuardadas(localStorage);
    $('lista-guardadas').replaceChildren(...guardadas.map(p => {
        const item = document.createElement('li');
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.append(fragmentoRima(p, CLASE_BUSCADA));
        boton.addEventListener('click', () => buscarPalabra(p));
        const borrar = document.createElement('button');
        borrar.type = 'button';
        borrar.className = 'borrar-guardada';
        borrar.setAttribute('aria-label', `Borrar ${p}`);
        borrar.innerHTML = '<svg viewBox="0 0 24 24" class="icono"><path d="M6 6l12 12M18 6L6 18"/></svg>';
        borrar.addEventListener('click', () => {
            alternarGuardada(localStorage, p);
            renderizarGuardadas();
        });
        item.append(boton, borrar);
        return item;
    }));
    $('cajon-guardadas').hidden = !guardadas.length;
    // Los botones de las cajitas y de «Todas» muestran si su palabra sigue guardada.
    document.querySelectorAll('#pantalla-rimas .guardar').forEach(b => b.setAttribute('aria-pressed', guardadas.includes(b.dataset.palabra)));
}

// Cada palabra en un renglón: si no entra, se le achica la letra. Con la pestaña escondida
// no se puede medir: se vuelve a ajustar al abrirla.
function ajustarPalabras() {
    $('grilla-palabras').querySelectorAll('.texto-palabra').forEach(texto => {
        texto.style.fontSize = '';
        for (let tam = 22; texto.scrollWidth > texto.clientWidth && tam > 12; tam--) texto.style.fontSize = `${tam - 1}px`;
    });
}

// Cambia las 4 palabras. Con `animar`, las viejas se van borroneadas y las nuevas entran
// una tras otra; sin animar (al escribir), cambian de una.
function refrescarPalabras(animar = true) {
    restante = SEGUNDOS * 1000;
    const buscando = Boolean(palabraBuscada());
    const pool = poolActual();
    if (desde >= pool.length) desde = 0;
    const elegidas = buscando ? pool.slice(desde, desde + CANTIDAD) : palabrasAlAzar(pool, CANTIDAD);
    const grilla = $('grilla-palabras');
    const esta = ++cambio;
    const poner = () => {
        if (esta !== cambio) return;
        grilla.classList.remove('sale');
        grilla.replaceChildren(...elegidas.map((palabra, i) =>
            cajaPalabra(palabra, i, animar)));
        ajustarPalabras();
        if (animar) {
            $('caja-azar').classList.remove('cambio');
            void $('caja-azar').offsetWidth;
            $('caja-azar').classList.add('cambio');
        }
    };
    if (animar && grilla.children.length && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        grilla.classList.add('sale');
        setTimeout(poner, 220);
    } else poner();
    $('caja-azar').classList.toggle('buscando', buscando);
    const total = pool.length.toLocaleString('es-AR');
    const que = conSinonimos() ? (pool.length === 1 ? 'sinónimo de' : 'sinónimos de') : (pool.length === 1 ? 'rima con' : 'rimas con');
    $('encabezado-usadas').textContent = buscando ? `${total} ${que} «${palabraBuscada()}»` : 'Terminaciones al azar';
    mostrarTiempo();
}

function mostrarTiempo() {
    $('tiempo-azar').style.setProperty('--queda', Math.max(0, restante) / (SEGUNDOS * 1000));
    $('caja-azar').classList.toggle('en-pausa', pausadoPorUsuario);
    $('pausar-palabras').innerHTML = pausadoPorUsuario ? ICONO_PLAY_AZAR : ICONO_PAUSA_AZAR;
    $('pausar-palabras').setAttribute('aria-label', pausadoPorUsuario ? 'Seguir' : 'Pausar');
    $('pausar-palabras').setAttribute('aria-pressed', pausadoPorUsuario);
}

// El reloj corre solo con la pestaña a la vista, sin pausa y sin búsqueda.
function tic(ahora) {
    restante -= ahora - antes;
    antes = ahora;
    if (restante <= 0) refrescarPalabras();
    else mostrarTiempo();
    cuadro = requestAnimationFrame(tic);
}
function arrancarReloj() {
    if (cuadro !== null || !rimasALaVista || pausadoPorUsuario || palabraBuscada()) return;
    antes = performance.now();
    cuadro = requestAnimationFrame(tic);
}
function frenarReloj() {
    cancelAnimationFrame(cuadro);
    cuadro = null;
}

function reanudarPalabras() {
    rimasALaVista = true;
    ajustarPalabras();
    vigilarMusica();
    if (!palabraBuscada() && !pausadoPorUsuario) refrescarPalabras();
    arrancarReloj();
}

function pausarPalabras() {
    rimasALaVista = false;
    vigilarMusica();
    frenarReloj();
    cerrarAyudaTipo();
}

$('pausar-palabras').addEventListener('click', () => {
    pausadoPorUsuario = !pausadoPorUsuario;
    pausadoPorUsuario ? frenarReloj() : arrancarReloj();
    mostrarTiempo();
});
// Refrescar: al buscar, pasa a las 4 rimas siguientes, sin repetir hasta mostrarlas todas.
function refrescarALaFuerza() {
    const boton = $('refrescar-palabras');
    boton.classList.remove('gira');
    void boton.offsetWidth;
    boton.classList.add('gira');
    // Al buscar, pasa a las 4 rimas siguientes.
    if (palabraBuscada()) desde += CANTIDAD;
    refrescarPalabras();
}
$('refrescar-palabras').addEventListener('click', refrescarALaFuerza);

// Deslizar la caja a la izquierda o a la derecha también refresca. Después de deslizar,
// el toque no cuenta como tocar una palabra.
let inicioSwipe = null, deslizo = false;
$('caja-azar').addEventListener('pointerdown', e => { inicioSwipe = { x: e.clientX, y: e.clientY }; deslizo = false; });
$('caja-azar').addEventListener('pointerup', e => {
    if (!inicioSwipe) return;
    const dx = e.clientX - inicioSwipe.x, dy = e.clientY - inicioSwipe.y;
    inicioSwipe = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    deslizo = true;
    refrescarALaFuerza();
});
$('caja-azar').addEventListener('pointercancel', () => { inicioSwipe = null; });
$('caja-azar').addEventListener('click', e => {
    if (!deslizo) return;
    deslizo = false;
    e.stopPropagation();
    e.preventDefault();
}, true);

// Con música sonando (un link, un archivo o un beat de la app), detrás de Rimas y de las
// tarjetas de Letras sube el polvo del Boombap 1, sin resplandor (pedidos de Swa).
const efectoRimas = crearEfecto($('rimas-efecto'));
efectoRimas.configurar({ mood: 'boombap' });
const efectoLetras = crearEfecto($('letras-efecto'));
efectoLetras.configurar({ mood: 'boombap' });
const hayMusica = () => sonando || Boolean(ronda && !linkFreestyle && !esAcapella() && (!ronda.pausa || ronda.sigueSonando));
const letrasALaVista = () => $('pantalla-letras').classList.contains('activa') && $('vista-lista-letras').classList.contains('activa');
let vigiaMusica = null;
function vigilarMusica() {
    clearInterval(vigiaMusica);
    vigiaMusica = null;
    const mirar = () => {
        const hay = hayMusica();
        if (hay && rimasALaVista) efectoRimas.prender(); else efectoRimas.apagar();
        if (hay && letrasALaVista()) efectoLetras.prender(); else efectoLetras.apagar();
    };
    mirar();
    if (rimasALaVista || letrasALaVista()) vigiaMusica = setInterval(mirar, 500);
}
$('palabras-simples').addEventListener('click', () => {
    const boton = $('palabras-simples');
    boton.setAttribute('aria-pressed', boton.getAttribute('aria-pressed') !== 'true');
    desde = 0;
    refrescarPalabras();
});

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
    efectoRimas.cantidad(cantidad / EFECTOS_MAXIMO);
    efectoLetras.cantidad(cantidad / EFECTOS_MAXIMO);
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
    // Sin beat, la palabra cambia por reloj: se recuenta con la velocidad nueva, para que
    // al bajarla no quede trabada hasta alcanzar la cuenta de antes (ni salte varias al subirla).
    if (ronda?.modo === 'reloj') indicePalabra = Math.floor(((ronda.pausa ?? performance.now()) - ronda.inicio) / msPorPalabra(BPM_FS, compasesPorPalabra));
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
    // Acapella no tiene reproductor: jugando queda solo la bandeja, y abajo nada. En pausa
    // vuelven los beats y el cajón, con Acapella elegido (pedidos de Swa).
    const acapella = Boolean(ronda && esAcapella());
    document.body.classList.toggle('acapella-sonando', acapella && !ronda.pausa);
    const hay = Boolean(ronda && !linkFreestyle && !acapella);
    if (document.body.classList.contains('beat-sonando') !== hay) {
        document.body.classList.toggle('beat-sonando', hay);
        ubicarReproductor();
    }
    if (!hay) return;
    const suena = !ronda.pausa || ronda.sigueSonando;
    $('fs-sonando').classList.toggle('sonando', suena);
    $('fs-beat-pausar').setAttribute('aria-label', suena ? 'Pausar' : 'Reproducir');
    $('fs-beat-pausar').innerHTML = suena ? ICONO_PAUSA_FS : ICONO_PLAY_FS;
    const beat = CATALOGO_BEATS.find(b => b.id === beatId);
    const i = BEATS_CON_SONIDO.indexOf(beat);
    $('fs-sonando-titulo').textContent = etiquetaBeat(beat);
    $('fs-sonando-fuente').textContent = `Métrica · ${beat.bpm ?? BPM_FS} BPM`;
    $('fs-beat-anterior').setAttribute('aria-disabled', String(i === 0));
    $('fs-beat-siguiente').setAttribute('aria-disabled', String(i === BEATS_CON_SONIDO.length - 1));
    const segundos = ((ronda.pausa ?? performance.now()) - ronda.inicio) / 1000;
    $('fs-sonando-tiempo').textContent = formatoTiempo(segundos);
    $('fs-sonando-total').textContent = ronda.duracion == null ? '' : formatoTiempo(ronda.duracion);
    $('fs-sonando-llenado').style.width = ronda.duracion ? `${Math.min(1, segundos / ronda.duracion) * 100}%` : '0%';
}

function esAcapella() {
    return !linkFreestyle && Boolean(CATALOGO_BEATS.find(b => b.id === beatId)?.silencio);
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
    empezarGrabacion();
}

// Con pararSonido en false se frenan el tiempo y las palabras, pero el beat sigue.
function pausarRonda(pararSonido = true) {
    if (!ronda || ronda.pausa) return;
    // Pausar el beat deja de grabar; pausar tocando el círculo (el beat sigue), no. Un tema
    // del reproductor para la grabación con su propia pausa (pedidos de Swa).
    if (pararSonido && grabacion && !grabacion.fuente) pararGrabacion();
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
    empezarGrabacion();
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
    // Se termina el beat de la app: su grabación también. La de un tema sigue hasta su REC.
    if (grabacion && !grabacion.fuente) pararGrabacion();
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
        boton.setAttribute('aria-label', lista.length > 1 ? `${etiquetaBeat(elegido)}. Deslizá para cambiar.` : etiquetaBeat(elegido));
        const nombre = document.createElement('span');
        nombre.className = 'nombre-beat';
        nombre.textContent = etiquetaBeat(elegido);
        const puntos = document.createElement('span');
        puntos.className = 'puntos-beat';
        puntos.setAttribute('aria-hidden', 'true');
        puntos.hidden = lista.length < 2;
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
    $('fs-link').blur();
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
        const beat = BEATS_CON_SONIDO[BEATS_CON_SONIDO.findIndex(b => b.id === beatId) + paso];
        if (beat) elegirBeat(beat.id);
    });
}
$('fs-beat-cerrar').addEventListener('click', () => terminarRonda());
$('fs-reloj').addEventListener('click', () => {
    if (ronda?.pausa) reanudarRonda();
    else pausarJugando();
});
// En Acapella, tocar cualquier lugar de Freestyle (menos la barra de pestañas) pausa y
// vuelve la bandeja (pedido de Swa). El círculo ya tiene lo suyo.
$('pantalla-freestyle').addEventListener('click', e => {
    // composedPath: el ícono tocado puede haberse cambiado ya (el play de la bandeja).
    if (!esAcapella() || e.composedPath().some(el => el.matches?.('#fs-reloj, .bandeja-fs'))) return;
    pausarJugando();
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

// ---------- Grabar ----------
// REC de la bandeja de Freestyle: se prende y se apaga, y prendido graba al dar play. REC del
// reproductor (en todas las secciones): graba desde donde va lo que suena y, grabando, muestra
// los segundos; tocarlo para y vuelve a ser REC, y lo que suena sigue. Cualquier pausa también
// para (pedidos de Swa). Graba la voz con el micrófono, con cancelación de eco para que no se
// cuele lo que sale por el parlante, y aparte lo que suena, así los volúmenes se eligen después
// en Grabaciones. El permiso se pide al tocar REC (el micrófono para las luces le pareció muy
// invasivo a Swa). Con YouTube o SoundCloud se guarda solo la voz, con el link y el segundo.
// En SwiftUI: AVAudioSession .playAndRecord, el micrófono de abajo y voiceProcessing.
// El micrófono de Ajustes. El iPhone cambia los ids de un día para otro: se lo busca por el nombre.
async function pedirMicrofono() {
    const nombre = localStorage.getItem(CLAVE_MICROFONO + '-nombre');
    const lista = nombre ? await navigator.mediaDevices.enumerateDevices().catch(() => []) : [];
    const id = lista.find(d => d.kind === 'audioinput' && d.label === nombre)?.deviceId ?? localStorage.getItem(CLAVE_MICROFONO);
    return navigator.mediaDevices.getUserMedia(pedidoMicrofono(id));
}
let recPrendido = false;
let grabacion = null; // lo que se está grabando
let archivoSonando = null; // el archivo del teléfono que suena, para guardarlo con la grabación
let relojGrabacion = null;

function baseGrabaciones() {
    return new Promise((listo, error) => {
        const pedido = indexedDB.open('metrica-grabaciones', 1);
        pedido.onupgradeneeded = () => pedido.result.createObjectStore('grabaciones', { keyPath: 'id' });
        pedido.onsuccess = () => listo(pedido.result);
        pedido.onerror = () => error(pedido.error);
    });
}
async function usarGrabaciones(modo, hacer) {
    const base = await baseGrabaciones();
    return new Promise((listo, error) => {
        const pedido = hacer(base.transaction('grabaciones', modo).objectStore('grabaciones'));
        pedido.onsuccess = () => listo(pedido.result);
        pedido.onerror = () => error(pedido.error);
    });
}
const guardarGrabacion = g => usarGrabaciones('readwrite', t => t.put(g));
const borrarGrabacion = id => usarGrabaciones('readwrite', t => t.delete(id)).catch(() => {});
const leerGrabaciones = () => usarGrabaciones('readonly', t => t.getAll()).then(lista => lista.sort((a, b) => b.fecha - a.fecha)).catch(() => []);

function grabadora(flujo) {
    const partes = [];
    const grabador = new MediaRecorder(flujo);
    grabador.ondataavailable = e => { if (e.data.size) partes.push(e.data); };
    const listo = new Promise(responder => {
        grabador.onstop = () => responder(new Blob(partes, { type: grabador.mimeType || partes[0]?.type || '' }));
    });
    return { grabador, listo };
}

// Los segundos grabados, sin los ratos en pausa.
const tiempoGrabado = g => (performance.now() - g.comienzo - g.enPausa - (g.pausaDesde ? performance.now() - g.pausaDesde : 0)) / 1000;
function pausarGrabacion() {
    grabacion.pausaDesde = performance.now();
    grabacion.voz.grabador.pause();
}
function seguirGrabacion() {
    grabacion.enPausa += performance.now() - grabacion.pausaDesde;
    grabacion.pausaDesde = null;
    grabacion.voz.grabador.resume();
}

// El segundo del tema ahora mismo: entre lectura y lectura del reproductor, se suma lo que pasó.
const posicionMusica = () => musica?.posicion?.() ?? actual + (sonando ? (performance.now() - momentoActual) / 1000 : 0);
const avisoMicrofono = () => avisoFs('Para grabar, Métrica necesita el micrófono: permitilo en los ajustes del navegador.');

// Prender el REC de la bandeja pide el micrófono (dentro del toque); si no lo dan, queda apagado.
async function alternarRec() {
    if (recPrendido) {
        recPrendido = false;
        pararGrabacion();
        return pintarGrabacion();
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return avisoFs('Este navegador no deja grabar.');
    try {
        (await pedirMicrofono()).getTracks().forEach(t => t.stop());
    } catch {
        return avisoMicrofono();
    }
    avisoFs('');
    recPrendido = true;
    pintarGrabacion();
}

// Graba si REC está prendido: al dar play, o al tocar el REC del reproductor.
async function empezarGrabacion() {
    // Escuchando en Grabaciones no se graba: el play de una grabación con un tema no es REC.
    if (!recPrendido || grabacion || !$('grabaciones').hidden) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return avisoFs('Este navegador no deja grabar.');
    // Suena una cosa a la vez: el tema del reproductor, o si no, el beat de la ronda.
    const fuente = musica?.fuente;
    const tipo = tipoDeGrabacion({ fuente, beat: Boolean(ronda) && !esAcapella() });
    const titulo = fuente ? $('reproductor-titulo').textContent.trim() : etiquetaBeat(CATALOGO_BEATS.find(b => b.id === beatId));
    const origen = document.querySelector('.pantalla.activa')?.dataset.pestana ?? 'freestyle';
    // La letra abierta, para el nombre de la grabación (fuera de una letra, «Freestyle N»).
    const letra = origen === 'letras' && document.body.classList.contains('editando') ? $('editor-titulo').value : null;
    // Al abrir el micrófono, el iPhone pausa el tema que suena (SoundCloud se quedaba en pausa):
    // si eso pasa al arrancar, se lo vuelve a poner en play (ver alCambiarEstado).
    const marca = { reanudarHasta: fuente && sonando ? Infinity : 0 };
    grabacion = marca;
    pintarGrabacion();
    let microfono;
    try {
        microfono = await pedirMicrofono();
    } catch {
        if (grabacion === marca) grabacion = null;
        recPrendido = false;
        pintarGrabacion();
        return avisoMicrofono();
    }
    // Si mientras tanto se pausó o se tocó REC, no se graba.
    if (grabacion !== marca) return microfono.getTracks().forEach(t => t.stop());
    if (marca.reanudarHasta) {
        marca.reanudarHasta = performance.now() + 2500;
        if (!sonando) musica?.reproducir?.();
    }
    const voz = grabadora(microfono);
    let beat = null, latencia = {};
    if (tipo === 'beat' || tipo === 'voz') {
        const salida = grabarBeat();
        beat = { ...grabadora(salida.flujo), soltar: salida.soltar };
        latencia = salida.latencia;
    }
    Object.assign(grabacion, {
        tipo, titulo, origen, letra, fuente, voz, beat, microfono,
        fecha: Date.now(),
        comienzo: performance.now(),
        enPausa: 0,
        pausaDesde: null,
        desfase: desfaseDeVoz({ ...latencia, entrada: microfono.getAudioTracks()[0].getSettings().latency }),
        link: tipo === 'link' ? recienteActual?.link : null,
        archivo: tipo === 'archivo' ? archivoSonando : null,
        // Desde dónde iba el tema: así, al escucharla, la voz cae en su lugar (ver inicioDeMuestras).
        inicio: fuente ? posicionMusica() : 0,
        muestras: [],
        conBeat: tipo === 'beat',
    });
    voz.grabador.start();
    beat?.grabador.start();
    pintarGrabacion();
    relojGrabacion = setInterval(() => {
        if (grabacion?.fuente && sonando) grabacion.muestras.push(posicionMusica() - tiempoGrabado(grabacion));
        pintarGrabacion();
    }, 500);
}

function pintarGrabacion() {
    // Si en Acapella se pasa a un beat, la grabación lo suma.
    if (grabacion?.beat && ronda && !esAcapella()) grabacion.conBeat = true;
    $('fs-rec').setAttribute('aria-pressed', String(recPrendido));
    // Mientras se graba, el REC de la bandeja no se toca: se para con el del reproductor.
    $('fs-rec').disabled = Boolean(grabacion);
    $('fs-rec').setAttribute('aria-label', recPrendido ? 'Apagar la grabación' : 'Grabar al dar play');
    const grabando = Boolean(grabacion?.voz);
    const texto = grabando ? formatoTiempo(tiempoGrabado(grabacion)) : '';
    // Con YouTube achicado (en pausa por su política) no se puede grabar (pedido de Swa).
    const sinVideo = musica?.fuente === 'youtube' && plegado;
    document.querySelectorAll('[data-rec]').forEach(boton => {
        boton.disabled = !grabando && sinVideo;
        boton.classList.toggle('grabando', grabando);
        boton.setAttribute('aria-pressed', String(!grabando && recPrendido));
        boton.setAttribute('aria-label', grabando ? 'Dejar de grabar' : recPrendido ? 'Apagar la grabación' : 'Grabar');
        boton.querySelector('.tiempo-rec').textContent = texto;
    });
}

// Para y guarda.
async function pararGrabacion() {
    if (!grabacion) return;
    const g = grabacion;
    grabacion = null;
    clearInterval(relojGrabacion);
    pintarGrabacion();
    if (!g.voz) return;
    g.voz.grabador.stop();
    g.beat?.grabador.stop();
    g.microfono.getTracks().forEach(t => t.stop());
    g.beat?.soltar();
    const duracion = tiempoGrabado(g) - g.desfase;
    const [voz, beat] = await Promise.all([g.voz.listo, g.beat?.listo]);
    // Muy corta (un toque sin querer): no se guarda (pedido de Swa).
    if (duracion < 2 || !voz.size) return;
    let tipo = g.tipo;
    if (tipo === 'beat' || tipo === 'voz') tipo = g.conBeat ? 'beat' : 'voz';
    if (tipo === 'link' && !g.link) tipo = 'voz';
    const conTema = tipo === 'link' || tipo === 'archivo';
    const nombres = (await leerGrabaciones()).map(otra => otra.nombre ?? '');
    const nombre = nombreDeGrabacion({ letra: g.letra, beat: tipo === 'voz' ? null : g.titulo, nombres });
    try {
        await guardarGrabacion({
            id: g.fecha, fecha: g.fecha, tipo, nombre, titulo: g.titulo, origen: g.origen, duracion, voz,
            pista: tipo === 'beat' ? beat : tipo === 'archivo' ? g.archivo : null,
            fuente: conTema ? g.fuente : null,
            link: tipo === 'link' ? g.link : null,
            inicio: conTema ? inicioDeMuestras(g.muestras) ?? g.inicio : 0,
            desfase: g.desfase,
        });
        navigator.storage?.persist?.().catch(() => {});
    } catch {
        return avisoFs('No se pudo guardar la grabación: no queda lugar en el teléfono.');
    }
    if (!$('grabaciones').hidden) renderizarGrabaciones();
}

$('fs-rec').addEventListener('click', alternarRec);
// El REC del reproductor: graba desde acá, o deja de grabar; lo que suena sigue.
document.querySelectorAll('[data-rec]').forEach(boton => boton.addEventListener('click', e => {
    e.stopPropagation();
    if (grabacion) {
        recPrendido = false;
        pararGrabacion();
        return;
    }
    // Si no suena nada, se prende y se apaga como el de la bandeja: graba al dar play
    // (pedido de Swa). Si algo suena, graba desde acá.
    recPrendido = suenaAlgo() || !recPrendido;
    pintarGrabacion();
    if (suenaAlgo()) empezarGrabacion();
}));
// Lo que suena ahora: el tema del reproductor, o el beat de la ronda (Acapella cuenta si corre).
function suenaAlgo() {
    if (musica) return sonando;
    return Boolean(ronda && (!ronda.pausa || ronda.sigueSonando));
}

// ---------- Grabaciones (hoja) ----------
// Arriba, el volumen de la voz y del beat (para todas). Cada grabación, compacta: play,
// descargar, borrar y la barra del tiempo. La voz y el beat se mezclan acá con Web Audio, así
// los volúmenes se cambian siempre. Se abre desde Freestyle y desde Letras.
let audioGrabaciones = null;
let escuchando = null; // { id, parar(), volumenes(), segundos() }
let generacionEscucha = 0; // si se cerró la hoja mientras se preparaba, no suena
let linkCargado = null; // el link que tiene el reproductor, para no volver a cargarlo
let vozConLink = null; // la voz que sigue a un tema de YouTube o SoundCloud
const decodificadas = new Map(); // id -> { voz, pista } ya decodificadas
const contextoGrabaciones = () => {
    if (!audioGrabaciones) {
        audioGrabaciones = new AudioContext();
        aplicarSalida(audioGrabaciones);
    }
    return audioGrabaciones;
};
const ICONO_DESCARGAR = '<svg viewBox="0 0 24 24" class="icono"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>';
const ICONO_TACHO = '<svg viewBox="0 0 24 24" class="icono"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/></svg>';
const NOMBRE_FUENTE = { youtube: 'YouTube', soundcloud: 'SoundCloud' };

async function decodificar(g) {
    if (!decodificadas.has(g.id)) {
        const ctx = contextoGrabaciones();
        const leer = async blob => (blob ? ctx.decodeAudioData(await blob.arrayBuffer()) : null);
        decodificadas.set(g.id, Promise.all([leer(g.voz), leer(g.pista)]).then(([voz, pista]) => ({ voz, pista })));
    }
    return decodificadas.get(g.id).catch(error => { decodificadas.delete(g.id); throw error; });
}

// Arma la mezcla en un contexto (el de escuchar o el de descargar), desde el segundo pedido.
function conectarMezcla(ctx, g, { voz, pista }, cuando, desde) {
    const volumenes = leerVolumenes(localStorage);
    const fuentes = [];
    const fuenteVoz = ctx.createBufferSource();
    fuenteVoz.buffer = voz;
    const gananciaVoz = ctx.createGain();
    gananciaVoz.gain.value = volumenes.voz / 10;
    fuenteVoz.connect(gananciaVoz).connect(ctx.destination);
    const inicio = inicioDeVoz(g.desfase, desde);
    fuenteVoz.start(cuando + inicio.espera, Math.min(voz.duration, inicio.desde));
    fuentes.push(fuenteVoz);
    let gananciaBeat = null;
    if (pista) {
        const fuente = ctx.createBufferSource();
        fuente.buffer = pista;
        gananciaBeat = ctx.createGain();
        gananciaBeat.gain.value = volumenes.beat / 10;
        fuente.connect(gananciaBeat).connect(ctx.destination);
        // El archivo del teléfono da vueltas, como cuando sonaba.
        fuente.loop = g.tipo === 'archivo';
        const en = g.inicio + desde;
        fuente.start(cuando, fuente.loop ? ((en % pista.duration) + pista.duration) % pista.duration : Math.max(0, Math.min(pista.duration, en)));
        fuentes.push(fuente);
    }
    return { fuentes, gananciaVoz, gananciaBeat };
}

function pararEscucha() {
    generacionEscucha++;
    const antes = escuchando;
    escuchando = null;
    antes?.parar();
}

function marcarBotonPlay(fila, suena) {
    const boton = fila.querySelector('.boton-play');
    boton.innerHTML = suena ? ICONO_PAUSA : ICONO_PLAY;
    boton.setAttribute('aria-label', suena ? 'Pausar' : 'Reproducir');
}

async function escucharGrabacion(g, fila, desde = 0) {
    pararEscucha();
    const generacion = generacionEscucha;
    // Suena una cosa a la vez.
    if (ronda && !ronda.pausa) pausarRonda();
    if (musica && sonando) musica.pausar?.();
    if (g.tipo === 'link') return escucharConTema(g, fila, desde);
    const ctx = contextoGrabaciones();
    ctx.resume();
    let buffers;
    try {
        buffers = await decodificar(g);
    } catch {
        fila.querySelector('.detalle-grabacion').textContent = 'No se pudo abrir esta grabación';
        return;
    }
    if (generacion !== generacionEscucha) return;
    const cuando = ctx.currentTime + 0.05;
    const { fuentes, gananciaVoz, gananciaBeat } = conectarMezcla(ctx, g, buffers, cuando, desde);
    const segundos = () => Math.min(g.duracion, desde + Math.max(0, ctx.currentTime - cuando));
    const reloj = setInterval(() => {
        pintarTiempoGrabacion(fila, g, segundos());
        if (segundos() >= g.duracion) pararEscucha();
    }, 200);
    marcarBotonPlay(fila, true);
    escuchando = {
        id: g.id,
        segundos,
        volumenes: ({ voz, beat }) => {
            gananciaVoz.gain.value = voz / 10;
            if (gananciaBeat) gananciaBeat.gain.value = beat / 10;
        },
        parar: () => {
            clearInterval(reloj);
            fuentes.forEach(f => { try { f.stop(); } catch { /* ya paró */ } });
            marcarBotonPlay(fila, false);
        },
    };
}

function pintarTiempoGrabacion(fila, g, segundos, arrastre = false) {
    // Mientras se desliza la barra, manda el dedo.
    if (fila.classList.contains('arrastrando') && !arrastre) return;
    fila.querySelector('.tiempo-grabacion').textContent = formatoTiempo(segundos);
    fila.querySelector('.reproductor-llenado').style.width = `${Math.min(1, segundos / g.duracion) * 100}%`;
}

// Con YouTube o SoundCloud: el tema suena en el reproductor desde el segundo en que se grabó,
// y la voz lo sigue (pedido de Swa: desde la misma ventana). Con YouTube el reproductor sube
// arriba de la hoja, porque el video tiene que verse; SoundCloud suena sin mostrarlo.
async function escucharConTema(g, fila, desde) {
    if (ronda) terminarRonda();
    soltarLoQueSuena(true);
    const generacion = generacionEscucha;
    const ctx = contextoGrabaciones();
    ctx.resume();
    document.body.classList.toggle('tema-de-grabacion', g.fuente === 'youtube');
    // Si el tema ya está en el reproductor, salta y le da play acá mismo, adentro del toque
    // (así el iPhone lo deja sonar); si no, se carga y arranca solo cuando puede.
    let cargando;
    if (musica?.reproducir && linkCargado === g.link) {
        musica.ir?.(Math.max(0, g.inicio + desde));
        musica.reproducir();
    } else cargando = escucharMusica(g.link);
    const segundos = () => Math.min(g.duracion, Math.max(0, actual - g.inicio));
    // El botón de la caja sigue al reproductor: si el tema queda en pausa, muestra play.
    const reloj = setInterval(() => {
        pintarTiempoGrabacion(fila, g, segundos());
        marcarBotonPlay(fila, sonando);
    }, 250);
    const limpiar = () => {
        clearInterval(reloj);
        marcarBotonPlay(fila, false);
        document.body.classList.remove('tema-de-grabacion');
    };
    marcarBotonPlay(fila, true);
    escuchando = {
        id: g.id,
        link: true,
        limpiar,
        segundos,
        ir: s => musica?.ir?.(g.inicio + s),
        // La voz con Web Audio; el tema, con el volumen de su reproductor (el iPhone puede no dejar).
        volumenes: ({ voz, beat }) => {
            if (vozConLink) vozConLink.ganancia.gain.value = voz / 10;
            musica?.volumen?.(beat * 10);
        },
        // Pausar la caja pausa el tema y lo deja cargado: el próximo play arranca al toque.
        parar: () => { limpiar(); pararVozConLink(); musica?.pausar?.(); },
    };
    const voz = await decodificar(g).then(b => b.voz, () => null);
    if (!voz || generacion !== generacionEscucha) return;
    const ganancia = ctx.createGain();
    ganancia.gain.value = leerVolumenes(localStorage).voz / 10;
    ganancia.connect(ctx.destination);
    vozConLink = { g, voz, ctx, ganancia, fuente: null, desde: 0, cuando: 0, salto: g.inicio + desde, reloj: setInterval(seguirTema, 250) };
    await cargando;
}

function seguirTema() {
    const v = vozConLink;
    if (!v) return;
    if (!musica) return pararVozConLink();
    const pararVoz = () => { try { v.fuente?.stop(); } catch { /* ya paró */ } v.fuente = null; };
    if (!sonando) return pararVoz();
    // La primera vez que suena, el tema salta al segundo en que se grabó.
    if (v.salto != null) {
        musica.ir?.(Math.max(0, v.salto));
        musica.volumen?.(leerVolumenes(localStorage).beat * 10);
        v.salto = null;
        return;
    }
    const { espera, desde } = inicioDeVoz(v.g.desfase, posicionMusica() - v.g.inicio);
    if (espera > 0) return pararVoz();
    if (desde >= v.voz.duration) return pararEscucha();
    const suena = v.fuente ? v.desde + v.ctx.currentTime - v.cuando : null;
    if (suena != null && Math.abs(suena - desde) < 0.3) return;
    pararVoz();
    v.fuente = v.ctx.createBufferSource();
    v.fuente.buffer = v.voz;
    v.fuente.connect(v.ganancia);
    v.cuando = v.ctx.currentTime;
    v.desde = desde;
    v.fuente.start(v.cuando, desde);
}

// Se cerró el tema (la cruz del reproductor u otro tema): la voz para y la caja vuelve a play.
function pararVozConLink() {
    if (escuchando?.link) {
        const antes = escuchando;
        escuchando = null;
        antes.limpiar();
    }
    if (!vozConLink) return;
    clearInterval(vozConLink.reloj);
    try { vozConLink.fuente?.stop(); } catch { /* ya paró */ }
    vozConLink = null;
}

// Descargar: la mezcla en WAV con los volúmenes elegidos, procesada acá mientras un círculo
// se llena en el botón (pedido de Swa); con YouTube o SoundCloud, avisa y baja solo la voz.
// En el iPhone abre el menú de compartir (Guardar en Archivos, WhatsApp...). Si al terminar
// de preparar ya pasó el toque, queda listo para otro toque.
function descargarGrabacion(g, fila) {
    const boton = fila.querySelector('.descargar-grabacion');
    if (boton.archivo) return compartirArchivo(boton.archivo, fila, g);
    if (g.tipo !== 'link') return prepararDescarga(g, fila);
    const nombre = NOMBRE_FUENTE[g.fuente] ?? 'YouTube y SoundCloud';
    preguntar({
        titulo: 'Se descarga solo la voz',
        texto: `Por la política de ${nombre}, el tema no se puede bajar.`,
        boton: 'Descargar',
    }, ok => { if (ok) prepararDescarga(g, fila); });
}

// El codificador MP3 (lamejs, js/vendor) se carga recién la primera vez que se descarga.
let lame = null;
function cargarLame() {
    lame ??= new Promise((listo, fallo) => {
        const script = document.createElement('script');
        script.src = 'js/vendor/lame.min.js';
        script.onload = () => listo(window.lamejs.Mp3Encoder);
        script.onerror = () => { lame = null; fallo(new Error('sin lamejs')); };
        document.head.append(script);
    });
    return lame;
}

async function prepararDescarga(g, fila) {
    const boton = fila.querySelector('.descargar-grabacion');
    const avance = valor => boton.style.setProperty('--avance', String(valor));
    boton.disabled = true;
    boton.classList.add('procesando');
    avance(0);
    try {
        // Siempre en MP3 (pedido de Swa), también la voz sola: se mezcla con los volúmenes
        // elegidos y se codifica. El círculo llega a 0,4 mezclando y a 1 codificando.
        const [buffers, Mp3Encoder] = await Promise.all([decodificar(g), cargarLame()]);
        avance(0.1);
        const frecuencia = buffers.voz.sampleRate;
        const ctx = new OfflineAudioContext(2, Math.ceil(g.duracion * frecuencia), frecuencia);
        conectarMezcla(ctx, g, buffers, 0, 0);
        for (let i = 1; i < 10; i++) {
            try { ctx.suspend(g.duracion * i / 10).then(() => { avance(0.1 + i * 0.03); ctx.resume(); }).catch(() => {}); } catch { /* sin suspend: el círculo salta */ }
        }
        const mezcla = await ctx.startRendering();
        const pedazos = await codificarMp3([mezcla.getChannelData(0), mezcla.getChannelData(1)], frecuencia, Mp3Encoder, a => avance(0.4 + a * 0.6));
        const blob = new Blob(pedazos, { type: 'audio/mpeg' });
        avance(1);
        boton.archivo = new File([blob], nombreDeArchivo(g, extensionDeAudio(blob.type)), { type: blob.type });
        await compartirArchivo(boton.archivo, fila, g);
    } catch {
        fila.querySelector('.detalle-grabacion').textContent = 'No se pudo preparar el archivo';
    } finally {
        boton.disabled = false;
        boton.classList.remove('procesando');
    }
}

async function compartirArchivo(archivo, fila, g) {
    const boton = fila.querySelector('.descargar-grabacion');
    if (navigator.canShare?.({ files: [archivo] })) {
        try {
            await navigator.share({ files: [archivo] });
        } catch (error) {
            // Sin el toque (tardó en preparar): queda listo, en violeta, para tocar de nuevo.
            if (error.name === 'NotAllowedError') {
                boton.classList.add('listo');
                fila.querySelector('.detalle-grabacion').textContent = 'Listo: tocá de nuevo para guardarla';
                return;
            }
        }
    } else {
        const enlace = document.createElement('a');
        enlace.href = URL.createObjectURL(archivo);
        enlace.download = archivo.name;
        document.body.append(enlace);
        enlace.click();
        enlace.remove();
        setTimeout(() => URL.revokeObjectURL(enlace.href), 10000);
    }
    boton.classList.remove('listo');
    fila.querySelector('.detalle-grabacion').textContent = '';
}

// Lo preparado para descargar ya no sirve si cambian los volúmenes.
function olvidarDescargas() {
    document.querySelectorAll('.descargar-grabacion').forEach(boton => { boton.archivo = null; boton.classList.remove('listo'); });
}

function filaGrabacion(g) {
    const fila = document.createElement('li');
    fila.className = 'grabacion';
    fila.dataset.id = g.id;
    const { titulo } = describirGrabacion(g);
    // Una fila: el play, el título con la barra abajo (comienzo y final, sin la fecha ni la
    // hora) y descargar y borrar (pedido de Swa). El detalle solo aparece con un aviso.
    fila.innerHTML = `
        <div class="cabecera-grabacion">
            <button type="button" class="boton-play" aria-label="Reproducir">${ICONO_PLAY}</button>
            <div class="datos-grabacion">
                <span class="titulo-grabacion"></span>
                <div class="reproductor-barra">
                    <span class="reproductor-tiempo tiempo-grabacion">0:00</span>
                    <div class="reproductor-pista"><div class="reproductor-riel"><div class="reproductor-llenado"></div></div></div>
                    <span class="reproductor-tiempo">${formatoTiempo(g.duracion)}</span>
                </div>
                <span class="detalle-grabacion"></span>
            </div>
            <button type="button" class="boton-musica descargar-grabacion" aria-label="${g.tipo === 'link' ? 'Descargar la voz' : 'Descargar'}">${ICONO_DESCARGAR}</button>
            <button type="button" class="boton-musica borrar-grabacion" aria-label="Borrar">${ICONO_TACHO}</button>
        </div>`;
    fila.querySelector('.titulo-grabacion').textContent = titulo;
    fila.querySelector('.boton-play').addEventListener('click', () => {
        if (escuchando?.id === g.id) {
            // Con un tema en pausa (el iPhone no deja que arranque solo), el play de la caja
            // es el del reproductor.
            if (escuchando.link && musica?.reproducir && !sonando) return musica.reproducir();
            return pararEscucha();
        }
        escucharGrabacion(g, fila);
    });
    fila.querySelector('.descargar-grabacion').addEventListener('click', () => descargarGrabacion(g, fila));
    fila.querySelector('.borrar-grabacion').addEventListener('click', () => confirmarBorrado({ titulo }, async ok => {
        if (!ok) return;
        if (escuchando?.id === g.id) pararEscucha();
        decodificadas.delete(g.id);
        await borrarGrabacion(g.id);
        renderizarGrabaciones();
    }, '¿Borrar la grabación?'));
    // Tocar o deslizar la barra va a ese momento al soltarla (con un tema, el tema salta y
    // la voz lo sigue). En SwiftUI: Slider con onEditingChanged.
    const pista = fila.querySelector('.reproductor-pista');
    const segundoEn = e => {
        const caja = pista.getBoundingClientRect();
        return Math.max(0, Math.min(1, (e.clientX - caja.left) / caja.width)) * g.duracion;
    };
    pista.addEventListener('pointerdown', e => {
        pista.setPointerCapture(e.pointerId);
        fila.classList.add('arrastrando');
        pintarTiempoGrabacion(fila, g, segundoEn(e), true);
    });
    pista.addEventListener('pointermove', e => {
        if (fila.classList.contains('arrastrando')) pintarTiempoGrabacion(fila, g, segundoEn(e), true);
    });
    const soltar = e => {
        if (!fila.classList.contains('arrastrando')) return;
        fila.classList.remove('arrastrando');
        const segundo = segundoEn(e);
        if (escuchando?.id === g.id && escuchando.ir) return escuchando.ir(segundo);
        escucharGrabacion(g, fila, segundo);
    };
    pista.addEventListener('pointerup', soltar);
    pista.addEventListener('pointercancel', () => fila.classList.remove('arrastrando'));
    return fila;
}

// Arriba de la hoja: el volumen de la voz y del beat, mitad y mitad, con el nombre adentro
// de la barra (pedido de Swa). En SwiftUI: Slider con step de 1 de 0 a 10.
function renderizarVolumenes() {
    const volumenes = leerVolumenes(localStorage);
    $('volumenes-grabaciones').replaceChildren(...[['voz', 'Vol. Voz'], ['beat', 'Vol. Beat']].map(([clave, nombre]) => {
        const ajuste = document.createElement('label');
        ajuste.className = 'volumen-grabacion';
        ajuste.innerHTML = `
            <span class="relleno-volumen"></span>
            <span class="nombre-volumen">${nombre}</span>
            <span class="valor-volumen"></span>
            <input type="range" min="0" max="10" step="1" aria-label="${nombre}" data-volumen="${clave}">`;
        const barra = ajuste.querySelector('input');
        barra.value = volumenes[clave];
        const pintar = () => {
            ajuste.style.setProperty('--progreso', `${barra.value * 10}%`);
            ajuste.querySelector('.valor-volumen').textContent = String(barra.value);
        };
        barra.addEventListener('input', () => {
            guardarVolumen(localStorage, clave, barra.value);
            pintar();
            escuchando?.volumenes(leerVolumenes(localStorage));
            olvidarDescargas();
        });
        pintar();
        return ajuste;
    }));
}

// Elegir el micrófono (por ejemplo, el del iPhone mientras se escucha con auriculares
// Bluetooth, así el beat no se cuela). Los nombres aparecen después del primer permiso.
async function renderizarMicrofonos() {
    const lista = (await navigator.mediaDevices?.enumerateDevices?.().catch(() => []) ?? []).filter(d => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default');
    const nombre = localStorage.getItem(CLAVE_MICROFONO + '-nombre');
    const elegido = lista.find(d => d.label && d.label === nombre)?.deviceId ?? localStorage.getItem(CLAVE_MICROFONO) ?? '';
    $('microfono').replaceChildren(new Option('Automático', ''), ...lista.map((d, i) => new Option(d.label || `Micrófono ${i + 1}`, d.deviceId)));
    $('microfono').value = lista.some(d => d.deviceId === elegido) ? elegido : '';
}
$('microfono').addEventListener('change', () => {
    localStorage.setItem(CLAVE_MICROFONO, $('microfono').value);
    localStorage.setItem(CLAVE_MICROFONO + '-nombre', $('microfono').value ? $('microfono').selectedOptions[0].textContent : '');
    $('microfono').blur();
});

// La salida, en Ajustes y para toda la app (pedido de Swa): donde el navegador deja elegirla
// (setSinkId), un selector; en el iPhone, el menú del sistema (el de AirPlay) para elegir
// auriculares o parlante. En SwiftUI: AVRoutePickerView.
const CLAVE_SALIDA = 'metrica.grabaciones.salida';
let elegidorSalida = null;
async function renderizarSalidas() {
    const conSelector = 'setSinkId' in AudioContext.prototype;
    const lista = conSelector ? (await navigator.mediaDevices?.enumerateDevices?.().catch(() => []) ?? []).filter(d => d.kind === 'audiooutput' && d.deviceId && d.deviceId !== 'default') : [];
    const conMenu = !lista.length && 'webkitShowPlaybackTargetPicker' in HTMLMediaElement.prototype;
    $('salida-ajustes').hidden = !lista.length && !conMenu;
    $('salida').hidden = !lista.length;
    $('elegir-salida').hidden = !conMenu;
    if (!lista.length) return;
    const elegida = localStorage.getItem(CLAVE_SALIDA) ?? '';
    $('salida').replaceChildren(new Option('Automática', ''), ...lista.map((d, i) => new Option(d.label || `Salida ${i + 1}`, d.deviceId)));
    $('salida').value = lista.some(d => d.deviceId === elegida) ? elegida : '';
}
// Los beats, las grabaciones y el archivo del teléfono suenan por la salida elegida.
function aplicarSalida(reproductor) {
    const id = localStorage.getItem(CLAVE_SALIDA);
    if (id != null && reproductor?.setSinkId) reproductor.setSinkId(id).catch(() => {});
}
function aplicarSalidaATodo() {
    const id = localStorage.getItem(CLAVE_SALIDA);
    if (id != null) usarSalida(id);
    aplicarSalida(audioGrabaciones);
    aplicarSalida($('reproductor-oculto').querySelector('audio'));
}
$('salida').addEventListener('change', () => {
    localStorage.setItem(CLAVE_SALIDA, $('salida').value);
    aplicarSalidaATodo();
    $('salida').blur();
});
aplicarSalidaATodo();
$('elegir-salida').addEventListener('click', () => {
    // El menú necesita un <audio> con algo cargado: medio segundo de silencio.
    if (!elegidorSalida) {
        elegidorSalida = document.createElement('audio');
        elegidorSalida.setAttribute('x-webkit-airplay', 'allow');
        elegidorSalida.src = URL.createObjectURL(new Blob([codificarWav([new Float32Array(4000)], 8000)], { type: 'audio/wav' }));
    }
    elegidorSalida.webkitShowPlaybackTargetPicker();
});
// Cambiar el micrófono o la salida hace que el teléfono avise que cambiaron los dispositivos
// (devicechange), a veces varias veces: si se rearmaba la lista con el selector abierto, se
// trababa. Se rearma solo con los selectores quietos.
function renderizarAudio() {
    if ([$('microfono'), $('salida')].includes(document.activeElement)) return;
    renderizarMicrofonos();
    renderizarSalidas();
}
navigator.mediaDevices?.addEventListener?.('devicechange', renderizarAudio);
renderizarAudio();

async function renderizarGrabaciones() {
    const lista = await leerGrabaciones();
    pararEscucha();
    $('grabaciones-vacio').hidden = lista.length > 0;
    $('grabaciones-aviso').hidden = !lista.length;
    $('lista-grabaciones').replaceChildren(...lista.map(filaGrabacion));
}

// Cerrar la hoja corta lo que suena (pedido de Swa).
function cerrarGrabaciones() {
    const conTema = escuchando?.link;
    pararEscucha();
    if (conTema) cerrarMusica();
    $('grabaciones').hidden = true;
}
document.querySelectorAll('[data-grabaciones]').forEach(boton => boton.addEventListener('click', () => {
    $('grabaciones').hidden = false;
    renderizarVolumenes();
    renderizarGrabaciones();
}));
$('cerrar-grabaciones').addEventListener('click', cerrarGrabaciones);
$('grabaciones').addEventListener('click', e => { if (e.target === $('grabaciones')) cerrarGrabaciones(); });

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
    renderizarTemas();
}

// Temas de la libreta: cada letra tiene el suyo (arranca en Gris liso) y se guarda con ella.
// Una grilla de muestras: la elegida con borde violeta, las bloqueadas con candado.
function renderizarTemas() {
    const actual = temaDeLetra(letraActual, localStorage);
    document.body.dataset.libreta = actual;
    $('temas-libreta').replaceChildren(...TEMAS.map(tema => {
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'tema-libreta';
        boton.dataset.tema = tema.clave;
        boton.setAttribute('aria-pressed', tema.clave === actual);
        const muestra = document.createElement('span');
        muestra.className = 'muestra-tema';
        muestra.dataset.libreta = tema.clave;
        muestra.textContent = 'Aa';
        const marca = document.createElement('span');
        marca.className = 'marca-tema';
        marca.innerHTML = temaDisponible(tema.clave, localStorage) ? '' : CANDADO;
        muestra.append(marca);
        const nombre = document.createElement('span');
        nombre.className = 'nombre-tema';
        nombre.textContent = tema.nombre;
        boton.append(muestra, nombre);
        boton.addEventListener('click', () => {
            if (!temaDisponible(tema.clave, localStorage)) return abrirPaywall();
            letraActual = { ...letraActual, tema: tema.clave };
            guardarActual();
            renderizarTemas();
        });
        return boton;
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
}

// La marca es del tema: si la playlist pasa a otro, se borra (cambiar de sección no la toca).
function anotarCancion(id) {
    if (!id || id === cancionActual) return;
    const habia = cancionActual != null;
    cancionActual = id;
    if (!habia || marca == null) return;
    marca = null;
    pintarMarca();
}


function mostrarEstadoMusica() {
    const nombre = { youtube: 'YouTube', soundcloud: 'SoundCloud', archivo: 'Del teléfono' }[musica?.fuente] ?? '';
    const enPausa = musica?.fuente === 'youtube' && plegado;
    $('reproductor-fuente').textContent = nombre ? (enPausa ? `${nombre} · en pausa` : nombre) : '';
    // Sin playlist no hay a qué canción pasar: las flechas no van (ver estilos.css).
    for (const id of ['musica-anterior', 'musica-siguiente']) $(id).setAttribute('aria-disabled', String(!musica?.lista));
    $('reproductor').classList.toggle('sonando', !falloMusica && sonando && !enPausa);
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
    pintarGrabacion();
    const esYouTube = musica?.fuente === 'youtube';
    const grande = tarjetaGrande({ fuente: musica?.fuente, plegado });
    const card = $('reproductor');
    card.classList.toggle('youtube', Boolean(esYouTube));
    card.classList.toggle('plegado', Boolean(esYouTube && plegado));
    card.classList.toggle('grande', grande);
    // Grande → chico → mini → grande (pedido de Swa). YouTube no: plegado no puede sonar.
    const conTamanos = Boolean(musica && !esYouTube && plegado);
    card.classList.toggle('mini', conTamanos && mini);
    $('musica-plegar').hidden = !(grande || (conTamanos && !mini));
    $('musica-mini').hidden = !(grande && !esYouTube);
    $('musica-mostrar').hidden = !(esYouTube && plegado);
    $('musica-nota-youtube').hidden = !(esYouTube && plegado);
    // En mini, la flechita para arriba lo agranda.
    $('musica-agrandar').hidden = !(conTamanos && mini);
    mostrarEstadoMusica();
    pintarProgreso();
    ubicarReproductor();
}

function alCambiarEstado(activo) {
    sonando = activo;
    // La grabación en pausa por el teclado sigue cuando el video vuelve a sonar.
    if (grabacion?.pausaDesde) {
        if (activo) seguirGrabacion();
        mostrarEstadoMusica();
        return;
    }
    // Lo pausó el iPhone al abrir el micrófono: sigue sonando y grabando.
    if (!activo && grabacion && performance.now() < grabacion.reanudarHasta) {
        musica?.reproducir?.();
        mostrarEstadoMusica();
        return;
    }
    // Grabando con un link o un archivo: si el tema se pausa, la grabación para.
    if (!activo && grabacion?.fuente) pararGrabacion();
    // Con el REC prendido (el de la bandeja o el del reproductor), el play del tema graba.
    if (activo && recPrendido) empezarGrabacion();
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
// casos; SoundCloud solo al salir del editor (con el teclado puede seguir). Si lo pausó
// el teclado, al cerrarlo vuelve a sonar solo (pedido de Swa).
let pausadoPorTeclado = false;
function ocultarMusicaSiHaceFalta() {
    if (!musica?.pausar) return;
    const visible = reproductorVisible();
    if (pausarAlOcultar({ fuente: musica.fuente, sonando, visible })) {
        pausadoPorTeclado = document.body.classList.contains('teclado-abierto');
        // Si se grababa, la grabación queda en pausa con el video y sigue cuando vuelve a
        // sonar (pedido de Swa): así la voz no se corre del tema.
        if (pausadoPorTeclado && grabacion?.voz && grabacion.fuente) pausarGrabacion();
        musica.pausar();
    } else if (pausadoPorTeclado && visible) {
        pausadoPorTeclado = false;
        if (!sonando) musica.reproducir();
    }
}
new MutationObserver(ocultarMusicaSiHaceFalta).observe(document.body, { attributes: true, attributeFilter: ['class'] });


function seguirProgreso(leer) {
    clearInterval(progresoTimer);
    progresoTimer = setInterval(leer, 250);
}

function anotarTiempo(segundos, total = duracion) {
    if (arrastrando) return;
    actual = Math.max(0, Number(segundos) || 0);
    momentoActual = performance.now();
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
    linkCargado = texto;
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
                        // Un link nuevo arranca solo (pedido de Swa). Si el teclado tapa la
                        // tarjeta, arranca cuando se cierra.
                        if (!plegado && reproductorVisible()) e.target.playVideo();
                        else if (!plegado && document.body.classList.contains('teclado-abierto')) pausadoPorTeclado = true;
                    },
                    onStateChange: e => {
                        if (generacion !== generacionMusica || falloMusica) return;
                        const datos = reproductor.getVideoData?.();
                        anotarCancion(datos?.video_id || datos?.title);
                        const titulo = reproductor.getVideoData?.().title;
                        if (titulo) $('reproductor-titulo').textContent = titulo;
                        leerYouTube();
                        alCambiarEstado(e.data === YT.PlayerState.PLAYING || e.data === YT.PlayerState.BUFFERING);
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
                posicion: () => { const t = Number(reproductor.getCurrentTime?.()); return Number.isFinite(t) ? t : actual; },
                volumen: v => reproductor.setVolume?.(v),
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
                // Un link nuevo arranca solo (pedido de Swa): SoundCloud puede sonar aunque
                // el teclado tape la tarjeta.
                widget.play();
                leerPosicion();
            });
            widget.bind(Events.PLAY, () => { alCambiarEstado(true); leerPosicion(); mostrarCancion(); });
            widget.bind(Events.PAUSE, () => { alCambiarEstado(false); leerPosicion(); });
            widget.bind(Events.FINISH, () => alCambiarEstado(false));
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
                volumen: v => widget.setVolume(v),
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
        $('musica-mini').hidden = true;
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
    // Arranca chico, como SoundCloud. Grande, en el cuadro va una nota musical.
    plegado = true;
    $('reproductor-marco').innerHTML = '<div class="reproductor-sin-portada"><svg viewBox="0 0 24 24" class="icono"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg></div>';
    aplicarVideo();
    archivoSonando = archivo;
    const audio = new Audio(URL.createObjectURL(archivo));
    aplicarSalida(audio);
    audio.loop = true;
    audio.volume = VOLUMEN_INICIAL / 100;
    $('reproductor-oculto').replaceChildren(audio);
    audio.addEventListener('loadedmetadata', () => anotarTiempo(audio.currentTime, audio.duration));
    audio.addEventListener('timeupdate', () => anotarTiempo(audio.currentTime, audio.duration));
    audio.addEventListener('play', () => alCambiarEstado(true));
    audio.addEventListener('pause', () => alCambiarEstado(false));
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
        posicion: () => audio.currentTime,
        volumen: v => { audio.volume = v / 100; },
        cerrar: () => { audio.pause(); URL.revokeObjectURL(audio.src); audio.remove(); },
    });
    if (reproductorVisible()) musica.reproducir();
}

// La tarjeta se ve en todas las secciones menos Ajustes, y se esconde con el teclado.
// Con el selector de música de la libreta abierto también se esconde, pero lo que suena
// sigue: cuenta como a la vista, aunque el teclado esté abierto (pedido de Swa).
function reproductorVisible() {
    const clases = document.body.classList;
    if ($('reproductor').hidden || clases.contains('en-ajustes')) return false;
    return clases.contains('eligiendo-musica') || !clases.contains('teclado-abierto');
}

function cerrarMusica() {
    generacionMusica++;
    linkCargado = null;
    if (grabacion?.fuente) pararGrabacion();
    pararVozConLink();
    pausadoPorTeclado = false;
    clearInterval(progresoTimer);
    progresoTimer = null;
    musica?.cerrar?.();
    musica = null;
    marca = null;
    cancionActual = null;
    sonando = false;
    plegado = false;
    mini = false;
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
    raiz.setProperty('--alto-tarjeta-musica', `${$('reproductor').offsetHeight}px`);
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
// También desde Letras, a la izquierda de Grabaciones (pedido de Swa).
function abrirHojaMusica() {
    avisoFs(navigator.onLine ? '' : 'Sin internet no se puede escuchar música. Lo demás de Métrica anda igual.');
    $('hoja-musica-cajon').append($('fs-cajon'));
    $('hoja-musica').hidden = false;
    document.body.classList.add('eligiendo-musica');
    $('fs-link').focus();
}
$('abrir-musica').addEventListener('click', abrirHojaMusica);
$('abrir-musica-letras').addEventListener('click', abrirHojaMusica);
function cerrarHojaMusica() {
    $('hoja-musica').hidden = true;
    document.body.classList.remove('eligiendo-musica');
    $('fs-instrumental').append($('fs-cajon'));
}
// Con el camino del toque y no con contains: la cruz de un reciente ya no está en la página
// cuando el toque llega acá (la lista se vuelve a armar) y cerraba la hoja.
$('hoja-musica').addEventListener('click', e => { if (!e.composedPath().includes($('fs-cajon'))) cerrarHojaMusica(); });
$('musica-play').addEventListener('click', () => {
    if (falloMusica || !musica?.reproducir || (musica.fuente === 'youtube' && plegado)) return;
    // Una pausa tocada a mano no se deshace (ver alCambiarEstado).
    if (grabacion) grabacion.reanudarHasta = 0;
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
    if (!musica) return;
    // SoundCloud y los archivos se achican y siguen sonando: no hay video que tenga que verse.
    // Desde chico, la flecha para abajo lo deja en mini.
    if (musica.fuente !== 'youtube') {
        mini = plegado;
        plegado = true;
        return aplicarVideo();
    }
    if (plegado) return;
    const decision = plegarVideo(sonando);
    plegado = true;
    if (decision.pausar) {
        plegarAlPausar = true;
        musica.pausar();
    } else aplicarVideo();
});
// Desde grande, la doble flecha lo deja en mini de una (YouTube no tiene mini).
$('musica-mini').addEventListener('click', () => {
    if (!musica || musica.fuente === 'youtube') return;
    plegado = true;
    mini = true;
    aplicarVideo();
});
$('musica-agrandar').addEventListener('click', () => {
    if (!musica || musica.fuente === 'youtube') return;
    plegado = false;
    mini = false;
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
// La marca: tocarla (sonando o en pausa) marca este momento; el botón de al lado vuelve ahí
// y sigue sonando desde la marca (pedido de Swa). Sin marca, no se puede tocar.
$('musica-marca').addEventListener('click', () => {
    if (!musica || !duracion) return;
    // Con la barra encima de la marca (a menos de 12 px), tocarla la borra (pedido de Swa).
    const ancho = $('musica-pista').getBoundingClientRect().width;
    const encima = marca != null && Math.abs(actual - marca) / duracion * ancho < 12;
    marca = encima ? null : actual;
    pintarMarca();
});
$('musica-bucle').addEventListener('click', () => {
    if (marca == null || !musica?.ir) return;
    musica.ir(marca);
    anotarTiempo(marca);
    if (!sonando) musica.reproducir?.();
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
    }), $('celda-efectos'));
}

// ---------- Inicio ----------
renderizarApariencia();
renderizarExtras();
renderizarLetras();
renderizarRimas();
renderizarGuardadas();
refrescarPalabras(false);
// Armamos el índice de rimas apenas la app termina de aparecer, para que esté listo al buscar.
setTimeout(() => { indiceRimas(); corregir(''); }, 300);

// La versión es el nombre de la caché del service worker ("metrica-1.0.9" -> "1.0.9").
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
