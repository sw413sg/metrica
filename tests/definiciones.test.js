import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { crearIndiceDefiniciones, buscarDefinicion, corregirParaDiccionario, comoSuena, leerEntrada } from '../js/logica/definiciones.js';
import { parsearFrecuencias } from '../js/logica/diccionario.js';

const EJEMPLO = [
    '# cabecera',
    'casa\t#sustantivo\tVivienda¦Edificación destinada a vivienda.\tDomicilio.',
    'hacer\t#verbo\tOriginar, crear.',
    'ir\t#verbo\tDesplazarse de un lugar a otro.',
    'ser\t#verbo\tTener una determinada naturaleza.',
    'fuimos\t>ir\t>ser',
    'querer\t#verbo\tTener el deseo de hacer algo.',
    'guerra\t#sustantivo\tConflicto armado.',
    'jera\t#sustantivo\tYugada.',
    'así\t#adverbio\tDe esta manera.',
    'asi\t#adverbio\tGrafía obsoleta de así.',
].join('\n');
const FRECUENCIAS = new Map([['casa', 500], ['hacer', 900], ['guerra', 300], ['jera', 1], ['así', 5000], ['asi', 10]]);
const indice = crearIndiceDefiniciones(EJEMPLO, FRECUENCIAS);

test('lee las categorías, la materia y las acepciones', () => {
    assert.deepEqual(leerEntrada('casa', indice), {
        palabra: 'casa',
        categorias: [{ nombre: 'sustantivo', acepciones: [{ materia: 'Vivienda', texto: 'Edificación destinada a vivienda.' }, { materia: '', texto: 'Domicilio.' }] }],
        formaDe: [],
    });
});

test('una forma trae las definiciones de sus palabras', () => {
    const r = buscarDefinicion('fuimos', indice);
    assert.equal(r.palabra, 'fuimos');
    assert.deepEqual(r.entradas.map(e => e.palabra), ['ir', 'ser']);
});

test('encuentra lo mal escrito', () => {
    assert.equal(corregirParaDiccionario('Casa', indice), 'casa');
    assert.equal(corregirParaDiccionario('aser', indice), 'hacer');
    assert.equal(corregirParaDiccionario('kasa', indice), 'casa');
    assert.equal(corregirParaDiccionario('cassa', indice), 'casa');
    assert.equal(corregirParaDiccionario('csa', indice), 'casa');
    assert.equal(corregirParaDiccionario('gerra', indice), 'guerra');
    assert.equal(corregirParaDiccionario('queres', indice), 'querer');
    assert.equal(corregirParaDiccionario('asi', indice), 'así');
    assert.equal(corregirParaDiccionario('zzzz', indice), null);
    assert.equal(buscarDefinicion('', indice), null);
    const r = buscarDefinicion('aser', indice);
    assert.equal(r.corregida, true);
    assert.equal(r.buscada, 'aser');
});

test('cómo suena', () => {
    assert.equal(comoSuena('hacer'), comoSuena('aser'));
    assert.equal(comoSuena('lluvia'), comoSuena('yubia'));
    assert.equal(comoSuena('guerra'), comoSuena('guera'));
    assert.equal(comoSuena('gente'), comoSuena('jente'));
    assert.notEqual(comoSuena('guerra'), comoSuena('jerra'));
    assert.equal(comoSuena('quiero'), comoSuena('kiero'));
});

test('los índices de lo mal escrito se arman de a pedazos', () => {
    const otro = crearIndiceDefiniciones(EJEMPLO, FRECUENCIAS);
    assert.equal(otro.listo, false);
    assert.equal(otro.armarPedazo(3), false);
    while (!otro.armarPedazo(3));
    assert.equal(otro.listo, true);
    assert.equal(corregirParaDiccionario('aser', otro), 'hacer');
});

// Con el archivo de verdad.
const frecuencias = (() => {
    const contexto = {};
    vm.runInNewContext(fs.readFileSync('frecuencias.js', 'utf8') + ';this.t = textoFrecuencias;', contexto);
    return parsearFrecuencias(contexto.t);
})();
const real = crearIndiceDefiniciones(fs.readFileSync('definiciones.txt', 'utf8'), frecuencias);

test('el diccionario de verdad tiene las palabras de las letras', () => {
    for (const palabra of ['amor', 'corazón', 'noche', 'calle', 'guita', 'laburo', 'pibe', 'chamuyar', 'boludo', 'rapear', 'barrio', 'birra']) {
        const r = buscarDefinicion(palabra, real);
        assert.ok(r && r.entradas[0].categorias[0].acepciones.length, `falta ${palabra}`);
    }
});

test('el diccionario de verdad corrige lo mal escrito', () => {
    const casos = { aser: 'hacer', sielo: 'cielo', corazon: 'corazón', gerra: 'guerra', jente: 'gente', bolber: 'volver', nesesito: 'necesito', ermano: 'hermano', tambien: 'también', ojala: 'ojalá', llendo: 'yendo', extranio: 'extraño', querés: 'querer' };
    for (const [escrita, esperada] of Object.entries(casos)) assert.equal(corregirParaDiccionario(escrita, real), esperada, escrita);
    assert.deepEqual(buscarDefinicion('fuimos', real).entradas.map(e => e.palabra), ['ir', 'ser']);
    assert.deepEqual(buscarDefinicion('perros', real).entradas.map(e => e.palabra), ['perro']);
});
