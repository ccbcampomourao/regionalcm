import { jsonResponse, LISTAS } from '../_utils/store.js';
import { verifySessionToken } from '../_utils/session.js';
import { nomeValido, normalizarNomeArquivo, chavePresenca, lerMeta } from '../_utils/listasStore.js';

// Quem está com o mesmo arquivo aberto (para avisar) e quando/quem salvou por último.
// acao: 'entrar' (abriu), 'ping' (continua mexendo), 'sair' (fechou) ou 'info' (só consulta, não grava).
// Só 'entrar', 'ping' e 'sair' gravam no KV; a tela manda 'ping' só quando a pessoa está mexendo.
const VIVO = 6 * 60 * 1000; // sem sinal há mais de 6 minutos: considera que saiu

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return jsonResponse(400, { error: 'JSON inválido' }); }
  const { token, regiao, nome, acao } = body;

  const payload = await verifySessionToken(env, token);
  if (!payload) return jsonResponse(401, { error: 'Sessão inválida ou expirada. Faça login novamente.' });
  if (!regiao || !LISTAS[regiao]) return jsonResponse(400, { error: 'Lista inválida' });
  const temAcesso = payload.role === 'admin' || (Array.isArray(payload.lists) && payload.lists.includes(regiao));
  if (!temAcesso) return jsonResponse(403, { error: 'Sem permissão para esta lista' });
  if (!nomeValido(nome)) return jsonResponse(400, { error: 'Nome de arquivo inválido.' });

  const arq = normalizarNomeArquivo(nome);
  const chave = chavePresenca(regiao, arq);
  const eu = payload.email || 'sem e-mail';
  const agora = Date.now();

  let mapa = {};
  try { mapa = JSON.parse((await env.LISTAS_KV.get(chave)) || '{}') || {}; } catch { mapa = {}; }
  let mudou = false;
  for (const k of Object.keys(mapa)) if (!mapa[k] || agora - (mapa[k].visto || 0) > VIVO) { delete mapa[k]; mudou = true; }

  if (acao === 'entrar' || acao === 'ping') {
    mapa[eu] = { desde: (mapa[eu] && mapa[eu].desde) || agora, visto: agora };
    mudou = true;
  } else if (acao === 'sair') {
    if (mapa[eu]) { delete mapa[eu]; mudou = true; }
  }
  if (mudou && acao !== 'info') {
    if (Object.keys(mapa).length) await env.LISTAS_KV.put(chave, JSON.stringify(mapa), { expirationTtl: 900 });
    else await env.LISTAS_KV.delete(chave);
  }

  const meta = await lerMeta(env, regiao, arq);
  const outros = Object.entries(mapa).filter(([e]) => e !== eu).map(([email, v]) => ({ email, desde: v.desde, visto: v.visto }));
  return jsonResponse(200, { ok: true, eu, outros, modificado: (meta && meta.modificado) || null, por: (meta && meta.por) || null });
}
