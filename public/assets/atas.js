/* =====================================================================
   Atas e Assembleias (AGO / AGE) da Administração.

   DB = { versao, cad, atas:[...], atualizado }
     cad  = cadastro: cabeçalho/sede, irmãos (dados pessoais), cargos da
            administração e mandato, Conselho Fiscal, anciães, auxiliares,
            colaboradores por setor e textos padrão.
     atas = cada assembleia: dados, edital (ordem do dia), relatório,
            contábil (DRE e balanço), Conselho Fiscal, opções do documento.
            Cada ata guarda em "comp" quem ocupava cada cargo quando foi
            feita (puxado do cadastro); os dados pessoais (RG, CPF,
            endereço) vêm sempre do cadastro.

   Neste aparelho: localStorage 'ccb_atas'. Na nuvem: lista "atas",
   arquivo "_atas" (o "_" esconde ele das telas de listas).
   Nenhum dado pessoal fica neste arquivo: tudo vem do cadastro.
   ===================================================================== */
'use strict';

const ARQ_NUVEM = '_atas';
const REGIAO = 'atas';
const KEY = 'ccb_atas';
const ICO = n => `<svg class="ic" aria-hidden="true"><use href="/assets/icons.svg#i-${n}"></use></svg>`;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const novoId = () => 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clone = o => JSON.parse(JSON.stringify(o));
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
const limpos = v => (Array.isArray(v) ? v : []).map(x => String(x || '').trim()).filter(Boolean);
const LETRAS = 'abcdefghijklmnopqrstuvwxyz';
const NOME_TIPO = { AGO: 'Assembleia Geral Ordinária', AGE: 'Assembleia Geral Extraordinária', RLA: 'Reunião Local Administrativa Trimestral', RLM: 'Reunião Local Ministerial Trimestral' };

/* ---------- números e datas ---------- */
function parseBR(t) {
  t = String(t == null ? '' : t).trim().replace(/[R$\s]/g, '');
  if (!t) return null;
  let neg = /^\(.*\)$/.test(t) || /^-/.test(t);
  t = t.replace(/[()\-]/g, '');
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if (!/^\d+\.\d{1,2}$/.test(t)) t = t.replace(/\./g, '');
  const n = parseFloat(t);
  if (!isFinite(n)) return null;
  return Math.round((neg ? -n : n) * 100) / 100;
}
const r2 = n => Math.round((n || 0) * 100) / 100;
const fmtR = n => (n == null || n === '' || !isFinite(n)) ? '' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtI = n => (n == null || n === '' || !isFinite(n)) ? '' : Number(n).toLocaleString('pt-BR');
const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const partesData = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; };
const dataExt = iso => { const p = partesData(iso); return p ? `${p.d} de ${MESES[p.m - 1]} de ${p.y}` : '____ de __________ de ____'; };
const dataExt2 = iso => { const p = partesData(iso); return p ? `${String(p.d).padStart(2, '0')} de ${MESES[p.m - 1]} de ${p.y}` : '____ de __________ de ____'; };
const dataBR = iso => { const p = partesData(iso); return p ? `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}/${p.y}` : '__/__/____'; };
const dataHif = iso => dataBR(iso).replace(/\//g, '-');
const anoDe = iso => { const p = partesData(iso); return p ? p.y : null; };
const somaAno = (iso, n) => { const p = partesData(iso); return p ? `${p.y + n}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}` : ''; };
const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

const UN = ['zero','um','dois','três','quatro','cinco','seis','sete','oito','nove','dez','onze','doze','treze','quatorze','quinze','dezesseis','dezessete','dezoito','dezenove'];
const DZ = ['','','vinte','trinta','quarenta','cinquenta','sessenta','setenta','oitenta','noventa'];
const CT = ['','cento','duzentos','trezentos','quatrocentos','quinhentos','seiscentos','setecentos','oitocentos','novecentos'];
function ate999(n) {
  if (n < 20) return UN[n];
  if (n < 100) return DZ[Math.floor(n / 10)] + (n % 10 ? ' e ' + UN[n % 10] : '');
  if (n === 100) return 'cem';
  return CT[Math.floor(n / 100)] + (n % 100 ? ' e ' + ate999(n % 100) : '');
}
function ate999999(n) {
  if (n < 1000) return ate999(n);
  const mil = Math.floor(n / 1000), r = n % 1000;
  const m = mil === 1 ? 'mil' : ate999(mil) + ' mil';
  if (!r) return m;
  return m + ((r < 100 || r % 100 === 0) ? ' e ' : ' ') + ate999(r);
}
function extenso(n) {
  n = Math.floor(Math.abs(+n || 0));
  if (n < 1000000) return ate999999(n);
  const mi = Math.floor(n / 1000000), r = n % 1000000;
  const m = mi === 1 ? 'um milhão' : ate999(mi) + ' milhões';
  if (!r) return m;
  return m + ((r < 100 || (r < 1000000 && r % 1000 === 0 && r % 100000 === 0) || (r % 100 === 0 && r < 1000)) ? ' e ' : ' ') + ate999999(r);
}
// feminino (pessoas, irmãs, bíblias, casas): "duzentas e vinte e uma"
const fem = s => s.replace(/\bum\b/g, 'uma').replace(/\bdois\b/g, 'duas').replace(/\b(duz|trez|quatroc|quinh|seisc|setec|oitoc|novec)entos\b/g, '$1entas').replace(/\bquinhentos\b/g, 'quinhentas').replace(/\buma mil\b/g, 'um mil').replace(/\buma milhão\b/g, 'um milhão').replace(/\bduas milhões\b/g, 'dois milhões');
// "duzentas e vinte (220)"
const numExt = (n, f) => n == null || n === '' ? '______ (____)' : `${f ? fem(extenso(n)) : extenso(n)} (${fmtI(n)})`;
// "primeiro de abril de dois mil e vinte e seis"
function dataPorExtenso(iso) {
  const p = partesData(iso); if (!p) return '____ de __________ de ____';
  return `${p.d === 1 ? 'primeiro' : extenso(p.d)} de ${MESES[p.m - 1]} de ${extenso(p.y)}`;
}
// "R$ 94.235,00 (noventa e quatro mil, duzentos e trinta e cinco reais)"
function reaisExt(v) {
  if (v == null || !isFinite(v)) return 'R$ ______ (______)';
  const c = Math.round(Math.abs(v) * 100), r = Math.floor(c / 100), ct = c % 100;
  let t = r ? extenso(r).replace(/ mil (?!e )/, ' mil, ') + (r === 1 ? ' real' : (r % 1000000 === 0 ? ' de reais' : ' reais')) : '';
  if (ct) t += (t ? ' e ' : '') + extenso(ct) + (ct === 1 ? ' centavo' : ' centavos');
  return `R$ ${fmtR(Math.abs(v))} (${t || 'zero real'})`;
}
function horaExt(h) {
  const m = /^(\d{1,2}):(\d{2})/.exec(h || ''); if (!m) return '';
  const H = +m[1], M = +m[2];
  let t = fem(extenso(H)) + (H === 1 ? ' hora' : ' horas');
  if (M) t += ' e ' + extenso(M) + (M === 1 ? ' minuto' : ' minutos');
  return t;
}
const horaEdital = h => { const m = /^(\d{1,2}):(\d{2})/.exec(h || ''); return m ? `${+m[1]}h${m[2]}` : '__h__'; };
function diaAbertura(iso) {
  const p = partesData(iso); if (!p) return 'Aos ____ dias do mês de __________ de ____';
  return (p.d === 1 ? 'Ao primeiro dia' : `Aos ${extenso(p.d)} dias`) + ` do mês de ${MESES[p.m - 1]} de ${extenso(p.y)}`;
}
const fimFrase = t => { t = String(t || '').trim(); return t ? t.replace(/[\s;,.:]+$/, '') : t; };
const comPonto = t => { t = fimFrase(t); return t ? t + '.' : t; };

/* ---------- padrões (sem dados pessoais) ---------- */
const CARGOS = [
  ['presidente','Presidente'], ['vp1','1º Vice-presidente'], ['vp2','2º Vice-presidente'],
  ['secretario','Secretário'], ['vs1','1º Vice-secretário'], ['vs2','2º Vice-secretário'],
  ['tesoureiro','Tesoureiro'], ['vt1','1º Vice-tesoureiro'], ['vt2','2º Vice-tesoureiro'],
  ['contador','Contador']
];
const CARGO_ROT = Object.fromEntries(CARGOS);
// no texto da ata, sem abreviações (1º -> Primeiro)
const CARGO_EXT = { presidente: 'Presidente', vp1: 'Primeiro Vice-Presidente', vp2: 'Segundo Vice-Presidente', secretario: 'Secretário', vs1: 'Primeiro Vice-Secretário', vs2: 'Segundo Vice-Secretário', tesoureiro: 'Tesoureiro', vt1: 'Primeiro Vice-Tesoureiro', vt2: 'Segundo Vice-Tesoureiro' };
// cargos do estatuto (o contador não entra na ata: art. 30)
const CARGOS_ESTATUTO = CARGOS.filter(([k]) => k !== 'contador');
const CARGOS_CF = [['cf', 'Membro do Conselho Fiscal'], ['cfs', 'Suplente do Conselho Fiscal']];
function chaveCargo(rot) {
  const n = norm(rot).replace(/[º°]/g, '').replace(/\b1\b/, 'primeiro').replace(/\b2\b/, 'segundo').replace(/-/g, ' ');
  const achar = CARGOS_ESTATUTO.find(([k, r]) => norm(r).replace(/[º°]/g, '').replace(/\b1\b/, 'primeiro').replace(/\b2\b/, 'segundo').replace(/-/g, ' ') === n || norm(CARGO_EXT[k]).replace(/-/g, ' ') === n);
  if (achar) return achar[0];
  if (/suplente/.test(n)) return 'cfs';
  if (/conselho fiscal/.test(n)) return 'cf';
  return null;
}
const cargoTexto = rot => { const k = chaveCargo(rot); return k && CARGO_EXT[k] ? CARGO_EXT[k] : rot; };
const GRUPOS_CARGO = [['Presidência', ['presidente','vp1','vp2']], ['Secretaria', ['secretario','vs1','vs2']], ['Tesouraria', ['tesoureiro','vt1','vt2']]];
const ESTADO_CIVIL = ['casado','solteiro','viúvo','divorciado','separado judicialmente','em união estável'];
const DOC_TIPOS = { rg: 'Cédula de Identidade Civil – RG', cin: 'Carteira de Identidade Nacional – CIN' };
const ACOES = {
  relatorio: { rot: 'Relatório e balanço', so: 'AGO', txt: 'Leitura do relatório do movimento espiritual e material da Obra de Deus, bem como do Balanço Patrimonial e demais anexos referentes ao exercício encerrado em 31/12/{exercicio}.' },
  parecer:   { rot: 'Parecer do Conselho Fiscal', so: 'AGO', txt: 'Leitura do Parecer do Conselho Fiscal, e aprovação do relatório apresentado.' },
  conselho:  { rot: 'Posse do Conselho Fiscal', so: 'AGO', txt: 'Apresentação e posse do Conselho Fiscal para o exercício de {ano}.' },
  trienio:   { rot: 'Posse da Administração (triênio)', so: 'AGO', txt: 'Apresentação e posse da Administração para o triênio de {ano} a {ano3}.' },
  posse:     { rot: 'Cargo vago', txt: 'Preenchimento de cargo(s) vago(s) na Administração.' },
  sede:      { rot: 'Alteração da sede', so: 'AGO', txt: 'Alteração da sede administrativa.' },
  livre:     { rot: 'Outro assunto', txt: '' }
};
const TEXTO_PARECER = 'O Conselho Fiscal da Congregação Cristã no Brasil – Região de {regiao}, através de seus membros abaixo assinados, e no cumprimento de suas atribuições legais e estatutárias, examinou o Balanço Patrimonial e as Demonstrações Contábeis correspondentes ao exercício findo em 31 de dezembro de {exercicio}, e é de parecer de que os mesmos representam adequadamente, em todos os aspectos relevantes, a posição patrimonial e financeira da entidade, de acordo com as práticas contábeis emanadas da legislação vigente, recomendando à irmandade sua aprovação.\n\nA Deus, por Nosso Senhor e Salvador Jesus Cristo, tributemos todo o louvor e toda a honra por mais essas bênçãos alcançadas e pelo progresso da sua Santa Obra.';
const TEXTO_CONCLUSAO = 'Tudo o que aqui foi demonstrado é Obra de Deus. Ele desperta, prepara, determina e opera, manifestando assim a Sua Glória.\n\nAssim, damos Graças a Deus por nos ter ajudado a desempenhar nossas funções no decorrer do ano que se findou. Cumprimos mais uma etapa na missão que Ele nos tem confiado, na Sua Gloriosa Obra.\n\nTemos por certo que, se tão somente permanecermos na humildade, na obediência à eterna vontade do Criador, ainda maior Glória veremos manifestar aqui nesta Igreja, e no século vindouro então entraremos no Lar Eterno onde contemplaremos a face do nosso Deus, e lá viveremos para sempre.\n\nA Deus, por Jesus Cristo, seja dada toda honra, louvor, glória e poder para todo o sempre. Amém!';
const SETORES_PADRAO = ['Departamento Diáconos','Depósito da Piedade','Tesouraria','Compras','Informática','Distribuidora','Ativo Imobilizado','Manutenção Preventiva','Engenharia','Trabalho Voluntário','Departamento de Segurança','Secretaria','Patrimônio Bens Imóveis','Contabilidade','Fundo Musical'];
const CATS_OBREIROS = ['Ancião','Diácono','Cooperador do Ofício Ministerial','Cooperador de Jovens e Menores'];
const CAT_SING = { 'anciaes': 'Ancião', 'diaconos': 'Diácono', 'cooperador do oficio ministerial': 'Cooperador do Ofício Ministerial', 'cooperadores do oficio ministerial': 'Cooperador do Ofício Ministerial', 'cooperador de jovens e menores': 'Cooperador de Jovens e Menores', 'cooperadores de jovens e menores': 'Cooperador de Jovens e Menores' };
const it = (r, v) => ({ r, v: v == null ? null : v });
function contabilPadrao() {
  return {
    dre: {
      rec: [
        { t: 'COLETAS E OFERTAS', i: ['OFERTAS PARA MANUTENÇÃO E INVESTIMENTO PATRIMONIAL', 'OFERTAS PARA NECESSIDADES ESPIRITUAIS - OBRA DA PIEDADE E VIAGENS', 'FUNDO MUSICAL', 'OFERTA BÍBLIAS E HINÁRIOS'].map(r => it(r)) },
        { t: 'OFERTAS DE MÃO DE OBRA VOLUNTÁRIA', i: ['MÃO DE OBRA VOLUNTÁRIA CUSTEIO', 'MÃO DE OBRA VOLUNTÁRIA INVESTIMENTO'].map(r => it(r)) },
        { t: 'RECEITAS DIVERSAS', i: ['RECEITA COM APLICAÇÕES FINANCEIRAS', 'DESCONTOS OBTIDOS', 'OUTRAS RECEITAS'].map(r => it(r)) },
        { t: 'TRANSFERÊNCIAS RECEBIDAS', i: [it('TRANSFERÊNCIAS RECEBIDAS DE OUTRAS ADMINISTRAÇÕES')] },
        { t: 'RECEITA C/DISTRIBUIÇÃO BÍBLIAS E HINÁRIOS', i: [it('RECEITA C/DISTRIBUIÇÃO BÍBLIAS E HINÁRIOS')] }
      ],
      desp: [
        { t: 'DESPESAS GERAIS', i: ['SERVIÇOS DE MANUTENÇÃO GERAL, ENERGIA, ÁGUA, ALUGUÉIS', 'MATERIAIS DE MANUTENÇÃO GERAL, CONSERVAÇÃO E LIMPEZA', 'ALIMENTAÇÃO, IMPOSTOS E TAXAS, SEGUROS', 'DEPRECIAÇÕES E AMORTIZAÇÕES', 'DESPESAS FINANCEIRAS', 'SALÁRIOS E ENCARGOS SOCIAIS', 'MÃO DE OBRA VOLUNTÁRIA MANUTENÇÃO E ADMINISTRAÇÃO', 'DESPESAS COM ATENDIMENTO OBRA DA PIEDADE', 'DESPESAS COM VIAGENS MISSIONÁRIAS', 'DESPESAS COM ASSEMBLÉIAS E REUNIÕES', 'TRANSFERÊNCIAS REMETIDAS PARA OUTRAS ADMINISTRAÇÕES', 'OUTRAS DESPESAS'].map(r => it(r)) }
      ]
    },
    bal: {
      ativo: [
        { t: 'CIRCULANTE', i: ['CAIXA/BANCOS /APLICAÇÕES FINANCEIRAS', 'TÍTULOS A RECEBER/ ADIANTAMENTO A FORNECEDORES E VIAGENS', 'ESTOQUES BÍBLIAS/HINÁRIOS E ATENDIMENTO OBRA DA PIEDADE'].map(r => it(r)) },
        { t: 'IMOBILIZADO', i: ['TERRENOS E CONSTRUÇÕES', 'CONGREGAÇÕES EM CONSTRUÇÃO E REFORMAS', 'MÓVEIS E UTENSÍLIOS, INSTALAÇÕES, EQUIPAMENTOS DE INFORMÁTICA, ÓRGÃOS, MÁQUINAS E FERRAMENTAS', '(-) DEPRECIAÇÕES ACUMULADAS'].map(r => it(r)) }
      ],
      passivo: [
        { t: 'CIRCULANTE', i: [it('FORNECEDORES /OBRIGAÇÕES SOCIAIS E TRIBUTÁRIAS /CREDORES DIVERSOS')] },
        { t: 'PATRIMÔNIO LÍQUIDO', i: [it('PATRIMÔNIO SOCIAL'), { r: '', v: null, auto: 'resultado' }] }
      ]
    }
  };
}
function cadastroPadrao() {
  return {
    ent: {
      nome: 'CONGREGAÇÃO CRISTÃ NO BRASIL', cnpj: '75.899.427/0001-72',
      regiao: 'Campo Mourão', uf: 'Paraná', ufSigla: 'PR',
      rua: 'Rua Prefeito Devete de Paula Xavier', num: '649', bairro: 'Centro', cep: '87301-100', fone: '(44) 3525-1471',
      casa: 'Central',
      municipios: 'Araruna, Engenheiro Beltrão, Iretama, Farol, Luiziana, Peabiru, Roncador e Quinta do Sol'
    },
    pessoas: [],
    adm: { inicio: '', fim: '', cargos: Object.fromEntries(CARGOS.map(([k]) => [k, ''])), crc: '' },
    cf: { membros: ['', '', ''], suplente: '' },
    anciaes: [], anciaesFonte: 'relatorio', auxiliares: [],
    setores: SETORES_PADRAO.map(n => ({ nome: n, sub: n === 'Depósito da Piedade', nomes: [] })),
    textos: { parecer: TEXTO_PARECER, conclusao: TEXTO_CONCLUSAO }
  };
}
function pessoaPadrao(nome) {
  return { id: novoId(), nome: nome || '', nacionalidade: 'brasileiro', estadoCivil: '', profissao: '', docTipo: 'rg', doc: '', cpf: '', endereco: '' };
}

/* ---------- estado ---------- */
let DB = null;
let SEL = null;           // id da ata aberta
let ABA = 'atas';
let CONT_ABA = 'dre';
let PENDENTE = false;
let NUVEM_EM = null;
let FILTRO_PES = '';

function normalizarDB(d) {
  d = d && typeof d === 'object' ? d : {};
  const base = cadastroPadrao(), c = d.cad && typeof d.cad === 'object' ? d.cad : {};
  const cad = Object.assign(base, c);
  cad.ent = Object.assign(cadastroPadrao().ent, c.ent || {});
  cad.adm = Object.assign(cadastroPadrao().adm, c.adm || {});
  cad.adm.cargos = Object.assign(cadastroPadrao().adm.cargos, (c.adm && c.adm.cargos) || {});
  cad.cf = Object.assign({ membros: ['', '', ''], suplente: '' }, c.cf || {});
  while (cad.cf.membros.length < 3) cad.cf.membros.push('');
  cad.textos = Object.assign({ parecer: TEXTO_PARECER, conclusao: TEXTO_CONCLUSAO }, c.textos || {});
  cad.pessoas = (Array.isArray(c.pessoas) ? c.pessoas : []).map(p => Object.assign(pessoaPadrao(), p));
  ['anciaes', 'auxiliares'].forEach(k => { if (!Array.isArray(cad[k])) cad[k] = []; });
  if (!Array.isArray(cad.setores)) cad.setores = cadastroPadrao().setores;
  const atas = (Array.isArray(d.atas) ? d.atas : []).map(x => { const n = normalizarAta(x); if (!x.comp) n.comp = compDoCadastro(cad); return n; });
  return { versao: 1, cad, atas, atualizado: d.atualizado || 0 };
}
function normalizarAta(a) {
  if (ehReuniao(a)) return normalizarReuniao(a);
  const tipo = a.tipo === 'AGE' ? 'AGE' : 'AGO';
  const n = Object.assign({
    id: novoId(), tipo, data: '', hora: tipo === 'AGE' ? '19:30' : '19:00', casa: '', endereco: '', presentes: null, anciao: '',
    editalData: '', editalCargo: 'presidente', conduz: 'presidente', lavra: 'secretario', qualificar: true, exercicio: null, ordem: [], textoManual: null
  }, a);
  const ano = anoDe(n.data);
  n.rel = Object.assign({ assembleias: [], batismos: null, ceiaIrmaos: null, ceiaIrmas: null, biblias: null, bibliasValor: null, hinarios: null, hinariosValor: null,
    obreiros: CATS_OBREIROS.map(c => ({ cat: c, itens: [] })), entregues: [], andamento: [], terrenos: [], construcao: [] }, a.rel || {});
  n.rel.obreiros.forEach(c => { const k = norm(c.cat); if (CAT_SING[k]) c.cat = CAT_SING[k]; });
  n.cont = a.cont && a.cont.dre ? a.cont : contabilPadrao();
  // Conselho Fiscal: mandato de 1º de abril a 31 de março do ano seguinte (manual, anexo 7.7)
  n.cf = Object.assign({ parecer: ['', '', ''], leitor: '', membros: ['', '', ''], suplente: '', novo: [false, false, false, false], inicio: '', fim: '', auxiliares: true }, a.cf || {});
  if (!Array.isArray(n.cf.novo)) n.cf.novo = [false, false, false, false];
  while (n.cf.novo.length < 4) n.cf.novo.push(false);
  if (!n.cf.inicio || n.cf.inicio === n.data) n.cf.inicio = ano ? `${ano}-04-01` : '';
  if (!n.cf.fim) n.cf.fim = n.cf.limite || (n.cf.fimAno ? `${n.cf.fimAno}-03-31` : ano ? `${ano + 1}-03-31` : '');
  delete n.cf.limite; delete n.cf.fimAno; delete n.cf.reuniao;
  n.opc = Object.assign({ roteiro: true, composicao: tipo === 'AGO', conclusao: tipo === 'AGO', termoPosse: true, presenca: 10 }, a.opc || {});
  n.comp = Object.assign({ inicio: '', fim: '', cargos: {}, anciaes: [], auxiliares: [], setores: [] }, a.comp || {});
  n.ordem = (n.ordem || []).map(o => {
    const x = Object.assign({ texto: '', acao: 'livre', delib: '', posse: null, sede: '' }, o);
    if (x.acao === 'posse') {
      x.posse = Object.assign({ reuniao: '', itens: [], fimAno: '' }, x.posse || {});
      x.posse.itens = (x.posse.itens || []).map(p => Object.assign({ cargo: '', nome: '', anterior: '', motivo: 'renúncia' }, p));
    }
    return x;
  });
  // quem assinou o edital (versões antigas guardavam o nome)
  if (a.editalAssina && !a.editalCargo) { const k = Object.keys(n.comp.cargos || {}).find(k => norm(n.comp.cargos[k]) === norm(a.editalAssina)); if (k) n.editalCargo = k; }
  delete n.editalAssina;
  return n;
}

function ler() { try { const t = localStorage.getItem(KEY); if (t) return normalizarDB(JSON.parse(t)); } catch (e) {} return normalizarDB({}); }
/* ---------- salvar: neste aparelho na hora e na nuvem sozinho, poucos segundos depois ----------
   REV conta as alterações; uma alteração feita enquanto a nuvem salva não se perde (salva de novo).
   ccb_atas_base guarda a versão da nuvem que este aparelho conhece: se outra pessoa salvou depois,
   pergunta qual manter em vez de passar por cima. */
let ATUALIZADO_AO_ABRIR = 0;
let _tSalvar = null, _tNuvem = null, REV = 0, SALVANDO = false, DE_NOVO = false, ERRO_NUVEM = '', CONFLITO = false, AVISOU_ESPACO = false;
const BASE_KEY = KEY + '_base';
const AUTO_MS = 2500;
const lerBase = () => { try { return +(localStorage.getItem(BASE_KEY) || 0) || 0; } catch (e) { return 0; } };
const gravarBase = v => { try { localStorage.setItem(BASE_KEY, String(v || 0)); } catch (e) {} };
const temSessao = () => { try { return !!localStorage.getItem('session_token'); } catch (e) { return false; } };
function gravarLocal() {
  try {
    localStorage.setItem(KEY, JSON.stringify(DB));
    if (PENDENTE) localStorage.setItem(KEY + '_pend', '1'); else localStorage.removeItem(KEY + '_pend');
    return true;
  } catch (e) {
    if (!AVISOU_ESPACO) { AVISOU_ESPACO = true; UI.toast('O navegador não deixou guardar neste aparelho (falta espaço). As atas continuam indo para a nuvem.', 'error'); }
    return false;
  }
}
function guardar() {
  DB.atualizado = Date.now(); PENDENTE = true; REV++;
  clearTimeout(_tSalvar);
  _tSalvar = setTimeout(() => { _tSalvar = null; gravarLocal(); mostrarEstado(); }, 250);
  agendarNuvem();
}
function guardarJa() { clearTimeout(_tSalvar); _tSalvar = null; DB.atualizado = Date.now(); PENDENTE = true; REV++; gravarLocal(); agendarNuvem(); }
function agendarNuvem(ms) {
  clearTimeout(_tNuvem); _tNuvem = null;
  if (temSessao() && !CONFLITO) _tNuvem = setTimeout(() => salvarNuvem(true), ms == null ? AUTO_MS : ms);
  mostrarEstado();
}
function quandoTxt(ms) { if (!ms) return ''; const d = new Date(ms), h = new Date(); const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); return d.toDateString() === h.toDateString() ? 'hoje às ' + hora : d.toLocaleDateString('pt-BR') + ' às ' + hora; }
function mostrarEstado() {
  const el = document.getElementById('estado'); if (!el) return;
  let cls = '', ic = 'check-circle', txt;
  if (CONFLITO) { cls = 'pend'; ic = 'alert'; txt = '<b>Há outra versão na nuvem</b> — toque para resolver'; }
  else if (SALVANDO) { cls = 'salv'; ic = 'spinner'; txt = '<b>Salvando na nuvem…</b>'; }
  else if (PENDENTE && ERRO_NUVEM) { cls = 'pend'; ic = 'alert'; txt = '<b>Não salvou na nuvem</b> — toque para tentar de novo'; }
  else if (PENDENTE && !temSessao()) { cls = 'pend'; ic = 'alert'; txt = '<b>Só neste aparelho</b> — entre de novo para salvar na nuvem'; }
  else if (PENDENTE) { cls = 'salv'; ic = 'clock'; txt = '<b>Salvo neste aparelho</b> · vai para a nuvem em instantes'; }
  else txt = `<b>Salvo na nuvem</b>${NUVEM_EM ? ' · ' + quandoTxt(NUVEM_EM) : ''}`;
  el.className = 'estado' + (cls ? ' ' + cls : '');
  el.innerHTML = `${ICO(ic)}<span>${txt}</span>`;
  const acao = CONFLITO || (PENDENTE && (ERRO_NUVEM || !SALVANDO));
  el.setAttribute('role', acao ? 'button' : 'status'); el.tabIndex = acao ? 0 : -1;
  el.title = acao ? 'Salvar na nuvem agora' : '';
}
function cliqueEstado() { if (!temSessao()) { location.href = '/login.html'; return; } if (CONFLITO || PENDENTE) salvarNuvem(false); }
const ATA = () => DB.atas.find(a => a.id === SEL) || null;

/* ---------- nuvem e backup ---------- */
async function api(rota, corpo) {
  const res = await fetch('/api/' + rota, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ token: localStorage.getItem('session_token'), regiao: REGIAO }, corpo || {})) });
  let d = {}; try { d = await res.json(); } catch (e) {}
  if (!res.ok) { const er = new Error(d.error || (res.status === 413 ? 'arquivo grande demais' : 'erro de comunicação com o servidor (' + res.status + ')')); er.status = res.status; throw er; }
  return d;
}
async function arquivoNuvem() { const lst = (await api('lista-list')).arquivos || []; return lst.find(a => a.nome === ARQ_NUVEM + '.json') || null; }
// troca o que está na tela pela versão da nuvem (com "Desfazer")
async function trazerDaNuvem(arq, avisar) {
  const d = await api('lista-load', { nome: ARQ_NUVEM + '.json' });
  const antes = JSON.stringify(DB);
  DB = normalizarDB(typeof d.conteudo === 'string' ? JSON.parse(d.conteudo) : d.conteudo);
  PENDENTE = false; ERRO_NUVEM = ''; CONFLITO = false; REV++;
  clearTimeout(_tNuvem); _tNuvem = null;
  gravarBase(arq && arq.modificado); NUVEM_EM = arq ? arq.modificado : NUVEM_EM; gravarLocal();
  if (!ATA()) SEL = maisRecente();
  desenharTudo();
  if (avisar) UI.toast('Atas recarregadas da nuvem.', { type: 'ok', action: { label: 'Desfazer', icon: 'undo', fn: () => { DB = normalizarDB(JSON.parse(antes)); guardar(); desenharTudo(); } } });
}
async function resolverConflito(arq) {
  CONFLITO = true; mostrarEstado();
  const v = await UI.dialog({
    title: 'Há outra versão das atas na nuvem', icon: 'alert',
    body: `<p class="ui-modal__p">Alguém salvou as atas na nuvem <b>${esc(quandoTxt(arq.modificado))}</b>, depois da última vez que este aparelho buscou. Este aparelho também tem alterações que ainda não foram para a nuvem.</p><p class="ui-modal__p">Qual versão deve ficar?</p>`,
    actions: [{ label: 'Decidir depois', value: null }, { label: 'Usar a da nuvem', value: 'nuvem', icon: 'cloud-down' }, { label: 'Manter a deste aparelho', value: 'aqui', primary: true, icon: 'cloud-up' }]
  });
  if (v === 'aqui') { CONFLITO = false; return true; }
  if (v === 'nuvem') { await trazerDaNuvem(arq, true); return false; }
  mostrarEstado(); return false;
}
let AVISOU_ERRO = false;
async function salvarNuvem(auto) {
  clearTimeout(_tNuvem); _tNuvem = null;
  if (SALVANDO) { DE_NOVO = true; return; }
  if (auto && (!PENDENTE || CONFLITO || !temSessao())) { mostrarEstado(); return; }
  if (!temSessao()) { UI.toast('Sua sessão terminou. Entre de novo para salvar na nuvem (o que está na tela continua guardado neste aparelho).', { type: 'error', action: { label: 'Entrar', icon: 'arrow-right', fn: () => { location.href = '/login.html'; } } }); return; }
  const btn = auto ? null : document.getElementById('btnNuvemSalvar');
  const fim = !auto && UI.busy ? UI.busy(btn, 'Salvando...') : () => {};
  SALVANDO = true; DE_NOVO = false; mostrarEstado();
  const rev = REV;
  try {
    const arq = await arquivoNuvem();
    const base = lerBase();
    // aparelho que nunca anotou a versão (de antes desta mudança): se editou depois do último salvamento, não pergunta
    const legado = !base && arq && ATUALIZADO_AO_ABRIR > arq.modificado;
    if (arq && arq.modificado && arq.modificado > base && !legado) {
      SALVANDO = false;
      if (!(await resolverConflito(arq))) return;
      SALVANDO = true; mostrarEstado();
    }
    const r = await api('lista-save', { nome: ARQ_NUVEM, conteudo: JSON.stringify(DB) });
    // a versão que ficou na nuvem: o servidor devolve; se for um servidor antigo, pergunta à lista
    let mod = r && r.modificado;
    if (!mod) { try { const novo = await arquivoNuvem(); mod = novo && novo.modificado; } catch (e) {} }
    mod = Math.max(mod || 0, arq && arq.modificado || 0, lerBase());
    NUVEM_EM = mod || Date.now(); gravarBase(mod);
    ERRO_NUVEM = ''; AVISOU_ERRO = false;
    if (REV === rev) PENDENTE = false;
    gravarLocal();
    if (!auto) UI.toast('Atas e cadastro salvos na nuvem.', 'ok');
  } catch (e) {
    ERRO_NUVEM = e.message || 'erro';
    const sessao = e.status === 401;
    if (!auto || !AVISOU_ERRO) {
      AVISOU_ERRO = true;
      UI.toast((sessao ? 'Sua sessão terminou: ' : 'Não foi possível salvar na nuvem: ') + ERRO_NUVEM + (sessao ? '' : ' O que está na tela continua guardado neste aparelho.'), { type: 'error', action: sessao ? { label: 'Entrar', icon: 'arrow-right', fn: () => { location.href = '/login.html'; } } : { label: 'Tentar de novo', icon: 'refresh', fn: () => salvarNuvem(false) } });
    }
    if (!sessao && e.status !== 403) _tNuvem = setTimeout(() => salvarNuvem(true), 30000);
  } finally {
    SALVANDO = false; fim(); mostrarEstado();
    if (!ERRO_NUVEM && !CONFLITO && PENDENTE && (REV !== rev || DE_NOVO)) agendarNuvem(800);
  }
}
async function carregarNuvem(manual) {
  const rev0 = REV;
  try {
    if (!temSessao()) { mostrarEstado(); return; }
    const arq = await arquivoNuvem();
    if (!arq) {
      if (manual) UI.toast('Ainda não há atas salvas na nuvem.', 'info');
      NUVEM_EM = null; if (PENDENTE) agendarNuvem(); mostrarEstado(); return;
    }
    NUVEM_EM = arq.modificado || null;
    if (!manual) {
      // alterações deste aparelho que ainda não subiram: manda agora (se a nuvem mudou, pergunta)
      if (PENDENTE) { agendarNuvem(400); return; }
      if (arq.modificado && arq.modificado <= lerBase()) { mostrarEstado(); return; } // já tem esta versão (ou mais nova)
    } else if (PENDENTE) {
      const ok = await UI.confirm('Trocar pelo que está na nuvem?', 'Este aparelho tem alterações que ainda não foram salvas na nuvem. Elas serão substituídas.', { ok: 'Trocar', danger: true });
      if (!ok) return;
    }
    if (!manual && REV !== rev0) { agendarNuvem(); return; } // começou a editar enquanto buscava: não passa por cima
    const antes = REV;
    const d = await api('lista-load', { nome: ARQ_NUVEM + '.json' });
    if (!manual && REV !== antes) { agendarNuvem(); return; }
    const ant = JSON.stringify(DB);
    DB = normalizarDB(typeof d.conteudo === 'string' ? JSON.parse(d.conteudo) : d.conteudo);
    PENDENTE = false; ERRO_NUVEM = ''; CONFLITO = false;
    gravarBase(arq.modificado); gravarLocal();
    if (!ATA()) SEL = maisRecente();
    desenharTudo();
    if (manual) UI.toast('Atas recarregadas da nuvem.', { type: 'ok', action: { label: 'Desfazer', icon: 'undo', fn: () => { DB = normalizarDB(JSON.parse(ant)); guardar(); desenharTudo(); } } });
  } catch (e) { if (manual) UI.toast('Não foi possível acessar a nuvem: ' + e.message, 'error'); }
  mostrarEstado();
}
// ao sair ou trocar de aplicativo: grava neste aparelho na hora e tenta subir para a nuvem
function aoSair() { if (_tSalvar) { clearTimeout(_tSalvar); _tSalvar = null; gravarLocal(); } }
window.addEventListener('pagehide', aoSair);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { aoSair(); if (PENDENTE && !SALVANDO && !CONFLITO && temSessao()) salvarNuvem(true); }
  else if (!PENDENTE && !SALVANDO && window.__atasIniciado) carregarNuvem(false); // voltou: busca o que outros salvaram
});
window.addEventListener('beforeunload', e => { if (PENDENTE && temSessao() && (SALVANDO || _tNuvem)) { aoSair(); e.preventDefault(); e.returnValue = ''; } });
function baixarBackup() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(DB, null, 2)], { type: 'application/json' }));
  a.download = 'atas_assembleias.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function abrirBackup(ev) {
  const f = ev.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const antes = JSON.stringify(DB);
      DB = normalizarDB(JSON.parse(r.result)); guardarJa(); SEL = maisRecente(); desenharTudo();
      UI.toast('Arquivo aberto. Ele vai para a nuvem em instantes.', { type: 'ok', action: { label: 'Desfazer', icon: 'undo', fn: () => { DB = normalizarDB(JSON.parse(antes)); guardarJa(); SEL = maisRecente(); desenharTudo(); } } });
    } catch (e) { UI.toast('Arquivo inválido.', 'error'); }
  };
  r.readAsText(f); ev.target.value = '';
}

/* ---------- menus e abas ---------- */
function togMenu(ev, id) { ev.stopPropagation(); const m = document.getElementById(id); const ab = m.classList.contains('open'); document.querySelectorAll('.menu.open').forEach(x => x.classList.remove('open')); if (!ab) m.classList.add('open'); }
document.addEventListener('click', e => { document.querySelectorAll('.menu.open').forEach(m => { if (!m.contains(e.target) || e.target.closest('.menu-box button')) m.classList.remove('open'); }); });
function mudarAba(a) {
  ABA = a;
  document.querySelectorAll('.abas [data-aba]').forEach(b => b.classList.toggle('on', b.dataset.aba === a));
  document.getElementById('abaAtas').hidden = a !== 'atas';
  document.getElementById('abaCad').hidden = a !== 'cad';
  try { localStorage.setItem('ccb_atas_aba', a); } catch (e) {}
  if (a === 'atas') { desenharLista(); desenharEditor(); } else desenharCad();
  if (window.AppBar) AppBar.atualizar();
}

/* ---------- caminho dentro do objeto (data-b="a:rel.batismos") ---------- */
function getP(o, cam) { return cam.split('.').reduce((x, k) => x == null ? x : x[k], o); }
function setP(o, cam, v) { const ks = cam.split('.'); const ult = ks.pop(); const alvo = ks.reduce((x, k) => x[k], o); alvo[ult] = v; }
function raiz(r) { return r === 'a' ? ATA() : DB.cad; }
function lerCampo(el) {
  const t = el.dataset.t;
  if (el.type === 'checkbox') return el.checked;
  if (t === 'int') { const n = parseInt(String(el.value).replace(/\D/g, ''), 10); return isFinite(n) ? n : null; }
  if (t === 'money') return parseBR(el.value);
  if (t === 'linhas') return el.value.split('\n');
  return el.value;
}
function onCampo(e) {
  const el = e.target.closest && e.target.closest('[data-b]'); if (!el) return;
  const [r, cam] = el.dataset.b.split(':'); const o = raiz(r); if (!o) return;
  if (el.dataset.t === 'pnome' && e.type === 'change') renomearPessoa(el.dataset.old || '', el.value);
  setP(o, cam, lerCampo(el));
  if (el.dataset.t === 'pnome' && e.type === 'change') el.dataset.old = el.value;
  guardar();
  // redesenha depois que o foco já passou para o próximo campo (Tab continua funcionando)
  if (e.type === 'change' && el.dataset.r) { const o = el.dataset.r; setTimeout(() => redesenhar(o), 0); return; }
  agendarDerivados();
}
document.addEventListener('input', onCampo);
// os itens da ordem do dia crescem conforme o texto
function crescer(t) { t.style.height = 'auto'; t.style.height = (t.scrollHeight + 3) + 'px'; }
document.addEventListener('input', e => { if (e.target.matches && e.target.matches('.od textarea')) crescer(e.target); });
window.addEventListener('resize', () => document.querySelectorAll('.od textarea').forEach(crescer));
document.addEventListener('change', onCampo);
document.addEventListener('focusout', e => {
  const el = e.target; if (!el.dataset || el.dataset.t !== 'money') return;
  const v = parseBR(el.value); el.value = fmtR(v);
});
document.addEventListener('focusin', e => { const el = e.target; if (el.dataset && el.dataset.t === 'pnome') el.dataset.old = el.value; });
function redesenhar(o) { if (o === 'ed') desenharEditor(); else if (o === 'cad') desenharCad(); else if (o === 'tudo') desenharTudo(); }
let _tDer = null;
function agendarDerivados() { clearTimeout(_tDer); _tDer = setTimeout(derivados, 140); }

/* ---------- pessoas (cadastro) ---------- */
function pessoa(nome) { const n = norm(nome); return n ? DB.cad.pessoas.find(p => norm(p.nome) === n) || null : null; }
function renomearPessoa(antigo, novo) {
  if (!antigo || norm(antigo) === norm(novo)) return;
  const c = DB.cad, troca = v => norm(v) === norm(antigo) ? novo : v;
  Object.keys(c.adm.cargos).forEach(k => { c.adm.cargos[k] = troca(c.adm.cargos[k]); });
  c.cf.membros = c.cf.membros.map(troca); c.cf.suplente = troca(c.cf.suplente);
}
const txtFalta = (n, f) => `${n.split(' ')[0]}: ${f[0] === 'sem cadastro' ? 'sem dados no cadastro' : 'falta ' + f.join(', ')}`;
function faltasPessoa(nome) {
  const p = pessoa(nome); if (!p) return ['sem cadastro'];
  const f = [];
  if (!p.estadoCivil) f.push('estado civil'); if (!p.profissao) f.push('profissão');
  if (!p.doc) f.push(p.docTipo === 'cin' ? 'CIN' : 'RG');
  if (p.docTipo !== 'cin' && !p.cpf) f.push('CPF');
  if (!p.endereco) f.push('endereço');
  return f;
}
function qualificacao(nome) {
  const p = pessoa(nome) || { nome };
  const L = '______';
  // sem siglas nem abreviações no texto da ata (manual, seção 7)
  const partes = [`<b>${esc(nome || L)}</b>`, esc(p.nacionalidade || 'brasileiro'), esc(p.estadoCivil || L), esc(p.profissao || L)];
  if (p.docTipo === 'cin') partes.push(`portador da Carteira de Identidade Nacional número ${esc(p.doc || L)}`);
  else partes.push(`portador da Cédula de Identidade Civil (Registro Geral) número ${esc(p.doc || L)}`, `inscrito no Cadastro de Pessoas Físicas sob o número ${esc(p.cpf || L)}`);
  partes.push(`residente e domiciliado na ${esc(p.endereco || L)}`);
  return partes.join(', ');
}
function usosPessoa(nome) {
  const n = norm(nome), c = DB.cad, u = [];
  CARGOS.forEach(([k, r]) => { if (norm(c.adm.cargos[k]) === n) u.push(r); });
  c.cf.membros.forEach(m => { if (norm(m) === n) u.push('Conselho Fiscal'); });
  if (norm(c.cf.suplente) === n) u.push('Suplente do C. F.');
  return u;
}
function novaPessoa(nome, abrir) {
  const p = pessoaPadrao(nome); DB.cad.pessoas.push(p); guardar();
  if (ABA !== 'cad') mudarAba('cad'); else desenharCad();
  setTimeout(() => { const d = document.querySelector(`details[data-pid="${p.id}"]`); if (d) { d.open = true; d.scrollIntoView({ block: 'center', behavior: 'smooth' }); const i = d.querySelector('input'); if (i && abrir !== false) i.focus(); } }, 60);
}
function excluirPessoa(id) {
  const i = DB.cad.pessoas.findIndex(p => p.id === id); if (i < 0) return;
  const [p] = DB.cad.pessoas.splice(i, 1); guardar(); desenharCad();
  UI.toast(`“${p.nome || 'Irmão'}” removido do cadastro.`, { action: { label: 'Desfazer', icon: 'undo', fn: () => { DB.cad.pessoas.splice(i, 0, p); guardar(); desenharCad(); } } });
}

/* ---------- composição (o que cada ata guarda do cadastro) ---------- */
function compDoCadastro(cad) {
  const c = cad || DB.cad;
  return clone({ inicio: c.adm.inicio, fim: c.adm.fim, cargos: c.adm.cargos, crc: c.adm.crc, anciaes: limpos(c.anciaes), auxiliares: limpos(c.auxiliares),
    setores: c.setores.map(s => ({ nome: s.nome, sub: !!s.sub, nomes: limpos(s.nomes) })).filter(s => s.nomes.length) });
}
const estavel = o => Array.isArray(o) ? '[' + o.map(estavel).join(',') + ']' : (o && typeof o === 'object') ? '{' + Object.keys(o).sort().map(k => JSON.stringify(k) + ':' + estavel(o[k])).join(',') + '}' : JSON.stringify(o == null ? '' : o);
const compIgual = (a) => estavel(a.comp) === estavel(compDoCadastro());
function atualizarComp() {
  const a = ATA(); if (!a) return;
  const antes = clone(a.comp); a.comp = compDoCadastro(); guardar(); desenharEditor();
  UI.toast('Pessoas da ata atualizadas com o cadastro.', { type: 'ok', action: { label: 'Desfazer', icon: 'undo', fn: () => { a.comp = antes; guardar(); desenharEditor(); } } });
}
const cargo = (a, k) => String((a.comp.cargos || {})[k] || '').trim();

/* ---------- atas: criar, duplicar, excluir ---------- */
function maisRecente() { const l = DB.atas.slice().sort((x, y) => String(y.data).localeCompare(String(x.data))); return l[0] ? l[0].id : null; }
function txtAcao(k, ano) { return (ACOES[k].txt || '').replace('{ano3}', ano ? ano + 3 : '____').replace('{ano}', ano || '____').replace('{exercicio}', ano ? ano - 1 : '____'); }
// os 4 tipos de AGO do manual (anexos 7.5, 7.9, 7.11 e 7.13) e a AGE (7.15)
const TIPOS_AGO = {
  normal:  { rot: 'Normal', ks: ['relatorio', 'parecer', 'conselho'] },
  trienio: { rot: 'Triênio', ks: ['relatorio', 'parecer', 'trienio', 'conselho'] },
  vago:    { rot: 'Cargo vago', ks: ['relatorio', 'parecer', 'posse', 'conselho'] },
  sede:    { rot: 'Alteração da sede', ks: ['relatorio', 'parecer', 'conselho', 'sede'] }
};
function itemPadrao(k, ano) {
  const o = { texto: txtAcao(k, ano), acao: k, delib: '', posse: null, sede: '' };
  if (k === 'posse') o.posse = { reuniao: '', itens: [{ cargo: 'Presidente', nome: '', anterior: '', motivo: 'renúncia' }], fimAno: '' };
  return o;
}
function ordemPadrao(tipo, ano) {
  return tipo === 'AGO' ? TIPOS_AGO.normal.ks.map(k => itemPadrao(k, ano)) : [itemPadrao('posse', ano)];
}
function tipoAGOde(a) {
  const ks = a.ordem.map(o => o.acao).join(',');
  return Object.keys(TIPOS_AGO).find(t => TIPOS_AGO[t].ks.join(',') === ks) || null;
}
function aplicarTipoAGO(t) {
  const a = ATA(); const ano = anoDe(a.data) || (a.exercicio ? a.exercicio + 1 : null);
  const antes = clone(a.ordem);
  a.ordem = TIPOS_AGO[t].ks.map(k => { const ja = antes.find(o => o.acao === k); return ja ? ja : itemPadrao(k, ano); });
  guardar(); desenharEditor();
  UI.toast(`Ordem do dia do modelo “AGO ${TIPOS_AGO[t].rot}”.`, { type: 'ok', action: { label: 'Desfazer', icon: 'undo', fn: () => { a.ordem = antes; guardar(); desenharEditor(); } } });
}

function novaAta(tipo) {
  if (TIPOS_REUNIAO.includes(tipo)) return novaReuniao(tipo);
  const ult = DB.atas.filter(a => a.tipo === tipo).sort((x, y) => String(y.data).localeCompare(String(x.data)))[0];
  const hoje = new Date(); const ano = ult && anoDe(ult.data) ? anoDe(ult.data) + 1 : hoje.getFullYear();
  let a;
  if (ult && tipo === 'AGO') {
    // parte da AGO anterior: mesma estrutura, datas um ano depois, valores em branco
    a = normalizarAta(clone(ult));
    a.id = novoId(); a.data = somaAno(ult.data, 1); a.editalData = somaAno(ult.editalData, 1); a.presentes = null; a.textoManual = null;
    a.exercicio = ano - 1;
    a.ordem.forEach(o => { if (o.acao === 'conselho') o.texto = ACOES.conselho.txt.replace('{ano}', ano); if (o.acao === 'relatorio') o.texto = ACOES.relatorio.txt.replace('{exercicio}', ano - 1); });
    a.rel = normalizarAta({}).rel; a.rel.assembleias = assembleiasDoExercicio(ano - 1);
    const plAnterior = totalGrupo(ult, ult.cont.bal.passivo.find(g => /PATRIM/.test(g.t)) || { i: [] });
    a.cont.dre.rec.concat(a.cont.dre.desp, a.cont.bal.ativo, a.cont.bal.passivo).forEach(g => g.i.forEach(x => { if (!x.auto) x.v = null; }));
    const ps = (a.cont.bal.passivo.find(g => /PATRIM/.test(g.t)) || { i: [] }).i.find(x => /PATRIM[ÔO]NIO SOCIAL/.test(x.r));
    if (ps && plAnterior) ps.v = plAnterior;
    // o parecer é do Conselho que serviu no exercício findo; o novo é o do cadastro
    a.cf = Object.assign(a.cf, { parecer: limpos(ult.cf.membros).concat(['', '', '']).slice(0, 3), membros: DB.cad.cf.membros.slice(), suplente: DB.cad.cf.suplente, leitor: a.cf.leitor, inicio: `${ano}-04-01`, fim: `${ano + 1}-03-31` });
    a.cf.novo = marcarNovos(a.cf.membros, a.cf.suplente, ult.cf);
    a.ordem.forEach(o => { if (o.acao === 'trienio') o.texto = txtAcao('trienio', ano); });
  } else {
    a = normalizarAta({ tipo });
    a.data = ''; a.exercicio = tipo === 'AGO' ? ano - 1 : null;
    a.ordem = ordemPadrao(tipo, ano);
    a.cf = Object.assign(a.cf, { parecer: DB.cad.cf.membros.slice(), membros: DB.cad.cf.membros.slice(), suplente: DB.cad.cf.suplente, inicio: tipo === 'AGO' ? `${ano}-04-01` : '', fim: tipo === 'AGO' ? `${ano + 1}-03-31` : '' });
    if (tipo === 'AGO') a.rel.assembleias = assembleiasDoExercicio(ano - 1);
    if (ult) { a.hora = ult.hora; a.anciao = ult.anciao; }
  }
  a.comp = compDoCadastro();
  DB.atas.push(a); SEL = a.id; guardar();
  if (ABA !== 'atas') mudarAba('atas'); else desenharTudo();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  UI.toast(tipo === 'AGO' && ult ? `Nova AGO criada a partir da de ${anoDe(ult.data)}: datas um ano depois e valores em branco.` : `Nova ${tipo} criada. Preencha a data e os dados.`, 'ok');
}
// quem não estava no Conselho Fiscal da AGO anterior entra como "apresentado e empossado"
function marcarNovos(membros, suplente, ant) {
  const antes = limpos((ant && ant.membros || []).concat(ant && ant.suplente || '')).map(norm);
  return membros.concat(suplente).map(n => !!String(n || '').trim() && antes.length > 0 && !antes.includes(norm(n)));
}
function duplicarAta() {
  const a = ATA(); if (!a) return;
  const b = normalizarAta(clone(a)); b.id = novoId(); DB.atas.push(b); SEL = b.id; guardar(); desenharTudo();
  UI.toast('Ata duplicada.', 'ok');
}
function excluirAta() {
  const a = ATA(); if (!a) return;
  const i = DB.atas.indexOf(a); DB.atas.splice(i, 1); SEL = maisRecente(); guardar(); desenharTudo();
  UI.toast(`${a.tipo} de ${dataBR(a.data)} excluída.`, { action: { label: 'Desfazer', icon: 'undo', fn: () => { DB.atas.splice(i, 0, a); SEL = a.id; guardar(); desenharTudo(); } } });
}
function abrirAta(id) { SEL = id; try { localStorage.setItem('ccb_atas_sel', id); } catch (e) {} desenharLista(); desenharEditor(); }
function assembleiasDoExercicio(ano) {
  return DB.atas.filter(a => !ehReuniao(a) && anoDe(a.data) === ano).sort((x, y) => String(x.data).localeCompare(String(y.data))).map(a => {
    if (a.tipo === 'AGO') return `Realizamos a Assembleia Geral Ordinária no dia ${dataExt(a.data)}, onde foram tratados assuntos de competência do exercício ${a.exercicio || ano - 1}`;
    const assunto = fimFrase((a.ordem[0] || {}).texto || '');
    return `Realizamos a Assembleia Geral Extraordinária no dia ${dataExt(a.data)}, onde foi tratado do ${assunto ? assunto.charAt(0).toLowerCase() + assunto.slice(1) : '______'}`;
  });
}
function puxarAssembleias() {
  const a = ATA(); const l = assembleiasDoExercicio(a.exercicio);
  if (!l.length) { UI.toast(`Nenhuma ata de ${a.exercicio} cadastrada aqui. Escreva as assembleias à mão.`, 'info'); return; }
  a.rel.assembleias = l; guardar(); desenharEditor(); UI.toast('Assembleias do exercício puxadas das atas cadastradas.', 'ok');
}

/* ---------- ordem do dia ---------- */
const temAcao = (a, k) => a.ordem.some(o => o.acao === k);
function addItem() { const a = ATA(); a.ordem.push({ texto: '', acao: 'livre', delib: '', posse: null }); guardar(); desenharEditor(); }
function remItem(i) {
  const a = ATA(); const [o] = a.ordem.splice(i, 1); guardar(); desenharEditor();
  UI.toast('Item da ordem do dia removido.', { action: { label: 'Desfazer', icon: 'undo', fn: () => { a.ordem.splice(i, 0, o); guardar(); desenharEditor(); } } });
}
function moverItem(i, d) { const a = ATA(); const j = i + d; if (j < 0 || j >= a.ordem.length) return; [a.ordem[i], a.ordem[j]] = [a.ordem[j], a.ordem[i]]; guardar(); desenharEditor(); }
function mudarAcao(i, k) {
  const a = ATA(), o = a.ordem[i]; const ano = anoDe(a.data);
  const eraPadrao = !o.texto.trim() || Object.keys(ACOES).some(x => ACOES[x].txt && fimFrase(txtAcao(x, ano)) === fimFrase(o.texto)) || /complemento de mandato/.test(o.texto);
  o.acao = k;
  if (eraPadrao) o.texto = txtAcao(k, ano);
  if (k === 'posse' && !o.posse) o.posse = itemPadrao('posse', ano).posse;
  guardar(); desenharEditor();
}

function addPosse(i) { const o = ATA().ordem[i]; o.posse.itens.push({ cargo: '', nome: '', anterior: '', motivo: 'renúncia' }); guardar(); desenharEditor(); }
function remPosse(i, j) { const o = ATA().ordem[i]; o.posse.itens.splice(j, 1); guardar(); desenharEditor(); }

/* ---------- relatório: novos obreiros ---------- */
function addObreiro(c) { ATA().rel.obreiros[c].itens.push({ casa: '', nome: '' }); guardar(); desenharEditor(); }
function remObreiro(c, j) { ATA().rel.obreiros[c].itens.splice(j, 1); guardar(); desenharEditor(); }
function addCat() { ATA().rel.obreiros.push({ cat: '', itens: [{ casa: '', nome: '' }] }); guardar(); desenharEditor(); }
function remCat(c) { ATA().rel.obreiros.splice(c, 1); guardar(); desenharEditor(); }

/* ---------- contábil ---------- */
function resultado(a) { return r2(totalSecao(a, a.cont.dre.rec) - totalSecao(a, a.cont.dre.desp)); }
function valorItem(a, x) { return x.auto === 'resultado' ? resultado(a) : (x.v || 0); }
function totalGrupo(a, g) { return r2((g.i || []).reduce((s, x) => s + valorItem(a, x), 0)); }
function totalSecao(a, gs) { return r2(gs.reduce((s, g) => s + totalGrupo(a, g), 0)); }
const rotResultado = a => resultado(a) < 0 ? 'DÉFICIT DO EXERCÍCIO' : 'SUPERÁVIT DO EXERCÍCIO';
function contGrupos(cam) { return getP(ATA().cont, cam); }
function addValor(cam, g) { contGrupos(cam)[g].i.push(it('')); guardar(); desenharEditor(); focarUltimo(`[data-cg="${cam}.${g}"] .vl:last-of-type input`); }
function remValor(cam, g, j) { const gr = contGrupos(cam)[g]; const [x] = gr.i.splice(j, 1); guardar(); desenharEditor(); UI.toast('Linha removida.', { action: { label: 'Desfazer', icon: 'undo', fn: () => { gr.i.splice(j, 0, x); guardar(); desenharEditor(); } } }); }
function addGrupo(cam) { contGrupos(cam).push({ t: 'NOVO GRUPO', i: [it('')] }); guardar(); desenharEditor(); }
function remGrupo(cam, g) { const gs = contGrupos(cam); const [x] = gs.splice(g, 1); guardar(); desenharEditor(); UI.toast('Grupo removido.', { action: { label: 'Desfazer', icon: 'undo', fn: () => { gs.splice(g, 0, x); guardar(); desenharEditor(); } } }); }
function focarUltimo(sel) { setTimeout(() => { const l = document.querySelectorAll(sel); const e = l[l.length - 1]; if (e) e.focus(); }, 30); }
function mudarContAba(k) { CONT_ABA = k; desenharEditor(); }

/* ---------- cadastro: setores ---------- */
function addSetor() { DB.cad.setores.push({ nome: '', sub: false, nomes: [] }); guardar(); desenharCad(); focarUltimo('.setor input[data-b$=".nome"]'); }
function remSetor(i) { const [s] = DB.cad.setores.splice(i, 1); guardar(); desenharCad(); UI.toast(`Setor “${s.nome || 'sem nome'}” removido.`, { action: { label: 'Desfazer', icon: 'undo', fn: () => { DB.cad.setores.splice(i, 0, s); guardar(); desenharCad(); } } }); }
function moverSetor(i, d) { const l = DB.cad.setores, j = i + d; if (j < 0 || j >= l.length) return; [l[i], l[j]] = [l[j], l[i]]; guardar(); desenharCad(); }

/* =====================================================================
   Conferência (o que falta ou não bate)
   ===================================================================== */
function conferir(a) {
  if (ehReuniao(a)) return conferirReuniao(a);
  const r = [];
  const add = (nivel, txt) => r.push({ nivel, txt });
  if (!a.data) add('er', 'Falta a data da assembleia');
  if (!a.editalData) add('al', 'Falta a data do edital');
  else if (a.data && a.editalData > somaDias(a.data, -10)) add('er', 'Edital com menos de 10 dias de antecedência');
  const p = partesData(a.data);
  if (a.tipo === 'AGO' && p && (p.m > 3)) add('er', 'A AGO deve ser realizada até 31 de março');
  if (!a.ordem.length) add('er', 'Ordem do dia vazia');
  if (!conduz(a).nome) add('er', 'Falta quem conduz pela Administração');
  if (!lavra(a).nome) add('er', 'Falta quem lavra a ata');
  if (!cargo(a, 'tesoureiro')) add('al', 'Falta o Tesoureiro (assina a ata)');
  if (!a.anciao) add('al', 'Falta o ancião que preside');
  if (a.presentes == null) add('al', 'Falta o número de presentes');
  if (temAcao(a, 'relatorio')) {
    const at = totalSecao(a, a.cont.bal.ativo), ps = totalSecao(a, a.cont.bal.passivo);
    const temValores = a.cont.dre.rec.some(g => g.i.some(x => x.v));
    if (!temValores) add('al', 'Relatório contábil sem valores');
    else if (r2(at - ps) !== 0) add('er', `Ativo e passivo não batem (diferença R$ ${fmtR(r2(at - ps))})`);
    ['presidente', 'tesoureiro'].forEach(k => { const n = cargo(a, k); if (n && !(pessoa(n) || {}).cpf) add('al', `Falta o CPF do ${CARGO_ROT[k].toLowerCase()} (assinatura do balanço)`); });
  }
  if (temAcao(a, 'parecer') && !a.cf.leitor) add('al', 'Falta quem lê o parecer');
  if (temAcao(a, 'conselho')) {
    const ns = limpos(a.cf.membros);
    if (ns.length < 3) add('er', 'O Conselho Fiscal tem 3 membros');
    if (!a.cf.inicio || !a.cf.fim) add('er', 'Falta a vigência do mandato do Conselho Fiscal');
    else if (!/-04-01$/.test(a.cf.inicio) || !/-03-31$/.test(a.cf.fim)) add('al', 'Mandato do Conselho Fiscal fora do padrão (1º de abril a 31 de março)');
    if (a.qualificar) ns.concat(a.cf.suplente ? [a.cf.suplente] : []).forEach(n => { const f = faltasPessoa(n); if (f.length) add('al', txtFalta(n, f)); });
  }
  if (temAcao(a, 'trienio')) {
    const ano = anoDe(a.data);
    if (ano && (String(a.comp.inicio) !== String(ano) || String(a.comp.fim) !== String(ano + 3))) add('al', `Triênio: ajuste o mandato no cadastro para ${ano} a ${ano + 3}`);
  }
  a.ordem.forEach((o, i) => {
    const it = itemUnico(a) ? 'Item único' : `Item ${LETRAS[i]})`;
    if (!o.texto.trim()) add('er', `${it} sem texto`);
    if (o.acao === 'livre' && !o.delib.trim()) add('al', `${it}: falta o que foi decidido`);
    if (o.acao === 'sede' && !String(o.sede || '').trim()) add('er', `${it}: falta o novo endereço da sede`);
    if (o.acao === 'posse' && o.posse) o.posse.itens.forEach(x => {
      if (!x.nome.trim() || !x.cargo.trim()) { add('al', `${it}: cargo ou nome em branco`); return; }
      if (!chaveCargo(x.cargo)) add('er', `${it}: “${x.cargo}” não é cargo do estatuto`);
      if (a.qualificar) { const f = faltasPessoa(x.nome); if (f.length) add('al', txtFalta(x.nome, f)); }
    });
  });
  // sem abreviações no texto (manual: "Na ata não deve haver abreviaturas, siglas")
  const abrev = abreviacoes(a);
  if (abrev.length) add('al', `Abreviação no texto: ${abrev.slice(0, 4).join(', ')} (corrija no cadastro)`);
  if (!compIgual(a)) add('al', 'O cadastro mudou depois desta ata');
  return r;
}
const RE_ABREV = /(^|[\s(,–-])(Pr|Av|Jd|Jdm|Apto|Apt|Vl|Sr|Sra|Dr|Dra|Res|Cond|Qd|Qda|Lt|Ltda|Prof|Ed|Est|Rod|Al|Trav|Pq|Cj|Bl)\.(?=[\s,;)–-]|$)|(^|\s)(nº|n\.º|n°|Nº)(?=\s|\d)/g;
function abreviacoes(a) {
  if (a.textoManual != null) return [];
  const d = document.createElement('div'); d.innerHTML = textoAtaHTML(a);
  const t = d.textContent, achou = new Set(); let m;
  RE_ABREV.lastIndex = 0;
  while ((m = RE_ABREV.exec(t))) achou.add((m[2] ? m[2] + '.' : m[4]));
  return [...achou];
}

function rotAta(a) { return `${a.data ? dataExt(a.data) : 'Sem data'}`; }
function desenharLista() {
  const el = document.getElementById('lista'); if (!el) return;
  const l = DB.atas.slice().sort((x, y) => String(y.data || '9').localeCompare(String(x.data || '9')));
  if (!l.length) { el.innerHTML = '<div class="vazio">Nenhuma ata ainda.<br>Use “Nova ata”.</div>'; return; }
  let h = '', ano = null;
  l.forEach(a => {
    const y = anoDe(a.data) || 'SEM DATA';
    if (y !== ano) { ano = y; h += `<div class="ano-h">${y}</div>`; }
    h += `<button type="button" class="it${a.id === SEL ? ' on' : ''}" onclick="abrirAta('${a.id}')"><span class="tp ${a.tipo.toLowerCase()}">${a.tipo}</span><span class="it-n">${esc(rotAta(a))}</span><small>${ehReuniao(a) ? esc(subHeroiReuniao(a)) : a.tipo === 'AGO' ? 'Exercício ' + (a.exercicio || '—') : esc(fimFrase((a.ordem[0] || {}).texto || '').slice(0, 60) || 'Extraordinária')}</small></button>`;
  });
  el.innerHTML = h;
}

/* =====================================================================
   Tela: editor da ata
   ===================================================================== */
const inp = (b, v, extra) => `<input data-b="${b}" value="${esc(v == null ? '' : v)}" ${extra || ''}>`;
const campo = (rot, html, cls) => `<div class="${cls || ''}"><label>${rot}</label>${html}</div>`;
const idBloco = t => 'b-' + norm(t).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const bloco = (ic, tit, sub, conteudo, em, id) => `<section class="bloco" id="${id || idBloco(tit)}" data-ic="${ic}"><h3><span class="bi">${ICO(ic)}</span><span>${tit}${sub ? `<br><small>${sub}</small>` : ''}</span>${em || ''}</h3>${conteudo}</section>`;
const autoNome = (rot, nome, falta) => `<div class="auto${nome ? '' : ' falta'}">${ICO(nome ? 'user' : 'alert')}<span>${rot}: <b>${esc(nome || falta || 'não definido no cadastro')}</b></span></div>`;

function heroiHTML(a) {
  const conf = conferir(a);
  let chips = conf.length
    ? conf.slice(0, 8).map(c => `<span class="${c.nivel}">${ICO(c.nivel === 'er' ? 'alert' : 'info')}${esc(c.txt)}</span>`).join('') + (conf.length > 8 ? `<span class="al">+${conf.length - 8}</span>` : '')
    : `<span class="ok">${ICO('check-circle')}Tudo preenchido e conferido</span>`;
  if (!ehReuniao(a) && a.data && !conf.some(c => c.nivel === 'er')) chips += `<span class="in">${ICO('calendar')}Assinar a ata até ${dataBR(somaDias(a.data, 15))} · registrar em cartório até ${dataBR(somaDias(a.data, 30))}</span>`;
  const sub = ehReuniao(a) ? subHeroiReuniao(a) : [a.tipo === 'AGO' && a.exercicio ? `Exercício ${a.exercicio}` : '', a.hora ? horaEdital(a.hora) : '', a.presentes != null ? `${a.presentes} presentes` : '', a.editalData ? `edital de ${dataBR(a.editalData)}` : ''].filter(Boolean).join(' · ');
  return `<div class="h-l1"><div class="h-tit"><small>${a.tipo} · ${NOME_TIPO[a.tipo]}</small><h2>${esc(a.data ? cap(dataExt(a.data)) : 'Sem data')}</h2><div class="h-sub">${esc(sub || 'Preencha os dados abaixo')}</div></div>
    <div class="h-acoes"><button type="button" onclick="duplicarAta()" title="Duplicar esta ata">${ICO('copy')}Duplicar</button><button type="button" class="danger" onclick="excluirAta()" title="Excluir esta ata">${ICO('trash')}Excluir</button></div></div>
    <div class="h-conf">${chips}</div>`;
}
function selMovel() {
  const l = DB.atas.slice().sort((x, y) => String(y.data || '9').localeCompare(String(x.data || '9')));
  return `<div class="sel-movel"><select aria-label="Ata aberta" onchange="abrirAta(this.value)">${l.map(a => `<option value="${a.id}"${a.id === SEL ? ' selected' : ''}>${a.tipo} · ${esc(rotAta(a))}</option>`).join('')}</select>
    <div class="menu" id="menuNova2"><button type="button" class="primary" onclick="togMenu(event,'menuNova2')">${ICO('plus')}Nova</button><div class="menu-box">
    <button type="button" onclick="novaAta('AGO')">${ICO('book')}<span>Assembleia Geral Ordinária<small>Relatório, balanço e Conselho Fiscal</small></span></button>
    <button type="button" onclick="novaAta('AGE')">${ICO('gavel')}<span>Assembleia Geral Extraordinária<small>Cargo vago e outros assuntos</small></span></button>
    <button type="button" onclick="novaAta('RLA')">${ICO('users')}<span>Reunião Local Administrativa<small>RLA trimestral: secretaria, tesouraria, obras</small></span></button>
    <button type="button" onclick="novaAta('RLM')">${ICO('user')}<span>Reunião Local Ministerial<small>RLM trimestral: assuntos do ministério</small></span></button></div></div></div>`;
}

function blocoDados(a) {
  const c = DB.cad.ent;
  const sel = (b, v, ks) => `<select data-b="${b}" data-r="ed">${ks.map(k => `<option value="${k}"${v === k ? ' selected' : ''}>${CARGO_ROT[k]}${a.comp.cargos[k] ? ' · ' + esc(a.comp.cargos[k]) : ' · (vago)'}</option>`).join('')}</select>`;
  return bloco('calendar', 'Assembleia', 'Data, horário e quem preside', `<div class="grid g4">
    ${campo('Tipo', `<select data-b="a:tipo" data-r="ed"><option value="AGO"${a.tipo === 'AGO' ? ' selected' : ''}>AGO · Ordinária</option><option value="AGE"${a.tipo === 'AGE' ? ' selected' : ''}>AGE · Extraordinária</option></select>`)}
    ${campo('Data', `<input type="date" data-b="a:data" data-r="ed" value="${esc(a.data)}">`)}
    ${campo('Horário', `<input type="time" data-b="a:hora" value="${esc(a.hora)}">`)}
    ${campo('Irmãos presentes <small>(lista)</small>', `<input inputmode="numeric" data-b="a:presentes" data-t="int" value="${a.presentes == null ? '' : a.presentes}" placeholder="ex.: 276">`)}
    ${campo('Casa de oração', inp('a:casa', a.casa, `placeholder="${esc(c.casa)}"`))}
    ${campo('Endereço <small>(se não for a sede)</small>', inp('a:endereco', a.endereco, `placeholder="${esc(`${c.rua}, número ${c.num}, ${c.bairro}`)}"`), 's2')}
    ${campo('Ancião que preside', inp('a:anciao', a.anciao, 'list="dlAnciaes" placeholder="Nome do ancião"'))}
    ${campo('Conduz pela Administração', sel('a:conduz', a.conduz, ['presidente', 'vp1', 'vp2']))}
    ${campo('Lavra a ata', sel('a:lavra', a.lavra, ['secretario', 'vs1', 'vs2']))}
    ${a.tipo === 'AGO' ? campo('Exercício do relatório', `<input inputmode="numeric" data-b="a:exercicio" data-t="int" data-r="ed" value="${a.exercicio || ''}">`) : ''}
    <label class="ck ${a.tipo === 'AGO' ? '' : 's2'}" style="align-self:end;padding-bottom:9px"><input type="checkbox" data-b="a:qualificar" data-r="ed"${a.qualificar ? ' checked' : ''}>Qualificar os empossados <small style="color:var(--muted)">(RG, CPF e endereço)</small></label>
  </div><div class="dica" style="margin:12px 0 0">Na falta do titular, escolha o substituto legal: a ata, o edital e as assinaturas usam quem você marcar.</div>`);
}

function blocoEdital(a) {
  const ed = assinaEdital(a);
  const tAtual = a.tipo === 'AGO' ? tipoAGOde(a) : null;
  const tipos = a.tipo === 'AGO' ? `<div class="sub-t">Modelo do manual</div><div class="acao tipos">${Object.entries(TIPOS_AGO).map(([k, x]) => `<button type="button" class="${tAtual === k ? 'on' : ''}" onclick="aplicarTipoAGO('${k}')">AGO ${x.rot}</button>`).join('')}</div><div class="dica" style="margin:8px 0 14px">Monta a ordem do dia como no manual (anexos 7.5, 7.9, 7.11 e 7.13). Os textos continuam editáveis.</div>` : '';
  const motivos = ['renúncia', 'falecimento', 'mudança de cargo', 'outro motivo'];
  const itens = a.ordem.map((o, i) => {
    const acoes = Object.entries(ACOES).filter(([k, x]) => !x.so || x.so === a.tipo || o.acao === k).map(([k, x]) => `<button type="button" class="${o.acao === k ? 'on' : ''}" onclick="mudarAcao(${i},'${k}')">${x.rot}</button>`).join('');
    let extra = '';
    if (o.acao === 'livre') extra = campo('O que foi tratado e decidido <small>(vai na ata)</small>', `<textarea data-b="a:ordem.${i}.delib" placeholder="Ex.: Foi apresentada a necessidade de... e a irmandade aprovou com a palavra “Amém”.">${esc(o.delib)}</textarea>`);
    if (o.acao === 'posse' && o.posse) {
      extra = `<div class="grid g2">${campo('Reunião ministerial que confirmou', `<input type="date" data-b="a:ordem.${i}.posse.reuniao" value="${esc(o.posse.reuniao)}">`)}${campo('Mandato vai até 31 de março de', `<input inputmode="numeric" data-b="a:ordem.${i}.posse.fimAno" value="${esc(o.posse.fimAno)}" placeholder="${esc(a.comp.fim || '')} (fim do triênio)">`)}</div>
        <div><label>Cargos e irmãos empossados</label>${o.posse.itens.map((p, j) => `<div class="posse-it"><div class="lin lin-po"><input data-b="a:ordem.${i}.posse.itens.${j}.cargo" data-r="ed" value="${esc(p.cargo)}" list="dlCargos" placeholder="Cargo"><input data-b="a:ordem.${i}.posse.itens.${j}.nome" value="${esc(p.nome)}" list="dlPessoas" placeholder="Irmão que assume (do cadastro)"><button type="button" class="x" title="Remover" onclick="remPosse(${i},${j})">${ICO('x')}</button></div>
          <div class="lin lin-po"><select data-b="a:ordem.${i}.posse.itens.${j}.motivo">${motivos.map(m => `<option${p.motivo === m ? ' selected' : ''}>${m}</option>`).join('')}</select><input data-b="a:ordem.${i}.posse.itens.${j}.anterior" value="${esc(p.anterior)}" list="dlPessoas" placeholder="Quem ocupava o cargo (vazio se estava vago)"><span></span></div></div>`).join('')}
        <div class="linha-b"><button type="button" class="mais" onclick="addPosse(${i})">${ICO('plus')}Mais um cargo</button></div></div>`;
    }
    if (o.acao === 'trienio') extra = `<div class="dica" style="margin:0">A ata lista a Administração do cadastro (titulares, vices e auxiliares), com mandato de 1º de abril de ${anoDe(a.data) || '____'} a 31 de março de ${anoDe(a.data) ? anoDe(a.data) + 3 : '____'}. Atualize o cadastro antes e use “Puxar de novo” em “Pessoas desta ata”.</div>`;
    if (o.acao === 'sede') extra = campo('Novo endereço da sede', `<input data-b="a:ordem.${i}.sede" value="${esc(o.sede)}" placeholder="Rua ..., número ..., bairro ..., cidade">`);
    if (o.acao === 'relatorio') extra = `<div class="dica" style="margin:0">Os números vão nos cartões “Relatório do movimento” e “Relatórios contábeis”.</div>`;
    if (o.acao === 'parecer' || o.acao === 'conselho') extra = `<div class="dica" style="margin:0">Os nomes vão no cartão “Conselho Fiscal”.</div>`;
    return `<div class="od"><span class="le">${itemUnico(a) ? '•' : LETRAS[i]}</span><div class="od-c"><textarea data-b="a:ordem.${i}.texto" rows="2" placeholder="Texto do item como sai no edital">${esc(o.texto)}</textarea><div class="acao" title="O que este item faz na ata">${acoes}</div></div>
      <div class="od-a"><button type="button" class="mv" title="Subir" onclick="moverItem(${i},-1)"${i ? '' : ' disabled'}>${ICO('arrow-up')}</button><button type="button" class="mv" title="Descer" onclick="moverItem(${i},1)"${i < a.ordem.length - 1 ? '' : ' disabled'}>${ICO('arrow-down')}</button><button type="button" class="x" title="Remover item" onclick="remItem(${i})">${ICO('trash')}</button></div>
      ${extra ? `<div class="od-x">${extra}</div>` : ''}</div>`;
  }).join('');
  const prazo = a.data ? somaDias(a.data, -10) : '';
  return bloco('file', 'Edital de convocação', 'Afixar na sede com pelo menos 10 dias de antecedência', `<div class="grid g2" style="margin-bottom:14px">
      ${campo(`Data do edital${prazo ? ` <small>(até ${dataBR(prazo)})</small>` : ''}`, `<input type="date" data-b="a:editalData" data-r="ed" value="${esc(a.editalData)}">`)}
      ${campo('Quem assina o edital', `<select data-b="a:editalCargo" data-r="ed">${['presidente', 'vp1', 'vp2'].map(k => `<option value="${k}"${a.editalCargo === k ? ' selected' : ''}>${CARGO_ROT[k]}${a.comp.cargos[k] ? ' · ' + esc(a.comp.cargos[k]) : ''}</option>`).join('')}</select>`)}
    </div>${tipos}
    <div class="sub-t">Ordem do dia${itemUnico(a) ? ' (item único)' : ''}</div>
    ${itens || '<div class="vazio">Nenhum item. Adicione abaixo.</div>'}
    <div class="linha-b"><button type="button" class="mais" onclick="addItem()">${ICO('plus')}Adicionar item</button></div>`, `<em>${a.ordem.length} ${a.ordem.length === 1 ? 'item' : 'itens'}</em>`);
}
const somaDias = (iso, n) => { const p = partesData(iso); if (!p) return ''; const d = new Date(p.y, p.m - 1, p.d + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function blocoRelatorio(a) {
  const R = a.rel;
  const tot = (R.ceiaIrmaos || 0) + (R.ceiaIrmas || 0);
  const cats = R.obreiros.map((c, ci) => `<div class="cat"><div class="cat-h"><input data-b="a:rel.obreiros.${ci}.cat" value="${esc(c.cat)}" placeholder="Ministério de… (ex.: Diácono)"><button type="button" class="x" title="Remover este ministério" onclick="remCat(${ci})">${ICO('trash')}</button></div>
    ${c.itens.map((o, j) => `<div class="lin lin-ob"><input data-b="a:rel.obreiros.${ci}.itens.${j}.casa" value="${esc(o.casa)}" placeholder="Casa de oração (ex.: Central de Peabiru)"><input data-b="a:rel.obreiros.${ci}.itens.${j}.nome" value="${esc(o.nome)}" placeholder="Nome do irmão"><button type="button" class="x" title="Remover" onclick="remObreiro(${ci},${j})">${ICO('x')}</button></div>`).join('')}
    <div class="linha-b" style="margin-top:6px"><button type="button" class="mais" onclick="addObreiro(${ci})">${ICO('plus')}Irmão</button></div></div>`).join('');
  return bloco('book', 'Relatório do movimento', `Exercício de ${a.exercicio || '—'}: espiritual e material`, `
    <div class="sub-t">Assembleias realizadas no exercício</div>
    <textarea data-b="a:rel.assembleias" data-t="linhas" rows="3" placeholder="Uma por linha">${esc((R.assembleias || []).join('\n'))}</textarea>
    <div class="linha-b"><button type="button" class="mais" onclick="puxarAssembleias()">${ICO('refresh')}Puxar das atas cadastradas</button></div>
    <div class="sub-t">Batismos, Santa Ceia, bíblias e hinários</div>
    <div class="grid g4">
      ${campo('Batismos', `<input inputmode="numeric" data-b="a:rel.batismos" data-t="int" value="${R.batismos ?? ''}">`)}
      ${campo('Santa Ceia · irmãos', `<input inputmode="numeric" data-b="a:rel.ceiaIrmaos" data-t="int" value="${R.ceiaIrmaos ?? ''}">`)}
      ${campo('Santa Ceia · irmãs', `<input inputmode="numeric" data-b="a:rel.ceiaIrmas" data-t="int" value="${R.ceiaIrmas ?? ''}">`)}
      ${campo('Santa Ceia · total', `<input readonly data-d="ceia" value="${tot ? fmtI(tot) : ''}">`)}
      ${campo('Bíblias · quantidade', `<input inputmode="numeric" data-b="a:rel.biblias" data-t="int" value="${R.biblias ?? ''}">`)}
      ${campo('Bíblias · valor (R$)', `<input inputmode="decimal" class="num" data-b="a:rel.bibliasValor" data-t="money" value="${fmtR(R.bibliasValor)}">`)}
      ${campo('Hinários · quantidade', `<input inputmode="numeric" data-b="a:rel.hinarios" data-t="int" value="${R.hinarios ?? ''}">`)}
      ${campo('Hinários · valor (R$)', `<input inputmode="decimal" class="num" data-b="a:rel.hinariosValor" data-t="money" value="${fmtR(R.hinariosValor)}">`)}
    </div>
    <div class="sub-t">Novos obreiros (para o Ministério de…)</div>
    ${cats}
    <div class="linha-b"><button type="button" class="mais" onclick="addCat()">${ICO('plus')}Outro ministério</button></div>
    <div class="sub-t">Construções e terrenos</div>
    <div class="grid g2">
      ${campo('Construções entregues no ano', `<textarea data-b="a:rel.entregues" data-t="linhas" rows="3" placeholder="Uma casa de oração por linha">${esc((R.entregues || []).join('\n'))}</textarea>`)}
      ${campo('Construções em andamento em 31/12', `<textarea data-b="a:rel.andamento" data-t="linhas" rows="3" placeholder="Uma por linha">${esc((R.andamento || []).join('\n'))}</textarea>`)}
      ${campo('Terrenos adquiridos', `<textarea data-b="a:rel.terrenos" data-t="linhas" rows="3" placeholder="Uma localidade por linha">${esc((R.terrenos || []).join('\n'))}</textarea>`)}
      ${campo('Reformas e outras obras', `<textarea data-b="a:rel.construcao" data-t="linhas" rows="3" placeholder="Uma por linha">${esc((R.construcao || []).join('\n'))}</textarea>`)}
    </div>`);
}
function grupoCont(a, cam, gs) {
  return gs.map((g, gi) => `<div class="grp" data-cg="${cam}.${gi}"><div class="grp-h"><input data-b="a:cont.${cam}.${gi}.t" value="${esc(g.t)}" placeholder="TÍTULO DO GRUPO"><button type="button" class="x" title="Remover grupo" onclick="remGrupo('${cam}',${gi})">${ICO('trash')}</button></div>
    ${g.i.map((x, j) => x.auto === 'resultado'
      ? `<div class="vl auto-r"><input readonly data-d="rotres" value="${esc(rotResultado(a))}" title="Vem da Demonstração do Resultado"><input readonly class="num" data-d="res-v" value="${fmtR(resultado(a))}"><span></span></div>`
      : `<div class="vl"><input data-b="a:cont.${cam}.${gi}.i.${j}.r" value="${esc(x.r)}" placeholder="Descrição"><input class="num" inputmode="decimal" data-b="a:cont.${cam}.${gi}.i.${j}.v" data-t="money" value="${fmtR(x.v)}" placeholder="0,00"><button type="button" class="x" title="Remover linha" onclick="remValor('${cam}',${gi},${j})">${ICO('x')}</button></div>`).join('')}
    <div class="tot"><button type="button" class="mais" style="padding:4px 10px;font-size:12px" onclick="addValor('${cam}',${gi})">${ICO('plus')}Linha</button><span>TOTAL <span data-d="gt:${cam}.${gi}">${fmtR(totalGrupo(a, g))}</span></span></div></div>`).join('')
    + `<div class="linha-b"><button type="button" class="mais" onclick="addGrupo('${cam}')">${ICO('plus')}Grupo</button></div>`;
}
function blocoContabil(a) {
  const C = a.cont;
  const ab = `<div class="cont-abas"><button type="button" class="${CONT_ABA === 'dre' ? 'on' : ''}" onclick="mudarContAba('dre')">Demonstração do Resultado</button><button type="button" class="${CONT_ABA === 'bal' ? 'on' : ''}" onclick="mudarContAba('bal')">Balanço Patrimonial</button></div>`;
  let corpo;
  if (CONT_ABA === 'dre') {
    corpo = `<div class="sec-c"><div class="sec-h">RECEITAS</div>${grupoCont(a, 'dre.rec', C.dre.rec)}<div class="tot big"><span>TOTAL RECEITAS</span><span data-d="st:dre.rec">${fmtR(totalSecao(a, C.dre.rec))}</span></div></div>
      <div class="sec-c"><div class="sec-h">DESPESAS</div>${grupoCont(a, 'dre.desp', C.dre.desp)}<div class="tot big"><span>TOTAL DESPESAS</span><span data-d="st:dre.desp">${fmtR(totalSecao(a, C.dre.desp))}</span></div></div>
      <div data-d="resbox">${resBox(a)}</div>`;
  } else {
    corpo = `<div class="sec-c"><div class="sec-h">ATIVO</div>${grupoCont(a, 'bal.ativo', C.bal.ativo)}<div class="tot big"><span>TOTAL ATIVO</span><span data-d="st:bal.ativo">${fmtR(totalSecao(a, C.bal.ativo))}</span></div></div>
      <div class="sec-c"><div class="sec-h">PASSIVO</div>${grupoCont(a, 'bal.passivo', C.bal.passivo)}<div class="tot big"><span>TOTAL PASSIVO</span><span data-d="st:bal.passivo">${fmtR(totalSecao(a, C.bal.passivo))}</span></div></div>
      <div data-d="balbox">${balBox(a)}</div>`;
  }
  return bloco('coin', 'Relatórios contábeis', `Exercício encerrado em 31/12/${a.exercicio || '____'} · os totais somam sozinhos`, `<div class="dica">Digite os valores como estão no relatório do contador (ex.: 1.777.691,49). Para valor negativo, use o sinal de menos.</div>${ab}${corpo}`, `<em data-d="contchip" class="${balChip(a)[0]}">${balChip(a)[1]}</em>`);
}
function resBox(a) { const r = resultado(a); return `<div class="res ${r > 0 ? 'pos' : r < 0 ? 'neg' : 'zero'}"><span>${rotResultado(a)}</span><span>${fmtR(Math.abs(r))}</span></div>`; }
function balChip(a) {
  const at = totalSecao(a, a.cont.bal.ativo), ps = totalSecao(a, a.cont.bal.passivo);
  if (!at && !ps) return ['', 'sem valores'];
  return r2(at - ps) === 0 ? ['ok', 'ativo = passivo'] : ['er', 'ativo ≠ passivo'];
}
function balBox(a) {
  const at = totalSecao(a, a.cont.bal.ativo), ps = totalSecao(a, a.cont.bal.passivo), d = r2(at - ps);
  if (!at && !ps) return '';
  return d === 0 ? `<div class="res pos"><span>Ativo e passivo batem</span><span>${fmtR(at)}</span></div>` : `<div class="res neg"><span>Diferença entre ativo e passivo</span><span>${fmtR(d)}</span></div>`;
}
function blocoCF(a) {
  const F = a.cf;
  const temParecer = temAcao(a, 'parecer'), temPosse = temAcao(a, 'conselho');
  const nome = (b, v, ph, r) => `<input data-b="${b}"${r ? ' data-r="ed"' : ''} value="${esc(v)}" list="dlPessoas" placeholder="${ph}">`;
  const aviso = n => { if (!n || !a.qualificar) return ''; const f = faltasPessoa(n); return f.length ? `<div class="cg"><span class="aviso">${ICO('alert')}Falta ${f.join(', ')} · <button type="button" onclick="${pessoa(n) ? `irPessoa('${esc(n).replace(/'/g, "\\'")}')` : `novaPessoa('${esc(n).replace(/'/g, "\\'")}')`}">${pessoa(n) ? 'completar no cadastro' : 'cadastrar'}</button></span></div>` : ''; };
  const novo = k => `<label class="ck ck-p"><input type="checkbox" data-b="a:cf.novo.${k}" data-r="ed"${F.novo[k] ? ' checked' : ''}>novo nesta AGO</label>`;
  let h = '';
  if (temParecer) h += `<div class="sub-t">Parecer (Conselho do exercício findo)</div><div class="grid g4">${[0, 1, 2].map(i => campo(`Assina o parecer ${i + 1}`, nome(`a:cf.parecer.${i}`, F.parecer[i] || '', 'Membro do Conselho Fiscal'))).join('')}
      ${campo('Quem lê o parecer', nome('a:cf.leitor', F.leitor, 'Membro que lê'))}</div>`;
  if (temPosse) h += `<div class="sub-t">Conselho apresentado e empossado</div>
    <div class="grid g4">${[0, 1, 2].map(i => `<div>${campo(`Membro ${i + 1}`, nome(`a:cf.membros.${i}`, F.membros[i] || '', 'Nome', true))}${novo(i)}${aviso(F.membros[i])}</div>`).join('')}<div>${campo('Suplente', nome('a:cf.suplente', F.suplente, 'Nome', true))}${novo(3)}${aviso(F.suplente)}</div></div>
    <div class="dica" style="margin:8px 0 0">Quem não é novo entra na ata como “confirmados os mesmos irmãos que serviram no exercício findo”. Quem é novo entra como “apresentado e empossado para a vaga existente”.</div>
    <div class="grid g4" style="margin-top:12px">
      ${campo('Mandato vigora de', `<input type="date" data-b="a:cf.inicio" value="${esc(F.inicio)}">`)}
      ${campo('até', `<input type="date" data-b="a:cf.fim" value="${esc(F.fim)}">`)}
    </div>
    <div class="linha-b"><label class="ck"><input type="checkbox" data-b="a:cf.auxiliares"${F.auxiliares ? ' checked' : ''}>Mencionar os auxiliares da Administração</label>
    <button type="button" class="mais" style="margin-left:auto" onclick="cfDoCadastro()">${ICO('refresh')}Puxar do cadastro</button></div>`;
  return bloco('users', 'Conselho Fiscal', 'Mandato de um ano: de 1º de abril a 31 de março', h);
}

function cfDoCadastro() {
  const a = ATA(); a.cf.membros = DB.cad.cf.membros.slice(); a.cf.suplente = DB.cad.cf.suplente;
  const ant = DB.atas.filter(x => x.tipo === 'AGO' && x.id !== a.id && String(x.data) < String(a.data)).sort((x, y) => String(y.data).localeCompare(String(x.data)))[0];
  if (ant) a.cf.novo = marcarNovos(a.cf.membros, a.cf.suplente, ant.cf);
  guardar(); desenharEditor(); UI.toast('Conselho Fiscal puxado do cadastro.', 'ok');
}
function irPessoa(nome) { const p = pessoa(nome); if (!p) return novaPessoa(nome); FILTRO_PES = ''; mudarAba('cad'); setTimeout(() => { const d = document.querySelector(`details[data-pid="${p.id}"]`); if (d) { d.open = true; d.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }, 60); }
function blocoPessoas(a) {
  const c = a.comp;
  const linha = (r, v) => `<div><span>${r}</span><b>${esc(v || '—')}</b></div>`;
  const dif = compIgual(a) ? '' : `<div class="difere">${ICO('alert')}<span>O cadastro mudou depois desta ata.</span><button type="button" onclick="atualizarComp()">${ICO('refresh')}Atualizar com o cadastro</button></div>`;
  return bloco('user', 'Pessoas desta ata', 'Quem estava em cada cargo (vem do cadastro)', `${dif}<div class="snap">
    ${CARGOS.map(([k, r]) => linha(r, c.cargos[k])).join('')}
    ${linha('Mandato', c.inicio || c.fim ? `01/04/${c.inicio || '?'} a 31/03/${c.fim || '?'}` : '')}
    ${linha('Anciães', c.anciaes.length ? `${c.anciaes.length} irmãos` : '')}
    ${linha('Auxiliares', c.auxiliares.length ? `${c.auxiliares.length} irmãos` : '')}
    ${linha('Colaboradores', c.setores.length ? `${c.setores.reduce((s, x) => s + x.nomes.length, 0)} em ${c.setores.length} setores` : '')}
  </div><div class="linha-b"><button type="button" class="mais" onclick="mudarAba('cad')">${ICO('edit')}Abrir o cadastro</button>${dif ? '' : `<button type="button" class="mais" onclick="atualizarComp()">${ICO('refresh')}Puxar de novo</button>`}</div>`);
}
function blocoDoc(a) {
  const O = a.opc;
  const ck = (k, rot) => `<label class="ck"><input type="checkbox" data-b="a:opc.${k}" data-r="ed"${O[k] ? ' checked' : ''}>${rot}</label>`;
  return bloco('print', 'O que vai no PDF', 'Edital e ata sempre vão', `<div class="grid g2">
    ${ck('roteiro', 'Roteiro da assembleia (para o púlpito)')}
    ${ck('composicao', 'Composição da administração e colaboradores')}
    ${ck('conclusao', 'Conclusão e página de assinaturas')}
    ${ck('termoPosse', 'Termo de posse (assinado pelos empossados)')}
    <div class="ck" style="gap:10px">Lista de presença: <input inputmode="numeric" data-b="a:opc.presenca" data-t="int" value="${O.presenca ?? 0}" style="width:70px"> folhas</div>
  </div>${temAcao(a, 'relatorio') ? '<div class="dica" style="margin:12px 0 0">Com “Relatório e balanço” na ordem do dia, vão também a capa, o relatório, a demonstração do resultado, o balanço e o parecer do Conselho Fiscal.</div>' : ''}`);
}
let TEXTO_ABERTO = false;
function blocoTexto(a) {
  const man = a.textoManual != null;
  const tit = `<div class="ft-tit" data-d="titulo">${tituloAta(a)}</div>`;
  const botoes = `<button type="button" class="mais" onclick="copiarTexto()">${ICO('copy')}Copiar o texto</button><button type="button" class="mais" onclick="abrirPrevia()">${ICO('eye')}Ver como fica no PDF</button>`;
  const corpo = man
    ? `<div class="aviso-man">${ICO('alert')}<span>Texto editado à mão: o que você mudar nos campos acima <b>não</b> entra mais na ata.</span></div>
      <div class="folha-tela manual">${tit}<textarea data-b="a:textoManual" aria-label="Texto da ata">${esc(a.textoManual)}</textarea></div>
      <div class="linha-b">${botoes}<button type="button" class="mais" onclick="textoAuto()">${ICO('undo')}Voltar ao texto automático</button></div>`
    : `<div class="folha-tela${TEXTO_ABERTO ? '' : ' fechada'}" id="folhaTexto">${tit}<div class="ft-p" data-d="texto">${textoAtaHTML(a)}</div>
        <button type="button" class="ft-mais" onclick="abrirTexto()">${ICO('chevron-down')}Ler o texto inteiro</button></div>
      <div class="linha-b">${botoes}<button type="button" class="mais" onclick="textoMao()">${ICO('edit')}Editar o texto à mão</button></div>`;
  return bloco('edit', 'Texto da ata', man ? 'Editado à mão' : 'Montado sozinho com os dados acima · em negrito o que sai em negrito', corpo, `<em data-d="palavras">${contarPalavras(a)}</em>`);
}
function contarPalavras(a) { const n = textoAtaPlano(a).split(/\s+/).filter(Boolean).length; return `${n} palavras`; }
function abrirTexto() { TEXTO_ABERTO = true; const f = document.getElementById('folhaTexto'); if (f) f.classList.remove('fechada'); }
async function copiarTexto() {
  const a = ATA(); if (!a) return;
  const d = document.createElement('div'); d.innerHTML = tituloAta(a);
  const txt = d.textContent + '\n\n' + (a.textoManual != null ? String(a.textoManual).replace(/\s*\n+\s*/g, ' ').trim() : textoAtaPlano(a));
  try { await navigator.clipboard.writeText(txt); UI.toast('Texto da ata copiado.', 'ok'); }
  catch (e) { const t = document.createElement('textarea'); t.value = txt; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); UI.toast('Texto da ata copiado.', 'ok'); } catch (x) { UI.toast('Não foi possível copiar.', 'error'); } t.remove(); }
}
function textoMao() { const a = ATA(); a.textoManual = textoAtaPlano(a); guardar(); desenharEditor(); }
async function textoAuto() {
  const ok = await UI.confirm('Voltar ao texto automático?', 'O que você escreveu à mão será descartado.', { ok: 'Voltar', danger: true });
  if (!ok) return; const a = ATA(); const ant = a.textoManual; a.textoManual = null; guardar(); desenharEditor();
  UI.toast('Texto automático de volta.', { action: { label: 'Desfazer', icon: 'undo', fn: () => { a.textoManual = ant; guardar(); desenharEditor(); } } });
}

function desenharEditor() {
  const el = document.getElementById('ed'); if (!el) return;
  atualizarDatalists();
  const a = ATA();
  if (!a) {
    el.innerHTML = `${DB.atas.length ? selMovel() : ''}<div class="vazia"><b>${DB.atas.length ? 'Escolha uma ata' : 'Nenhuma ata ainda'}</b>${DB.cad.pessoas.length || DB.cad.adm.cargos.presidente ? 'Crie a primeira com “Nova ata”. Ela puxa do cadastro quem está em cada cargo.' : 'Comece pelo <b>Cadastro</b>: administração, Conselho Fiscal e dados dos irmãos. Depois crie a ata. Se você tem o arquivo com os dados iniciais, abra em Arquivo › Abrir backup.'}
      <div class="linha-b"><button type="button" onclick="mudarAba('cad')">${ICO('users')}Abrir o cadastro</button><button type="button" class="primary" onclick="novaAta('AGO')">${ICO('plus')}Nova AGO</button><button type="button" onclick="novaAta('AGE')">${ICO('plus')}Nova AGE</button><button type="button" onclick="novaAta('RLA')">${ICO('plus')}Nova RLA</button><button type="button" onclick="novaAta('RLM')">${ICO('plus')}Nova RLM</button></div></div>`;
    montarIndice(); return;
  }
  const y = window.scrollY;
  let h = selMovel() + `<div class="heroi" id="heroi">${heroiHTML(a)}</div>`;
  if (ehReuniao(a)) h += desenharReuniao(a);
  else {
    h += blocoDados(a) + blocoEdital(a);
    if (temAcao(a, 'relatorio')) h += blocoRelatorio(a) + blocoContabil(a);
    if (temAcao(a, 'parecer') || temAcao(a, 'conselho')) h += blocoCF(a);
    h += blocoPessoas(a) + blocoDoc(a) + blocoTexto(a);
  }
  const foco = lerFoco(el);
  el.innerHTML = h;
  document.querySelectorAll('#ed .od textarea').forEach(crescer);
  window.scrollTo(0, y);
  voltarFoco(el, foco);
  montarIndice();
}
// mantém o cursor no mesmo campo (ou botão) depois de redesenhar
const FOCAVEIS = 'input,select,textarea,button';
function lerFoco(host) {
  const ae = document.activeElement; if (!ae || !host.contains(ae)) return null;
  return { b: ae.dataset ? ae.dataset.b : null, i: [...host.querySelectorAll(FOCAVEIS)].indexOf(ae) };
}
function voltarFoco(host, f) {
  if (!f) return;
  let alvo = f.b ? host.querySelector(`[data-b="${f.b}"]`) : null;
  if (!alvo && f.i >= 0) alvo = host.querySelectorAll(FOCAVEIS)[f.i];
  if (alvo && alvo.type !== 'checkbox') alvo.focus({ preventScroll: true });
}
/* ---------- índice das seções (lateral no computador, "Seções" na barra do celular) ---------- */
function montarIndice() {
  const host = document.getElementById(ABA === 'atas' ? 'ed' : 'cad');
  const nav = document.getElementById(ABA === 'atas' ? 'indAtas' : 'indCad'), mob = document.getElementById('menuIndice');
  const secs = host ? [...host.querySelectorAll('.bloco[id]')].filter(b => !b.parentElement.closest('.bloco')) : [];
  const its = secs.map(b => {
    const t = b.querySelector('h3 > span:nth-child(2)'), em = b.querySelector(':scope > h3 > em');
    return { id: b.id, ic: b.dataset.ic || 'file', tit: t ? t.firstChild.textContent.trim() : '', em: em ? em.textContent.trim() : '' };
  });
  const bt = it => `<button type="button" data-ir="${it.id}" onclick="irBloco('${it.id}')">${ICO(it.ic)}<span>${esc(it.tit)}</span>${it.em ? `<em>${esc(it.em)}</em>` : ''}</button>`;
  if (nav) nav.innerHTML = its.length ? `<div class="ind-t">${ABA === 'atas' ? 'Nesta ata' : 'No cadastro'}</div>${its.map(bt).join('')}` : '';
  if (mob) mob.innerHTML = its.map(it => bt(Object.assign({}, it, { em: '' }))).join('');
  marcarIndice();
}
function irBloco(id) {
  const el = document.getElementById(id); if (!el) return;
  const topo = (document.querySelector('.topo') || {}).offsetHeight || 0;
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - topo - 12, behavior: 'smooth' });
  el.classList.remove('pisca'); void el.offsetWidth; el.classList.add('pisca');
}
function marcarIndice() {
  const nav = document.getElementById(ABA === 'atas' ? 'indAtas' : 'indCad'); if (!nav) return;
  const lim = ((document.querySelector('.topo') || {}).offsetHeight || 0) + 40;
  let atual = null;
  nav.querySelectorAll('[data-ir]').forEach(b => { const s = document.getElementById(b.dataset.ir); if (s && s.getBoundingClientRect().top <= lim) atual = b.dataset.ir; });
  if (!atual) { const p = nav.querySelector('[data-ir]'); atual = p && p.dataset.ir; }
  if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) { const l = nav.querySelectorAll('[data-ir]'); if (l.length) atual = l[l.length - 1].dataset.ir; }
  nav.querySelectorAll('[data-ir]').forEach(b => b.classList.toggle('on', b.dataset.ir === atual));
}
let _tInd = null;
window.addEventListener('scroll', () => { if (_tInd) return; _tInd = requestAnimationFrame(() => { _tInd = null; marcarIndice(); }); }, { passive: true });
function derivados() {
  const a = ATA();
  if (a && ABA === 'atas') {
    document.querySelectorAll('#ed [data-d]').forEach(el => {
      const k = el.dataset.d; let v = null;
      if (ehReuniao(a) && !['texto', 'titulo', 'palavras'].includes(k)) v = derivadosReuniao(a, el, k);
      else if (k === 'ceia') v = fmtI((a.rel.ceiaIrmaos || 0) + (a.rel.ceiaIrmas || 0)) || '';
      else if (k.startsWith('gt:')) { const [cam, g] = [k.slice(3, k.lastIndexOf('.')), +k.slice(k.lastIndexOf('.') + 1)]; v = fmtR(totalGrupo(a, getP(a.cont, cam)[g])); }
      else if (k.startsWith('st:')) v = fmtR(totalSecao(a, getP(a.cont, k.slice(3))));
      else if (k === 'resbox') v = resBox(a);
      else if (k === 'balbox') v = balBox(a);
      else if (k === 'res-v') v = fmtR(resultado(a));
      else if (k === 'rotres') v = rotResultado(a);
      else if (k === 'contchip') { const c = balChip(a); el.className = c[0]; v = c[1]; }
      else if (k === 'texto') v = textoAtaHTML(a);
      else if (k === 'titulo') v = tituloAta(a);
      else if (k === 'palavras') v = contarPalavras(a);
      if (v == null) return;
      if (el.tagName === 'INPUT') { if (el.value !== v) el.value = v; } else if (el.innerHTML !== v) el.innerHTML = v;
    });
    const hr = document.getElementById('heroi'); if (hr) hr.innerHTML = heroiHTML(a);
    desenharLista();
  }
  if (ABA === 'cad') atualizarResumoCad();
}
function atualizarDatalists() {
  const dl = document.getElementById('dlPessoas'); if (!dl) return;
  const nomes = new Set(DB.cad.pessoas.map(p => p.nome).filter(Boolean));
  Object.values(DB.cad.adm.cargos).concat(DB.cad.cf.membros, DB.cad.cf.suplente).forEach(n => { if (n) nomes.add(n); });
  dl.innerHTML = [...nomes].sort((x, y) => x.localeCompare(y, 'pt-BR')).map(n => `<option value="${esc(n)}">`).join('');
  const igrA = new Map(((REL_ANC && REL_ANC.lst) || []).map(x => [norm(x.nome), x.igreja]));
  document.getElementById('dlAnciaes').innerHTML = limpos(DB.cad.anciaes).map(n => `<option value="${esc(n)}"${igrA.get(norm(n)) ? ` label="${esc(igrA.get(norm(n)))}"` : ''}>`).join('');
  let dc = document.getElementById('dlCargos');
  if (!dc) { dc = document.createElement('datalist'); dc.id = 'dlCargos'; document.body.appendChild(dc); }
  dc.innerHTML = CARGOS_ESTATUTO.concat(CARGOS_CF).map(([, r]) => `<option value="${r}">`).join('');
  let dv = document.getElementById('dlLivros');
  if (!dv) { dv = document.createElement('datalist'); dv.id = 'dlLivros'; dv.innerHTML = LIVROS.map(([k]) => `<option value="${k}">`).join(''); document.body.appendChild(dv); }
  let da = document.getElementById('dlAssuntos');
  if (!da) { da = document.createElement('datalist'); da.id = 'dlAssuntos'; da.innerHTML = ASSUNTOS_SUGERIDOS.map(k => `<option value="${k}">`).join(''); document.body.appendChild(da); }
}

/* =====================================================================
   Tela: cadastro
   ===================================================================== */
function blocoEnt() {
  const e = DB.cad.ent;
  return bloco('pin', 'Cabeçalho e sede', 'Sai igual em todas as páginas', `<div class="grid g3">
    ${campo('Entidade', inp('c:ent.nome', e.nome), 's2')}${campo('CNPJ', inp('c:ent.cnpj', e.cnpj))}
    ${campo('Região (cidade sede)', inp('c:ent.regiao', e.regiao))}${campo('Estado', inp('c:ent.uf', e.uf))}${campo('Sigla do estado', inp('c:ent.ufSigla', e.ufSigla))}
    ${campo('Rua da sede', inp('c:ent.rua', e.rua), 's2')}${campo('Número', inp('c:ent.num', e.num))}
    ${campo('Bairro', inp('c:ent.bairro', e.bairro))}${campo('CEP', inp('c:ent.cep', e.cep))}${campo('Telefone', inp('c:ent.fone', e.fone))}
    ${campo('Casa de oração das assembleias', inp('c:ent.casa', e.casa))}
    ${campo('Municípios que a administração abrange', `<textarea data-b="c:ent.municipios" rows="2">${esc(e.municipios)}</textarea>`, 's2')}
  </div>`);
}
function cgCampo(b, v, rot, precisa) {
  if (!precisa) return `<div class="cg"><label>${rot}</label><input data-b="${b}" data-r="cad" value="${esc(v)}" list="dlPessoas" placeholder="Nome"></div>`;
  const p = v ? pessoa(v) : null;
  let f = v ? faltasPessoa(v) : [];
  if (precisa === 'cpf') f = p ? (p.cpf ? [] : ['CPF']) : f;
  const av = !v ? '' : !p ? `<span class="aviso">${ICO('alert')}${precisa === 'cpf' ? 'Falta o CPF' : 'Sem dados pessoais'} · <button type="button" onclick="novaPessoa('${esc(v).replace(/'/g, "\\'")}')">cadastrar</button></span>` : f.length ? `<span class="aviso">${ICO('alert')}Falta ${f.join(', ')} · <button type="button" onclick="irPessoa('${esc(v).replace(/'/g, "\\'")}')">completar</button></span>` : '';
  return `<div class="cg"><label>${rot}</label><input data-b="${b}" data-r="cad" value="${esc(v)}" list="dlPessoas" placeholder="Nome">${av}</div>`;
}
function blocoAdm() {
  const A = DB.cad.adm;
  const g = GRUPOS_CARGO.map(([t, ks]) => `<div class="cargo-g"><h4>${t}</h4>${ks.map(k => cgCampo(`c:adm.cargos.${k}`, A.cargos[k], CARGO_ROT[k], (k === 'presidente' || k === 'tesoureiro') ? 'cpf' : null)).join('')}</div>`).join('');
  return bloco('users', 'Administração', 'Titulares e vices: a ata puxa daqui. O contador não é cargo do estatuto: só assina o balanço', `<div class="grid g4" style="margin-bottom:14px">
      ${campo('Triênio: de 1º de abril de', `<input inputmode="numeric" data-b="c:adm.inicio" value="${esc(A.inicio)}" placeholder="ex.: 2024">`)}
      ${campo('até 31 de março de', `<input inputmode="numeric" data-b="c:adm.fim" value="${esc(A.fim)}" placeholder="ex.: 2027">`)}
      ${cgCampo('c:adm.cargos.contador', A.cargos.contador, 'Contador', 'cpf')}
      ${campo('CRC do contador', inp('c:adm.crc', A.crc, 'placeholder="ex.: 043470/O-0"'))}
    </div><div class="cargos">${g}</div>`);
}
function blocoCFCad() {
  const F = DB.cad.cf;
  return bloco('check-circle', 'Conselho Fiscal', 'Mandato atual (a nova AGO puxa daqui)', `<div class="grid g4">${[0, 1, 2].map(i => cgCampo(`c:cf.membros.${i}`, F.membros[i] || '', `Membro ${i + 1}`, 'qual')).join('')}${cgCampo('c:cf.suplente', F.suplente, 'Suplente', 'qual')}</div>`);
}
function blocoPessoasCad() {
  const P = DB.cad.pessoas.slice().sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'));
  const f = norm(FILTRO_PES);
  const lista = P.filter(p => !f || norm(p.nome).includes(f)).map(p => {
    const usos = usosPessoa(p.nome);
    // só cobra o que é usado: qualificação completa para o Conselho Fiscal; CPF para quem assina o balanço
    const qual = usos.some(u => /Conselho|Suplente/.test(u)), soCpf = usos.some(u => /^(Presidente|Tesoureiro|Contador)$/.test(u));
    const falta = qual ? faltasPessoa(p.nome) : soCpf && !p.cpf ? ['CPF'] : [];
    const ini = p.nome.split(' ').filter(Boolean).map(x => x[0]).slice(0, 2).join('').toUpperCase() || '?';
    const i = DB.cad.pessoas.indexOf(p), b = k => `c:pessoas.${i}.${k}`;
    return `<details class="pes" data-pid="${p.id}"><summary><span class="av">${esc(ini)}</span><span class="pn"><b>${esc(p.nome || 'Sem nome')}</b><small>${usos.map(u => `<span class="tag">${esc(u)}</span>`).join('')}${falta.length ? `<span class="tag al">falta ${esc(falta.join(', '))}</span>` : (usos.length ? '' : esc([p.estadoCivil, p.profissao].filter(Boolean).join(' · ')))}</small></span><svg class="ic chv"><use href="/assets/icons.svg#i-chevron-right"></use></svg></summary>
      <div class="pc"><div class="grid g3">
        ${campo('Nome completo', `<input data-b="${b('nome')}" data-t="pnome" value="${esc(p.nome)}">`, 's2')}${campo('Nacionalidade', inp(b('nacionalidade'), p.nacionalidade))}
        ${campo('Estado civil', `<input data-b="${b('estadoCivil')}" value="${esc(p.estadoCivil)}" list="dlEC" placeholder="casado">`)}${campo('Profissão', inp(b('profissao'), p.profissao, 'placeholder="ex.: empresário"'), 's2')}
        ${campo('Documento', `<select data-b="${b('docTipo')}" data-r="cad"><option value="rg"${p.docTipo !== 'cin' ? ' selected' : ''}>RG</option><option value="cin"${p.docTipo === 'cin' ? ' selected' : ''}>CIN (nova identidade)</option></select>`)}
        ${campo(p.docTipo === 'cin' ? 'Número da CIN' : 'Número do RG <small>(com órgão)</small>', inp(b('doc'), p.doc, `placeholder="${p.docTipo === 'cin' ? '000.000.000-00' : 'ex.: 10.210.514-1-SESP/PR'}"`))}
        ${p.docTipo === 'cin' ? '<div class="dica" style="margin:22px 0 0">Na CIN o número é o CPF.</div>' : campo('CPF', inp(b('cpf'), p.cpf, 'placeholder="000.000.000-00"'))}
        ${campo('Endereço completo', inp(b('endereco'), p.endereco, 'placeholder="Rua, nº – Bairro – Cidade – PR"'), 'full')}
      </div><div class="linha-b"><button type="button" class="danger" style="margin-left:auto" onclick="excluirPessoa('${p.id}')">${ICO('trash')}Remover do cadastro</button></div></div></details>`;
  }).join('');
  return bloco('user', 'Irmãos: dados pessoais', 'Usados na qualificação da ata (posse) e nas assinaturas do balanço', `
    <div class="pes-busca">${ICO('search')}<input type="search" placeholder="Buscar irmão" value="${esc(FILTRO_PES)}" oninput="FILTRO_PES=this.value;filtrarPessoas()"></div>
    <div id="listaPes">${lista || '<div class="vazio">Ninguém cadastrado ainda.</div>'}</div>
    <div class="linha-b"><button type="button" class="mais" onclick="novaPessoa('')">${ICO('plus')}Cadastrar irmão</button></div>`, `<em>${P.length}</em>`, 'cartaoPessoas');
}
function filtrarPessoas() { const f = norm(FILTRO_PES); document.querySelectorAll('#listaPes details.pes').forEach(d => { const p = DB.cad.pessoas.find(x => x.id === d.dataset.pid); d.hidden = !!f && !norm(p ? p.nome : '').includes(f); }); }
function blocoNomes(k, ic, tit, sub, ph) {
  const v = DB.cad[k];
  return bloco(ic, tit, sub, `<textarea data-b="c:${k}" data-t="linhas" rows="${Math.min(16, Math.max(5, limpos(v).length + 2))}" placeholder="${ph}">${esc(v.join('\n'))}</textarea>`, `<em data-d="n:${k}">${limpos(v).length}</em>`);
}
/* ---------- anciães: vêm do cadastro do Relatório de Igrejas ---------- */
const REG_IGREJAS = { 'campo mourao': 'campomourao', cianorte: 'cianorte', ubirata: 'ubirata', pitanga: 'pitanga', goioere: 'goioere', ivaipora: 'ivaipora' };
const regIgrejas = () => REG_IGREJAS[norm(DB.cad.ent.regiao)] || 'campomourao';
let REL_ANC = null;   // { lst:[{nome, igreja}], igrejas, onde } depois de ler o relatório
function ancDoRelatorio(d) {
  const vistos = new Set(), out = [];
  (d.igrejas || []).forEach(i => (i.anciaes || []).forEach(n => {
    n = String(n || '').trim().replace(/\s+/g, ' '); if (!n || vistos.has(norm(n))) return;
    vistos.add(norm(n)); out.push({ nome: n, igreja: [i.nome, i.cidade && i.cidade !== i.nome ? i.cidade : ''].filter(Boolean).join(' · ') });
  }));
  return out;
}
async function lerRelatorioIgrejas() {
  const r = regIgrejas(); let loc = null, nuv = null, pend = false;
  try { loc = JSON.parse(localStorage.getItem('ccb_igrejas_' + r) || 'null'); pend = localStorage.getItem('ccb_igrejas_' + r + '_pend') === '1'; } catch (e) {}
  if (localStorage.getItem('session_token')) {
    try { const d = await api('lista-load', { regiao: r, nome: '_igrejas.json' }); nuv = typeof d.conteudo === 'string' ? JSON.parse(d.conteudo) : d.conteudo; } catch (e) {}
  }
  const ok = d => d && Array.isArray(d.igrejas) && d.igrejas.length;
  if (ok(loc) && (pend || !ok(nuv) || (loc.atualizado || 0) >= (nuv.atualizado || 0))) return Object.assign(loc, { _onde: pend ? 'neste aparelho (ainda não salvo na nuvem)' : 'neste aparelho' });
  if (ok(nuv)) return Object.assign(nuv, { _onde: 'na nuvem' });
  return null;
}
async function sincronizarAnciaes(manual) {
  if (DB.cad.anciaesFonte === 'manual' && !manual) return;
  const d = await lerRelatorioIgrejas();
  const lst = d ? ancDoRelatorio(d) : [];
  REL_ANC = { lst, igrejas: d ? d.igrejas.length : 0, onde: d ? d._onde : '', achou: !!d };
  const redesenhar = () => { atualizarDatalists(); if (ABA === 'cad') desenharCad(); };
  if (!lst.length) {
    if (manual) UI.toast(d ? 'O Relatório de Igrejas ainda não tem anciães cadastrados.' : `Não achei o Relatório de Igrejas de ${DB.cad.ent.regiao} (nem neste aparelho, nem na nuvem).`, 'info');
    redesenhar(); return;
  }
  const novos = lst.map(x => x.nome), atual = limpos(DB.cad.anciaes);
  const igual = DB.cad.anciaesFonte !== 'manual' && novos.length === atual.length && novos.every((n, i) => norm(n) === norm(atual[i]));
  if (igual) { if (manual) UI.toast(`Os anciães já estão iguais ao Relatório de Igrejas (${novos.length}).`, 'ok'); redesenhar(); return; }
  const ant = DB.cad.anciaes.slice(), fonteAnt = DB.cad.anciaesFonte;
  const ent = novos.filter(n => !atual.some(x => norm(x) === norm(n))).length, sai = atual.filter(n => !novos.some(x => norm(x) === norm(n))).length;
  DB.cad.anciaes = novos; DB.cad.anciaesFonte = 'relatorio'; guardar(); redesenhar();
  const det = [ent ? `${ent} ${ent === 1 ? 'novo' : 'novos'}` : '', sai ? `${sai} ${sai === 1 ? 'saiu' : 'saíram'}` : ''].filter(Boolean).join(', ');
  UI.toast(`Anciães puxados do Relatório de Igrejas: ${novos.length}${det ? ' (' + det + ')' : ''}.`, { type: 'ok', action: { label: 'Desfazer', icon: 'undo', fn: () => { DB.cad.anciaes = ant; DB.cad.anciaesFonte = fonteAnt; guardar(); desenharTudo(); } } });
}
function anciaesMao() { DB.cad.anciaesFonte = 'manual'; guardar(); desenharCad(); focarUltimo('#cad textarea[data-b="c:anciaes"]'); }
const iniciais = n => String(n || '').trim().split(/\s+/).filter(p => p.length > 2 || /^[A-ZÁ-Ú]/.test(p)).map(p => p[0]).filter((c, i, l) => i === 0 || i === l.length - 1).join('').toUpperCase();
function blocoAnciaes() {
  const v = limpos(DB.cad.anciaes), man = DB.cad.anciaesFonte === 'manual';
  const em = `<em data-d="n:anciaes">${v.length}</em>`;
  const reg = regIgrejas();
  const abrir = `<button type="button" class="mais" onclick="location.href='/relatorio-igrejas.html?regiao=${reg}'">${ICO('arrow-right')}Abrir o Relatório de Igrejas</button>`;
  if (man) return bloco('users', 'Anciães', 'Digitados à mão · assinam a ata e a conclusão', `<textarea data-b="c:anciaes" data-t="linhas" rows="${Math.min(16, Math.max(5, v.length + 2))}" placeholder="Um nome por linha">${esc(DB.cad.anciaes.join('\n'))}</textarea>
    <div class="linha-b"><button type="button" class="mais" onclick="sincronizarAnciaes(true)">${ICO('refresh')}Puxar do Relatório de Igrejas</button>${abrir}</div>`, em);
  const igr = new Map(((REL_ANC && REL_ANC.lst) || []).map(x => [norm(x.nome), x.igreja]));
  const fonte = !REL_ANC ? `${ICO('spinner')}<span>Procurando o Relatório de Igrejas…</span>`
    : REL_ANC.lst.length ? `${ICO('check-circle')}<span>Puxados do <b>Relatório de Igrejas</b> (${REL_ANC.onde}) · ${REL_ANC.igrejas} ${REL_ANC.igrejas === 1 ? 'casa de oração' : 'casas de oração'}. Para mudar, mude lá.</span>`
    : `${ICO('alert')}<span>${REL_ANC.achou ? 'O Relatório de Igrejas ainda não tem anciães.' : 'Não achei o Relatório de Igrejas.'} Ficam os nomes que já estavam aqui.</span>`;
  return bloco('users', 'Anciães', 'Assinam a ata e a conclusão · ficam à mão para “Ancião que preside”', `<div class="anc-fonte${REL_ANC && !REL_ANC.lst.length ? ' al' : ''}">${fonte}</div>
    ${v.length ? `<div class="anc-l">${v.map(n => `<div class="anc"><span class="av">${esc(iniciais(n))}</span><span><b>${esc(n)}</b>${igr.get(norm(n)) ? `<small>${esc(igr.get(norm(n)))}</small>` : ''}</span></div>`).join('')}</div>` : '<div class="vazio">Nenhum ancião.</div>'}
    <div class="linha-b"><button type="button" class="mais" onclick="sincronizarAnciaes(true)">${ICO('refresh')}Atualizar agora</button>${abrir}<button type="button" class="mais" onclick="anciaesMao()">${ICO('edit')}Digitar à mão</button></div>`, em);
}
function blocoSetores() {
  const S = DB.cad.setores;
  let letra = -1, sub = 0;
  const rot = S.map(s => { if (s.sub && letra >= 0) { sub++; return `${LETRAS[letra]}.${sub})`; } letra++; sub = 0; return `${LETRAS[letra]})`; });
  return bloco('grid', 'Colaboradores por setor', 'Irmãos que colaboram nos diversos setores da administração', S.map((s, i) => `<div class="cat setor"><div class="cat-h"><span class="tag" style="font-size:12px">${rot[i]}</span><input data-b="c:setores.${i}.nome" value="${esc(s.nome)}" placeholder="Nome do setor">
      <label class="ck" style="font-size:12.5px;white-space:nowrap" title="Numera como a.1), a.2)…"><input type="checkbox" data-b="c:setores.${i}.sub" data-r="cad"${s.sub ? ' checked' : ''}>subsetor</label>
      <button type="button" class="mv" title="Subir" onclick="moverSetor(${i},-1)">${ICO('arrow-up')}</button><button type="button" class="mv" title="Descer" onclick="moverSetor(${i},1)">${ICO('arrow-down')}</button><button type="button" class="x" title="Remover setor" onclick="remSetor(${i})">${ICO('trash')}</button></div>
      <textarea data-b="c:setores.${i}.nomes" data-t="linhas" rows="${Math.max(2, limpos(s.nomes).length + 1)}" placeholder="Um nome por linha">${esc(s.nomes.join('\n'))}</textarea></div>`).join('') + `<div class="linha-b"><button type="button" class="mais" onclick="addSetor()">${ICO('plus')}Setor</button></div>`);
}
function blocoTextos() {
  const T = DB.cad.textos;
  return bloco('file', 'Textos padrão', 'Parecer do Conselho Fiscal e conclusão. {exercicio} e {regiao} trocam sozinhos', `<div class="grid">
    ${campo('Parecer do Conselho Fiscal', `<textarea data-b="c:textos.parecer" rows="8">${esc(T.parecer)}</textarea>`)}
    ${campo('Conclusão', `<textarea data-b="c:textos.conclusao" rows="9">${esc(T.conclusao)}</textarea>`)}
    <div class="linha-b"><button type="button" class="mais" onclick="textosPadrao()">${ICO('undo')}Voltar aos textos padrão</button></div></div>`);
}
function textosPadrao() { const ant = clone(DB.cad.textos); DB.cad.textos = { parecer: TEXTO_PARECER, conclusao: TEXTO_CONCLUSAO }; guardar(); desenharCad(); UI.toast('Textos padrão de volta.', { action: { label: 'Desfazer', icon: 'undo', fn: () => { DB.cad.textos = ant; guardar(); desenharCad(); } } }); }
function atualizarResumoCad() { document.querySelectorAll('#cad [data-d^="n:"]').forEach(el => { el.textContent = limpos(DB.cad[el.dataset.d.slice(2)]).length; }); }
function desenharCad() {
  const el = document.getElementById('cad'); if (!el) return;
  atualizarDatalists();
  let ec = document.getElementById('dlEC'); if (!ec) { ec = document.createElement('datalist'); ec.id = 'dlEC'; ec.innerHTML = ESTADO_CIVIL.map(x => `<option value="${x}">`).join(''); document.body.appendChild(ec); }
  const y = window.scrollY;
  const abertos = [...el.querySelectorAll('details[open]')].map(d => d.dataset.pid);
  const foco = lerFoco(el);
  el.innerHTML = blocoAdm() + blocoCFCad() + blocoPessoasCad()
    + blocoAnciaes()
    + blocoNomes('auxiliares', 'users', 'Auxiliares da administração', 'Apresentados na AGO e listados na composição', 'Um nome por linha')
    + blocoSetores() + blocoEnt() + blocoTextos();
  abertos.forEach(id => { const d = el.querySelector(`details[data-pid="${id}"]`); if (d) d.open = true; });
  window.scrollTo(0, y);
  voltarFoco(el, foco);
  montarIndice();
}
function desenharTudo() { desenharLista(); if (ABA === 'atas') desenharEditor(); else desenharCad(); mostrarEstado(); }

/* =====================================================================
   Texto da ata
   ===================================================================== */
const U = t => `<u>${t}</u>`;
const B = t => `<b>${t}</b>`;
// nomes sempre em negrito (manual: "Os nomes devem estar EM NEGRITO")
const N = n => B(esc(String(n || '').trim() || '______'));
const juntarE = l => l.length > 1 ? l.slice(0, -1).join(', ') + ' e ' + l[l.length - 1] : (l[0] || '');
function localAta(a) {
  const e = DB.cad.ent;
  return { casa: a.casa || e.casa, end: a.endereco || `${e.rua}, número ${e.num}, ${e.bairro}`, endEdital: a.endereco || `${e.rua} nº ${e.num}`, cidade: e.regiao, uf: e.uf };
}
// quem conduz pela Administração, quem lavra e quem assina o edital (titular ou substituto legal)
function papel(a, k, titular) {
  const nome = cargo(a, k) || cargo(a, titular);
  const subst = k !== titular && cargo(a, k);
  return { nome, cargoExt: subst ? CARGO_EXT[k] : CARGO_EXT[titular], subst, rot: subst ? `${CARGO_EXT[k]} da Administração, substituto legal do ${CARGO_EXT[titular]}` : `${CARGO_EXT[titular]} da Administração` };
}
const conduz = a => papel(a, a.conduz || 'presidente', 'presidente');
const lavra = a => papel(a, a.lavra || 'secretario', 'secretario');
const assinaEdital = a => papel(a, a.editalCargo || 'presidente', 'presidente');
// no edital impresso segue o modelo (nº, 19:00 horas); transcrito dentro da ata, vai sem abreviações
function editalCorpo(a, naAta) {
  const L = localAta(a), e = DB.cad.ent;
  const end = a.endereco || (naAta ? `${e.rua}, número ${e.num}` : L.endEdital);
  const h = /^(\d{1,2}):(\d{2})/.exec(a.hora || '');
  const hora = !h ? '____' : naAta ? horaExt(a.hora) : `${h[1].padStart(2, '0')}:${h[2]} horas`;
  return `Cumpre-me convidar a cara irmandade para a ${NOME_TIPO[a.tipo]} que será realizada no dia ${a.data ? dataExt2(a.data) : '____ de __________ de ____'}, às ${hora} na sede da Administração, situada na ${esc(end)}, nesta cidade, e que obedecerá à seguinte`;
}
const itemUnico = a => a.ordem.length === 1;
const rotItem = (a, i) => itemUnico(a) ? 'item único' : `item “${LETRAS[i]}”`;
function vigAdm(a) { return { ini: a.comp.inicio ? `${a.comp.inicio}-04-01` : '', fim: a.comp.fim ? `${a.comp.fim}-03-31` : '' }; }
const qualif = (a, nome) => a.qualificar ? qualificacao(nome) : N(nome);

/* ---------- relatório do movimento (anexo 7.8): os mesmos textos vão no relatório e na ata ---------- */
function partesRelatorio(a) {
  const e = DB.cad.ent, R = a.rel, ex = a.exercicio, adm = `Administração de ${e.regiao}`;
  const P = [];
  const ass = limpos(R.assembleias).map(fimFrase);
  if (ass.length) P.push(['Assembleias Gerais', esc(ass.join('; ')) + '.']);
  if (R.batismos != null) P.push(['Batismos', `O Senhor se comprazeu em despertar, para obediência ao mandamento do Santo Batismo, ${numExt(R.batismos, true)} pessoas, das Casas de Oração pertencentes à ${esc(adm)}.`]);
  const ceia = (R.ceiaIrmaos || 0) + (R.ceiaIrmas || 0);
  if (ceia) P.push(['Santas Ceias', `Acostaram-se à Mesa do Senhor, para participar da Santa Ceia, ${numExt(ceia)} irmãos e irmãs, sendo ${numExt(R.ceiaIrmaos || 0)} irmãos e ${numExt(R.ceiaIrmas || 0, true)} irmãs, das Congregações pertencentes à ${esc(adm)}.`]);
  if (R.biblias != null || R.hinarios != null) P.push(['Bíblias e Hinários', `Foram fornecidos à irmandade ${numExt(R.biblias || 0, true)} Bíblias, no valor de ${reaisExt(R.bibliasValor || 0)} e ${numExt(R.hinarios || 0)} Hinários, no valor de ${reaisExt(R.hinariosValor || 0)}.`]);
  const obr = R.obreiros.map(c => ({ cat: c.cat, itens: c.itens.filter(x => x.nome || x.casa) })).filter(c => c.itens.length);
  if (obr.length) P.push(['Novos Obreiros', `Nas localidades pertencentes à ${esc(adm)} o Senhor se comprazeu em levantar, ` + obr.map((c, k) => `${k && k === obr.length - 1 ? 'e ' : ''}para o Ministério de ${esc(c.cat)}: ${c.itens.map(x => `${esc(x.casa || '______')}, irmão ${N(x.nome)}`).join('; ')}`).join('; ') + '.']);
  const lst = l => limpos(l).map(fimFrase);
  const ent = lst(R.entregues), and = lst(R.andamento), ter = lst(R.terrenos), ref = lst(R.construcao);
  if (ent.length) P.push(['Construções entregues', `Foram concluídas e entregues, no ano de ${ex ? extenso(ex) : '____'}, ${numExt(ent.length, true)} ${ent.length === 1 ? 'Casa de Oração' : 'Casas de Oração'}, a saber: ${esc(ent.join('; '))}.`]);
  if (and.length) P.push(['Construções em andamento', `Encontravam-se em andamento, até trinta e um de dezembro de ${ex ? extenso(ex) : '____'}, as construções de ${numExt(and.length, true)} ${and.length === 1 ? 'nova Casa de Oração' : 'novas Casas de Oração'}, a saber: ${esc(and.join('; '))}.`]);
  if (ter.length) P.push(['Terrenos adquiridos', `Foram adquiridos, no ano de ${ex ? extenso(ex) : '____'}, ${numExt(ter.length)} ${ter.length === 1 ? 'terreno' : 'terrenos'}, para a construção de Casas de Oração, nas seguintes localidades: ${esc(ter.join('; '))}.`]);
  if (ref.length) P.push(['Reformas e outras obras', esc(ref.join('; ')) + '.']);
  if (temAcao(a, 'relatorio')) {
    const rc = totalSecao(a, a.cont.dre.rec), dp = totalSecao(a, a.cont.dre.desp), rs = resultado(a), at = totalSecao(a, a.cont.bal.ativo);
    if (rc || dp || at) P.push([`Balanço Geral encerrado em 31.12.${ex || '____'}`, `Foi feita a leitura do Balanço Geral e da demonstração das Receitas e Despesas, com receitas de ${reaisExt(rc)}, despesas de ${reaisExt(dp)}, ${rs < 0 ? 'déficit' : 'superávit'} do exercício de ${reaisExt(Math.abs(rs))} e total do ativo de ${reaisExt(at)}.`]);
  }
  return P;
}

/* ---------- composição da Administração (para "ficando assim constituída") ---------- */
function admConstituida(a, trocas) {
  const c = clone(a.comp.cargos || {});
  (trocas || []).forEach(x => { const k = chaveCargo(x.cargo); if (k && CARGO_EXT[k]) c[k] = x.nome; });
  const l = CARGOS_ESTATUTO.filter(([k]) => String(c[k] || '').trim()).map(([k]) => `${CARGO_EXT[k]}: ${N(c[k])}`);
  let t = l.join('; ');
  if (a.comp.auxiliares.length) t += `; e Auxiliares da Administração: ${juntarE(a.comp.auxiliares.map(N))}`;
  return t;
}
function cfConstituido(a, trocas) {
  const m = DB.cad.cf.membros.slice(), sup = { v: DB.cad.cf.suplente };
  (trocas || []).forEach(x => {
    const k = chaveCargo(x.cargo);
    if (k === 'cfs') sup.v = x.nome;
    else if (k === 'cf') {
      const i = m.findIndex(n => norm(n) === norm(x.anterior)); if (i >= 0) m[i] = x.nome; else if (!m.some(n => norm(n) === norm(x.nome))) m.push(x.nome);
      if (norm(sup.v) === norm(x.nome) && !(trocas || []).some(y => chaveCargo(y.cargo) === 'cfs')) sup.v = '';
    }
  });
  return `membros: ${juntarE(limpos(m).map(N))}${sup.v ? `; suplente: ${N(sup.v)}` : ''}`;
}

function textoAtaHTML(a) {
  if (a.textoManual != null) return esc(String(a.textoManual).replace(/\s*\n+\s*/g, ' ').trim());
  if (ehReuniao(a)) return textoReuniaoHTML(a);
  const e = DB.cad.ent, L = localAta(a), c = DB.cad, nTipo = NOME_TIPO[a.tipo];
  const pr = conduz(a), sc = lavra(a), ed = assinaEdital(a);
  const p = partesData(a.data);
  const abertura = p ? `${p.d === 1 ? 'Ao primeiro dia' : `Aos ${extenso(p.d)} dias`} do mês de ${MESES[p.m - 1]} de ${extenso(p.y)}` : 'Aos ____ dias do mês de __________ de ____';
  const hora = a.hora ? horaExt(a.hora) : '____ horas';
  const temCF = temAcao(a, 'parecer') || temAcao(a, 'conselho') || a.tipo === 'AGE';
  let t = `${abertura}, na Casa de Oração situada na ${esc(L.end)}, na cidade de ${esc(L.cidade)}, Estado do ${esc(L.uf)}, conforme Edital de Convocação afixado na porta principal da Congregação, com a presença de ${a.presentes != null ? numExt(a.presentes) : '______ (____)'} irmãos que assinaram ${a.tipo === 'AGE' ? 'o registro de comparecimento' : 'as respectivas listas de comparecimento'}, ${a.tipo === 'AGE' ? 'teve início, às ' + hora + ',' : 'iniciou-se às ' + hora} esta ${nTipo}. O irmão Ancião ${N(a.anciao)} convida o irmão ${N(pr.nome)}, ${pr.rot}, para iniciar a Assembleia. Declarada aberta a Assembleia Em Nome do Senhor Jesus, o ${pr.subst ? 'irmão ' + pr.cargoExt : 'Presidente'} convida os demais irmãos Administradores${temCF ? ' e membros do Conselho Fiscal' : ''} a subirem ao púlpito. A seguir, determina que eu, ${N(sc.nome)}, ${sc.rot}, proceda à leitura do Edital de Convocação, do seguinte teor: “EDITAL DE CONVOCAÇÃO – ${nTipo.toUpperCase()}. ${editalCorpo(a, true)} ORDEM DO DIA: ${itemUnico(a) ? esc(comPonto(a.ordem[0].texto)) : a.ordem.map((o, i) => `${LETRAS[i]}) ${esc(comPonto(o.texto))}`).join(' ')} ${esc(e.regiao)}, em ${a.editalData ? dataExt2(a.editalData) : '____ de __________ de ____'}. ${N(ed.nome)}, ${ed.cargoExt} da Administração.”`;
  if (!itemUnico(a)) t += ' Finda a leitura, passa-se então a obedecer à Ordem do Dia constante do Edital';
  a.ordem.forEach((o, i) => { t += itemAta(a, o, i); });
  if (a.opc.conclusao) {
    t += ` Retomando a palavra, o irmão ${pr.subst ? pr.cargoExt : 'Presidente'} fez a leitura da conclusão, que está assim redigida: “${esc(c.textos.conclusao.replace(/\s*\n+\s*/g, ' '))}”`;
  }
  t += ` Como ninguém quisesse fazer uso da palavra e, esgotada a Ordem do Dia, os trabalhos da Assembleia são encerrados pelo irmão ${pr.subst ? pr.cargoExt : 'Presidente'}. Nada mais havendo a tratar é lavrada esta Ata por mim, ${N(sc.nome)}, ${sc.rot}, a qual, depois de lida e aprovada, vai devidamente assinada.`;
  return t;
}
function itemAta(a, o, i) {
  const e = DB.cad.ent, ex = a.exercicio;
  const ri = rotItem(a, i);
  // o primeiro item continua a frase "Finda a leitura, passa-se ... à Ordem do Dia"
  const pre = itemUnico(a) ? ` Passando-se ao item único da Ordem do Dia, ` : i === 0 ? ', ' : ` Passando-se ao ${ri} da Ordem do Dia, `;
  if (o.acao === 'relatorio') {
    const partes = partesRelatorio(a).map(([tt, x]) => `${U(esc(tt.toUpperCase()))}: ${x}`).join(' ');
    return `${i === 0 && !itemUnico(a) ? ', procedendo-se' : `${pre}procedendo-se`} à leitura do relatório do movimento espiritual e material da Obra de Deus, bem como do relatório financeiro e demais anexos referentes ao exercício findo em trinta e um de dezembro de ${ex ? extenso(ex) : '____'}, abrangendo este e os municípios de ${esc(e.municipios)}, do seguinte teor: “Relatório do Movimento Espiritual e Material da Obra de Deus, Demonstrações, Balanço e demais anexos referentes ao exercício de ${ex ? extenso(ex) : '____'}. Prezada irmandade: Ao apresentarmos o Relatório do exercício de ${ex ? extenso(ex) : '____'}, cumprimos, com satisfação, uma das nossas determinações estatutárias. ${partes}”`;
  }
  if (o.acao === 'parecer') {
    const F = a.cf, ps = limpos(F.parecer);
    const txt = textoParecer(a).replace(/\s*\n+\s*/g, ' ');
    return `${pre}o irmão ${conduz(a).subst ? conduz(a).cargoExt : 'Presidente'} convida o irmão ${N(F.leitor)}, membro do Conselho Fiscal, a proceder à leitura do Parecer, que está assim redigido: “PARECER DO CONSELHO FISCAL. Prezada Irmandade, ${esc(txt)} ${esc(e.regiao)}, ${dataExt2(a.data)}. O Conselho Fiscal: ${juntarE(ps.map(N))}.” Ao final, é submetido à apreciação o relatório financeiro apresentado e aprovado com a palavra “Amém”.`;
  }
  if (o.acao === 'conselho') {
    const F = a.cf, ms = F.membros.map((n, k) => ({ n: String(n || '').trim(), novo: !!F.novo[k] })).filter(x => x.n);
    const sup = String(F.suplente || '').trim(), supNovo = !!F.novo[3];
    const conf = ms.filter(x => !x.novo), novos = ms.filter(x => x.novo);
    let t = `${pre}procedendo-se à apresentação e posse dos membros do Conselho Fiscal para o exercício vigente, `;
    const parte = [];
    if (conf.length) parte.push(`sendo confirmados os mesmos irmãos que serviram no exercício findo e que são os seguintes: ${juntarE(conf.map(x => qualif(a, x.n)))}`);
    if (novos.length) parte.push(`sendo ${novos.length > 1 ? 'apresentados e empossados os irmãos' : 'apresentado e empossado o irmão'} ${juntarE(novos.map(x => qualif(a, x.n)))} ${novos.length > 1 ? 'para as vagas existentes' : 'para a vaga existente'}`);
    if (sup) parte.push(supNovo ? `e sendo apresentado e empossado como suplente o irmão ${qualif(a, sup)}` : `e como suplente o irmão ${qualif(a, sup)}`);
    t += parte.join('; ') + `. ${B(`O mandato do Conselho Fiscal vigorará do dia ${dataPorExtenso(F.inicio)} até o dia ${dataPorExtenso(F.fim)}`)}.`;
    if (F.auxiliares && a.comp.auxiliares.length && !temAcao(a, 'trienio') && !temAcao(a, 'posse')) t += ` Foram também apresentados os irmãos Auxiliares da Administração: ${juntarE(a.comp.auxiliares.map(N))}.`;
    return t;
  }
  if (o.acao === 'trienio') {
    const v = vigAdm(a), ano = anoDe(a.data);
    const ini = ano ? `${ano}-04-01` : v.ini, fim = ano ? `${ano + 3}-03-31` : v.fim;
    return `${pre}procedeu-se à apresentação e posse dos membros da Administração, nos termos do artigo trinta e um do Estatuto. ${B(`O mandato da Administração vigorará do dia ${dataPorExtenso(ini)} até o dia ${dataPorExtenso(fim)}`)}, ficando assim constituída: ${admConstituida(a)}.`;
  }
  if (o.acao === 'posse') {
    const P = o.posse || { itens: [] }, its = P.itens.filter(x => x.nome || x.cargo);
    const MOT = { 'renúncia': 'renúncia', 'falecimento': 'falecimento', 'mudança de cargo': 'mudança de cargo', 'outro motivo': 'outro motivo' };
    const causas = its.filter(x => String(x.anterior || '').trim()).map(x => `${MOT[x.motivo] || 'renúncia'} do irmão ${N(x.anterior)}, que ocupava o cargo de ${esc(cargoTexto(x.cargo))}`);
    const vagos = its.filter(x => !String(x.anterior || '').trim()).map(x => esc(cargoTexto(x.cargo)));
    let t = `${pre}o irmão Ancião comunica à irmandade que, `;
    if (causas.length) t += `em virtude de ${juntarE(causas)}${vagos.length ? `, e estando vago ${vagos.length > 1 ? 'os cargos' : 'o cargo'} de ${juntarE(vagos)}` : ''}, `;
    else if (vagos.length) t += `estando vago ${vagos.length > 1 ? 'os cargos' : 'o cargo'} de ${juntarE(vagos)}, `;
    t += `o Senhor confirmou, em reunião ministerial${P.reuniao ? ` realizada no dia ${dataPorExtenso(P.reuniao)}` : ''}, para preencher ${its.length > 1 ? 'esses cargos' : 'esse cargo'}, ${its.length > 1 ? its.map(x => `para o cargo de ${B(esc(cargoTexto(x.cargo) || '______'))}, o irmão ${qualif(a, x.nome)}`).join('; ') : `o irmão ${qualif(a, (its[0] || {}).nome)}`}`;
    const adm = its.some(x => { const k = chaveCargo(x.cargo); return !k || CARGO_EXT[k]; }), cf = its.some(x => /^cf/.test(chaveCargo(x.cargo) || ''));
    if (adm) {
      const fimAno = P.fimAno || a.comp.fim;
      t += `, ficando, doravante, assim constituída a Administração: ${admConstituida(a, its)}. ${B(`O mandato ${its.length > 1 ? 'dos irmãos empossados' : 'do irmão empossado'} vigorará até o dia ${fimAno ? dataPorExtenso(`${fimAno}-03-31`) : '____ de março de ____'}`)}, completando o triênio da Administração, nos termos do parágrafo único do artigo trinta e um do Estatuto`;
    }
    if (cf) {
      const p = partesData(a.data), fimCF = p ? `${p.m <= 3 ? p.y : p.y + 1}-03-31` : '';
      t += `${adm ? '; e' : ','} ficando, doravante, assim constituído o Conselho Fiscal: ${cfConstituido(a, its)}. ${B(`O mandato vigorará até o dia ${dataPorExtenso(fimCF)}`)}`;
    }
    return t + '.';
  }
  if (o.acao === 'sede') {
    return `${pre}foi comunicado aos presentes que a sede administrativa passa a localizar-se na ${esc(o.sede || '______')}, não importando, tal fato, em qualquer outra alteração, a não ser a de simples mudança de endereço, nos termos do parágrafo primeiro do artigo quarenta e três do Estatuto.`;
  }
  // assunto livre
  const d = String(o.delib || '').trim();
  return `${pre}que trata de: ${esc(fimFrase(o.texto))}. ${d ? esc(comPonto(d)) : '______.'}`;
}
function textoParecer(a) { return DB.cad.textos.parecer.replace(/\{exercicio\}/g, a.exercicio || '____').replace(/\{regiao\}/g, DB.cad.ent.regiao); }
function textoAtaPlano(a) {
  const d = document.createElement('div'); const ant = a.textoManual; a.textoManual = null;
  d.innerHTML = textoAtaHTML(a); a.textoManual = ant;
  return d.textContent.replace(/\s+/g, ' ').trim();
}

/* =====================================================================
   Documento para impressão
   ===================================================================== */
function fontesCSS() {
  const base = location.origin + '/assets/fonts/roboto-latin-';
  const face = (p, e) => `@font-face{font-family:'RobotoLista';font-style:${e};font-weight:${p};font-display:block;src:url('${base}${p}-${e}.woff2') format('woff2');}`;
  // Ata em Arial 12: usa o Arial do computador; sem ele, o Arimo (mesmas medidas do Arial),
  // para a quebra de linha sair igual em qualquer computador
  const ar = location.origin + '/assets/fonts/arimo-latin-';
  const loc = { '400normal': "local('Arial'),local('ArialMT')", '700normal': "local('Arial Bold'),local('Arial-BoldMT')", '400italic': "local('Arial Italic'),local('Arial-ItalicMT')", '700italic': "local('Arial Bold Italic'),local('Arial-BoldItalicMT')" };
  const faceA = (p, e) => `@font-face{font-family:'ArialAta';font-style:${e};font-weight:${p};font-display:block;src:${loc[p + e]},url('${ar}${p}-${e}.woff2') format('woff2');}`;
  return face(400, 'normal') + face(700, 'normal') + face(400, 'italic') + face(700, 'italic')
    + faceA(400, 'normal') + faceA(700, 'normal') + faceA(400, 'italic') + faceA(700, 'italic');
}
function cabHTML(estilo) {
  const e = DB.cad.ent;
  if (estilo === 'edital') return `<div class="cab cab-ed"><div class="c1">${esc(e.nome)}</div><div class="c2">CNPJ/MF Nº ${esc(e.cnpj)}</div><div class="c3">REGIÃO DE ${esc(e.regiao.toUpperCase())} - ${esc(e.uf.toUpperCase())}</div></div>`;
  return `<div class="cab"><div class="c1">${esc(e.nome)}</div><div class="c2">CNPJ: ${esc(e.cnpj)}</div><div class="c3">${esc(e.regiao)} - ${esc(e.uf)}</div></div>`;
}
// página com cabeçalho repetido em cada folha (o navegador repete o thead)
const pagina = (conteudo, cls) => `<table class="pg ${cls || ''}"><thead><tr><td>${cabHTML()}</td></tr></thead><tbody><tr><td>${conteudo}</td></tr></tbody></table>`;
const assin = (nome, cargo, extra) => `<div class="as"><div class="ln"></div><div class="an">${esc(nome || '')}</div><div class="ac">${cargo}</div>${extra || ''}</div>`;

function docEdital(a) {
  const e = DB.cad.ent, ed = assinaEdital(a);
  const lista = itemUnico(a)
    ? `<p class="od-u">${esc(comPonto(a.ordem[0].texto))}</p>`
    : `<ol class="od-l">${a.ordem.map((o, i) => `<li><span>${LETRAS[i]})</span><span>${esc(comPonto(o.texto))}</span></li>`).join('')}</ol>`;
  return `<section class="folha edital">${cabHTML('edital')}
    <h2 class="t-ed">EDITAL DE CONVOCAÇÃO</h2><h2 class="t-ed">${NOME_TIPO[a.tipo].toUpperCase()}</h2>
    <p class="ed-p">${editalCorpo(a)}</p>
    <p class="od-t"><u>ORDEM DO DIA</u>:</p>${lista}
    <p class="ed-data">${esc(e.regiao)}, em ${a.editalData ? dataExt2(a.editalData) : '____ de __________ de ____'}.</p>
    <div class="ed-as">${assin(ed.nome, `${ed.subst ? CARGO_ROT[a.editalCargo] + ' da Administração<br>(substituto legal do Presidente)' : 'Presidente da Administração'}`)}</div></section>`;
}
// Roteiro (anexo 7.6): a Assembleia é antes da Palavra, sem testemunhos, até 30 minutos
function docRoteiro(a) {
  const c = a.comp, F = a.cf, ex = a.exercicio || '____', nTipo = NOME_TIPO[a.tipo], e = DB.cad.ent;
  const pr = conduz(a), sc = lavra(a);
  const PRES = pr.subst ? `PRESIDENTE<br><small>(${esc(pr.cargoExt)})</small>` : 'PRESIDENTE';
  const SEC = sc.subst ? `SECRETÁRIO<br><small>(${esc(sc.cargoExt)})</small>` : 'SECRETÁRIO';
  const lin = (p, itens) => `<tr><th>${p}</th><td>${itens.map(x => `<p>${x}</p>`).join('')}</td></tr>`;
  const nomes = l => juntarE(limpos(l).map(n => B(esc(n))));
  const admLista = CARGOS_ESTATUTO.filter(([k]) => c.cargos[k]).map(([k]) => `${CARGO_EXT[k]}: ${B(esc(c.cargos[k]))}`).join('; ');
  let h = lin('ANCIÃO', [`Convida o irmão ${B(esc(pr.nome))}, ${pr.subst ? esc(pr.cargoExt) + ', substituto legal do Presidente' : 'Presidente da Administração'}, para iniciar os trabalhos da ${nTipo}; convida também os irmãos da Administração (titulares, vices e auxiliares)${temAcao(a, 'conselho') || temAcao(a, 'parecer') ? ' e do Conselho Fiscal' : ''} para subirem ao púlpito.`]);
  h += lin(PRES, ['Deus Seja Louvado.', `Declaramos aberta esta ${nTipo} da Administração de ${esc(e.regiao)} Em Nome do Senhor Jesus.`,
    `Convido o irmão Secretário para proceder à leitura do Edital de Convocação${temAcao(a, 'relatorio') ? ' e o relatório do movimento espiritual e material da Obra de Deus no último exercício' : ''}.`]);
  h += lin(SEC, ['Deus Seja Louvado.', '<i>Edital de Convocação (proceder à leitura do Edital).</i>'].concat(temAcao(a, 'relatorio') ? ['<i>Movimento espiritual.</i>', '<i>Movimento material.</i>', '<i>Balanço Patrimonial.</i>'] : [], ['Deus Seja Louvado. Amém.']));
  a.ordem.forEach((o, i) => {
    const item = itemUnico(a) ? 'o item único' : `o item “${LETRAS[i].toUpperCase()}”`;
    if (o.acao === 'parecer') {
      h += lin(PRES, [`Passando ${item === 'o item único' ? 'ao item único' : 'ao Item ' + LETRAS[i].toUpperCase()} do Edital, convido um dos membros do Conselho Fiscal para proceder à leitura do parecer. <i>(${nomes(F.parecer)}${F.leitor ? `; lê o parecer: ${B(esc(F.leitor))}` : ''})</i>`]);
      h += lin('CONSELHO<br>FISCAL', ['Deus Seja Louvado.', '<i>Parecer do Conselho Fiscal (proceder à leitura do parecer).</i>', 'Deus Seja Louvado.']);
      h += lin('ANCIÃO ou<br>PRESIDENTE', [`Em face da recomendação do Conselho Fiscal que se aprove as contas do exercício de ${ex}, solicitamos a aprovação da irmandade com a palavra ${B('AMÉM')}.`]);
    } else if (o.acao === 'trienio') {
      const ano = anoDe(a.data);
      h += lin('ANCIÃO', [`Passamos para ${item} do Edital, vamos proceder à apresentação e posse da Administração do Triênio ${ano || '____'} - ${ano ? ano + 3 : '____'}.`, `<i>Fazer a leitura dos cargos e nomes de cada membro da Administração (Titulares, Vices e Auxiliares):</i> ${admLista}${c.auxiliares.length ? `; Auxiliares: ${nomes(c.auxiliares)}` : ''}.`, `Fica bem claro que o mandato desta Administração vigorará do dia ${ano ? dataExt(`${ano}-04-01`) : '____'} até o dia ${ano ? dataExt(`${ano + 3}-03-31`) : '____'}.`]);
      h += lin('ANCIÃO ou<br>PRESIDENTE', [`Com base no nosso Artigo 30 do Estatuto, que prevê a apresentação dos membros da Administração indicados pelo Conselho Regional de Anciães sob a guia de Deus, solicitamos a aprovação da irmandade com a palavra ${B('AMÉM')}.`]);
    } else if (o.acao === 'posse') {
      const its = (o.posse ? o.posse.itens : []).filter(x => x.nome);
      h += lin('ANCIÃO', [`Passamos para ${item} do Edital: ${esc(comPonto(o.texto))}`, `Vamos proceder à apresentação e posse de ${its.length > 1 ? 'novos membros' : 'novo membro'}: ${its.map(x => `${esc(cargoTexto(x.cargo))}: ${B(esc(x.nome))}${x.anterior ? ` <i>(no lugar do irmão ${esc(x.anterior)} – ${esc(x.motivo || 'renúncia')})</i>` : ''}`).join('; ') || '______'}.`, `Fica bem claro que o mandato vigorará até o dia ${(o.posse && o.posse.fimAno) || c.fim ? dataExt(`${(o.posse && o.posse.fimAno) || c.fim}-03-31`) : '____'}.`]);
      h += lin('ANCIÃO ou<br>PRESIDENTE', [`Com base no nosso Artigo 30 do Estatuto, que prevê a apresentação dos membros da Administração indicados pelo Conselho Regional de Anciães sob a guia de Deus, solicitamos a aprovação da irmandade com a palavra ${B('AMÉM')}.`]);
    } else if (o.acao === 'conselho') {
      const ms = F.membros.map((n, k) => ({ n, novo: F.novo[k] })).filter(x => String(x.n || '').trim());
      h += lin('ANCIÃO', [`Passamos para ${item} do Edital, vamos proceder à recondução e posse do Conselho Fiscal${ms.some(x => x.novo) || F.novo[3] ? ' (e posse de novo membro)' : ''}: ${juntarE(ms.map(x => B(esc(x.n)) + (x.novo ? ' <i>(novo)</i>' : '')))}${F.suplente ? `; suplente: ${B(esc(F.suplente))}${F.novo[3] ? ' <i>(novo)</i>' : ''}` : ''}.`, `O mandato do Conselho Fiscal vigorará do dia ${dataExt(F.inicio)} até o dia ${dataExt(F.fim)}.`]);
      h += lin('ANCIÃO ou<br>PRESIDENTE', [`Com base no nosso Estatuto, que prevê a apresentação dos membros do Conselho Fiscal indicados pelo Conselho Regional de Anciães sob a guia de Deus, solicitamos a aprovação da irmandade com a palavra ${B('AMÉM')}.`]);
    } else if (o.acao === 'sede') {
      h += lin(PRES, [`Passamos para ${item} do Edital: comunicamos que a sede administrativa passa a localizar-se na ${esc(o.sede || '______')}, sem qualquer outra alteração a não ser a de simples mudança de endereço.`]);
    } else if (o.acao === 'livre') {
      h += lin(PRES, [`Passamos para ${item} do Edital: ${esc(comPonto(o.texto))}`, `<i>Se a irmandade aprova</i>, confirma com a palavra ${B('AMÉM')}.`]);
    }
  });
  const fim = [];
  if (a.opc.conclusao) fim.push('<i>Procede à leitura da conclusão.</i>');
  fim.push(`Nada mais havendo a tratar, declaramos encerrada esta ${nTipo}.`, `Deus Seja Louvado. ${B('AMÉM')}.`);
  h += lin(PRES, fim);
  // ordem de subida ao púlpito (slides "Processos AGO")
  const pos = (n, rot, nome) => `<td><b>${n}</b><span>${rot}</span>${nome ? `<small>${esc(nome)}</small>` : ''}</td>`;
  const pulp = `<table class="pulp"><tr>${pos(4, 'Conselho Fiscal', '')}${pos(3, 'Tesoureiro', c.cargos.tesoureiro)}<td class="anc"><span>Ancião</span><small>${esc(a.anciao || '')}</small></td>${pos(1, 'Presidente', pr.nome)}${pos(2, 'Secretário', sc.nome)}</tr><tr><td colspan="5" class="aux"><b>5</b><span>Auxiliares (e vices)</span></td></tr><tr class="lados"><td colspan="2">Lado das irmãs</td><td></td><td colspan="2">Lado dos irmãos</td></tr></table>`;
  return `<section class="folha roteiro"><div class="rt-cab"><div>${esc(e.nome)}</div><div>ROTEIRO PARA REALIZAÇÃO DE ${nTipo.toUpperCase()}</div></div>
    <p class="rt-ob"><b>CULTO</b> – Andamento normal. A Assembleia será realizada antes da exortação da Palavra, suprimidos os testemunhos, não devendo se estender além de trinta minutos. Sobe ao púlpito toda a Administração (titulares, vices, auxiliares e Conselho Fiscal); não devem subir os colaboradores ou quaisquer outros.</p>
    <table class="rt">${h}</table><p class="rt-pl"><b>Ordem de subida ao púlpito</b></p>${pulp}</section>`;
}
function tituloAta(a) {
  if (ehReuniao(a)) return tituloReuniao(a);
  return `ATA DA ${NOME_TIPO[a.tipo].toUpperCase()} REALIZADA EM ${a.data ? dataExt2(a.data).toUpperCase() : '____'}`;
}
function docAta(a) {
  const e = DB.cad.ent;
  const tit = tituloAta(a);
  // texto corrido, sem parágrafos; a última linha é completada com traços
  const INUT = '<span class="inut" aria-hidden="true"></span>';
  const pr = conduz(a), sc = lavra(a), ts = cargo(a, 'tesoureiro');
  const as = `<p class="ata-data">${esc(e.regiao)}, ${dataExt2(a.data)}.</p>
    <div class="assin-ata"><div class="aa1">${assin(a.anciao, 'Ancião')}</div>
    <div class="aa3">${assin(pr.nome, pr.subst ? pr.cargoExt : 'Presidente')}${assin(sc.nome, sc.subst ? sc.cargoExt : 'Secretário')}${assin(ts, 'Tesoureiro')}</div></div>`;
  return `<section class="folha">${pagina(`<h1 class="t-ata">${tit}</h1><div class="ata"><p>${textoAtaHTML(a)}${INUT}</p></div>${as}`)}</section>`;
}
function docCapa(a) {
  const e = DB.cad.ent;
  return `<section class="folha">${pagina(`<div class="capa"><div class="cp1">RELATÓRIO E BALANÇO<br>${a.exercicio || '____'}</div><div class="cp2">${NOME_TIPO[a.tipo].toUpperCase()}<br>REALIZADA EM ${a.data ? dataHif(a.data) : '__-__-____'}</div><div class="cp3">ADMINISTRAÇÃO REGIONAL<br>${esc(e.regiao.toUpperCase())} – ${esc(e.uf.toUpperCase())}</div>
    <div class="cp4">Sede Administrativa: ${esc(e.rua)}, ${esc(e.num)} – ${esc(e.bairro)}<br>CEP: ${esc(e.cep)} – ${esc(e.regiao)} – ${esc(e.ufSigla)}.<br>Fone: ${esc(e.fone)}</div></div>`)}</section>`;
}
// Relatório do movimento espiritual e material (anexo 7.8): documento à parte, com o mesmo conteúdo da ata
function docRelatorio(a) {
  const e = DB.cad.ent, ex = a.exercicio || '____', L = localAta(a);
  const tit = `RELATÓRIO DO MOVIMENTO ESPIRITUAL E MATERIAL DA OBRA DE DEUS, DEMONSTRAÇÕES, BALANÇO E DEMAIS ANEXOS REFERENTES AO EXERCÍCIO DE ${ex}, APRESENTADOS À ${NOME_TIPO[a.tipo].toUpperCase()} REALIZADA NO DIA ${a.data ? dataExt2(a.data).toUpperCase() : '____'}, NA CASA DE ORAÇÃO ${esc(L.casa.toUpperCase())} DE ${esc(L.cidade.toUpperCase())}.`;
  let h = `<p class="rl-tit">${tit}</p><p class="rl-pz"><b>Prezada irmandade</b></p><p class="rl-p">Ao apresentarmos o Relatório do exercício de ${ex}, cumprimos, com satisfação, uma das nossas determinações estatutárias.</p>`;
  partesRelatorio(a).forEach(([t, x]) => { h += `<h3 class="rl-h">${esc(t)}</h3><p class="rl-p">${x}</p>`; });
  return `<section class="folha">${pagina(`<div class="rel">${h}</div>`)}</section>`;
}
function linhasCont(a, gs) {
  return gs.map(g => `<tr class="g"><td colspan="2">${esc(g.t)}</td></tr>${g.i.map(x => `<tr class="i"><td>${esc(x.auto === 'resultado' ? rotResultado(a) : x.r)}</td><td>${fmtR(valorItem(a, x))}</td></tr>`).join('')}<tr class="t"><td>TOTAL ${esc(g.t)}</td><td>${fmtR(totalGrupo(a, g))}</td></tr>`).join('');
}
function assinContabil(a) {
  const P = n => pessoa(n) || {};
  const pr = cargo(a, 'presidente'), te = cargo(a, 'tesoureiro'), co = cargo(a, 'contador');
  const l = (nome, cpf, rot, crc) => `<div class="as as-c"><div class="ln"></div><div class="an">${esc(String(nome || '').toUpperCase())}</div>${crc ? `<div class="ac">CRC: ${esc(crc)}</div>` : ''}<div class="ac">CPF: ${esc(cpf || '______')}</div><div class="ac"><b>${rot}</b></div></div>`;
  return `<div class="assin-c">${l(pr, P(pr).cpf, 'PRESIDENTE')}${l(te, P(te).cpf, 'TESOUREIRO')}${co ? l(co, P(co).cpf, 'CONTADOR', a.comp.crc || DB.cad.adm.crc) : ''}</div>`;
}
function cabCont(a, titulo) {
  const e = DB.cad.ent;
  return `<div class="cc"><div class="cc1"><span>${esc(e.rua.toUpperCase())}, ${esc(e.num)}</span><span class="cc-n">${esc(e.nome)}<small>${esc(e.regiao.toUpperCase())} - ${esc(e.ufSigla)}</small></span><span>CNPJ ${esc(e.cnpj)} - IE ISENTO</span></div><div class="cc2">${titulo}</div></div>`;
}
function docDRE(a) {
  const C = a.cont.dre, r = resultado(a);
  return `<section class="folha cont">${cabCont(a, `DEMONSTRAÇÃO DO RESULTADO DO EXERCÍCIO EM 31/12/${a.exercicio || '____'}`)}
    <table class="ct"><tr class="s"><td>RECEITAS</td><td>Em R$</td></tr>${linhasCont(a, C.rec)}<tr class="tt"><td>TOTAL RECEITAS</td><td>${fmtR(totalSecao(a, C.rec))}</td></tr>
    <tr class="sp"><td colspan="2"></td></tr><tr class="s"><td>DESPESAS</td><td>Em R$</td></tr>${linhasCont(a, C.desp)}<tr class="tt"><td>TOTAL DESPESAS</td><td>${fmtR(totalSecao(a, C.desp))}</td></tr>
    <tr class="sp"><td colspan="2"></td></tr><tr class="tt rs"><td>${rotResultado(a)}</td><td>${fmtR(Math.abs(r))}</td></tr></table>${assinContabil(a)}</section>`;
}
function docBalanco(a) {
  const C = a.cont.bal;
  return `<section class="folha cont">${cabCont(a, `BALANÇO PATRIMONIAL EM 31/12/${a.exercicio || '____'}`)}
    <table class="ct"><tr class="s"><td>ATIVO</td><td>Em R$</td></tr>${linhasCont(a, C.ativo)}<tr class="tt"><td>TOTAL ATIVO</td><td>${fmtR(totalSecao(a, C.ativo))}</td></tr>
    <tr class="sp"><td colspan="2"></td></tr><tr class="s"><td>PASSIVO</td><td>Em R$</td></tr>${linhasCont(a, C.passivo)}<tr class="tt"><td>TOTAL PASSIVO</td><td>${fmtR(totalSecao(a, C.passivo))}</td></tr></table>${assinContabil(a)}</section>`;
}
function docParecer(a) {
  const e = DB.cad.ent;
  return `<section class="folha parecer"><div class="cab"><div class="c1">${esc(e.nome)}</div><div class="c1">PARECER DO CONSELHO FISCAL</div></div>
    <p class="pz">Prezada Irmandade,</p>${textoParecer(a).split(/\n\s*\n/).map(p => `<p class="pp">${esc(p.trim())}</p>`).join('')}
    <p class="pd">${esc(e.regiao)}, ${dataExt2(a.data)}.</p><p class="pcf">O CONSELHO FISCAL</p>
    <div class="assin-cf">${limpos(a.cf.parecer).map(n => assin(n, '')).join('')}</div></section>`;
}
function docComposicao(a) {
  const c = a.comp, e = DB.cad.ent;
  const tit = `COMPOSIÇÃO DA ADMINISTRAÇÃO – TRIÊNIO DE ${c.inicio ? dataBR(`${c.inicio}-04-01`) : '__/__/____'} A ${c.fim ? dataBR(`${c.fim}-03-31`) : '__/__/____'}`;
  const grupo = ks => `<table class="cp-t">${ks.map(k => `<tr><th>${CARGO_ROT[k]}:</th><td>${esc(c.cargos[k] || '')}</td></tr>`).join('')}</table>`;
  const cf = limpos(temAcao(a, 'conselho') ? a.cf.membros : DB.cad.cf.membros), sup = temAcao(a, 'conselho') ? a.cf.suplente : DB.cad.cf.suplente;
  let h = `<h2 class="cp-tit"><u>${tit}</u></h2><p class="cp-sub"><b>Relação de Titulares, vices, auxiliares e colaboradores da Administração ${esc(e.regiao)} ${c.inicio || '____'} - ${c.fim || '____'}</b></p>
    ${GRUPOS_CARGO.map(([, ks]) => grupo(ks)).join('')}`;
  if (c.auxiliares.length) h += `<h3 class="cp-h"><u>AUXILIARES DA ADMINISTRAÇÃO:</u></h3><ul class="dc">${c.auxiliares.map(n => `<li>${esc(n)}</li>`).join('')}</ul>`;
  if (cf.length) h += `<h3 class="cp-h"><u>CONSELHO FISCAL</u></h3><ul class="cf-l">${cf.map(n => `<li>${esc(n)}</li>`).join('')}</ul>${sup ? `<p class="cp-sup"><b>Suplente:</b> ${esc(sup)}</p>` : ''}`;
  let out = `<section class="folha">${pagina(`<div class="comp">${h}</div>`)}</section>`;
  if (c.setores.length) {
    let letra = -1, sub = 0;
    const s = c.setores.map(x => { let r; if (x.sub && letra >= 0) { sub++; r = `${LETRAS[letra]}.${sub})`; } else { letra++; sub = 0; r = `${LETRAS[letra]})`; } return `<div class="st"><p class="st-h"><b>${r} ${esc(x.nome)}:</b></p><ul>${x.nomes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>`; }).join('');
    out += `<section class="folha">${pagina(`<h2 class="cp-tit">IRMÃOS QUE COLABORAM NOS DIVERSOS SETORES DA ADMINISTRAÇÃO</h2><div class="setores">${s}</div>`)}</section>`;
  }
  return out;
}
function docConclusao(a) {
  const e = DB.cad.ent, c = a.comp;
  const conc = `<section class="folha">${pagina(`<h2 class="cp-tit">CONCLUSÃO</h2><div class="conc">${DB.cad.textos.conclusao.split(/\n\s*\n/).map(p => `<p>${esc(p.trim())}</p>`).join('')}</div>`)}</section>`;
  const ass = `<section class="folha">${pagina(`<p class="as-d">${esc(e.regiao)}, ${dataExt2(a.data)}.</p>
    <table class="as-t"><tr><th>Anciães:</th><td>${c.anciaes.map(n => `<div class="as-l"><span>${esc(n)}</span><i></i></div>`).join('')}</td></tr></table>
    <p class="as-adm"><b>Administração:</b></p><table class="as-t as-t2">${['presidente', 'secretario', 'tesoureiro'].map(k => `<tr><th>${CARGO_ROT[k]}:</th><td><div class="as-l"><span>${esc(c.cargos[k] || '')}</span><i></i></div></td></tr>`).join('')}</table>`)}</section>`;
  return conc + ass;
}
function docPresenca(a) {
  const n = Math.max(0, Math.min(40, +a.opc.presenca || 0)); if (!n) return '';
  const e = DB.cad.ent, L = localAta(a), linhas = n * 26 - 4;
  const end = a.endereco ? esc(a.endereco) : `${esc(e.rua)}, n.º ${esc(e.num)}`;
  return `<section class="folha presenca"><h2 class="pr-t">TERMO DE ABERTURA</h2>
    <p class="pr-p">Assinaturas de irmãos presentes à ${NOME_TIPO[a.tipo]}, realizada na casa de oração ${esc(L.casa)}, situada à ${end}, dia ${a.data ? dataExt2(a.data) : '____'}.</p>
    <h2 class="pr-t2">LISTA DE ASSINATURAS</h2>
    <table class="pr"><thead><tr><th>NOME</th><th>R.G.</th><th>ASSINATURA</th></tr></thead><tbody>${'<tr><td></td><td></td><td></td></tr>'.repeat(linhas)}</tbody></table></section>
    <section class="folha presenca"><h2 class="pr-t">TERMO DE ENCERRAMENTO</h2>
    <p class="pr-p pr-c">Assinaram e compareceram a esta ${NOME_TIPO[a.tipo]} ${a.presentes != null ? numExt(a.presentes) : '(__________)'} irmãos.</p>
    <p class="pr-d">${esc(e.regiao)}, ${a.data ? dataExt2(a.data) : '____ de __________ de ____'}.</p>
    <div class="pr-as">${assin(cargo(a, 'presidente'), 'Presidente')}${assin(cargo(a, 'secretario'), 'Secretário')}</div></section>`;
}
// Termo de posse (slides "Processos AGO"): vale do dia 1º de abril a 31 de março, não da data da AGO
function docTermoPosse(a) {
  const grupos = [];
  const p = partesData(a.data);
  if (temAcao(a, 'trienio') && p) grupos.push({ t: 'Administração – triênio', ini: `${p.y}-04-01`, fim: `${p.y + 3}-03-31`, l: CARGOS_ESTATUTO.filter(([k]) => a.comp.cargos[k]).map(([k]) => [CARGO_EXT[k], a.comp.cargos[k]]).concat(a.comp.auxiliares.map(n => ['Auxiliar da Administração', n])) });
  a.ordem.filter(o => o.acao === 'posse' && o.posse).forEach(o => {
    const its = o.posse.itens.filter(x => x.nome);
    const fa = o.posse.fimAno || a.comp.fim;
    if (its.length) grupos.push({ t: 'Preenchimento de cargo vago', ini: a.data, fim: fa ? `${fa}-03-31` : '', l: its.map(x => [cargoTexto(x.cargo), x.nome]) });
  });
  if (temAcao(a, 'conselho')) grupos.push({ t: 'Conselho Fiscal', ini: a.cf.inicio, fim: a.cf.fim, l: limpos(a.cf.membros).map(n => ['Membro do Conselho Fiscal', n]).concat(a.cf.suplente ? [['Suplente do Conselho Fiscal', a.cf.suplente]] : []) });
  if (!grupos.length) return '';
  const e = DB.cad.ent;
  const h = grupos.map(g => `<p class="tp-p">Na ${NOME_TIPO[a.tipo]} realizada em ${dataPorExtenso(a.data)}, foram apresentados e empossados os irmãos abaixo, para o mandato que vigorará do dia ${dataPorExtenso(g.ini)} até o dia ${dataPorExtenso(g.fim)}, os quais assinam o presente termo (${esc(g.t)}):</p>
    <table class="tp"><thead><tr><th>CARGO</th><th>NOME</th><th>ASSINATURA</th></tr></thead><tbody>${g.l.map(([c, n]) => `<tr><td>${esc(c)}</td><td><b>${esc(n)}</b></td><td></td></tr>`).join('')}</tbody></table>`).join('');
  return `<section class="folha">${pagina(`<h2 class="cp-tit">TERMO DE POSSE</h2>${h}<p class="tp-d">${esc(e.regiao)}, ${dataExt2(a.data)}.</p>`)}</section>`;
}
function documentoHTML(a) {
  a = a || ATA(); if (!a) return '<p>Nenhuma ata aberta.</p>';
  if (ehReuniao(a)) return documentoReuniaoHTML(a);
  let corpo = docEdital(a);
  if (a.opc.roteiro) corpo += docRoteiro(a);
  corpo += docAta(a);
  if (temAcao(a, 'relatorio')) corpo += docCapa(a) + docRelatorio(a) + docDRE(a) + docBalanco(a);
  if (temAcao(a, 'parecer')) corpo += docParecer(a);
  if (a.opc.composicao) corpo += docComposicao(a);
  if (a.opc.conclusao) corpo += docConclusao(a);
  if (a.opc.termoPosse) corpo += docTermoPosse(a);
  corpo += docPresenca(a);
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${a.tipo} ${a.data ? dataHif(a.data) : ''} - ${esc(DB.cad.ent.regiao)}</title><style>
${fontesCSS()}
@page{size:A4 portrait;margin:16mm 18mm 16mm 24mm}
@page cont{size:A4 portrait;margin:11mm 14mm 10mm 18mm}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:'RobotoLista',Arial,sans-serif;color:#111;font-size:11pt;line-height:1.38;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.folha{break-before:page;page-break-before:always}
.folha:first-child{break-before:auto;page-break-before:auto}
p{margin:0}
table.pg{width:100%;border-collapse:collapse}
table.pg > thead > tr > td,table.pg > tbody > tr > td{padding:0;vertical-align:top}
.cab{text-align:center;margin-bottom:5mm;line-height:1.25}
.cab .c1{font-weight:700;font-size:11.5pt;font-style:italic}
.cab .c2,.cab .c3{font-weight:700;font-size:10.5pt;font-style:italic}
.cab-ed .c1{font-style:normal;font-size:14pt;color:#333;letter-spacing:.02em}
.cab-ed .c2{font-style:normal;font-weight:400;font-size:13pt;color:#333}
.cab-ed .c3{font-style:normal;font-weight:400;font-size:11.5pt;color:#333;margin-top:4mm}
.edital{padding-top:8mm}
.t-ed{text-align:center;font-size:12pt;margin:10mm 0 0;color:#333}
.t-ed + .t-ed{margin-top:8mm}
.ed-p{margin-top:14mm;font-size:12pt;line-height:1.5;text-align:justify;color:#333}
.od-t{text-align:center;margin:12mm 0 8mm;font-size:12pt;color:#333}
.od-l{list-style:none;margin:0;padding:0 0 0 6mm;font-size:12pt;color:#333}
.od-l li{display:flex;gap:2mm;margin-bottom:6mm;line-height:1.4}
.od-l li span:first-child{flex:none}
.od-u{font-size:12pt;color:#333;text-align:justify;line-height:1.4;padding:0 6mm}
.ed-data{text-align:right;margin:22mm 0 0;font-size:12pt;color:#333}
.ed-as{width:80mm;margin:24mm 0 0 18mm}
.as{text-align:center;break-inside:avoid}
.as .ln{border-top:.8pt solid #222;margin:0 4mm 1.2mm;height:0}
.as .an{font-size:10.5pt}
.as .ac{font-size:10pt}
.rt-cab{text-align:center;font-family:'Times New Roman',serif;font-weight:700;border:.8pt solid #333;padding:1.2mm;margin-bottom:5mm;font-size:11pt;line-height:1.45}
.rt{width:100%;border-collapse:collapse;font-family:'Times New Roman',serif;font-size:10.5pt;line-height:1.22}
.rt th{width:24mm;border:.8pt solid #333;text-align:center;vertical-align:middle;padding:1.5mm;font-size:10.5pt}
.rt td{border:.8pt solid #333;padding:.6mm 2mm .6mm 1mm;vertical-align:top}
.rt td p{margin:.4mm 0;text-align:justify}
.rt th small{font-weight:400;font-size:8.5pt}
.rt-ob{font-family:'Times New Roman',serif;font-size:10pt;text-align:justify;margin:0 0 3mm;line-height:1.3}
.rt-pl{font-family:'Times New Roman',serif;font-size:10.5pt;margin:5mm 0 2mm;text-align:center}
.pulp{width:100%;border-collapse:separate;border-spacing:2mm;font-family:'Times New Roman',serif;font-size:9pt;text-align:center;break-inside:avoid}
.pulp td{border:.8pt solid #333;padding:1.5mm 1mm;vertical-align:top}
.pulp td b{display:block;font-size:12pt}
.pulp td span{display:block;font-weight:700}
.pulp td small{display:block;font-size:8pt}
.pulp td.anc{background:#eee}
.pulp tr.lados td{border:none;font-style:italic;padding:0}
.tp-p{text-align:justify;margin:0 0 3mm;line-height:1.4}
table.tp{width:100%;border-collapse:collapse;margin-bottom:8mm;font-size:10.5pt}
table.tp th{border:.8pt solid #222;padding:1.2mm;background:#f1f1f1;font-size:9.5pt}
table.tp td{border:.8pt solid #222;padding:1.5mm 2mm;height:11mm}
table.tp th:nth-child(1){width:30%}
table.tp th:nth-child(2){width:36%}
table.tp tr{break-inside:avoid}
.tp-d{text-align:right;margin-top:6mm}
.t-ata{text-align:center;font-family:'ArialAta',Arial,sans-serif;font-size:12pt;font-weight:700;margin:0 0 5mm}
.ata{font-family:'ArialAta',Arial,sans-serif;font-size:12pt;line-height:1.15}
.ata p{text-align:justify;overflow:hidden;margin:0}
.ata .inut{display:inline-block;width:0;white-space:nowrap;vertical-align:baseline}
.ata .inut::after{content:"\\00a0${'-'.repeat(320)}";letter-spacing:.4pt}
.assin-ata .as .an,.assin-ata .as .ac{font-family:'ArialAta',Arial,sans-serif;font-size:12pt}
.ata-data{font-family:'ArialAta',Arial,sans-serif;font-size:12pt;text-align:right;margin:6mm 0 0;break-after:avoid}
.assin-ata{margin-top:16mm;break-inside:avoid}
.assin-ata .aa1{width:76mm;margin:0 auto 16mm}
.assin-ata .aa3{display:grid;grid-template-columns:repeat(3,1fr);gap:8mm}
.capa{border:1pt solid #222;min-height:225mm;display:flex;flex-direction:column;align-items:center;text-align:center;padding:14mm 10mm 8mm;font-style:italic}
.cp1{font-weight:700;font-size:16pt;margin-top:6mm}
.cp2{font-size:16pt;margin-top:58mm}
.cp3{font-size:16pt;margin-top:46mm}
.cp4{margin-top:auto;font-size:9pt;align-self:flex-end;text-align:right}
.rel{font-size:11pt;line-height:1.45}
.rl-tit{text-align:justify;font-weight:700;margin-bottom:5mm;line-height:1.35}
.rl-pz{margin:0 0 2mm 14mm}
.rl-p{text-indent:12mm;text-align:justify;margin-bottom:2mm}
.rl-p0{margin:2mm 0}
.rl-h{font-size:11pt;margin:5mm 0 1.5mm;text-decoration:underline;text-underline-offset:1.5pt}
.rl-cat{margin:3mm 0 1mm}
.rl-l{margin:0;padding-left:0;list-style:none}
.rl-l li{padding-left:4mm;text-indent:-4mm}
.rl-l li::before{content:"- "}
.cont{font-family:'RobotoLista',Arial,sans-serif;page:cont}
.cc{border-bottom:2pt solid #111;margin-bottom:4mm}
.cc1{display:flex;justify-content:space-between;align-items:flex-end;font-size:7.5pt;font-weight:700;border-bottom:.8pt solid #111;padding-bottom:1.5mm}
.cc1 span{flex:1}
.cc1 .cc-n{flex:1.5;white-space:nowrap}
.cc1 span:last-child{text-align:right}
.cc-n{text-align:center;font-size:11pt}
.cc-n small{display:block;font-size:7.5pt}
.cc2{text-align:center;font-weight:700;font-size:14pt;padding:2.5mm 0;letter-spacing:.02em}
.ct{width:100%;border-collapse:collapse;font-size:8.8pt;line-height:1.2}
.ct td{padding:.75mm 0 .35mm;border-bottom:.6pt dotted #555}
.ct td:last-child{text-align:right;white-space:nowrap;width:38mm;font-variant-numeric:tabular-nums}
.ct tr.s td{font-weight:700;border-bottom:none;padding-top:2mm}
.ct tr.s td:last-child{font-size:8.5pt}
.ct tr.g td{font-weight:700;border-bottom:none;text-align:left}
.ct tr.t td,.ct tr.tt td{font-weight:700}
.ct tr.sp td{border:none;height:2.5mm}
.ct tr.rs td{font-size:10.5pt}
.assin-c{display:grid;grid-template-columns:repeat(3,1fr);gap:8mm;margin-top:13mm;font-size:8.5pt;break-inside:avoid}
.as-c .an{font-weight:700;font-size:8.5pt}
.as-c .ac{font-size:8.5pt}
.parecer .cab .c1{font-style:normal;font-size:11pt}
.parecer{font-size:10.5pt;line-height:1.5}
.pz{margin:12mm 0 6mm}
.pp{text-align:justify;margin-bottom:5mm}
.pd{text-align:right;margin:10mm 0 14mm}
.pcf{margin-bottom:16mm}
.assin-cf{width:95mm;margin:0 auto;display:flex;flex-direction:column;gap:16mm}
.comp{font-size:11pt}
.cp-tit{text-align:center;font-size:11.5pt;margin:0 0 5mm;line-height:1.35}
.cp-sub{text-align:center;margin-bottom:6mm}
.cp-t{border-collapse:collapse;margin:0 0 4mm 2mm}
.cp-t th{text-align:left;width:46mm;padding:.4mm 0;font-weight:700}
.cp-t td{padding:.4mm 0}
.cp-h{text-align:center;font-size:11pt;margin:6mm 0 3mm}
.dc{columns:2;column-gap:8mm;margin:0;padding-left:6mm}
.dc li{break-inside:avoid;margin-bottom:.4mm}
.cf-l{margin:0 0 2mm;padding-left:6mm}
.cp-sup{margin-left:2mm}
.setores{columns:2;column-gap:10mm;font-size:10.5pt}
.st{break-inside:avoid;margin-bottom:4mm}
.st-h{margin-bottom:1mm}
.st ul{margin:0;padding:0;list-style:none}
.st li::before{content:"- "}
.conc p{text-indent:24mm;text-align:justify;margin-bottom:6mm;line-height:1.55}
.as-d{text-align:right;margin:6mm 0 12mm}
.as-t{border-collapse:collapse;width:100%}
.as-t th{text-align:left;vertical-align:top;width:30mm;font-weight:700;padding-top:1mm}
.as-l{display:flex;align-items:flex-end;gap:4mm;height:9.5mm}
.as-l span{flex:none;width:72mm}
.as-l i{flex:1;border-bottom:.6pt solid #444;height:0;margin-bottom:1mm}
.as-adm{margin:10mm 0 2mm}
.as-t2 th{padding-left:14mm;width:44mm}
.presenca{font-size:10.5pt}
.pr-t{text-align:center;font-size:11pt;margin:0 0 4mm}
.pr-p{text-align:justify;margin-bottom:4mm}
.pr-t2{text-align:center;font-size:10.5pt;margin:0 0 3mm}
table.pr{width:100%;border-collapse:collapse}
table.pr th{border:.8pt solid #222;font-size:9.5pt;padding:1.2mm;background:#f1f1f1}
table.pr td{border:.8pt solid #222;height:8.4mm}
table.pr th:nth-child(1){width:46%}
table.pr th:nth-child(2){width:22%}
table.pr tr{break-inside:avoid}
.pr-c{text-align:center;margin-top:10mm}
.pr-d{text-align:right;margin:16mm 0 26mm}
.pr-as{display:grid;grid-template-columns:1fr 1fr;gap:16mm}
u{text-underline-offset:1.5pt}
</style></head><body>${corpo}</body></html>`;
}
function esperarFontes(doc, ms) {
  const f = doc && doc.fonts; if (!f || !f.load) return Promise.resolve();
  const t = Promise.all(['400 12px RobotoLista', '700 12px RobotoLista', 'italic 400 12px RobotoLista', 'italic 700 12px RobotoLista', '400 12px ArialAta', '700 12px ArialAta', 'italic 400 12px ArialAta', 'italic 700 12px ArialAta'].map(x => f.load(x).catch(() => {}))).then(() => f.ready);
  return Promise.race([t, new Promise(r => setTimeout(r, ms || 4000))]);
}
function abrirDoc(imprimir) {
  const a = ATA();
  if (!a) { UI.toast('Abra ou crie uma ata primeiro.', 'info'); return; }
  const erros = conferir(a).filter(c => c.nivel === 'er');
  const seguir = () => {
    const w = window.open('', imprimir ? '_blank' : 'previaAta');
    if (!w) { UI.toast('O navegador bloqueou a janela nova. Permita pop-ups para este site.', 'error'); return; }
    w.document.open(); w.document.write(imprimir ? documentoHTML(a) : comBarraPrevia(documentoHTML(a), a)); w.document.close();
    if (imprimir) esperarFontes(w.document, 5000).then(() => setTimeout(() => { w.focus(); w.print(); }, 150));
    else w.focus();
  };
  if (imprimir && erros.length) {
    UI.confirm('Gerar o PDF mesmo assim?', 'A conferência encontrou: ' + erros.map(e => e.txt).join('; ') + '.', { ok: 'Gerar assim mesmo' }).then(ok => { if (ok) seguir(); });
    return;
  }
  seguir();
}
function abrirPrevia() { abrirDoc(false); }
// pré-visualização no mesmo padrão do calendário: barra com Atualizar e Imprimir, folhas sobre fundo cinza
function comBarraPrevia(html, a) {
  const p2 = n => String(n).padStart(2, '0'), d = new Date();
  const css = `<style>
@media screen{
  html,body{background:#525659}
  body{padding:0 0 28px}
  .folha{width:210mm;min-height:297mm;margin:0 auto 18px;background:#fff;box-shadow:0 8px 28px rgba(0,0,0,.35);padding:16mm 18mm 16mm 24mm;zoom:var(--z,1);position:relative}
  .folha.cont{padding:11mm 14mm 10mm 18mm}
  .folha.rl{padding:10mm 16mm 18mm 20mm}
  .rod-r{display:none}
  .rod-tela{display:block!important;position:absolute;left:0;right:0;bottom:7mm}
  .pv-bar{position:sticky;top:0;z-index:5;display:flex;align-items:center;flex-wrap:wrap;gap:8px 10px;padding:10px 16px;margin-bottom:18px;background:linear-gradient(180deg,#2c3f5c,#1b2a41);color:#fdfbf6;font:600 14px Inter,Arial,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25)}
  .pv-bar b{flex:1 1 auto;font-family:Fraunces,Georgia,serif;font-size:17px;min-width:0}
  .pv-bar small{opacity:.75;font-weight:500;font-size:12.5px}
  .pv-bar button{cursor:pointer;font:600 14px Inter,Arial,sans-serif;padding:8px 14px;border-radius:9px;border:1.5px solid rgba(255,255,255,.35);background:transparent;color:#fdfbf6}
  .pv-bar button.pri{background:#fdfbf6;color:#1b2a41;border-color:#fdfbf6}
  @media (max-width:560px){.pv-bar{padding:8px 10px;gap:8px}.pv-bar small{display:none}.pv-bar b{font-size:15px;flex-basis:100%}.pv-bar button{flex:1;padding:8px 10px}}
}
@media print{.pv-bar{display:none!important}}
</style><link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@600&family=Inter:wght@500;600&display=swap" rel="stylesheet">`;
  const bar = `<div class="pv-bar"><b>Pré-visualização · ${esc(a.tipo)} ${a.data ? dataBR(a.data) : ''}</b><small>Montada às ${p2(d.getHours())}:${p2(d.getMinutes())} · a quebra exata das páginas aparece no PDF</small>
<button type="button" onclick="if(window.opener&&!window.opener.closed){window.opener.abrirPrevia()}else{alert('Abra a página de Atas para atualizar.')}">Atualizar</button>
<button type="button" class="pri" onclick="window.print()">Imprimir / PDF</button></div>`;
  const z = `<script>function z(){document.documentElement.style.setProperty('--z',Math.min(1,(innerWidth-20)/794))}z();addEventListener('resize',z)<\/script>`;
  return html.replace('</style></head><body>', '</style>' + css + '</head><body>' + bar).replace(/<\/body><\/html>\s*$/, z + '</body></html>');
}
function gerarPDF() { abrirDoc(true); }
window.__documentoHTML = documentoHTML;

/* ---------- atalhos: Ctrl+S salva na nuvem, Ctrl+P gera o PDF (como nas listas) ---------- */
document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || document.querySelector('.ui-modal')) return;
  const k = e.key.toLowerCase();
  if (k === 's') { e.preventDefault(); salvarNuvem(); }
  else if (k === 'p') { e.preventDefault(); gerarPDF(); }
});

/* ---------- início ---------- */
DB = ler();
ATUALIZADO_AO_ABRIR = DB.atualizado || 0;
PENDENTE = (() => { try { return localStorage.getItem(KEY + '_pend') === '1'; } catch (e) { return false; } })();
SEL = (() => { try { const s = localStorage.getItem('ccb_atas_sel'); return DB.atas.some(a => a.id === s) ? s : maisRecente(); } catch (e) { return maisRecente(); } })();
window.__aoEntrar = function () {
  if (window.__atasIniciado) return; window.__atasIniciado = true;
  let ab = 'atas'; try { ab = localStorage.getItem('ccb_atas_aba') === 'cad' ? 'cad' : 'atas'; } catch (e) {}
  const est = document.getElementById('estado');
  if (est) { est.addEventListener('click', cliqueEstado); est.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cliqueEstado(); } }); }
  mudarAba(ab); mostrarEstado(); carregarNuvem(false).then(() => sincronizarAnciaes(false));
};
if (window.__SESSAO) window.__aoEntrar(window.__SESSAO);
