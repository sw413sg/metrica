import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WIDGETS, ajustesWidget, guardarAjusteWidget, frasesDelWidget, tamanoAlEstirar, siguienteTamano, ajustarFoto, FOTO_CENTRADA, racha, ajustesBloqueo, guardarAjusteBloqueo, letraDelWidget, palabraDelDia, ultimaSemana } from '../js/logica/widgets.js';

function almacenDePrueba() {
    const datos = new Map();
    return { getItem: clave => datos.get(clave) ?? null, setItem: (clave, valor) => datos.set(clave, String(valor)) };
}

test('el baúl es el primer widget', () => {
    assert.equal(WIDGETS[0].id, 'baul');
});

test('ya no están Freestyle ni Consigna del día', () => {
    assert.deepEqual(WIDGETS.map(w => w.id), ['baul', 'palabra', 'letra', 'racha', 'accesos']);
});

test('ajustesWidget arranca chico, en vidrio y con el primer diseño, y guarda lo que se cambia por widget', () => {
    const almacen = almacenDePrueba();
    assert.deepEqual(ajustesWidget(almacen, 'baul'), { estilo: 'vidrio', tamano: 'chico', diseno: 'lista', mostrarFrases: true, soloSinUsar: false });
    assert.equal(ajustesWidget(almacen, 'letra').letra, 'ultima');
    guardarAjusteWidget(almacen, 'baul', { tamano: 'grande', estilo: 'violeta' });
    assert.equal(ajustesWidget(almacen, 'baul').tamano, 'grande');
    assert.equal(ajustesWidget(almacen, 'baul').estilo, 'violeta');
    assert.equal(ajustesWidget(almacen, 'racha').estilo, 'vidrio');
});

test('un tamaño que el widget no tiene vuelve al primero', () => {
    const almacen = almacenDePrueba();
    assert.equal(guardarAjusteWidget(almacen, 'racha', { tamano: 'grande' }).tamano, 'chico');
    assert.equal(ajustesWidget(almacen, 'accesos').tamano, 'mediano');
    assert.equal(guardarAjusteWidget(almacen, 'palabra', { tamano: 'grande' }).tamano, 'chico');
});

test('cada widget tiene varios diseños, y uno que no existe vuelve al primero', () => {
    for (const widget of WIDGETS) assert.ok(widget.disenos.length >= 3, widget.id);
    const almacen = almacenDePrueba();
    assert.equal(guardarAjusteWidget(almacen, 'baul', { diseno: 'libreta' }).diseno, 'libreta');
    assert.equal(guardarAjusteWidget(almacen, 'baul', { diseno: 'otro' }).diseno, 'lista');
});

test('el estilo foto vale solo si hay una foto guardada', () => {
    const almacen = almacenDePrueba();
    assert.equal(guardarAjusteWidget(almacen, 'racha', { estilo: 'foto' }).estilo, 'vidrio');
    assert.equal(guardarAjusteWidget(almacen, 'racha', { estilo: 'foto', foto: { src: 'data:image/jpeg;base64,x', ...FOTO_CENTRADA } }).estilo, 'foto');
});

test('tamanoAlEstirar elige el tamaño más cercano entre los que tiene el widget', () => {
    const todos = ['chico', 'mediano', 'grande'];
    assert.equal(tamanoAlEstirar(todos, 2.2, 1.8), 'chico');
    assert.equal(tamanoAlEstirar(todos, 3.6, 2.3), 'mediano');
    assert.equal(tamanoAlEstirar(todos, 3.8, 3.7), 'grande');
    assert.equal(tamanoAlEstirar(['chico', 'mediano'], 4, 4), 'mediano');
});

test('siguienteTamano da la vuelta', () => {
    assert.equal(siguienteTamano(['chico', 'mediano', 'grande'], 'chico'), 'mediano');
    assert.equal(siguienteTamano(['chico', 'mediano', 'grande'], 'grande'), 'chico');
    assert.equal(siguienteTamano(['mediano', 'chico'], 'mediano'), 'chico');
});

test('ajustarFoto no deja pasar de los bordes ni del zoom', () => {
    assert.deepEqual(ajustarFoto({ src: 'a' }, { x: 140, y: -5, z: 9, oscuro: 2 }), { src: 'a', x: 100, y: 0, z: 3, oscuro: 0.6 });
    assert.equal(ajustarFoto({ src: 'a', z: 'nada' }).z, 1);
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
    assert.deepEqual(letraDelWidget(letras), { id: 'b', titulo: 'Sin título', renglones: ['primer verso', 'segundo verso', 'tercero'], ultimo: 'cuarto', versos: 4 });
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
