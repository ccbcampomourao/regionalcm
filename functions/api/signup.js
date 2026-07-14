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
  if (existing) {
    return jsonResponse(409, { error: 'Este e-mail já está cadastrado.' });
  }

  const passwordHash = await hashPassword(password);

  const record = {
    email,
    passwordHash,
    active: false,
    role: 'padrao',
    assignedLists: [],
    createdAt: new Date().toISOString(),
  };

  await setUser(env, email, record);

  return jsonResponse(200, {
    ok: true,
    message: 'Cadastro realizado! Aguarde um administrador liberar seu acesso.',
  });
}
