const { MongoClient } = require('mongodb');
const fs = require('fs');
const os = require('os');
const path = require('path');

function getEnv(name) {
  const value = process.env[name];
  return value && String(value).trim() ? String(value).trim() : '';
}

function getDbNameFromMongoUri(uri) {
  let url;
  try {
    url = new URL(uri);
  } catch {
    return '';
  }

  const pathname = url.pathname || '';
  const fromPath = pathname.startsWith('/') ? pathname.slice(1) : pathname;
  return fromPath || '';
}

function ensurePemFileFromEnv({ pemEnvName, pemBase64EnvName, fileName }) {
  const pemRaw = getEnv(pemEnvName);
  const pem = pemRaw ? pemRaw.replace(/\\n/g, '\n') : '';
  const pemBase64 = getEnv(pemBase64EnvName);

  if (!pem && !pemBase64) return '';

  const dir = os.tmpdir();
  const filePath = path.join(dir, fileName);

  if (!fs.existsSync(filePath)) {
    const content = pem || Buffer.from(pemBase64, 'base64').toString('utf8');
    fs.writeFileSync(filePath, content, 'utf8');
  }

  return filePath;
}

function getMongoClientOptions() {
  const allowInvalidCerts = getEnv('MONGODB_TLS_ALLOW_INVALID_CERTS') === '1';
  const allowInvalidHostnames = getEnv('MONGODB_TLS_ALLOW_INVALID_HOSTNAMES') === '1';

  const tlsCAFile = ensurePemFileFromEnv({
    pemEnvName: 'MONGODB_TLS_CA',
    pemBase64EnvName: 'MONGODB_TLS_CA_BASE64',
    fileName: 'mongodb-ca.pem',
  });

  /** @type {import('mongodb').MongoClientOptions} */
  const options = {
    serverSelectionTimeoutMS: 10_000,
  };

  if (tlsCAFile) options.tlsCAFile = tlsCAFile;
  if (allowInvalidCerts) options.tlsAllowInvalidCertificates = true;
  if (allowInvalidHostnames) options.tlsAllowInvalidHostnames = true;

  return options;
}

let indexesEnsured = false;

async function ensureIndexes(db) {
  if (indexesEnsured) return;

  await db.collection('users').createIndex({ phone: 1 }, { unique: true });
  await db.collection('otp_requests').createIndex({ phone: 1, flow: 1, createdAt: -1 });
  await db.collection('otp_requests').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  indexesEnsured = true;
}

async function getClient() {
  const uri = getEnv('MONGODB_URI');
  if (!uri) throw new Error('MongoDB env vars missing: set MONGODB_URI');

  // Reuse across hot invocations.
  if (!globalThis.__mongoClientPromise) {
    const client = new MongoClient(uri, getMongoClientOptions());
    globalThis.__mongoClientPromise = client.connect();
  }

  return globalThis.__mongoClientPromise;
}

async function getDb() {
  const uri = getEnv('MONGODB_URI');
  if (!uri) throw new Error('MongoDB env vars missing: set MONGODB_URI');

  const dbFromUri = getDbNameFromMongoUri(uri);
  const dbName = getEnv('MONGODB_DB') || dbFromUri;
  if (!dbName) throw new Error('MongoDB database missing: set MONGODB_DB or include /DBNAME in MONGODB_URI');

  const client = await getClient();
  const db = client.db(dbName);
  await ensureIndexes(db);
  return db;
}

module.exports = {
  getClient,
  getDb,
};
