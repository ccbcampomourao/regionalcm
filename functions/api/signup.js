import { getUser, setUser, jsonResponse, normalizeEmail } from '../_utils/store.js';
import { hashPassword } from '../_utils/password.js';
import { sendConfirmationCode } from '../_utils/mail.js';

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: 'JSON inválido' });
  }

  const email = normalizeEmail(body.email);
  const { password, confirmPassword } = body;

  if (!email || !email.includes('@')) {
    return jsonResponse(400, { error: 'E-mail inválido' });
  }
  if (!password || password.length < 6) {
    return jsonResponse(400, { error: 'A senha precisa ter pelo menos 6 caracteres' });
  }
  if (password !== confirmPassword) {
    return jsonResponse(400, { error: 'As senhas não conferem' });
  }

  const existing = await getUser(env, email);

  if (existing && existing.confirmed) {
    return jsonResponse(409, { error: 'Este e-mail já está cadastrado e confirmado.' });
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const passwordHash = await hashPassword(password);

  const record = {
    email,
    passwordHash,
    confirmed: false,
    code,
    codeExpiresAt: Date.now() + 15 * 60 * 1000,
    role: existing ? existing.role || 'padrao' : 'padrao',
    assignedList: existing ? existing.assignedList || null : null,
    createdAt: existing ? existing.createdAt : new Date().toISOString(),
  };

  await setUser(env, email, record);

  try {
    await sendConfirmationCode(env, email, code);
  } catch (err) {
    return jsonResponse(500, { error: 'Não foi possível enviar o e-mail de confirmação. Tente novamente em instantes.' });
  }

  return jsonResponse(200, { ok: true, message: 'Código enviado para o e-mail.' });
}
