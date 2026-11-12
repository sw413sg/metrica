// Los cuatro temas de garabatos (Garabatos, Trazos, Apuntes y Borrador), pedido de Swa: el mosaico de
// fondos/mosaicos/ (de 390×900) se inclina y cada dibujo toma su propio giro y tamaño (y algunos no van),
// así no se nota el patrón. Arma fondos/<tema>.svg (el del celular, 390×900) y fondos/anchos/<tema>.svg
// (la compu, 2000×1200). Siempre sale igual (azar con semilla). Correr con `node fondos-garabatos.cjs`.
// El iPhone usa el mismo dibujo en PNG (Fondos.xcassets de metrica-swift, a 3x).
const fs = require('fs');
const path = require('path');

const INCLINACION = -14; // grados
const TEMAS = ['garabatos', 'trazos', 'apuntes', 'borrador'];

function azar(semilla) {
    let s = semilla >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Un <g> balanceado desde `desde` (que apunta a "<g"): devuelve dónde termina.
function finDeGrupo(texto, desde) {
    let nivel = 0;
    const re = /<g[\s>]|<\/g>/g;
    re.lastIndex = desde;
    for (let m; (m = re.exec(texto));) {
        nivel += m[0] === '</g>' ? -1 : 1;
        if (!nivel) return m.index + 4;
    }
    throw new Error('grupo sin cerrar');
}

function leer(svg) {
    const inicio = svg.indexOf('<g');
    const abre = svg.slice(inicio, svg.indexOf('>', inicio) + 1);
    const fin = finDeGrupo(svg, inicio);
    const cuerpo = svg.slice(inicio + abre.length, fin - 4);
    const dibujos = [];
    let resto = '';
    let i = 0;
    const re = /<g transform="translate\(([-\d.]+) ([-\d.]+)\) rotate\(([-\d.]+)\) scale\(([-\d.]+)\)">/y;
    while (i < cuerpo.length) {
        if (cuerpo.startsWith('<g', i)) {
            const f = finDeGrupo(cuerpo, i);
            re.lastIndex = i;
            const m = re.exec(cuerpo);
            if (m) {
                const [x, y, giro, escala] = m.slice(1, 5).map(Number);
                // Los que se repiten del otro lado para que el mosaico empalme no hacen falta.
                if (x >= 0 && x < 390 && y >= 0 && y < 900) dibujos.push({ x, y, giro, escala, adentro: cuerpo.slice(i + m[0].length, f - 4) });
            } else resto += cuerpo.slice(i, f);
            i = f;
        } else i++;
    }
    return { abre, dibujos, resto };
}

const r1 = n => Math.round(n * 10) / 10;

function escena({ abre, dibujos, resto }, ancho, alto, semilla) {
    const a = (INCLINACION * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
    const rnd = azar(semilla);
    const radio = Math.hypot(ancho, alto) / 2;
    const n = Math.ceil(radio / 390) + 1, m = Math.ceil(radio / 900) + 1;
    const partes = [];
    for (let i = -n; i <= n; i++) for (let j = -m; j <= m; j++) {
        // El relleno (puntitos y crucecitas) de cada copia del mosaico, inclinado entero.
        const ox = 390 * i - 195, oy = 900 * j - 450;
        const cx = ox * cos - oy * sin + ancho / 2, cy = ox * sin + oy * cos + alto / 2;
        const tx = 390 * i, ty = 900 * j; // el centro de esta copia, antes de inclinar
        if (Math.hypot(tx, ty) < radio + 500) {
            partes.push(`<g transform="translate(${r1(cx)} ${r1(cy)}) rotate(${INCLINACION})">${resto}</g>`);
        }
        for (const d of dibujos) {
            const px = d.x + 390 * i - 195, py = d.y + 900 * j - 450;
            const x = px * cos - py * sin + ancho / 2, y = px * sin + py * cos + alto / 2;
            const giro = INCLINACION + (rnd() * 2 - 1) * 38;
            const escala = d.escala * (0.6 + rnd() * 0.8);
            const salta = rnd() < 0.12;
            if (salta || x < -40 || y < -40 || x > ancho + 40 || y > alto + 40) continue;
            partes.push(`<g transform="translate(${r1(x)} ${r1(y)}) rotate(${r1(giro)}) scale(${Math.round(escala * 100) / 100})">${d.adentro}</g>`);
        }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ancho} ${alto}">\n  ${abre}${partes.join('')}</g>\n</svg>\n`;
}

fs.mkdirSync(path.join(__dirname, 'fondos/anchos'), { recursive: true });
TEMAS.forEach((tema, k) => {
    const mosaico = leer(fs.readFileSync(path.join(__dirname, `fondos/mosaicos/${tema}.svg`), 'utf8'));
    fs.writeFileSync(path.join(__dirname, `fondos/${tema}.svg`), escena(mosaico, 390, 900, 11 + k));
    fs.writeFileSync(path.join(__dirname, `fondos/anchos/${tema}.svg`), escena(mosaico, 2000, 1200, 101 + k));
});
console.log('Garabatos inclinados y mezclados: fondos/ y fondos/anchos/');
