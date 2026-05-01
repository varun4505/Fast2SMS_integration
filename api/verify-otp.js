const { getDb } = require('./_lib/mongo');
const { normalizeIndiaPhoneTo10 } = require('./_lib/phone');
const { verifyOtp } = require('./_lib/otp');
const { sendJson, readJson, methodNotAllowed } = require('./_lib/http');

function validateFlow(flow) {
  return flow === 'login' || flow === 'signup';
}

function flowToEnum(flow) {
  return flow === 'login' ? 'LOGIN' : 'SIGNUP';
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');

  let body;
  try {
    body = await readJson(req);
  } catch {
    return sendJson(res, 400, { error: 'Invalid JSON body' });
  }

  const phoneRaw = body?.phone;
  const flow = body?.flow;
  const otpRaw = body?.otp;
  const name = body?.name;

  if (!validateFlow(flow)) return sendJson(res, 400, { error: 'Invalid flow. Use login or signup.' });

  const phone10 = normalizeIndiaPhoneTo10(phoneRaw);
  if (!phone10) return sendJson(res, 400, { error: 'Invalid phone. Use +91XXXXXXXXXX or 10 digits.' });

  const otp = onlyDigits(otpRaw);
  if (otp.length !== 6) return sendJson(res, 400, { error: 'Invalid OTP. Must be 6 digits.' });

  const flowEnum = flowToEnum(flow);

  const db = await getDb();
  const usersCol = db.collection('users');
  const otpCol = db.collection('otp_requests');
  const now = new Date();

  // Fetch latest active OTP
  const reqRow = await otpCol.findOne(
    {
      phone: phone10,
      flow: flowEnum,
      consumedAt: null,
      expiresAt: { $gt: now },
    },
    {
      sort: { createdAt: -1 },
      projection: { phone: 1, flow: 1, otpHash: 1, attemptCount: 1, expiresAt: 1 },
    }
  );
  if (!reqRow) return sendJson(res, 400, { error: 'OTP expired or not requested.' });

  if (Number(reqRow.attemptCount) >= 5) {
    return sendJson(res, 429, { error: 'Too many attempts. Please request a new OTP.' });
  }

  const ok = await verifyOtp(otp, reqRow.otpHash);
  if (!ok) {
    await otpCol.updateOne({ _id: reqRow._id }, { $inc: { attemptCount: 1 } });
    return sendJson(res, 400, { error: 'Incorrect OTP.' });
  }

  // Consume OTP
  await otpCol.updateOne({ _id: reqRow._id }, { $set: { consumedAt: now } });

  if (flow === 'signup') {
    const cleanName = String(name || '').trim();
    if (!cleanName) return sendJson(res, 400, { error: 'Name is required for signup.' });

    // Prevent signup if user already exists
    const existing = await usersCol.findOne({ phone: phone10 }, { projection: { _id: 1 } });
    if (existing) {
      return sendJson(res, 400, { error: 'Phone already registered. Please log in.' });
    }

    try {
      await usersCol.insertOne({ name: cleanName, phone: phone10, createdAt: now });
    } catch (e) {
      // If a unique index exists, this covers race conditions.
      if (e && (e.code === 11000 || e.codeName === 'DuplicateKey')) {
        return sendJson(res, 400, { error: 'Phone already registered. Please log in.' });
      }
      throw e;
    }

    return sendJson(res, 200, {
      ok: true,
      user: {
        name: cleanName,
        phone: `+91${phone10}`,
      },
    });
  }

  // login
  const user = await usersCol.findOne({ phone: phone10 }, { projection: { name: 1, phone: 1 } });
  if (!user) {
    return sendJson(res, 400, { error: 'User not found. Please sign up first.' });
  }

  return sendJson(res, 200, {
    ok: true,
    user: {
      name: user.name,
      phone: `+91${user.phone}`,
    },
  });
};
