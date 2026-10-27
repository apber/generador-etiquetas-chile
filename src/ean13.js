// Dígito verificador y validación de códigos EAN-13.

/** Calcula el dígito verificador a partir de los 12 primeros dígitos. */
export function digitoVerificadorEan13(doceDigitos) {
  if (!/^[0-9]{12}$/.test(doceDigitos)) {
    throw new Error(`Se esperaban 12 dígitos y llegó "${doceDigitos}"`);
  }
  let suma = 0;
  for (let i = 0; i < 12; i++) {
    const d = Number(doceDigitos[i]);
    suma += i % 2 === 0 ? d : d * 3;
  }
  return String((10 - (suma % 10)) % 10);
}

/** true si el número tiene 13 dígitos y su dígito verificador es correcto. */
export function esEan13Valido(numero) {
  return /^[0-9]{13}$/.test(numero) && digitoVerificadorEan13(numero.slice(0, 12)) === numero[12];
}
