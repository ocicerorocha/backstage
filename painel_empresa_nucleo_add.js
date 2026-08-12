/* ── painel da empresa ─────────────────────────────── */

// Resumo por evento da produtora: orçado, pago, receita, recebido.
export async function resumoEventos(empresaId) {
  const { data, error } = await bd
    .from('evento_resumo')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('data_inicio', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data || [];
}

// Recebido e pago por mês (linha temporal).
export async function fluxoMensal(empresaId) {
  const { data, error } = await bd
    .from('fluxo_mensal')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('mes');
  if (error) throw error;
  return data || [];
}

// Parcelas de receita a vencer (o "a receber"), no nível empresa.
export async function listarAgendaReceita(empresaId) {
  const { data, error } = await bd
    .from('agenda_receita')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('vencimento', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data || []).filter(p => Number(p.falta) > 0.005);
}
