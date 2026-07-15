import { jsonResponse, LISTAS } from '../_utils/store.js';
import { verifySessionToken } from '../_utils/session.js';
import { carregarListaJSON } from '../_utils/listasStore.js';

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: 'JSON inválido' });
  }

  const { token, regiao, nome } = body;

  const payload = await verifySessionToken(env, token);
  if (!payload) {
    return jsonResponse(401, { error: 'Sessão inválida ou expirada. Faça login novamente.' });
  }

  if (!regiao || !LISTAS[regiao]) {
    return jsonResponse(400, { error: 'Lista inválida' });
  }

  const temAcesso = payload.role === 'admin' || (Array.isArray(payload.lists) && payload.lists.includes(regiao));
  if (!temAcesso) {
    return jsonResponse(403, { error: 'Sem permissão para esta lista' });
  }

  if (!nome) {
    return jsonResponse(400, { error: 'Arquivo não informado' });
  }

  try {
    const conteudo = await carregarListaJSON(env, regiao, nome);
    return jsonResponse(200, { ok: true, conteudo });
  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }
}
