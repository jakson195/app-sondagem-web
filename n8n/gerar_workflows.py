#!/usr/bin/env python3
"""Gera os workflows importáveis do n8n dos agentes comerciais da DataGeo (n8n/workflows/DG-*.json).
Rode de novo depois de editar os prompts:  python n8n/gerar_workflows.py
Credenciais no n8n (criar uma vez; depois de importar, selecionar nos nós que pedirem):
  "DataGeo chave"  Header Auth — nome x-dgeo-key, valor = DGEO_AGENTES_KEY da Vercel
  "Anthropic API"  Header Auth — nome x-api-key (já existe no n8n, usada pelo ERTimg)
  "Conta SMTP"     Gmail jaksonn@gmail.com (já existe; a mesma do ERTimg)
  "IMAP ERTimg"    IMAP do Gmail jaksonn@gmail.com (já existe; o filtro "DataGeo" no assunto separa as respostas)
O n8n fala com o banco só pelas funções dgeo_n8n_* do Supabase, que exigem a chave x-dgeo-key.
Todos os workflows são importados DESATIVADOS.
"""
import json, os, uuid

AQUI = os.path.dirname(os.path.abspath(__file__))
P = lambda n: open(os.path.join(AQUI, 'prompts', n), encoding='utf-8').read().strip()
OUT = os.path.join(AQUI, 'workflows'); os.makedirs(OUT, exist_ok=True)

SITE = 'https://www.datageodigital.com.br'
SB = 'https://kkkvdykwojgkalwboqrk.supabase.co'
SB_PUB = 'sb_publishable_EQo4Dq6dXNUqGORm27w9GA_sPzdrV_n'   # chave publicável (pública por natureza; a proteção é a x-dgeo-key)
EMAIL_DE = 'jaksonn@gmail.com'   # Gmail (a caixa @datageodigital ainda não existe)
MODELO = "'claude-sonnet-5-5'"
CRED_DG = {'httpHeaderAuth': {'name': 'DataGeo chave'}}
CRED_IA = {'httpHeaderAuth': {'id': '2ZaUCiMyO6V8keQB', 'name': 'Anthropic API'}}

class WF:
    def __init__(self, nome, nota):
        self.nome, self.nodes, self.con, self.x = nome, [], {}, 0
        self.add('n8n-nodes-base.stickyNote', 'Leia-me', {'content': nota, 'height': 380, 'width': 460}, 1, pos=(-560, -240))
    def add(self, tipo, nome, params, v, pos=None, extra=None):
        if pos is None: pos = (self.x, 0); self.x += 240
        n = {'parameters': params, 'id': str(uuid.uuid4()), 'name': nome, 'type': tipo, 'typeVersion': v, 'position': list(pos)}
        if extra: n.update(extra)
        self.nodes.append(n); return nome
    def liga(self, a, b, saida=0):
        o = self.con.setdefault(a, {'main': []})['main']
        while len(o) <= saida: o.append([])
        o[saida].append({'node': b, 'type': 'main', 'index': 0})
    def cadeia(self, *nomes):
        for a, b in zip(nomes, nomes[1:]): self.liga(a, b)
    def salvar(self, arq):
        d = {'name': self.nome, 'nodes': self.nodes, 'connections': self.con, 'active': False,
             'settings': {'executionOrder': 'v1', 'timezone': 'America/Sao_Paulo'}, 'tags': []}
        json.dump(d, open(os.path.join(OUT, arq), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
        print('ok', arq, len(self.nodes), 'nós')

def agenda(w, nome, cron):
    return w.add('n8n-nodes-base.scheduleTrigger', nome, {'rule': {'interval': [{'field': 'cronExpression', 'expression': cron}]}}, 1.2)

def app(w, nome, acao):
    return w.add('n8n-nodes-base.httpRequest', nome, {'method': 'POST', 'url': f'{SITE}/api/agentes/n8n?acao={acao}',
        'authentication': 'genericCredentialType', 'genericAuthType': 'httpHeaderAuth', 'sendBody': True, 'specifyBody': 'json',
        'jsonBody': '{}', 'options': {'timeout': 60000}}, 4.2, None, {'onError': 'continueRegularOutput', 'credentials': CRED_DG})

def rpc(w, nome, fn, args_js='{}', pos=None, extra=None):
    """Chama public.<fn> no Supabase dos agentes (PostgREST), com a chave x-dgeo-key da credencial."""
    e = {'credentials': CRED_DG}; e.update(extra or {})
    return w.add('n8n-nodes-base.httpRequest', nome, {'method': 'POST', 'url': f'{SB}/rest/v1/rpc/{fn}',
        'authentication': 'genericCredentialType', 'genericAuthType': 'httpHeaderAuth',
        'sendHeaders': True, 'headerParameters': {'parameters': [{'name': 'apikey', 'value': SB_PUB}]},
        'sendBody': True, 'specifyBody': 'json', 'jsonBody': '={{ JSON.stringify(' + args_js + ') }}', 'options': {'timeout': 60000}}, 4.2, pos, e)

def code(w, nome, js, cada=True, pos=None):
    p = {'jsCode': js}
    if cada: p['mode'] = 'runOnceForEachItem'
    return w.add('n8n-nodes-base.code', nome, p, 2, pos)

def so_itens(w, nome='Só itens válidos'):
    return code(w, nome, "return $input.all().filter(i => i.json && (i.json.id !== undefined && i.json.id !== null));", cada=False)

def anthropic(w, nome='IA (Anthropic)'):
    return w.add('n8n-nodes-base.httpRequest', nome, {'method': 'POST', 'url': 'https://api.anthropic.com/v1/messages',
        'authentication': 'genericCredentialType', 'genericAuthType': 'httpHeaderAuth',
        'sendHeaders': True, 'headerParameters': {'parameters': [{'name': 'anthropic-version', 'value': '2023-06-01'}]},
        'sendBody': True, 'specifyBody': 'json', 'jsonBody': '={{ JSON.stringify($json.req) }}',
        'options': {'timeout': 60000, 'response': {'response': {'neverError': True}}}}, 4.2, None,
        {'credentials': CRED_IA, 'retryOnFail': True, 'maxTries': 2, 'waitBetweenTries': 5000})

LER_JSON = r"""// Lê a resposta da IA e garante JSON válido; erros voltam como {erro} para o banco liberar o item
const orig = $('%s').item.json;
if ($json.type === 'error' || $json.error) {
  return { json: { id: orig.id, r: { erro: 'IA: ' + String(($json.error && ($json.error.message || $json.error.type)) || 'erro').slice(0, 300) } } };
}
const txt = ($json.content || []).map(c => c.text || '').join('');
let r;
try { r = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1)); }
catch (e) { r = { erro: 'resposta_invalida_da_ia (stop=' + ($json.stop_reason || '?') + ', ' + txt.length + ' chars): ' + txt.slice(0, 160) }; }
%s
return { json: { id: orig.id, r } };"""

# ========== DG-01 Prospector ==========
w = WF('DataGeo 01 · Prospector (dias úteis)', """## Agente 1 · Prospector
Dias úteis às 8h41: o app busca empresas no Brave (meta diária e combinações UF × segmento definidas em /adm/agentes)
e depois lê o site das novas para guardar e-mail/telefone públicos. **Não envia nada a ninguém.**
Credencial: DataGeo chave. Resultado em /adm/agentes → Rodadas de descoberta.""")
ag = agenda(w, 'Dias úteis 8h41', '41 8 * * 1-5')
r1 = app(w, 'Rodada de descoberta', 'agentes_rodada')
pz = w.add('n8n-nodes-base.wait', 'Pausa 30s', {'amount': 30}, 1.1)
r2 = app(w, 'Completar contatos', 'agentes_contatos')
w.cadeia(ag, r1, pz, r2)
w.salvar('DG-01-prospector.json')

# ========== DG-02 Analista IA ==========
w = WF('DataGeo 02 · Analista IA (nota 0–100)', """## Agente 2 · Analista (IA)
Dias úteis às 9h17, 13h17 e 17h17 pega até 20 empresas ainda sem nota (teto diário ia_max_dia, no painel) e pede à IA
a nota por critérios: aderência 35 · evidência de serviço 25 · recorrência 15 · segmento 10 · canal comercial 10 · qualidade 5.
O BANCO valida o JSON e soma a nota; URLs fora das evidências são descartadas; confiança baixa → revisão.
O **agente 3** roda dentro do banco: nota ≥ mínimo do painel + confiança média/alta + CNPJ ATIVO → aprovado para contato.
**Não envia nada a ninguém.**""")
ag = agenda(w, 'Dias úteis 9h17, 13h17, 17h17', '17 9,13,17 * * 1-5')
q = rpc(w, 'Empresas sem nota', 'dgeo_n8n_empresas', '{ lim: 20 }')
fi = so_itens(w)
mp = code(w, 'Montar prompt', 'const SIS = ' + json.dumps(P('qualificacao.md'), ensure_ascii=False) + ';\n' + r"""const emp = { nome: $json.nome, dominio: $json.dominio, uf: $json.uf, cidade: $json.cidade, segmento: $json.segmento_nome || $json.segmento,
  cnae: $json.cnae, cnae_descricao: $json.cnae_descricao, cnaes_secundarios: $json.cnaes_secundarios, natureza_juridica: $json.natureza_juridica,
  porte: $json.porte, situacao_cadastral: $json.situacao_cadastral, tem_contato_no_cadastro: $json.tem_contato_cadastro, especialidades: $json.especialidades, nota_regras: $json.score };
const req = { model: """ + MODELO + r""", max_tokens: 1400, system: SIS,
  messages: [{ role: 'user', content: `<empresa>${JSON.stringify(emp)}</empresa>\n<evidencias>\n${JSON.stringify($json.evidencias || [])}\n</evidencias>` }] };
return { json: { id: $json.id, req } };""")
ia = anthropic(w)
lj = code(w, 'Ler resposta', LER_JSON % ('Montar prompt', ''))
sv = rpc(w, 'Salvar nota', 'dgeo_n8n_qualificar', '{ p_id: $json.id, r: $json.r }', extra={'onError': 'continueRegularOutput'})
w.cadeia(ag, q, fi, mp, ia, lj, sv)
w.salvar('DG-02-analista-ia.json')

# ========== DG-03 Redação ==========
w = WF('DataGeo 03 · Redação dos contatos', """## Agente 4 · Contato — redação
Dias úteis às 9h47, 13h47 e 17h47 pega até 10 empresas APROVADAS ainda sem mensagem e pede à IA:
1º e-mail + lembrete (só se a empresa publica e-mail no próprio domínio e a chave "Contato" está ligada) e o texto do WhatsApp.
Com "Revisar antes de enviar" ligado no painel (padrão), o e-mail fica **aguardando o seu Aprovar** em /adm/agentes → E-mails e fila.
WhatsApp sempre fica como rascunho para o seu 1 clique. O banco recusa textos com preço, % ou desconto.
**Este workflow não envia nada.**""")
ag = agenda(w, 'Dias úteis 9h47, 13h47, 17h47', '47 9,13,17 * * 1-5')
q = rpc(w, 'Aprovadas sem mensagem', 'dgeo_n8n_para_redigir', '{ lim: 10 }')
fi = so_itens(w)
mp = code(w, 'Montar prompt', 'const FATOS = ' + json.dumps(P('fatos-produto.md'), ensure_ascii=False) + ';\nconst SIS = ' + json.dumps(P('redacao.md'), ensure_ascii=False) + ';\n' + r"""const emp = { nome: $json.nome, dominio: $json.dominio, uf: $json.uf, cidade: $json.cidade, segmento: $json.segmento };
const req = { model: """ + MODELO + r""", max_tokens: 1800, system: SIS,
  messages: [{ role: 'user', content: `<fatos_produto>\n${FATOS}\n</fatos_produto>\n<empresa>${JSON.stringify(emp)}</empresa>\n<produto>${$json.produto}</produto>\n<resumo>${$json.resumo || ''}</resumo>\n<abordagem>${$json.abordagem || ''}</abordagem>\n<evidencias>\n${JSON.stringify($json.evidencias || [])}\n</evidencias>\n<tem_email>${!!$json.tem_email}</tem_email>\n<tem_whatsapp>${!!$json.tem_whatsapp}</tem_whatsapp>` }] };
return { json: { id: $json.id, req } };""")
ia = anthropic(w)
lj = code(w, 'Ler resposta', LER_JSON % ('Montar prompt', r"""// o assunto precisa ter "DataGeo" (é por ele que o workflow 05 reconhece as respostas)
if (r && !r.erro && r.assunto && !/datageo/i.test(r.assunto)) { r.assunto = r.assunto + ' | DataGeo'; if (r.lembrete_assunto) r.lembrete_assunto = 'Re: ' + r.assunto; }"""))
sv = rpc(w, 'Salvar mensagens', 'dgeo_n8n_salvar_mensagem', '{ p_id: $json.id, r: $json.r }', extra={'onError': 'continueRegularOutput'})
w.cadeia(ag, q, fi, mp, ia, lj, sv)
w.salvar('DG-03-redacao.json')

# ========== DG-04 Envio ==========
w = WF('DataGeo 04 · Envio de e-mail (fila)', """## Agente 4 · Contato — envio
Dias úteis de hora em hora (8h10–17h10): pega SÓ e-mails na fila (dgeo_n8n_fila_envio), que já respeita:
chave "Contato" ligada, limite diário do painel, 2 por rodada, descadastro, empresa que respondeu, lembrete só 7 dias após o 1º.
Com "Revisar antes de enviar" ligado, só entram na fila os que você aprovou.
Envia pelo Gmail jaksonn@gmail.com (credencial Conta SMTP); o rodapé com o link de descadastro vem pronto do banco.""")
ag = agenda(w, 'Dias úteis de hora em hora', '10 8-17 * * 1-5')
q = rpc(w, 'Fila de envio', 'dgeo_n8n_fila_envio', '{}')
fi = so_itens(w)
em = w.add('n8n-nodes-base.emailSend', 'Enviar', {'fromEmail': EMAIL_DE, 'toEmail': '={{$json.para}}', 'subject': '={{$json.assunto}}',
           'emailFormat': 'text', 'text': '={{$json.corpo}}', 'options': {'appendAttribution': False, 'replyTo': EMAIL_DE}}, 2.1, None,
           {'credentials': {'smtp': {'id': 'tBaIpCjPDPIgqIfN', 'name': 'Conta SMTP'}}, 'onError': 'continueErrorOutput'})
ok = rpc(w, 'Resultado: enviado', 'dgeo_n8n_envio_resultado', "{ p_id: $('Só itens válidos').item.json.id, p_ok: true }")
er = rpc(w, 'Resultado: erro', 'dgeo_n8n_envio_resultado', "{ p_id: $('Só itens válidos').item.json.id, p_ok: false, p_erro: String(($json.error && $json.error.message) || 'falha SMTP').slice(0, 300) }", (960, 200))
w.cadeia(ag, q, fi, em); w.liga(em, ok, 0); w.liga(em, er, 1)
w.salvar('DG-04-envio-email.json')

# ========== DG-05 Respostas ==========
w = WF('DataGeo 05 · Respostas e descadastros', """## Agente 4 · Contato — respostas
Lê só e-mails NOVOS com "DataGeo" no assunto (todas as mensagens levam DataGeo no assunto e as respostas mantêm o "Re:"),
sem marcar como lido nem mover. Quem responde sai da fila (lembrete cancelado) e vai para a etapa RESPONDEU;
pedido de descadastro (não quero, remover, unsubscribe…) descadastra o domínio na hora. Você responde pessoalmente.""")
im = w.add('n8n-nodes-base.emailReadImap', 'Nova resposta', {'mailbox': 'INBOX', 'postProcessAction': 'nothing',
           'options': {'customEmailConfig': '["UNSEEN", ["SUBJECT", "DataGeo"]]'}}, 2, None, {'credentials': {'imap': {'id': 'J7jjJkYouaiQOagj', 'name': 'IMAP ERTimg'}}})
cl = code(w, 'Remetente e texto', r"""const de = String($json.from || '').match(/[^<\s]+@[^>\s]+/);
const txt = String($json.textPlain || $json.text || '').split(/\n>|\nEm .* escreveu:|\nOn .* wrote:/)[0].slice(0, 2000);
return { json: { de: de ? de[0].toLowerCase() : '', texto: (String($json.subject || '') + '\n' + txt).slice(0, 2300) } };""")
rs = rpc(w, 'Registrar resposta', 'dgeo_n8n_resposta', '{ p_de: $json.de, p_texto: $json.texto }')
w.cadeia(im, cl, rs)
w.salvar('DG-05-respostas.json')
