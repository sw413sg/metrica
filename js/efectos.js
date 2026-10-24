// Luces del aro de Freestyle: resplandor que late con cada tiempo y partículas según el
// mood (luciérnagas, rayos, brillos, polvo o rombos). El canvas ocupa toda la pantalla:
// las partículas vuelan por todos lados y el resplandor queda alrededor del aro. Canvas 2D, sin librerías.
// Qué mood y cuándo late lo decide js/logica/ambiente.js. En SwiftUI: Canvas + TimelineView.
import { MOODS, brilloDeGolpe } from './logica/ambiente.js';

// Una forma por tipo: luciérnagas (puntos con halo que vagan), polvo (granitos que suben),
// rombos (giran despacio), brillos (estrellitas rápidas) y rayos (chispas que salen del aro).
// Cantidades para un canvas de 390×420; en uno más grande van más, a la misma densidad.
const CANTIDAD = { luciernagas: 26, polvo: 60, brillos: 34, rayos: 22, rombos: 16 };
const AREA_BASE = 390 * 420;

const azar = (min, max) => min + Math.random() * (max - min);

// `aro` es el elemento del círculo: de ahí salen el centro y el radio. Sin aro (Rimas)
// van solo las partículas, sin resplandor.
export function crearEfecto(canvas, aro = null) {
    const ctx = canvas.getContext('2d');
    const quieto = matchMedia('(prefers-reduced-motion: reduce)');
    let mood = MOODS.neutro;
    let bpm = 90;
    let particulas = [];
    let golpes = []; // rayos sueltos que se van apagando
    let ultimoGolpe = -Infinity, fuerzaGolpe = 1;
    let reloj = null; // () => tiempos con decimales, o null si los golpes llegan de afuera
    let ultimoTiempo = null;
    let animando = false, encendido = 0, prendido = false, antes = 0;
    let ancho = 0, alto = 0, cx = 0, cy = 0, r = 0;
    let cantidad = 1; // de 0 a 1: cuántas partículas y cuánto resplandor

    function medir() {
        const escala = devicePixelRatio || 1;
        ancho = canvas.clientWidth;
        alto = canvas.clientHeight;
        canvas.width = Math.round(ancho * escala);
        canvas.height = Math.round(alto * escala);
        ctx.setTransform(escala, 0, 0, escala, 0, 0);
        ubicarAro();
        sembrar();
    }
    // El aro puede moverse sin cambiar de tamaño (cuando aparece o se va el reproductor de
    // abajo): se vuelve a ubicar en cada cuadro, así el resplandor no queda en el lugar viejo.
    function ubicarAro() {
        if (!aro) return;
        const caja = canvas.getBoundingClientRect(), circulo = aro.getBoundingClientRect();
        cx = circulo.left + circulo.width / 2 - caja.left;
        cy = circulo.top + circulo.height / 2 - caja.top;
        r = circulo.width / 2;
    }
    const observador = new ResizeObserver(medir);
    observador.observe(canvas);
    if (aro) observador.observe(aro);

    // Las partículas andan por todo el canvas, adentro y afuera del aro.
    function nueva(desdeAbajo = false) {
        return {
            x: azar(0, ancho),
            y: desdeAbajo ? alto + 4 : azar(0, alto),
            vx: azar(-1, 1), vy: azar(-1, 1),
            tam: azar(1.2, 3.4), fase: azar(0, Math.PI * 2),
            color: mood.colores[Math.floor(Math.random() * mood.colores.length)],
        };
    }
    // Un punto en el borde del aro (de ahí salen las chispas).
    function enElAro() {
        const angulo = azar(0, Math.PI * 2);
        return { x: cx + Math.cos(angulo) * r * 1.02, y: cy + Math.sin(angulo) * r * 1.02 };
    }
    function sembrar() {
        if (!ancho) return;
        const densidad = Math.max(1, ancho * alto / AREA_BASE);
        particulas = Array.from({ length: Math.round((CANTIDAD[mood.particulas] ?? 20) * cantidad * densidad) }, () => nueva());
    }

    // Con el beat late solo el resplandor (pedido de Swa): las partículas van a su ritmo.
    function golpe(fuerza = 1) {
        ultimoGolpe = performance.now();
        fuerzaGolpe = fuerza;
        canvas.dataset.golpes = String(Number(canvas.dataset.golpes ?? 0) + 1);
    }

    // Los rayos salen sueltos, cada tanto, sin seguir el beat.
    function quizasRayo(ahora, dt) {
        if (mood.particulas !== 'rayos' || Math.random() > 0.012 * dt * cantidad) return;
        const color = mood.colores[Math.floor(Math.random() * mood.colores.length)];
        golpes.push({ tipo: 'rayo', inicio: ahora, color, puntos: rayo() });
    }

    // Rayo quebrado que sale del borde del aro hacia afuera.
    function rayo() {
        const angulo = azar(0, Math.PI * 2);
        const puntos = [];
        for (let i = 0, d = r * 0.9; i < 7; i++, d += r * 0.12) {
            const desvio = azar(-0.12, 0.12);
            puntos.push([cx + Math.cos(angulo + desvio) * d, cy + Math.sin(angulo + desvio) * d]);
        }
        return puntos;
    }

    function esOscuro() {
        const apariencia = document.documentElement.dataset.apariencia;
        if (apariencia === 'oscuro') return true;
        return apariencia !== 'claro' && matchMedia('(prefers-color-scheme: dark)').matches;
    }

    function dibujar(ahora) {
        ubicarAro();
        const dt = Math.min(64, ahora - antes) / 16.7;
        antes = ahora;
        // Con un link, los tiempos salen del reloj del tema.
        if (reloj && prendido) {
            const t = reloj();
            if (t != null) {
                const entero = Math.floor(t);
                if (ultimoTiempo !== null && entero > ultimoTiempo) golpe(entero % 4 === 0 ? 1 : 0.6);
                ultimoTiempo = entero;
            }
        }
        encendido = Math.max(0, Math.min(1, encendido + (prendido ? 0.05 : -0.04) * dt));
        ctx.clearRect(0, 0, ancho, alto);
        if (!encendido && !prendido) { animando = false; return; }
        const oscuro = esOscuro();
        ctx.globalCompositeOperation = oscuro ? 'lighter' : 'source-over';
        const brillo = brilloDeGolpe(ahora - ultimoGolpe, bpm) * fuerzaGolpe;
        // En claro, el color pesa más sobre el fondo: va más suave.
        const fuerza = encendido * (oscuro ? 1 : 0.6) * (0.3 + 0.7 * cantidad);

        // Resplandor solo afuera del aro (pedido de Swa): no se ve en el vidrio del círculo.
        // Sale del borde hacia afuera y se desvanece, como un blur.
        if (aro) {
            const halo = ctx.createRadialGradient(cx, cy, r, cx, cy, r * (1.7 + 0.25 * brillo));
            halo.addColorStop(0, conAlfa(mood.colores[0], (0.2 + 0.35 * brillo) * fuerza));
            halo.addColorStop(0.45, conAlfa(mood.colores[1], (0.06 + 0.15 * brillo) * fuerza));
            halo.addColorStop(1, conAlfa(mood.colores[1], 0));
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, ancho, alto);
            // Un poco por debajo del borde: si no, queda una línea oscura entre el vidrio y la luz.
            ctx.arc(cx, cy, Math.max(0, r - 3), 0, Math.PI * 2);
            ctx.clip('evenodd');
            ctx.fillStyle = halo;
            ctx.fillRect(0, 0, ancho, alto);
            ctx.restore();
        }

        if (!quieto.matches) {
            quizasRayo(ahora, dt);
            for (const p of particulas) moverYDibujar(p, dt);
            golpes = golpes.filter(g => dibujarGolpe(g, ahora));
        }
        ctx.globalCompositeOperation = 'source-over';
        requestAnimationFrame(dibujar);
    }

    function moverYDibujar(p, dt) {
        const v = mood.velocidad * dt;
        if (mood.particulas === 'polvo') {
            p.y -= 0.4 * v;
            p.x += Math.sin(p.fase + p.y / 30) * 0.2 * v;
        } else if (mood.particulas === 'rayos') {
            // Chispas: salen del aro hacia afuera, rápido.
            const angulo = Math.atan2(p.y - cy, p.x - cx);
            p.x += Math.cos(angulo) * 2.2 * v; p.y += Math.sin(angulo) * 2.2 * v;
        } else if (mood.particulas === 'rombos') {
            p.x += p.vx * 0.3 * v; p.y += p.vy * 0.3 * v;
        } else if (mood.particulas === 'brillos') {
            p.x += p.vx * 1.2 * v; p.y += p.vy * 1.2 * v;
            p.vx *= 0.96; p.vy *= 0.96;
            if (Math.abs(p.vx) < 0.4) { p.vx = azar(-1, 1); p.vy = azar(-1, 1); }
        } else {
            p.x += p.vx * 0.4 * v; p.y += p.vy * 0.4 * v;
            p.vx = Math.max(-1, Math.min(1, p.vx + azar(-0.05, 0.05)));
            p.vy = Math.max(-1, Math.min(1, p.vy + azar(-0.05, 0.05)));
        }
        p.fase += 0.04 * v;
        // Si se va del canvas, aparece en otro lado (el polvo, desde abajo).
        if (p.x < -10 || p.x > ancho + 10 || p.y < -10 || p.y > alto + 10) Object.assign(p, nueva(mood.particulas === 'polvo'), mood.particulas === 'rayos' ? enElAro() : {});
        const titila = 0.45 + 0.35 * Math.sin(p.fase * 3);
        // Cerca de la palabra se apagan, para que se lea.
        const cerca = Math.hypot(p.x - cx, p.y - cy) < r * 0.6 ? 0.25 : 1;
        const alfa = Math.min(1, titila * encendido * cerca);
        const tam = p.tam;
        if (mood.particulas === 'brillos') {
            ctx.fillStyle = conAlfa(p.color, alfa);
            estrella(p.x, p.y, tam * 1.6);
        } else if (mood.particulas === 'polvo') {
            // Granito de polvo, sin halo, como el ruido de un vinilo.
            ctx.fillStyle = conAlfa(p.color, alfa * 0.9);
            ctx.fillRect(p.x, p.y, tam * 0.7, tam * 0.7);
        } else if (mood.particulas === 'rayos') {
            // Chispa: un trazo corto en la dirección en que sale.
            const angulo = Math.atan2(p.y - cy, p.x - cx);
            ctx.strokeStyle = conAlfa(p.color, alfa);
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - Math.cos(angulo) * tam * 5, p.y - Math.sin(angulo) * tam * 5);
            ctx.stroke();
        } else if (mood.particulas === 'rombos') {
            // Rombo que gira despacio, solo el contorno.
            const lado = tam * 2.6;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.fase);
            ctx.strokeStyle = conAlfa(p.color, alfa);
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(0, -lado); ctx.lineTo(lado * 0.6, 0); ctx.lineTo(0, lado); ctx.lineTo(-lado * 0.6, 0);
            ctx.closePath();
            ctx.stroke();
            ctx.restore();
        } else {
            // Luciérnaga: punto con halo.
            const luz = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, tam * 4);
            luz.addColorStop(0, conAlfa(p.color, alfa));
            luz.addColorStop(1, conAlfa(p.color, 0));
            ctx.fillStyle = luz;
            ctx.fillRect(p.x - tam * 4, p.y - tam * 4, tam * 8, tam * 8);
        }
    }

    function estrella(x, y, t) {
        ctx.beginPath();
        ctx.moveTo(x, y - t * 2); ctx.lineTo(x + t * 0.4, y - t * 0.4); ctx.lineTo(x + t * 2, y);
        ctx.lineTo(x + t * 0.4, y + t * 0.4); ctx.lineTo(x, y + t * 2); ctx.lineTo(x - t * 0.4, y + t * 0.4);
        ctx.lineTo(x - t * 2, y); ctx.lineTo(x - t * 0.4, y - t * 0.4); ctx.closePath(); ctx.fill();
    }

    // false cuando ya se apagó.
    function dibujarGolpe(g, ahora) {
        const pasado = (ahora - g.inicio) / 500;
        if (pasado > 1) return false;
        ctx.strokeStyle = conAlfa(g.color, (1 - pasado) * encendido);
        ctx.lineWidth = 2;
        ctx.shadowColor = g.color; ctx.shadowBlur = 12;
        ctx.beginPath();
        g.puntos.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
        ctx.stroke();
        ctx.shadowBlur = 0;
        return true;
    }

    function animar() {
        if (animando) return;
        animando = true;
        antes = performance.now();
        requestAnimationFrame(dibujar);
    }

    return {
        // { mood, bpm, reloj }: reloj es opcional (link); sin él, los golpes llegan con golpe().
        configurar(opciones) {
            const nuevo = MOODS[opciones.mood] ?? MOODS.neutro;
            const cambia = nuevo !== mood;
            mood = nuevo;
            if (opciones.bpm) bpm = opciones.bpm;
            if (opciones.reloj !== reloj) { reloj = opciones.reloj ?? null; ultimoTiempo = null; }
            canvas.dataset.mood = Object.keys(MOODS).find(k => MOODS[k] === mood);
            if (cambia) { golpes = []; sembrar(); }
        },
        golpe,
        // De 0 a 1 (Ajustes > Freestyle). En 0 no se dibuja nada.
        cantidad(valor) {
            cantidad = Math.max(0, Math.min(1, valor));
            golpes = [];
            sembrar();
        },
        prender() {
            if (!cantidad) return this.apagar();
            prendido = true;
            if (!particulas.length) sembrar();
            animar();
        },
        apagar() { prendido = false; },
    };
}

function conAlfa(hex, alfa) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, alfa)).toFixed(3)})`;
}
