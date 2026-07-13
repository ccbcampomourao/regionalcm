const TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const FOLDER = 'ListasCCB';
const REFRESH_TOKEN_KEY = '__onedrive_refresh_token__';

async function getStoredRefreshToken(env) {
  const stored = await env.USERS_KV.get(REFRESH_TOKEN_KEY);
  return stored || env.ONEDRIVE_REFRESH_TOKEN_INICIAL || null;
}

async function saveRefreshToken(env, token) {
  await env.USERS_KV.put(REFRESH_TOKEN_KEY, token);
}

// Troca o refresh token por um access token novo. A Microsoft às vezes rotaciona
// o refresh token a cada uso — por isso salvamos sempre o mais recente no KV.
async function getAccessToken(env) {
  const refreshToken = await getStoredRefreshToken(env);
  if (!refreshToken) {
    throw new Error('OneDrive ainda não foi autorizado. Siga o passo de configuração inicial no README.');
  }

  const params = new URLSearchParams({
    client_id: env.ONEDRIVE_CLIENT_ID,
    client_secret: env.ONEDRIVE_CLIENT_SECRET,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: 'offline_access Files.ReadWrite',
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error('Falha ao renovar acesso ao OneDrive: ' + text);
  }

  const data = await res.json();
  if (data.refresh_token) {
    await saveRefreshToken(env, data.refresh_token);
  }

  return data.access_token;
}

async function ensureFolder(accessToken) {
  await fetch('https://graph.microsoft.com/v1.0/me/drive/root/children', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ name: FOLDER, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
  });
  // Se a pasta já existir, o Graph responde 409 — sem problema, ignoramos.
}

export async function uploadFile(env, filename, content) {
  const accessToken = await getAccessToken(env);
  await ensureFolder(accessToken);

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/root:/${FOLDER}/${encodeURIComponent(filename)}:/content`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: content,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error('Falha ao enviar arquivo para o OneDrive: ' + text);
  }
}

export async function listFiles(env) {
  const accessToken = await getAccessToken(env);

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/drive/root:/${FOLDER}:/children?$orderby=name desc`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (res.status === 404) return [];
  if (!res.ok) {
    const text = await res.text();
    throw new Error('Falha ao listar arquivos do OneDrive: ' + text);
  }

  const data = await res.json();
  return (data.value || []).filter((f) => f.name.endsWith('.json'));
}

export async function downloadFile(env, itemId) {
  const accessToken = await getAccessToken(env);

  const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${itemId}/content`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error('Falha ao baixar arquivo do OneDrive: ' + text);
  }

  return res.text();
}
