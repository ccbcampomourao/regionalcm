// Mesmo esquema de token assinado que usávamos no Netlify, só que aqui a
// assinatura usa a Web Crypto API (crypto.subtle), que é o que roda no
// Cloudflare Workers/Pages (não tem o módulo "crypto" do Node aqui).

function toBase64Url(bytes) {
  let binary = '';
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  let normalized = str.replace(/-/g, '+').replace(/_/g, '/');
  while (normalized.length % 4 !== 0) normalized += '=';
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getHmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export async function createSessionToken(env, { email, lists = [], role = 'padrao', hoursValid = 12 }) {
  const payload = {
    email,
    lists,
    role,
    exp: Date.now() + hoursValid * 60 * 60 * 1000,
  };
  const payloadB64 = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await getHmacKey(env.SESSION_SECRET);
  const signatureBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  const signatureB64 = toBase64Url(signatureBuf);
  return `${payloadB64}.${signatureB64}`;
}

export async function verifySessionToken(env, token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;

  const [payloadB64, signatureB64] = token.split('.');
  if (!payloadB64 || !signatureB64) return null;

  const key = await getHmacKey(env.SESSION_SECRET);
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    fromBase64Url(signatureB64),
    new TextEncoder().encode(payloadB64)
  );
  if (!valid) return null;

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64)));
  } catch {
    return null;
  }

  if (!payload.exp || Date.now() > payload.exp) return null;

  return payload;
}
