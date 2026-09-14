-- Estudo de viabilidade preliminar de loteamento

CREATE TABLE "Viabilidade" (
    "id" TEXT NOT NULL,
    "projetoId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "uf" TEXT NOT NULL,
    "municipio" TEXT,
    "competenciaSinapi" TEXT,
    "areaTotal" DECIMAL,
    "areaLotes" DECIMAL,
    "areaVias" DECIMAL,
    "areaVerde" DECIMAL,
    "areaInstitucional" DECIMAL,
    "areaApp" DECIMAL,
    "quantidadeLotes" INTEGER,
    "valorTerreno" DECIMAL,
    "receitaEstimada" DECIMAL,
    "custoTerraplenagem" DECIMAL NOT NULL DEFAULT 0,
    "custoPavimentacao" DECIMAL NOT NULL DEFAULT 0,
    "custoDrenagem" DECIMAL NOT NULL DEFAULT 0,
    "custoCalcadas" DECIMAL NOT NULL DEFAULT 0,
    "custoAgua" DECIMAL NOT NULL DEFAULT 0,
    "custoEsgoto" DECIMAL NOT NULL DEFAULT 0,
    "custoEnergia" DECIMAL NOT NULL DEFAULT 0,
    "custoIluminacao" DECIMAL NOT NULL DEFAULT 0,
    "custoArborizacao" DECIMAL NOT NULL DEFAULT 0,
    "custoSinalizacao" DECIMAL NOT NULL DEFAULT 0,
    "custoProjetos" DECIMAL NOT NULL DEFAULT 0,
    "custoLicenciamento" DECIMAL NOT NULL DEFAULT 0,
    "custoRegistro" DECIMAL NOT NULL DEFAULT 0,
    "custoAdministrativo" DECIMAL NOT NULL DEFAULT 0,
    "custoComercial" DECIMAL NOT NULL DEFAULT 0,
    "custoContingencia" DECIMAL NOT NULL DEFAULT 0,
    "custoInfraestrutura" DECIMAL NOT NULL DEFAULT 0,
    "custoTotal" DECIMAL NOT NULL DEFAULT 0,
    "lucroEstimado" DECIMAL NOT NULL DEFAULT 0,
    "margemPercentual" DECIMAL NOT NULL DEFAULT 0,
    "roiPercentual" DECIMAL NOT NULL DEFAULT 0,
    "custoPorLote" DECIMAL NOT NULL DEFAULT 0,
    "receitaPorLote" DECIMAL NOT NULL DEFAULT 0,
    "premissas" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Viabilidade_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ViabilidadeItem" (
    "id" TEXT NOT NULL,
    "viabilidadeId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "quantidade" DECIMAL NOT NULL,
    "unidade" TEXT NOT NULL,
    "codigoReferencia" TEXT,
    "fonte" TEXT,
    "competencia" TEXT,
    "uf" TEXT,
    "custoUnitario" DECIMAL NOT NULL,
    "custoTotal" DECIMAL NOT NULL,
    "origemValor" TEXT NOT NULL,
    "observacao" TEXT,

    CONSTRAINT "ViabilidadeItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ViabilidadeQuantitativo" (
    "id" TEXT NOT NULL,
    "viabilidadeId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "quantidade" DECIMAL NOT NULL,
    "unidade" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "confianca" TEXT,
    "observacao" TEXT,

    CONSTRAINT "ViabilidadeQuantitativo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SinapiComposicao" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "unidade" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "custoDesonerado" DECIMAL,
    "custoNaoDesonerado" DECIMAL,
    "tipo" TEXT,
    "fonte" TEXT NOT NULL DEFAULT 'SINAPI',
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SinapiComposicao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SicroComposicao" (
    "id" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "unidade" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "custo" DECIMAL,
    "fonte" TEXT NOT NULL DEFAULT 'SICRO',
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "SicroComposicao_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ViabilidadeParametro" (
    "id" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "codigo" TEXT,
    "descricao" TEXT NOT NULL,
    "unidade" TEXT NOT NULL,
    "valorUnitario" DECIMAL,
    "percentual" DECIMAL,
    "fonte" TEXT,
    "codigoReferencia" TEXT,
    "uf" TEXT,
    "competencia" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ViabilidadeParametro_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ViabilidadeValidacao" (
    "id" TEXT NOT NULL,
    "viabilidadeId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "parametro" TEXT NOT NULL,
    "valorProjeto" DECIMAL,
    "valorMinimo" DECIMAL,
    "valorMaximo" DECIMAL,
    "unidade" TEXT,
    "status" TEXT NOT NULL,
    "mensagem" TEXT,

    CONSTRAINT "ViabilidadeValidacao_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Viabilidade_projetoId_idx" ON "Viabilidade"("projetoId");
CREATE UNIQUE INDEX "Viabilidade_projetoId_versao_key" ON "Viabilidade"("projetoId", "versao");
CREATE INDEX "ViabilidadeItem_viabilidadeId_idx" ON "ViabilidadeItem"("viabilidadeId");
CREATE INDEX "ViabilidadeQuantitativo_viabilidadeId_idx" ON "ViabilidadeQuantitativo"("viabilidadeId");
CREATE INDEX "SinapiComposicao_codigo_idx" ON "SinapiComposicao"("codigo");
CREATE INDEX "SinapiComposicao_uf_competencia_idx" ON "SinapiComposicao"("uf", "competencia");
CREATE UNIQUE INDEX "SinapiComposicao_codigo_uf_competencia_key" ON "SinapiComposicao"("codigo", "uf", "competencia");
CREATE INDEX "SicroComposicao_codigo_idx" ON "SicroComposicao"("codigo");
CREATE INDEX "SicroComposicao_uf_competencia_idx" ON "SicroComposicao"("uf", "competencia");
CREATE UNIQUE INDEX "SicroComposicao_codigo_uf_competencia_key" ON "SicroComposicao"("codigo", "uf", "competencia");
CREATE INDEX "ViabilidadeParametro_categoria_idx" ON "ViabilidadeParametro"("categoria");
CREATE INDEX "ViabilidadeValidacao_viabilidadeId_idx" ON "ViabilidadeValidacao"("viabilidadeId");

ALTER TABLE "ViabilidadeItem" ADD CONSTRAINT "ViabilidadeItem_viabilidadeId_fkey" FOREIGN KEY ("viabilidadeId") REFERENCES "Viabilidade"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ViabilidadeQuantitativo" ADD CONSTRAINT "ViabilidadeQuantitativo_viabilidadeId_fkey" FOREIGN KEY ("viabilidadeId") REFERENCES "Viabilidade"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ViabilidadeValidacao" ADD CONSTRAINT "ViabilidadeValidacao_viabilidadeId_fkey" FOREIGN KEY ("viabilidadeId") REFERENCES "Viabilidade"("id") ON DELETE CASCADE ON UPDATE CASCADE;
