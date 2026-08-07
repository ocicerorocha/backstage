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
  usuario: null,   // { id, email, nome, cpf, telefone }
  membros: [],     // vínculos com empresas
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
  const { error } = await bd.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: window.location.origin + window.location.pathname,
  });
  if (error) throw new Error(traduzErro(error.message));
}

export async function definirSenha(novaSenha) {
  const { error } = await bd.auth.updateUser({ password: novaSenha });
  if (error) throw new Error(traduzErro(error.message));
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
