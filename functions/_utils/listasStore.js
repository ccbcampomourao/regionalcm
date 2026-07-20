// Guarda o .json de cada lista em um KV PRÓPRIO (env.LISTAS_KV), separado do
// KV de usuários (env.USERS_KV) — assim uma coisa nunca interfere na outra.
// Precisa criar um namespace novo no Cloudflare e vincular como "LISTAS_KV"
// (veja o README, seção "Salvar e carregar listas").
//
// Dentro desse KV, cada arquivo ainda é separado por região através da
// chave: lista:<regiao>:<nome-do-arquivo>.json — então mesmo estando todos
// no mesmo namespace, uma lista nunca aparece misturada com a de outra.

const PREFIXO = 'lista:';

function chave(regiao, nomeArquivo) {
  return `${PREFIXO}${regiao}:${nomeArquivo}`;
}

// Só deixa passar letras, números, espaço, acento, - _ e ponto — evita que o
// nome digitado pelo usuário vire parte de outra chave (ex: com ":" ou "/").
export function nomeValido(nome) {
  return typeof nome === 'string' && /^[a-zA-Z0-9À-ÿ _\-.]{1,120}$/.test(nome.trim());
}

function normalizarNomeArquivo(nome) {
  // Remove espaços nas pontas, colapsa espaços internos duplicados e deixa
  // tudo minúsculo — assim "Lista Julho", "lista  julho" e "LISTA JULHO"
  // sempre caem na MESMA chave e um salvamento novo sobrescreve o antigo,
  // em vez de criar um arquivo quase-duplicado só porque a digitação mudou.
  const limpo = nome.trim().replace(/\s+/g, ' ').toLowerCase();
  return limpo.endsWith('.json') ? limpo : `${limpo}.json`;
}

export async function salvarListaJSON(env, regiao, nome, conteudo) {
  const nomeArquivo = normalizarNomeArquivo(nome);
  await env.LISTAS_KV.put(chave(regiao, nomeArquivo), conteudo, {
    metadata: { modificado: Date.now() },
  });
  return nomeArquivo;
}

export async function listarListasJSON(env, regiao) {
  const prefixo = `${PREFIXO}${regiao}:`;
  const arquivos = [];
  let cursor;
  while (true) {
    const page = await env.LISTAS_KV.list(cursor ? { prefix: prefixo, cursor } : { prefix: prefixo });
    for (const key of page.keys) {
      arquivos.push({
        nome: key.name.slice(prefixo.length),
        modificado: (key.metadata && key.metadata.modificado) || 0,
      });
    }
    if (page.list_complete) break;
    cursor = page.cursor;
  }
  // Mais recentes primeiro.
  arquivos.sort((a, b) => b.modificado - a.modificado);
  return arquivos;
}

export async function carregarListaJSON(env, regiao, nome) {
  const conteudo = await env.LISTAS_KV.get(chave(regiao, nome));
  if (conteudo === null) throw new Error('Arquivo não encontrado.');
  return conteudo;
}

export async function apagarListaJSON(env, regiao, nome) {
  await env.LISTAS_KV.delete(chave(regiao, nome));
}
