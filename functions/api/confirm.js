import { getUser, setUser, jsonResponse, normalizeEmail } from '../_utils/store.js';

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: 'JSON inválido' });
  }

  const email = normalizeEmail(body.email);
  const code = String(body.code || '').trim();

  const record = await getUser(env, email);
  if (!record) {
    return jsonResponse(404, { error: 'Cadastro não encontrado' });
  }

  if (record.confirmed) {
    return jsonResponse(200, { ok: true, message: 'E-mail já estava confirmado.' });
  }

  if (!record.code || Date.now() > record.codeExpiresAt) {
    return jsonResponse(400, { error: 'Código expirado. Solicite um novo cadastro para gerar outro código.' });
  }

  if (code !== record.code) {
    return jsonResponse(400, { error: 'Código incorreto' });
  }

  record.confirmed = true;
  delete record.code;
  delete record.codeExpiresAt;

  await setUser(env, email, record);

  return jsonResponse(200, { ok: true, message: 'E-mail confirmado com sucesso!' });
}
