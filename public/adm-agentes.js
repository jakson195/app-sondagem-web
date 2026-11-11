// P\u00e1gina /adm/agentes da DataGeo Digital (ADM mestre). Tudo passa por /api/adm/agentes?acao=agentes_* com a sess\u00e3o
// do administrador da plataforma (SUPER_ADMIN, conferido no servidor). Dados na \u00e1rea "dgeo", separada das outras marcas.
(function () {
  'use strict';
  const CSS = `
  :root{--ag-paper:#f8fafc;--ag-paper-dim:#e2e8f0;--ag-ink:#0f172a;--ag-ink-soft:#475569;--ag-seal:#0f766e;--ag-seal-dark:#115e59;--ag-line:#cbd5e1;--ag-green:#15803d;--ag-blue:#1d4ed8;--ag-amber:#b45309;--ag-radius:8px;--ag-card:#ffffff}
  .ag-escopo{font-size:14px;line-height:1.5;color:var(--ag-ink)}
  .ag-escopo *{box-sizing:border-box}
  .ag-escopo button{cursor:pointer;font-family:inherit}
  .ag-escopo input,.ag-escopo select,.ag-escopo textarea{font:inherit;font-size:14px;padding:8px 10px;border:1px solid var(--ag-line);border-radius:var(--ag-radius);background:#fff;width:100%;color:var(--ag-ink)}
  .ag-escopo label{display:block;font-size:12px;color:var(--ag-ink-soft);margin-bottom:4px;font-family:ui-monospace,Consolas,monospace}
  .ag-escopo .btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px 14px;border-radius:var(--ag-radius);font-size:13.5px;font-weight:600;border:1px solid transparent;line-height:1.2}
  .ag-escopo .btn-seal{background:var(--ag-seal);color:#fff} .ag-escopo .btn-seal:hover{background:var(--ag-seal-dark)}
  .ag-escopo .btn-outline{background:#fff;border-color:var(--ag-line);color:var(--ag-ink)} .ag-escopo .btn-outline:hover{border-color:var(--ag-ink-soft)}
  .ag-escopo .btn-ghost{background:transparent;color:var(--ag-ink-soft)} .ag-escopo .btn-ghost:hover{background:var(--ag-paper-dim)}
  .ag-escopo .btn-danger{background:#fff;border-color:#b91c1c;color:#991b1b}
  .ag-escopo .btn-sm{padding:6px 11px;font-size:13px} .ag-escopo .btn:disabled{opacity:.45;cursor:not-allowed}
  .ag-escopo .cartoes{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:18px}
  .ag-escopo .kpi{background:var(--ag-card);border:1px solid var(--ag-line);border-radius:var(--ag-radius);padding:12px 14px}
  .ag-escopo .kpi .r{font-family:ui-monospace,Consolas,monospace;font-size:11px;color:var(--ag-ink-soft);text-transform:uppercase;letter-spacing:.03em}
  .ag-escopo .kpi .v{font-size:26px;font-weight:600;color:var(--ag-seal);line-height:1.2} .ag-escopo .kpi .s{font-size:12px;color:var(--ag-ink-soft)}
  .ag-escopo .barra{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:12px} .ag-escopo .barra .busca{flex:1 1 220px} .ag-escopo .barra select{width:auto}
  .ag-escopo .contagem{font-size:13px;color:var(--ag-ink-soft);margin:0 0 8px}
  .ag-escopo table{width:100%;border-collapse:collapse;background:var(--ag-card);border:1px solid var(--ag-line)}
  .ag-escopo th{text-align:left;font-family:ui-monospace,Consolas,monospace;font-size:11px;font-weight:500;color:var(--ag-ink-soft);text-transform:uppercase;padding:8px 10px;border-bottom:1px solid var(--ag-line);background:var(--ag-paper-dim)}
  .ag-escopo td{padding:9px 10px;border-bottom:1px solid #e2e8f0;vertical-align:middle;font-size:13.5px}
  .ag-escopo tbody tr{cursor:pointer} .ag-escopo tbody tr:hover td{background:#f1f5f9}
  .ag-escopo .quem .n{font-weight:600} .ag-escopo .quem .e{font-size:12px;color:var(--ag-ink-soft);word-break:break-all}
  .ag-escopo .etiqueta{display:inline-block;font-size:11px;padding:1px 7px;border-radius:10px;border:1px solid var(--ag-line);color:var(--ag-ink-soft);margin-left:6px}
  .ag-escopo .vazio{padding:24px;text-align:center;color:var(--ag-ink-soft);background:var(--ag-card);border:1px solid var(--ag-line);border-radius:var(--ag-radius)}
  .ag-escopo .mais{display:flex;justify-content:center;margin:14px 0}
  .ag-escopo .g-topo{position:sticky;top:0;background:var(--ag-paper);border-bottom:1px solid var(--ag-line);padding:14px 18px;display:flex;gap:10px;align-items:flex-start;justify-content:space-between;z-index:1}
  .ag-escopo .g-topo h2{font-size:19px;font-weight:600} .ag-escopo .g-topo .e{font-size:13px;color:var(--ag-ink-soft)}
  .ag-escopo .g-corpo{padding:14px 18px 40px;display:flex;flex-direction:column;gap:14px}
  .ag-escopo .bloco{background:var(--ag-card);border:1px solid var(--ag-line);border-radius:var(--ag-radius);padding:14px} .ag-escopo .bloco h3{font-size:15px;font-weight:600;margin-bottom:10px}
  .ag-escopo .fatos{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;font-size:13.5px} .ag-escopo .fatos dt{color:var(--ag-ink-soft);font-family:ui-monospace,Consolas,monospace;font-size:12px}
  .ag-escopo .linha{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end} .ag-escopo .linha .medio{flex:1 1 160px}
  .ag-escopo .atalhos{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px} .ag-escopo .acoes{display:flex;gap:8px;flex-wrap:wrap}
  .ag-escopo .nota{font-size:12.5px;color:var(--ag-ink-soft);margin-top:6px} .ag-escopo .sep{border:none;border-top:1px solid var(--ag-line);margin:12px 0}
  .ag-escopo .lista-simples{list-style:none;padding:0;font-size:13px;display:flex;flex-direction:column;gap:6px;max-height:260px;overflow-y:auto}
  .ag-escopo .lista-simples li{border-bottom:1px solid #e2e8f0;padding-bottom:6px;word-break:break-word} .ag-escopo .lista-simples .q{color:var(--ag-ink-soft);font-size:12px}
  .ag-escopo a{color:var(--ag-seal)}
  #ag-aviso{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);background:#0f172a;color:#fff;padding:10px 18px;border-radius:8px;font-size:14px;z-index:60;max-width:92vw;display:none} #ag-aviso.erro{background:#991b1b} #ag-aviso.on{display:block}

  .ag-escopo .ag-intro{font-size:13.5px;color:var(--ag-ink-soft);margin:0 0 14px;max-width:900px}
  .ag-escopo .ag-grade{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px;margin-bottom:18px}
  .ag-escopo .ag-card{background:var(--ag-card);border:1px solid var(--ag-line);border-radius:var(--ag-radius);padding:14px;display:flex;flex-direction:column;gap:6px}
  .ag-escopo .ag-card h4{font-size:15px;display:flex;justify-content:space-between;align-items:center;gap:8px}
  .ag-escopo .ag-card p{font-size:12.5px;color:var(--ag-ink-soft);overflow-wrap:anywhere}
  .ag-escopo .ag-card .st{font-family:'IBM Plex Mono',ui-monospace,Consolas,monospace;font-size:11.5px}
  .ag-escopo .ag-on{color:var(--ag-green)} .ag-off{color:var(--ag-seal-dark)}
  .ag-escopo .ag-sw{position:relative;width:40px;height:22px;flex:0 0 40px;border-radius:11px;border:1px solid var(--ag-line);background:var(--ag-paper-dim);padding:0}
  .ag-escopo .ag-sw::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:left .15s}
  .ag-escopo .ag-sw[aria-checked=true]{background:var(--ag-green);border-color:var(--ag-green)} .ag-sw[aria-checked=true]::after{left:20px}
  .ag-escopo .ag-sw:disabled{opacity:.5;cursor:not-allowed}
  .ag-escopo .ag-h3{font-size:16px;margin:22px 0 10px}
  .ag-escopo .ag-tab-sm td,.ag-tab-sm th{font-size:13px;padding:7px 10px} .ag-tab-sm tbody tr{cursor:default}
  .ag-escopo .ag-nota{font-family:'IBM Plex Mono',ui-monospace,Consolas,monospace;font-size:13px}
  .ag-escopo .ag-p-muito_alta,.ag-p-alta{color:var(--ag-green);font-weight:600} .ag-p-media{color:var(--ag-blue)} .ag-p-baixa,.ag-p-baixa_aderencia{color:var(--ag-ink-soft)}
  .ag-modal-fundo{position:fixed;inset:0;background:rgba(22,35,58,.35);z-index:30}
  .ag-modal{position:fixed;top:0;right:0;bottom:0;width:min(620px,100%);background:var(--ag-paper);border-left:1px solid var(--ag-line);z-index:31;overflow-y:auto;box-shadow:-8px 0 24px rgba(22,35,58,.18)}
  .ag-escopo .ag-ev{font-size:13px;border-bottom:1px solid #E3DCCB;padding:6px 0;word-break:break-word} .ag-ev a{font-weight:600}
  .ag-escopo .ag-crit{display:grid;grid-template-columns:1fr auto;gap:2px 12px;font-size:13px}
  `;
  const PRODUTO = { cad: 'Ambiente CAD', geo: 'GEO & temporal', viabilidade: 'Viabilidade', completo: 'Plataforma completa', nenhum: 'Nenhum' };
  const ETAPA = { DESCOBERTO: 'Descoberto', EM_ANALISE: 'Em an\u00e1lise', QUALIFICADO: 'Qualificado', APROVADO: 'Aprovado p/ contato', CONTATADO: 'Contatado',
    RESPONDEU: 'Respondeu', TESTE_INICIADO: 'Teste iniciado', ASSINANTE: 'Assinante', SEM_INTERESSE: 'Sem interesse', DESCADASTRADO: 'N\u00e3o contatar' };
  const CRIT = { aderencia_produto: ['Ader\u00eancia aos produtos', 35], evidencia_servico: ['Evid\u00eancia do servi\u00e7o', 25], volume_recorrente: ['Volume recorrente', 15],
    segmento: ['Segmento', 10], canal_comercial: ['Canal comercial', 10], qualidade_evidencias: ['Qualidade das evid\u00eancias', 5] };

  let api, avisar, raiz, estado = { painel: null, filtro: {}, lista: null, pagina: 1 };

  function el(tag, attrs, ...filhos) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v === true ? '' : v);
    }
    for (const f of filhos.flat(Infinity)) if (f != null && f !== false) n.append(f instanceof Node ? f : document.createTextNode(String(f)));
    return n;
  }
  const dataHora = (s) => s ? new Date(s).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '\u2014';
  const linkSeguro = (u, txt) => /^https?:\/\//i.test(String(u || '')) ? el('a', { href: u, target: '_blank', rel: 'noopener noreferrer nofollow' }, txt || u) : (txt || '');

  async function flag(chave, valor) {
    try { await api('/api/adm/agentes?acao=agentes_flag', { method: 'POST', body: JSON.stringify({ chave, valor: String(valor) }) }); avisar('Configura\u00e7\u00e3o salva.'); await carregar(); }
    catch (e) { avisar(e.message, true); }
  }
  function chave(cfgKey, ligado, travado) {
    return el('button', { class: 'ag-sw', type: 'button', role: 'switch', 'aria-checked': String(!!ligado), 'aria-label': cfgKey, disabled: travado,
      onclick: (e) => { e.currentTarget.disabled = true; flag(cfgKey, !ligado); } });
  }

  function agentes(p) {
    const c = p.config || {}; const ex = (p.execucoes || []).find((x) => x.workflow === 'discovery');
    const geral = c.growth_enabled;
    const card = (titulo, sw, ligado, texto, st) => el('div', { class: 'ag-card' },
      el('h4', {}, titulo, sw), el('p', {}, texto), el('span', { class: 'st ' + (ligado ? 'ag-on' : 'ag-off') }, st));
    return el('div', { class: 'ag-grade' },
      card('Todos os agentes', chave('growth_enabled', geral), geral, 'Chave geral. Desligada, nenhum agente roda (descoberta e an\u00e1lise param).', geral ? 'LIGADOS' : 'PAUSADOS'),
      card('1 \u00b7 Prospector', chave('auto_discovery', c.auto_discovery), geral && c.auto_discovery,
        `Busca di\u00e1ria (Brave Search) de loteadoras, incorporadoras, projetistas e construtoras por estado \u00d7 segmento. Meta: ${c.daily_target} organiza\u00e7\u00f5es/dia. Confere CNPJ no site e na Receita.`,
        ex ? `\u00daltima: ${dataHora(ex.iniciado_at)} \u00b7 ${ex.status} \u00b7 ${ex.analisados}/${ex.alvo} analisadas \u00b7 ${ex.novas} novas` : 'Ainda n\u00e3o rodou'),
      card('2 \u00b7 Analista (IA)', chave('auto_qualification', c.auto_qualification), geral && c.auto_qualification,
        `D\u00e1 nota 0\u2013100 s\u00f3 com as evid\u00eancias p\u00fablicas guardadas e indica o foco (CAD, GEO, Viabilidade ou plataforma completa). At\u00e9 ${c.ia_max_dia}/dia.`,
        `${p.fila_ia} na fila \u00b7 ${p.classificadas_ia_hoje} hoje`),
      card('3 \u00b7 Aprova\u00e7\u00e3o', chave('auto_approval', c.auto_approval), c.auto_approval,
        `Marca como \u201caprovado para contato\u201d quem tem nota \u2265 ${c.min_auto_approval_score}, confian\u00e7a m\u00e9dia/alta, CNPJ ativo e n\u00e3o est\u00e1 em revis\u00e3o. S\u00f3 marca; quem envia \u00e9 o agente 4.`,
        `${p.aprovados} aprovados`),
      (() => {
        const m = estado.msgs || {}; const lig = geral && c.auto_outreach;
        const sel = el('select', { 'aria-label': 'Limite de e-mails por dia', style: 'width:auto;padding:3px 6px;font-size:12.5px',
          onchange: (e) => flag('limite_envio_dia', e.target.value) }, [0, 5, 8, 10, 12, 15, 20, 25, 30].map((n) => el('option', { value: String(n), selected: n === c.limite_envio_dia }, n + ' por dia')));
        const k = card('4 \u00b7 Contato (e-mail)', chave('auto_outreach', c.auto_outreach), lig,
          `Escreve e envia e-mail do contato@datageodigital.com.br para as aprovadas que publicam e-mail no pr\u00f3prio dom\u00ednio. 1 lembrete ap\u00f3s ${c.lembrete_dias || 7} dias; quem responde ou se descadastra sai da fila.`,
          lig ? `Hoje: ${m.enviados_hoje ?? 0}/${m.limite_dia ?? c.limite_envio_dia} \u00b7 ${m.agendados ?? 0} na fila` : 'DESLIGADO \u2014 nada \u00e9 enviado');
        k.append(el('label', { style: 'margin:4px 0 0' }, 'Limite di\u00e1rio'), sel);
        return k;
      })());
  }

  function cartoes(p) {
    const k = (r, v, s) => el('div', { class: 'kpi' }, el('div', { class: 'r' }, r), el('div', { class: 'v' }, String(v ?? 0)), s ? el('div', { class: 's' }, s) : null);
    return el('div', { class: 'cartoes' },
      k('Empresas', p.total), k('Descobertas hoje', p.descobertas_hoje), k('Analisadas hoje', p.classificadas_ia_hoje),
      k('Qualificadas', p.qualificados, 'nota IA \u2265 50'), k('Aprovadas', p.aprovados, 'prontas p/ contato'), k('Em revis\u00e3o', p.em_revisao, 'conferir \u00e0 m\u00e3o'));
  }

  function tabelaSegmentos(p) {
    return el('table', { class: 'ag-tab-sm' },
      el('thead', {}, el('tr', {}, el('th', {}, 'Segmento'), el('th', {}, 'Produto'), el('th', {}, 'Empresas'), el('th', {}, 'Qualificadas'))),
      el('tbody', {}, (p.segmentos || []).map((s) => el('tr', {},
        el('td', { 'data-rotulo': 'Segmento' }, s.nome), el('td', { 'data-rotulo': 'Produto' }, PRODUTO[s.produto] || s.produto),
        el('td', { 'data-rotulo': 'Empresas' }, String(s.empresas)), el('td', { 'data-rotulo': 'Qualif.' }, String(s.qualificados))))));
  }

  function filtros(p) {
    const segs = ((p.config || {}).segmentos || []);
    const sel = (nome, rotulo, opcoes) => el('select', { 'aria-label': rotulo, onchange: (e) => { estado.filtro[nome] = e.target.value; estado.pagina = 1; carregarLista(); } },
      el('option', { value: '' }, rotulo), opcoes.map(([v, t]) => el('option', { value: v, selected: estado.filtro[nome] === v }, t)));
    let tm = null;
    return el('div', { class: 'barra' },
      el('input', { type: 'text', class: 'busca', placeholder: 'Buscar por nome ou site\u2026', value: estado.filtro.q || '', 'aria-label': 'Buscar empresa',
        oninput: (e) => { clearTimeout(tm); tm = setTimeout(() => { estado.filtro.q = e.target.value; estado.pagina = 1; carregarLista(); }, 300); } }),
      sel('produto', 'Produto: todos', [['cad', 'Ambiente CAD'], ['geo', 'GEO & temporal'], ['viabilidade', 'Viabilidade'], ['completo', 'Plataforma completa']]),
      sel('segmento', 'Segmento: todos', segs.map((s) => [s.codigo, s.nome])),
      sel('etapa', 'Etapa: todas', Object.entries(ETAPA)),
      sel('revisao', 'Revis\u00e3o: todas', [['1', 'S\u00f3 em revis\u00e3o']]));
  }

  function tabelaEmpresas(d) {
    if (!d.itens.length) return el('div', { class: 'vazio' }, 'Nenhuma empresa com estes filtros. Os agentes v\u00e3o preenchendo a lista a cada rodada di\u00e1ria.');
    return el('div', {},
      el('div', { class: 'contagem' }, `${d.total} empresa(s)`),
      el('table', {},
        el('thead', {}, el('tr', {}, ['Empresa', 'UF', 'Segmento', 'Produto', 'Nota IA', 'Etapa'].map((t) => el('th', {}, t)))),
        el('tbody', {}, d.itens.map((e) => el('tr', { tabindex: '0', onclick: () => abrir(e.id), onkeydown: (ev) => { if (ev.key === 'Enter') abrir(e.id); } },
          el('td', { class: 'quem' }, el('div', { class: 'n' }, e.nome, e.revisao ? el('span', { class: 'etiqueta' }, 'revis\u00e3o') : null), el('div', { class: 'e' }, e.dominio)),
          el('td', { 'data-rotulo': 'UF' }, el('span', {}, e.uf || '\u2014')),
          el('td', { 'data-rotulo': 'Segmento' }, el('span', {}, nomeSeg(e.segmento))),
          el('td', { 'data-rotulo': 'Produto' }, el('span', {}, PRODUTO[e.produto] || '\u2014')),
          el('td', { 'data-rotulo': 'Nota IA' }, el('span', { class: 'ag-nota ag-p-' + (e.prioridade || '') }, e.score_ia == null ? '\u2014 (' + (e.score ?? '\u2014') + ')' : String(e.score_ia))),
          el('td', { 'data-rotulo': 'Etapa' }, el('span', {}, ETAPA[e.etapa] || e.etapa)))))),
      d.total > d.itens.length * estado.pagina ? el('div', { class: 'mais' }, el('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => { estado.pagina++; carregarLista(true); } }, 'Mostrar mais')) : null);
  }
  const nomeSeg = (c) => ((((estado.painel || {}).config || {}).segmentos || []).find((s) => s.codigo === c) || {}).nome || c || '\u2014';

  function execucoes(p) {
    const l = p.execucoes || [];
    if (!l.length) return el('div', { class: 'vazio' }, 'Nenhuma rodada ainda.');
    return el('table', { class: 'ag-tab-sm' },
      el('thead', {}, el('tr', {}, ['Dia', 'Status', 'Analisadas', 'Novas', 'Observa\u00e7\u00e3o'].map((t) => el('th', {}, t)))),
      el('tbody', {}, l.map((x) => el('tr', {}, el('td', { 'data-rotulo': 'Dia' }, x.data), el('td', { 'data-rotulo': 'Status' }, x.status),
        el('td', { 'data-rotulo': 'Analisadas' }, `${x.analisados}/${x.alvo}`), el('td', { 'data-rotulo': 'Novas' }, String(x.novas)),
        el('td', { 'data-rotulo': 'Obs.' }, x.causa || ((x.erros || []).length ? (x.erros.length + ' erro(s): ' + x.erros[x.erros.length - 1].erro) : '\u2014'))))));
  }

  const TIPO = { primeiro: 'E-mail', lembrete: 'Lembrete', whatsapp: 'WhatsApp' };
  const ST_MSG = { agendado: 'Na fila', enviando: 'Enviando', enviado: 'Enviado', erro: 'Erro', cancelado: 'Cancelado', rascunho: 'Recusado' };
  async function cancelarMsg(id) {
    try { await api('/api/adm/agentes?acao=agentes_cancelar_msg', { method: 'POST', body: JSON.stringify({ id }) }); avisar('Mensagem cancelada.'); carregar(true); }
    catch (e) { avisar(e.message, true); }
  }
  function mensagens(m) {
    if (!m) return el('div', { class: 'vazio' }, 'N\u00e3o consegui carregar as mensagens.');
    const topo = el('div', { class: 'contagem' }, `Enviados: ${m.enviados} \u00b7 respostas: ${m.respostas} \u00b7 descadastros: ${m.descadastros} \u00b7 aprovadas sem e-mail nem WhatsApp (n\u00e3o recebem nada): ${m.aprovadas_sem_email}`);
    if (!m.itens.length) return el('div', {}, topo, el('div', { class: 'vazio' }, 'Nenhum e-mail ainda. Com a chave \u201cContato\u201d ligada, o agente escreve para as empresas aprovadas e envia aos poucos ao longo do dia.'));
    return el('div', {}, topo, el('table', { class: 'ag-tab-sm' },
      el('thead', {}, el('tr', {}, ['Quando', 'Empresa', 'Para', 'Assunto', 'Situa\u00e7\u00e3o', ''].map((t) => el('th', {}, t)))),
      el('tbody', {}, m.itens.map((x) => el('tr', {},
        el('td', { 'data-rotulo': 'Quando' }, dataHora(x.enviado_at || x.enviar_apos)),
        el('td', { 'data-rotulo': 'Empresa' }, el('a', { href: '#', onclick: (e) => { e.preventDefault(); abrir(x.empresa_id); } }, x.nome)),
        el('td', { 'data-rotulo': 'Para' }, x.para),
        el('td', { 'data-rotulo': 'Assunto', title: x.corpo }, (x.tipo === 'whatsapp' ? 'WhatsApp: ' + String(x.corpo || '').slice(0, 60) + '\u2026' : (x.tipo === 'lembrete' ? '\u21bb ' : '') + x.assunto)),
        el('td', { 'data-rotulo': 'Situa\u00e7\u00e3o' }, (ST_MSG[x.status] || x.status) + (x.erro ? ' \u2014 ' + x.erro : x.cancelado_motivo ? ' \u2014 ' + x.cancelado_motivo : '')),
        el('td', {}, ['agendado', 'erro'].includes(x.status) ? el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => cancelarMsg(x.id) }, 'Cancelar') : ''))))));
  }

  const foneFmt = (n) => String(n || '').replace(/^55(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3');
  async function whatsEnviado(id) {
    try { await api('/api/adm/agentes?acao=agentes_whatsapp_enviado', { method: 'POST', body: JSON.stringify({ id }) }); avisar('Marcado como enviado. A empresa foi para \u201cContatado\u201d.'); carregar(true); }
    catch (e) { avisar(e.message, true); }
  }
  function cartaoWhats(x) {
    const txt = el('textarea', { rows: '6', maxlength: '1000', 'aria-label': 'Mensagem para ' + x.nome }, x.corpo);
    const confirma = el('div', { class: 'acoes', hidden: true, style: 'margin-top:8px' },
      el('span', { style: 'font-size:13px;align-self:center' }, 'Enviou?'),
      el('button', { class: 'btn btn-seal btn-sm', type: 'button', onclick: () => whatsEnviado(x.id) }, 'Sim, marcar como enviado'),
      el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { confirma.hidden = true; } }, 'Ainda n\u00e3o'));
    return el('div', { class: 'ag-card' },
      el('h4', {}, el('a', { href: '#', onclick: (e) => { e.preventDefault(); abrir(x.empresa_id); } }, x.nome), el('span', { class: 'ag-nota ag-p-alta' }, String(x.score_ia ?? '\u2014'))),
      el('p', {}, [x.uf, PRODUTO[x.produto], foneFmt(x.para)].filter(Boolean).join(' \u00b7 ')),
      txt,
      el('div', { class: 'acoes', style: 'margin-top:8px' },
        el('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => {
          window.open('https://wa.me/' + encodeURIComponent(x.para) + '?text=' + encodeURIComponent(txt.value), '_blank', 'noopener');
          confirma.hidden = false;
        } }, 'Abrir no WhatsApp')),
      confirma);
  }
  async function buscarContatos(ev) {
    const b = ev.currentTarget; b.disabled = true; let tot = { lidas: 0, emails: 0, whatsapps: 0 }, r = null;
    try {
      for (let i = 0; i < 12; i++) {
        b.textContent = `Lendo sites\u2026 (${tot.lidas} lidos)`;
        r = await api('/api/adm/agentes?acao=agentes_contatos', { method: 'POST', body: '{}' });
        tot.lidas += r.lidas; tot.emails += r.emails; tot.whatsapps += r.whatsapps;
        if (r.done) break;
      }
      avisar(`${tot.lidas} sites lidos: ${tot.emails} e-mail(s) e ${tot.whatsapps} WhatsApp/celular(es) encontrados.` + (r && !r.done ? ` Faltam ${r.restantes}; clique de novo.` : ''));
      carregar(true);
    } catch (e) { avisar(e.message, true); } finally { b.disabled = false; b.textContent = 'Buscar e-mail e WhatsApp nos sites'; }
  }
  function whatsapp(m) {
    if (!m) return el('div', { class: 'vazio' }, 'N\u00e3o consegui carregar.');
    const topo = el('div', { class: 'barra' },
      el('span', { class: 'contagem', style: 'margin:0;flex:1' }, `Voc\u00ea envia pelo seu WhatsApp, 1 clique por empresa (recomendado: at\u00e9 20 por dia). Enviados hoje: ${m.whatsapp_hoje || 0}.`),
      m.sem_leitura_site ? el('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: buscarContatos }, 'Buscar e-mail e WhatsApp nos sites') : null);
    if (!(m.whatsapp || []).length) return el('div', {}, topo, el('div', { class: 'vazio' },
      'Nenhuma mensagem pronta. Ela aparece aqui quando uma empresa aprovada publica WhatsApp ou celular e o agente escreve o texto (dias \u00fateis, 8h10 e 13h10).'
      + (m.sem_leitura_site ? ` H\u00e1 ${m.sem_leitura_site} empresa(s) com o site ainda n\u00e3o lido.` : '')));
    return el('div', {}, topo, el('div', { class: 'ag-grade' }, m.whatsapp.map(cartaoWhats)));
  }

  // ------------------------------------------------------------ detalhe da empresa
  async function abrir(id) {
    fechar();
    const fundo = el('div', { class: 'ag-modal-fundo ag-escopo', id: 'ag-fundo', onclick: fechar });
    const m = el('aside', { class: 'ag-modal ag-escopo', id: 'ag-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Detalhes da empresa' }, el('div', { class: 'g-corpo' }, 'Carregando\u2026'));
    document.body.append(fundo, m);
    try { desenharDetalhe(await api('/api/adm/agentes?acao=agentes_empresa&id=' + encodeURIComponent(id))); }
    catch (e) { avisar(e.message, true); fechar(); }
  }
  function fechar() { ['ag-fundo', 'ag-modal'].forEach((i) => { const n = document.getElementById(i); if (n) n.remove(); }); }
  async function acao(id, corpo, msg) {
    try { const d = await api('/api/adm/agentes?acao=agentes_acao', { method: 'POST', body: JSON.stringify(Object.assign({ id }, corpo)) }); avisar(msg || 'Salvo.'); desenharDetalhe(d); carregar(true); }
    catch (e) { avisar(e.message, true); }
  }
  function desenharDetalhe(e) {
    const m = document.getElementById('ag-modal'); if (!m) return;
    const det = e.ia_detalhe || {}; const crit = det.criterios || {};
    const fato = (k, v) => [el('dt', {}, k), el('dd', {}, v == null || v === '' ? '\u2014' : v)];
    const contato = e.contato_publicado || {};
    m.replaceChildren(
      el('div', { class: 'g-topo' }, el('div', {}, el('h2', {}, e.nome), el('div', { class: 'e' }, linkSeguro(e.site || ('https://' + e.dominio), e.dominio))),
        el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: fechar }, 'Fechar')),
      el('div', { class: 'g-corpo' },
        el('div', { class: 'bloco' }, el('h3', {}, 'Situa\u00e7\u00e3o'),
          el('dl', { class: 'fatos' },
            fato('Etapa', ETAPA[e.etapa] || e.etapa), fato('Produto indicado', PRODUTO[e.produto_indicado]), fato('Segmento', nomeSeg(e.segmento)),
            fato('Nota IA', e.score_ia == null ? null : `${e.score_ia} (${e.prioridade}, confian\u00e7a ${e.confianca})`), fato('Nota por regras', e.score),
            fato('Aprovado', e.aprovada_at ? `${dataHora(e.aprovada_at)} por ${e.aprovada_por}` : 'n\u00e3o'), e.revisao ? fato('Revis\u00e3o', 'Precisa de confer\u00eancia humana') : null,
            fato('UF / cidade', [e.uf, e.cidade].filter(Boolean).join(' \u00b7 ')), fato('CNPJ', e.cnpj ? e.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : null),
            fato('Raz\u00e3o social', e.razao_social), fato('Situa\u00e7\u00e3o cadastral', e.situacao_cadastral), fato('Atividade (CNAE)', e.cnae_descricao),
            fato('Contato publicado', [contato.email, contato.telefone].filter(Boolean).join(' \u00b7 ') || null),
            fato('E-mail p/ contato', e.email_valido || 'sem e-mail do pr\u00f3prio dom\u00ednio \u2014 o agente n\u00e3o envia'),
            fato('WhatsApp / celular', e.telefone_valido ? foneFmt(e.telefone_valido) + (e.telefone_fonte ? ' (' + e.telefone_fonte.replace('site_whatsapp', 'link de WhatsApp no site').replace('site_tel', 'telefone no site') + ')' : ' (cadastro CNPJ)') : null),
            e.ia_erro ? fato('Erro da IA', e.ia_erro) : null)),
        e.ia_resumo || det.suggested_approach ? el('div', { class: 'bloco' }, el('h3', {}, 'An\u00e1lise do agente'),
          e.ia_resumo ? el('p', { style: 'font-size:13.5px;margin-bottom:8px' }, e.ia_resumo) : null,
          det.product_fit ? el('p', { class: 'nota' }, 'Encaixe: ' + det.product_fit) : null,
          det.suggested_approach ? el('p', { class: 'nota' }, 'Abordagem sugerida: ' + det.suggested_approach) : null,
          det.missing_information ? el('p', { class: 'nota' }, 'Falta saber: ' + det.missing_information) : null,
          Object.keys(crit).length ? el('div', { class: 'ag-crit', style: 'margin-top:10px' }, Object.entries(CRIT).map(([k, [n, max]]) => [el('span', {}, n), el('span', { class: 'ag-nota' }, `${crit[k] ?? '\u2014'}/${max}`)])) : null) : null,
        el('div', { class: 'bloco' }, el('h3', {}, 'A\u00e7\u00f5es'),
          el('div', { class: 'acoes' },
            e.aprovada_at ? el('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => acao(e.id, { acao: 'desaprovar' }, 'Aprova\u00e7\u00e3o retirada.') }, 'Retirar aprova\u00e7\u00e3o')
              : el('button', { class: 'btn btn-seal btn-sm', type: 'button', onclick: () => acao(e.id, { acao: 'aprovar' }, 'Aprovada para contato.') }, 'Aprovar para contato'),
            el('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => acao(e.id, { acao: 'reanalisar' }, 'Volta para a fila da IA.') }, 'Reanalisar com IA'),
            e.status === 'descartada' || e.status === 'bloqueada' ? el('button', { class: 'btn btn-outline btn-sm', type: 'button', disabled: e.status === 'bloqueada', onclick: () => acao(e.id, { acao: 'reativar' }, 'Reativada.') }, 'Reativar')
              : el('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => acao(e.id, { acao: 'descartar' }, 'Descartada.') }, 'Descartar'),
            e.status !== 'bloqueada' ? el('button', { class: 'btn btn-danger btn-sm', type: 'button', onclick: () => acao(e.id, { acao: 'bloquear' }, 'Marcada como \u201cn\u00e3o contatar\u201d.') }, 'N\u00e3o contatar') : null),
          el('hr', { class: 'sep' }),
          el('div', { class: 'linha' },
            el('div', { class: 'campo medio' }, el('label', { for: 'ag-etapa' }, 'Etapa (contato manual)'),
              el('select', { id: 'ag-etapa', onchange: (ev) => acao(e.id, { acao: 'etapa', etapa: ev.target.value }, 'Etapa salva.') },
                el('option', { value: '' }, 'Autom\u00e1tica'), ['CONTATADO', 'RESPONDEU', 'TESTE_INICIADO', 'ASSINANTE', 'SEM_INTERESSE'].map((x) => el('option', { value: x, selected: e.etapa_manual === x }, ETAPA[x])))),
            el('div', { class: 'campo medio' }, el('label', { for: 'ag-prod' }, 'Produto'),
              el('select', { id: 'ag-prod', onchange: (ev) => acao(e.id, { acao: 'produto', produto: ev.target.value }, 'Produto salvo.') },
                Object.entries(PRODUTO).map(([v, t]) => el('option', { value: v, selected: e.produto_indicado === v }, t))))),
          el('label', { for: 'ag-notas', style: 'margin-top:10px' }, 'Notas internas'),
          el('textarea', { id: 'ag-notas', rows: '3', maxlength: '2000' }, e.notas || ''),
          el('div', { class: 'atalhos' }, el('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => acao(e.id, { acao: 'notas', notas: document.getElementById('ag-notas').value }, 'Notas salvas.') }, 'Salvar notas'))),
        (e.mensagens || []).length ? el('div', { class: 'bloco' }, el('h3', {}, 'Mensagens'),
          e.mensagens.map((x) => el('div', { class: 'ag-ev' }, el('div', {}, el('b', {}, (TIPO[x.tipo] || '') + ': ' + (x.tipo === 'whatsapp' ? foneFmt(x.para) : x.assunto)), ' \u2014 ' + (ST_MSG[x.status] || x.status) + ' ' + dataHora(x.enviado_at || x.enviar_apos)),
            el('div', { class: 'nota', style: 'white-space:pre-wrap;margin-top:4px' }, x.corpo)))) : null,
        el('div', { class: 'bloco' }, el('h3', {}, 'Evid\u00eancias p\u00fablicas (' + (e.evidencias || []).length + ')'),
          (e.evidencias || []).map((v) => el('div', { class: 'ag-ev' }, linkSeguro(v.url, v.titulo || v.url), el('div', { class: 'nota', style: 'margin-top:2px' }, v.trecho || '')))),
        el('div', { class: 'bloco' }, el('h3', {}, 'Hist\u00f3rico'),
          el('ul', { class: 'lista-simples' }, (e.historico || []).map((h) => el('li', {}, el('div', {}, h.acao + ' \u00b7 ' + (h.por || '')),
            el('div', { class: 'q' }, dataHora(h.at) + (h.para ? ' \u00b7 ' + JSON.stringify(h.para).slice(0, 220) : ''))))))));
  }

  // ------------------------------------------------------------ carregar
  async function carregarLista(somar) {
    const area = document.getElementById('ag-lista'); if (!area) return;
    const qs = new URLSearchParams({ acao: 'agentes_empresas', limite: '50', pagina: String(estado.pagina) });
    for (const [k, v] of Object.entries(estado.filtro)) if (v) qs.set(k, v);
    try {
      const d = await api('/api/admin?' + qs);
      estado.lista = somar && estado.lista ? { total: d.total, itens: estado.lista.itens.concat(d.itens) } : d;
      area.replaceChildren(tabelaEmpresas(estado.lista));
    } catch (e) { area.replaceChildren(el('div', { class: 'vazio' }, e.message)); }
  }
  async function carregar(silencioso) {
    try {
      const [p, msgs] = await Promise.all([api('/api/adm/agentes?acao=agentes_painel'), api('/api/adm/agentes?acao=agentes_mensagens').catch(() => null)]);
      estado.painel = p; estado.msgs = msgs;
      raiz.replaceChildren(
        el('p', { class: 'ag-intro' }, 'Campanha da DataGeo Digital (loteamento: CAD, GEO e viabilidade), separada das outras marcas. ',
          'Os agentes s\u00f3 pesquisam fontes p\u00fablicas autorizadas. O e-mail autom\u00e1tico (agente 4) s\u00f3 sai com a chave Contato ligada, dentro do limite di\u00e1rio.'),
        agentes(p),
        el('div', { class: 'barra' },
          el('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: rodar }, 'Rodar descoberta agora'),
          el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => carregar() }, 'Atualizar')),
        cartoes(p),
        el('h3', { class: 'ag-h3' }, 'Empresas'), filtros(p), el('div', { id: 'ag-lista' }),
        el('h3', { class: 'ag-h3' }, 'WhatsApp para enviar'), whatsapp(estado.msgs),
        el('h3', { class: 'ag-h3' }, 'Mensagens enviadas e na fila'), mensagens(estado.msgs),
        el('h3', { class: 'ag-h3' }, 'Por segmento'), tabelaSegmentos(p),
        el('h3', { class: 'ag-h3' }, 'Rodadas de descoberta'), execucoes(p));
      estado.pagina = 1; await carregarLista();
    } catch (e) {
      raiz.replaceChildren(el('div', { class: 'vazio' }, e.status === 503 ? e.message : 'N\u00e3o consegui carregar os agentes: ' + e.message));
      if (!silencioso) avisar(e.message, true);
    }
  }
  async function rodar(ev) {
    const b = ev.currentTarget; b.disabled = true; b.textContent = 'Rodando\u2026 (at\u00e9 1 min)';
    try {
      const r = await api('/api/adm/agentes?acao=agentes_rodada', { method: 'POST', body: '{}' });
      avisar(r.pausado ? 'Descoberta pausada nas chaves acima.' : r.ocupado ? 'J\u00e1 tem uma rodada em andamento.' : r.execucao && r.execucao.causa ? r.execucao.causa
        : `Lote feito: ${(r.lote || {}).analisados || 0} analisadas, ${(r.lote || {}).novas || 0} novas.`);
      await carregar(true);
    } catch (e) { avisar(e.message, true); } finally { b.disabled = false; b.textContent = 'Rodar descoberta agora'; }
  }

  // inicia sozinho na p\u00e1gina /adm/agentes
  let avTm = null;
  function avisarLocal(texto, erro) {
    let a = document.getElementById('ag-aviso');
    if (!a) { a = el('div', { id: 'ag-aviso', role: 'status', 'aria-live': 'polite' }); document.body.append(a); }
    a.textContent = texto; a.className = (erro ? 'erro ' : '') + 'on';
    clearTimeout(avTm); avTm = setTimeout(() => { a.className = ''; }, erro ? 7000 : 3800);
  }
  async function apiLocal(caminho, opcoes) {
    opcoes = opcoes || {};
    const r = await fetch(caminho, Object.assign({ credentials: 'same-origin' }, opcoes, { headers: { 'Content-Type': 'application/json' } }));
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(d.erro || d.error || 'Erro ' + r.status), { status: r.status });
    return d;
  }
  function iniciar() {
    const alvo = document.getElementById('ag-raiz'); if (!alvo) return;
    api = apiLocal; avisar = avisarLocal; raiz = alvo;
    if (!document.getElementById('ag-css')) document.head.append(el('style', { id: 'ag-css' }, CSS));
    if (!raiz.dataset.carregado) { raiz.dataset.carregado = '1'; raiz.replaceChildren(el('div', { class: 'vazio' }, 'Carregando agentes\u2026')); }
    carregar();
  }
  window.DgeoAgentesIniciar = iniciar;   // a p\u00e1gina chama de novo ao voltar para /adm/agentes (navega\u00e7\u00e3o do Next)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fechar(); });
})();
