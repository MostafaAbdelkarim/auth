#!/usr/bin/env node
// Creates or completes the local env files with generated secrets. Idempotent:
// values that already exist are kept; only missing or empty ones are generated.
// Secrets are never printed.
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const ROOT_ENV = '.env';
const API_ENV = 'apps/api/.env';
const secret = () => randomBytes(48).toString('base64url'); // safe in URLs without escaping

function parse(file) {
  if (!existsSync(file)) return new Map();
  const entries = readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => /^[A-Z0-9_]+=/.test(line))
    .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]);
  return new Map(entries);
}

/** Sets KEY=value in a file, replacing an existing line or appending one. */
function upsert(file, key, value) {
  const content = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  const next = pattern.test(content)
    ? content.replace(pattern, line)
    : `${content}${content.endsWith('\n') || content === '' ? '' : '\n'}${line}\n`;
  writeFileSync(file, next);
}

// 1. Root .env (docker compose)
if (!existsSync(ROOT_ENV)) copyFileSync('.env.example', ROOT_ENV);
const root = parse(ROOT_ENV);
const generated = [];
for (const key of ['JWT_ACCESS_SECRET', 'MONGO_ROOT_PASSWORD', 'MONGO_APP_PASSWORD', 'SWAGGER_PASSWORD']) {
  if (!root.get(key)) {
    root.set(key, secret());
    upsert(ROOT_ENV, key, root.get(key));
    generated.push(key);
  }
}
if (!root.get('SWAGGER_USERNAME')) {
  root.set('SWAGGER_USERNAME', 'docs');
  upsert(ROOT_ENV, 'SWAGGER_USERNAME', 'docs');
}

// 2. API .env (npm run dev): kept in sync with the root secrets so both setups share one database.
if (!existsSync(API_ENV)) copyFileSync('apps/api/.env.example', API_ENV);
const appPassword = root.get('MONGO_APP_PASSWORD');
upsert(API_ENV, 'JWT_ACCESS_SECRET', root.get('JWT_ACCESS_SECRET'));
upsert(
  API_ENV,
  'MONGO_URI',
  `mongodb://app:${appPassword}@localhost:27017/easygenerator-auth?authSource=easygenerator-auth`,
);
upsert(API_ENV, 'SWAGGER_USERNAME', root.get('SWAGGER_USERNAME'));
upsert(API_ENV, 'SWAGGER_PASSWORD', root.get('SWAGGER_PASSWORD'));

console.log(
  generated.length
    ? `env: generated ${generated.join(', ')} in .env`
    : 'env: .env already complete (nothing generated)',
);
console.log(`env: ${API_ENV} synced with .env`);
console.log(
  `env: API docs login is user "${root.get('SWAGGER_USERNAME')}", password = SWAGGER_PASSWORD in .env`,
);
