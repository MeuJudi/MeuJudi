/**
 * Traduz o erro cru de uma tarefa (status + error_code/message) numa causa
 * e num próximo passo em português, pra quem não conhece HTTP status
 * conseguir agir sem abrir os Logs — Fase 9 de
 * docs/roadmap/23-meujudi-cs-v0.3.0-refatoracao.md.
 *
 * Recebe só `status`/`error_message` (não o `SyncTask` inteiro, e sem
 * importar `@shared/types`) de propósito — mantém a função testável
 * isoladamente com `node tests/classify-task-error.test.js`, compilada sem
 * resolução de path alias nenhuma.
 */
export interface TaskErrorGuidance {
  causa: string;
  proximoPasso: string;
}

export interface TaskErrorInput {
  status: string;
  error_message: string | null;
}

export function classifyTaskError(task: TaskErrorInput): TaskErrorGuidance | null {
  const msg = task.error_message ?? '';

  if (task.status === 'paused_login_required' || /HTTP 401|HTTP 403|sessão pdpj expirada|sessao pdpj expirada/i.test(msg)) {
    return {
      causa: 'A sessão com a fonte (PDPJ/Jus ou Mural) expirou ou não tem permissão.',
      proximoPasso: 'Refaça o login em "Portal PDPJ/Jus" — a tarefa retoma sozinha do ponto em que parou.',
    };
  }
  if (/HTTP 404/.test(msg)) {
    return {
      causa: 'A fonte não encontrou o registro pedido — geralmente é só o fim natural da paginação.',
      proximoPasso: 'Sem ação necessária na maioria dos casos; confira se a tarefa concluiu na tentativa seguinte.',
    };
  }
  if (task.status === 'paused_rate_limit' || /HTTP 429|HTTP 5\d\d/.test(msg)) {
    return {
      causa: 'A fonte limitou as requisições ou está temporariamente instável.',
      proximoPasso: 'Sem ação necessária — o worker tenta de novo automaticamente, com espera crescente.',
    };
  }
  if (/tempo limite|timeout/i.test(msg)) {
    return {
      causa: 'A fonte demorou demais pra responder.',
      proximoPasso: 'Verifique a conexão deste computador; o worker tenta de novo no próximo ciclo.',
    };
  }
  if (/não está pareado|nao esta pareado/i.test(msg)) {
    return {
      causa: 'Este computador perdeu o pareamento com o escritório.',
      proximoPasso: 'Pareie novamente em "Pareamento".',
    };
  }
  if (task.status === 'failed') {
    return {
      causa: 'Falha ao processar ou enviar o resultado desta tarefa.',
      proximoPasso: 'Veja "Logs" pelo horário desta tarefa; se persistir, informe o identificador ao suporte.',
    };
  }
  return null;
}
