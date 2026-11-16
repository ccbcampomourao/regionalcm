/* =====================================================================
   Atas das reuniões locais: RLA (Reunião Local Administrativa) e
   RLM (Reunião Local Ministerial), no molde das atas da RMA de
   Campo Mourão (cabeçalho com o selo, texto corrido em Arial 12,
   assuntos numerados, tesouraria, encerramento e assinaturas).

   Carregado ANTES de atas.js: aqui só há funções; elas usam as
   funções e constantes de atas.js quando são chamadas.
   ===================================================================== */
const TIPOS_REUNIAO = ['RLA', 'RLM'];
const ehReuniao = a => !!a && TIPOS_REUNIAO.includes(a.tipo);
const NOME_REUNIAO = { RLA: 'Reunião Local Administrativa', RLM: 'Reunião Local Ministerial' };
const PRESENCA_PADRAO = {
  RLA: 'irmãos Anciães, Diáconos, Cooperadores do Ofício Ministerial, Cooperadores de Jovens e Menores, Administradores, Auxiliares da Administração e Colaboradores',
  RLM: 'irmãos Anciães, Diáconos, Cooperadores do Ofício Ministerial e Cooperadores de Jovens e Menores'
};
const SALA_PADRAO = 'sala de reunião da igreja Congregação Cristã no Brasil';
// assuntos que aparecem nas atas (RLA: atas da RMA; RLM: modelos 7.1 e 7.2 do manual)
const ASSUNTOS_PADRAO = {
  RLA: ['Pauta da Reunião', 'Setor Secretaria', 'Setor de Tesouraria', 'Reformas e Construções', 'Assuntos Diversos', 'Setor Diáconos', 'Conselhos Diversos'],
  RLM: ['Pauta da Reunião', 'Batismos e Santas Ceias', 'Novos irmãos para ministérios e cargos', 'Dias e horários de cultos', 'Recolhimentos', 'Comunicados e Circulares', 'Conselhos Diversos']
};
const ASSUNTOS_SUGERIDOS = ['Pauta da Reunião', 'Setor Secretaria', 'Setor de Tesouraria', 'Reformas e Construções', 'Assuntos Diversos', 'Setor Diáconos', 'Conselhos Diversos',
  'Batismos e Santas Ceias', 'Novos irmãos para ministérios e cargos', 'Dias e horários de cultos', 'Renúncias', 'Recolhimentos', 'Comunicados e Circulares', 'Assuntos Patrimoniais'];
const ehTesouraria = t => /tesouraria/i.test(String(t || ''));

/* ---------- Bíblia: como o livro entra na frase ---------- */
const LIVROS = (() => {
  const P = n => `do Livro do Profeta ${n}`, L = n => `do Livro de ${n}`;
  const ep = (o, n) => `da ${o ? o + ' ' : ''}Epístola do Apóstolo Paulo ${n}`;
  return [
    ['Gênesis', L('Gênesis')], ['Êxodo', L('Êxodo')], ['Levítico', L('Levítico')], ['Números', L('Números')], ['Deuteronômio', L('Deuteronômio')],
    ['Josué', L('Josué')], ['Juízes', 'do Livro dos Juízes'], ['Rute', L('Rute')], ['1 Samuel', 'do Primeiro Livro de Samuel'], ['2 Samuel', 'do Segundo Livro de Samuel'],
    ['1 Reis', 'do Primeiro Livro dos Reis'], ['2 Reis', 'do Segundo Livro dos Reis'], ['1 Crônicas', 'do Primeiro Livro das Crônicas'], ['2 Crônicas', 'do Segundo Livro das Crônicas'],
    ['Esdras', L('Esdras')], ['Neemias', L('Neemias')], ['Ester', L('Ester')], ['Jó', L('Jó')], ['Salmos', 'do Livro dos Salmos'], ['Provérbios', 'do Livro dos Provérbios'],
    ['Eclesiastes', L('Eclesiastes')], ['Cantares', 'do Livro de Cantares de Salomão'], ['Isaías', P('Isaías')], ['Jeremias', P('Jeremias')], ['Lamentações', 'do Livro das Lamentações de Jeremias'],
    ['Ezequiel', P('Ezequiel')], ['Daniel', P('Daniel')], ['Oseias', P('Oseias')], ['Joel', P('Joel')], ['Amós', P('Amós')], ['Obadias', P('Obadias')], ['Jonas', P('Jonas')],
    ['Miqueias', P('Miqueias')], ['Naum', P('Naum')], ['Habacuque', P('Habacuque')], ['Sofonias', P('Sofonias')], ['Ageu', P('Ageu')], ['Zacarias', P('Zacarias')], ['Malaquias', P('Malaquias')],
    ['Mateus', 'do Evangelho segundo Mateus'], ['Marcos', 'do Evangelho segundo Marcos'], ['Lucas', 'do Evangelho segundo Lucas'], ['João', 'do Evangelho segundo João'],
    ['Atos', 'do Livro de Atos dos Apóstolos'], ['Romanos', ep('', 'aos Romanos')], ['1 Coríntios', ep('Primeira', 'aos Coríntios')], ['2 Coríntios', ep('Segunda', 'aos Coríntios')],
    ['Gálatas', ep('', 'aos Gálatas')], ['Efésios', ep('', 'aos Efésios')], ['Filipenses', ep('', 'aos Filipenses')], ['Colossenses', ep('', 'aos Colossenses')],
    ['1 Tessalonicenses', ep('Primeira', 'aos Tessalonicenses')], ['2 Tessalonicenses', ep('Segunda', 'aos Tessalonicenses')], ['1 Timóteo', ep('Primeira', 'a Timóteo')], ['2 Timóteo', ep('Segunda', 'a Timóteo')],
    ['Tito', ep('', 'a Tito')], ['Filemom', ep('', 'a Filemom')], ['Hebreus', 'da Epístola aos Hebreus'], ['Tiago', 'da Epístola de Tiago'],
    ['1 Pedro', 'da Primeira Epístola de Pedro'], ['2 Pedro', 'da Segunda Epístola de Pedro'], ['1 João', 'da Primeira Epístola de João'], ['2 João', 'da Segunda Epístola de João'], ['3 João', 'da Terceira Epístola de João'],
    ['Judas', 'da Epístola de Judas'], ['Apocalipse', 'do Livro do Apocalipse']
  ];
})();
function livroFrase(livro) {
  const l = String(livro || '').trim(); if (!l) return '';
  if (/^(d[oa]s?)\s/i.test(l)) return l;              // já escrito por extenso ("da Epístola ...")
  const n = norm(l).replace(/^(i{1,3})\s/, (m, r) => r.length + ' ').replace(/^(\d)[ªº°a]?\s*/, '$1 ');
  const achou = LIVROS.find(([k]) => norm(k) === n);
  return achou ? achou[1] : `do Livro de ${l}`;
}

/* ---------- números ordinais (femininos: "terceira reunião") ---------- */
function ordinalF(n) {
  n = +n; if (!n || n < 1 || n > 99) return '______';
  const U = ['', 'primeira', 'segunda', 'terceira', 'quarta', 'quinta', 'sexta', 'sétima', 'oitava', 'nona'];
  const D = ['', 'décima', 'vigésima', 'trigésima', 'quadragésima', 'quinquagésima', 'sexagésima', 'septuagésima', 'octogésima', 'nonagésima'];
  return [D[Math.floor(n / 10)], U[n % 10]].filter(Boolean).join(' ');
}

/* ---------- dados ---------- */
function tesPadrao() {
  return { quem: '', mes: '', dataSaldo: '', saldo: null, coletas: null, outras: [{ r: 'rateio das administrações agregadas', v: null }], despesas: null, piedade: null, provisionado: null, construcoes: null, obs: '' };
}
function assuntoPadrao(titulo, tipo) {
  const a = { titulo: titulo || '', texto: '', tes: null };
  if (tipo && ehTesouraria(titulo)) a.tes = tesPadrao();
  return a;
}
function normalizarReuniao(a) {
  const tipo = a.tipo === 'RLM' ? 'RLM' : 'RLA';
  const n = Object.assign({
    id: novoId(), tipo, data: '', hora: '', horaFim: '', numero: null, sala: '', endereco: '', presentes: null, presencaDesc: '',
    anciao: '', hino: '', livro: '', capitulo: '', versoIni: '', versoFim: '', tituloPalavra: '',
    lavra: 'secretario', lavraNome: '', lavraCargo: '', conduz: tipo === 'RLA' ? 'presidente' : '', assuntos: [], textoManual: null, ordem: []
  }, a);
  n.tipo = tipo; n.ordem = [];
  n.opc = Object.assign({ presenca: 1 }, a.opc || {});
  n.comp = Object.assign({ inicio: '', fim: '', cargos: {}, anciaes: [], auxiliares: [], setores: [] }, a.comp || {});
  n.assuntos = (Array.isArray(n.assuntos) ? n.assuntos : []).map(x => {
    const s = Object.assign({ titulo: '', texto: '', tes: null }, x);
    if (s.tes) {
      s.tes = Object.assign(tesPadrao(), s.tes);
      s.tes.outras = (Array.isArray(s.tes.outras) ? s.tes.outras : []).map(o => Object.assign({ r: '', v: null }, o));
    }
    return s;
  });
  return n;
}
const assinaAdm = a => a.conduz ? papel(a, a.conduz, 'presidente') : null;
// quem redige a ata: secretário, vice ou outro irmão (na RLM pode ser um irmão do ministério)
function lavraReuniao(a) {
  if (a.lavra === 'outro') return { nome: String(a.lavraNome || '').trim(), cargoExt: String(a.lavraCargo || '').trim() || 'Secretário da reunião', rotTexto: String(a.lavraCargo || '').trim() || 'que secretariou a reunião' };
  const p = papel(a, a.lavra || 'secretario', 'secretario');
  return { nome: p.nome, cargoExt: p.cargoExt, rotTexto: `${p.cargoExt} da Administração` };
}
// número da reunião no ano: o que veio do calendário (ou foi digitado) ou a contagem das atas do mesmo tipo
function numeroAuto(a) {
  const ano = anoDe(a.data); if (!ano) return null;
  return DB.atas.filter(x => x.tipo === a.tipo && anoDe(x.data) === ano && String(x.data) <= String(a.data)).length || 1;
}
const numeroReuniao = a => a.numero || numeroAuto(a);

/* ---------- tesouraria: contas ---------- */
const soma = l => r2(l.reduce((s, v) => s + (v || 0), 0));
function contasTes(t) {
  const rec = soma([t.coletas].concat(t.outras.map(o => o.v)));
  const rep = r2(rec - (t.despesas || 0));
  const perm = r2(rep - (t.piedade || 0));
  return { rec, rep, perm };
}
function mesAnterior(iso) { const p = partesData(iso); if (!p) return null; const m = p.m === 1 ? 12 : p.m - 1, y = p.m === 1 ? p.y - 1 : p.y; return { m, y, ult: `${y}-${String(m).padStart(2, '0')}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}` }; }
const mesTes = (a, t) => String(t.mes || '').trim() || (mesAnterior(a.data) ? MESES[mesAnterior(a.data).m - 1] : '______');
const dataSaldoTes = (a, t) => t.dataSaldo || (mesAnterior(a.data) || {}).ult || '';

/* ---------- texto livre: negrito em **assim**, nos valores em reais e nos nomes do cadastro ---------- */
function nomesConhecidos(a) {
  const s = new Set();
  const add = n => { n = String(n || '').trim(); if (n.split(/\s+/).length >= 2) s.add(n); };
  DB.cad.pessoas.forEach(p => add(p.nome));
  Object.values(DB.cad.adm.cargos || {}).concat(Object.values((a && a.comp.cargos) || {})).forEach(add);
  DB.cad.cf.membros.concat(DB.cad.cf.suplente, DB.cad.anciaes, DB.cad.auxiliares).forEach(add);
  DB.cad.setores.forEach(x => (x.nomes || []).forEach(add));
  return [...s].sort((x, y) => y.length - x.length);
}
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function textoRico(t, a) {
  let h = esc(String(t || '').replace(/\s*\n+\s*/g, ' ').trim());
  h = h.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  const fora = (h, fn) => h.split(/(<b>.*?<\/b>)/).map(p => p.startsWith('<b>') ? p : fn(p)).join('');
  h = fora(h, p => p.replace(/R\$\s?-?\d{1,3}(?:\.\d{3})*(?:,\d{2})?/g, m => `<b>${m.replace(/R\$\s?/, 'R$ ')}</b>`));
  const nomes = nomesConhecidos(a);
  if (nomes.length) {
    const re = new RegExp(`(^|[^\\p{L}])(${nomes.map(n => reEsc(esc(n))).join('|')})(?![\\p{L}])`, 'giu');
    h = fora(h, p => p.replace(re, (m, pre, n) => `${pre}<b>${n}</b>`));
  }
  return h;
}

/* ---------- texto da ata ---------- */
function textoTesouraria(a, s) {
  const t = s.tes, c = contasTes(t), R = v => v == null ? B('R$ ______') : B('R$ ' + fmtR(v));
  const quem = String(t.quem || '').trim() || cargo(a, 'tesoureiro');
  const ds = dataSaldoTes(a, t), mes = esc(mesTes(a, t));
  const outras = t.outras.filter(o => String(o.r || '').trim() || o.v != null).map(o => `${esc(fimFrase(o.r) || '______')}, ${R(o.v)}`);
  let x = `O irmão ${N(quem)}, Tesoureiro, apresentou todo o movimento financeiro referente ao mês de ${mes}, informando que o saldo bancário apurado até o dia ${ds ? dataExt2(ds) : '____ de __________ de ____'} era de ${R(t.saldo)}; na sequência, apresentou o demonstrativo das receitas do mês, composto pelos seguintes valores: coletas do mês de ${mes}, ${R(t.coletas)}${outras.map(o => '; ' + o).join('')}; o total geral de receitas do mês perfaz o montante de ${R(c.rec)}; foram igualmente apresentadas as despesas financeiras do período, totalizando ${R(t.despesas)}, o que resultou em um saldo para repartição entre a Obra da Piedade e a Administração no valor de ${R(c.rep)}`;
  if (t.piedade != null) x += `; após análise, ficou deliberado transferir para o Departamento da Piedade o montante de ${R(t.piedade)}, permanecendo à disposição da Administração o valor de ${R(c.perm)}`;
  if (t.provisionado != null) x += `; do referido saldo, já se encontra provisionado o valor de ${R(t.provisionado)} para contas a pagar`;
  if (t.construcoes != null) x += `; foi informado também que as despesas acumuladas de construção, reforma e compra de terreno em andamento totalizam ${R(t.construcoes)}`;
  const obs = fimFrase(String(t.obs || '').replace(/\s*\n+\s*/g, ' '));
  if (obs) x += `; ${textoRico(obs, a)}`;
  return x;
}
function textoReuniaoHTML(a) {
  const e = DB.cad.ent, nome = NOME_REUNIAO[a.tipo];
  const lv = lavraReuniao(a);
  const end = String(a.endereco || '').trim() || `${e.rua}, número ${e.num}, ${e.bairro}`;
  const sala = String(a.sala || '').trim() || SALA_PADRAO;
  const num = numeroReuniao(a);
  const pres = String(a.presencaDesc || '').trim() || PRESENCA_PADRAO[a.tipo];
  let t = `${diaAbertura(a.data)}, na ${esc(sala)}, situada na ${esc(end)}, na cidade de ${esc(e.regiao)}, Estado do ${esc(e.uf)}, teve início, às ${a.hora ? horaExt(a.hora) : '____ horas'}, esta ${ordinalF(num)} ${nome} – ${a.tipo} do ano em curso, com a presença de ${esc(fimFrase(pres))}${a.presentes != null ? `, em número de ${numExt(a.presentes)} irmãos` : ''}, conforme registro de presença desta reunião.`;
  t += ` Foi aberta a reunião Em Nome do Senhor Jesus, sob a presidência do irmão Ancião ${N(a.anciao)}, que ao final assina esta ata.`;
  t += ` Após cantar o hino ${B(esc(String(a.hino || '').trim() || '____'))}, buscou-se a face de Deus em oração.`;
  const liv = livroFrase(a.livro);
  if (liv || a.capitulo) {
    const salmo = /salmos/i.test(liv);
    const vi = String(a.versoIni || '').trim(), vf = String(a.versoFim || '').trim();
    const vers = vi && vf && vi !== vf ? `, do verso ${esc(vi)} ao ${esc(vf)}` : vi ? `, verso ${esc(vi)}` : '';
    const ref = salmo ? `o Salmo ${esc(a.capitulo || '____')}` : `o Capítulo ${esc(a.capitulo || '____')} ${esc(liv || '______')}`;
    t += ` Na liberdade da Santa Palavra, o Senhor revelou ${ref}${vers}${String(a.tituloPalavra || '').trim() ? `, cujo título diz: ${B(`“${esc(fimFrase(a.tituloPalavra))}”`)}` : ''}.`;
  } else t += ' Na liberdade da Santa Palavra, o Senhor revelou ______.';
  t += a.tipo === 'RLA' ? ' Dando continuidade, foram apresentados os assuntos da parte administrativa, conforme segue: ' : ' Dando continuidade, foram apresentados em oração e considerados os seguintes assuntos: ';
  const its = a.assuntos.filter(s => String(s.titulo || '').trim() || String(s.texto || '').trim() || s.tes);
  t += its.length ? its.map((s, i) => {
    const corpo = s.tes ? textoTesouraria(a, s) : textoRico(fimFrase(s.texto), a) || '______';
    return `${B(`${i + 1}º) ${esc(fimFrase(s.titulo) || 'Assunto')}:`)} ${corpo}`;
  }).join('; ') + '.' : '______.';
  t += ` ${B('ENCERRAMENTO:')} Nada mais havendo a tratar, foi encerrada esta reunião com uma oração de agradecimento a Deus, às ${a.horaFim ? horaExt(a.horaFim) : '____ horas'}, da qual, para constar, foi redigida e digitada esta ata pelo irmão ${N(lv.nome)}, ${esc(lv.rotTexto)}, que, depois de lida e achada conforme, foi declarada aprovada pelo irmão Ancião na presidência. ${esc(e.regiao)}, ${a.data ? dataExt2(a.data) : '____ de __________ de ____'}.`;
  return t;
}

/* ---------- conferência ---------- */
function conferirReuniao(a) {
  const r = [], add = (nivel, txt) => r.push({ nivel, txt });
  if (!a.data) add('er', 'Falta a data da reunião');
  if (!a.hora) add('al', 'Falta o horário de início');
  if (!a.horaFim) add('al', 'Falta o horário do encerramento');
  else if (a.hora && a.horaFim <= a.hora) add('al', 'O encerramento está antes do início');
  if (!a.anciao) add('er', 'Falta o ancião que preside');
  if (!lavraReuniao(a).nome) add('er', 'Falta quem redige a ata');
  if (a.conduz && !assinaAdm(a).nome) add('al', `Falta o ${CARGO_ROT[a.conduz].toLowerCase()} (assina a ata)`);
  if (a.presentes == null) add('al', 'Falta o número de presentes');
  if (!String(a.hino || '').trim()) add('al', 'Falta o hino');
  if (!String(a.livro || '').trim() || !String(a.capitulo || '').trim()) add('al', 'Falta a Palavra (livro e capítulo)');
  if (!a.assuntos.length) add('er', 'Nenhum assunto');
  a.assuntos.forEach((s, i) => {
    const it = `${i + 1}º) ${fimFrase(s.titulo) || 'assunto'}`;
    if (!String(s.titulo || '').trim()) add('al', `${i + 1}º) assunto sem título`);
    if (s.tes) {
      const t = s.tes, falta = [['saldo bancário', t.saldo], ['coletas', t.coletas], ['despesas', t.despesas]].filter(([, v]) => v == null).map(([k]) => k);
      if (falta.length) add('al', `${it}: falta ${juntarE(falta)}`);
      if (!(String(t.quem || '').trim() || cargo(a, 'tesoureiro'))) add('al', `${it}: falta o tesoureiro`);
      const c = contasTes(t);
      if (t.piedade != null && t.piedade > c.rep) add('al', `${it}: transferência para a Piedade maior que o saldo para repartição`);
    } else if (!String(s.texto || '').trim()) add('al', `${it}: sem texto`);
  });
  const abrev = abreviacoes(a);
  if (abrev.length) add('al', `Abreviação no texto: ${abrev.slice(0, 4).join(', ')}`);
  const dup = a.data && DB.atas.find(x => x !== a && x.tipo === a.tipo && x.data === a.data);
  if (dup) add('al', `Já existe outra ${a.tipo} nesta data`);
  if (!compIgual(a)) add('al', 'O cadastro mudou depois desta ata');
  return r;
}

/* ---------- calendário anual: data, horário e número da reunião ---------- */
const CHAVE_CAL = 'ccb_calendario_reunioes_anual';
const RE_CAL = {
  RLA: [/^\W*(RLA|RMA)\b/i, /reuni[aã]o\s+(local\s+administrativa|mensal\s+do\s+minist[eé]rio\s+e\s+administra)/i],
  RLM: [/^\W*(RLM|RML)\b/i, /reuni[aã]o\s+(local\s+ministerial|do\s+minist[eé]rio\s+local)/i]
};
const contarCal = c => c ? Object.keys(c.dias || {}).reduce((s, k) => s + (c.dias[k] || []).length, 0) : 0;
const anoCal = c => +((c && c.meta || {}).ano) || 0;
const _cals = {};
async function calendarioDoAno(ano) {
  if (_cals[ano]) return _cals[ano];
  try { const c = JSON.parse(localStorage.getItem(CHAVE_CAL) || 'null'); if (c && anoCal(c) === ano && contarCal(c)) return (_cals[ano] = c); } catch (e) {}
  if (!localStorage.getItem('session_token')) return null;
  try {
    const lst = (await api('lista-list', { regiao: 'calendarioanual' })).arquivos || [];
    const fila = lst.filter(x => String(x.nome).includes(String(ano))).concat(lst.filter(x => !String(x.nome).includes(String(ano)))).slice(0, 8);
    for (const f of fila) {
      try {
        let c = (await api('lista-load', { regiao: 'calendarioanual', nome: f.nome })).conteudo;
        c = typeof c === 'string' ? JSON.parse(c) : c;
        if (anoCal(c) === ano && contarCal(c)) return (_cals[ano] = c);
      } catch (e) {}
    }
  } catch (e) {}
  return null;
}
const horaCal = h => { const m = String(h || '').match(/(\d{1,2})\s*[:hH.]?\s*(\d{2})?/); return m ? `${String(+m[1]).padStart(2, '0')}:${m[2] || '00'}` : ''; };
function reunioesNoCalendario(cal, tipo) {
  const ano = anoCal(cal), out = [];
  Object.keys(cal.dias || {}).forEach(k => (cal.dias[k] || []).forEach(e => { const x = String(e.x || ''); if (RE_CAL[tipo].some(re => re.test(x))) out.push({ data: `${ano}-${k}`, hora: horaCal(e.h), x }); }));
  out.sort((p, q) => p.data.localeCompare(q.data) || p.hora.localeCompare(q.hora));
  return out.filter((r, i) => !i || r.data !== out[i - 1].data);
}
// silencioso: ao criar a ata (só avisa se achou)
async function puxarCalendario(silencioso) {
  const a = ATA(); if (!ehReuniao(a)) return;
  const hoje = new Date(), hojeISO = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
  const ano = anoDe(a.data) || hoje.getFullYear();
  const cal = await calendarioDoAno(ano);
  if (!cal) { if (!silencioso) UI.toast(`Não achei o calendário anual de ${ano} (neste aparelho nem na nuvem). Preencha a data e o número à mão.`, 'info'); return; }
  const lst = reunioesNoCalendario(cal, a.tipo);
  if (!lst.length) { if (!silencioso) UI.toast(`O calendário de ${ano} não tem nenhuma ${a.tipo}${a.tipo === 'RLA' ? ' (nem RMA)' : ' (nem RML)'}.`, 'info'); return; }
  let i = a.data ? lst.findIndex(r => r.data === a.data) : -1;
  if (i < 0 && !a.data) {
    const usadas = new Set(DB.atas.filter(x => x !== a && x.tipo === a.tipo).map(x => x.data));
    i = lst.findIndex(r => r.data >= hojeISO && !usadas.has(r.data));
    if (i < 0) i = lst.findIndex(r => !usadas.has(r.data));
  }
  if (i < 0) { if (!silencioso) UI.toast(`Não há ${a.tipo} no calendário em ${dataBR(a.data)}. As de ${ano}: ${lst.map(r => dataBR(r.data).slice(0, 5)).join(', ')}.`, 'info'); return; }
  const antes = { data: a.data, hora: a.hora, numero: a.numero };
  const r = lst[i];
  a.data = r.data; if (r.hora && !(antes.data === r.data && a.hora)) a.hora = r.hora; a.numero = i + 1;
  guardar(); desenharTudo();
  UI.toast(`Do calendário: ${i + 1}ª ${a.tipo} de ${ano}, em ${dataBR(r.data)}${r.hora ? ' às ' + horaEdital(r.hora) : ''}.`, { type: 'ok', action: { label: 'Desfazer', icon: 'undo', fn: () => { Object.assign(a, antes); guardar(); desenharTudo(); } } });
}

/* ---------- criar ---------- */
function novaReuniao(tipo) {
  const ult = DB.atas.filter(x => x.tipo === tipo).sort((x, y) => String(y.data).localeCompare(String(x.data)))[0];
  const a = normalizarReuniao({ tipo });
  if (ult) {
    // mesma estrutura da anterior: os títulos dos assuntos ficam, os textos e valores vêm em branco
    ['hora', 'sala', 'endereco', 'presencaDesc', 'lavra', 'lavraNome', 'lavraCargo', 'conduz'].forEach(k => { a[k] = ult[k]; });
    a.opc = clone(ult.opc);
    a.assuntos = ult.assuntos.map(s => {
      const n = { titulo: s.titulo, texto: '', tes: null };
      if (s.tes) { n.tes = tesPadrao(); n.tes.quem = s.tes.quem; n.tes.outras = s.tes.outras.map(o => ({ r: o.r, v: null })); }
      return n;
    });
  } else {
    a.hora = tipo === 'RLA' ? '10:00' : '';
    a.assuntos = ASSUNTOS_PADRAO[tipo].map(t => assuntoPadrao(t, true));
  }
  a.comp = compDoCadastro();
  const pauta = a.assuntos.find(s => /pauta/i.test(s.titulo));
  if (pauta) { const lv = lavraReuniao(a); if (lv.nome) pauta.texto = `Apresentado pelo irmão ${lv.nome}, ${lv.rotTexto}, a pauta dos assuntos desta reunião`; }
  DB.atas.push(a); SEL = a.id; guardar();
  if (ABA !== 'atas') mudarAba('atas'); else desenharTudo();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  UI.toast(`Nova ${tipo} criada${ult ? ' com os mesmos assuntos da anterior' : ''}. Procurando a data no calendário…`, 'ok');
  puxarCalendario(true);
}

/* ---------- editor ---------- */
function addAssunto(titulo) {
  const a = ATA(); a.assuntos.push(assuntoPadrao(titulo || '', true)); guardar(); desenharEditor();
  focarUltimo(titulo ? '.rl-as .od textarea' : '.rl-as .od input[data-b$=".titulo"]');
}
function remAssunto(i) {
  const a = ATA(); const [s] = a.assuntos.splice(i, 1); guardar(); desenharEditor();
  UI.toast(`Assunto “${fimFrase(s.titulo) || 'sem título'}” removido.`, { action: { label: 'Desfazer', icon: 'undo', fn: () => { a.assuntos.splice(i, 0, s); guardar(); desenharEditor(); } } });
}
function moverAssunto(i, d) { const l = ATA().assuntos, j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; guardar(); desenharEditor(); }
function modoAssunto(i, tes) {
  const s = ATA().assuntos[i];
  if (tes && !s.tes) s.tes = s._tes || tesPadrao();
  if (!tes && s.tes) { s._tes = s.tes; s.tes = null; }
  guardar(); desenharEditor();
}
function addOutra(i) { ATA().assuntos[i].tes.outras.push({ r: '', v: null }); guardar(); desenharEditor(); focarUltimo(`[data-tes="${i}"] .vl input[data-b$=".r"]`); }
function remOutra(i, j) { ATA().assuntos[i].tes.outras.splice(j, 1); guardar(); desenharEditor(); }
function mudarTipoReuniao(t) { const a = ATA(); a.tipo = t; a.numero = null; guardar(); desenharTudo(); }

function blocoReuniao(a) {
  const e = DB.cad.ent;
  const selCargo = (b, v, ks, extra) => `<select data-b="${b}" data-r="ed">${ks.map(k => `<option value="${k}"${v === k ? ' selected' : ''}>${CARGO_ROT[k]}${a.comp.cargos[k] ? ' · ' + esc(a.comp.cargos[k]) : ' · (vago)'}</option>`).join('')}${extra || ''}</select>`;
  const auto = numeroAuto(a);
  return bloco('calendar', 'Reunião', 'Data, horários, presença e quem preside', `<div class="grid g4">
    ${campo('Tipo', `<select onchange="mudarTipoReuniao(this.value)">${TIPOS_REUNIAO.map(t => `<option value="${t}"${a.tipo === t ? ' selected' : ''}>${t} · ${NOME_REUNIAO[t].replace('Reunião Local ', '')}</option>`).join('')}</select>`)}
    ${campo('Data', `<input type="date" data-b="a:data" data-r="ed" value="${esc(a.data)}">`)}
    ${campo('Início', `<input type="time" data-b="a:hora" value="${esc(a.hora)}">`)}
    ${campo('Encerramento', `<input type="time" data-b="a:horaFim" value="${esc(a.horaFim)}">`)}
    ${campo(`Reunião do ano <small>(${a.numero ? 'definido' : 'automático'})</small>`, `<input inputmode="numeric" data-b="a:numero" data-t="int" data-r="ed" value="${a.numero || ''}" placeholder="${auto ? auto + 'ª' : 'ex.: 3'}">`)}
    ${campo('Irmãos presentes', `<input inputmode="numeric" data-b="a:presentes" data-t="int" value="${a.presentes == null ? '' : a.presentes}" placeholder="ex.: 91">`)}
    ${campo('Ancião que preside', inp('a:anciao', a.anciao, 'list="dlAnciaes" placeholder="Nome do ancião"'), 's2')}
    ${campo('Local', inp('a:sala', a.sala, `placeholder="${esc(SALA_PADRAO)}"`), 's2')}
    ${campo('Endereço <small>(se não for a sede)</small>', inp('a:endereco', a.endereco, `placeholder="${esc(`${e.rua}, número ${e.num}, ${e.bairro}`)}"`), 's2')}
    ${campo('Com a presença de', `<textarea data-b="a:presencaDesc" rows="2" placeholder="${esc(PRESENCA_PADRAO[a.tipo])}">${esc(a.presencaDesc)}</textarea>`, 's2')}
    ${campo('Redige a ata', `<select data-b="a:lavra" data-r="ed">${['secretario', 'vs1', 'vs2'].map(k => `<option value="${k}"${a.lavra === k ? ' selected' : ''}>${CARGO_ROT[k]}${a.comp.cargos[k] ? ' · ' + esc(a.comp.cargos[k]) : ' · (vago)'}</option>`).join('')}<option value="outro"${a.lavra === 'outro' ? ' selected' : ''}>Outro irmão…</option></select>`)}
    ${campo('Assina pela Administração', `<select data-b="a:conduz" data-r="ed"><option value=""${!a.conduz ? ' selected' : ''}>Ninguém (só ancião e quem redige)</option>${['presidente', 'vp1', 'vp2'].map(k => `<option value="${k}"${a.conduz === k ? ' selected' : ''}>${CARGO_ROT[k]}${a.comp.cargos[k] ? ' · ' + esc(a.comp.cargos[k]) : ' · (vago)'}</option>`).join('')}</select>`)}
    ${a.lavra === 'outro' ? campo('Nome de quem redige', inp('a:lavraNome', a.lavraNome, 'list="dlPessoas" placeholder="Nome"')) + campo('Ministério ou cargo', inp('a:lavraCargo', a.lavraCargo, 'placeholder="ex.: Cooperador do Ofício Ministerial"')) : ''}
  </div><div class="linha-b"><button type="button" class="mais" onclick="puxarCalendario()">${ICO('calendar')}Puxar data e número do calendário anual</button></div>`);
}
function blocoAbertura(a) {
  return bloco('book', 'Abertura', 'Hino e a Palavra que o Senhor revelou', `<div class="grid g4">
    ${campo('Hino', `<input inputmode="numeric" data-b="a:hino" value="${esc(a.hino)}" placeholder="ex.: 244">`)}
    ${campo('Livro', inp('a:livro', a.livro, 'list="dlLivros" placeholder="ex.: Atos"'))}
    ${campo('Capítulo', `<input inputmode="numeric" data-b="a:capitulo" value="${esc(a.capitulo)}" placeholder="ex.: 3">`)}
    <div class="grid g2" style="gap:8px">${campo('Do verso', `<input inputmode="numeric" data-b="a:versoIni" value="${esc(a.versoIni)}" placeholder="1">`)}${campo('ao verso', `<input inputmode="numeric" data-b="a:versoFim" value="${esc(a.versoFim)}" placeholder="12">`)}</div>
    ${campo('Título <small>(como está na Bíblia)</small>', inp('a:tituloPalavra', a.tituloPalavra, 'placeholder="ex.: Cura dum coxo; discurso de Pedro no templo"'), 's2')}
    <div class="s2 dica" style="margin:22px 0 0" data-d="rl-palavra">${palavraPrevia(a)}</div>
  </div>`);
}
function palavraPrevia(a) {
  const l = livroFrase(a.livro);
  return l ? `Sai na ata: “o ${/salmos/i.test(l) ? 'Salmo' : 'Capítulo'} ${esc(a.capitulo || '__')}${/salmos/i.test(l) ? '' : ' ' + esc(l)}…”` : 'Escolha o livro na lista (Romanos, 1 Coríntios, Atos…).';
}
function blocoTes(a, s, i) {
  const t = s.tes, c = contasTes(t), din = (cam, v, ph) => `<input class="num" inputmode="decimal" data-b="a:assuntos.${i}.tes.${cam}" data-t="money" value="${fmtR(v)}" placeholder="${ph || '0,00'}">`;
  const ma = mesAnterior(a.data);
  return `<div class="tes" data-tes="${i}"><div class="grid g3">
      ${campo('Tesoureiro', inp(`a:assuntos.${i}.tes.quem`, t.quem, `list="dlPessoas" placeholder="${esc(cargo(a, 'tesoureiro') || 'Nome')}"`))}
      ${campo('Mês do movimento', inp(`a:assuntos.${i}.tes.mes`, t.mes, `placeholder="${ma ? MESES[ma.m - 1] : 'ex.: abril'}"`))}
      ${campo('Saldo bancário até', `<input type="date" data-b="a:assuntos.${i}.tes.dataSaldo" value="${esc(t.dataSaldo || (ma ? ma.ult : ''))}">`)}
      ${campo('Saldo bancário (R$)', din('saldo', t.saldo))}
      ${campo('Coletas do mês (R$)', din('coletas', t.coletas))}
      ${campo('Despesas financeiras (R$)', din('despesas', t.despesas))}
    </div>
    <div class="sub-t">Outras receitas do mês</div>
    ${t.outras.map((o, j) => `<div class="vl"><input data-b="a:assuntos.${i}.tes.outras.${j}.r" value="${esc(o.r)}" placeholder="ex.: rateio da reforma da administração"><input class="num" inputmode="decimal" data-b="a:assuntos.${i}.tes.outras.${j}.v" data-t="money" value="${fmtR(o.v)}" placeholder="0,00"><button type="button" class="x" title="Remover" onclick="remOutra(${i},${j})">${ICO('x')}</button></div>`).join('')}
    <div class="linha-b" style="margin-top:6px"><button type="button" class="mais" onclick="addOutra(${i})">${ICO('plus')}Receita</button></div>
    <div class="tes-c"><div><span>Total de receitas</span><b data-d="rt:${i}:rec">${fmtR(c.rec)}</b></div><div><span>Saldo para repartição</span><b data-d="rt:${i}:rep">${fmtR(c.rep)}</b></div></div>
    <div class="grid g3" style="margin-top:12px">
      ${campo('Transferir para a Piedade (R$)', din('piedade', t.piedade))}
      ${campo('Fica com a Administração', `<input readonly class="num" data-d="rt:${i}:perm" value="${t.piedade != null ? fmtR(c.perm) : ''}">`)}
      ${campo('Provisionado p/ contas a pagar (R$)', din('provisionado', t.provisionado))}
      ${campo('Construções, reformas e terrenos em andamento (R$)', din('construcoes', t.construcoes), 's2')}
    </div>
    ${campo('Mais alguma informação da tesouraria <small>(entra no fim)</small>', `<textarea data-b="a:assuntos.${i}.tes.obs" rows="2" placeholder="Opcional">${esc(t.obs)}</textarea>`)}
    <div class="dica" style="margin:8px 0 0">Os totais somam sozinhos. Linha em branco não entra na ata.</div></div>`;
}
function blocoAssuntos(a) {
  const its = a.assuntos.map((s, i) => `<div class="od"><span class="le">${i + 1}º</span><div class="od-c">
      <input data-b="a:assuntos.${i}.titulo" data-r="ed" value="${esc(s.titulo)}" placeholder="Título (ex.: Setor Secretaria)" list="dlAssuntos" style="font-weight:700">
      <div class="acao"><button type="button" class="${s.tes ? '' : 'on'}" onclick="modoAssunto(${i},false)">Texto</button><button type="button" class="${s.tes ? 'on' : ''}" onclick="modoAssunto(${i},true)">Movimento da tesouraria</button></div>
      ${s.tes ? '' : `<textarea data-b="a:assuntos.${i}.texto" rows="3" placeholder="O que foi apresentado, considerado ou orientado. Nomes do cadastro e valores em R$ saem em negrito sozinhos; para outro negrito use **assim**.">${esc(s.texto)}</textarea>`}</div>
    <div class="od-a"><button type="button" class="mv" title="Subir" onclick="moverAssunto(${i},-1)"${i ? '' : ' disabled'}>${ICO('arrow-up')}</button><button type="button" class="mv" title="Descer" onclick="moverAssunto(${i},1)"${i < a.assuntos.length - 1 ? '' : ' disabled'}>${ICO('arrow-down')}</button><button type="button" class="x" title="Remover assunto" onclick="remAssunto(${i})">${ICO('trash')}</button></div>
    ${s.tes ? `<div class="od-x">${blocoTes(a, s, i)}</div>` : ''}</div>`).join('');
  const tem = new Set(a.assuntos.map(s => norm(s.titulo)));
  const sug = ASSUNTOS_SUGERIDOS.filter(t => !tem.has(norm(t)));
  return `<div class="rl-as">${bloco('file', 'Assuntos', 'Na ordem em que foram apresentados · saem numerados (1º, 2º…)', `${its || '<div class="vazio">Nenhum assunto. Adicione abaixo.</div>'}
    <div class="linha-b"><button type="button" class="mais" onclick="addAssunto()">${ICO('plus')}Adicionar assunto</button></div>
    ${sug.length ? `<div class="sub-t">Assuntos comuns</div><div class="acao">${sug.map(t => `<button type="button" onclick="addAssunto('${t}')">${ICO('plus')}${t}</button>`).join('')}</div>` : ''}`, `<em>${a.assuntos.length} ${a.assuntos.length === 1 ? 'assunto' : 'assuntos'}</em>`)}</div>`;
}
function blocoDocReuniao(a) {
  return bloco('print', 'O que vai no PDF', 'A ata sempre vai', `<div class="grid g2">
    <div class="ck" style="gap:10px">Lista de assinaturas (nome, localidade e cargo): <input inputmode="numeric" data-b="a:opc.presenca" data-t="int" value="${a.opc.presenca ?? 0}" style="width:70px"> folhas</div>
  </div><div class="dica" style="margin:12px 0 0">A relação de presentes do SIGA continua sendo anexada à parte. A lista daqui é para quem não registrou presença pelo cartão.</div>`);
}
function desenharReuniao(a) {
  return blocoReuniao(a) + blocoAbertura(a) + blocoAssuntos(a) + blocoPessoas(a) + blocoDocReuniao(a) + blocoTexto(a);
}
function derivadosReuniao(a, el, k) {
  if (k === 'rl-palavra') return palavraPrevia(a);
  if (k.startsWith('rt:')) {
    const [, i, q] = k.split(':'); const s = a.assuntos[+i]; if (!s || !s.tes) return null;
    const c = contasTes(s.tes); if (q === 'perm' && s.tes.piedade == null) return '';
    return fmtR(c[q]);
  }
  return null;
}
function subHeroiReuniao(a) {
  const n = numeroReuniao(a);
  return [n ? `${n}ª do ano` : '', a.hora ? horaEdital(a.hora) + (a.horaFim ? ' às ' + horaEdital(a.horaFim) : '') : '', a.presentes != null ? `${a.presentes} presentes` : '', `${a.assuntos.length} ${a.assuntos.length === 1 ? 'assunto' : 'assuntos'}`].filter(Boolean).join(' · ');
}

/* ---------- documento para impressão ---------- */
function documentoReuniaoHTML(a) {
  const e = DB.cad.ent, n = numeroReuniao(a), nome = NOME_REUNIAO[a.tipo];
  const tit = `ATA DA ${n ? n + 'ª' : '____'} ${nome.toUpperCase()} – ${a.tipo}, REALIZADA NO DIA ${a.data ? dataExt2(a.data).toUpperCase() : '____ DE __________ DE ____'}, EM ${esc(e.regiao.toUpperCase())} – ${esc(e.uf.toUpperCase())}.`;
  const INUT = '<span class="inut" aria-hidden="true"></span>';
  const lv = lavraReuniao(a), adm = assinaAdm(a);
  const as = (nomeP, cargoP) => `<div class="as"><div class="ln"></div><div class="an">${esc(nomeP || '')}</div><div class="ac">${esc(cargoP)}</div></div>`;
  const assin = `<div class="assin-r"><div class="ar1">${as(a.anciao, 'Ancião')}</div><div class="ar2">${adm ? as(adm.nome, adm.cargoExt) : '<div></div>'}${as(lv.nome, lv.cargoExt)}</div></div>`;
  const cab = `<div class="cab-r"><img src="${location.origin}/assets/ccb-logo.png" alt=""><div class="cr-t"><div>${esc(e.nome)}</div><div>CNPJ: ${esc(e.cnpj)}</div><div>Administração ${esc(e.regiao)} - ${esc(e.uf)}</div></div></div>`;
  const rod = `<div class="rod-r">Sede Administrativa: ${esc(e.rua)}, ${esc(e.num)} – ${esc(e.bairro)}, CEP: ${esc(e.cep)} – ${esc(e.regiao)} – ${esc(e.uf)}.</div>`;
  let corpo = `<section class="folha"><table class="pg"><thead><tr><td>${cab}</td></tr></thead><tfoot><tr><td><div class="rod-esp"></div></td></tr></tfoot><tbody><tr><td>
    <h1 class="t-rl">${tit}</h1><div class="ata"><p>${textoAtaHTML(a)}${INUT}</p></div>${assin}</td></tr></tbody></table></section>`;
  const fl = Math.max(0, Math.min(20, +a.opc.presenca || 0));
  for (let f = 0; f < fl; f++) {
    const lin = Array.from({ length: 34 }, (_, k) => `<tr><td class="nm"><span>${f * 34 + k + 1}</span></td><td></td><td></td></tr>`).join('');
    corpo += `<section class="folha lista-r"><table class="lr"><thead><tr><th colspan="3" class="lr-t">${nome.toUpperCase()} - ${a.tipo} - ${dataBR(a.data)}</th></tr><tr class="lr-v"><td colspan="3"></td></tr><tr><th>NOME</th><th>LOCALIDADE</th><th>CARGO</th></tr></thead><tbody>${lin}</tbody></table></section>`;
  }
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${a.tipo} ${a.data ? dataHif(a.data) : ''} - ${esc(e.regiao)}</title><style>
${fontesCSS()}
@page{size:A4 portrait;margin:10mm 16mm 9mm 20mm}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:'ArialAta',Arial,sans-serif;color:#111;font-size:12pt;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.folha{break-before:page;page-break-before:always}
.folha:first-child{break-before:auto;page-break-before:auto}
p{margin:0}
table.pg{width:100%;border-collapse:collapse}
table.pg > thead > tr > td,table.pg > tbody > tr > td,table.pg > tfoot > tr > td{padding:0;vertical-align:top}
.cab-r{display:flex;align-items:center;gap:0;margin:0 0 5mm 8mm}
.cab-r img{width:42mm;height:auto;display:block;opacity:.82}
.cr-t{flex:1;text-align:center;font-family:'Times New Roman','Liberation Serif',Tinos,serif;font-style:italic;font-weight:700;font-size:13.5pt;line-height:1.2;color:#222;padding-right:22mm}
.rod-esp{height:9mm}
.rod-r{position:fixed;left:0;right:0;bottom:0;text-align:center;font-family:'Times New Roman','Liberation Serif',Tinos,serif;font-weight:700;font-size:9.5pt;color:#222}
.t-rl{font-size:12pt;font-weight:700;text-align:justify;line-height:1.15;margin:0 0 4mm}
.ata{font-size:12pt;line-height:1.15}
.ata p{text-align:justify;overflow:hidden;margin:0}
.ata .inut{display:inline-block;width:0;white-space:nowrap;vertical-align:baseline}
.ata .inut::after{content:"\\00a0${'-'.repeat(320)}";letter-spacing:.4pt}
.assin-r{margin-top:14mm;break-inside:avoid}
.assin-r .ar1{width:80mm;margin:0 auto 12mm}
.assin-r .ar2{display:grid;grid-template-columns:1fr 1fr;gap:24mm;padding:0 4mm}
.as{text-align:center;break-inside:avoid}
.as .ln{border-top:.8pt solid #222;margin:0 2mm 1.2mm;height:0}
.as .an{font-size:12pt}
.as .ac{font-size:12pt;font-weight:700}
table.lr{width:100%;border-collapse:collapse;font-family:Calibri,Carlito,'ArialAta',Arial,sans-serif;font-size:10.5pt}
table.lr th,table.lr td{border:.8pt solid #333}
table.lr th{font-weight:700;padding:1.2mm;font-size:10.5pt}
.lr-t{text-decoration:underline;font-size:12pt !important}
.lr-v td{height:5mm}
table.lr th:nth-child(1){width:57%}
table.lr th:nth-child(2){width:19.5%}
table.lr tbody td{height:7.15mm;vertical-align:bottom;padding:0 1mm .6mm}
table.lr td.nm span{font-size:9pt}
table.lr tr{break-inside:avoid}
b{font-weight:700}
</style></head><body>${corpo}${rod}</body></html>`;
}
