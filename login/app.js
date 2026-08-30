// ═══════════════════════════════════════════════════════
// Backstage — inicialização e estrutura
// ═══════════════════════════════════════════════════════

import { bd, sessao, carregarSessao, sair, salvarPerfil, empresaAtual, membroAtual, definirEmpresaAtiva } from './nucleo.js';
import { APP } from './config.js';
import {
  esc, aviso, iniciarModal, abrirModal, fecharModal, comBotao,
  iniciais, aplicarTema, temaAtual, alternarTema, 
  alternarPrivado, privadoAtivo, registrarView
} from './ui.js';
import { telaLogin } from './login.js';
import { telaEventos } from './eventos.js';
import { telaPainelEmpresa } from './painel_empresa.js';
import { telaUsuarios } from './usuarios.js';
import { telaFornecedores } from './fornecedores.js';
import { telaProdutora } from './produtora.js';
import { telaPagamentos } from './pagamentos.js';

aplicarTema(temaAtual());
iniciarModal();

/* ── partida ───────────────────────────────────────── */

function passo(texto) {
  const el = document.getElementById('carregando-texto');
  if (el) el.textContent = texto;
}

async function iniciar() {
  // Chegada pelo link de recuperação de senha
  const hash = new URLSearchParams(window.location.hash.slice(1));
  if (hash.get('type') === 'recovery') {
    return telaLogin(entrarNoSistema, 'nova-senha');
  }

  try {
    passo('Verificando sua sessão...');
    const usuario = await carregarSessao();
    if (!usuario) return telaLogin(entrarNoSistema);
    passo('Carregando seus dados...');
    await montarEstrutura();
  } catch (e) {
    console.error(e);
    // Sessão inválida ou perfil ausente não é motivo para travar:
    // devolve para o login, que é a ação útil.
    if (String(e.message || '').match(/jwt|session|token|not authenticated/i)) {
      return telaLogin(entrarNoSistema);
    }
    window.BACKSTAGE_FALHA?.(
      'Consegui conectar, mas falhei ao carregar seus dados.',
      String(e.message || e)
    );
  }
}

async function entrarNoSistema() {
  await carregarSessao();
  await montarEstrutura();
}

/* ── estrutura interna ─────────────────────────────── */

const SECOES = [
  { id: 'painel', rotulo: 'Painel', tela: telaPainelEmpresa, perm: 'ver_painel' },
  { id: 'eventos',      rotulo: 'Eventos',      tela: telaEventos,      sempre: true },
  { id: 'pagamentos',   rotulo: 'Pagamentos',   tela: telaPagamentos,   pagador: true },
  { id: 'fornecedores', rotulo: 'Fornecedores', tela: telaFornecedores, perm: 'gerir_fornecedores' },
  { id: 'usuarios',     rotulo: 'Usuários',     tela: telaUsuarios,     perm: 'gerir_usuarios' },
  { id: 'produtora',    rotulo: 'Produtora',    tela: telaProdutora,    sempre: true },
];

function secoesVisiveis() {
  const m = membroAtual();
  const admin = m && (m.papel === 'mestre' || m.papel === 'administrador');
  // A agenda é de quem paga: administradores, ou quem tem a
  // permissão de confirmar pagamento em algum evento.
  const pagador = admin || sessao.permissoesPagamento === true;
  return SECOES.filter(s =>
    s.sempre || admin || (s.pagador && pagador) || (s.perm && m && m[s.perm]));
}

async function montarEstrutura() {
  const app = document.getElementById('app');
  const secoes = secoesVisiveis();
  const empresa = empresaAtual();

  app.innerHTML = `
    <header class="topo">
      ${secoes.length > 1 ? `<button class="btn-menu" id="btn-menu" aria-label="Abrir menu"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg></button>` : ''}
      <span class="marca" style="display:inline-flex;align-items:center;gap:8px"><svg width="20" height="20" viewBox="0 0 64 64" fill="currentColor" aria-hidden="true" style="flex-shrink:0"><rect x="10" y="8" width="12" height="48"/><rect x="31" y="11" width="20" height="14" fill="none" stroke="currentColor" stroke-width="6"/><rect x="28" y="36" width="26" height="20"/></svg>${esc(APP.nome)}</span>
      ${empresa ? `
        <button class="topo-empresa" id="btn-empresa" ${secoes.length && sessao.membros.length > 1 ? 'title="Trocar de produtora"' : 'disabled'} style="border:none;font-family:inherit;cursor:${sessao.membros.length > 1 ? 'pointer' : 'default'}">
          ${empresa.logo_url
            ? `<img src="${esc(empresa.logo_url)}" alt="">`
            : `<span class="sigla">${esc(iniciais(empresa.nome))}</span>`}
          <span class="nome">${esc(empresa.nome)}</span>
          ${sessao.membros.length > 1 ? '<span style="color:var(--texto-3);font-size:11px;margin-left:1px">▾</span>' : ''}
        </button>` : ''}
      ${secoes.length > 1 ? `
        <nav class="navegacao" id="nav">
          ${secoes.map((s, i) => `
            <button class="nav-item ${i === 0 ? 'ativo' : ''}" data-secao="${s.id}">${esc(s.rotulo)}</button>
          `).join('')}
        </nav>` : ''}
      <div class="espaco"></div>
      <button id="btn-olho" aria-label="Mostrar ou ocultar valores" style="background:none;border:none;cursor:pointer;color:var(--texto-2);display:flex;align-items:center;padding:6px;margin-right:2px"></button> 
      <button class="avatar" id="btn-conta" aria-label="Sua conta">${esc(iniciais(sessao.usuario.nome))}</button>
    </header>
    <div class="nav-backdrop" id="nav-backdrop" hidden></div>
    <main class="conteudo" id="conteudo"></main>
  `;
  app.hidden = false;
  document.getElementById('carregando').hidden = true;

  document.getElementById('btn-conta').addEventListener('click', e => {
    e.stopPropagation();
    alternarMenuConta();
  });
  const btnEmpresa = document.getElementById('btn-empresa');
  if (btnEmpresa && sessao.membros.length > 1) {
    btnEmpresa.addEventListener('click', e => { e.stopPropagation(); alternarMenuEmpresa(); });
  }
const olho = document.getElementById('btn-olho');
  const pintarOlho = () => { olho.innerHTML = iconeOlho(privadoAtivo()); };
  pintarOlho();
  olho.addEventListener('click', () => { alternarPrivado(); pintarOlho(); });
  const backdrop = document.getElementById('nav-backdrop');
  const fecharMenu = () => { document.body.classList.remove('menu-aberto'); if (backdrop) backdrop.hidden = true; };
  const abrirMenu  = () => { document.body.classList.add('menu-aberto');    if (backdrop) backdrop.hidden = false; };
  document.getElementById('btn-menu')?.addEventListener('click', abrirMenu);
  backdrop?.addEventListener('click', fecharMenu);
  app.querySelectorAll('[data-secao]').forEach(b => {
    b.addEventListener('click', () => { fecharMenu(); irPara(b.dataset.secao); });
  });

  document.addEventListener('voltar-eventos', () => irPara('eventos'));

  document.addEventListener('produtora-alterada', () => {
    const e = empresaAtual();
    const alvo = app.querySelector('.topo-empresa .nome');
    if (alvo && e) alvo.textContent = e.nome;
  });

  await irPara(secoes[0].id);
}

async function irPara(id) {
  const secao = SECOES.find(s => s.id === id);
  if (!secao) return;
  document.querySelectorAll('[data-secao]').forEach(b =>
    b.classList.toggle('ativo', b.dataset.secao === id));
  registrarView(() => irPara(id));
  try { await secao.tela(); }
  catch (e) { aviso(e.message, 'erro'); }
}

/* ── menu da conta ─────────────────────────────────── */

function alternarMenuConta() {
  const existente = document.querySelector('.menu-conta');
  if (existente) return existente.remove();

  const menu = document.createElement('div');
  menu.className = 'menu-conta';
  menu.innerHTML = `
    <div class="info">
      <div class="nome">${esc(sessao.usuario.nome)}</div>
      <div class="email">${esc(sessao.usuario.email)}</div>
    </div>
    <div class="separador"></div>
    <button data-acao="perfil">Meus dados</button>
    <button data-acao="tema">${temaAtual() === 'escuro' ? 'Tema claro' : 'Tema escuro'}</button>
    <div class="separador"></div>
    <button data-acao="sair">Sair</button>
  `;
  document.getElementById('app').appendChild(menu);

  menu.addEventListener('click', async e => {
    const acao = e.target.dataset?.acao;
    if (!acao) return;
    menu.remove();
    if (acao === 'sair') { await sair(); telaLogin(entrarNoSistema); }
    if (acao === 'tema') alternarTema();
    if (acao === 'perfil') modalPerfil();
  });

  setTimeout(() => {
    document.addEventListener('click', function fechar(ev) {
      if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', fechar); }
    });
  }, 0);
}

/* ── meus dados ────────────────────────────────────── */

function modalPerfil() {
  const u = sessao.usuario;
  abrirModal('Meus dados', `
    <form id="fp">
      <div class="campo">
        <label for="p-nome">Nome</label>
        <input class="controle" id="p-nome" value="${esc(u.nome)}" required>
      </div>
      <div class="linha linha-2">
        <div class="campo">
          <label for="p-cpf">CPF</label>
          <input class="controle" id="p-cpf" value="${esc(u.cpf)}" placeholder="000.000.000-00" inputmode="numeric">
        </div>
        <div class="campo">
          <label for="p-tel">WhatsApp</label>
          <input class="controle" id="p-tel" value="${esc(u.telefone)}" placeholder="71 99999-9999" inputmode="tel">
        </div>
      </div>
      <div class="campo">
        <label>Email</label>
        <input class="controle" value="${esc(u.email)}" disabled>
        <div class="dica">O email é seu acesso e não pode ser alterado por aqui</div>
      </div>
      <div class="modal-acoes">
        <button type="button" class="botao" id="p-cancelar">Cancelar</button>
        <button type="submit" class="botao botao-primario" id="p-salvar">Salvar</button>
      </div>
    </form>
  `);

  document.getElementById('p-cancelar').addEventListener('click', fecharModal);
  document.getElementById('fp').addEventListener('submit', async e => {
    e.preventDefault();
    const nome = document.getElementById('p-nome').value.trim();
    if (!nome) return aviso('Informe seu nome.', 'aviso');

    await comBotao(document.getElementById('p-salvar'), async () => {
      try {
        await salvarPerfil({
          nome,
          cpf: document.getElementById('p-cpf').value,
          telefone: document.getElementById('p-tel').value,
        });
        document.getElementById('btn-conta').textContent = iniciais(nome);
        aviso('Dados atualizados.');
        fecharModal();
      } catch (err) { aviso(err.message, 'erro'); }
    });
  });
}

/* ── sessão expirada em outra aba ──────────────────── */

bd.auth.onAuthStateChange((evento) => {
  if (evento === 'SIGNED_OUT') {
    sessao.usuario = null;
    telaLogin(entrarNoSistema);
  }
});

iniciar();
function iconeOlho(oculto) {
  const base = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>';
  return base + (oculto ? '<line x1="3" y1="3" x2="21" y2="21"/>' : '') + '</svg>';
}

/* ── trocador de produtora ─────────────────────────── */
function alternarMenuEmpresa() {
  const existente = document.querySelector('.menu-empresa');
  if (existente) return existente.remove();

  const menu = document.createElement('div');
  menu.className = 'menu-conta menu-empresa';
  menu.style.left = '12px';
  menu.style.right = 'auto';
  menu.innerHTML = `
    <div class="info"><div class="nome" style="font-size:12px;color:var(--texto-2)">Trocar de produtora</div></div>
    <div class="separador"></div>
    ${sessao.membros.map(m => {
      const e = m.empresa;
      const ativa = e?.id === empresaAtual()?.id;
      return `<button data-emp="${esc(e?.id)}">${esc(e?.nome || '—')}${ativa ? '  ✓' : ''}</button>`;
    }).join('')}
  `;
  document.getElementById('app').appendChild(menu);

  menu.addEventListener('click', e => {
    const id = e.target.dataset?.emp;
    if (!id) return;
    menu.remove();
    if (id !== empresaAtual()?.id) { definirEmpresaAtiva(id); montarEstrutura(); }
  });

  setTimeout(() => {
    document.addEventListener('click', function fechar(ev) {
      if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('click', fechar); }
    });
  }, 0);
}
