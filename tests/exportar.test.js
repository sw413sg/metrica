import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { crc32, crearZip, archivosParaExportar, nombreDelZip } from '../js/logica/exportar.js';
import { leerZip } from '../js/logica/keep.js';

const abrir = zip => leerZip(zip.length, async (desde, hasta) => zip.subarray(desde, hasta));

test('crc32 da lo mismo que zlib', () => {
    for (const texto of ['', 'hola', 'Después de ese verano ñandú 🎤']) {
        const bytes = new TextEncoder().encode(texto);
        assert.equal(crc32(bytes), zlib.crc32(bytes));
    }
});

test('crearZip arma un .zip que se vuelve a abrir, con tildes en los nombres', async () => {
    const zip = crearZip([{ nombre: 'Letras/Canción.txt', texto: 'Canción\n\nno sé' }, { nombre: 'Baúl de frases.txt', texto: 'una\n' }]);
    const archivos = await abrir(zip);
    assert.deepEqual(archivos.map(a => a.nombre), ['Letras/Canción.txt', 'Baúl de frases.txt']);
    assert.equal(new TextDecoder().decode(await archivos[0].datos()), 'Canción\n\nno sé');
});

test('archivosParaExportar: una letra por .txt, sin vacías, con nombres que no se pisan', () => {
    const archivos = archivosParaExportar([
        { titulo: 'Checkpoint', texto: 'verso', editada: 1 },
        { titulo: 'checkpoint', texto: 'otro', editada: 2 },
        { titulo: 'a/b: c?', texto: 'x', editada: 3 },
        { titulo: '', texto: 'sin título', editada: 4 },
        { titulo: '', texto: '  ', editada: 5 },
    ], [{ texto: 'frase uno', creada: 2 }, { texto: 'frase dos', creada: 1 }]);
    assert.deepEqual(archivos.map(a => a.nombre), ['Letras/Checkpoint.txt', 'Letras/checkpoint (2).txt', 'Letras/a b c.txt', 'Letras/Sin título.txt', 'Baúl de frases.txt']);
    assert.equal(archivos[0].texto, 'Checkpoint\n\nverso');
    assert.equal(archivos[3].texto, 'sin título');
    assert.equal(archivos[4].texto, 'frase uno\nfrase dos\n');
    assert.equal(archivosParaExportar([], []).length, 0);
});

test('nombreDelZip lleva la fecha del día', () => {
    assert.equal(nombreDelZip(new Date(2026, 10, 1, 12).getTime()), 'Metrica 2026-11-01.zip');
});
