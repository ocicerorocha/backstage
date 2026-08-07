// ═══════════════════════════════════════════════════════
// Tela de entrada
// ═══════════════════════════════════════════════════════

import { entrar, recuperarSenha, definirSenha } from './nucleo.js';
import { APP } from './config.js';
import { aviso, comBotao, esc } from './ui.js';

export function telaLogin(aoEntrar, modo = 'entrar') {
  const app = document.getElementById('app');

  if (modo === 'nova-senha') return telaNovaSenha(app, aoEntrar);

  app.innerHTML = `
    <div class="login-tela">
      <div class="login-caixa">
        <div class="login-marca">
          <div class="nome">${esc(APP.nome)}</div>
          <div class="desc">${esc(APP.descricao)}</div>
        </div>

        <div class="cartao">
          <div id="erro" class="login-erro" hidden></div>

          <form id="form">
            <div class="campo">
              <label for="email">Email</label>
              <input class="controle" type="email" id="email" autocomplete="email"
                     placeholder="voce@produtora.com.br" required>
            </div>
            <div class="campo">
              <label for="senha">Senha</label>
              <input class="controle" type="password" id="senha" autocomplete="current-password" required>
            </div>
            <button class="botao botao-primario botao-largo" id="btn" type="submit">Entrar</button>
          </form>

          <div style="text-align:center;margin-top:14px">
            <button class="botao" id="esqueci"
                    style="border:none;background:none;height:auto;padding:4px;font-size:13px;color:var(--texto-2)">
              Esqueci minha senha
            </button>
          </div>
        </div>

        <div class="login-rodape">Uma ferramenta ${esc(APP.fabricante)}</div>
      </div>
    </div>
  `;

  const erro = app.querySelector('#erro');
  const mostrarErro = t => { erro.textContent = t; erro.hidden = false; };

  app.querySelector('#form').addEventListener('submit', async e => {
    e.preventDefault();
    erro.hidden = true;
    const email = app.querySelector('#email').value;
    const senha = app.querySelector('#senha').value;
    if (!email || !senha) return mostrarErro('Preencha email e senha.');

    await comBotao(app.querySelector('#btn'), async () => {
      try {
        await entrar(email, senha);
        await aoEntrar();
      } catch (e) {
        mostrarErro(e.message);
      }
    });
  });

  app.querySelector('#esqueci').addEventListener('click', () => {
    const email = app.querySelector('#email').value.trim();
    if (!email) return mostrarErro('Digite seu email acima e clique de novo.');
    erro.hidden = true;
    recuperarSenha(email)
      .then(() => aviso('Enviamos um link de recuperação para ' + email))
      .catch(e => mostrarErro(e.message));
  });

  app.hidden = false;
  document.getElementById('carregando').hidden = true;
  setTimeout(() => app.querySelector('#email')?.focus(), 50);
}

/* Tela mostrada quando a pessoa chega pelo link de recuperação */
function telaNovaSenha(app, aoEntrar) {
  app.innerHTML = `
    <div class="login-tela">
      <div class="login-caixa">
        <div class="login-marca">
          <div class="nome">${esc(APP.nome)}</div>
          <div class="desc">Defina sua nova senha</div>
        </div>
        <div class="cartao">
          <div id="erro" class="login-erro" hidden></div>
          <form id="form">
            <div class="campo">
              <label for="s1">Nova senha</label>
              <input class="controle" type="password" id="s1" autocomplete="new-password" required>
              <div class="dica">Pelo menos 6 caracteres</div>
            </div>
            <div class="campo">
              <label for="s2">Repita a nova senha</label>
              <input class="controle" type="password" id="s2" autocomplete="new-password" required>
            </div>
            <button class="botao botao-primario botao-largo" id="btn" type="submit">Salvar senha</button>
          </form>
        </div>
        <div class="login-rodape">Uma ferramenta ${esc(APP.fabricante)}</div>
      </div>
    </div>
  `;

  const erro = app.querySelector('#erro');
  app.querySelector('#form').addEventListener('submit', async e => {
    e.preventDefault();
    erro.hidden = true;
    const s1 = app.querySelector('#s1').value;
    const s2 = app.querySelector('#s2').value;
    if (s1.length < 6) { erro.textContent = 'A senha precisa ter pelo menos 6 caracteres.'; erro.hidden = false; return; }
    if (s1 !== s2) { erro.textContent = 'As senhas não conferem.'; erro.hidden = false; return; }

    await comBotao(app.querySelector('#btn'), async () => {
      try {
        await definirSenha(s1);
        aviso('Senha atualizada.');
        history.replaceState(null, '', window.location.pathname);
        await aoEntrar();
      } catch (e) {
        erro.textContent = e.message; erro.hidden = false;
      }
    });
  });

  app.hidden = false;
  document.getElementById('carregando').hidden = true;
}
