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
