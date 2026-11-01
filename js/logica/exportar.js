// Exportar todo: las letras (una por .txt) y el baúl de frases en un .zip, armado en el
// teléfono y sin internet. Los archivos van sin comprimir (método 0: son textos chicos) y con
// los nombres en UTF-8. En SwiftUI: un FileDocument con los .txt y .fileExporter o ShareLink.

const TABLA_CRC = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});

export function crc32(bytes) {
    let c = 0xffffffff;
    for (const b of bytes) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

// Fecha y hora en el formato de MS-DOS que usa el zip (hora local).
function fechaDos(ms) {
    const d = new Date(ms);
    const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const dia = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { hora, dia };
}

// archivos: [{ nombre, texto, fecha }] -> los bytes del .zip.
export function crearZip(archivos, ahora = Date.now()) {
    const codificar = new TextEncoder();
    const partes = [], indice = [];
    let lugar = 0;
    for (const { nombre, texto, fecha = ahora } of archivos) {
        const nombreB = codificar.encode(nombre), datos = codificar.encode(texto);
        const crc = crc32(datos), { hora, dia } = fechaDos(fecha);
        const cabecera = (firma, extra) => {
            const b = new DataView(new ArrayBuffer(extra ? 46 : 30));
            let p = 0;
            const u16 = n => { b.setUint16(p, n, true); p += 2; };
            const u32 = n => { b.setUint32(p, n, true); p += 4; };
            u32(firma);
            if (extra) u16(20);
            u16(20); u16(0x0800); u16(0); u16(hora); u16(dia);
            u32(crc); u32(datos.length); u32(datos.length); u16(nombreB.length); u16(0);
            if (extra) { u16(0); u16(0); u16(0); u32(0); u32(lugar); }
            return new Uint8Array(b.buffer);
        };
        indice.push(cabecera(0x02014b50, true), nombreB);
        partes.push(cabecera(0x04034b50, false), nombreB, datos);
        lugar += 30 + nombreB.length + datos.length;
    }
    const largoIndice = indice.reduce((s, b) => s + b.length, 0);
    const fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true);
    fin.setUint16(8, archivos.length, true);
    fin.setUint16(10, archivos.length, true);
    fin.setUint32(12, largoIndice, true);
    fin.setUint32(16, lugar, true);
    const todo = [...partes, ...indice, new Uint8Array(fin.buffer)];
    const zip = new Uint8Array(todo.reduce((s, b) => s + b.length, 0));
    let p = 0;
    for (const b of todo) { zip.set(b, p); p += b.length; }
    return zip;
}

// Un nombre de archivo que ande en el iPhone, Windows y Mac: sin / \ : * ? " < > |, sin
// espacios de más y hasta 60 letras. Si dos letras se llaman igual, la segunda lleva « (2)».
function nombreLimpio(titulo) {
    const limpio = titulo.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
    return limpio.slice(0, 60).trim() || 'Sin título';
}

// Lo que va en el zip: cada letra como «Título.txt» (el título arriba y el texto abajo) y, si
// hay frases, «Baúl de frases.txt» con una por renglón, de la última anotada a la primera.
export function archivosParaExportar(letras, frases = []) {
    const usados = new Map();
    const archivos = letras.filter(l => (l.titulo || '').trim() || (l.texto || '').trim()).map(letra => {
        const base = nombreLimpio(letra.titulo || '');
        const n = (usados.get(base.toLowerCase()) ?? 0) + 1;
        usados.set(base.toLowerCase(), n);
        const titulo = (letra.titulo || '').trim();
        return {
            nombre: `Letras/${n > 1 ? `${base} (${n})` : base}.txt`,
            texto: titulo ? `${titulo}\n\n${letra.texto || ''}` : letra.texto || '',
            fecha: letra.editada ?? letra.creada,
        };
    });
    if (frases.length) {
        archivos.push({
            nombre: 'Baúl de frases.txt',
            texto: frases.map(f => f.texto).join('\n') + '\n',
            fecha: Math.max(...frases.map(f => f.creada ?? 0)) || undefined,
        });
    }
    return archivos;
}

// «Metrica 2026-11-01.zip», con la fecha del día. Sin tilde: con tildes, Chrome lo bajaba como «download».
export function nombreDelZip(ahora = Date.now()) {
    const d = new Date(ahora), dos = n => String(n).padStart(2, '0');
    return `Metrica ${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}.zip`;
}
