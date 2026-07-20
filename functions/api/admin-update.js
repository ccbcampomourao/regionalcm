import { getUser, setUser, listUsers, jsonResponse, normalizeEmail, LISTAS } from '../_utils/store.js';
import { getAdminPayload } from '../_utils/adminAuth.js';

// Atualiza listas liberadas E papel (role) do usuário em UMA ÚNICA leitura +
// UMA ÚNICA gravação no KV. Antes, isso era feito em duas chamadas separadas
// (admin-assign + admin-set-role) disparadas ao mesmo tempo pelo painel — só
// que como as duas liam o registro antes de qualquer uma escrever, a que
// terminava por último sobrescrevia o registro inteiro com uma cópia
// desatualizada, apagando a mudança que a outra tinha acabado de salvar.
// Fazendo tudo numa chamada só, esse problema não existe mais.
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
  const rawLists = Array.isArray(body.lists) ? body.lists : [];
  const lists = [...new Set(rawLists.filter((l) => typeof l === 'string' && l))];

  const invalid = lists.filter((l) => !LISTAS[l]);
  if (invalid.length > 0) {
    return jsonResponse(400, { error: `Lista inválida: ${invalid.join(', ')}` });
  }

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

  record.assignedLists = lists;
  record.role = role;
  if (role === 'admin') {
    record.active = true;
  }

  await setUser(env, email, record);

  return jsonResponse(200, { ok: true });
}
