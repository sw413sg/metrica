import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { APPLE_RAIZ, autofirmaDeRaiz, parsearCert, verificarJws } from '../worker/src/verificar.js';
import { crearCadena, romperFirma } from './cadena-prueba.js';

test('la raíz embebida es Apple Root CA - G3 y la autofirma cierra', async () => {
    const texto = new TextDecoder().decode(APPLE_RAIZ);
    assert.ok(texto.includes('Apple Root CA - G3'));
    assert.equal(createHash('sha256').update(APPLE_RAIZ).digest('hex'), '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179');
    const cert = parsearCert(APPLE_RAIZ);
    assert.equal(cert.curva, 'P-384');
    assert.equal(cert.hash, 'SHA-384');
    assert.equal(cert.ca, true);
    assert.equal(await autofirmaDeRaiz(), true);
});

test('un JWS firmado por una CA de prueba verifica, y uno con la firma rota no', async () => {
    const cadena = crearCadena();
    const ahora = Date.now();
    const token = cadena.jws({ transactionId: '42', originalTransactionId: '42' });
    const bueno = await verificarJws(token, { raiz: cadena.raizDer, bundleId: cadena.bundleId, ahora });
    assert.equal(bueno.ok, true);
    assert.equal(bueno.transaccion.transactionId, '42');
    const malo = await verificarJws(romperFirma(token), { raiz: cadena.raizDer, bundleId: cadena.bundleId, ahora });
    assert.deepEqual(malo, { ok: false, error: 'firma' });
});

test('una cadena firmada por otra raíz no llega a la raíz de confianza', async () => {
    const nuestra = crearCadena();
    const ajena = crearCadena();
    const token = ajena.jws();
    const contraApple = await verificarJws(token, { bundleId: ajena.bundleId, ahora: Date.now() });
    const contraOtra = await verificarJws(token, { raiz: nuestra.raizDer, bundleId: ajena.bundleId, ahora: Date.now() });
    assert.deepEqual(contraApple, { ok: false, error: 'firma' });
    assert.deepEqual(contraOtra, { ok: false, error: 'firma' });
});

test('un certificado vencido no verifica, aunque el payload diga que la suscripción sigue', async () => {
    const cadena = crearCadena({ notAfter: Date.UTC(2020, 0, 1) });
    const token = cadena.jws({ expiresDate: Date.now() + 86_400_000 });
    const r = await verificarJws(token, { raiz: cadena.raizDer, bundleId: cadena.bundleId, ahora: Date.now() });
    assert.deepEqual(r, { ok: false, error: 'firma' });
});

test('la raíz P-384 (como Apple Root CA - G3) también cierra la cadena de una hoja P-256', async () => {
    const cadena = crearCadena({ curvaRaiz: 'P-384', curvaIntermedia: 'P-384' });
    const token = cadena.jws({ productId: 'metrica.ia.mas5', type: 'Consumable', transactionId: '55', originalTransactionId: '55' });
    const r = await verificarJws(token, { raiz: cadena.raizDer, bundleId: cadena.bundleId, ahora: Date.now() });
    assert.equal(r.ok, true);
    assert.equal(r.transaccion.productId, 'metrica.ia.mas5');
});
