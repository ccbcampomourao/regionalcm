// Guarda o .json de cada lista dentro do mesmo KV que já é usado para os
// usuários (env.USERS_KV) — assim não é preciso criar/vincular um namespace
// novo no Cloudflare. Cada arquivo vira uma chave separada, prefixada pela
// região, então uma lista nunca aparece misturada com a de outra região.
//
// Formato da chave: lista:<regiao>:<nome-do-arquivo>.json

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
  const limpo = nome.trim();
  return limpo.toLowerCase().endsWith('.json') ? limpo : `${limpo}.json`;
}

export async function salvarListaJSON(env, regiao, nome, conteudo) {
  const nomeArquivo = normalizarNomeArquivo(nome);
  await env.USERS_KV.put(chave(regiao, nomeArquivo), conteudo, {
    metadata: { modificado: Date.now() },
  });
  return nomeArquivo;
}

export async function listarListasJSON(env, regiao) {
  const prefixo = `${PREFIXO}${regiao}:`;
  const arquivos = [];
  let cursor;
  while (true) {
    const page = await env.USERS_KV.list(cursor ? { prefix: prefixo, cursor } : { prefix: prefixo });
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
  const conteudo = await env.USERS_KV.get(chave(regiao, nome));
  if (conteudo === null) throw new Error('Arquivo não encontrado.');
  return conteudo;
}

export async function apagarListaJSON(env, regiao, nome) {
  await env.USERS_KV.delete(chave(regiao, nome));
}
