import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CATEGORIAS, TEMAS } from '../temas/temas.js';
import { elegirTema, listarUsados, marcarUsado, siguienteTema, listarVistos, numeroEnCategoria } from '../js/logica/temas.js';

function almacenDePrueba() {
    const datos = new Map();
    return { getItem: clave => datos.get(clave) ?? null, setItem: (clave, valor) => datos.set(clave, String(valor)) };
}

// Minúsculas, sin tildes ni puntuación. La ñ se queda: no es una tilde.
const normalizar = texto => texto.toLowerCase()
    .normalize('NFD').replace(/(?!\u0303)[\u0300-\u036f]/g, '').normalize('NFC')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

const tokensDe = texto => new Set(normalizar(texto).split(' ').filter(Boolean));

function jaccard(a, b) {
    let inter = 0;
    for (const token of a) if (b.has(token)) inter++;
    const union = a.size + b.size - inter;
    return union ? inter / union : 0;
}

test('hay 1538 consignas, con id y texto únicos', () => {
    assert.equal(TEMAS.length, 1538);
    assert.equal(new Set(TEMAS.map(t => t.id)).size, 1538);
    const textos = TEMAS.map(t => normalizar(t.texto));
    assert.ok(textos.every(t => t.length >= 8));
    assert.equal(new Set(textos).size, 1538);
});

test('cada consigna tiene una categoría válida: 400 en amor, 300 en fiesta, 288 en superación, 150 en nostalgia y bronca, 100 en calle (con noche) y 50 en el resto', () => {
    const validas = new Set(CATEGORIAS.map(c => c.id));
    assert.ok(validas.size >= 8 && validas.size <= 12);
    const cuentas = {};
    for (const tema of TEMAS) {
        assert.ok(validas.has(tema.categoria), tema.categoria);
        assert.equal(typeof tema.texto, 'string');
        assert.ok(!tema.empujon || (typeof tema.empujon === 'string' && tema.empujon.trim() && tema.empujon !== tema.texto));
        cuentas[tema.categoria] = (cuentas[tema.categoria] ?? 0) + 1;
    }
    assert.deepEqual(Object.keys(cuentas).sort(), [...validas].sort());
    for (const [id, cuenta] of Object.entries(cuentas)) {
        assert.equal(cuenta, { amor: 400, fiesta: 300, superacion: 288, nostalgia: 150, bronca: 150, calle: 100 }[id] ?? 50, id);
    }
});

test('las categorías van en el orden de Swa: Amor, Superación, Fiesta, Nostalgia, Calle y el resto', () => {
    assert.deepEqual(CATEGORIAS.slice(0, 5).map(c => c.id), ['amor', 'superacion', 'fiesta', 'nostalgia', 'calle']);
    assert.ok(!CATEGORIAS.some(c => c.id === 'noche'));
});

test('no hay dos consignas casi iguales', () => {
    const tokens = TEMAS.map(t => tokensDe(t.texto));
    let peor = 0;
    let par = '';
    for (let i = 0; i < TEMAS.length; i++) {
        for (let j = i + 1; j < TEMAS.length; j++) {
            const valor = jaccard(tokens[i], tokens[j]);
            if (valor > peor) {
                peor = valor;
                par = `«${TEMAS[i].texto}» ~ «${TEMAS[j].texto}»`;
            }
        }
    }
    // 0,5 es parecido de más: comparten la mitad de las palabras.
    assert.ok(peor < 0.5, `${peor.toFixed(2)} ${par}`);
});

test('elige primero una sin usar, dentro de la categoría, y no repite la de ahora', () => {
    const temas = [
        { id: 'a', texto: 'uno', categoria: 'amor' },
        { id: 'b', texto: 'dos', categoria: 'amor' },
        { id: 'c', texto: 'tres', categoria: 'noche' },
    ];
    assert.equal(elegirTema(temas, { usados: ['a', 'b'], azar: () => 0 }).id, 'c');
    assert.equal(elegirTema(temas, { usados: ['a', 'b', 'c'], azar: () => 0 }).id, 'a');
    assert.equal(elegirTema(temas, { categoria: 'amor', evitar: 'a', azar: () => 0 }).id, 'b');
    assert.equal(elegirTema(temas, { categoria: 'noche', azar: () => 0.99 }).id, 'c');
});

test('marcarUsado persiste el id y no lo duplica', () => {
    const almacen = almacenDePrueba();
    assert.deepEqual(listarUsados(almacen), []);
    marcarUsado(almacen, 't001');
    marcarUsado(almacen, 't001');
    marcarUsado(almacen, 't002');
    assert.deepEqual(listarUsados(almacen), ['t001', 't002']);
    assert.equal(elegirTema(
        [{ id: 't001', texto: 'una', categoria: 'amor' }, { id: 't002', texto: 'otra', categoria: 'amor' }, { id: 't003', texto: 'tercera', categoria: 'amor' }],
        { usados: listarUsados(almacen), azar: () => 0 },
    ).id, 't003');
});

test('las consignas entran en la caché del service worker', () => {
    const sw = fs.readFileSync('sw.js', 'utf8');
    assert.match(sw, /temas\/temas\.js/);
    assert.match(sw, /js\/logica\/temas\.js/);
});

test('siguienteTema no repite hasta ver todas las del filtro, y después arranca otra vuelta', () => {
    const almacen = almacenDePrueba();
    const temas = ['a', 'b', 'c', 'd'].map(id => ({ id, texto: id, categoria: id === 'd' ? 'noche' : 'amor' }));
    let azarIndice = 0;
    const azar = () => [0.9, 0.1, 0.5, 0.3][azarIndice++ % 4];
    const vuelta = [];
    let actual = null;
    for (let i = 0; i < 3; i++) {
        actual = siguienteTema(temas, almacen, { categoria: 'amor', evitar: actual?.id, azar });
        vuelta.push(actual.id);
    }
    assert.deepEqual([...vuelta].sort(), ['a', 'b', 'c']);
    const otra = siguienteTema(temas, almacen, { categoria: 'amor', evitar: actual.id, azar });
    assert.notEqual(otra.id, actual.id);
    assert.equal(siguienteTema(temas, almacen, { categoria: 'noche', azar }).id, 'd');
    assert.ok(listarVistos(almacen).includes('d'));
});

test('numeroEnCategoria cuenta dentro de la categoría', () => {
    const amor = TEMAS.filter(t => t.categoria === 'amor' && !t.sub);
    const desamor = TEMAS.filter(t => t.sub === 'desamor');
    assert.deepEqual(numeroEnCategoria(TEMAS, amor[36]), { numero: 37, total: amor.length });
    assert.deepEqual(numeroEnCategoria(TEMAS, desamor[11]), { numero: 12, total: desamor.length });
    assert.equal(amor.length + desamor.length, 400);
});

test('Desamor es una subsección de Amor: prendida salen solo esas, apagada no sale ninguna', () => {
    assert.ok(TEMAS.every(t => !t.sub || (t.sub === 'desamor' && t.categoria === 'amor')));
    assert.ok(TEMAS.filter(t => t.sub === 'desamor').length >= 100);
    for (let i = 0; i < 30; i++) {
        assert.equal(siguienteTema(TEMAS, almacenDePrueba(), { categoria: 'amor', sub: 'desamor' }).sub, 'desamor');
        assert.equal(siguienteTema(TEMAS, almacenDePrueba(), { categoria: 'amor' }).sub, undefined);
    }
});
