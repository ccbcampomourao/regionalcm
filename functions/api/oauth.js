// Login com Google ou Microsoft (Outlook/Hotmail) — fluxo OAuth "authorization code".
//
// O e-mail confirmado pelo Google/Microsoft é o que identifica a pessoa.
// As regras continuam as mesmas do login com senha:
//   - e-mail já cadastrado e liberado  -> entra direto
//   - e-mail já cadastrado, não liberado -> avisa que aguarda o administrador
//   - e-mail novo -> cria o cadastro (sem senha) e aguarda o administrador
//
// Variáveis (Settings -> Variables and Secrets, como secrets):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
//   MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET
// Se um provedor não estiver configurado, o botão dele simplesmente não aparece.

import { getUser, setUser, normalizeEmail, jsonResponse, LISTAS } from '../_utils/store.js';
import { createSessionToken } from '../_utils/session.js';

const PROVEDORES = {
  google: {
    nome: 'Google',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
    id: (env) => env.GOOGLE_CLIENT_ID,
    secret: (env) => env.GOOGLE_CLIENT_SECRET,
    extra: { prompt: 'select_account' },
    // O Google informa se o e-mail foi verificado.
    email: (c) => (c.email && c.email_verified === true ? c.email : null),
  },
  microsoft: {
    nome: 'Microsoft',
    // "consumers" = contas pessoais (Outlook.com, Hotmail, Live). Nessas contas
    // o e-mail é o próprio login da Microsoft, então é confiável.
    authUrl: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token',
    scope: 'openid email profile',
    id: (env) => env.MICROSOFT_CLIENT_ID,
    secret: (env) => env.MICROSOFT_CLIENT_SECRET,
    extra: { prompt: 'select_account' },
    email: (c) => {
      // Só aceita tokens do diretório de contas pessoais da Microsoft.
      if (c.tid !== '9188040d-6c67-4c5b-b112-36a304b66dad') return null;
      return c.email || c.preferred_username || null;
    },
  },
};

const COOKIE = 'oauth_state';

function configurado(env, p) {
  return !!(PROVEDORES[p] && PROVEDORES[p].id(env) && PROVEDORES[p].secret(env));
}

function redirectUri(request) {
  return new URL('/api/oauth-callback', request.url).origin + '/api/oauth-callback';
}

function aleatorio() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function lerCookie(request, nome) {
  const c = request.headers.get('Cookie') || '';
  const m = c.match(new RegExp('(?:^|;\\s*)' + nome + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

function decodificarJWT(jwt) {
  const parte = String(jwt || '').split('.')[1];
  if (!parte) return null;
  let b64 = parte.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

// Volta para a tela de login levando o resultado no "#" (não vai para logs de servidor).
function voltar(dados) {
  const hash = new URLSearchParams(dados).toString();
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/login.html#' + hash,
      'Set-Cookie': `${COOKIE}=; Path=/api/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
      'Cache-Control': 'no-store',
    },
  });
}

// GET /api/oauth-providers -> quais botões mostrar
export async function onRequestProviders({ env }) {
  return jsonResponse(200, {
    google: configurado(env, 'google'),
    microsoft: configurado(env, 'microsoft'),
  });
}

// GET /api/oauth-start?p=google|microsoft -> manda para a tela do provedor
export async function onRequestStart({ request, env }) {
  const p = new URL(request.url).searchParams.get('p');
  if (!configurado(env, p)) return voltar({ erro: 'Este tipo de login não está disponível.' });
  const prov = PROVEDORES[p];

  const state = p + '.' + aleatorio();
  const url = new URL(prov.authUrl);
  url.search = new URLSearchParams({
    client_id: prov.id(env),
    redirect_uri: redirectUri(request),
    response_type: 'code',
    scope: prov.scope,
    state,
    ...prov.extra,
  }).toString();

  return new Response(null, {
    status: 302,
    headers: {
      Location: url.toString(),
      'Set-Cookie': `${COOKIE}=${encodeURIComponent(state)}; Path=/api/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
      'Cache-Control': 'no-store',
    },
  });
}

// GET /api/oauth-callback -> volta do provedor, confere e faz o login
export async function onRequestCallback({ request, env }) {
  const q = new URL(request.url).searchParams;
  const state = q.get('state') || '';
  const salvo = lerCookie(request, COOKIE);

  if (q.get('error')) return voltar({ erro: 'Login cancelado.' });
  if (!state || !salvo || state !== salvo) {
    return voltar({ erro: 'A tentativa de login expirou. Tente de novo.' });
  }

  const p = state.split('.')[0];
  if (!configurado(env, p)) return voltar({ erro: 'Este tipo de login não está disponível.' });
  const prov = PROVEDORES[p];

  // Troca o código pelo token (direto com o provedor, usando o segredo do app)
  let claims;
  try {
    const res = await fetch(prov.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: q.get('code') || '',
        client_id: prov.id(env),
        client_secret: prov.secret(env),
        redirect_uri: redirectUri(request),
        grant_type: 'authorization_code',
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.id_token) throw new Error(data.error_description || data.error || 'sem id_token');
    claims = decodificarJWT(data.id_token);
    if (!claims || claims.aud !== prov.id(env)) throw new Error('token de outro aplicativo');
    if (claims.exp && claims.exp * 1000 < Date.now()) throw new Error('token expirado');
  } catch (err) {
    console.error('OAuth', p, err);
    return voltar({ erro: `Não foi possível entrar com ${prov.nome}. Tente de novo.` });
  }

  const email = normalizeEmail(prov.email(claims));
  if (!email || !email.includes('@')) {
    return voltar({ erro: `Sua conta ${prov.nome} não informou um e-mail confirmado.` });
  }

  let record = await getUser(env, email);

  // E-mail novo: cria o cadastro, que fica aguardando o administrador
  if (!record) {
    record = {
      email,
      passwordHash: null,
      active: false,
      role: 'padrao',
      assignedLists: [],
      createdAt: new Date().toISOString(),
      provider: p,
    };
    await setUser(env, email, record);
    return voltar({ aviso: 'Cadastro criado com ' + prov.nome + '! Aguarde um administrador liberar seu acesso.', email });
  }

  if (!record.provider) {
    record.provider = p;
    await setUser(env, email, record);
  }

  if (!record.active) {
    return voltar({ erro: 'Seu acesso ainda não foi liberado. Aguarde o administrador liberar seu acesso.', email });
  }

  const role = record.role === 'admin' ? 'admin' : 'padrao';
  if (role === 'admin') {
    const token = await createSessionToken(env, { email, lists: Object.keys(LISTAS), role: 'admin' });
    return voltar({ token, ir: '/admin.html', email });
  }

  const listas = (Array.isArray(record.assignedLists) ? record.assignedLists : []).filter((l) => LISTAS[l]);
  if (!listas.length) {
    return voltar({ erro: 'Seu acesso ainda não foi liberado. Aguarde o administrador atribuir suas listas.', email });
  }
  const token = await createSessionToken(env, { email, lists: listas, role: 'padrao' });
  const ir = listas.length === 1 ? LISTAS[listas[0]] : '/minhas-listas.html';
  return voltar({ token, ir, email });
}
