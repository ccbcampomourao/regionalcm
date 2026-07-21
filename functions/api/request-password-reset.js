import { getUser, setUser, jsonResponse, normalizeEmail } from '../_utils/store.js';

// Mensagem sempre igual, exista ou não o e-mail, pra não revelar quais
// e-mails estão cadastrados no sistema.
const MENSAGEM_GENERICA = 'Se o e-mail estiver cadastrado, a solicitação foi registrada. Aguarde um administrador aprovar a redefinição.';

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: 'JSON inválido' });
  }

  const email = normalizeEmail(body.email);
  if (!email || !email.includes('@')) {
    return jsonResponse(400, { error: 'Informe um e-mail válido.' });
  }

  const record = await getUser(env, email);
  if (record) {
    // Não rebaixa uma redefinição já aprovada de volta para "pendente".
    if (record.passwordReset !== 'approved') {
      record.passwordReset = 'pending';
      record.passwordResetRequestedAt = new Date().toISOString();
      await setUser(env, email, record);
    }
  }

  return jsonResponse(200, { ok: true, message: MENSAGEM_GENERICA });
}
