import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { crearIndiceSinonimos, buscarSinonimos } from '../js/logica/sinonimos.js';

test('busca por palabra y saca los repetidos entre grupos', () => {
    const indice = crearIndiceSinonimos('lindo:bonito,bello;bello,hermoso');
    assert.deepEqual(buscarSinonimos('lindo', indice), ['bonito', 'bello', 'hermoso']);
    assert.deepEqual(buscarSinonimos('Lindo', indice), ['bonito', 'bello', 'hermoso']);
    assert.deepEqual(buscarSinonimos('feo', indice), []);
});

test('una forma conjugada o en plural usa los de su base', () => {
    const indice = crearIndiceSinonimos('lindo:bonito\nquerer:amar', 'lindo:1as,1a\nquerer:2ía');
    assert.deepEqual(buscarSinonimos('lindas', indice), ['bonito']);
    assert.deepEqual(buscarSinonimos('quería', indice), ['amar']);
});

// Con el archivo de verdad.
const contexto = {};
vm.runInNewContext(fs.readFileSync('sinonimos.js', 'utf8') + '\nthis.s = textoSinonimos; this.f = textoFormasSinonimos;', contexto);
const indice = crearIndiceSinonimos(contexto.s, contexto.f);

test('sinonimos.js: palabras comunes, formas y lunfardo', () => {
    assert.ok(buscarSinonimos('triste', indice).includes('melancólico'));
    assert.ok(buscarSinonimos('tristes', indice).includes('melancólico'));
    assert.ok(buscarSinonimos('corazón', indice).includes('alma'));
    assert.ok(buscarSinonimos('caminar', indice).includes('andar'));
    assert.ok(buscarSinonimos('caminaba', indice).includes('andar'));
    // Lo rioplatense aparece primero.
    assert.deepEqual(buscarSinonimos('trabajo', indice).slice(0, 3), ['laburo', 'changa', 'curro']);
    assert.ok(buscarSinonimos('guita', indice).includes('plata'));
    assert.ok(!buscarSinonimos('noche', indice).includes('noche'));
});
