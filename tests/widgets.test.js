import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WIDGETS, ajustesWidget, guardarAjusteWidget, frasesDelWidget, consignaDelDia, racha, ajustesBloqueo, guardarAjusteBloqueo, letraDelWidget, palabraDelDia, ultimaSemana } from '../js/logica/widgets.js';

function almacenDePrueba() {
    const datos = new Map();
    return { getItem: clave => datos.get(clave) ?? null, setItem: (clave, valor) => datos.set(clave, String(valor)) };
}

test('el baúl es el primer widget', () => {
    assert.equal(WIDGETS[0].id, 'baul');
});

test('ajustesWidget arranca chico y en vidrio, y guarda lo que se cambia por widget', () => {
    const almacen = almacenDePrueba();
    assert.deepEqual(ajustesWidget(almacen, 'baul'), { tamano: 'chico', estilo: 'vidrio', mostrarFrases: true, soloSinUsar: false });
    assert.equal(ajustesWidget(almacen, 'consigna').categoria, 'todas');
    guardarAjusteWidget(almacen, 'baul', { tamano: 'grande', estilo: 'violeta' });
    assert.equal(ajustesWidget(almacen, 'baul').tamano, 'grande');
    assert.equal(ajustesWidget(almacen, 'baul').estilo, 'violeta');
    assert.equal(ajustesWidget(almacen, 'racha').estilo, 'vidrio');
});

test('un tamaño que el widget no tiene vuelve al primero', () => {
    const almacen = almacenDePrueba();
    assert.equal(guardarAjusteWidget(almacen, 'racha', { tamano: 'grande' }).tamano, 'chico');
    assert.equal(ajustesWidget(almacen, 'accesos').tamano, 'mediano');
    assert.equal(guardarAjusteWidget(almacen, 'consigna', { tamano: 'grande' }).tamano, 'chico');
});

test('si lo guardado está roto, arranca de cero', () => {
    const almacen = almacenDePrueba();
    almacen.setItem('metrica.widgets', '{roto');
    assert.equal(ajustesWidget(almacen, 'baul').tamano, 'chico');
});

test('frasesDelWidget muestra las últimas según el tamaño, y puede ocultarlas o dejar solo las sin usar', () => {
    const frases = [
        { texto: 'a', creada: 1, usada: false },
        { texto: 'b', creada: 2, usada: true },
        { texto: 'c', creada: 3, usada: false },
    ];
    assert.deepEqual(frasesDelWidget(frases, { tamano: 'chico' }), ['c']);
    assert.deepEqual(frasesDelWidget(frases, { tamano: 'mediano' }), ['c', 'b']);
    assert.deepEqual(frasesDelWidget(frases, { tamano: 'grande' }), ['c', 'b', 'a']);
    assert.equal(frasesDelWidget([...frases, ...frases, ...frases], { tamano: 'grande' }).length, 5);
    assert.deepEqual(frasesDelWidget(frases, { tamano: 'grande', soloSinUsar: true }), ['c', 'a']);
    assert.deepEqual(frasesDelWidget(frases, { tamano: 'grande', mostrarFrases: false }), []);
});

test('consignaDelDia es la misma todo el día, cambia al otro y respeta la categoría', () => {
    const consignas = Array.from({ length: 50 }, (_, i) => ({ id: i, categoria: i % 2 ? 'amor' : 'calle' }));
    const manana = new Date(2026, 9, 27, 8).getTime();
    const noche = new Date(2026, 9, 27, 23).getTime();
    const otroDia = new Date(2026, 9, 28, 8).getTime();
    assert.equal(consignaDelDia(consignas, { ahora: manana }), consignaDelDia(consignas, { ahora: noche }));
    assert.notEqual(consignaDelDia(consignas, { ahora: manana }), consignaDelDia(consignas, { ahora: otroDia }));
    assert.equal(consignaDelDia(consignas, { categoria: 'amor', ahora: manana }).categoria, 'amor');
    assert.equal(consignaDelDia(consignas, { categoria: 'nada' }), null);
});

test('racha cuenta los días seguidos y no se corta si hoy todavía no se escribió', () => {
    const d = (dia, hora = 12) => new Date(2026, 9, dia, hora).getTime();
    const hoy = d(27, 20);
    assert.deepEqual(racha([d(25), d(26), d(27, 9)], hoy), { dias: 3, escribioHoy: true });
    assert.deepEqual(racha([d(25), d(26)], hoy), { dias: 2, escribioHoy: false });
    assert.deepEqual(racha([d(24), d(26, 1), d(26, 23)], hoy), { dias: 1, escribioHoy: false });
    assert.deepEqual(racha([d(20)], hoy), { dias: 0, escribioHoy: false });
    assert.deepEqual(racha([], hoy), { dias: 0, escribioHoy: false });
});

test('pantalla bloqueada y acción rápida: arrancan en anotar y vuelven al inicial si lo guardado no vale', () => {
    const almacen = almacenDePrueba();
    assert.deepEqual(ajustesBloqueo(almacen), { redondo: 'anotar', rectangular: 'baul', linea: 'racha', accion: 'anotar' });
    assert.equal(guardarAjusteBloqueo(almacen, { redondo: 'grabar', accion: 'freestyle' }).redondo, 'grabar');
    assert.equal(ajustesBloqueo(almacen).accion, 'freestyle');
    assert.equal(guardarAjusteBloqueo(almacen, { rectangular: 'cualquiera' }).rectangular, 'baul');
    // No se mezcla con los ajustes de los widgets.
    assert.equal(ajustesWidget(almacen, 'baul').tamano, 'chico');
});

test('letraDelWidget: la última editada o la elegida, con renglones según el tamaño y sin las partes', () => {
    const letras = [
        { id: 'a', titulo: 'Vieja', texto: 'uno', editada: 1 },
        { id: 'b', titulo: '', texto: '[Intro]\nprimer verso\n\nsegundo verso\ntercero\ncuarto', editada: 2 },
    ];
    assert.deepEqual(letraDelWidget(letras), { id: 'b', titulo: 'Sin título', renglones: ['primer verso', 'segundo verso', 'tercero'], versos: 4 });
    assert.equal(letraDelWidget(letras, { tamano: 'grande' }).renglones.length, 4);
    assert.equal(letraDelWidget(letras, { letra: 'a' }).titulo, 'Vieja');
    assert.equal(letraDelWidget(letras, { letra: 'borrada' }).id, 'b');
    assert.equal(letraDelWidget([]), null);
});

test('palabraDelDia es la misma todo el día', () => {
    const palabras = ['casa', 'luna', 'calle', 'noche', 'barrio'];
    assert.equal(palabraDelDia(palabras, new Date(2026, 9, 27, 1).getTime()), palabraDelDia(palabras, new Date(2026, 9, 27, 23).getTime()));
    assert.equal(palabraDelDia([]), null);
});

test('ultimaSemana: 7 días hasta hoy con su inicial', () => {
    const hoy = new Date(2026, 9, 27, 20).getTime(); // martes
    const semana = ultimaSemana([new Date(2026, 9, 26, 10).getTime(), hoy], hoy);
    assert.deepEqual(semana.map(d => d.inicial).join(''), 'MJVSDLM');
    assert.deepEqual(semana.map(d => d.escribio), [false, false, false, false, false, true, true]);
    assert.equal(semana[6].hoy, true);
});
