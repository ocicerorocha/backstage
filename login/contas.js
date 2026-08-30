// ═══════════════════════════════════════════════════════
// Contas — fluxo de caixa por conta (nível produtora)
//
// Conta é só um NOME (banco, caixinha, conta de sócio…).
// Ao pagar marca "de onde saiu", ao receber "onde entrou".
// Aporte entra (+) e devolução sai (-). Saldo = entradas − saídas.
// ═══════════════════════════════════════════════════════

import {
  empresaAtual, souAdmin, saldoContas, salvarConta, arquivarConta, registrarMovimentoConta,
} from './nucleo.js';
import { esc, aviso, abrirModal, fecharModal, comBotao, moeda } from './ui.js';

let _emp = null;

export async function telaContas() {
  const alvo = document.querySelector('#conteudo');
  _emp = empresaAtual();
  if (!_emp) { alvo.innerHTML = `<div class="vazio"><h3>Sem produtora</h3></div>`; return; }
  const admin = souAdmin(_emp.id);

  alvo.innerHTML = `<div style="padding:40px;text-align:center;color:var(--texto-2)">Carregando contas...</div>`;
  let saldos = [];
  try { saldos = await saldoContas(_emp.id); }
  catch (e) { alvo.innerHTML = `<div class="vazio"><h3>Não consegui carregar</h3><p>${esc(e.message)}</p></div>`; return; }

  const total = saldos.reduce((a, c) => a + Number(c.saldo || 0), 0);

  alvo.innerHTML = `
    <div class="pagina-topo">
      <h1>Contas</h1>
      <div class="espaco"></div>
      ${admin ? `<button class="botao botao-primario" id="c-nova">Nova conta</button>` : ''}
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:18px">
      <div class="metrica">
        <div class="rotulo">Saldo total</div>
        <div class="valor" style="color:${total >= 0 ? 'var(--verde)' : 'var(--vermelho)'}">${moeda(total)}</div>
        <div class="rotulo" style="margin-top:2px">${saldos.length} conta(s)</div>
      </div>
    </div>

    ${saldos.length ? `
      <div class="cartao" style="padding:0;overflow:hidden">
        ${saldos.map(c => linhaConta(c, admin)).join('')}
      </div>` : `
      <div class="vazio">
        <h3>Nenhuma conta ainda</h3>
        <p>Cadastre as contas da produtora (banco, caixinha, conta de sócio…). Ao pagar e receber, você marca de onde sai e onde entra — e vê o saldo de cada uma.</p>
        ${admin ? `<button class="botao botao-primario" id="c-nova2">Nova conta</button>` : ''}
      </div>`}
  `;

  alvo.querySelector('#c-nova')?.addEventListener('click', () => modalConta(null, ''));
  alvo.querySelector('#c-nova2')?.addEventListener('click', () => modalConta(null, ''));
  alvo.querySelectorAll('[data-editar-conta]').forEach(el =>
    el.addEventListener('click', () => modalConta(el.dataset.editarConta, el.dataset.nome)));
  alvo.querySelectorAll('[data-mov]').forEach(el =>
    el.addEventListener('click', () => modalMovimento(el.dataset.mov, el.dataset.nome, el.dataset.tipo)));
}

function linhaConta(c, admin) {
  const saldo = Number(c.saldo || 0);
  return `
    <div class="linha-lista">
      <div style="flex:1;min-width:0">
        <div style="font-weight:500;font-size:14px">${esc(c.nome)}</div>
        <div style="font-size:12px;color:var(--texto-2)">saldo atual</div>
      </div>
      <div style="text-align:right;flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:6px">
        <span class="num" style="font-weight:600;color:${saldo >= 0 ? 'var(--verde)' : 'var(--vermelho)'}">${moeda(saldo)}</span>
        ${admin ? `
          <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
            <button class="botao" style="height:28px;font-size:12px;padding:0 9px" data-mov="${esc(c.conta_id)}" data-nome="${esc(c.nome)}" data-tipo="aporte">+ Aporte</button>
            <button class="botao" style="height:28px;font-size:12px;padding:0 9px" data-mov="${esc(c.conta_id)}" data-nome="${esc(c.nome)}" data-tipo="devolucao">− Devolução</button>
            <button class="botao" style="height:28px;font-size:12px;padding:0 9px" data-editar-conta="${esc(c.conta_id)}" data-nome="${esc(c.nome)}">Editar</button>
          </div>` : ''}
      </div>
    </div>`;
}

function modalConta(id, nome) {
  abrirModal(id ? 'Editar conta' : 'Nova conta', `
    <form id="fc">
      <div class="campo">
        <label for="cc-nome">Nome da conta</label>
        <input class="controle" id="cc-nome" value="${esc(nome || '')}" placeholder="Ex.: Banco X · Caixinha · Conta do João" required>
        <div class="dica">É só um nome — a equipe sabe de quem é o quê.</div>
      </div>
      <div class="modal-acoes">
        ${id ? `<button type="button" class="botao botao-perigo" id="cc-arquivar" style="margin-right:auto">Arquivar</button>` : ''}
        <button type="button" class="botao" id="cc-cancelar">Cancelar</button>
        <button type="submit" class="botao botao-primario" id="cc-salvar">Salvar</button>
      </div>
    </form>
  `);
  document.getElementById('cc-cancelar').addEventListener('click', fecharModal);
  document.getElementById('cc-arquivar')?.addEventListener('click', () => arquivar(id));
  document.getElementById('fc').addEventListener('submit', async e => {
    e.preventDefault();
    const nomeVal = document.getElementById('cc-nome').value.trim();
    if (!nomeVal) return aviso('Informe o nome da conta.', 'aviso');
    await comBotao(document.getElementById('cc-salvar'), async () => {
      try { await salvarConta(_emp.id, id, nomeVal); aviso('Conta salva.'); fecharModal(); await telaContas(); }
      catch (err) { aviso(err.message, 'erro'); }
    });
  });
}

function modalMovimento(contaId, nome, tipo) {
  const ehAporte = tipo === 'aporte';
  abrirModal(ehAporte ? 'Registrar aporte' : 'Registrar devolução', `
    <div style="font-size:13px;color:var(--texto-2);margin-bottom:12px">Conta: <b>${esc(nome)}</b></div>
    <form id="fm">
      <div class="linha linha-2">
        <div class="campo"><label for="m-valor">Valor</label><input class="controle" id="m-valor" type="number" min="0.01" step="0.01" required></div>
        <div class="campo"><label for="m-data">Data</label><input class="controle" id="m-data" type="date" value="${new Date().toISOString().slice(0, 10)}"></div>
      </div>
      <div class="campo">
        <label for="m-socio">${ehAporte ? 'De quem veio' : 'Para quem'}</label>
        <input class="controle" id="m-socio" placeholder="Nome (opcional)">
      </div>
      <div class="campo"><label for="m-obs">Observação</label><input class="controle" id="m-obs" placeholder="Opcional"></div>
      <div class="modal-acoes">
        <button type="button" class="botao" id="m-cancelar">Cancelar</button>
        <button type="submit" class="botao botao-primario" id="m-salvar">Registrar</button>
      </div>
    </form>
  `);
  document.getElementById('m-cancelar').addEventListener('click', fecharModal);
  document.getElementById('fm').addEventListener('submit', async e => {
    e.preventDefault();
    const valor = Number(document.getElementById('m-valor').value) || 0;
    if (valor <= 0) return aviso('Informe o valor.', 'aviso');
    await comBotao(document.getElementById('m-salvar'), async () => {
      try {
        await registrarMovimentoConta(contaId, {
          tipo, valor,
          socio: document.getElementById('m-socio').value,
          data: document.getElementById('m-data').value,
          observacao: document.getElementById('m-obs').value,
        });
        aviso(ehAporte ? 'Aporte registrado.' : 'Devolução registrada.');
        fecharModal();
        await telaContas();
      } catch (err) { aviso(err.message, 'erro'); }
    });
  });
}

async function arquivar(id) {
  if (!confirm('Arquivar esta conta? Ela some das listas, mas o histórico fica.')) return;
  try { await arquivarConta(id); aviso('Conta arquivada.'); fecharModal(); await telaContas(); }
  catch (e) { aviso(e.message, 'erro'); }
}
