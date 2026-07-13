import { verifySessionToken } from './session.js';

// Lê o token do header "Authorization: Bearer <token>" e confere se é um admin válido.
export async function getAdminPayload(env, request) {
  const authHeader = request.headers.get('Authorization') || request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.slice('Bearer '.length).trim();
  const payload = await verifySessionToken(env, token);
  if (!payload || payload.role !== 'admin') return null;

  return payload;
}
