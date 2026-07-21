import { listUsers, jsonResponse } from '../_utils/store.js';
import { getAdminPayload } from '../_utils/adminAuth.js';

export async function onRequestGet({ request, env }) {
  const admin = await getAdminPayload(env, request);
  if (!admin) {
    return jsonResponse(401, { error: 'Não autorizado. Faça login com uma conta ADMIN.' });
  }

  const records = await listUsers(env);

  const users = records
    .map((r) => ({
      email: r.email,
      active: !!r.active,
      assignedLists: Array.isArray(r.assignedLists) ? r.assignedLists : [],
      role: r.role === 'admin' ? 'admin' : 'padrao',
      createdAt: r.createdAt || null,
      passwordReset: r.passwordReset === 'pending' || r.passwordReset === 'approved' ? r.passwordReset : 'none',
    }))
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));

  return jsonResponse(200, { ok: true, users });
}
