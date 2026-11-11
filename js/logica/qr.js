// Un QR propio, chico, para el código de «Métrica web» (sin librerías): modo byte, corrección M
// y versiones 1 a 10 (hasta 213 bytes; el de Métrica tiene unos 135). Sigue la norma ISO/IEC 18004.
// Devuelve una matriz de booleanos (true = cuadradito oscuro) sin el margen blanco.

const ECC_POR_BLOQUE = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const BLOQUES = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const FORMATO_M = 0; // los dos bits de la corrección M

const bit = (x, i) => ((x >>> i) & 1) !== 0;

function modulosDeDatos(version) {
    let total = (16 * version + 128) * version + 64;
    if (version >= 2) {
        const alineaciones = Math.floor(version / 7) + 2;
        total -= (25 * alineaciones - 10) * alineaciones - 55;
        if (version >= 7) total -= 36;
    }
    return total;
}

const capacidad = version => Math.floor(modulosDeDatos(version) / 8) - ECC_POR_BLOQUE[version] * BLOQUES[version];

function multiplicar(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
        z = (z << 1) ^ ((z >>> 7) * 0x11d);
        z ^= ((y >>> i) & 1) * x;
    }
    return z;
}

function divisor(grado) {
    const resultado = new Array(grado).fill(0);
    resultado[grado - 1] = 1;
    let raiz = 1;
    for (let i = 0; i < grado; i++) {
        for (let j = 0; j < grado; j++) {
            resultado[j] = multiplicar(resultado[j], raiz);
            if (j + 1 < grado) resultado[j] ^= resultado[j + 1];
        }
        raiz = multiplicar(raiz, 0x02);
    }
    return resultado;
}

function resto(datos, div) {
    const resultado = new Array(div.length).fill(0);
    for (const b of datos) {
        const factor = b ^ resultado.shift();
        resultado.push(0);
        div.forEach((coef, i) => { resultado[i] ^= multiplicar(coef, factor); });
    }
    return resultado;
}

function conCorreccion(datos, version) {
    const bloques = BLOQUES[version], ecc = ECC_POR_BLOQUE[version];
    const crudos = Math.floor(modulosDeDatos(version) / 8);
    const cortos = bloques - crudos % bloques;
    const largoCorto = Math.floor(crudos / bloques);
    const div = divisor(ecc);
    const lista = [];
    for (let i = 0, k = 0; i < bloques; i++) {
        const dat = datos.slice(k, k + largoCorto - ecc + (i < cortos ? 0 : 1));
        k += dat.length;
        const correccion = resto(dat, div);
        if (i < cortos) dat.push(0);
        lista.push(dat.concat(correccion));
    }
    const resultado = [];
    for (let i = 0; i < lista[0].length; i++) {
        lista.forEach((bloque, j) => {
            if (i !== largoCorto - ecc || j >= cortos) resultado.push(bloque[i]);
        });
    }
    return resultado;
}

function posicionesDeAlineacion(version, tamano) {
    if (version === 1) return [];
    const cantidad = Math.floor(version / 7) + 2;
    const paso = Math.ceil((version * 4 + 4) / (cantidad * 2 - 2)) * 2;
    const resultado = [6];
    for (let pos = tamano - 7; resultado.length < cantidad; pos -= paso) resultado.splice(1, 0, pos);
    return resultado;
}

const MASCARAS = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    x => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => x * y % 2 + x * y % 3 === 0,
    (x, y) => (x * y % 2 + x * y % 3) % 2 === 0,
    (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0,
];

// Cuánto «molesta» al lector una máscara (reglas 1, 2 y 4 de la norma; la 3 casi no cambia la elección).
function penalidad(m) {
    const n = m.length;
    let total = 0;
    for (let y = 0; y < n; y++) {
        for (const leer of [x => m[y][x], x => m[x][y]]) {
            let corrida = 1;
            for (let x = 1; x <= n; x++) {
                if (x < n && leer(x) === leer(x - 1)) corrida++;
                else {
                    if (corrida >= 5) total += corrida - 2;
                    corrida = 1;
                }
            }
        }
    }
    for (let y = 0; y < n - 1; y++) {
        for (let x = 0; x < n - 1; x++) {
            const c = m[y][x];
            if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) total += 3;
        }
    }
    const oscuros = m.flat().filter(Boolean).length;
    total += Math.floor(Math.abs(oscuros * 20 - n * n * 10) / (n * n)) * 10;
    return total;
}

/** El QR del texto, como matriz de filas (true = oscuro). Null si no entra en la versión 10. */
export function generarQR(texto) {
    const bytes = [...new TextEncoder().encode(texto)];
    let version = 1;
    while (version <= 10 && 4 + (version <= 9 ? 8 : 16) + bytes.length * 8 > capacidad(version) * 8) version++;
    if (version > 10) return null;

    // Los datos: modo byte (0100), largo, bytes, fin y relleno.
    const bits = [];
    const sumar = (valor, largo) => { for (let i = largo - 1; i >= 0; i--) bits.push(bit(valor, i) ? 1 : 0); };
    sumar(4, 4);
    sumar(bytes.length, version <= 9 ? 8 : 16);
    bytes.forEach(b => sumar(b, 8));
    const lugar = capacidad(version) * 8;
    sumar(0, Math.min(4, lugar - bits.length));
    sumar(0, (8 - bits.length % 8) % 8);
    for (let relleno = 0xec; bits.length < lugar; relleno ^= 0xec ^ 0x11) sumar(relleno, 8);
    const datos = [];
    for (let i = 0; i < bits.length; i += 8) datos.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    const palabras = conCorreccion(datos, version);

    const tamano = version * 4 + 17;
    const modulos = Array.from({ length: tamano }, () => new Array(tamano).fill(false));
    const fijo = Array.from({ length: tamano }, () => new Array(tamano).fill(false));
    const poner = (x, y, oscuro) => { modulos[y][x] = oscuro; fijo[y][x] = true; };

    for (let i = 0; i < tamano; i++) {
        poner(6, i, i % 2 === 0);
        poner(i, 6, i % 2 === 0);
    }
    for (const [cx, cy] of [[3, 3], [tamano - 4, 3], [3, tamano - 4]]) {
        for (let dy = -4; dy <= 4; dy++) {
            for (let dx = -4; dx <= 4; dx++) {
                const x = cx + dx, y = cy + dy, dist = Math.max(Math.abs(dx), Math.abs(dy));
                if (x >= 0 && x < tamano && y >= 0 && y < tamano) poner(x, y, dist !== 2 && dist !== 4);
            }
        }
    }
    const alineaciones = posicionesDeAlineacion(version, tamano);
    const ultima = alineaciones.length - 1;
    alineaciones.forEach((ax, i) => alineaciones.forEach((ay, j) => {
        if ((i === 0 && j === 0) || (i === 0 && j === ultima) || (i === ultima && j === 0)) return;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) poner(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));

    const ponerFormato = mascara => {
        const dato = (FORMATO_M << 3) | mascara;
        let rem = dato;
        for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
        const f = ((dato << 10) | rem) ^ 0x5412;
        for (let i = 0; i <= 5; i++) poner(8, i, bit(f, i));
        poner(8, 7, bit(f, 6));
        poner(8, 8, bit(f, 7));
        poner(7, 8, bit(f, 8));
        for (let i = 9; i < 15; i++) poner(14 - i, 8, bit(f, i));
        for (let i = 0; i < 8; i++) poner(tamano - 1 - i, 8, bit(f, i));
        for (let i = 8; i < 15; i++) poner(8, tamano - 15 + i, bit(f, i));
        poner(8, tamano - 8, true);
    };
    ponerFormato(0);
    if (version >= 7) {
        let rem = version;
        for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
        const v = (version << 12) | rem;
        for (let i = 0; i < 18; i++) {
            const a = tamano - 11 + i % 3, b = Math.floor(i / 3);
            poner(a, b, bit(v, i));
            poner(b, a, bit(v, i));
        }
    }

    // Las palabras en zigzag, de a dos columnas, de derecha a izquierda.
    let i = 0;
    for (let derecha = tamano - 1; derecha >= 1; derecha -= 2) {
        if (derecha === 6) derecha = 5;
        for (let vert = 0; vert < tamano; vert++) {
            for (let j = 0; j < 2; j++) {
                const x = derecha - j;
                const subiendo = ((derecha + 1) & 2) === 0;
                const y = subiendo ? tamano - 1 - vert : vert;
                if (!fijo[y][x] && i < palabras.length * 8) {
                    modulos[y][x] = bit(palabras[i >>> 3], 7 - (i & 7));
                    i++;
                }
            }
        }
    }

    // La máscara que menos molesta.
    let mejor = null;
    MASCARAS.forEach((condicion, mascara) => {
        const prueba = modulos.map((fila, y) => fila.map((oscuro, x) => (!fijo[y][x] && condicion(x, y)) ? !oscuro : oscuro));
        ponerFormatoEn(prueba, mascara, tamano);
        const puntos = penalidad(prueba);
        if (!mejor || puntos < mejor.puntos) mejor = { puntos, prueba };
    });
    return mejor.prueba;
}

function ponerFormatoEn(m, mascara, tamano) {
    const dato = (FORMATO_M << 3) | mascara;
    let rem = dato;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const f = ((dato << 10) | rem) ^ 0x5412;
    const poner = (x, y, oscuro) => { m[y][x] = oscuro; };
    for (let i = 0; i <= 5; i++) poner(8, i, bit(f, i));
    poner(8, 7, bit(f, 6));
    poner(8, 8, bit(f, 7));
    poner(7, 8, bit(f, 8));
    for (let i = 9; i < 15; i++) poner(14 - i, 8, bit(f, i));
    for (let i = 0; i < 8; i++) poner(tamano - 1 - i, 8, bit(f, i));
    for (let i = 8; i < 15; i++) poner(8, tamano - 15 + i, bit(f, i));
    poner(8, tamano - 8, true);
}

/** El QR como SVG (cuadraditos de 1, con 4 de margen), para ponerlo en un <img> o adentro de la página. */
export function qrSVG(texto, { oscuro = '#000', claro = '#fff' } = {}) {
    const m = generarQR(texto);
    if (!m) return '';
    const n = m.length + 8;
    let camino = '';
    m.forEach((fila, y) => fila.forEach((o, x) => { if (o) camino += `M${x + 4} ${y + 4}h1v1h-1z`; }));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges">`
        + `<rect width="${n}" height="${n}" fill="${claro}"/><path d="${camino}" fill="${oscuro}"/></svg>`;
}
