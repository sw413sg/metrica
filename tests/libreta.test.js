import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AJUSTES_LIBRETA, leerAjustesLibreta, guardarAjusteLibreta, estiloLibreta } from '../js/logica/libreta.js';

function almacenDePrueba(inicial = {}) {
    const datos = { ...inicial };
    return { getItem: k => datos[k] ?? null, setItem: (k, v) => { datos[k] = String(v); } };
}

test('sin nada guardado: mediano, normal y la fuente del sistema', () => {
    const ajustes = leerAjustesLibreta(almacenDePrueba());
    assert.deepEqual(ajustes, { tamano: '4', separacion: '4', letras: '5', internas: 'dos', fuente: 'sistema' });
    const estilo = estiloLibreta(ajustes);
    assert.equal(estilo.tamano, 16);
    assert.equal(estilo.alto, 22);
    assert.equal(estilo.letras, -0.01);
    assert.equal(estilo.internas, 2);
    assert.match(estilo.fuente, /system-ui/);
});

test('se guarda y se recuerda cada ajuste', () => {
    const almacen = almacenDePrueba();
    guardarAjusteLibreta(almacen, 'tamano', '8');
    guardarAjusteLibreta(almacen, 'fuente', 'serif');
    guardarAjusteLibreta(almacen, 'letras', '2');
    const ajustes = leerAjustesLibreta(almacen);
    assert.deepEqual(ajustes, { tamano: '8', separacion: '4', letras: '2', internas: 'dos', fuente: 'serif' });
    assert.equal(estiloLibreta(ajustes).alto, 27);
    assert.ok(estiloLibreta(ajustes).letras < 0, 'junta: las letras más pegadas');
});

test('opciones que no existen o datos rotos no rompen nada', () => {
    const almacen = almacenDePrueba({ 'metrica.libreta': '{rota' });
    assert.deepEqual(leerAjustesLibreta(almacen), { tamano: '4', separacion: '4', letras: '5', internas: 'dos', fuente: 'sistema' });
    assert.equal(guardarAjusteLibreta(almacen, 'tamano', '11').tamano, '4');
    assert.equal(guardarAjusteLibreta(almacen, 'color', 'rojo').tamano, '4');
});

test('tamaño y separaciones: 10 puntos, de menor a mayor', () => {
    for (const clave of ['tamano', 'separacion', 'letras']) {
        const valores = Object.values(AJUSTES_LIBRETA[clave].opciones).map(o => o.valor);
        assert.equal(valores.length, 10, clave);
        assert.ok(valores.every((v, i) => i === 0 || v > valores[i - 1]), clave);
    }
});
