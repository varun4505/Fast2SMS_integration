function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  return JSON.parse(raw);
}

function methodNotAllowed(res, allowed) {
  res.setHeader('allow', allowed);
  sendJson(res, 405, { error: 'Method Not Allowed' });
}

module.exports = {
  sendJson,
  readJson,
  methodNotAllowed,
};
