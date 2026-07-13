import { getUser, jsonResponse, normalizeEmail, LISTAS } from '../_utils/store.js';
import { verifyPassword } from '../_utils/password.js';
import { createSessionToken } from '../_utils/session.js';
import { ensureDefaultAdmin } from '../_utils/bootstrapAdmin.js';

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: 'JSON inválido' });
  }

  await ensureDefaultAdmin(env);

  const email = normalizeEmail(body.email);
  const { password } = body;

  const record = await getUser(env, email);
  if (!record) {
    return jsonResponse(401, { error: 'E-mail ou senha inválidos' });
  }

  if (!record.confirmed) {
    return jsonResponse(403, { error: 'Confirme seu e-mail antes de fazer login.' });
  }

  const ok = await verifyPassword(password || '', record.passwordHash);
  if (!ok) {
    return jsonResponse(401, { error: 'E-mail ou senha inválidos' });
  }

  const role = record.role === 'admin' ? 'admin' : 'padrao';

  if (role === 'admin') {
    const token = await createSessionToken(env, { email, list: null, role: 'admin' });
    return jsonResponse(200, { ok: true, redirectUrl: '/admin.html', token, role });
  }

  if (!record.assignedList || !LISTAS[record.assignedList]) {
    return jsonResponse(403, { error: 'Seu acesso ainda não foi liberado. Aguarde o administrador atribuir sua lista.' });
  }

  const token = await createSessionToken(env, { email, list: record.assignedList, role: 'padrao' });
  return jsonResponse(200, { ok: true, redirectUrl: LISTAS[record.assignedList], token, role });
}
