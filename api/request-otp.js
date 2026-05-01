const { getDb } = require('./_lib/mongo');
const { normalizeIndiaPhoneTo10, maskPhone10 } = require('./_lib/phone');
const { randomOtp6, hashOtp } = require('./_lib/otp');
const { sendJson, readJson, methodNotAllowed } = require('./_lib/http');

const FAST2SMS_URL = 'https://www.fast2sms.com/dev/bulkV2';

function getEnv(name) {
  const v = process.env[name];
  return v && String(v).trim() ? String(v).trim() : '';
}

function validateFlow(flow) {
  return flow === 'login' || flow === 'signup';
}

function flowToEnum(flow) {
  return flow === 'login' ? 'LOGIN' : 'SIGNUP';
}

function nowPlusMinutes(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

async function sendFast2SmsOtp({ apiKey, phone10, otp }) {
  const message = `Your OTP is ${otp}. Valid for 5 minutes.`;

  const res = await fetch(FAST2SMS_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      authorization: apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      route: 'q',
      message,
      qnumbers: phone10,
    }),
  });

  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    // keep as null
  }

  if (!res.ok) {
    const msg = data?.message || data?.error || `Fast2SMS error (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');

  const apiKey = getEnv('FAST2SMS_API_KEY');
  if (!apiKey) return sendJson(res, 500, { error: 'Server not configured: FAST2SMS_API_KEY missing' });

  let body;
  try {
    body = await readJson(req);
  } catch {
    return sendJson(res, 400, { error: 'Invalid JSON body' });
  }

  const phoneRaw = body?.phone;
  const flow = body?.flow;
  const name = body?.name;

  if (!validateFlow(flow)) return sendJson(res, 400, { error: 'Invalid flow. Use login or signup.' });

  const phone10 = normalizeIndiaPhoneTo10(phoneRaw);
  if (!phone10) return sendJson(res, 400, { error: 'Invalid phone. Use +91XXXXXXXXXX or 10 digits.' });

  if (flow === 'signup') {
    const cleanName = String(name || '').trim();
    if (!cleanName) return sendJson(res, 400, { error: 'Name is required for signup.' });
  }

  const flowEnum = flowToEnum(flow);

  const db = await getDb();
  const usersCol = db.collection('users');
  const otpCol = db.collection('otp_requests');

  // Enforce user existence rules
  const user = await usersCol.findOne({ phone: phone10 }, { projection: { name: 1, phone: 1 } });
  if (flow === 'login' && !user) return sendJson(res, 400, { error: 'User not found. Please sign up first.' });
  if (flow === 'signup' && user) return sendJson(res, 400, { error: 'Phone already registered. Please log in.' });

  // Cooldown: if last OTP created in last 30s and still valid/unconsumed, block.
  const now = new Date();
  const cooldownSince = new Date(Date.now() - 30 * 1000);
  const cooldownRow = await otpCol.findOne(
    {
      phone: phone10,
      flow: flowEnum,
      consumedAt: null,
      expiresAt: { $gt: now },
      createdAt: { $gte: cooldownSince },
    },
    { sort: { createdAt: -1 }, projection: { _id: 1, createdAt: 1 } }
  );

  if (cooldownRow) {
    return sendJson(res, 429, { error: 'Please wait before requesting another OTP.' });
  }

  const otp = randomOtp6();
  const otpHash = await hashOtp(otp);
  const expiresAt = nowPlusMinutes(5);

  // Persist first so we have an audit trail; if SMS send fails we mark it consumed.
  const insert = await otpCol.insertOne({
    phone: phone10,
    flow: flowEnum,
    otpHash,
    attemptCount: 0,
    expiresAt,
    consumedAt: null,
    createdAt: now,
  });

  const otpId = insert?.insertedId;

  try {
    await sendFast2SmsOtp({ apiKey, phone10, otp });
  } catch (err) {
    if (otpId) await otpCol.updateOne({ _id: otpId }, { $set: { consumedAt: new Date(), sendFailedAt: new Date() } });
    return sendJson(res, 502, { error: err.message || 'Failed to send OTP SMS' });
  }

  return sendJson(res, 200, {
    ok: true,
    phoneMasked: maskPhone10(phone10),
    expiresInSec: 300,
  });
};
