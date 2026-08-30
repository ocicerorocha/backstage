// ═══════════════════════════════════════════════════════
// Núcleo — conexão, sessão e acesso a dados
//
// Toda operação do sistema vive aqui como função própria,
// com sua validação. As telas apenas chamam estas funções.
// É o que permitirá, adiante, o WhatsApp usar as mesmas
// operações sem reescrever nada.
// ═══════════════════════════════════════════════════════

// jsDelivr entrega o pacote em um arquivo só, já empacotado.
// É mais estável que alternativas que montam a biblioteca em vários
// pedaços — se um pedaço falha, nada carrega e a tela trava.
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_CHAVE } from './config.js';

export const bd = createClient(SUPABASE_URL, SUPABASE_CHAVE, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // A biblioteca usa, por padrão, uma trava do navegador para coordenar
    // a sessão entre abas. Se essa trava fica presa — o que acontece quando
    // uma aba trava ou é fechada no meio da verificação — a checagem de
    // sessão espera para sempre e a tela nunca sai do "carregando".
    // Como aqui só existe uma aba ativa por vez, executamos direto.
    lock: async (_nome, _limite, fn) => fn(),
  },
});

/** Executa uma promessa com prazo. Passou do prazo, desiste. */
function comPrazo(promessa, ms, mensagem) {
  return Promise.race([
    promessa,
    new Promise((_, rejeitar) => setTimeout(() => rejeitar(new Error(mensagem)), ms)),
  ]);
}

/** Apaga a sessão guardada no navegador. Usado quando ela está corrompida. */
export function limparSessaoLocal() {
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith('sb-') || k.toLowerCase().includes('supabase'))
      .forEach(k => localStorage.removeItem(k));
  } catch (e) { /* navegador sem localStorage: nada a limpar */ }
}

// Estado da sessão em memória
export const sessao = {
  usuario: null,             // { id, email, nome, cpf, telefone }
  membros: [],               // vínculos com empresas
  permissoesPagamento: false // confirma pagamento em algum evento?
};

/* ── autenticação ──────────────────────────────────── */

export async function entrar(email, senha) {
  const { data, error } = await bd.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password: senha,
  });
  if (error) throw new Error(traduzErro(error.message));
  return data;
}

/** Cria conta. Os convites pendentes para este email viram acesso na entrada. */
export async function criarConta(email, senha, nome) {
  const { data, error } = await bd.auth.signUp({
    email: email.trim().toLowerCase(),
    password: senha,
    options: { data: { nome: nome?.trim() || null } },
  });
  if (error) throw new Error(traduzErro(error.message));
  return { precisaConfirmar: !data.session, usuario: data.user };
}

export async function sair() {
  await bd.auth.signOut();
  sessao.usuario = null;
  sessao.membros = [];
}

export async function recuperarSenha(email) {
  const redirectTo = window.location.origin + window.location.pathname;
  const { data, error } = await bd.functions.invoke('recuperar-senha', {
    body: { email: (email || '').trim().toLowerCase(), redirectTo },
  });
  if (error) {
    let msg = 'Não consegui enviar o link de recuperação.';
    try { const j = await error.context.json(); if (j?.erro) msg = j.erro; }
    catch (_) { if (error.message) msg = error.message; }
    throw new Error(msg);
  }
  if (data?.erro) throw new Error(data.erro);
}

export async function definirSenha(novaSenha) {
  const { error } = await bd.auth.updateUser({ password: novaSenha });
  if (error) throw new Error(traduzErro(error.message));
}

/** Convite de verdade: cria o acesso e dispara o email com o link de senha. */
export async function convidarUsuario({ email, nome }) {
  const redirectTo = window.location.origin + window.location.pathname;
  const { data, error } = await bd.functions.invoke('convidar-usuario', {
    body: { email: (email || '').trim().toLowerCase(), nome: nome?.trim() || null, redirectTo },
  });
  if (error) {
    let msg = 'Não consegui enviar o convite.';
    try { const j = await error.context.json(); if (j?.erro) msg = j.erro; }
    catch (_) { if (error.message) msg = error.message; }
    throw new Error(msg);
  }
  if (data?.erro) throw new Error(data.erro);
  return data;
}

/** Atualiza só o nome do usuário logado (não toca em cpf/telefone). */
export async function salvarMeuNome(nome) {
  const n = (nome || '').trim();
  if (!n) return;
  const { error } = await bd.from('usuario').update({ nome: n }).eq('id', sessao.usuario.id);
  if (error) throw new Error(traduzErro(error.message));
  sessao.usuario.nome = n;
  try { await bd.auth.updateUser({ data: { nome: n } }); } catch (_) {}
}

export async function sessaoAtual() {
  try {
    const { data } = await comPrazo(
      bd.auth.getSession(), 8000,
      'A verificação de sessão não respondeu.'
    );
    return data?.session || null;
  } catch (e) {
    // Sessão guardada corrompida ou travada: descarta e manda para o login,
    // que é a ação útil. Melhor pedir para entrar de novo do que travar.
    console.warn('Sessão descartada:', e.message);
    limparSessaoLocal();
    return null;
  }
}

/** Carrega perfil e vínculos do usuário logado. */
export async function carregarSessao() {
  const s = await sessaoAtual();
  if (!s) { sessao.usuario = null; sessao.membros = []; return null; }

  // Convites pendentes para este email viram vínculo agora.
  // Cobre tanto quem acabou de criar conta quanto quem já tinha
  // conta de outra produtora e foi convidado para esta.
  try { await bd.rpc('aceitar_convites'); } catch (e) { console.warn('convites:', e.message); }

  const { data: perfil, error } = await comPrazo(
    bd.from('usuario').select('id, nome, cpf, telefone').eq('id', s.user.id).maybeSingle(),
    12000,
    'O banco não respondeu ao buscar seu perfil.'
  );
  if (error) throw error;

  sessao.usuario = {
    id: s.user.id,
    email: s.user.email,
    nome: perfil?.nome || s.user.email,
    cpf: perfil?.cpf || '',
    telefone: perfil?.telefone || '',
  };

  const { data: membros, error: e2 } = await bd
    .from('membro')
    .select('id, papel, ver_painel, gerir_custos_adm, gerir_fornecedores, gerir_usuarios, criar_eventos, empresa:empresa_id (id, nome, cnpj, logo_url)')
    .eq('usuario_id', s.user.id)
    .eq('ativo', true);
  if (e2) throw e2;

  sessao.membros = membros || [];

  // quem confirma pagamento em pelo menos um evento enxerga a agenda
  try {
    const { data: p } = await bd.from('permissao')
      .select('id').eq('usuario_id', s.user.id).eq('confirmar_pagamento', true).limit(1);
    sessao.permissoesPagamento = !!(p && p.length);
  } catch (e) { sessao.permissoesPagamento = false; }

  return sessao.usuario;
}

export async function salvarPerfil({ nome, cpf, telefone }) {
  const { error } = await bd
    .from('usuario')
    .update({ nome: nome.trim(), cpf: cpf?.trim() || null, telefone: telefone?.trim() || null })
    .eq('id', sessao.usuario.id);
  if (error) throw error;
  sessao.usuario.nome = nome.trim();
  sessao.usuario.cpf = cpf?.trim() || '';
  sessao.usuario.telefone = telefone?.trim() || '';
}

/* ── empresas ──────────────────────────────────────── */

export function empresasOndeCrio() {
  return sessao.membros
    .filter(m => m.criar_eventos || m.papel === 'mestre' || m.papel === 'administrador')
    .map(m => m.empresa);
}

/** Empresa ativa (trocador). Guardada no navegador. */
let _empresaAtivaId = null;
try { _empresaAtivaId = localStorage.getItem('bs_empresa_ativa'); } catch (_) {}

/** Produtora em que estou operando agora. */
export function empresaAtual() {
  const m = sessao.membros.find(x => x.empresa?.id === _empresaAtivaId) || sessao.membros[0];
  return m?.empresa || null;
}

/** Meu vínculo (papel/permissões) na produtora ativa. */
export function membroAtual() {
  const a = empresaAtual();
  return sessao.membros.find(x => x.empresa?.id === a?.id) || sessao.membros[0] || null;
}

/** Troca a produtora ativa e guarda a escolha. */
export function definirEmpresaAtiva(id) {
  _empresaAtivaId = id;
  try { localStorage.setItem('bs_empresa_ativa', id); } catch (_) {}
}

export async function salvarEmpresa(id, dados) {
  const { data, error } = await bd
    .from('empresa')
    .update({
      nome: dados.nome?.trim(),
      cnpj: dados.cnpj?.trim() || null,
      ...(dados.logo_url !== undefined ? { logo_url: dados.logo_url } : {}),
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(traduzErro(error.message));
  // reflete na sessão sem precisar recarregar tudo
  const m = sessao.membros.find(x => x.empresa?.id === id);
  if (m) Object.assign(m.empresa, data);
  return data;
}

export function souAdmin(empresaId) {
  const m = sessao.membros.find(x => x.empresa?.id === empresaId);
  return !!m && (m.papel === 'mestre' || m.papel === 'administrador');
}

/* ── eventos ───────────────────────────────────────── */

export async function listarEventos() {
  const { data, error } = await bd
    .from('evento')
    .select('id, nome, cidade, local, data_inicio, data_fim, publico_estimado, logo_url, situacao, dono_id, empresa:empresa_id (id, nome, logo_url)')
    .order('data_inicio', { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data || [];
}

export async function buscarEvento(id) {
  const { data, error } = await bd
    .from('evento')
    .select('*, empresa:empresa_id (id, nome, logo_url)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

export async function criarEvento(dados) {
  const { data, error } = await bd
    .from('evento')
    .insert(limparEvento(dados))
    .select()
    .single();
  if (error) throw new Error(traduzErro(error.message));
  return data;
}

export async function atualizarEvento(id, dados) {
  const { data, error } = await bd
    .from('evento')
    .update(limparEvento(dados))
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(traduzErro(error.message));
  return data;
}

function limparEvento(d) {
  const saida = {
    nome: d.nome?.trim(),
    cidade: d.cidade?.trim() || null,
    local: d.local?.trim() || null,
    data_inicio: d.data_inicio || null,
    data_fim: d.data_fim || null,
    publico_estimado: d.publico_estimado ? Number(d.publico_estimado) : null,
    observacoes: d.observacoes?.trim() || null,
    situacao: d.situacao || 'planejamento',
  };
  if (d.empresa_id) saida.empresa_id = d.empresa_id;
  if (d.logo_url !== undefined) saida.logo_url = d.logo_url;
  if (d.dono_id !== undefined) saida.dono_id = d.dono_id || null;
  return saida;
}

/* ── fontes de pagamento do evento ─────────────────── */

export async function listarFontes(eventoId) {
  const { data, error } = await bd
    .from('fonte_pagamento')
    .select('id, nome, ativa')
    .eq('evento_id', eventoId)
    .order('nome');
  if (error) throw error;
  return data || [];
}

export async function criarFontes(eventoId, nomes) {
  const linhas = nomes
    .map(n => n.trim())
    .filter(Boolean)
    .map(nome => ({ evento_id: eventoId, nome }));
  if (!linhas.length) return [];
  const { data, error } = await bd.from('fonte_pagamento').insert(linhas).select();
  if (error) throw new Error(traduzErro(error.message));
  return data;
}

/* ── usuários da empresa ───────────────────────────── */

export async function listarMembros(empresaId) {
  const { data, error } = await bd
    .from('membro')
    .select('id, papel, ativo, ver_painel, gerir_custos_adm, gerir_fornecedores, gerir_usuarios, criar_eventos, usuario:usuario_id (id, nome, cpf, telefone)')
    .eq('empresa_id', empresaId);
  if (error) throw error;
  return data || [];
}

export async function listarConvites(empresaId) {
  const { data, error } = await bd
    .from('convite')
    .select('id, email, nome, papel, criado_em')
    .eq('empresa_id', empresaId)
    .is('aceito_em', null)
    .order('criado_em', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function convidar({ empresaId, email, nome, papel, permissoesEmpresa, permissoesEventos }) {
  const { data, error } = await bd
    .from('convite')
    .insert({
      empresa_id: empresaId,
      email: email.trim().toLowerCase(),
      nome: nome?.trim() || null,
      papel,
      permissoes_empresa: permissoesEmpresa || {},
      permissoes_eventos: permissoesEventos || [],
      criado_por: sessao.usuario?.id || null,
    })
    .select()
    .single();
  if (error) {
    if (String(error.message).includes('duplicate')) {
      throw new Error('Já existe um convite pendente para este email.');
    }
    throw new Error(traduzErro(error.message));
  }
  return data;
}

export async function cancelarConvite(id) {
  const { error } = await bd.from('convite').delete().eq('id', id);
  if (error) throw new Error(traduzErro(error.message));
}

export async function alterarMembro(id, campos) {
  const { error } = await bd.from('membro').update(campos).eq('id', id);
  if (error) throw new Error(traduzErro(error.message));
}

/* ── permissões por evento ─────────────────────────── */

export async function listarPermissoes(eventoId) {
  const { data, error } = await bd
    .from('permissao')
    .select('*, usuario:usuario_id (id, nome)')
    .eq('evento_id', eventoId);
  if (error) throw error;
  return data || [];
}

export async function salvarPermissao(eventoId, usuarioId, campos) {
  const { error } = await bd
    .from('permissao')
    .upsert({ evento_id: eventoId, usuario_id: usuarioId, ...campos },
            { onConflict: 'evento_id,usuario_id' });
  if (error) throw new Error(traduzErro(error.message));
}

export async function removerPermissao(eventoId, usuarioId) {
  const { error } = await bd
    .from('permissao').delete()
    .eq('evento_id', eventoId).eq('usuario_id', usuarioId);
  if (error) throw new Error(traduzErro(error.message));
}

/* ── fornecedores ──────────────────────────────────── */

export async function listarFornecedores(empresaId) {
  const { data, error } = await bd
    .from('fornecedor')
    .select('id, nome, documento, contato, email, telefone, observacoes, ativo')
    .eq('empresa_id', empresaId)
    .order('nome');
  if (error) throw error;
  return data || [];
}

export async function salvarFornecedor(empresaId, id, dados) {
  const linha = {
    nome: dados.nome?.trim(),
    documento: dados.documento?.trim() || null,
    contato: dados.contato?.trim() || null,
    email: dados.email?.trim() || null,
    telefone: dados.telefone?.trim() || null,
    observacoes: dados.observacoes?.trim() || null,
  };
  const q = id
    ? bd.from('fornecedor').update(linha).eq('id', id)
    : bd.from('fornecedor').insert({ ...linha, empresa_id: empresaId });
  const { data, error } = await q.select().single();
  if (error) throw new Error(traduzErro(error.message));
  return data;
}

export async function alternarFornecedor(id, ativo) {
  const { error } = await bd.from('fornecedor').update({ ativo }).eq('id', id);
  if (error) throw new Error(traduzErro(error.message));
}

/** Dados de pagamento de vários fornecedores de uma vez, para preencher formulários. */
export async function meiosPagamentoDaEmpresa(empresaId) {
  const { data, error } = await bd
    .from('fornecedor_pagamento')
    .select('*, fornecedor:fornecedor_id!inner(id, empresa_id)')
    .eq('ativo', true)
    .eq('fornecedor.empresa_id', empresaId);
  if (error) { console.warn('meios de pagamento:', error.message); return []; }
  // um por fornecedor, o mais recente
  const porFornecedor = {};
  (data || []).forEach(m => {
    const k = m.fornecedor_id;
    if (!porFornecedor[k] || m.atualizado_em > porFornecedor[k].atualizado_em) porFornecedor[k] = m;
  });
  return Object.values(porFornecedor);
}

/** Meios de pagamento. Visíveis apenas a quem confirma pagamento. */
export async function listarMeiosPagamento(fornecedorId) {
  const { data, error } = await bd
    .from('fornecedor_pagamento')
    .select('*')
    .eq('fornecedor_id', fornecedorId)
    .order('atualizado_em', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function salvarMeioPagamento(fornecedorId, id, dados) {
  const linha = {
    tipo: dados.tipo,
    chave_pix: dados.chave_pix?.trim() || null,
    banco: dados.banco?.trim() || null,
    agencia: dados.agencia?.trim() || null,
    conta: dados.conta?.trim() || null,
    titular: dados.titular?.trim() || null,
    atualizado_em: new Date().toISOString(),
    atualizado_por: sessao.usuario?.id || null,
  };
  const q = id
    ? bd.from('fornecedor_pagamento').update(linha).eq('id', id)
    : bd.from('fornecedor_pagamento').insert({ ...linha, fornecedor_id: fornecedorId });
  const { error } = await q;
  if (error) throw new Error(traduzErro(error.message));
}

/* ── categorias ────────────────────────────────────── */

export async function listarCategorias(empresaId, tipo = 'despesa') {
  const { data, error } = await bd
    .from('categoria')
    .select('id, nome, ordem, ativa')
    .eq('empresa_id', empresaId)
    .eq('tipo', tipo)
    .eq('ativa', true)
    .order('ordem');
  if (error) throw error;
  return data || [];
}

export async function criarCategoria(empresaId, tipo, nome) {
  const { data, error } = await bd
    .from('categoria')
    .insert({ empresa_id: empresaId, tipo, nome: nome.trim(), ordem: 99 })
    .select().single();
  if (error) throw new Error(traduzErro(error.message));
  return data;
}

/* ── itens de produção ─────────────────────────────── */

export async function listarItens(eventoId) {
  const { data, error } = await bd
    .from('item_producao_visao')
    .select('*')
    .eq('evento_id', eventoId)
    .order('numero');
  if (error) throw error;
  return data || [];
}

export async function salvarItem(eventoId, id, dados) {
  const linha = {
    descricao: dados.descricao?.trim(),
    categoria_id: dados.categoria_id || null,
    fornecedor_id: dados.fornecedor_id || null,
    valor_orcado: Number(dados.valor_orcado) || 0,
    custo_referencia: dados.custo_referencia === '' || dados.custo_referencia == null
      ? null : Number(dados.custo_referencia),
    situacao: dados.situacao || 'orcado',
    eh_verba: !!dados.eh_verba,
    observacoes: dados.observacoes?.trim() || null,
    quantidade: dados.quantidade ? Number(dados.quantidade) : null,
    dias: dados.dias ? Number(dados.dias) : null,
    valor_unitario: dados.valor_unitario ? Number(dados.valor_unitario) : null,
  };
  const q = id
    ? bd.from('item_producao').update(linha).eq('id', id)
    : bd.from('item_producao').insert({ ...linha, evento_id: eventoId, criado_por: sessao.usuario?.id || null });
  const { data, error } = await q.select().single();
  if (error) throw new Error(traduzErro(error.message));
  return data;
}

export async function apagarItem(id) {
  const { error } = await bd.from('item_producao').delete().eq('id', id);
  if (error) throw new Error(traduzErro(error.message));
}

/** Grava vários itens de uma vez. Usado pela importação. */
export async function criarItensEmLote(eventoId, linhas) {
  const prontos = linhas.map(l => ({
    evento_id: eventoId,
    descricao: l.descricao,
    categoria_id: l.categoria_id || null,
    valor_orcado: Number(l.valor_orcado) || 0,
    custo_referencia: l.custo_referencia == null ? null : Number(l.custo_referencia),
    situacao: l.situacao || 'orcado',
    criado_por: sessao.usuario?.id || null,
  }));
  const { data, error } = await bd.from('item_producao').insert(prontos).select('id');
  if (error) throw new Error(traduzErro(error.message));
  return data || [];
}

export async function registrarImportacao(eventoId, info) {
  const { error } = await bd.from('importacao').insert({
    evento_id: eventoId,
    arquivo: info.arquivo || null,
    mapeamento: info.mapeamento || {},
    linhas_lidas: info.lidas || 0,
    linhas_criadas: info.criadas || 0,
    descartes: info.descartes || [],
    feita_por: sessao.usuario?.id || null,
  });
  if (error) console.warn('registro da importação falhou:', error.message);
}

/* ── prestação de contas ───────────────────────────── */

export async function listarPrestacao(itemId) {
  const { data, error } = await bd
    .from('prestacao_conta')
    .select('*')
    .eq('item_id', itemId)
    .order('data', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data || [];
}

export async function salvarPrestacao(itemId, id, dados) {
  const linha = {
    descricao: dados.descricao?.trim(),
    valor: Number(dados.valor) || 0,
    data: dados.data || null,
    comprovante_url: dados.comprovante_url || null,
  };
  const q = id
    ? bd.from('prestacao_conta').update(linha).eq('id', id)
    : bd.from('prestacao_conta').insert({ ...linha, item_id: itemId, lancado_por: sessao.usuario?.id || null });
  const { error } = await q;
  if (error) throw new Error(traduzErro(error.message));
}

export async function apagarPrestacao(id) {
  const { error } = await bd.from('prestacao_conta').delete().eq('id', id);
  if (error) throw new Error(traduzErro(error.message));
}

/* ── solicitações ──────────────────────────────────── */

export async function listarSolicitacoes(eventoId) {
  const { data, error } = await bd
    .from('solicitacao_visao')
    .select('*')
    .eq('evento_id', eventoId)
    .order('criado_em', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function saldoItens(eventoId) {
  const { data, error } = await bd
    .from('item_saldo')
    .select('*')
    .eq('evento_id', eventoId)
    .order('numero');
  if (error) throw error;
  return data || [];
}
/** Andamento financeiro por item: solicitado, pago e em fluxo. */
export async function andamentoItens(eventoId) {
  const { data, error } = await bd
    .from('item_andamento')
    .select('*')
    .eq('evento_id', eventoId);
  if (error) throw error;
  return data || [];
}
export async function listarParcelas(solicitacaoIds) {
  if (!solicitacaoIds.length) return [];
  const { data, error } = await bd
    .from('parcela')
    .select('*, pagamento(id, valor, data, comprovante_url, autoaprovado, registrado_por)')
    .in('solicitacao_id', solicitacaoIds)
    .order('vencimento', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data || [];
}

/** Cria a solicitação e suas parcelas. A trava de saldo vive no banco. */
export async function criarSolicitacao(eventoId, dados, parcelas) {
  const { data: solic, error } = await bd
    .from('solicitacao')
    .insert({
      evento_id: eventoId,
      item_id: dados.item_id,
      fornecedor_id: dados.fornecedor_id || null,
      valor: Number(dados.valor),
      justificativa: dados.justificativa?.trim() || null,
      solicitante_id: sessao.usuario.id,
      pag_tipo:    dados.pag_tipo || null,
      pag_chave:   dados.pag_chave?.trim() || null,
      pag_banco:   dados.pag_banco?.trim() || null,
      pag_agencia: dados.pag_agencia?.trim() || null,
      pag_conta:   dados.pag_conta?.trim() || null,
      pag_titular: dados.pag_titular?.trim() || null,
    })
    .select().single();
  if (error) throw new Error(traduzErro(error.message));

  const linhas = parcelas.map(p => ({
    solicitacao_id: solic.id,
    vencimento: p.vencimento || null,
    valor: Number(p.valor),
  }));
  const { error: e2 } = await bd.from('parcela').insert(linhas);
  if (e2) {
    // sem parcela a solicitação não serve para nada: desfaz
    await bd.from('solicitacao').delete().eq('id', solic.id);
    throw new Error(traduzErro(e2.message));
  }
  return solic;
}

export async function aprovarSolicitacao(id) {
  const { error } = await bd.from('solicitacao')
    .update({ situacao: 'aprovada' }).eq('id', id);
  if (error) throw new Error(traduzErro(error.message));
}

export async function recusarSolicitacao(id, motivo) {
  const { error } = await bd.from('solicitacao')
    .update({ situacao: 'rejeitada', motivo_recusa: motivo?.trim() || null }).eq('id', id);
  if (error) throw new Error(traduzErro(error.message));
}

export async function cancelarSolicitacao(id) {
  const { error } = await bd.from('solicitacao')
    .update({ situacao: 'cancelada' }).eq('id', id);
  if (error) throw new Error(traduzErro(error.message));
}

/* ── agenda de pagamentos ──────────────────────────── */

/** Tudo que está aprovado e ainda devendo, em todos os eventos da produtora. */
export async function listarAgenda(empresaId) {
  const { data, error } = await bd
    .from('agenda_pagamento')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('vencimento', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return (data || []).filter(p => Number(p.falta) > 0.005);
}

export async function adiamentosDasParcelas() {
  const { data, error } = await bd.from('parcela_adiamentos').select('*');
  if (error) { console.warn('adiamentos:', error.message); return []; }
  return data || [];
}

export async function pagamentosDaParcela(parcelaId) {
  const { data, error } = await bd
    .from('pagamento')
    .select('*, usuario:registrado_por (nome)')
    .eq('parcela_id', parcelaId)
    .order('criado_em');
  if (error) throw error;
  return data || [];
}

export async function registrarPagamento(parcelaId, dados) {
  const { data, error } = await bd
    .from('pagamento')
    .insert({
      parcela_id: parcelaId,
      valor: Number(dados.valor),
      data: dados.data || new Date().toISOString().slice(0, 10),
      fonte_id: dados.fonte_id || null,
      comprovante_url: dados.comprovante_url || null,
      observacao: dados.observacao?.trim() || null,
    })
    .select().single();
  if (error) throw new Error(traduzErro(error.message));
  return data;
}

export async function estornarPagamento(pagamentoId, motivo) {
  const { error } = await bd.rpc('estornar_pagamento',
    { p_pagamento: pagamentoId, p_motivo: motivo || '' });
  if (error) throw new Error(traduzErro(error.message));
}

export async function adiarParcela(parcelaId, novaData, motivo) {
  const { error } = await bd.rpc('adiar_parcela',
    { p_parcela: parcelaId, p_data: novaData, p_motivo: motivo || '' });
  if (error) throw new Error(traduzErro(error.message));
}

export async function marcarUrgente(parcelaId, urgente) {
  const { error } = await bd.rpc('marcar_urgente',
    { p_parcela: parcelaId, p_urgente: !!urgente });
  if (error) throw new Error(traduzErro(error.message));
}

/** Comprovante vai para depósito fechado: só quem está autenticado enxerga. */
export async function enviarComprovante(arquivo) {
  const ext = (arquivo.name.split('.').pop() || 'jpg').toLowerCase();
  const caminho = `${new Date().getFullYear()}/${crypto.randomUUID()}.${ext}`;
  const { error } = await bd.storage
    .from('comprovantes')
    .upload(caminho, arquivo, { cacheControl: '3600', upsert: false });
  if (error) throw new Error(traduzErro(error.message));
  return caminho;
}

/** Link temporário para ver um comprovante. */
export async function linkComprovante(caminho) {
  const { data, error } = await bd.storage
    .from('comprovantes').createSignedUrl(caminho, 300);
  if (error) throw new Error(traduzErro(error.message));
  return data.signedUrl;
}

/* ── permissões do usuário no evento ───────────────── */

export async function minhaPermissao(eventoId) {
  const emp = empresaAtual();
  if (emp && souAdmin(emp.id)) {
    return {
      admin: true, ver_evento: true, editar_producao: true, criar_solicitacao: true,
      aprovar_pagamento: true, confirmar_pagamento: true, ver_receitas: true,
      lancar_receitas: true, exportar: true, teto_aprovacao: null,
    };
  }
  const { data } = await bd
    .from('permissao').select('*')
    .eq('evento_id', eventoId).eq('usuario_id', sessao.usuario.id)
    .maybeSingle();
  return { admin: false, ...(data || { ver_evento: true }) };
}
/* ── receitas ──────────────────────────────────────── */

// Fontes de receita do evento (bilheteria, patrocínio…). São do
// evento, como as fontes de pagamento — fáceis de gerir e mudam
// de evento pra evento.
export async function listarFontesReceita(eventoId) {
  const { data, error } = await bd
    .from('fonte_receita')
    .select('id, nome, ativa')
    .eq('evento_id', eventoId)
    .order('nome');
  if (error) throw error;
  return data || [];
}

export async function salvarFonteReceita(eventoId, id, nome) {
  const linha = { nome: nome.trim() };
  const q = id
    ? bd.from('fonte_receita').update(linha).eq('id', id)
    : bd.from('fonte_receita').insert({ ...linha, evento_id: eventoId });
  const { data, error } = await q.select().single();
  if (error) throw new Error(traduzErro(error.message));
  return data;
}

export async function alternarFonteReceita(id, ativa) {
  const { error } = await bd.from('fonte_receita').update({ ativa }).eq('id', id);
  if (error) throw new Error(traduzErro(error.message));
}

// Cópia das fontes de um evento anterior, na criação.
export async function copiarFontesReceita(eventoId, nomes) {
  const linhas = nomes.map(n => n.trim()).filter(Boolean).map(nome => ({ evento_id: eventoId, nome }));
  if (!linhas.length) return [];
  const { data, error } = await bd.from('fonte_receita').insert(linhas).select();
  if (error) throw new Error(traduzErro(error.message));
  return data;
}

export async function listarReceitas(eventoId) {
  const { data, error } = await bd
    .from('receita_visao')
    .select('*')
    .eq('evento_id', eventoId)
    .order('criado_em', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Parcelas de várias receitas, com os recebimentos aninhados.
export async function listarParcelasReceita(receitaIds) {
  if (!receitaIds.length) return [];
  const { data, error } = await bd
    .from('receita_parcela')
    .select('*, recebimento(id, valor, data, comprovante_url, estorno_de, registrado_por)')
    .in('receita_id', receitaIds)
    .order('vencimento', { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data || [];
}

// Cria a receita e suas parcelas. Sem parcela, a receita não serve: desfaz.
export async function criarReceita(eventoId, dados, parcelas) {
  const { data: rec, error } = await bd
    .from('receita')
    .insert({
      evento_id: eventoId,
      fonte_receita_id: dados.fonte_receita_id || null,
      descricao: dados.descricao?.trim() || null,
      valor_previsto: Number(dados.valor_previsto) || 0,
      pagador: dados.pagador?.trim() || null,
      observacoes: dados.observacoes?.trim() || null,
      criado_por: sessao.usuario.id,
    })
    .select().single();
  if (error) throw new Error(traduzErro(error.message));

  const linhas = parcelas.map(p => ({
    receita_id: rec.id,
    vencimento: p.vencimento || null,
    valor: Number(p.valor),
  }));
  const { error: e2 } = await bd.from('receita_parcela').insert(linhas);
  if (e2) {
    await bd.from('receita').delete().eq('id', rec.id);
    throw new Error(traduzErro(e2.message));
  }
  return rec;
}

export async function apagarReceita(id) {
  const { error } = await bd.from('receita').delete().eq('id', id);
  if (error) throw new Error(traduzErro(error.message));
}

// Recebimento é imutável: registra-se, não se corrige nem apaga.
export async function registrarRecebimento(parcelaId, dados) {
  const { data, error } = await bd
    .from('recebimento')
    .insert({
      parcela_id: parcelaId,
      valor: Number(dados.valor),
      data: dados.data || new Date().toISOString().slice(0, 10),
      comprovante_url: dados.comprovante_url || null,
      observacao: dados.observacao?.trim() || null,
      registrado_por: sessao.usuario?.id || null,
    })
    .select().single();
  if (error) throw new Error(traduzErro(error.message));
  return data;
}

// Estorno: um recebimento negativo apontando para o original.
export async function estornarRecebimento(recebimentoId, motivo) {
  const { data: orig, error: e0 } = await bd
    .from('recebimento').select('parcela_id, valor').eq('id', recebimentoId).single();
  if (e0) throw new Error(traduzErro(e0.message));
  const { error } = await bd.from('recebimento').insert({
    parcela_id: orig.parcela_id,
    valor: -Number(orig.valor),
    observacao: motivo?.trim() || 'estorno',
    estorno_de: recebimentoId,
    registrado_por: sessao.usuario?.id || null,
  });
  if (error) throw new Error(traduzErro(error.message));
}
/* ── arquivos ──────────────────────────────────────── */

export async function enviarLogo(arquivo, prefixo = 'evento') {
  const ext = (arquivo.name.split('.').pop() || 'png').toLowerCase();
  const caminho = `${prefixo}/${crypto.randomUUID()}.${ext}`;

  const { error } = await bd.storage
    .from('logos')
    .upload(caminho, arquivo, { cacheControl: '3600', upsert: false });
  if (error) throw new Error(traduzErro(error.message));

  const { data } = bd.storage.from('logos').getPublicUrl(caminho);
  return data.publicUrl;
}

/**
 * Reduz a imagem antes de enviar. Logo não precisa de mais que
 * 512px, e comprovante fotografado no celular chega com vários
 * megabytes — o armazenamento cresce com o uso e tem custo.
 */
export function comprimirImagem(arquivo, maxLado = 512, qualidade = .85) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onerror = () => reject(new Error('Não consegui ler o arquivo.'));
    leitor.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Arquivo de imagem inválido.'));
      img.onload = () => {
        const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
        const l = Math.round(img.width * escala);
        const a = Math.round(img.height * escala);
        const tela = document.createElement('canvas');
        tela.width = l; tela.height = a;
        tela.getContext('2d').drawImage(img, 0, 0, l, a);
        tela.toBlob(
          b => b ? resolve(new File([b], arquivo.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }))
                 : reject(new Error('Falha ao processar a imagem.')),
          'image/jpeg', qualidade
        );
      };
      img.src = leitor.result;
    };
    leitor.readAsDataURL(arquivo);
  });
}

/* ── mensagens de erro ─────────────────────────────── */

function traduzErro(msg = '') {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return 'Email ou senha incorretos.';
  if (m.includes('email not confirmed')) return 'Email ainda não confirmado.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Muitas tentativas. Aguarde um instante.';
  if (m.includes('row-level security') || m.includes('violates row-level'))
    return 'Você não tem permissão para isso.';
  if (m.includes('duplicate key')) return 'Esse registro já existe.';
  if (m.includes('password should be')) return 'A senha precisa ter pelo menos 6 caracteres.';
  if (m.includes('failed to fetch') || m.includes('networkerror'))
    return 'Sem conexão com o servidor.';
  return msg;
}
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

// Recebido e pago por DIA (últimos ~60 dias) — para o filtro de 30 dias no painel.
export async function fluxoDiario(empresaId) {
  const { data, error } = await bd
    .from('fluxo_diario')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('dia');
  if (error) { console.warn('fluxo diário:', error.message); return []; }
  return data || [];
}

// Posição de cada parcela dentro da sua solicitação (nº, total e valor).
export async function posicaoParcelas(ids) {
  if (!ids || !ids.length) return {};
  const { data, error } = await bd.from('parcela_num').select('*').in('parcela_id', ids);
  if (error) { console.warn('posição parcelas:', error.message); return {}; }
  const m = {};
  (data || []).forEach(p => { m[p.parcela_id] = p; });
  return m;
}

// Histórico de pagamentos realizados da produtora (para a aba "Pagos").
export async function pagamentosRealizados(empresaId) {
  const { data, error } = await bd
    .from('pagamento_visao')
    .select('*')
    .eq('empresa_id', empresaId)
    .order('data', { ascending: false });
  if (error) { console.warn('pagamentos realizados:', error.message); return []; }
  return data || [];
}

// Encerra o evento (trava novos lançamentos). Reversível mudando a situação no cadastro.
export async function encerrarEvento(id) {
  const { error } = await bd.from('evento').update({ situacao: 'encerrado' }).eq('id', id);
  if (error) throw new Error(traduzErro(error.message));
}

// Exclui um evento (admin, e só se não estiver encerrado — regra no banco).
export async function apagarEvento(id) {
  const { error } = await bd.from('evento').delete().eq('id', id);
  if (error) throw new Error(traduzErro(error.message));
}
