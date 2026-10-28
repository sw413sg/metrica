import { test } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { leerZip, esNotaDelZip, notaDeKeep, notasDeArchivos, marcarRepetidas, etiquetasDe, letrasDeNotas } from '../js/logica/keep.js';
import { listarLetras, agregarLetras } from '../js/logica/sesiones.js';

// Arma un .zip como el de Takeout (deflate; con zip64 = true, como los zips grandes).
function armarZip(archivos, zip64 = false) {
    const partes = [], indice = [];
    let lugar = 0;
    const u16 = n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
    const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
    const u64 = n => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
    for (const [nombre, texto] of Object.entries(archivos)) {
        const nombreB = Buffer.from(nombre), crudo = Buffer.from(texto), datos = zlib.deflateRawSync(crudo);
        const local = Buffer.concat([u32(0x04034b50), u16(20), u16(0), u16(8), u32(0), u32(0), u32(datos.length), u32(crudo.length), u16(nombreB.length), u16(0), nombreB]);
        const extra = zip64 ? Buffer.concat([u16(1), u16(24), u64(crudo.length), u64(datos.length), u64(lugar)]) : Buffer.alloc(0);
        const grande = n => u32(zip64 ? 0xffffffff : n);
        indice.push(Buffer.concat([u32(0x02014b50), u16(45), u16(20), u16(0), u16(8), u32(0), u32(0), grande(datos.length), grande(crudo.length),
            u16(nombreB.length), u16(extra.length), u16(0), u16(0), u16(0), u32(0), grande(lugar), nombreB, extra]));
        partes.push(local, datos);
        lugar += local.length + datos.length;
    }
    const indiceB = Buffer.concat(indice), cantidad = indice.length;
    const final = [];
    if (zip64) {
        const lugarZip64 = lugar + indiceB.length;
        final.push(Buffer.concat([u32(0x06064b50), u64(44), u16(45), u16(45), u32(0), u32(0), u64(cantidad), u64(cantidad), u64(indiceB.length), u64(lugar)]));
        final.push(Buffer.concat([u32(0x07064b50), u32(0), u64(lugarZip64), u32(1)]));
    }
    final.push(Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(zip64 ? 0xffff : cantidad), u16(zip64 ? 0xffff : cantidad),
        u32(zip64 ? 0xffffffff : indiceB.length), u32(zip64 ? 0xffffffff : lugar), u16(0)]));
    return new Uint8Array(Buffer.concat([...partes, indiceB, ...final]));
}
const inflar = async bytes => new Uint8Array(zlib.inflateRawSync(bytes));
const abrir = (zip) => leerZip(zip.length, async (desde, hasta) => zip.subarray(desde, hasta), inflar);

const NOTA = { title: 'Después de ese', textContent: 'la calle me enseñó\r\na no mirar atrás\n', isTrashed: false, isArchived: false,
    userEditedTimestampUsec: 1700000000000000, createdTimestampUsec: 1690000000000000, labels: [{ name: 'Letras' }] };

for (const zip64 of [false, true]) {
    test(`leerZip abre el zip de Takeout${zip64 ? ' con zip64' : ''} y trae los .json de Keep`, async () => {
        const zip = armarZip({ 'Takeout/Keep/Después de ese.json': JSON.stringify(NOTA), 'Takeout/Keep/Después de ese.html': '<p>', 'Takeout/Drive/otra.json': '{}' }, zip64);
        const archivos = await abrir(zip);
        assert.deepEqual(archivos.map(a => a.nombre), ['Takeout/Keep/Después de ese.json', 'Takeout/Keep/Después de ese.html', 'Takeout/Drive/otra.json']);
        const notas = archivos.filter(a => esNotaDelZip(a.nombre));
        assert.equal(notas.length, 1);
        assert.deepEqual(JSON.parse(new TextDecoder().decode(await notas[0].datos())), NOTA);
    });
}

test('leerZip avisa si no es un zip', async () => {
    await assert.rejects(abrir(new Uint8Array(100)), /No es un archivo .zip/);
});

test('notaDeKeep toma título, texto, fechas y etiquetas', () => {
    assert.deepEqual(notaDeKeep(NOTA), { titulo: 'Después de ese', texto: 'la calle me enseñó\na no mirar atrás', editada: 1700000000000,
        creada: 1690000000000, archivada: false, etiquetas: ['Letras'] });
});

test('notaDeKeep pasa las listas a renglones y saltea papelera, vacías y lo que no es nota', () => {
    const lista = notaDeKeep({ title: '', textContent: '', listContent: [{ text: 'rimar con sed', isChecked: true }, { text: 'grabar el coro' }], userEditedTimestampUsec: 5000 });
    assert.equal(lista.texto, 'rimar con sed\ngrabar el coro');
    assert.equal(lista.creada, 5);
    assert.equal(notaDeKeep({ ...NOTA, isTrashed: true }), null);
    assert.equal(notaDeKeep({ title: ' ', textContent: '\n' }), null);
    assert.equal(notaDeKeep({ algo: 1 }), null);
});

test('notasDeArchivos ordena de la última editada y saltea archivos rotos', () => {
    const vieja = { ...NOTA, title: 'Vieja', userEditedTimestampUsec: 1000000 };
    const notas = notasDeArchivos([JSON.stringify(vieja), 'no es json', JSON.stringify(NOTA), '[]']);
    assert.deepEqual(notas.map(n => n.titulo), ['Después de ese', 'Vieja']);
});

test('marcarRepetidas reconoce las que ya están como letra', () => {
    const notas = notasDeArchivos([JSON.stringify(NOTA), JSON.stringify({ ...NOTA, title: 'Otra' })]);
    const marcadas = marcarRepetidas(notas, [{ titulo: 'después de ese ', texto: 'la calle me enseñó\na no mirar atrás' }]);
    assert.deepEqual(marcadas.map(n => n.repetida), [true, false]);
});

test('etiquetasDe junta las etiquetas sin repetir', () => {
    assert.deepEqual(etiquetasDe([{ etiquetas: ['Letras', 'Ideas'] }, { etiquetas: ['Letras'] }, { etiquetas: [] }]), ['Ideas', 'Letras']);
});

test('letrasDeNotas guarda con las fechas de Keep y sin chocar ids', () => {
    const almacen = (() => { const d = new Map(); return { getItem: k => d.get(k) ?? null, setItem: (k, v) => d.set(k, String(v)) }; })();
    const actuales = [{ id: '100', titulo: 'Mía', texto: 'hola', creada: 1, editada: 1800000000000 }];
    agregarLetras(almacen, actuales);
    const nuevas = letrasDeNotas(notasDeArchivos([JSON.stringify(NOTA)]), actuales, 100);
    assert.deepEqual(nuevas, [{ id: '101', titulo: 'Después de ese', texto: 'la calle me enseñó\na no mirar atrás', creada: 1690000000000, editada: 1700000000000 }]);
    agregarLetras(almacen, nuevas);
    assert.deepEqual(listarLetras(almacen).map(l => l.titulo), ['Mía', 'Después de ese']);
});
