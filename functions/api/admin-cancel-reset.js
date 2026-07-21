import { getUser, setUser, jsonResponse, normalizeEmail } from '../_utils/store.js';
import { getAdminPayload } from '../_utils/adminAuth.js';

export async function onRequestPost({ request, env }) {
  const admin = await getAdminPayload(env, request);
  if (!admin) {
    return jsonResponse(401, { error: 'Não autorizado. Faça login com uma conta ADMIN.' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: 'JSON inválido' });
  }

  const email = normalizeEmail(body.email);
  const record = await getUser(env, email);
  if (!record) {
    return jsonResponse(404, { error: 'Usuário não encontrado' });
  }

  record.passwordReset = 'none';
  await setUser(env, email, record);

  return jsonResponse(200, { ok: true });
}
