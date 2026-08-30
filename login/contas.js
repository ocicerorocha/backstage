// ═══════════════════════════════════════════════════════
// Contas — saldo por conta + fluxo de caixa (nível produtora)
//
// Conta é só um NOME. Ao pagar marca "de onde saiu", ao receber
// "onde entrou". A aba mostra o saldo de cada conta e o extrato
// (fluxo de caixa) com filtros por conta e por entradas/saídas.
// ═══════════════════════════════════════════════════════

import { empresaAtual, souAdmin, saldoContas, salvarConta, arquivarConta, fluxoCaixa } from './nucleo.js';
import { esc, aviso, abrirModal, fecharModal, comBotao, moeda, dataBR } from './ui.js';

let _emp = null;
let _saldos = [];
let _fluxo = [];
let _fConta = '';   // '' = todas
let _fTipo = '';    // '' = tudo | 'entrada' | 'saida'

export async function telaContas() {
  const alvo = document.querySelector('#conteudo');
  _emp = empresaAtual();
  if (!_emp) { alvo.innerHTML = `<div class="vazio"><h3>Sem produtora</h3></div>`; return; }

  alvo.innerHTML = `<div style="padding:40px;text-align:center;color:var(--texto-2)">Carregando contas...</div>`;
  try {
    [_saldos, _fluxo] = await Promise.all([saldoContas(_emp.id), fluxoCaixa(_emp.id)]);
  } catch (e) {
    alvo.innerHTML = `<div class="vazio"><h3>Não consegui carregar</h3><p>${esc(e.message)}</p></div>`;
    return;
  }
  pintar();
}

function pintar() {
  const alvo = document.querySelector('#conteudo');
  const admin = souAdmin(_emp.id);
  const nomeDe = {}; _saldos.forEach(c => { nomeDe[c.conta_id] = c.nome; });
  const totalSaldo = _saldos.reduce((a, c) => a + Number(c.saldo || 0), 0);

  let mov = _fluxo;
  if (_fConta) mov = mov.filter(m => m.conta_id === _fConta);
  if (_fTipo)  mov = mov.filter(m => m.direcao === _fTipo);
  const entradas = mov.filter(m => m.direcao === 'entrada').reduce((a, m) => a + Number(m.valor || 0), 0);
  const saidas   = mov.filter(m => m.direcao === 'saida').reduce((a, m) => a + Number(m.valor || 0), 0);

  alvo.innerHTML = `
    <div class="pagina-topo">
      <h1>Contas</h1>
      <div class="espaco"></div>
      ${admin ? `<button class="botao botao-primario" id="c-nova">Nova conta</button>` : ''}
    </div>

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px">
      <button class="conta-chip ${_fConta === '' ? 'on' : ''}" data-fconta="">Todas <span class="s ${totalSaldo >= 0 ? 'v' : 'r'}">${moeda(totalSaldo)}</span></button>
      ${_saldos.map(c => `
        <button class="conta-chip ${_fConta === c.conta_id ? 'on' : ''}" data-fconta="${esc(c.conta_id)}">
          ${esc(c.nome)} <span class="s ${Number(c.saldo) >= 0 ? 'v' : 'r'}">${moeda(c.saldo)}</span>
          ${admin ? `<span class="edit" data-editar-conta="${esc(c.conta_id)}" data-nome="${esc(c.nome)}" title="Editar">✎</span>` : ''}
        </button>`).join('')}
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-bottom:12px">
      <h2 style="font-size:15px;margin:0">Fluxo de caixa${_fConta ? ` · ${esc(nomeDe[_fConta] || '')}` : ''}</h2>
      <div class="abas" style="margin:0;border:none">
        <button class="aba ${_fTipo === '' ? 'ativa' : ''}" data-ftipo="">Tudo</button>
        <button class="aba ${_fTipo === 'entrada' ? 'ativa' : ''}" data-ftipo="entrada">Entradas</button>
        <button class="aba ${_fTipo === 'saida' ? 'ativa' : ''}" data-ftipo="saida">Saídas</button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px">
      <div class="metrica"><div class="rotulo">Entradas</div><div class="valor" style="color:var(--verde)">${moeda(entradas)}</div></div>
      <div class="metrica"><div class="rotulo">Saídas</div><div class="valor" style="color:var(--vermelho)">${moeda(saidas)}</div></div>
      <div class="metrica"><div class="rotulo">Líquido</div><div class="valor" style="color:${(entradas - saidas) >= 0 ? 'var(--verde)' : 'var(--vermelho)'}">${moeda(entradas - saidas)}</div></div>
    </div>

    ${mov.length ? `
      <div class="cartao" style="padding:0;overflow:hidden">
        ${mov.map(m => `
          <div class="linha-lista">
            <div style="flex:1;min-width:0">
              <div style="font-weight:500;font-size:14px">${esc(m.descricao || '—')}</div>
              <div style="font-size:12px;color:var(--texto-2)">
                ${dataBR(m.data)} · ${esc(m.evento_nome || '')}${m.conta_id && nomeDe[m.conta_id] ? ' · ' + esc(nomeDe[m.conta_id]) : ' · sem conta'}${m.favorecido ? ' · ' + esc(m.favorecido) : ''}
              </div>
            </div>
            <span class="num" style="font-weight:600;flex-shrink:0;color:${m.direcao === 'entrada' ? 'var(--verde)' : 'var(--vermelho)'}">
              ${m.direcao === 'entrada' ? '+' : '−'}${moeda(Math.abs(Number(m.valor || 0)))}
            </span>
          </div>`).join('')}
      </div>` : `
      <div class="vazio">
        <h3>Sem movimentos</h3>
        <p>Pagamentos e recebimentos com conta aparecem aqui.${_saldos.length ? '' : ' Cadastre uma conta e marque-a ao pagar/receber.'}</p>
        ${admin && !_saldos.length ? `<button class="botao botao-primario" id="c-nova2">Nova conta</button>` : ''}
      </div>`}
  `;

  alvo.querySelector('#c-nova')?.addEventListener('click', () => modalConta(null, ''));
  alvo.querySelector('#c-nova2')?.addEventListener('click', () => modalConta(null, ''));
  alvo.querySelectorAll('[data-fconta]').forEach(el =>
    el.addEventListener('click', e => { if (e.target.closest('[data-editar-conta]')) return; _fConta = el.dataset.fconta; pintar(); }));
  alvo.querySelectorAll('[data-ftipo]').forEach(el =>
    el.addEventListener('click', () => { _fTipo = el.dataset.ftipo; pintar(); }));
  alvo.querySelectorAll('[data-editar-conta]').forEach(el =>
    el.addEventListener('click', e => { e.stopPropagation(); modalConta(el.dataset.editarConta, el.dataset.nome); }));
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

async function arquivar(id) {
  if (!confirm('Arquivar esta conta? Ela some das listas, mas o histórico fica.')) return;
  try { await arquivarConta(id); aviso('Conta arquivada.'); fecharModal(); await telaContas(); }
  catch (e) { aviso(e.message, 'erro'); }
}
