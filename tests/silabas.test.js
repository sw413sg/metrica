import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contarSilabasVerso, separarSilabas, inicioTonica, rimasMultisilabicas } from '../js/logica/silabas.js';

test('separar sílabas', () => {
    assert.deepEqual(separarSilabas('cuidado'), ['cui', 'da', 'do']);
    assert.deepEqual(separarSilabas('canción'), ['can', 'ción']);
    assert.deepEqual(separarSilabas('instrucción'), ['ins', 'truc', 'ción']);
    assert.deepEqual(separarSilabas('pájaro'), ['pá', 'ja', 'ro']);
});
test('separar sílabas: grupos que no se separan (pr, bl, ch, ll, rr, qu, gu)', () => {
    assert.deepEqual(separarSilabas('hablar'), ['ha', 'blar']);
    assert.deepEqual(separarSilabas('noche'), ['no', 'che']);
    assert.deepEqual(separarSilabas('calle'), ['ca', 'lle']);
    assert.deepEqual(separarSilabas('guitarra'), ['gui', 'ta', 'rra']);
    assert.deepEqual(separarSilabas('aquí'), ['a', 'quí']);
    assert.deepEqual(separarSilabas('siempre'), ['siem', 'pre']);
});
test('separar sílabas: hiatos y h', () => {
    assert.deepEqual(separarSilabas('poeta'), ['po', 'e', 'ta']);
    assert.deepEqual(separarSilabas('día'), ['dí', 'a']);
    assert.deepEqual(separarSilabas('ahora'), ['a', 'ho', 'ra']);
    assert.deepEqual(separarSilabas('pingüino'), ['pin', 'güi', 'no']);
    assert.deepEqual(separarSilabas('123'), []);
});
test('verso grave con sinalefa: "Caminante, no hay camino" = 8', () => {
    assert.equal(contarSilabasVerso('Caminante, no hay camino'), 8);
});
test('sinalefa: "La princesa está triste" = 7', () => {
    assert.equal(contarSilabasVerso('La princesa está triste'), 7);
    assert.equal(contarSilabasVerso('¿qué tendrá la princesa?'), 7);
});
test('verso agudo suma una: "mi corazón" = 5', () => {
    assert.equal(contarSilabasVerso('mi corazón'), 5);
    assert.equal(contarSilabasVerso('se hace camino al andar'), 8);
});
test('verso esdrújulo resta una', () => {
    assert.equal(contarSilabasVerso('canto una música'), 5);
});
test('la "y" sola hace sinalefa', () => {
    assert.equal(contarSilabasVerso('Volverán las oscuras golondrinas'), 11);
    assert.equal(contarSilabasVerso('sola y triste'), 4);
    assert.equal(contarSilabasVerso('triste y sola'), 4);
});
test('verso vacío o sin palabras', () => {
    assert.equal(contarSilabasVerso(''), 0);
    assert.equal(contarSilabasVerso('  ... 123 '), 0);
});

test('inicioTonica: dónde empieza la sílaba tónica, para pintar solo la parte que rima', () => {
    assert.equal(inicioTonica('canción'), 3);
    assert.equal(inicioTonica('razón'), 2);
    assert.equal(inicioTonica('camino'), 2);
    assert.equal(inicioTonica('pájaro'), 0);
    assert.equal(inicioTonica('atrás'), 1);
    assert.equal(inicioTonica('Corazón'), 4);
    assert.equal(inicioTonica('sol'), 0);
    assert.equal(inicioTonica('123'), -1);
});

test('rimasMultisilabicas: pinta desde antes de la tónica si las vocales de antes también riman', () => {
    // vo-LAN-do / so-NAN-do: o-a-o, una sílaba de más.
    assert.deepEqual(rimasMultisilabicas([['se', 'pasa', 'volando'], ['un', 'tune', 'sonando']], [0, 0]),
        [[null, null, 0], [null, null, 0]]);
    // Cruza palabras: "ca-sa BLAN-ca" / "pla-za MAN-ca": a-a-a-a, dos de más ("casa" entera).
    assert.deepEqual(rimasMultisilabicas([['la', 'casa', 'blanca'], ['mi', 'plaza', 'manca']], [0, 0]),
        [[null, 0, 0], [null, 0, 0]]);
    // Una sola de más: "sa" / "za" riman, "ca" / "pie" no.
    assert.deepEqual(rimasMultisilabicas([['tu', 'casa', 'blanca'], ['mi', 'pieza', 'manca']], [0, 0]),
        [[null, 2, 0], [null, 3, 0]]);
    // ca-MI-no / des-TI-no: antes de la tónica, a y e no coinciden. Rima de una sola sílaba tónica.
    assert.deepEqual(rimasMultisilabicas([['camino'], ['destino']], [0, 0]), [[], []]);
    // Solo contra versos cercanos: a 4 versos o más, "volando" y "sonando" riman solo desde la tónica.
    const lejos = [['se', 'pasa', 'volando'], ['uno'], ['dos'], ['tres'], ['un', 'tune', 'sonando']];
    assert.deepEqual(rimasMultisilabicas(lejos, [0, null, null, null, 0]), [[], [], [], [], []]);
    assert.deepEqual(rimasMultisilabicas(lejos, [0, null, null, null, 0], 5)[0], [null, null, 0]);
    // Ni de una estrofa a otra.
    assert.deepEqual(rimasMultisilabicas([['se', 'pasa', 'volando'], [], ['un', 'tune', 'sonando']], [0, null, 0]), [[], [], []]);
    // Sin grupo de rima, nada.
    assert.deepEqual(rimasMultisilabicas([['volando'], ['sonando']], [null, null]), [[], []]);
    assert.deepEqual(rimasMultisilabicas([], []), []);
});
