-- DataGeo · Agente 4 — "revisar antes de enviar" (modo misto)
-- envio_revisao = 'true' (padrão): os e-mails escritos pela IA ficam como RASCUNHO e só entram na fila
-- depois do clique "Aprovar" em /adm/agentes → E-mails e fila. Desligando a chave no painel, passam a ir direto para a fila.

insert into dgeo.config values ('envio_revisao','true') on conflict (chave) do nothing;

-- 1) chave liberada no painel
create or replace function public.dgeo_flag(p_chave text, p_valor text, p_por text)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
declare v text; antes text;
begin
  perform dgeo.exige_chave();
  if p_chave in ('growth_enabled','auto_discovery','auto_qualification','auto_approval','auto_outreach','envio_revisao') then
    if p_valor not in ('true','false') then raise exception 'Valor inválido' using errcode='22023'; end if; v := p_valor;
  elsif p_chave='daily_target' and p_valor ~ '^\d+$' then v := least(200, greatest(1, p_valor::int))::text;
  elsif p_chave='ia_max_dia' and p_valor ~ '^\d+$' then v := least(300, greatest(0, p_valor::int))::text;
  elsif p_chave='combinacoes_max' and p_valor ~ '^\d+$' then v := least(20, greatest(1, p_valor::int))::text;
  elsif p_chave='min_auto_approval_score' and p_valor ~ '^\d+$' then v := least(100, greatest(50, p_valor::int))::text;
  elsif p_chave='limite_envio_dia' and p_valor ~ '^\d+$' then v := least(30, greatest(0, p_valor::int))::text;
  else raise exception 'Configuração não permitida: %', p_chave using errcode='22023';
  end if;
  antes := dgeo.cfg(p_chave, null);
  insert into dgeo.config values (p_chave, v) on conflict (chave) do update set valor=excluded.valor;
  insert into dgeo.auditoria(entidade,entidade_id,acao,de,para,por) values ('config',p_chave,'alterada',to_jsonb(antes),to_jsonb(v),coalesce(dgeo.limpa(p_por,120),'admin'));
  return public.dgeo_config();
end $function$;

-- 2) painel recebe o valor da chave
create or replace function public.dgeo_config()
 returns jsonb language plpgsql stable security definer set search_path to '' as $function$
begin
  perform dgeo.exige_chave();
  return jsonb_build_object(
    'growth_enabled', dgeo.cfg('growth_enabled','true')='true', 'daily_target', dgeo.cfg('daily_target','30')::int,
    'ia_max_dia', dgeo.cfg('ia_max_dia','60')::int, 'combinacoes_max', dgeo.cfg('combinacoes_max','6')::int,
    'auto_discovery', dgeo.cfg('auto_discovery','true')='true', 'auto_qualification', dgeo.cfg('auto_qualification','true')='true',
    'auto_approval', dgeo.cfg('auto_approval','true')='true', 'auto_outreach', dgeo.cfg('auto_outreach','false')='true',
    'envio_revisao', dgeo.cfg('envio_revisao','true')='true',
    'limite_envio_dia', dgeo.cfg('limite_envio_dia','12')::int, 'lembrete_dias', dgeo.cfg('lembrete_dias','7')::int,
    'min_auto_approval_score', dgeo.cfg('min_auto_approval_score','70')::int,
    'ufs', (select jsonb_agg(to_jsonb(u) - 'updated_at' order by u.peso desc, u.uf) from dgeo.ufs u),
    'segmentos', (select jsonb_agg(to_jsonb(s) - 'updated_at' order by s.ordem) from dgeo.segmentos s),
    'fontes', (select jsonb_agg(to_jsonb(f) - 'updated_at' order by f.codigo) from dgeo.fontes f));
end $function$;

-- 3) a IA salva como rascunho quando a revisão está ligada
create or replace function public.dgeo_n8n_salvar_mensagem(p_id uuid, r jsonb)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
declare e dgeo.empresas; para text; tel text; n int := 0;
  rev boolean := dgeo.cfg('envio_revisao','true')='true';
  a1 text := dgeo.limpa(r->>'assunto',140); c1 text := dgeo.limpa(r->>'corpo',3000);
  a2 text := dgeo.limpa(r->>'lembrete_assunto',140); c2 text := dgeo.limpa(r->>'lembrete_corpo',2000); wa text := dgeo.limpa(r->>'whatsapp',700);
  proibido text := '(R\$|\d+\s*%|descont|promo[cç][aã]o|gr[aá]tis para sempre|garantid)';
begin
  perform dgeo.exige_chave();
  select * into e from dgeo.empresas where id=p_id;
  if e.id is null or not dgeo.pode_contatar_base(e) then return jsonb_build_object('ok',false,'motivo','nao_pode_contatar'); end if;
  if r ? 'erro' then
    insert into dgeo.auditoria(entidade,entidade_id,acao,para,por) values ('empresa',p_id::text,'redacao_falhou',jsonb_build_object('erro',r->>'erro'),'agente_contato');
    return jsonb_build_object('ok',false,'motivo','texto_invalido');
  end if;
  if (coalesce(a1,'')||' '||coalesce(c1,'')||' '||coalesce(a2,'')||' '||coalesce(c2,'')||' '||coalesce(wa,'')) ~* proibido then
    insert into dgeo.auditoria(entidade,entidade_id,acao,para,por) values ('empresa',p_id::text,'redacao_recusada',jsonb_build_object('motivo','preço/desconto no texto','assunto',a1),'agente_contato');
    return jsonb_build_object('ok',false,'motivo','preco_no_texto');
  end if;
  para := dgeo.email_valido(e);
  if dgeo.pode_contatar(e) and dgeo.cfg('auto_outreach','false')='true' and a1 is not null and c1 is not null then
    insert into dgeo.mensagens(empresa_id,tipo,para,assunto,corpo,enviar_apos,status)
      values (p_id,'primeiro',para,a1,c1,now(), case when rev then 'rascunho' else 'agendado' end) on conflict do nothing;
    if a2 is not null and c2 is not null then
      insert into dgeo.mensagens(empresa_id,tipo,para,assunto,corpo,enviar_apos,status)
        values (p_id,'lembrete',para,a2,c2,now() + make_interval(days => dgeo.cfg('lembrete_dias','7')::int), case when rev then 'rascunho' else 'agendado' end) on conflict do nothing;
    end if;
    n := n + 1;
  end if;
  tel := dgeo.telefone_valido(e);
  if tel is not null and wa is not null then
    insert into dgeo.mensagens(empresa_id,tipo,para,assunto,corpo,status) values (p_id,'whatsapp',tel,'WhatsApp',
      wa || E'\n\n(Se preferir não receber mensagens nossas, é só responder SAIR.)','rascunho') on conflict do nothing;
    n := n + 1;
  end if;
  return jsonb_build_object('ok', n > 0, 'revisao', rev);
end $function$;

-- 4) clique "Aprovar": o 1º e-mail entra na fila agora; o lembrete, N dias depois
create or replace function public.dgeo_mensagem_aprovar(p_id bigint, p_por text)
 returns jsonb language plpgsql security definer set search_path to '' as $function$
declare m dgeo.mensagens; e dgeo.empresas;
begin
  perform dgeo.exige_chave();
  select * into m from dgeo.mensagens where id=p_id and tipo='primeiro' and status='rascunho';
  if m.id is null then return jsonb_build_object('ok',false,'motivo','nao_e_rascunho'); end if;
  select * into e from dgeo.empresas where id=m.empresa_id;
  if not dgeo.pode_contatar(e) then return jsonb_build_object('ok',false,'motivo','empresa_nao_pode_ser_contatada'); end if;
  update dgeo.mensagens set status='agendado', enviar_apos=now() where id=m.id;
  update dgeo.mensagens set status='agendado', enviar_apos=now() + make_interval(days => dgeo.cfg('lembrete_dias','7')::int)
   where empresa_id=m.empresa_id and tipo='lembrete' and status='rascunho';
  insert into dgeo.auditoria(entidade,entidade_id,acao,por) values ('mensagem',p_id::text,'aprovada',coalesce(dgeo.limpa(p_por,120),'admin'));
  return jsonb_build_object('ok',true);
end $function$;
grant execute on function public.dgeo_mensagem_aprovar(bigint, text) to anon, authenticated;

-- 5) "E-mails e fila" mostra quantos aguardam aprovação
create or replace function public.dgeo_mensagens(p jsonb default '{}'::jsonb)
 returns jsonb language plpgsql stable security definer set search_path to '' as $function$
declare hoje timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
  perform dgeo.exige_chave();
  return jsonb_build_object(
    'enviados_hoje', (select count(*) from dgeo.mensagens where tipo<>'whatsapp' and status='enviado' and enviado_at >= hoje),
    'whatsapp_hoje', (select count(*) from dgeo.mensagens where tipo='whatsapp' and status='enviado' and enviado_at >= hoje),
    'limite_dia', dgeo.cfg('limite_envio_dia','12')::int,
    'envio_revisao', dgeo.cfg('envio_revisao','true')='true',
    'para_aprovar', (select count(*) from dgeo.mensagens where tipo='primeiro' and status='rascunho'),
    'agendados', (select count(*) from dgeo.mensagens where tipo<>'whatsapp' and status='agendado'),
    'enviados', (select count(*) from dgeo.mensagens where status='enviado'),
    'respostas', (select count(*) from dgeo.empresas where etapa_manual in ('RESPONDEU','TESTE_INICIADO','ASSINANTE')),
    'descadastros', (select count(*) from dgeo.descadastros),
    'aprovadas_sem_email', (select count(*) from dgeo.empresas e where e.aprovada_at is not null and e.status not in ('descartada','bloqueada') and dgeo.email_valido(e) is null and dgeo.telefone_valido(e) is null),
    'sem_leitura_site', (select count(*) from dgeo.empresas where contatos_lidos_at is null and status not in ('descartada','bloqueada')),
    'whatsapp', (select coalesce(jsonb_agg(x order by x.score_ia desc nulls last),'[]') from (
       select m.id, m.empresa_id, e.nome, e.dominio, e.uf, e.score_ia, e.produto_indicado produto, m.para, m.corpo
         from dgeo.mensagens m join dgeo.empresas e on e.id=m.empresa_id
        where m.tipo='whatsapp' and m.status='rascunho' and dgeo.pode_contatar_base(e) limit 50) x),
    'itens', (select coalesce(jsonb_agg(x order by x.ordem desc),'[]') from (
       select m.id, m.empresa_id, e.nome, e.dominio, m.tipo, m.para, m.assunto, m.corpo, m.status, m.erro, m.cancelado_motivo, m.enviar_apos, m.enviado_at,
              coalesce(m.enviado_at, m.enviar_apos) ordem
         from dgeo.mensagens m join dgeo.empresas e on e.id=m.empresa_id
        where (m.tipo<>'whatsapp' or m.status<>'rascunho') and (coalesce(p->>'status','')='' or m.status=p->>'status')
        order by coalesce(m.enviado_at, m.enviar_apos) desc limit 100) x));
end $function$;
