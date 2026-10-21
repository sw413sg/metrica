import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leerAjustesLibreta, guardarAjusteLibreta, estiloLibreta } from '../js/logica/libreta.js';

function almacenDePrueba(inicial = {}) {
    const datos = { ...inicial };
    return { getItem: k => datos[k] ?? null, setItem: (k, v) => { datos[k] = String(v); } };
}

test('sin nada guardado: mediano, normal y la fuente del sistema', () => {
    const ajustes = leerAjustesLibreta(almacenDePrueba());
    assert.deepEqual(ajustes, { tamano: 'mediano', separacion: 'normal', letras: 'normal', internas: 'cuatro', fuente: 'sistema' });
    const estilo = estiloLibreta(ajustes);
    assert.equal(estilo.tamano, 17);
    assert.equal(estilo.alto, 23);
    assert.equal(estilo.letras, 0);
    assert.equal(estilo.internas, 4);
    assert.match(estilo.fuente, /system-ui/);
});

test('se guarda y se recuerda cada ajuste', () => {
    const almacen = almacenDePrueba();
    guardarAjusteLibreta(almacen, 'tamano', 'grande');
    guardarAjusteLibreta(almacen, 'fuente', 'serif');
    guardarAjusteLibreta(almacen, 'letras', 'junta');
    const ajustes = leerAjustesLibreta(almacen);
    assert.deepEqual(ajustes, { tamano: 'grande', separacion: 'normal', letras: 'junta', internas: 'cuatro', fuente: 'serif' });
    assert.equal(estiloLibreta(ajustes).alto, 27);
    assert.ok(estiloLibreta(ajustes).letras < 0, 'junta: las letras más pegadas');
});

test('opciones que no existen o datos rotos no rompen nada', () => {
    const almacen = almacenDePrueba({ 'metrica.libreta': '{rota' });
    assert.deepEqual(leerAjustesLibreta(almacen), { tamano: 'mediano', separacion: 'normal', letras: 'normal', internas: 'cuatro', fuente: 'sistema' });
    assert.equal(guardarAjusteLibreta(almacen, 'tamano', 'gigante').tamano, 'mediano');
    assert.equal(guardarAjusteLibreta(almacen, 'color', 'rojo').tamano, 'mediano');
});
