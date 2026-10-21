import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerApariencia, elegirApariencia } from '../js/logica/apariencia.js';

function almacenDePrueba(inicial = {}) {
    const datos = { ...inicial };
    return { getItem: k => datos[k] ?? null, setItem: (k, v) => { datos[k] = String(v); } };
}

test('sin nada guardado sigue al sistema', () => {
    assert.equal(leerApariencia(almacenDePrueba()), 'sistema');
});

test('se elige y se recuerda claro u oscuro', () => {
    const almacen = almacenDePrueba();
    assert.equal(elegirApariencia(almacen, 'oscuro'), 'oscuro');
    assert.equal(leerApariencia(almacen), 'oscuro');
    elegirApariencia(almacen, 'claro');
    assert.equal(leerApariencia(almacen), 'claro');
});

test('algo raro no rompe nada', () => {
    const almacen = almacenDePrueba({ 'metrica.apariencia': 'violeta' });
    assert.equal(leerApariencia(almacen), 'sistema');
    assert.equal(elegirApariencia(almacen, 'rosa'), 'sistema');
});
