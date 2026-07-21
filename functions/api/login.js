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

  if (record.passwordReset === 'approved') {
    return jsonResponse(200, {
      ok: true,
      needsPasswordReset: true,
      message: 'Sua redefinição de senha foi aprovada. Defina uma nova senha para continuar.',
    });
  }

  const ok = await verifyPassword(password || '', record.passwordHash);
  if (!ok) {
    return jsonResponse(401, { error: 'E-mail ou senha inválidos' });
  }

  if (!record.active) {
    return jsonResponse(403, { error: 'Seu acesso ainda não foi liberado. Aguarde o administrador liberar seu acesso.' });
  }

  const role = record.role === 'admin' ? 'admin' : 'padrao';

  if (role === 'admin') {
    const token = await createSessionToken(env, { email, lists: Object.keys(LISTAS), role: 'admin' });
    return jsonResponse(200, { ok: true, redirectUrl: '/admin.html', token, role });
  }

  const assignedLists = Array.isArray(record.assignedLists)
    ? record.assignedLists.filter((l) => LISTAS[l])
    : [];

  if (assignedLists.length === 0) {
    return jsonResponse(403, { error: 'Seu acesso ainda não foi liberado. Aguarde o administrador atribuir suas listas.' });
  }

  const token = await createSessionToken(env, { email, lists: assignedLists, role: 'padrao' });
  const redirectUrl = assignedLists.length === 1 ? LISTAS[assignedLists[0]] : '/minhas-listas.html';

  return jsonResponse(200, { ok: true, redirectUrl, token, role });
}
