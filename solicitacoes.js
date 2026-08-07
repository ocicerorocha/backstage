// ═══════════════════════════════════════════════════════
// Solicitações e aprovações
//
// O produtor pede; quem aprova autoriza; quem paga confirma.
// O saldo disponível aparece ANTES de digitar o valor — a
// trava vira orientação, em vez de erro depois de preencher.
// ═══════════════════════════════════════════════════════

import {
  listarSolicitacoes, saldoItens, listarParcelas, criarSolicitacao,
  aprovarSolicitacao, recusarSolicitacao, cancelarSolicitacao,
  listarFornecedores, salvarFornecedor, empresaAtual, sessao,
  meiosPagamentoDaEmpresa, salvarMeioPagamento,
} from './nucleo.js';
import { esc, aviso, abrirModal, fecharModal, comBotao, moeda, dataBR, ligarCadastroRapido } from './ui.js';
import { contexto, recarregarItens } from './evento.js';

export const SITUACOES = {
  em_aberto:    { rotulo: 'Aguardando aprovação', classe: 'etiqueta-ambar' },
  aprovada:     { rotulo: 'Aprovada',             classe: 'etiqueta-acento' },
  paga_parcial: { rotulo: 'Paga parcialmente',    classe: 'etiqueta-acento' },
  paga:         { rotulo: 'Paga',                 classe: 'etiqueta-verde' },
  rejeitada:    { rotulo: 'Recusada',             classe: 'etiqueta-vermelha' },
  cancelada:    { rotulo: 'Cancelada',            classe: 'etiqueta-neutra' },
};

let _solicitacoes = [];
let _saldos = [];
let _parcelas = [];
let _fornecedores = [];
let _meios = [];
let _filtro = '';

export async function abaSolicitacoes(alvo, apenasFila = false) {
  alvo.innerHTML = `<div style="padding:36px;text-align:center;color:var(--texto-2)">Carregando...</div>`;
  try {
    const emp = empresaAtual();
    [_solicitacoes, _saldos, _fornecedores] = await Promise.all([
      listarSolicitacoes(contexto.evento.id),
      saldoItens(contexto.evento.id),
      _fornecedores.length ? Promise.resolve(_fornecedores) : listarFornecedores(emp.id),
    ]);
    _parcelas = await listarParcelas(_solicitacoes.map(s => s.id));
    _meios = await meiosPagamentoDaEmpresa(emp.id);
  } catch (e) {
    alvo.innerHTML = `<div class="vazio"><h3>Não consegui carregar</h3><p>${esc(e.message)}</p></div>`;
    return;
  }
  apenasFila ? desenharFila(alvo) : desenhar(alvo);
}

export async function abaAprovacoes(alvo) { return abaSolicitacoes(alvo, true); }

/* ── lista completa ────────────────────────────────── */

function desenhar(alvo) {
  const p = contexto.permissao || {};
  const podeCriar = (p.admin || p.criar_solicitacao) && contexto.evento.situacao !== 'encerrado';

  let lista = _solicitacoes;
  if (_filtro) lista = lista.filter(s => s.situacao === _filtro);

  const total = lista.reduce((a, s) => a + Number(s.valor), 0);
  const emAberto = _solicitacoes.filter(s => s.situacao === 'em_aberto');

  alvo.innerHTML = `
    <div class="barra-filtros">
      <select class="controle" id="s-filtro" style="width:auto;min-width:190px">
        <option value="">Todas as situações</option>
        ${Object.entries(SITUACOES).map(([v, s]) =>
          `<option value="${v}" ${_filtro === v ? 'selected' : ''}>${s.rotulo}</option>`).join('')}
      </select>
      <div style="flex:1"></div>
      ${podeCriar ? `<button class="botao botao-primario" id="s-nova">Solicitar pagamento</button>` : ''}
    </div>

    ${emAberto.length && (p.admin || p.aprovar_pagamento) ? `
      <div class="cartao" style="background:var(--ambar-fundo);border-color:var(--ambar);margin-bottom:14px">
        <div style="font-size:13px;color:var(--ambar)">
          ${emAberto.length} ${emAberto.length === 1 ? 'solicitação aguardando' : 'solicitações aguardando'} sua aprovação
          — ${moeda(emAberto.reduce((a, s) => a + Number(s.valor), 0))}
        </div>
      </div>` : ''}

    ${lista.length ? `
      <div class="tabela-rolagem">
        <table class="tabela">
          <thead>
            <tr>
              <th style="width:52px">Item</th>
              <th>Descrição</th>
              <th style="width:150px">Favorecido</th>
              <th style="width:120px" class="num">Valor</th>
              <th style="width:120px" class="num">Pago</th>
              <th style="width:170px">Situação</th>
            </tr>
          </thead>
          <tbody>${lista.map(linha).join('')}</tbody>
          <tfoot>
            <tr>
              <td colspan="3">${lista.length} ${lista.length === 1 ? 'solicitação' : 'solicitações'}</td>
              <td class="num" style="font-weight:600">${moeda(total)}</td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>
      </div>` : `
      <div class="vazio">
        <h3>${_filtro ? 'Nada nesta situação' : 'Nenhuma solicitação ainda'}</h3>
        <p>${_filtro ? 'Escolha outra situação.' : 'As solicitações de pagamento dos itens orçados aparecem aqui.'}</p>
        ${podeCriar && !_filtro ? `<button class="botao botao-primario" id="s-nova2">Solicitar pagamento</button>` : ''}
      </div>`}
  `;

  alvo.querySelector('#s-filtro')?.addEventListener('change', e => { _filtro = e.target.value; desenhar(alvo); });
  alvo.querySelector('#s-nova')?.addEventListener('click', () => modalNova(alvo));
  alvo.querySelector('#s-nova2')?.addEventListener('click', () => modalNova(alvo));
  alvo.querySelectorAll('[data-solic]').forEach(el =>
    el.addEventListener('click', () => modalDetalhe(el.dataset.solic, alvo)));
}

function linha(s) {
  const sit = SITUACOES[s.situacao] || SITUACOES.em_aberto;
  return `
    <tr data-solic="${esc(s.id)}" style="cursor:pointer">
      <td style="color:var(--texto-3);font-variant-numeric:tabular-nums">${String(s.item_numero).padStart(3, '0')}</td>
      <td>
        <div style="font-weight:500">${esc(s.item_descricao)}</div>
        <div style="font-size:12px;color:var(--texto-2)">
          ${esc(s.solicitante_nome || '—')} · ${dataBR(s.criado_em)}
        </div>
      </td>
      <td style="font-size:13px;color:var(--texto-2)">${esc(s.fornecedor_nome || '—')}</td>
      <td class="num" style="font-weight:500">${moeda(s.valor)}</td>
      <td class="num" style="color:${Number(s.pago) > 0 ? 'var(--verde)' : 'var(--texto-3)'}">
        ${Number(s.pago) > 0 ? moeda(s.pago) : '—'}
      </td>
      <td><span class="etiqueta ${sit.classe}">${sit.rotulo}</span></td>
    </tr>`;
}

/* ── fila de aprovação ─────────────────────────────── */

function desenharFila(alvo) {
  const p = contexto.permissao || {};
  if (!p.admin && !p.aprovar_pagamento) {
    alvo.innerHTML = `<div class="vazio"><h3>Sem acesso</h3><p>Você não tem permissão para aprovar pagamentos neste evento.</p></div>`;
    return;
  }

  const fila = _solicitacoes.filter(s => s.situacao === 'em_aberto');
  const teto = p.teto_aprovacao ? Number(p.teto_aprovacao) : null;

  alvo.innerHTML = `
    ${teto ? `<p class="dica" style="margin-bottom:12px">Sua alçada é de ${moeda(teto)} por solicitação.</p>` : ''}
    ${fila.length ? `
      <div style="display:flex;flex-direction:column;gap:10px">
        ${fila.map(s => {
          const acima = teto != null && Number(s.valor) > teto;
          const parcelas = _parcelas.filter(x => x.solicitacao_id === s.id);
          return `
          <div class="cartao">
            <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap">
              <div style="flex:1;min-width:200px">
                <div style="font-weight:500">
                  <span style="color:var(--texto-3);font-variant-numeric:tabular-nums">${String(s.item_numero).padStart(3, '0')}</span>
                  ${esc(s.item_descricao)}
                </div>
                <div style="font-size:13px;color:var(--texto-2);margin-top:2px">
                  ${esc(s.fornecedor_nome || 'sem favorecido')} · pedido por ${esc(s.solicitante_nome || '—')} em ${dataBR(s.criado_em)}
                </div>
                ${s.pag_divergente ? `
                  <div style="margin-top:6px">
                    <span class="etiqueta etiqueta-ambar">dados de pagamento diferentes do cadastro</span>
                  </div>` : ''}
                ${s.justificativa ? `<div style="font-size:13px;margin-top:6px">${esc(s.justificativa)}</div>` : ''}
                ${parcelas.length > 1 ? `
                  <div style="font-size:12px;color:var(--texto-2);margin-top:6px">
                    ${parcelas.length} parcelas: ${parcelas.map(x => `${dataBR(x.vencimento) || 'sem data'} ${moeda(x.valor)}`).join(' · ')}
                  </div>` : parcelas[0]?.vencimento ? `
                  <div style="font-size:12px;color:var(--texto-2);margin-top:6px">
                    Vence em ${dataBR(parcelas[0].vencimento)}
                  </div>` : ''}
              </div>
              <div style="text-align:right">
                <div style="font-size:19px;font-weight:600;font-variant-numeric:tabular-nums">${moeda(s.valor)}</div>
                ${acima ? `<div style="font-size:12px;color:var(--vermelho);margin-top:2px">acima da sua alçada</div>` : ''}
              </div>
            </div>
            <div style="display:flex;gap:8px;margin-top:14px;padding-top:12px;border-top:1px solid var(--borda);flex-wrap:wrap">
              <button class="botao botao-primario" data-aprovar="${esc(s.id)}" ${acima ? 'disabled' : ''}>Aprovar</button>
              <button class="botao" data-recusar="${esc(s.id)}">Recusar</button>
              <div style="flex:1"></div>
              <button class="botao" data-solic="${esc(s.id)}">Detalhes</button>
            </div>
          </div>`;
        }).join('')}
      </div>` : `
      <div class="vazio">
        <h3>Nada aguardando</h3>
        <p>Nenhuma solicitação pendente de aprovação neste evento.</p>
      </div>`}
  `;

  alvo.querySelectorAll('[data-aprovar]').forEach(b =>
    b.addEventListener('click', () => aprovar(b.dataset.aprovar, alvo, true)));
  alvo.querySelectorAll('[data-recusar]').forEach(b =>
    b.addEventListener('click', () => recusar(b.dataset.recusar, alvo, true)));
  alvo.querySelectorAll('[data-solic]').forEach(b =>
    b.addEventListener('click', () => modalDetalhe(b.dataset.solic, alvo, true)));
}

/* ── nova solicitação ──────────────────────────────── */

export function modalNova(alvo, itemId = null) {
  const disponiveis = _saldos.filter(s => Number(s.disponivel) > 0.005);
  if (!disponiveis.length) {
    return abrirModal('Solicitar pagamento', `
      <div class="vazio" style="border:none;padding:20px 0">
        <h3>Nenhum item com saldo</h3>
        <p>Todos os itens já estão totalmente comprometidos ou pagos. Aumente o valor orçado de um item para poder solicitar.</p>
      </div>
      <div class="modal-acoes">
        <button class="botao" onclick="document.getElementById('modal-fechar').click()">Fechar</button>
      </div>`);
  }

  const inicial = disponiveis.find(s => s.item_id === itemId) || disponiveis[0];

  abrirModal('Solicitar pagamento', `
    <form id="fs">
      <div class="campo">
        <label for="s-item">Item</label>
        <select class="controle" id="s-item">
          ${disponiveis.map(s => `
            <option value="${esc(s.item_id)}" ${s.item_id === inicial.item_id ? 'selected' : ''}>
              ${String(s.numero).padStart(3, '0')} · ${esc(s.descricao)}
            </option>`).join('')}
        </select>
        <div class="dica" id="s-saldo"></div>
      </div>

      <div class="linha linha-2">
        <div class="campo">
          <label for="s-forn">Favorecido</label>
          <select class="controle" id="s-forn">
            <option value="">— a definir —</option>
            ${_fornecedores.map(f => `<option value="${esc(f.id)}">${esc(f.nome)}</option>`).join('')}
            <option value="__novo">+ cadastrar fornecedor</option>
          </select>
        </div>
        <div class="campo">
          <label for="s-valor">Valor total</label>
          <input class="controle" id="s-valor" type="number" min="0.01" step="0.01" required>
        </div>
      </div>

      <div class="campo">
        <label>Parcelas</label>
        <div id="s-parcelas"></div>
        <button type="button" class="botao" id="s-add" style="height:32px;font-size:13px;margin-top:8px">
          + Acrescentar parcela
        </button>
        <div class="dica" id="s-conf"></div>
      </div>

      <div class="campo">
        <label>Para onde vai o dinheiro</label>
        <div class="cartao" style="background:var(--superficie-2);border:none;padding:12px">
          <div id="s-origem" class="dica" style="margin:0 0 10px"></div>

          <div class="linha linha-2" style="margin-bottom:0">
            <div class="campo" style="margin-bottom:10px">
              <label for="s-pag-tipo">Forma</label>
              <select class="controle" id="s-pag-tipo" style="height:36px;font-size:14px">
                <option value="pix">PIX</option>
                <option value="conta">Conta bancária</option>
              </select>
            </div>
            <div class="campo" style="margin-bottom:10px">
              <label for="s-pag-titular">Titular</label>
              <input class="controle" id="s-pag-titular" style="height:36px;font-size:14px">
            </div>
          </div>

          <div id="s-bloco-pix">
            <div class="campo" style="margin-bottom:10px">
              <label for="s-pag-chave">Chave PIX</label>
              <input class="controle" id="s-pag-chave" style="height:36px;font-size:14px"
                     placeholder="CNPJ, telefone, email ou chave aleatória">
            </div>
          </div>

          <div id="s-bloco-conta" hidden>
            <div class="linha linha-2">
              <div class="campo" style="margin-bottom:10px">
                <label for="s-pag-banco">Banco</label>
                <input class="controle" id="s-pag-banco" style="height:36px;font-size:14px">
              </div>
              <div class="campo" style="margin-bottom:10px">
                <label for="s-pag-ag">Agência</label>
                <input class="controle" id="s-pag-ag" style="height:36px;font-size:14px">
              </div>
            </div>
            <div class="campo" style="margin-bottom:10px">
              <label for="s-pag-conta">Conta</label>
              <input class="controle" id="s-pag-conta" style="height:36px;font-size:14px">
            </div>
          </div>

          <div id="s-aviso-div"></div>

          <label class="caixa-perm" id="s-salvar-cad-wrap" hidden style="margin-top:6px">
            <input type="checkbox" id="s-salvar-cad">
            <span>
              <span class="rot">Guardar no cadastro do fornecedor</span>
              <span class="desc">Passa a preencher sozinho nas próximas solicitações</span>
            </span>
          </label>
        </div>
      </div>

      <div class="campo">
        <label for="s-just">Justificativa</label>
        <textarea class="controle" id="s-just" placeholder="Opcional"></textarea>
      </div>

      <div class="modal-acoes">
        <button type="button" class="botao" id="s-cancelar">Cancelar</button>
        <button type="submit" class="botao botao-primario" id="s-salvar">Enviar solicitação</button>
      </div>
    </form>
  `);

  const q = s => document.querySelector(s);
  let parcelas = [{ vencimento: '', valor: '' }];

  const saldoDoItem = () => {
    const s = _saldos.find(x => x.item_id === q('#s-item').value);
    return s ? Number(s.disponivel) : 0;
  };

  const mostrarSaldo = () => {
    const d = saldoDoItem();
    q('#s-saldo').innerHTML =
      `Disponível para solicitar <strong style="color:var(--verde)">${moeda(d)}</strong>`;
  };

  const desenharParcelas = () => {
    q('#s-parcelas').innerHTML = parcelas.map((p, k) => `
      <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">
        <input class="controle p-venc" data-k="${k}" type="date" value="${p.vencimento}"
               style="height:36px;font-size:14px;flex:1">
        <input class="controle p-val num" data-k="${k}" type="number" min="0.01" step="0.01"
               value="${p.valor}" placeholder="valor" style="height:36px;font-size:14px;width:130px">
        ${parcelas.length > 1 ? `<button type="button" class="botao-icone p-rem" data-k="${k}">×</button>` : ''}
      </div>`).join('');

    q('#s-parcelas').querySelectorAll('.p-venc').forEach(el =>
      el.addEventListener('change', () => { parcelas[el.dataset.k].vencimento = el.value; }));
    q('#s-parcelas').querySelectorAll('.p-val').forEach(el =>
      el.addEventListener('input', () => { parcelas[el.dataset.k].valor = el.value; conferir(); }));
    q('#s-parcelas').querySelectorAll('.p-rem').forEach(el =>
      el.addEventListener('click', () => { parcelas.splice(el.dataset.k, 1); desenharParcelas(); conferir(); }));
    conferir();
  };

  const conferir = () => {
    const total = Number(q('#s-valor').value) || 0;
    const soma = parcelas.reduce((a, p) => a + (Number(p.valor) || 0), 0);
    const d = saldoDoItem();
    const el = q('#s-conf');
    if (total > d + 0.005) {
      el.innerHTML = `<span style="color:var(--vermelho)">O valor passa o disponível do item (${moeda(d)}).</span>`;
    } else if (Math.abs(soma - total) > 0.005) {
      el.innerHTML = `<span style="color:var(--ambar)">As parcelas somam ${moeda(soma)} de ${moeda(total)}.</span>`;
    } else {
      el.innerHTML = `<span style="color:var(--verde)">Parcelas conferem com o total.</span>`;
    }
  };

  q('#s-item').addEventListener('change', () => { mostrarSaldo(); conferir(); });
  q('#s-valor').addEventListener('input', () => {
    if (parcelas.length === 1) { parcelas[0].valor = q('#s-valor').value; desenharParcelas(); }
    else conferir();
  });
  q('#s-add').addEventListener('click', () => {
    const total = Number(q('#s-valor').value) || 0;
    const soma = parcelas.reduce((a, p) => a + (Number(p.valor) || 0), 0);
    parcelas.push({ vencimento: '', valor: Math.max(total - soma, 0).toFixed(2) });
    desenharParcelas();
  });
  q('#s-cancelar').addEventListener('click', fecharModal);

  ligarCadastroRapido('#s-forn', _fornecedores,
    async nome => {
      const novo = await salvarFornecedor(empresaAtual().id, null, { nome });
      setTimeout(preencherPagamento, 0);
      return novo;
    });

  /* ── dados de pagamento ── */

  const meioDoFornecedor = id => _meios.find(m => m.fornecedor_id === id) || null;

  const alternarBlocos = () => {
    const pix = q('#s-pag-tipo').value === 'pix';
    q('#s-bloco-pix').hidden = !pix;
    q('#s-bloco-conta').hidden = pix;
  };

  const conferirDivergencia = () => {
    const m = meioDoFornecedor(q('#s-forn').value);
    const el = q('#s-aviso-div');
    if (!m) { el.innerHTML = ''; q('#s-salvar-cad-wrap').hidden = !q('#s-forn').value || q('#s-forn').value === '__novo'; return; }

    const mudouChave = (q('#s-pag-chave').value || '').trim() !== (m.chave_pix || '');
    const mudouConta = (q('#s-pag-conta').value || '').trim() !== (m.conta || '');

    if (mudouChave || mudouConta) {
      el.innerHTML = `
        <div class="cartao" style="background:var(--ambar-fundo);border-color:var(--ambar);padding:10px;margin-top:4px">
          <div style="font-size:12px;color:var(--ambar)">
            <strong>Diferente do cadastro.</strong><br>
            ${mudouChave ? `Cadastro: ${esc(m.chave_pix || '—')}<br>` : ''}
            ${mudouConta ? `Conta no cadastro: ${esc(m.conta || '—')}<br>` : ''}
            Quem for confirmar o pagamento verá este aviso.
          </div>
        </div>`;
      q('#s-salvar-cad-wrap').hidden = false;
    } else {
      el.innerHTML = '';
      q('#s-salvar-cad-wrap').hidden = true;
      q('#s-salvar-cad').checked = false;
    }
  };

  function preencherPagamento() {
    const id = q('#s-forn').value;
    const m = id && id !== '__novo' ? meioDoFornecedor(id) : null;
    if (m) {
      q('#s-pag-tipo').value = m.tipo || 'pix';
      q('#s-pag-chave').value = m.chave_pix || '';
      q('#s-pag-banco').value = m.banco || '';
      q('#s-pag-ag').value = m.agencia || '';
      q('#s-pag-conta').value = m.conta || '';
      q('#s-pag-titular').value = m.titular || '';
      q('#s-origem').innerHTML = '<span style="color:var(--verde)">Preenchido com os dados do cadastro do fornecedor. Confira e edite se precisar.</span>';
    } else if (id && id !== '__novo') {
      ['#s-pag-chave','#s-pag-banco','#s-pag-ag','#s-pag-conta','#s-pag-titular'].forEach(x => q(x).value = '');
      q('#s-origem').innerHTML = 'Este fornecedor ainda não tem dados salvos. Informe abaixo.';
    } else {
      q('#s-origem').innerHTML = 'Escolha o favorecido para preencher automaticamente, ou informe abaixo.';
    }
    alternarBlocos();
    conferirDivergencia();
  }

  q('#s-pag-tipo').addEventListener('change', alternarBlocos);
  ['#s-pag-chave','#s-pag-conta'].forEach(x => q(x).addEventListener('input', conferirDivergencia));
  q('#s-forn').addEventListener('change', preencherPagamento);

  preencherPagamento();
  mostrarSaldo();
  desenharParcelas();

  q('#fs').addEventListener('submit', async e => {
    e.preventDefault();
    const valor = Number(q('#s-valor').value) || 0;
    if (valor <= 0) return aviso('Informe o valor.', 'aviso');

    const validas = parcelas.filter(p => Number(p.valor) > 0);
    if (!validas.length) return aviso('Informe ao menos uma parcela com valor.', 'aviso');
    const soma = validas.reduce((a, p) => a + Number(p.valor), 0);
    if (Math.abs(soma - valor) > 0.005) {
      return aviso(`As parcelas somam ${moeda(soma)}, o total é ${moeda(valor)}.`, 'aviso');
    }

    await comBotao(q('#s-salvar'), async () => {
      try {
        const forn = q('#s-forn').value === '__novo' ? '' : q('#s-forn').value;
        const pag = {
          pag_tipo: q('#s-pag-tipo').value,
          pag_chave: q('#s-pag-chave').value,
          pag_banco: q('#s-pag-banco').value,
          pag_agencia: q('#s-pag-ag').value,
          pag_conta: q('#s-pag-conta').value,
          pag_titular: q('#s-pag-titular').value,
        };

        await criarSolicitacao(contexto.evento.id, {
          item_id: q('#s-item').value,
          fornecedor_id: forn,
          valor,
          justificativa: q('#s-just').value,
          ...pag,
        }, validas);

        // guardar no cadastro só quando explicitamente pedido
        if (forn && q('#s-salvar-cad').checked) {
          const m = _meios.find(x => x.fornecedor_id === forn);
          try {
            await salvarMeioPagamento(forn, m?.id || null, {
              tipo: pag.pag_tipo, chave_pix: pag.pag_chave, banco: pag.pag_banco,
              agencia: pag.pag_agencia, conta: pag.pag_conta, titular: pag.pag_titular,
            });
            aviso('Dados guardados no cadastro do fornecedor.');
          } catch (e) { aviso('Solicitação criada, mas não consegui guardar no cadastro: ' + e.message, 'aviso'); }
        }
        aviso('Solicitação enviada para aprovação.');
        fecharModal();
        await recarregarItens();
        await abaSolicitacoes(alvo, contexto.aba === 'aprovacoes');
      } catch (err) { aviso(err.message, 'erro'); }
    });
  });
}

/* ── detalhe ───────────────────────────────────────── */

function modalDetalhe(id, alvo, fila = false) {
  const s = _solicitacoes.find(x => x.id === id);
  if (!s) return;
  const sit = SITUACOES[s.situacao] || SITUACOES.em_aberto;
  const parcelas = _parcelas.filter(x => x.solicitacao_id === id);
  const p = contexto.permissao || {};
  const podeAprovar = (p.admin || p.aprovar_pagamento) && s.situacao === 'em_aberto';
  const ehMinha = s.solicitante_id === sessao.usuario.id;

  abrirModal(`Solicitação · item ${String(s.item_numero).padStart(3, '0')}`, `
    <div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap">
      <div style="flex:1;min-width:180px">
        <div style="font-size:16px;font-weight:600">${esc(s.item_descricao)}</div>
        <div style="font-size:13px;color:var(--texto-2)">${esc(s.fornecedor_nome || 'sem favorecido')}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:20px;font-weight:600;font-variant-numeric:tabular-nums">${moeda(s.valor)}</div>
        <span class="etiqueta ${sit.classe}" style="margin-top:4px">${sit.rotulo}</span>
      </div>
    </div>

    ${s.pag_chave || s.pag_conta ? `
      <div class="cartao" style="margin-bottom:14px;padding:12px">
        <div style="font-size:12px;color:var(--texto-3);margin-bottom:4px">Para onde vai</div>
        <div style="font-size:14px">
          ${s.pag_tipo === 'conta'
            ? `${esc(s.pag_banco || '')} · ag ${esc(s.pag_agencia || '—')} · cc ${esc(s.pag_conta || '—')}`
            : `PIX ${esc(s.pag_chave || '—')}`}
        </div>
        ${s.pag_titular ? `<div style="font-size:12px;color:var(--texto-2)">${esc(s.pag_titular)}</div>` : ''}
        ${s.pag_divergente ? `
          <div style="margin-top:8px;padding:8px 10px;background:var(--ambar-fundo);border-radius:var(--raio)">
            <div style="font-size:12px;color:var(--ambar)">
              <strong>Diferente do cadastro do fornecedor.</strong>
              ${s.cadastro_chave ? `<br>No cadastro: ${esc(s.cadastro_chave)}` : ''}
            </div>
          </div>` : ''}
      </div>` : ''}

    ${s.justificativa ? `<div class="cartao" style="margin-bottom:14px;font-size:14px">${esc(s.justificativa)}</div>` : ''}
    ${s.motivo_recusa ? `
      <div class="cartao" style="background:var(--vermelho-fundo);border-color:var(--vermelho);margin-bottom:14px">
        <div style="font-size:13px;color:var(--vermelho)"><strong>Recusada:</strong> ${esc(s.motivo_recusa)}</div>
      </div>` : ''}

    <h3 style="font-size:14px;margin-bottom:8px">Parcelas</h3>
    <div class="cartao" style="padding:0;overflow:hidden;margin-bottom:14px">
      ${parcelas.map(x => {
        const pago = (x.pagamento || []).reduce((a, g) => a + Number(g.valor), 0);
        return `
        <div class="linha-lista">
          <div style="flex:1;min-width:0">
            <div style="font-size:14px">${x.vencimento ? 'Vence ' + dataBR(x.vencimento) : 'Sem vencimento'}</div>
            ${pago > 0 ? `<div style="font-size:12px;color:var(--verde)">pago ${moeda(pago)}</div>` : ''}
          </div>
          ${x.urgente ? '<span class="etiqueta etiqueta-ambar">urgente</span>' : ''}
          <span class="num" style="font-weight:500">${moeda(x.valor)}</span>
        </div>`;
      }).join('')}
    </div>

    <div style="font-size:12px;color:var(--texto-3);margin-bottom:6px">
      Pedido por ${esc(s.solicitante_nome || '—')} em ${dataBR(s.criado_em)}
      ${s.aprovador_nome ? `<br>Aprovado por ${esc(s.aprovador_nome)} em ${dataBR(s.aprovado_em)}` : ''}
    </div>

    <div class="modal-acoes">
      ${ehMinha && s.situacao === 'em_aberto'
        ? `<button type="button" class="botao botao-perigo" id="d-cancelar-solic" style="margin-right:auto">Cancelar pedido</button>` : ''}
      <button type="button" class="botao" id="d-fechar">Fechar</button>
      ${podeAprovar ? `
        <button type="button" class="botao" id="d-recusar">Recusar</button>
        <button type="button" class="botao botao-primario" id="d-aprovar">Aprovar</button>` : ''}
    </div>
  `);

  document.getElementById('d-fechar').addEventListener('click', fecharModal);
  document.getElementById('d-aprovar')?.addEventListener('click', () => aprovar(id, alvo, fila));
  document.getElementById('d-recusar')?.addEventListener('click', () => recusar(id, alvo, fila));
  document.getElementById('d-cancelar-solic')?.addEventListener('click', async () => {
    if (!confirm('Cancelar esta solicitação?')) return;
    try {
      await cancelarSolicitacao(id);
      aviso('Solicitação cancelada.');
      fecharModal();
      await recarregarItens();
      await abaSolicitacoes(alvo, fila);
    } catch (e) { aviso(e.message, 'erro'); }
  });
}

/* ── ações ─────────────────────────────────────────── */

async function aprovar(id, alvo, fila) {
  const s = _solicitacoes.find(x => x.id === id);
  if (!confirm(`Aprovar o pagamento de ${moeda(s.valor)} para ${s.fornecedor_nome || 'favorecido a definir'}?`)) return;
  try {
    await aprovarSolicitacao(id);
    aviso('Solicitação aprovada.');
    fecharModal();
    await recarregarItens();
    await abaSolicitacoes(alvo, fila);
  } catch (e) { aviso(e.message, 'erro', 6000); }
}

async function recusar(id, alvo, fila) {
  const motivo = prompt('Motivo da recusa (o solicitante vai ver):');
  if (motivo === null) return;
  if (!motivo.trim()) return aviso('Informe o motivo.', 'aviso');
  try {
    await recusarSolicitacao(id, motivo);
    aviso('Solicitação recusada.');
    fecharModal();
    await recarregarItens();
    await abaSolicitacoes(alvo, fila);
  } catch (e) { aviso(e.message, 'erro'); }
}
