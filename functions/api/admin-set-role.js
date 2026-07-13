import { getUser, setUser, listUsers, jsonResponse, normalizeEmail } from '../_utils/store.js';
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
  const role = body.role === 'admin' ? 'admin' : 'padrao';

  const record = await getUser(env, email);
  if (!record) {
    return jsonResponse(404, { error: 'Usuário não encontrado' });
  }

  if (record.role === 'admin' && role !== 'admin') {
    const all = await listUsers(env);
    const totalAdmins = all.filter((u) => u.role === 'admin').length;
    if (totalAdmins <= 1) {
      return jsonResponse(400, { error: 'Não é possível remover o último administrador do sistema.' });
    }
  }

  record.role = role;
  await setUser(env, email, record);

  return jsonResponse(200, { ok: true });
}
