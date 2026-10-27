// EAN-13 check digit and validation.

/** Computes the check digit from the first 12 digits. */
export function ean13CheckDigit(twelveDigits) {
  if (!/^[0-9]{12}$/.test(twelveDigits)) {
    throw new Error(`Expected 12 digits, got "${twelveDigits}"`);
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = Number(twelveDigits[i]);
    sum += i % 2 === 0 ? d : d * 3;
  }
  return String((10 - (sum % 10)) % 10);
}

/** True if the number has 13 digits and a correct check digit. */
export function isValidEan13(number) {
  return /^[0-9]{13}$/.test(number) && ean13CheckDigit(number.slice(0, 12)) === number[12];
}
