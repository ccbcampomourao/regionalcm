import { jsonResponse } from '../_utils/store.js';
import { verifySessionToken } from '../_utils/session.js';

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: 'JSON inválido' });
  }

  const { token, list } = body;

  const payload = await verifySessionToken(env, token);
  if (!payload) {
    return jsonResponse(401, { ok: false, error: 'Sessão inválida ou expirada' });
  }

  // Admin tem acesso liberado a qualquer lista.
  if (payload.role === 'admin') {
    return jsonResponse(200, { ok: true, role: 'admin' });
  }

  if (payload.list !== list) {
    return jsonResponse(403, { ok: false, error: 'Sem permissão para esta lista' });
  }

  return jsonResponse(200, { ok: true, role: 'padrao' });
}
