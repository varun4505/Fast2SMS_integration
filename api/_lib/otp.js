const bcrypt = require('bcryptjs');

function randomOtp6() {
  // 000000 - 999999, left padded
  const n = Math.floor(Math.random() * 1000000);
  return String(n).padStart(6, '0');
}

async function hashOtp(otp) {
  return bcrypt.hash(String(otp), 10);
}

async function verifyOtp(otp, hash) {
  return bcrypt.compare(String(otp), String(hash));
}

module.exports = {
  randomOtp6,
  hashOtp,
  verifyOtp,
};
