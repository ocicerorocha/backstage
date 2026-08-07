// ═══════════════════════════════════════════════════════
// Configuração de conexão
//
// Estas chaves são públicas por natureza — elas rodam no
// navegador. O que protege os dados são as regras de acesso
// gravadas no próprio banco, não o sigilo delas.
//
// Nunca coloque aqui a chave "service_role" nem a senha do
// banco: essas dão acesso irrestrito e não devem sair do
// painel do Supabase.
// ═══════════════════════════════════════════════════════

export const SUPABASE_URL = 'https://orpaxglmyhtuwgbslkmm.supabase.co';
export const SUPABASE_CHAVE = 'sb_publishable_une80H5jmvdctWMrLkK2VA_n337cAg5';

export const APP = {
  nome: 'Backstage',
  descricao: 'Gestão financeira para produtoras de eventos',
  fabricante: 'Facility',
};
