import { jsonResponse } from '../_utils/store.js';
import { verifySessionToken } from '../_utils/session.js';
import { uploadFile } from '../_utils/onedrive.js';

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: 'JSON inválido' });
  }

  const { token, regiao, conteudo } = body;

  const payload = await verifySessionToken(env, token);
  if (!payload) {
    return jsonResponse(401, { error: 'Sessão inválida ou expirada. Faça login novamente.' });
  }

  if (!regiao || !conteudo) {
    return jsonResponse(400, { error: 'Dados incompletos' });
  }

  const dataFmt = new Date().toISOString().slice(0, 10); // AAAA-MM-DD
  const nomeArquivo = `${regiao}_${dataFmt}.json`;

  try {
    await uploadFile(env, nomeArquivo, conteudo);
  } catch (err) {
    return jsonResponse(500, { error: err.message });
  }

  return jsonResponse(200, { ok: true, nomeArquivo });
}
