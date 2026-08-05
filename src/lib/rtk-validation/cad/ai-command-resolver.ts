import type { CadAiCommand, CadAiProjectContext } from "./ai-command-types";

/** Expande flags semânticas (usarSelecao, posicao) em comandos concretos do executor. */
export function resolveCadAiCommands(
  commands: CadAiCommand[],
  context: CadAiProjectContext,
): CadAiCommand[] {
  return commands.map((cmd) => resolveCadAiCommand(cmd, context));
}

function resolveCadAiCommand(command: CadAiCommand, context: CadAiProjectContext): CadAiCommand {
  let cmd = { ...command };

  if (cmd.usarSelecao) {
    if (cmd.acao === "criar_poligono") {
      if (context.selecao.pontos.length >= 3) {
        cmd = { ...cmd, pontos: context.selecao.pontos, usarSelecao: undefined };
      } else if (context.selecao.entidadeId && context.selecao.tipo === "polyline") {
        cmd = {
          ...cmd,
          acao: "fechar_poligono",
          entidade_id: context.selecao.entidadeId,
          usarSelecao: undefined,
        };
      }
    } else if (!cmd.entidade_id && context.selecao.entidadeId) {
      cmd = { ...cmd, entidade_id: context.selecao.entidadeId, usarSelecao: undefined };
    }
  }

  if (cmd.posicao === "centro") {
    if (cmd.acao === "inserir_texto" || cmd.acao === "adicionar_texto") {
      cmd = {
        ...cmd,
        acao: "inserir_area",
        entidade_id: cmd.entidade_id ?? context.selecao.entidadeId ?? undefined,
        posicao: undefined,
      };
    }
  }

  if (cmd.acao === "medir_area") {
    cmd = {
      ...cmd,
      entidade_id: cmd.entidade_id ?? context.selecao.entidadeId ?? undefined,
    };
  }

  return cmd;
}
