// «Dame un tema»: elige una consigna y recuerda cuáles ya se usaron.
// Sin DOM. El almacén es localStorage en la web (getItem/setItem).

const CLAVE_USADOS = 'metrica.temas-usados';

export function listarUsados(almacen) {
    try {
        const valor = JSON.parse(almacen.getItem(CLAVE_USADOS));
        return Array.isArray(valor) ? valor.filter(id => typeof id === 'string') : [];
    } catch {
        return [];
    }
}

// Anota el id para que deje de salir primero. No lo duplica.
export function marcarUsado(almacen, id) {
    const usados = listarUsados(almacen);
    if (!id || usados.includes(id)) return usados;
    const siguiente = [...usados, id];
    almacen.setItem(CLAVE_USADOS, JSON.stringify(siguiente));
    return siguiente;
}

// Primero una que no se usó. Si en el filtro ya no quedan, una usada.
// `evitar` es la que está en pantalla: no se repite si hay otra.
// `azar` devuelve un número entre 0 y 1 (en la app, Math.random).
export function elegirTema(temas, { categoria = 'todas', usados = [], evitar = null, azar = Math.random } = {}) {
    const delFiltro = !categoria || categoria === 'todas' ? temas : temas.filter(t => t.categoria === categoria);
    const pool = delFiltro.length ? delFiltro : temas;
    const frescos = pool.filter(t => !usados.includes(t.id));
    let bolsa = frescos.length ? frescos : pool;
    if (evitar && bolsa.length > 1) bolsa = bolsa.filter(t => t.id !== evitar);
    if (!bolsa.length) return null;
    const i = Math.min(bolsa.length - 1, Math.floor(azar() * bolsa.length));
    return bolsa[i];
}

const CLAVE_VISTOS = 'metrica.temas-vistos';

export function listarVistos(almacen) {
    try {
        const valor = JSON.parse(almacen.getItem(CLAVE_VISTOS));
        return Array.isArray(valor) ? valor.filter(id => typeof id === 'string') : [];
    } catch {
        return [];
    }
}

// Una al azar del filtro que todavía no se vio, y la anota como vista. Cuando se vieron
// todas las del filtro, esas se olvidan y arranca otra vuelta (pedido de Swa).
// `evitar` es la que está en pantalla: no sale dos veces seguidas.
// `sub` es la subsección: en Amor, 'desamor' muestra solo esas y sin ella quedan afuera (pedido de Swa).
export function siguienteTema(temas, almacen, { categoria = 'todas', sub = null, evitar = null, azar = Math.random } = {}) {
    const delFiltro = !categoria || categoria === 'todas' ? temas : temas.filter(t => t.categoria === categoria && (t.sub ?? null) === sub);
    const pool = delFiltro.length ? delFiltro : temas;
    if (!pool.length) return null;
    let vistos = listarVistos(almacen);
    let bolsa = pool.filter(t => !vistos.includes(t.id) && t.id !== evitar);
    if (!bolsa.length) {
        const delPool = new Set(pool.map(t => t.id));
        vistos = vistos.filter(id => !delPool.has(id));
        bolsa = pool.length > 1 ? pool.filter(t => t.id !== evitar) : pool;
    }
    const tema = bolsa[Math.min(bolsa.length - 1, Math.floor(azar() * bolsa.length))];
    almacen.setItem(CLAVE_VISTOS, JSON.stringify([...vistos, tema.id]));
    return tema;
}

// El número de la consigna dentro de su categoría (o subsección): «Amor 37 de 150», «Desamor 12 de 296».
export function numeroEnCategoria(temas, tema) {
    const deLaCategoria = temas.filter(t => t.categoria === tema.categoria && (t.sub ?? null) === (tema.sub ?? null));
    return { numero: deLaCategoria.findIndex(t => t.id === tema.id) + 1, total: deLaCategoria.length };
}
