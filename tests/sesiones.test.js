import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nuevaLetra, listarLetras, guardarLetra, borrarLetra, moverLetra, lugaresEnGrilla, esLarga, listarGuardadas, alternarGuardada, ordenarLetras, coincideBusqueda } from '../js/logica/sesiones.js';

// Imita localStorage: guarda texto por clave.
function almacenDePrueba(inicial = {}) {
    const datos = new Map(Object.entries(inicial));
    return { getItem: clave => datos.get(clave) ?? null, setItem: (clave, valor) => datos.set(clave, String(valor)) };
}

test('guardarLetra guarda, actualiza y lista de la última creada a la primera', () => {
    const almacen = almacenDePrueba();
    assert.deepEqual(listarLetras(almacen), []);
    const a = guardarLetra(almacen, { ...nuevaLetra(1), titulo: 'Primera' }, 10);
    guardarLetra(almacen, { ...nuevaLetra(2), texto: 'un verso' }, 20);
    assert.deepEqual(listarLetras(almacen).map(l => l.id), ['2', '1']);
    guardarLetra(almacen, { ...a, texto: 'cambiada' }, 30);
    const letras = listarLetras(almacen);
    // Editarla no la cambia de lugar: la última creada sigue primera.
    assert.deepEqual(letras.map(l => l.id), ['2', '1']);
    assert.equal(letras[1].texto, 'cambiada');
    assert.equal(letras[1].editada, 30);
    assert.equal(letras[1].creada, 1);
});

test('una letra vacía no se guarda, y si se vacía se borra', () => {
    const almacen = almacenDePrueba();
    guardarLetra(almacen, nuevaLetra(1));
    assert.equal(listarLetras(almacen).length, 0);
    const letra = guardarLetra(almacen, { ...nuevaLetra(1), titulo: 'Algo' });
    guardarLetra(almacen, { ...letra, titulo: '  ' });
    assert.equal(listarLetras(almacen).length, 0);
});

test('borrarLetra', () => {
    const almacen = almacenDePrueba();
    guardarLetra(almacen, { ...nuevaLetra(1), titulo: 'A' });
    guardarLetra(almacen, { ...nuevaLetra(2), titulo: 'B' });
    borrarLetra(almacen, '1');
    assert.deepEqual(listarLetras(almacen).map(l => l.titulo), ['B']);
});

test('datos rotos en el almacén no rompen la app', () => {
    const almacen = almacenDePrueba({ 'metrica.letras': '{roto' });
    assert.deepEqual(listarLetras(almacen), []);
});


test('moverLetra acomoda a mano, editar no la mueve y una nueva va primera', () => {
    const almacen = almacenDePrueba();
    for (const [id, t] of [['a', 10], ['b', 20], ['c', 30]]) guardarLetra(almacen, { id, titulo: id, texto: '', creada: t }, t);
    assert.deepEqual(listarLetras(almacen).map(l => l.id), ['c', 'b', 'a']);
    moverLetra(almacen, 'a', 0);
    assert.deepEqual(listarLetras(almacen).map(l => l.id), ['a', 'c', 'b']);
    moverLetra(almacen, 'a', 2);
    assert.deepEqual(listarLetras(almacen).map(l => l.id), ['c', 'b', 'a']);
    moverLetra(almacen, 'c', 1);
    assert.deepEqual(listarLetras(almacen).map(l => l.id), ['b', 'c', 'a']);
    const a = listarLetras(almacen)[2];
    guardarLetra(almacen, { ...a, texto: 'nuevo' }, 40);
    assert.deepEqual(listarLetras(almacen).map(l => l.id), ['b', 'c', 'a']);
    guardarLetra(almacen, { ...nuevaLetra(50), titulo: 'd' }, 50);
    assert.deepEqual(listarLetras(almacen).map(l => l.titulo), ['d', 'b', 'c', 'a']);
    // Una sin fecha de creación toma la de cuando se guarda.
    guardarLetra(almacen, { id: 'e', titulo: 'e', texto: '' }, 60);
    assert.equal(listarLetras(almacen)[0].creada, 60);
});

test('letras guardadas antes se listan por creación, y sin fecha por la última edición', () => {
    const almacen = almacenDePrueba({ 'metrica.letras': JSON.stringify([
        { id: '1', titulo: 'x', texto: '', editada: 5 }, { id: '2', titulo: 'y', texto: '', editada: 9 },
        { id: '3', titulo: 'z', texto: '', creada: 7, editada: 99, orden: 99 },
    ]) });
    assert.deepEqual(listarLetras(almacen).map(l => l.id), ['2', '3', '1']);
});

test('ordenarLetras: fecha, título (sin título al final) y modificación, para los dos lados', () => {
    const letras = [
        { id: '3', titulo: 'banda', editada: 5 }, { id: '2', titulo: '', editada: 9 }, { id: '1', titulo: 'Árbol', editada: 1 },
    ];
    assert.deepEqual(ordenarLetras(letras).map(l => l.id), ['3', '2', '1']);
    assert.deepEqual(ordenarLetras(letras, 'fecha', true).map(l => l.id), ['1', '2', '3']);
    assert.deepEqual(ordenarLetras(letras, 'titulo', true).map(l => l.id), ['1', '3', '2']);
    assert.deepEqual(ordenarLetras(letras, 'titulo', false).map(l => l.id), ['3', '1', '2']);
    assert.deepEqual(ordenarLetras(letras, 'modificacion').map(l => l.id), ['2', '3', '1']);
    assert.deepEqual(ordenarLetras(letras, 'modificacion', true).map(l => l.id), ['1', '3', '2']);
});

test('coincideBusqueda: por título o texto, sin tildes ni mayúsculas', () => {
    const letra = { titulo: 'Canción de cuna', texto: 'Duérmete ya' };
    assert.ok(coincideBusqueda(letra, 'CANCION'));
    assert.ok(coincideBusqueda(letra, 'duermete'));
    assert.ok(!coincideBusqueda(letra, 'noche'));
    assert.ok(coincideBusqueda(letra, '  '));
});

test('lugaresEnGrilla: con más columnas (la computadora), cada tarjeta a la más corta', () => {
    const ids = Array.from({ length: 30 }, (_, i) => String(1761000000000 + i * 7919));
    const lugares = lugaresEnGrilla(ids, 4);
    const alto = [1, 0, 0, 0];
    lugares.forEach((l, i) => {
        assert.equal(l.larga, esLarga(ids[i]));
        assert.equal(l.fila, alto[l.columna - 1] + 1);
        assert.equal(alto[l.columna - 1], Math.min(...alto));
        assert.equal(alto.indexOf(Math.min(...alto)), l.columna - 1);
        alto[l.columna - 1] += l.larga ? 2 : 1;
    });
    // Las primeras tres van al lado de la «+», en la fila de arriba.
    assert.deepEqual(lugares.slice(0, 3).map(l => [l.columna, l.fila]), [[2, 1], [3, 1], [4, 1]]);
    // Con dos columnas, igual que siempre.
    assert.deepEqual(lugaresEnGrilla(ids, 2), lugaresEnGrilla(ids));
});

test('lugaresEnGrilla: cada tarjeta a la columna más corta, con su alto de siempre', () => {
    const ids = Array.from({ length: 40 }, (_, i) => String(1761000000000 + i * 7919));
    const lugares = lugaresEnGrilla(ids);
    // Sin huecos ni encimadas: cada columna se llena de corrido (la "+" ocupa la fila 1 de la izquierda).
    const alto = [1, 0];
    lugares.forEach((l, i) => {
        assert.equal(l.larga, esLarga(ids[i]));
        assert.equal(l.fila, alto[l.columna - 1] + 1);
        assert.ok(alto[l.columna - 1] <= alto[2 - l.columna]);
        alto[l.columna - 1] += l.larga ? 2 : 1;
    });
    // Hay de los dos tamaños, y no van alternados uno y uno.
    const largas = lugares.map(l => l.larga);
    assert.ok(largas.some(Boolean) && !largas.every(Boolean));
    assert.ok(largas.some((l, i) => i > 0 && l === largas[i - 1]));
    // La misma letra tiene siempre el mismo alto, en cualquier lugar.
    assert.deepEqual(lugaresEnGrilla([...ids].reverse()).map(l => l.larga), [...largas].reverse());
});

test('palabras guardadas: guardar, sacar y la última primero', () => {
    const almacen = almacenDePrueba({ 'metrica.guardadas': '"rota"' });
    assert.deepEqual(listarGuardadas(almacen), []);
    assert.equal(alternarGuardada(almacen, 'luna'), true);
    assert.equal(alternarGuardada(almacen, 'corazón'), true);
    assert.deepEqual(listarGuardadas(almacen), ['corazón', 'luna']);
    assert.equal(alternarGuardada(almacen, 'luna'), false);
    assert.deepEqual(listarGuardadas(almacen), ['corazón']);
});
