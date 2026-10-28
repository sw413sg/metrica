// Importar notas de Google Keep desde el export de Google Takeout (takeout.google.com, solo
// «Keep»). Takeout baja un .zip con una carpeta Takeout/Keep/ que trae cada nota en un .json
// (y en un .html, que no se usa). Se puede elegir el .zip o los .json sueltos. Todo pasa en el
// teléfono, sin internet. Sin DOM: en SwiftUI, el zip se abre con Apple Archive o ZIPFoundation
// y el resto es igual (.fileImporter para elegir el archivo).

// --- Leer el .zip -------------------------------------------------------------------------
// Se lee a pedazos (`leer(inicio, fin)` devuelve los bytes), así un zip grande con fotos no se
// carga entero en memoria: solo el índice del final y los .json. `inflar` descomprime deflate
// (en el navegador, DecompressionStream('deflate-raw'), que Safari tiene desde iOS 16.4).

const numero16 = (b, i) => b[i] | b[i + 1] << 8;
const numero32 = (b, i) => (b[i] | b[i + 1] << 8 | b[i + 2] << 16 | b[i + 3] << 24) >>> 0;
const numero64 = (b, i) => numero32(b, i) + numero32(b, i + 4) * 2 ** 32;

export async function inflarConStream(bytes) {
    const flujo = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(flujo).arrayBuffer());
}

// Devuelve [{ nombre, datos() }]: datos() trae los bytes ya descomprimidos de ese archivo.
// Con zip64 (los zips de Takeout a veces lo usan), los tamaños y lugares vienen en un extra.
export async function leerZip(tamano, leer, inflar = inflarConStream) {
    const cola = await leer(Math.max(0, tamano - 65557), tamano);
    let fin = -1;
    for (let i = cola.length - 22; i >= 0; i--) if (numero32(cola, i) === 0x06054b50) { fin = i; break; }
    if (fin < 0) throw new Error('No es un archivo .zip');
    let cantidad = numero16(cola, fin + 10), largoIndice = numero32(cola, fin + 12), inicioIndice = numero32(cola, fin + 16);
    if (fin >= 20 && numero32(cola, fin - 20) === 0x07064b50) {
        const lugar = numero64(cola, fin - 12);
        const registro = await leer(lugar, lugar + 56);
        if (numero32(registro, 0) === 0x06064b50) {
            cantidad = numero64(registro, 32); largoIndice = numero64(registro, 40); inicioIndice = numero64(registro, 48);
        }
    }
    const indice = await leer(inicioIndice, inicioIndice + largoIndice);
    const archivos = [];
    for (let i = 0, n = 0; n < cantidad && numero32(indice, i) === 0x02014b50; n++) {
        const metodo = numero16(indice, i + 10), largoNombre = numero16(indice, i + 28);
        const largoExtra = numero16(indice, i + 30), largoComentario = numero16(indice, i + 32);
        let comprimido = numero32(indice, i + 20), lugar = numero32(indice, i + 42);
        const nombre = new TextDecoder().decode(indice.subarray(i + 46, i + 46 + largoNombre));
        // Extra zip64 (0x0001): trae, en orden, solo los valores que arriba quedaron en 0xFFFFFFFF.
        for (let e = i + 46 + largoNombre; e < i + 46 + largoNombre + largoExtra;) {
            const id = numero16(indice, e), largo = numero16(indice, e + 2);
            if (id === 1) {
                let p = e + 4;
                if (numero32(indice, i + 24) === 0xffffffff) p += 8;
                if (comprimido === 0xffffffff) { comprimido = numero64(indice, p); p += 8; }
                if (lugar === 0xffffffff) lugar = numero64(indice, p);
            }
            e += 4 + largo;
        }
        archivos.push({
            nombre,
            async datos() {
                const cabecera = await leer(lugar, lugar + 30);
                const desde = lugar + 30 + numero16(cabecera, 26) + numero16(cabecera, 28);
                const bytes = await leer(desde, desde + comprimido);
                if (metodo === 0) return bytes;
                if (metodo === 8) return inflar(bytes);
                throw new Error(`No se puede abrir ${nombre}`);
            },
        });
        i += 46 + largoNombre + largoExtra + largoComentario;
    }
    return archivos;
}

// Los .json de notas de Keep dentro del zip (Takeout/Keep/Nota.json), sin carpetas de otros servicios.
export const esNotaDelZip = nombre => /(^|\/)Keep\/[^/]+\.json$/i.test(nombre);

// --- De nota de Keep a letra ------------------------------------------------------------------

// Una nota del .json de Keep, con lo que hace falta. Las listas (con casillas) pasan a un
// renglón por ítem. Las de la papelera y las vacías no van (null).
export function notaDeKeep(datos) {
    if (!datos || typeof datos !== 'object' || datos.isTrashed) return null;
    if (!('textContent' in datos) && !('listContent' in datos) && !('title' in datos)) return null;
    const lista = Array.isArray(datos.listContent) ? datos.listContent.map(i => String(i?.text ?? '').trim()).join('\n') : '';
    const texto = String(datos.textContent ?? '').replace(/\r\n?/g, '\n').replace(/\s+$/, '');
    const nota = {
        titulo: String(datos.title ?? '').trim(),
        texto: [texto, lista].filter(Boolean).join('\n'),
        editada: Math.round(Number(datos.userEditedTimestampUsec) / 1000) || 0,
        creada: Math.round(Number(datos.createdTimestampUsec) / 1000) || 0,
        archivada: !!datos.isArchived,
        etiquetas: Array.isArray(datos.labels) ? datos.labels.map(e => String(e?.name ?? '')).filter(Boolean) : [],
    };
    if (!nota.titulo && !nota.texto.trim()) return null;
    nota.creada ||= nota.editada;
    nota.editada ||= nota.creada;
    return nota;
}

// Lee los .json (como texto) y devuelve las notas de la última editada a la primera. Un archivo
// que no es una nota (por ejemplo, Labels) se saltea sin romper el resto.
export function notasDeArchivos(textos) {
    const notas = [];
    for (const texto of textos) {
        try {
            const nota = notaDeKeep(JSON.parse(texto));
            if (nota) notas.push(nota);
        } catch { /* no era un .json de nota */ }
    }
    return notas.sort((a, b) => b.editada - a.editada);
}

const clave = (titulo, texto) => `${titulo.trim().toLowerCase()}\n${texto.trim()}`;

// Marca las notas que ya están como letra (mismo título y texto): así importar dos veces el
// mismo export no las duplica. Las repetidas arrancan sin elegir.
export function marcarRepetidas(notas, letras) {
    const hay = new Set(letras.map(l => clave(l.titulo ?? '', l.texto ?? '')));
    return notas.map(n => ({ ...n, repetida: hay.has(clave(n.titulo, n.texto)) }));
}

// Todas las etiquetas de Keep que aparecen, en orden alfabético, para filtrar.
export function etiquetasDe(notas) {
    return [...new Set(notas.flatMap(n => n.etiquetas))].sort((a, b) => a.localeCompare(b, 'es'));
}

// Las notas elegidas pasan a letras, con las fechas de Keep (así quedan en su lugar entre las
// demás, por la última edición). Los ids no chocan con los que ya hay.
export function letrasDeNotas(notas, letrasActuales, ahora = Date.now()) {
    const usados = new Set(letrasActuales.map(l => l.id));
    let siguiente = ahora;
    return notas.map(n => {
        while (usados.has(String(siguiente))) siguiente++;
        const id = String(siguiente++);
        usados.add(id);
        return { id, titulo: n.titulo, texto: n.texto, creada: n.creada || ahora, editada: n.editada || ahora };
    });
}
