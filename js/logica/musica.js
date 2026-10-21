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
        return { fuente: 'soundcloud', url: `https://${host}${url.pathname}` };
    }
    return null;
}

// Adelantar o atrasar sin pasarse del principio ni del final (en segundos).
export function moverSegundos(actual, cambio, duracion = Infinity) {
    return Math.min(Math.max(0, actual + cambio), duracion || Infinity);
}

// Volumen de 0 a 100, de a pasos.
export function cambiarVolumen(actual, cambio) {
    return Math.min(100, Math.max(0, actual + cambio));
}
