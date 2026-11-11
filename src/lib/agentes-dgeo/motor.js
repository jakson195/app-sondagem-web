// Equipe de agentes — DataGeo Digital (loteamento: CAD, GEO e viabilidade). Área própria "dgeo" no Supabase,
// separada do ERTimg (crm) e da Agrimensura (agrim). Usado pelas rotas /api/adm/agentes, /api/agentes/n8n e /descadastrar.
// Variáveis na Vercel: DGEO_AGENTES_KEY (obrigatória) e BRAVE_SEARCH_KEY (busca). Nada de CAPTCHA, login ou bloqueio contornado.
import crypto from 'crypto';
import net from 'net';
import dns from 'dns';

const SB_URL = process.env.DGEO_SUPABASE_URL || 'https://kkkvdykwojgkalwboqrk.supabase.co';
const SB_PUB = process.env.DGEO_SUPABASE_KEY || 'sb_publishable_EQo4Dq6dXNUqGORm27w9GA_sPzdrV_n'; // chave publicável (pública por natureza)
const UA = 'DataGeoDigital-Check/1.0 (+https://www.datageodigital.com.br)';
const TEMPO_LOTE_MS = 38_000;
const SALVAR_MIN = 20;

// ------------------------------------------------------------------ banco
async function rpc(fn, args) {
  const k = process.env.DGEO_AGENTES_KEY || '';
  if (k.length < 32) throw Object.assign(new Error('Agentes não configurados: falta a variável DGEO_AGENTES_KEY na Vercel.'), { status: 503 });
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SB_PUB, 'x-dgeo-key': k, 'Content-Type': 'application/json' },
    body: JSON.stringify(args || {}),
  });
  const txt = await r.text();
  let j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = txt; }
  if (!r.ok) {
    const st = (j && j.code === '42501') ? 403 : (j && j.code === '22023') ? 422 : 502;
    throw Object.assign(new Error((j && j.message) || 'Falha no banco dos agentes'), { status: st });
  }
  return j;
}

function chaveOk(chave) {
  const s = process.env.DGEO_AGENTES_KEY || ''; const k = String(chave || '');
  return s.length >= 32 && k.length === s.length && crypto.timingSafeEqual(Buffer.from(k), Buffer.from(s));
}

// ------------------------------------------------------------------ pontuação por regras (explicável, sem IA)
const TERMOS = {
  loteamento: [/loteament/i, /parcelamento do solo/i, /condom[ií]nio de lotes/i, /loteadora/i, /urbanizadora/i, /desmembramento/i, /lotes? (urbanos?|residenciais|à venda)/i],
  projeto: [/projeto urban[ií]stic/i, /terraplenagem/i, /drenagem/i, /pavimenta[cç][aã]o/i, /arruamento/i, /infraestrutura urbana/i, /rede de (água|esgoto)/i, /\bCAD\b|autocad|civil 3d/i],
  topografia: [/topograf/i, /planialtim/i, /georreferenc/i, /levantamento (topogr|aerofotogr)/i, /\bdrones?\b/i],
  viabilidade: [/viabilidade/i, /or[cç]amento/i, /\bSINAPI\b/i, /\bSICRO\b/i, /quantitativos/i, /\bVGV\b/i, /estudo de massa/i],
  empreendimento: [/incorporad/i, /empreendimentos? imobili/i, /lan[cç]amentos?/i, /construtora/i],
  geo_ambiental: [/licenciamento/i, /geot[eé]cni/i, /sondagem/i, /ambiental/i, /\bEIV\b|\bEIA\b/i],
};
const SERVICO = [/servi[cç]os?/i, /consult/i, /empresa/i, /escrit[oó]rio/i, /nossa equipe/i, /projetos?/i, /or[cç]amento/i, /atendemos/i];
const NEGATIVO = [/universi/i, /\.edu(\.|$|\/)/i, /tese|disserta|monografia|tcc\b/i, /\bpdf\b/i, /scielo|researchgate|revista/i,
  /not[ií]cia|news/i, /vagas?\b|emprego/i, /wikipedia/i];
// no título: escola, curso ou loja de equipamentos (não é escritório que atende cliente) — pesa mais
const NEGATIVO_FORTE = /curso|apostila|concurso|\baulas?\b|treinamento|\b(loja|comprar|frete|pre[cç]o)\b|esta[cç][aã]o total|receptor gnss|drones? (à|a) venda/i;
const DOMINIOS_EXCLUIDOS = /(^|\.)(linkedin|facebook|instagram|twitter|x|youtube|wikipedia|google|bing|yahoo|amazon|mercadolivre|olx|shopee|magazineluiza|reclameaqui|jusbrasil|escavador|migalhas|conjur|guiamais|telelistas|apontador|cnpj|cnpja|econodata|solutudo|casadosdados|empresascnpj|vivareal|zapimoveis|imovelweb|chavesnamao|quintoandar|indeed|glassdoor|catho|infojobs|reddit|quora|medium|issuu|scribd|slideshare|pinterest|tiktok|doctoralia|getninjas|habitissimo|tudocelular|blogspot|wordpress|wixsite)\.[a-z.]+$/i;

function dominioDe(url) { try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { return null; } }
function excluido(dom) { return !dom || DOMINIOS_EXCLUIDOS.test(dom) || /\.(gov|jus|leg|mp|def|mil|edu)\.br$/.test(dom) || /\.(gov|edu)$/.test(dom); }
function nomeEmpresa(perfil, dom) {
  if (perfil && perfil.length >= 2 && perfil.length <= 80 && !/^(home|inicio|início|index)$/i.test(perfil)) return perfil;
  return String(dom || '').split('.')[0].replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function pontuar(evidencias) {
  const texto = evidencias.map((e) => [e.titulo, e.trecho, e.url].filter(Boolean).join(' \n ')).join(' \n ');
  const achados = {}; const termos = new Set();
  for (const [grupo, lista] of Object.entries(TERMOS)) {
    for (const re of lista) { const m = texto.match(re); if (m) { (achados[grupo] = achados[grupo] || new Set()).add(m[0]); termos.add(m[0]); } }
  }
  const regras = []; let s = 0;
  const add = (pts, motivo) => { s += pts; regras.push({ pts, motivo }); };
  if (achados.loteamento) add(35, 'Atua com loteamento / parcelamento do solo');
  if (achados.projeto) add(15, 'Projetos de urbanização, terraplenagem, drenagem ou pavimentação');
  if (achados.viabilidade) add(15, 'Viabilidade, orçamento ou quantitativos (SINAPI/SICRO)');
  if (achados.topografia) add(10, 'Topografia / georreferenciamento');
  if (achados.empreendimento) add(10, 'Incorporação ou empreendimentos imobiliários');
  if (achados.geo_ambiental) add(5, 'Geotecnia / licenciamento ambiental');
  if (SERVICO.some((re) => re.test(texto))) add(8, 'Indícios de prestador de serviços');
  const n = new Set(evidencias.map((e) => e.url)).size;
  if (n > 1) add(Math.min(9, (n - 1) * 3), n + ' páginas públicas com evidência');
  const neg = NEGATIVO.filter((re) => evidencias.some((e) => re.test(e.url) || re.test(e.titulo || ''))).length;
  if (neg) add(-Math.min(36, neg * 12), 'Sinais de notícia, vaga, conteúdo acadêmico ou diretório');
  if (evidencias.some((e) => NEGATIVO_FORTE.test(e.titulo || '') || NEGATIVO_FORTE.test(e.url))) add(-25, 'Parece curso, escola ou loja de equipamentos');
  const score = Math.max(0, Math.min(100, Math.round(s)));
  return { score, especialidades: Object.keys(achados), termos: [...termos].slice(0, 20),
    detalhe: { metodo: 'dgeo-regras-v1', regras, fontes: [...new Set(evidencias.map((e) => e.url))].slice(0, 10), verificado_at: new Date().toISOString() } };
}

// ------------------------------------------------------------------ CNPJ (validação, cadastro aberto)
const UFS = { AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
  MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins' };
function cnpjValido(c) {
  c = String(c || '').replace(/\D/g, '');
  if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const dv = (base, pesos) => { const s = base.split('').reduce((a, d, i) => a + Number(d) * pesos[i], 0); const r = s % 11; return r < 2 ? 0 : 11 - r; };
  const d1 = dv(c.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]); const d2 = dv(c.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return c.endsWith(String(d1) + String(d2));
}
function acharCnpj(texto) {
  for (const a of String(texto || '').match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g) || []) { const c = a.replace(/\D/g, ''); if (cnpjValido(c)) return c; }
  return null;
}
function ufDoTexto(t) {
  t = String(t || '');
  const m = t.match(/(?:[-–\/,]\s?|\()\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b(?!\w)/);
  if (m) return m[1];
  for (const [uf, nome] of Object.entries(UFS).sort((a, b) => b[1].length - a[1].length)) if (new RegExp('(?<!\\p{L})' + nome.replace(/\s/g, '\\s') + '(?!\\p{L})', 'iu').test(t)) return uf;
  return null;
}
// CNAE → segmento (atividade oficial; principal primeiro, depois as secundárias)
function segmentoDoCnae(cnae, secundarios = []) {
  const cods = [String(cnae || ''), ...secundarios.map((s) => String(s.codigo || s))].map((c) => c.replace(/\D/g, '')).filter(Boolean);
  const regras = [[/^68102/, 'loteadoras'], [/^4110700/, 'incorporadoras'], [/^7119701/, 'topografia'], [/^7111100/, 'urbanismo'], [/^7112000/, 'engenharia_loteamento'], [/^(7119702|7119703|7120100)/, 'consultoria_geo_ambiental'], [/^(4211|4213|4222|4313)/, 'construtoras_infra']];
  for (const c of cods) for (const [re, seg] of regras) if (re.test(c)) return seg;
  return null;
}
async function consultarCnpj(cnpj, timeout = 6000) {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch('https://brasilapi.com.br/api/cnpj/v1/' + cnpj, { headers: { Accept: 'application/json', 'User-Agent': UA }, signal: ctl.signal });
    if (!r.ok) return null;
    const j = await r.json();
    const individual = !!j.opcao_pelo_mei || /empres[áa]rio\s*\(?individual|microempreendedor/i.test(j.natureza_juridica || '') || String(j.codigo_natureza_juridica || '') === '2135';
    const sec = Array.isArray(j.cnaes_secundarios) ? j.cnaes_secundarios.filter((s) => s && s.codigo).slice(0, 20).map((s) => ({ codigo: String(s.codigo), descricao: String(s.descricao || '').slice(0, 200) })) : [];
    const agora = new Date().toISOString();
    const d = {
      cnpj, uf: j.uf || null, cidade: j.municipio ? String(j.municipio).slice(0, 120) : null,
      cnae: j.cnae_fiscal ? String(j.cnae_fiscal) : null, cnae_descricao: j.cnae_fiscal_descricao || null, cnaes_secundarios: sec,
      natureza_juridica: individual ? 'Empresário individual / MEI' : (j.natureza_juridica || null), porte: j.porte || j.descricao_porte || null,
      situacao_cadastral: j.descricao_situacao_cadastral || null, segmento: segmentoDoCnae(j.cnae_fiscal, sec),
      dados_fonte: { cnpj: { fonte: 'Receita Federal — dados abertos (via BrasilAPI)', consultado_at: agora } },
    };
    if (!individual) {   // MEI / empresário individual: nome e contato do cadastro são dados da pessoa — não guardamos
      d.razao_social = j.razao_social || null;
      const tel = j.ddd_telefone_1 ? String(j.ddd_telefone_1).replace(/\D/g, '') : null;
      if (j.email || tel) d.contato_publicado = { email: j.email ? String(j.email).toLowerCase().slice(0, 200) : null, telefone: tel, fonte: 'cadastro CNPJ (Receita Federal)', consultado_at: agora };
    }
    return d;
  } catch (e) { return null; } finally { clearTimeout(tm); }
}

// ------------------------------------------------------------------ leitura educada de páginas públicas (anti-SSRF + robots.txt)
function ipPrivado(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) || a >= 224 || (a === 198 && (b === 18 || b === 19));
  }
  const x = String(ip).toLowerCase();
  return x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80') || x.startsWith('ff') || (x.startsWith('::ffff:') && ipPrivado(x.slice(7)));
}
const resolver = { lookup: (host) => dns.promises.lookup(host, { all: true }).then((l) => l.map((x) => x.address)) };
async function urlSegura(url) {
  let u; try { u = new URL(url); } catch (e) { return false; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return false;
  if (u.port && !['80', '443'].includes(u.port)) return false;
  const h = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!h || h === 'localhost' || /\.(localhost|local|internal|lan|home|corp|intranet)$/.test(h) || (!h.includes('.') && !net.isIP(h))) return false;
  if (net.isIP(h)) return !ipPrivado(h);
  try { const ips = await resolver.lookup(h); return ips.length > 0 && ips.every((ip) => !ipPrivado(ip)); } catch (e) { return false; }
}
async function baixar(url, ms = 6000, max = 600_000) {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), ms);
  try {
    let atual = url, r;
    for (let salto = 0; salto < 4; salto++) {
      if (!(await urlSegura(atual))) throw Object.assign(new Error('Endereço não permitido'), { bloqueado: true });
      r = await fetch(atual, { headers: { 'User-Agent': UA, Accept: 'text/html,text/plain;q=0.8' }, redirect: 'manual', signal: ctl.signal });
      const loc = r.status >= 300 && r.status < 400 && r.headers.get('location');
      if (!loc) break;
      atual = new URL(loc, atual).href;
    }
    const tipo = r.headers.get('content-type') || '';
    if ((r.status >= 300 && r.status < 400) || !/text\/(html|plain)|xhtml/i.test(tipo)) return { status: r.status, url: atual, html: '' };
    const leitor = r.body.getReader(); let n = 0; const partes = [];
    while (n < max) { const { done, value } = await leitor.read(); if (done) break; partes.push(Buffer.from(value)); n += value.length; }
    try { leitor.cancel(); } catch (e) { /* ok */ }
    return { status: r.status, url: atual, html: Buffer.concat(partes).toString('utf8').slice(0, max) };
  } finally { clearTimeout(tm); }
}
const ROBOTS = new Map();
async function permitido(url) {
  let u; try { u = new URL(url); } catch (e) { return false; }
  let regras = ROBOTS.get(u.host);
  if (!regras) {
    regras = [];
    try {
      const r = await baixar(u.origin + '/robots.txt', 3000, 100_000);
      if (r.status >= 200 && r.status < 300) {
        let aplica = false, emGrupo = false;
        for (const l of r.html.split(/\r?\n/)) {
          const [k, ...vv] = l.replace(/#.*/, '').split(':'); const chave = (k || '').trim().toLowerCase(); const val = vv.join(':').trim();
          if (chave === 'user-agent') { if (!emGrupo) aplica = false; emGrupo = true; if (val === '*' || /datageodigital/i.test(val)) aplica = true; }
          else { emGrupo = false; if (aplica && (chave === 'disallow' || chave === 'allow') && val) regras.push({ tipo: chave, caminho: val }); }
        }
      }
    } catch (e) { /* sem robots.txt acessível = sem restrições declaradas */ }
    ROBOTS.set(u.host, regras);
  }
  const caminho = u.pathname + u.search;
  const casa = regras.filter((r) => caminho.startsWith(r.caminho.replace(/\*.*$/, ''))).sort((a, b) => b.caminho.length - a.caminho.length)[0];
  return !casa || casa.tipo === 'allow';
}
const limpaHtml = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
function links(html, base) {
  const out = [];
  for (const m of String(html).matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try { out.push({ href: new URL(m[1], base).href, texto: limpaHtml(m[2]).slice(0, 80) }); } catch (e) { /* link inválido */ }
    if (out.length > 400) break;
  }
  return out;
}
// Site da empresa: página inicial e, se preciso, UMA página de contato / quem somos do mesmo domínio.
// Devolve o CNPJ publicado e os e-mails do PRÓPRIO domínio (e-mail de outro domínio, como gmail, é ignorado).
function emailsDoHtml(html, dominio) {
  const achados = new Set();
  const txt = String(html || '').replace(/&#64;|&#x40;|\[at\]|\(at\)/gi, '@');
  for (const m of txt.matchAll(/(?:mailto:)?([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/gi)) {
    const e = m[1].toLowerCase().replace(/\.+$/, ''); const d = e.split('@')[1];
    if ((d === dominio || d.endsWith('.' + dominio)) && !/\.(png|jpe?g|gif|webp|svg)$/.test(e) && !/^(no-?reply|nao-?responda|postmaster|abuse|webmaster)@/.test(e)) achados.add(e);
  }
  // contato comercial primeiro
  return [...achados].sort((a, b) => (/^(contato|comercial|atendimento|orcamento|vendas)@/.test(b) ? 1 : 0) - (/^(contato|comercial|atendimento|orcamento|vendas)@/.test(a) ? 1 : 0)).slice(0, 5);
}
// WhatsApp e telefone publicados no site (links wa.me / api.whatsapp.com / tel:)
function telefonesDoHtml(html) {
  const h = String(html || ''); const wa = new Set(); const tel = new Set();
  for (const m of h.matchAll(/(?:wa\.me\/|api\.whatsapp\.com\/send\/?\?(?:[^"'\s]*&)?phone=|whatsapp:\/\/send\?phone=)\+?(\d{10,13})/gi)) wa.add(m[1]);
  for (const m of h.matchAll(/href=["']tel:([+\d\s().-]{10,20})["']/gi)) { const d = m[1].replace(/\D/g, ''); if (d.length >= 10) tel.add(d); }
  return { whatsapp: [...wa].slice(0, 3), tel: [...tel].slice(0, 3) };
}
async function lerSite(site, dominio, consumo) {
  const ler = async (url) => {
    if (!(await permitido(url))) return null;
    consumo.site_institucional = (consumo.site_institucional || 0) + 1;
    const p = await baixar(url);
    return p.status < 400 ? p : null;
  };
  const pg = await ler(site.replace(/\/?$/, '/'));
  if (!pg) return { cnpj: null, emails: [], fones: { whatsapp: [], tel: [] } };
  let cnpj = acharCnpj(pg.html.replace(/<[^>]+>/g, ' '));
  let emails = emailsDoHtml(pg.html, dominio);
  let fones = telefonesDoHtml(pg.html);
  if (!cnpj || !emails.length || !fones.whatsapp.length) {
    const l = links(pg.html, pg.url || site).find((x) => dominioDe(x.href) === dominio && /contat|fale-conosco|sobre|quem-somos|empresa|institucional/i.test(x.href + ' ' + x.texto));
    if (l) {
      const p2 = await ler(l.href);
      if (p2) {
        cnpj = cnpj || acharCnpj(p2.html.replace(/<[^>]+>/g, ' ')); if (!emails.length) emails = emailsDoHtml(p2.html, dominio);
        const f2 = telefonesDoHtml(p2.html); if (!fones.whatsapp.length) fones.whatsapp = f2.whatsapp; if (!fones.tel.length) fones.tel = f2.tel;
      }
    }
  }
  return { cnpj, emails, fones };
}

// ------------------------------------------------------------------ busca (Brave Search API — autorizada)
async function buscar(q) {
  const u = new URL('https://api.search.brave.com/res/v1/web/search');
  u.searchParams.set('q', q); u.searchParams.set('count', '20'); u.searchParams.set('safesearch', 'strict');
  u.searchParams.set('country', 'br'); u.searchParams.set('search_lang', 'pt-br');
  const r = await fetch(u, { headers: { Accept: 'application/json', 'X-Subscription-Token': process.env.BRAVE_SEARCH_KEY } });
  if (!r.ok) throw Object.assign(new Error('Brave ' + r.status), { limite: r.status === 429 || r.status === 402 });
  const j = await r.json();
  return ((j.web && j.web.results) || []).map((x) => ({ url: String(x.url || ''), titulo: limpaHtml(x.title).slice(0, 300), trecho: limpaHtml(x.description).slice(0, 500),
    site_nome: limpaHtml((x.profile && x.profile.name) || '').slice(0, 120), fonte: 'brave' }))
    .filter((x) => /^https?:\/\//.test(x.url) && !excluido(dominioDe(x.url)) && (x.titulo || x.trecho));
}

// ------------------------------------------------------------------ agente prospector: um estado × um segmento
async function processarCombo(c, ativas, consumo, consumoHoje, limiteBusca) {
  const out = { uf: c.uf, segmento: c.segmento, consultas: 0, resultados: 0, analisados: 0, novas: 0, duplicadas: 0, salvas: 0, enriquecidas: 0 };
  const brutos = [];
  for (const q of (c.consultas || []).slice(0, 3)) {
    const usados = (consumoHoje.brave || 0) + (consumo.brave || 0);
    if (limiteBusca != null && usados >= limiteBusca) throw Object.assign(new Error('Limite diário da busca atingido (' + limiteBusca + ')'), { limite: true });
    consumo.brave = (consumo.brave || 0) + 1; out.consultas++;
    brutos.push(...await buscar(q + ' ' + c.uf_nome));
  }
  out.resultados = brutos.length;
  const porDom = new Map();
  for (const b of brutos) {
    const dom = dominioDe(b.url);
    const g = porDom.get(dom) || { dominio: dom, evid: [], site_nome: b.site_nome || '' };
    if (!g.evid.some((e) => e.url === b.url)) g.evid.push({ url: b.url.slice(0, 600), titulo: b.titulo, trecho: b.trecho, fonte: b.fonte });
    porDom.set(dom, g);
  }
  out.analisados = porDom.size;
  const salvar = [];
  for (const g of porDom.values()) {
    if (!/\.br$|\.com$|\.net$|\.adv\.br$/.test(g.dominio)) continue;   // busca no Brasil: domínio estrangeiro fica de fora
    const p = pontuar(g.evid);
    if (p.score < SALVAR_MIN) continue;
    salvar.push({ nome: nomeEmpresa(g.site_nome, g.dominio).slice(0, 160), dominio: g.dominio, site: 'https://' + g.dominio, segmento: c.segmento,
      especialidades: p.especialidades, score: p.score, score_detalhe: p.detalhe,
      evidencias: g.evid.map((e) => ({ ...e, termos: p.termos.filter((t) => (e.titulo + ' ' + e.trecho).toLowerCase().includes(t.toLowerCase())) })) });
  }
  salvar.sort((a, b) => b.score - a.score);
  const novos = [];
  for (const s of salvar) {
    const r = await rpc('dgeo_empresa_upsert', { p: s });
    if (r.bloqueada) continue;
    out.salvas++;
    if (r.novo) { out.novas++; novos.push({ ...s, id: r.id }); await rpc('dgeo_empresa_fonte', { p_id: r.id, p_fonte: 'brave', p_url: s.evidencias[0].url }).catch(() => null); }
    else out.duplicadas++;
  }
  await Promise.all(novos.slice(0, 6).map(async (n) => {
    try {
      const texto = n.evidencias.map((e) => e.titulo + ' ' + e.trecho).join(' ');
      let cnpj = acharCnpj(texto); let emails = [], fones = { whatsapp: [], tel: [] };
      if (ativas.site_institucional !== false) { try { const st = await lerSite(n.site, n.dominio, consumo); cnpj = cnpj || st.cnpj; emails = st.emails; fones = st.fones; } catch (e) { /* site fora do ar */ } }
      let d = null;
      if (cnpj && ativas.cnpj_receita !== false) { consumo.cnpj_receita = (consumo.cnpj_receita || 0) + 1; d = await consultarCnpj(cnpj); }
      const dados = d ? { ...d, segmento: d.segmento || c.segmento } : { uf: ufDoTexto(texto) || c.uf, segmento: c.segmento };
      const r = await rpc('dgeo_empresa_dados_br', { p_id: n.id, p: dados }).catch(() => null);
      if (d && r && r.ok) out.enriquecidas++;
      await salvarContatos(n.id, emails, fones);
    } catch (e) { /* site fora do ar ou cadastro indisponível: segue sem CNPJ */ }
  }));
  await rpc('dgeo_cobertura_marcar', { p_uf: c.uf, p_segmento: c.segmento, p_analisados: out.analisados, p_novas: out.novas });
  return out;
}

async function salvarContatos(id, emails, fones) {
  const r = { email: false, whatsapp: false };
  if (emails && emails[0]) r.email = !!((await rpc('dgeo_empresa_email', { p_id: id, p_email: emails[0], p_fonte: 'site' }).catch(() => null)) || {}).ok;
  const w = (fones && fones.whatsapp) || [], t = (fones && fones.tel) || [];
  for (const x of w) { if (((await rpc('dgeo_empresa_telefone', { p_id: id, p_tel: x, p_fonte: 'site_whatsapp' }).catch(() => null)) || {}).ok) { r.whatsapp = true; break; } }
  if (!r.whatsapp) for (const x of t) { if (((await rpc('dgeo_empresa_telefone', { p_id: id, p_tel: x, p_fonte: 'site_tel' }).catch(() => null)) || {}).ok) { r.whatsapp = true; break; } }
  if (!w.length && !t.length) await rpc('dgeo_empresa_telefone', { p_id: id, p_tel: '', p_fonte: 'site' }).catch(() => null);   // marca o site como lido
  return r;
}

// lê o site das empresas já descobertas para achar e-mail e WhatsApp (lotes de até 8, ~40 s)
async function completar() {
  const lista = await rpc('dgeo_para_completar', { lim: 8 });
  const consumo = {}; let emails = 0, whats = 0;
  await Promise.all((lista.itens || []).map(async (e) => {
    try {
      const st = await lerSite(e.site || ('https://' + e.dominio), e.dominio, consumo);
      const r = await salvarContatos(e.id, st.emails, st.fones);
      if (r.email) emails++; if (r.whatsapp) whats++;
    } catch (err) { /* site fora do ar: fica marcado como lido */ }
  }));
  return { ok: true, lidas: (lista.itens || []).length, emails, whatsapps: whats, restantes: lista.restantes, done: !lista.restantes || !(lista.itens || []).length };
}

async function rodada({ forcar = false, cron = false } = {}) {
  if (cron) {
    const pz = await rpc('dgeo_pausas', {}).catch(() => null);
    if (pz && pz.descoberta) return { ok: true, done: true, pausado: true };
  }
  const ex = await rpc('dgeo_execucao_abrir', { p_workflow: 'discovery', p_forcar: !!forcar });
  if (ex.ocupado) return { ok: true, done: false, ocupado: true, id: ex.id };
  if (ex.ja_concluida || ex.pausada) return { ok: true, done: true, execucao: ex };
  const t0 = Date.now();
  const lote = { analisados: 0, novas: 0, duplicadas: 0, enriquecidas: 0, combinacoes: [], erros: [], consumo: {} };
  const cfg = await rpc('dgeo_config', {});
  const ativas = Object.fromEntries((cfg.fontes || []).map((f) => [f.codigo, f.ativo]));
  const limiteBusca = ((cfg.fontes || []).find((f) => f.codigo === 'brave') || {}).limite_dia;
  let fim = false, causa = null;
  if (!process.env.BRAVE_SEARCH_KEY || ativas.brave === false) { fim = true; causa = 'Busca desligada ou sem a variável BRAVE_SEARCH_KEY na Vercel.'; }
  const restante = Math.max(0, ex.alvo - ex.analisados);
  if (!fim) {
    const plano = await rpc('dgeo_plano', { p_n: Math.max(1, cfg.combinacoes_max || 6) }) || [];
    if (!plano.length) { fim = true; causa = 'Todas as combinações estado × segmento ativas já foram pesquisadas hoje.'; }
    let i = 0;
    for (; i < plano.length; i++) {
      if (lote.analisados >= restante || Date.now() - t0 > TEMPO_LOTE_MS) break;
      const c = plano[i];
      try {
        const r = await processarCombo(c, ativas, lote.consumo, ex.consumo || {}, limiteBusca);
        lote.analisados += r.analisados; lote.novas += r.novas; lote.duplicadas += r.duplicadas; lote.enriquecidas += r.enriquecidas;
        lote.combinacoes.push(r);
      } catch (e) {
        lote.erros.push({ uf: c.uf, segmento: c.segmento, erro: String(e.message || e).slice(0, 200), em: new Date().toISOString() });
        if (e.limite) { fim = true; causa = String(e.message).slice(0, 200); break; }
      }
    }
    if (!fim && lote.analisados >= restante) fim = true;
    if (!fim && i >= plano.length && plano.length < (cfg.combinacoes_max || 6)) { fim = true; causa = `Combinações de hoje esgotadas: ${ex.analisados + lote.analisados} organizações analisadas de ${ex.alvo}.`; }
  }
  if (fim && !causa && ex.analisados + lote.analisados < ex.alvo) causa = `Volume real do dia: ${ex.analisados + lote.analisados} de ${ex.alvo}.`;
  const r = await rpc('dgeo_execucao_lote', { p_id: ex.id, p: lote, p_fim: fim, p_causa: causa });
  console.log(JSON.stringify({ evento: 'dgeo_rodada', id: ex.id, combinacoes: lote.combinacoes.length, analisados: lote.analisados, novas: lote.novas, erros: lote.erros.length, fim, ms: Date.now() - t0 }));
  return { ok: true, done: fim, execucao: { id: r.id, status: r.status, alvo: r.alvo, analisados: r.analisados, novas: r.novas, causa: r.causa }, lote: { ...lote, combinacoes: lote.combinacoes.length } };
}

// ------------------------------------------------------------------ ações (chamadas pelas rotas Next)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ultimaRodada = new Map();

// painel do ADM mestre: devolve { status, json }
export async function painelAcao(metodo, acao, q, b, eu) {
  try {
    if (metodo === 'GET') {
      if (acao === 'agentes_painel') return { status: 200, json: await rpc('dgeo_painel', {}) };
      if (acao === 'agentes_mensagens') return { status: 200, json: await rpc('dgeo_mensagens', { p: { status: String(q.status || '').slice(0, 20) } }) };
      if (acao === 'agentes_empresas') {
        const f = {}; for (const k of ['uf', 'segmento', 'produto', 'etapa', 'q', 'revisao', 'pagina', 'limite']) if (q[k] != null && q[k] !== '') f[k] = String(q[k]).slice(0, 80);
        return { status: 200, json: await rpc('dgeo_empresas', { p: f }) };
      }
      if (acao === 'agentes_empresa') {
        if (!UUID.test(String(q.id || ''))) return { status: 422, json: { erro: 'Empresa inválida.' } };
        return { status: 200, json: (await rpc('dgeo_empresa', { p_id: q.id })) || {} };
      }
      return { status: 404, json: { erro: 'Ação desconhecida.' } };
    }
    if (acao === 'agentes_acao') {
      if (!UUID.test(String(b.id || ''))) return { status: 422, json: { erro: 'Empresa inválida.' } };
      return { status: 200, json: await rpc('dgeo_empresa_acao', { p_id: b.id, p: { acao: String(b.acao || ''), etapa: b.etapa, produto: b.produto, notas: b.notas }, p_por: eu }) };
    }
    if (acao === 'agentes_whatsapp_enviado' || acao === 'agentes_cancelar_msg') {
      if (!/^\d{1,12}$/.test(String(b.id || ''))) return { status: 422, json: { erro: 'Mensagem inválida.' } };
      return { status: 200, json: await rpc(acao === 'agentes_cancelar_msg' ? 'dgeo_mensagem_cancelar' : 'dgeo_whatsapp_enviado', { p_id: Number(b.id), p_por: eu }) };
    }
    if (acao === 'agentes_flag') return { status: 200, json: await rpc('dgeo_flag', { p_chave: String(b.chave || ''), p_valor: String(b.valor ?? ''), p_por: eu }) };
    if (acao === 'agentes_config') return { status: 200, json: await rpc('dgeo_config_salvar', { p: { ufs: b.ufs, segmentos: b.segmentos, fontes: b.fontes }, p_por: eu }) };
    if (acao === 'agentes_contatos') return { status: 200, json: await completar() };
    if (acao === 'agentes_rodada') {
      const t = ultimaRodada.get(eu) || 0;
      if (Date.now() - t < 20_000) return { status: 429, json: { erro: 'Aguarde alguns segundos antes de rodar de novo.' } };
      ultimaRodada.set(eu, Date.now());
      return { status: 200, json: await rodada({ forcar: !!b.forcar }) };
    }
    return { status: 404, json: { erro: 'Ação desconhecida.' } };
  } catch (e) {
    console.error('agentes dgeo:', e.message);
    return { status: e.status || 500, json: { erro: e.message || 'Erro nos agentes' } };
  }
}

// n8n (cabeçalho x-dgeo-key)
export async function n8nAcao(chave, acao, b) {
  if (!chaveOk(chave)) return { status: 401, json: { erro: 'Não autorizado' } };
  try {
    if (acao === 'agentes_rodada') return { status: 200, json: await rodada({ cron: true, forcar: !!(b && b.forcar) }) };
    if (acao === 'agentes_contatos') return { status: 200, json: await completar() };
    return { status: 404, json: { erro: 'Ação desconhecida.' } };
  } catch (e) { console.error('agentes dgeo n8n:', e.message); return { status: e.status || 500, json: { erro: e.message } }; }
}

// página pública de descadastro
const PAGINA = (titulo, texto) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${titulo}</title><style>body{font-family:Arial,sans-serif;background:#f1f5f9;color:#0f172a;margin:0;padding:40px 16px}main{max-width:520px;margin:0 auto;background:#fff;border:1px solid #cbd5e1;border-radius:10px;padding:28px}h1{font-size:21px;margin:0 0 12px;color:#0f766e}p{line-height:1.5}</style></head>
<body><main><h1>${titulo}</h1><p>${texto}</p><p style="color:#475569;font-size:14px">DataGeo Digital · contato@datageodigital.com.br</p></main></body></html>`;
export async function descadastroHtml(t) {
  t = String(t || '');
  if (!/^[0-9a-f]{32}$/.test(t)) return { status: 400, html: PAGINA('Link inválido', 'Este link de descadastro não é válido. Se quiser, responda o e-mail pedindo a remoção e nós tiramos o seu contato da lista.') };
  try {
    const r = await rpc('dgeo_descadastrar', { p_token: t });
    if (!r || !r.ok) return { status: 404, html: PAGINA('Link não encontrado', 'Não encontramos este link. Responda o e-mail pedindo a remoção e nós tiramos o seu contato da lista.') };
    return { status: 200, html: PAGINA('Pronto, descadastrado', 'Você não vai receber mais nenhuma mensagem da DataGeo Digital neste endereço nem em outros endereços da sua empresa.') };
  } catch (e) { console.error('descadastro dgeo:', e.message); return { status: 500, html: PAGINA('Não deu certo agora', 'Tente de novo em alguns minutos ou responda o e-mail pedindo a remoção.') }; }
}

export { pontuar, excluido, dominioDe, cnpjValido, acharCnpj, segmentoDoCnae, urlSegura, ipPrivado, emailsDoHtml, telefonesDoHtml, rodada, completar, resolver };
