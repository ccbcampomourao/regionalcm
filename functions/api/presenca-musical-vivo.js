import { jsonResponse } from '../_utils/store.js';
import { verifySessionToken } from '../_utils/session.js';

// Entrada da Lista de Presença Musical "ao vivo" (veja src/sala-presenca.js).
// GET /api/presenca-musical/ws?token=...   -> WebSocket ligado à sala
// POST /api/presenca-musical/estado {token} -> a lista inteira (para conferência)
const LISTA = 'presencamusical';

export async function onRequestVivo({ request, env }) {
  if (!env.SALA_PRESENCA) return jsonResponse(404, { error: 'Modo ao vivo não está ligado neste servidor.' });
  const url = new URL(request.url);
  // link da chamada (para quem não tem cadastro): a sala confere o código e limita o que pode
  const link = url.searchParams.get('link');
  if (link && request.method === 'GET') {
    if (!/^[a-f0-9]{16,40}$/.test(link)) return jsonResponse(404, { error: 'Link inválido' });
    const salaL = env.SALA_PRESENCA.get(env.SALA_PRESENCA.idFromName(LISTA));
    const h = new Headers(request.headers); h.set('X-Link', link); h.delete('X-Email'); h.delete('X-Admin');
    url.searchParams.delete('link');
    return salaL.fetch(new Request(url.toString(), { method: 'GET', headers: h }));
  }
  let token = url.searchParams.get('token');
  if (!token && request.method === 'POST') { try { token = (await request.clone().json()).token; } catch { token = null; } }
  const payload = await verifySessionToken(env, token);
  if (!payload) return jsonResponse(401, { error: 'Sessão inválida ou expirada. Faça login novamente.' });
  const temAcesso = payload.role === 'admin' || (Array.isArray(payload.lists) && payload.lists.includes(LISTA));
  if (!temAcesso) return jsonResponse(403, { error: 'Sem permissão para esta lista' });

  const sala = env.SALA_PRESENCA.get(env.SALA_PRESENCA.idFromName(LISTA));
  const headers = new Headers(request.headers);
  headers.set('X-Email', payload.email || 'sem e-mail'); headers.delete('X-Link');
  if (payload.role === 'admin') headers.set('X-Admin', '1'); else headers.delete('X-Admin');
  url.searchParams.delete('token');   // o token não vai para a sala
  return sala.fetch(new Request(url.toString(), { method: request.method, headers }));
}
