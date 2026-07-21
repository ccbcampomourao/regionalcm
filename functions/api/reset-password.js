import { getUser, setUser, jsonResponse, normalizeEmail } from '../_utils/store.js';
import { hashPassword } from '../_utils/password.js';

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: 'JSON inválido' });
  }

  const email = normalizeEmail(body.email);
  const { newPassword, confirmPassword } = body;

  const record = await getUser(env, email);
  if (!record) {
    return jsonResponse(404, { error: 'Usuário não encontrado' });
  }

  if (record.passwordReset !== 'approved') {
    return jsonResponse(403, { error: 'Não há nenhuma redefinição de senha aprovada para este e-mail.' });
  }

  if (!newPassword || newPassword.length < 6) {
    return jsonResponse(400, { error: 'A nova senha precisa ter pelo menos 6 caracteres' });
  }
  if (newPassword !== confirmPassword) {
    return jsonResponse(400, { error: 'As senhas não conferem' });
  }

  record.passwordHash = await hashPassword(newPassword);
  record.passwordReset = 'none';
  await setUser(env, email, record);

  return jsonResponse(200, { ok: true, message: 'Senha redefinida com sucesso! Faça login com a nova senha.' });
}
