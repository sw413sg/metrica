import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    CARPETAS_GRATIS, listarCarpetas, puedeCrearCarpeta, crearCarpeta, renombrarCarpeta, borrarCarpeta, moverACarpeta,
    letrasDeCarpeta, cantidadesPorCarpeta, textoCantidadLetras, sinCarpetasProtegidas, carpetasVisibles,
} from '../js/logica/carpetas.js';
import { guardarLetra, listarLetras, moverLetra } from '../js/logica/sesiones.js';

// Los mismos casos de CarpetasTests.swift.
function almacenDePrueba(inicial = {}) {
    const datos = new Map(Object.entries(inicial));
    return { getItem: clave => datos.get(clave) ?? null, setItem: (clave, valor) => datos.set(clave, String(valor)) };
}
const letra = (id, mas = {}) => ({ id, titulo: `L${id}`, texto: '', ...mas });

test('gratis hasta dos, y con Métrica+ sin límite', () => {
    const almacen = almacenDePrueba();
    assert.equal(CARPETAS_GRATIS, 2);
    assert.ok(crearCarpeta(almacen, 'Disco 2026', false, 1));
    assert.ok(crearCarpeta(almacen, '  Para Juan  ', false, 2));
    assert.ok(!puedeCrearCarpeta(almacen, false));
    assert.equal(crearCarpeta(almacen, 'Ideas sueltas', false, 3), null);
    assert.ok(crearCarpeta(almacen, 'Ideas sueltas', true, 3));
    assert.deepEqual(listarCarpetas(almacen).map(c => c.nombre), ['Disco 2026', 'Para Juan', 'Ideas sueltas']);
    assert.equal(crearCarpeta(almacen, '   ', true, 4), null);
});

test('ids distintos en el mismo milisegundo', () => {
    const almacen = almacenDePrueba();
    assert.notEqual(crearCarpeta(almacen, 'A', true, 5).id, crearCarpeta(almacen, 'B', true, 5).id);
});

test('renombrar', () => {
    const almacen = almacenDePrueba();
    const carpeta = crearCarpeta(almacen, 'Disco', false, 1);
    renombrarCarpeta(almacen, carpeta.id, 'Disco 2026');
    renombrarCarpeta(almacen, carpeta.id, '  ');
    assert.equal(listarCarpetas(almacen)[0].nombre, 'Disco 2026');
});

test('una letra va en una sola carpeta, y borrar la carpeta no borra las letras', () => {
    const almacen = almacenDePrueba();
    const disco = crearCarpeta(almacen, 'Disco', false, 1), juan = crearCarpeta(almacen, 'Para Juan', false, 2);
    for (const i of [1, 2, 3]) guardarLetra(almacen, letra(String(i)), i * 10);
    moverACarpeta(almacen, ['1', '2'], disco.id);
    moverACarpeta(almacen, ['2'], juan.id);
    assert.deepEqual(letrasDeCarpeta(listarLetras(almacen), disco.id).map(l => l.id), ['1']);
    assert.deepEqual(letrasDeCarpeta(listarLetras(almacen), juan.id).map(l => l.id), ['2']);
    assert.equal(letrasDeCarpeta(listarLetras(almacen), null).length, 3);
    assert.deepEqual(cantidadesPorCarpeta(almacen), { [disco.id]: 1, [juan.id]: 1 });
    assert.deepEqual(listarLetras(almacen).map(l => l.id), ['3', '2', '1']);

    borrarCarpeta(almacen, disco.id);
    assert.deepEqual(listarCarpetas(almacen).map(c => c.id), [juan.id]);
    assert.equal(listarLetras(almacen).length, 3);
    assert.equal(listarLetras(almacen).find(l => l.id === '1').carpeta, undefined);

    moverACarpeta(almacen, ['2'], null);
    assert.deepEqual(cantidadesPorCarpeta(almacen), {});
    moverACarpeta(almacen, ['3'], 'no-existe');
    assert.equal(listarLetras(almacen).find(l => l.id === '3').carpeta, undefined);
});

test('guardar la letra abierta no la saca ni la mete en una carpeta', () => {
    const almacen = almacenDePrueba();
    const disco = crearCarpeta(almacen, 'Disco', false, 1);
    const abierta = guardarLetra(almacen, letra('1', { titulo: 'Hola', carpeta: disco.id }), 10);
    assert.equal(listarLetras(almacen)[0].carpeta, disco.id);
    moverACarpeta(almacen, ['1'], null);
    guardarLetra(almacen, { ...abierta, texto: 'verso' }, 20);
    assert.equal(listarLetras(almacen)[0].carpeta, undefined);
});

test('orden a mano adentro de la carpeta', () => {
    const almacen = almacenDePrueba();
    const ep = crearCarpeta(almacen, 'EP', false, 1);
    for (const i of [1, 2, 3, 4, 5]) guardarLetra(almacen, letra(String(i)), i * 10);
    moverACarpeta(almacen, ['1', '3', '5'], ep.id);
    assert.deepEqual(letrasDeCarpeta(listarLetras(almacen), ep.id).map(l => l.id), ['5', '3', '1']);
    moverLetra(almacen, '1', 0, ep.id);
    assert.deepEqual(letrasDeCarpeta(listarLetras(almacen), ep.id).map(l => l.id), ['1', '5', '3']);
    assert.deepEqual(listarLetras(almacen).map(l => l.id), ['1', '4', '5', '2', '3']);
});

test('cantidad', () => {
    assert.equal(textoCantidadLetras(1), '1 letra');
    assert.equal(textoCantidadLetras(0), '0 letras');
    assert.equal(textoCantidadLetras(12), '12 letras');
});

test('una carpeta protegida en el iPhone no se ve en la web, ni sus letras', () => {
    const almacen = almacenDePrueba({ 'metrica.carpetas': JSON.stringify([
        { id: '1', nombre: 'Diario', creada: 1, protegida: true }, { id: '2', nombre: 'Disco', creada: 2 },
    ]) });
    for (const i of [1, 2, 3]) guardarLetra(almacen, letra(String(i)), i * 10);
    moverACarpeta(almacen, ['2'], '1');
    assert.deepEqual(sinCarpetasProtegidas(listarLetras(almacen), almacen).map(l => l.id), ['3', '1']);
    assert.deepEqual(carpetasVisibles(almacen).map(c => c.nombre), ['Disco']);
});
