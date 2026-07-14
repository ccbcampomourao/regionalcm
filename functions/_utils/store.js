// Listas permitidas -> URL de destino depois do login.
export const LISTAS = {
  campomourao: '/listacampomourao.html',
  cianorte: '/listacianorte.html',
  ubirata: '/listaubirata.html',
};

// Rótulos amigáveis das listas, usados nas telas de admin e seleção de listas.
export const LISTA_LABELS = {
  campomourao: 'Campo Mourão',
  cianorte: 'Cianorte',
  ubirata: 'Ubiratã',
};

export const DEFAULT_ADMIN_EMAIL = 'bruno07dacosta@gmail.com';
export const DEFAULT_ADMIN_PASSWORD = 'Bruno123';

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function jsonResponse(statusCode, data) {
  return new Response(JSON.stringify(data), {
    status: statusCode,
    headers: { 'Content-Type': 'application/json' },
  });
}

// env.USERS_KV é o binding do namespace KV configurado no Cloudflare Pages.
export async function getUser(env, email) {
  const raw = await env.USERS_KV.get(email);
  return raw ? JSON.parse(raw) : null;
}

export async function setUser(env, email, record) {
  await env.USERS_KV.put(email, JSON.stringify(record));
}

export async function listUsers(env) {
  const users = [];
  let cursor;
  while (true) {
    const page = await env.USERS_KV.list(cursor ? { cursor } : {});
    for (const key of page.keys) {
      const raw = await env.USERS_KV.get(key.name);
      if (raw) users.push(JSON.parse(raw));
    }
    if (page.list_complete) break;
    cursor = page.cursor;
  }
  return users;
}
