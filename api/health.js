const { getDb } = require('./_lib/mongo');
const { sendJson, methodNotAllowed } = require('./_lib/http');

module.exports = async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, 'GET');

  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    const hasFast2Sms = Boolean(process.env.FAST2SMS_API_KEY);
    return sendJson(res, 200, { ok: true, db: true, fast2smsKeyConfigured: hasFast2Sms });
  } catch (e) {
    return sendJson(res, 500, { ok: false, error: e?.message || 'Health check failed' });
  }
};
