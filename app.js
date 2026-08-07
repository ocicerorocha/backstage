// ═══════════════════════════════════════════════════════
// Backstage — inicialização e estrutura
// ═══════════════════════════════════════════════════════

import { bd, sessao, carregarSessao, sair, salvarPerfil } from './nucleo.js';
import { APP } from './config.js';
import {
  esc, aviso, iniciarModal, abrirModal, fecharModal, comBotao,
  iniciais, aplicarTema, temaAtual, alternarTema,
} from './ui.js';
import { telaLogin } from './login.js';
import { telaEventos } from './eventos.js';

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

async function montarEstrutura() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <header class="topo">
      <span class="marca">${esc(APP.nome)}</span>
      <div class="espaco"></div>
      <button class="avatar" id="btn-conta" aria-label="Sua conta">${esc(iniciais(sessao.usuario.nome))}</button>
    </header>
    <main class="conteudo" id="conteudo"></main>
  `;
  app.hidden = false;
  document.getElementById('carregando').hidden = true;

  document.getElementById('btn-conta').addEventListener('click', e => {
    e.stopPropagation();
    alternarMenuConta();
  });

  await telaEventos();
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
