// Calcula a data fatal de um prazo em dias úteis, pulando fim de semana e
// feriados nacionais fixos. Usado pelos pollers de DataJud/Mural (Sprint 2)
// pra popular processos.prazo_proxima_resposta e criar o evento de agenda.

const FERIADOS_NACIONAIS_MMDD = ["01-01", "04-21", "05-01", "09-07", "10-12", "11-02", "11-15", "12-25"];

export function calcularPrazoFatal(dataInicio: Date, diasUteis: number): string {
  const data = new Date(dataInicio);
  let diasAdicionados = 0;

  while (diasAdicionados < diasUteis) {
    data.setDate(data.getDate() + 1);
    const diaSemana = data.getDay();
    const mmdd = `${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;

    if (diaSemana !== 0 && diaSemana !== 6 && !FERIADOS_NACIONAIS_MMDD.includes(mmdd)) {
      diasAdicionados++;
    }
  }

  return data.toISOString().split("T")[0];
}
