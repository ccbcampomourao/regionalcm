import { jsonResponse } from '../_utils/store.js';
import { verifySessionToken } from '../_utils/session.js';
import { listFiles } from '../_utils/onedrive.js';

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: 'JSON inválido' });
  }

  const payload = await verifySessionToken(env, body.token);
  if (!payload) {
    return jsonResponse(401, { error: 'Sessão inválida ou expirada. Faça login novamente.' });
  }

  try {
    const arquivos = await listFiles(env);
    return jsonResponse(200, { ok: true, arquivos: arquivos.map((f) => ({ id: f.id, name: f.name })) });
  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
}
