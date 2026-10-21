// Apariencia de la app: igual que el sistema, siempre clara o siempre oscura.
// Es aparte de los temas de la libreta. En SwiftUI: @AppStorage + .preferredColorScheme.
export const APARIENCIAS = { sistema: 'Sistema', claro: 'Claro', oscuro: 'Oscuro' };

const CLAVE = 'metrica.apariencia';

export function leerApariencia(almacen) {
    const guardada = almacen.getItem(CLAVE);
    return guardada in APARIENCIAS ? guardada : 'sistema';
}

export function elegirApariencia(almacen, apariencia) {
    if (!(apariencia in APARIENCIAS)) return leerApariencia(almacen);
    almacen.setItem(CLAVE, apariencia);
    return apariencia;
}
