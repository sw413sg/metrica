// Música para escribir encima: entiende links de YouTube y SoundCloud. Sin DOM.
// En la web se reproducen con los reproductores oficiales (YouTube IFrame API y SoundCloud
// Widget API), que necesitan internet. En SwiftUI: WKWebView con los mismos reproductores.

const ID_YOUTUBE = /^[\w-]{11}$/;

// "90", "1m30s", "1h2m3s" -> segundos.
function segundosDe(texto) {
    if (!texto) return 0;
    if (/^\d+$/.test(texto)) return Number(texto);
    const partes = texto.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    return partes ? (Number(partes[1] ?? 0) * 3600) + (Number(partes[2] ?? 0) * 60) + Number(partes[3] ?? 0) : 0;
}

// { fuente: 'youtube', id, inicio } o { fuente: 'soundcloud', url }, o null si no es un link que sirva.
export function leerLink(texto) {
    let url;
    try { url = new URL(String(texto).trim()); } catch { return null; }
    if (!/^https?:$/.test(url.protocol)) return null;
    const host = url.hostname.replace(/^(www|m|music)\./, '');
    if (host === 'youtu.be' || host === 'youtube.com' || host === 'youtube-nocookie.com') {
        const id = host === 'youtu.be'
            ? url.pathname.split('/')[1]
            : url.searchParams.get('v') ?? url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1];
        if (!ID_YOUTUBE.test(id ?? '')) return null;
        return { fuente: 'youtube', id, inicio: segundosDe(url.searchParams.get('t') ?? url.searchParams.get('start')) };
    }
    if (host === 'soundcloud.com' || host === 'on.soundcloud.com') {
        if (url.pathname.split('/').filter(Boolean).length === 0) return null;
        // Sin ?si= ni utm: el widget abre la canción por el path. m.soundcloud.com
        // ya quedó en soundcloud.com (arriba). El link corto se resuelve aparte.
        return { fuente: 'soundcloud', url: `https://${host}${url.pathname}` };
    }
    return null;
}

function urlDeSoundCloud(texto) {
    let url;
    try { url = new URL(texto); } catch { return null; }
    if (url.protocol !== 'https:' || url.username) return null;
    const host = url.hostname.replace(/^(www|m|music)\./, '');
    if ((host !== 'api.soundcloud.com' && host !== 'soundcloud.com') || !url.pathname.split('/').filter(Boolean).length) return null;
    return url.href;
}

// El reproductor oficial no abre los links cortos de la app (on.soundcloud.com/…):
// w.soundcloud.com/player/?url=… responde 404, no carga el arranque y el widget
// dispara ERROR («No se pudo reproducir»). oEmbed los cambia por
// api.soundcloud.com/tracks/id y el navegador puede pedirlo (manda
// Access-Control-Allow-Origin). Seguir el 302 no se puede: on.soundcloud.com
// no manda CORS. Un link largo no pasa por acá.
export async function resolverLinkSoundCloud(url, pedir = globalThis.fetch) {
    let host;
    try { host = new URL(url).hostname.replace(/^(www|m|music)\./, ''); } catch { return url; }
    if (host !== 'on.soundcloud.com') return url;
    const respuesta = await pedir(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`);
    if (!respuesta.ok) throw new Error('soundcloud');
    const datos = await respuesta.json();
    const src = String(datos?.html ?? '').match(/src="([^"]+)"/i)?.[1]?.replace(/&amp;/g, '&');
    const directa = src && new URL(src, 'https://w.soundcloud.com').searchParams.get('url');
    const canonica = directa && urlDeSoundCloud(directa);
    if (!canonica) throw new Error('soundcloud');
    return canonica;
}

// Adelantar o atrasar sin pasarse del principio ni del final (en segundos).
export function moverSegundos(actual, cambio, duracion = Infinity) {
    return Math.min(Math.max(0, actual + cambio), duracion || Infinity);
}

// 72 -> "1:12". Sin horas si el tema dura menos de una.
export function formatoTiempo(segundos) {
    const total = Math.max(0, Math.floor(Number(segundos) || 0));
    const horas = Math.floor(total / 3600);
    const minutos = Math.floor(total / 60) % 60;
    const resto = String(total % 60).padStart(2, '0');
    return horas ? `${horas}:${String(minutos).padStart(2, '0')}:${resto}` : `${minutos}:${resto}`;
}

// Dónde va el punto de la barra, de 0 a 1.
export function fraccionDe(actual, duracion) {
    if (!duracion || duracion <= 0) return 0;
    return Math.min(1, Math.max(0, actual / duracion));
}

// Segundos que corresponden a un toque en la pista (puntero y ancho en px).
export function segundosEn(puntero, ancho, duracion) {
    if (!ancho || !duracion || duracion <= 0) return 0;
    return Math.min(1, Math.max(0, puntero / ancho)) * duracion;
}

// Volumen de 0 a 100, de a pasos.
export function cambiarVolumen(actual, cambio) {
    return Math.min(100, Math.max(0, actual + cambio));
}

// Lado mínimo del reproductor de YouTube, en px. La política pide un viewport
// de al menos 200×200 y no deja ocultarlo ni taparlo.
export const LADO_YOUTUBE = 200;

// Solo YouTube tiene que verse. SoundCloud se maneja con el iframe fuera de vista.
export function muestraVideo(fuente) {
    return fuente === 'youtube';
}

// Plegar esconde el video. Si está sonando hay que pausar antes: no puede
// seguir un reproductor que el usuario no está viendo.
export function plegarVideo(sonando) {
    return { plegado: true, pausar: Boolean(sonando) };
}

// YouTube no puede seguir si la tarjeta no está en pantalla (teclado, o fuera del editor
// y de Freestyle). SoundCloud sí puede sonar con el teclado abierto: el iframe ya vive fuera de vista.
// En Freestyle la tarjeta es la misma, arriba de la barra de pestañas.
export function pausarAlOcultar({ fuente, sonando, editor, teclado, freestyle }) {
    if (!sonando) return false;
    if (!editor && !freestyle) return true;
    return fuente === 'youtube' && Boolean(teclado);
}

// «Mostrar video para reproducir»: con YouTube plegado, primero lo muestra.
export function alternarReproduccion({ fuente, plegado, sonando }) {
    const mostrar = muestraVideo(fuente) && plegado && !sonando;
    return { plegado: mostrar ? false : Boolean(plegado), accion: sonando ? 'pausar' : 'reproducir' };
}

// Widget oficial de SoundCloud, sin la ficha visual: el iframe va fuera de vista
// y los controles de la tarjeta lo manejan. Sin autoplay: la app llama a play()
// solo cuando la tarjeta está a la vista.
export function urlWidgetSoundCloud(urlCancion) {
    const parametros = new URLSearchParams({
        url: urlCancion,
        auto_play: 'false',
        visual: 'false',
        hide_related: 'true',
        show_comments: 'false',
        show_user: 'false',
        show_reposts: 'false',
        show_teaser: 'false',
        show_artwork: 'false',
    });
    return `https://w.soundcloud.com/player/?${parametros}`;
}
