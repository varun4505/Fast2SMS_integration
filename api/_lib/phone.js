function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeIndiaPhoneTo10(value) {
  const digits = onlyDigits(value);

  // Accept: 10 digits, +91 + 10 digits, or 91 + 10 digits.
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);

  return '';
}

function maskPhone10(phone10) {
  if (!phone10 || phone10.length !== 10) return '';
  return `+91 ${phone10.slice(0, 2)}******${phone10.slice(8)}`;
}

module.exports = {
  normalizeIndiaPhoneTo10,
  maskPhone10,
};
