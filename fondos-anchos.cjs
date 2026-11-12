// Arma las versiones anchas de los temas de la libreta para la computadora (pedido de Swa): fondos/anchos/*.svg,
// de 1170×460 (tres de iPhone). A la derecha va la ilustración tal cual; a la izquierda, la misma escena
// espejada y sin lo que es único (la luna, el rayo, la sombrilla...), así el paisaje sigue a lo ancho sin
// repetir lo que se nota. Los temas que son un objeto solo (vinilo, café...) no tienen versión ancha.
// Cada copia se corta a su franja de 390, para que lo que se pasa del borde no se sume en las uniones.
// Correr con `node fondos-anchos.cjs` después de cambiar un fondo.
const fs = require('fs');
const path = require('path');

// Para cada tema ancho: lo que se saca de las copias de los costados (líneas que contienen esto).
const SIN_REPETIR = {
    aurora: [],
    bosque: ['r="26" fill="#e9fff2"'],
    arena: ['fill="url(#g1)"', 'r="52"', 'stroke="#ff9d5c"', 'rotate(12 290 400)', 'fill="#ff8a70"'],
    escenario: ['url(#h1)', 'url(#h2)', 'url(#g3)', '<g stroke="#f7edf5"', 'rotate(33 232 280)'],
    galaxia: ['rotate(-18 215 360)', 'rotate(24 90 200)'],
    neon: ['fill="url(#g1)"', '<g fill="none" stroke-linecap'],
    postal: ['translate(300 342)', 'translate(214 372)', '<g fill="none" stroke="#2b2a33"', '<g stroke="#2b2a33"', 'M40 300l8 4'],
    pizarron: ['M40 262v44', 'M116 262', 'M236 300', 'M324 250', 'M44 366', 'M112 392', 'M270 366', 'M316 336', 'M196 286', 'x="282" y="414"'],
    cielo: ['stroke="#1b2c40"', 'rotate(-24)'],
    marea: ['fill="url(#g1)"', 'fill="#cfe6ee"', 'translate(96 352)'],
    madrugada: ['fill="url(#g1)"', 'fill="#eef1ff"', 'fill="#ff5d6e"'],
    tormenta: ['fill="url(#g1)"', 'fill="#ffe98a"', 'stroke="#fff" stroke-width="1.4"'],
    menta: [],
    ondas: [],
    terrazo: [],
    cuadriculado: ['M40 340h50', 'M150 300h78', 'M156 282', 'cx="189" cy="313"', 'M300 282', 'M250 420', 'M36 430', 'M330 380', 'rotate(38 150 420)'],
    acuarela: ['rotate(-38 250 330)'],
    partitura: ['fill="url(#g1)"', '<ellipse cx='],
};

// El contenido de adentro del <svg>, sin las líneas de `sacar` (un <g> de varias líneas se saca entero).
function adentro(svg, sacar = []) {
    const lineas = svg.trim().split('\n').slice(1, -1);
    const quedan = [];
    for (let i = 0; i < lineas.length; i++) {
        const linea = lineas[i];
        if (!sacar.some(s => linea.includes(s))) { quedan.push(linea); continue; }
        // Un grupo que se abre y no se cierra en la misma línea: hasta su </g>, con la misma sangría.
        if (/^\s*<g[\s>]/.test(linea) && !linea.includes('</g>')) {
            const cierre = linea.match(/^\s*/)[0] + '</g>';
            while (i + 1 < lineas.length && lineas[i + 1] !== cierre) i++;
            i++;
        }
    }
    return quedan.join('\n');
}

fs.mkdirSync(path.join(__dirname, 'fondos/anchos'), { recursive: true });
for (const [tema, sacar] of Object.entries(SIN_REPETIR)) {
    const svg = fs.readFileSync(path.join(__dirname, `fondos/${tema}.svg`), 'utf8');
    // Lo desenfocado que cruza las uniones (la aurora): se desenfoca una vez sobre las tres copias juntas;
    // cortado por copia quedaba una raya en cada unión.
    const borrosas = svg.split('\n').filter(l => /^\s*<path[^>]*filter="url\(#b\)"/.test(l)).map(l => l.replace(' filter="url(#b)"', ''));
    const sinBorrosas = texto => texto.split('\n').filter(l => !/^\s*<path[^>]*filter="url\(#b\)"/.test(l)).join('\n');
    const tres = (izquierda, derecha) => `<g clip-path="url(#franja)">
${izquierda}
</g>
<g transform="translate(780 0) scale(-1 1)" clip-path="url(#franja)">
${izquierda}
</g>
<g transform="translate(780 0)" clip-path="url(#franja)">
${derecha}
</g>`;
    const costado = adentro(svg, sacar);
    const ancho = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1170 460">
<defs><clipPath id="franja"><rect x="-0.5" y="-20" width="391" height="500"/></clipPath>
<filter id="borroso" x="-5%" y="-30%" width="110%" height="160%"><feGaussianBlur stdDeviation="5"/></filter></defs>
${borrosas.length ? `<g filter="url(#borroso)">\n${tres(borrosas.join('\n'), borrosas.join('\n'))}\n</g>` : ''}
${tres(sinBorrosas(costado), sinBorrosas(adentro(svg)))}
</svg>
`;
    fs.writeFileSync(path.join(__dirname, `fondos/anchos/${tema}.svg`), ancho);
}
console.log(`${Object.keys(SIN_REPETIR).length} fondos anchos en fondos/anchos/`);
