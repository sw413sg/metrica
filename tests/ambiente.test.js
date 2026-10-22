import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOODS, moodDeTitulo, moodDeBeat, bpmDeTitulo, tiemposEn, brilloDeGolpe } from '../js/logica/ambiente.js';
import { CATALOGO_BEATS } from '../js/logica/freestyle.js';

test('el mood sale del título del beat', () => {
    assert.equal(moodDeTitulo('TenchnoSad_88bpm'), 'sad');
    assert.equal(moodDeTitulo('[FREE] Playboi Carti Type Beat - "RAGE"'), 'rage');
    assert.equal(moodDeTitulo('Hyperpop type beat 2024'), 'hyperpop');
    assert.equal(moodDeTitulo('Boom Bap Old School Instrumental'), 'boombap');
    assert.equal(moodDeTitulo('oldschool 90s beat'), 'boombap');
    assert.equal(moodDeTitulo('Beat de Rap Triste con Piano'), 'sad');
    assert.equal(moodDeTitulo('UK Drill Type Beat'), 'drill');
    assert.equal(moodDeTitulo('lofi hip hop para estudiar'), 'lofi');
    assert.equal(moodDeTitulo('Dembow perreo beat'), 'reggaeton');
    assert.equal(moodDeTitulo('Witt Lowry Type Beat - Rise'), 'trap');
    assert.equal(moodDeTitulo('Instrumental de rap'), 'neutro');
    assert.equal(moodDeTitulo(''), 'neutro');
});

test('gana el mood más marcado: sad trap es sad y rage trap es rage', () => {
    assert.equal(moodDeTitulo('sad trap beat'), 'sad');
    assert.equal(moodDeTitulo('rage trap beat'), 'rage');
});

test('una pista adentro de otra palabra no cuenta', () => {
    assert.equal(moodDeTitulo('Garage beat'), 'neutro');
    assert.equal(moodDeTitulo('Richard instrumental'), 'neutro');
});

test('los beats propios usan su género', () => {
    for (const beat of CATALOGO_BEATS) assert.ok(MOODS[moodDeBeat(beat)], beat.id);
    assert.equal(moodDeBeat(CATALOGO_BEATS.find(b => b.id === 'boom-bap-jazz')), 'boombap');
    assert.equal(moodDeBeat(CATALOGO_BEATS.find(b => b.id === 'trap-grave')), 'trap');
    assert.equal(moodDeBeat(null), 'neutro');
});

test('todos los moods tienen colores y partículas', () => {
    for (const [id, mood] of Object.entries(MOODS)) {
        assert.ok(mood.colores.length >= 2, id);
        assert.ok(['luciernagas', 'rayos', 'brillos', 'polvo', 'anillos'].includes(mood.particulas), id);
    }
});

test('los BPM se leen del título', () => {
    assert.equal(bpmDeTitulo('TenchnoSad_88bpm'), 88);
    assert.equal(bpmDeTitulo('Dark Trap Beat 140 BPM'), 140);
    assert.equal(bpmDeTitulo('Beat 2024'), null);
    assert.equal(bpmDeTitulo('999 bpm'), null);
});

test('el brillo late con el tiempo', () => {
    assert.equal(tiemposEn(60, 90), 90);
    assert.equal(tiemposEn(-1, 90), 0);
    assert.equal(brilloDeGolpe(0, 90), 1);
    assert.ok(brilloDeGolpe(300, 90) < brilloDeGolpe(100, 90));
    assert.ok(brilloDeGolpe(667, 90) < 0.05);
    assert.equal(brilloDeGolpe(-5, 90), 0);
});

test('la cantidad de efectos va de 0 a 10 y arranca en 10', async () => {
    const { leerCantidadEfectos, guardarCantidadEfectos } = await import('../js/logica/ambiente.js');
    const datos = new Map();
    const almacen = { getItem: k => datos.has(k) ? datos.get(k) : null, setItem: (k, v) => datos.set(k, v) };
    assert.equal(leerCantidadEfectos(almacen), 10);
    assert.equal(guardarCantidadEfectos(almacen, 0), 0);
    assert.equal(leerCantidadEfectos(almacen), 0);
    assert.equal(guardarCantidadEfectos(almacen, '4'), 4);
    assert.equal(guardarCantidadEfectos(almacen, 15), 10);
    assert.equal(guardarCantidadEfectos(almacen, -3), 0);
    almacen.setItem('metrica.efectos', 'cualquiera');
    assert.equal(leerCantidadEfectos(almacen), 10);
});

test('los kicks se encuentran en el audio y caen en su paso', async () => {
    const { pasosDeBombo } = await import('../js/logica/ambiente.js');
    // Un compás a 120 BPM (2 s): kicks de 55 Hz en los pasos 0, 6 y 10, y un hi-hat agudo en el 4.
    const frecuencia = 8000, bpm = 120, segundosPorPaso = 60 / bpm / 4;
    const muestras = new Float32Array(frecuencia * 2);
    const sonar = (paso, hz, volumen, dura) => {
        const inicio = Math.round(paso * segundosPorPaso * frecuencia);
        for (let i = 0; i < dura * frecuencia; i++) {
            muestras[inicio + i] += volumen * Math.sin(2 * Math.PI * hz * i / frecuencia) * Math.exp(-i / (dura * frecuencia / 4));
        }
    };
    for (const paso of [0, 6, 10]) sonar(paso, 55, 0.9, 0.2);
    sonar(4, 3000, 0.9, 0.05);
    assert.deepEqual(pasosDeBombo(muestras, frecuencia, bpm), [0, 6, 10]);
    assert.deepEqual(pasosDeBombo(new Float32Array(100), frecuencia, bpm), []);
    assert.deepEqual(pasosDeBombo(null, frecuencia, bpm), []);
});
