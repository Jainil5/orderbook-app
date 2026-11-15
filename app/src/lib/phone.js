/* Mirrors backend CustomerIn: a mobile number is stored and matched on bare
   digits, so the UI validates the same way before it posts. */
export const PHONE_MIN = 7;
export const PHONE_MAX = 15;

export const digitsOf = (value) => String(value ?? '').replace(/\D/g, '');

export const phoneOk = (value) => {
  const digits = digitsOf(value);
  return digits.length >= PHONE_MIN && digits.length <= PHONE_MAX;
};
