# Estudo de viabilidade preliminar de loteamento

Módulo independente do gerador urbanístico. Lê o projeto CAD já existente e produz um **ESTUDO DE VIABILIDADE PRELIMINAR** (não é orçamento executivo).

## Como abrir a partir do CAD

1. Gere o loteamento na aba **Loteamento** do Ambiente CAD (`/cad`).
2. Clique em **Estudo de viabilidade**.
3. Se o desenho já estiver salvo na nuvem, o app abre `/viabilidade/[projetoId]`.
4. Se ainda não houver `projetoId`, abre `/viabilidade/local` com extração em memória (sem persistir). Salve o CAD para gravar versões.

Menu: **Estudo de viabilidade** (`/viabilidade`).

## Fluxo

Projeto de loteamento → extração de quantitativos → parâmetros urbanísticos → estimativa de infraestrutura → SINAPI/SICRO → custo total → receita → lucro → margem → ROI → relatório.

O adapter `src/lib/viabilidade/project-adapter.ts` apenas **lê** as camadas:

- `LOTEAMENTO_LOTES`, `LOTEAMENTO_VIAS`, `LOTEAMENTO_CALCADAS`, `LOTEAMENTO_EIXOS`
- `AREA_APP`, `AREA_RESERVA_LEGAL`, `AREA_UTIL`
- drenagem (`DRENAGEM_*`) quando existir
- TIN / corte-aterro quando houver terreno + platô/greide (não inventa volume)

## Preços

Prioridade: **SINAPI → SICRO → parâmetro cadastrado → valor manual**. Terraplenagem prioriza SICRO. Nenhum preço é hardcoded. Competência indisponível **não** é substituída por outra.

Sincronize a tabela oficial em `POST /api/viabilidade/sinapi/sync` `{ uf, competencia?, tipo: desonerado|nao }`. A UI **Atualizar SINAPI** percorre as **27 UFs** da mesma competência (progresso `Sincronizando AM… 3/27`). O cálculo do estudo continua usando só a UF selecionada. Competências antigas nunca são apagadas; competência ausente **não** é trocada por outro mês.

Se a Caixa bloquear o download, a API devolve o erro e o XLSX/CSV manual (`POST /api/viabilidade/sinapi/import`) permanece como fallback.

## APIs (autenticadas)

| Método | Rota |
| --- | --- |
| GET | `/api/viabilidade?projetoId=` |
| POST | `/api/viabilidade` |
| GET/PUT/DELETE | `/api/viabilidade/:id` |
| POST | `/api/viabilidade/:id/calcular` |
| POST | `/api/viabilidade/:id/quantitativos` |
| POST | `/api/viabilidade/:id/custos` |
| POST | `/api/viabilidade/:id/simulacao` |
| GET | `/api/viabilidade/:id/relatorio` |
| POST | `/api/viabilidade/preview` (local, sem persistir) |
| POST | `/api/viabilidade/sinapi/import` |
| POST/GET | `/api/viabilidade/sinapi/sync` |
| GET | `/api/viabilidade/sinapi/search` |
| GET | `/api/viabilidade/sicro/search` |

Cálculos financeiros usam `Decimal` no backend (`src/lib/viabilidade/money.ts`).

## Prisma

Modelos: `Viabilidade` (com `versao` e `premissas`), `ViabilidadeItem`, `ViabilidadeQuantitativo`, `SinapiComposicao`, `SicroComposicao`, `ViabilidadeParametro`, `ViabilidadeValidacao`.

Migration: `prisma/migrations/20260909140000_viabilidade_loteamento`.

```bash
cd app-web
npx prisma migrate dev --name viabilidade_loteamento
npx prisma generate
```

Se o Postgres estiver indisponível, o schema permanece válido; aplique a migration depois.

**Estado atual (dev):** o SQL da migration foi aplicado no Neon (`CREATE TABLE` idempotente). `prisma migrate deploy` **não** registra esta migration porque o histórico local e `_prisma_migrations` divergem (migration remota `20250604120000_rtk_validation_module` não está na pasta local; várias migrations locais ainda constam como pendentes). `prisma generate` pode falhar com `EPERM` no Windows se o `query_engine-windows.dll.node` estiver em uso pelo `next dev`.

## Testes

```bash
cd app-web
npm run test:viabilidade
```

## Avisos (sempre exibidos)

- Este estudo possui caráter preliminar e foi elaborado para análise de viabilidade econômica do empreendimento.
- Os quantitativos de infraestrutura que não possuem projeto executivo são estimativos.
- Os valores de referência devem ser atualizados conforme a competência selecionada.
- O estudo não substitui projetos executivos, orçamento analítico, estudos ambientais, análise das concessionárias ou aprovação dos órgãos competentes.
