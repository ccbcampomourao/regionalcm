import { jsonResponse } from '../_utils/store.js';
import { verifySessionToken } from '../_utils/session.js';
import { downloadFile } from '../_utils/onedrive.js';

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

  if (!body.itemId) {
    return jsonResponse(400, { error: 'Arquivo não informado' });
  }

  try {
    const conteudo = await downloadFile(env, body.itemId);
    return jsonResponse(200, { ok: true, conteudo });
  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
}
