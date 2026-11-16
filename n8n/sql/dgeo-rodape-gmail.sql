-- DataGeo: rodapé dos e-mails passa a mostrar jaksonn@gmail.com (a caixa @datageodigital.com.br ainda não existe). Aplicado em 16/11/2026.
do $$
declare d text := pg_get_functiondef('public.dgeo_n8n_fila_envio()'::regprocedure);
begin
  if position('contato@datageodigital.com.br' in d) = 0 then raise exception 'texto do rodapé não encontrado'; end if;
  execute replace(d, 'contato@datageodigital.com.br', 'jaksonn@gmail.com');
end $$;
