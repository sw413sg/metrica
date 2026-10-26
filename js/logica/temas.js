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
