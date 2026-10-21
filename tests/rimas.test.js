import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analizarPalabra, claveConsonante, claveAsonante, crearIndiceRimas, buscarRimas, agruparRimas, rimanConsonante, rimasInternas } from '../js/logica/rimas.js';
import { parsearFrecuencias } from '../js/logica/diccionario.js';

const riman = (a, b) => assert.equal(claveConsonante(a), claveConsonante(b), `${a} / ${b}`);
const noRiman = (a, b) => assert.notEqual(claveConsonante(a), claveConsonante(b), `${a} / ${b}`);
const asonan = (a, b) => assert.equal(claveAsonante(a), claveAsonante(b), `${a} / ${b}`);
const noAsonan = (a, b) => assert.notEqual(claveAsonante(a), claveAsonante(b), `${a} / ${b}`);

test('consonante: aguda con tilde', () => {
    assert.equal(claveConsonante('canción'), 'on');
    riman('canción', 'avión');
    riman('corazón', 'razón');
    riman('café', 'José');
});
test('consonante: aguda sin tilde (termina en consonante que no es n ni s)', () => {
    assert.equal(claveConsonante('amor'), 'or');
    riman('amor', 'dolor');
    riman('ciudad', 'verdad');
    riman('estoy', 'voy');
    riman('rey', 'ley');
});
test('consonante: grave sin tilde', () => {
    assert.equal(claveConsonante('casa'), 'asa');
    riman('cantan', 'plantan');
    riman('lunes', 'unes');
    noRiman('casa', 'mesa');
});
test('consonante: grave con tilde', () => {
    riman('lápiz', 'tápiz');
    riman('cárcel', 'cárcel');
    noRiman('cárcel', 'papel');
    noRiman('árbol', 'sol');
});
test('consonante: esdrújula', () => {
    assert.equal(claveConsonante('música'), 'usika');
    riman('rústica', 'acústica');
    riman('práctica', 'táctica');
    noRiman('música', 'nuca');
    noRiman('pájaro', 'claro');
});
test('consonante: el acento decide la rima', () => {
    noRiman('sábana', 'banana');
    noRiman('canto', 'cantó');
    riman('cantó', 'llegó');
});
test('consonante: diptongos (la semivocal antes de la tónica no cuenta, como dice la RAE)', () => {
    riman('cielo', 'hielo');
    riman('cielo', 'suelo');
    riman('fuego', 'luego');
    riman('tierra', 'guerra');
    noRiman('cielo', 'cela');
});
test('consonante: hiato con tilde', () => {
    riman('día', 'tía');
    riman('país', 'maíz');
    riman('raíz', 'maíz');
    noRiman('día', 'media');
});
test('consonante: suena igual en el Río de la Plata (seseo, b/v, y/ll, h muda)', () => {
    riman('voz', 'dos');
    riman('casa', 'caza');
    riman('nave', 'sabe');
    riman('calle', 'raye');
    riman('cayó', 'calló');
    riman('nace', 'pase');
    riman('ahora', 'aora');
});
test('consonante: u muda en que/qui/gue/gui; ü suena', () => {
    riman('saque', 'ataque');
    riman('pague', 'apague');
    noRiman('pague', 'paje');
    riman('paje', 'garaje');
    riman('gente', 'jente');
    assert.equal(analizarPalabra('pingüino').nucleos.length, 3);
    assert.equal(analizarPalabra('guitarra').nucleos.length, 3);
    assert.equal(analizarPalabra('queso').nucleos.length, 2);
});
test('consonante: "ch" no se confunde con "c"', () => {
    noRiman('mucha', 'nuca');
    riman('mucha', 'lucha');
});

test('asonante: solo vocales desde la tónica', () => {
    assert.equal(claveAsonante('casa'), 'aa');
    assert.equal(claveAsonante('canción'), 'o');
    asonan('casa', 'mala');
    asonan('amor', 'dolor');
    asonan('amor', 'corazón');
    noAsonan('casa', 'cosa');
});
test('asonante: hiato con tilde ("día" es i-a)', () => {
    asonan('día', 'vida');
    noAsonan('día', 'diablo');
});
test('asonante: en esdrújulas cuentan la tónica y la última', () => {
    assert.equal(claveAsonante('música'), 'ua');
    asonan('música', 'luna');
    asonan('lágrima', 'casa');
});
test('asonante: en diptongos cuenta la vocal que suena más', () => {
    asonan('historia', 'boca');
    asonan('gracia', 'casa');
    asonan('cielo', 'beso');
    asonan('nuevo', 'beso');
    asonan('ruido', 'libro');
    asonan('viuda', 'luna');
});

test('analizarPalabra descarta lo que no es una palabra', () => {
    assert.equal(analizarPalabra('y'), null);
    assert.equal(analizarPalabra('a la'), null);
    assert.equal(analizarPalabra('123'), null);
    assert.equal(claveConsonante(''), null);
    assert.equal(analizarPalabra('Canción').palabra, 'canción');
});

test('buscarRimas: de más usadas a menos usadas, sin la palabra buscada', () => {
    const palabras = ['canción', 'avión', 'corazón', 'camión', 'amor', 'razón', 'sol', 'flor', 'pasión'];
    const frecuencias = parsearFrecuencias('corazón 900\nrazón 500\ncanción 300\navión 10\n');
    const indice = crearIndiceRimas(palabras, frecuencias);
    assert.deepEqual(buscarRimas('canción', indice), ['corazón', 'razón', 'avión', 'camión', 'pasión']);
    assert.equal(buscarRimas('Canción', indice).length, 5);
    assert.deepEqual(buscarRimas('dolor', indice), ['amor', 'flor']);
    // Las asonantes no repiten las consonantes.
    assert.deepEqual(buscarRimas('dolor', indice, { tipo: 'asonante' }),
        ['corazón', 'razón', 'canción', 'avión', 'camión', 'pasión', 'sol']);
    assert.deepEqual(buscarRimas('123', indice), []);
});

test('buscarRimas: no sugiere palabras átonas ("con", "lo", "por")', () => {
    const indice = crearIndiceRimas(['con', 'son', 'lo', 'yo', 'por', 'flor']);
    assert.deepEqual(buscarRimas('canción', indice), ['son']);
    assert.deepEqual(buscarRimas('amor', indice), ['flor']);
    assert.deepEqual(buscarRimas('amor', indice, { tipo: 'asonante' }), ['son', 'yo']);
});

test('agruparRimas: numera los grupos en orden y deja sola a la que no rima', () => {
    assert.deepEqual(agruparRimas(['corazón', 'luna', 'canción', 'fortuna', 'mesa', null]), [0, 1, 0, 1, null, null]);
    assert.deepEqual(agruparRimas(['amor', 'dolor', 'corazón']), [0, 0, 0]);
    assert.deepEqual(agruparRimas([]), []);
});

test('rimanConsonante: marca las que tienen pareja consonante en la letra', () => {
    assert.deepEqual(rimanConsonante(['corazón', 'luna', 'canción', 'fortuna', 'amor', null]), [true, true, true, true, false, false]);
    assert.deepEqual(rimanConsonante(['casa', 'mala', 'pasa']), [true, false, true]);
    assert.deepEqual(rimanConsonante(['voz', 'dos']), [true, true]); // seseo
    assert.deepEqual(rimanConsonante([]), []);
});

test('rimasInternas: palabras del medio que riman consonante con otras cercanas', () => {
    const lleno = clave => ({ clave, suave: false });
    const versos = [['tengo', 'un', 'camino', 'y', 'un', 'destino'], ['la', 'luna', 'me', 'mira'], ['vengo', 'de', 'lejos']];
    assert.deepEqual(rimasInternas(versos), [
        [lleno('eo'), null, lleno('io'), null, null, lleno('io')],
        [null, null, null, null],
        [lleno('eo'), null, { clave: 'eo', suave: true }], // "lejos" asona con "tengo" y "vengo"
    ]);
});

test('rimasInternas: asonantes, con la última palabra de un verso', () => {
    const suave = clave => ({ clave, suave: true });
    // "temas" / "eterna": e-a, y "eterna" cierra el verso.
    assert.deepEqual(rimasInternas([['te', 'llevo', 'en', 'mis', 'temas', 'tu', 'tinta', 'es', 'eterna']]),
        [[null, null, null, null, suave('ea'), null, null, null, suave('ea')]]);
    // Dos del medio que solo asonan, a más de un verso, no se pintan ("casa" / "mala").
    assert.deepEqual(rimasInternas([['casa', 'sol'], ['un', 'pez'], ['mala', 'luz']]), [[null, null], [null, null], [null, null]]);
    // Las de una sílaba no cuentan como asonantes ("es" / "tener").
    assert.deepEqual(rimasInternas([['no', 'es', 'tener']]), [[null, null, null]]);
    const a = { clave: 'a', suave: true };
    assert.deepEqual(rimasInternas([['más', 'cuenta'], ['guardar', 'experto']]), [[a, null], [a, null]], 'dos agudas cerradas');
    assert.deepEqual(rimasInternas([['ya', 'cuenta'], ['guardar', 'experto']]), [[null, null], [null, null]], '"ya" es abierta');
    const e = { clave: 'e', suave: true };
    assert.deepEqual(rimasInternas([['agrandé', 'sombras'], ['sed', 'luna']]), [[e, null], [e, null]], 'é con ed');
    assert.deepEqual(rimasInternas([['estar', 'sombras'], ['ya', 'luna']]), [[null, null], [null, null]], '"ya" es abierta y corta');
    const ee = { clave: 'ee', suave: true };
    assert.deepEqual(rimasInternas([['encontré', 'solo'], ['protegerte', 'luna']]), [[ee, null], [ee, null]], 'é con e-e');
    assert.deepEqual(rimasInternas([['encontré', 'solo'], ['siento', 'luna']]), [[null, null], [null, null]], 'é con e-o no');
});

test('rimasInternas: respeta la distancia y no pinta de más', () => {
    const versos = [['canción'], ['nada'], ['nada'], ['corazón']];
    const o = { clave: 'o', suave: false };
    assert.deepEqual(rimasInternas(versos, 4), [[o], [null], [null], [o]], 'la misma palabra repetida no cuenta');
    assert.deepEqual(rimasInternas(versos, 3), [[null], [null], [null], [null]]);
    assert.deepEqual(rimasInternas(versos, 0), [[null], [null], [null], [null]]);
    // No cruzan el renglón vacío entre estrofas.
    assert.deepEqual(rimasInternas([['canción'], [], ['corazón']]), [[null], [], [null]]);
    // Palabras átonas ("con" / "son") no se pintan.
    assert.deepEqual(rimasInternas([['con', 'son', 'mar']]), [[null, null, null]]);
    assert.deepEqual(rimasInternas([]), []);
});

test('palabras en inglés: riman como suenan', () => {
    asonan('face', 'vez');
    asonan('mail', 'él');
    riman('face', 'reis');
    assert.equal(analizarPalabra('Face').nucleos.length, 1);
    assert.equal(claveAsonante('baby'), 'ei');
});

test('rimasInternas: una asonante del medio se suma a una consonante del medio ("solo" / "todos modos")', () => {
    const suave = clave => ({ clave, suave: true });
    assert.deepEqual(rimasInternas([['con', 'mi', 'música', 'y', 'solo', 'el', 'mes'], ['te', 'busqué', 'de', 'todos', 'modos', 'otra', 'vez']])[0][4], suave('oo'));
    // Si "todos" no rimara consonante con nada, "solo" quedaría sin pintar.
    assert.deepEqual(rimasInternas([['y', 'solo', 'el', 'mes'], ['de', 'todos', 'otra', 'vez']])[0][1], null);
});
