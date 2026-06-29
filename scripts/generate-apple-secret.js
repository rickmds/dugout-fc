const crypto = require('crypto');
const fs = require('fs');

const TEAM_ID = '5U6J5AR2B4';
const KEY_ID = 'JUDLLUSZR5';
const CLIENT_ID = 'app.dugoutfc.signin';
const KEY_PATH = process.argv[2] || `${process.env.HOME}/Downloads/AuthKey_${KEY_ID}.p8`;

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

const privateKey = fs.readFileSync(KEY_PATH, 'utf8');

const now = Math.floor(Date.now() / 1000);
const sixMonths = 60 * 60 * 24 * 180;

const header = { alg: 'ES256', kid: KEY_ID };
const payload = {
  iss: TEAM_ID,
  iat: now,
  exp: now + sixMonths,
  aud: 'https://appleid.apple.com',
  sub: CLIENT_ID,
};

const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;

const signer = crypto.createSign('SHA256');
signer.update(signingInput);
signer.end();

const derSignature = signer.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' });
const jwtSignature = derSignature
  .toString('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');

console.log(`${signingInput}.${jwtSignature}`);
console.log(`\nExpires: ${new Date((now + sixMonths) * 1000).toISOString()}`);
