// ═══════════════════════════════════════════════════════
// Fornecedores e meios de pagamento
//
// Dado bancário de fornecedor é o vetor clássico de fraude
// em produtora: alterar a chave PIX pouco antes de um
// pagamento grande. Por isso fica em tabela separada, só
// visível para quem confirma pagamento, e toda alteração
// é registrada.
// ═══════════════════════════════════════════════════════

import {
  sessao, listarFornecedores, salvarFornecedor, alternarFornecedor,
  listarMeiosPagamento, salvarMeioPagamento,
} from './nucleo.js';
import { esc, aviso, abrirModal, fecharModal, comBotao, dataBR } from './ui.js';

let _empresa = null;
let _busca = '';

export async function telaFornecedores() {
  const alvo = document.querySelector('#conteudo');
  _empresa = sessao.membros[0]?.empresa;
  if (!_empresa) {
    alvo.innerHTML = `<div class="vazio"><h3>Sem produtora</h3><p>Você não está vinculado a nenhuma produtora.</p></div>`;
    return;
  }

  alvo.innerHTML = `<div style="padding:40px;text-align:center;color:var(--texto-2)">Carregando...</div>`;

  let lista;
  try { lista = await listarFornecedores(_empresa.id); }
  catch (e) {
    alvo.innerHTML = `<div class="vazio"><h3>Não consegui carregar</h3><p>${esc(e.message)}</p></div>`;
    return;
  }

  const filtrada = _busca
    ? lista.filter(f => (f.nome + ' ' + (f.documento || '')).toLowerCase().includes(_busca.toLowerCase()))
    : lista;

  alvo.innerHTML = `
    <div class="pagina-topo">
      <h1>Fornecedores</h1>
      <div class="espaco"></div>
      <input class="controle" id="busca" placeholder="Buscar" value="${esc(_busca)}"
             style="max-width:220px;height:38px">
      <button class="botao botao-primario" id="novo">Novo fornecedor</button>
    </div>

    ${filtrada.length ? `
      <div class="cartao" style="padding:0;overflow:hidden">
        ${filtrada.map(f => `
          <div class="linha-lista">
            <div style="min-width:0;flex:1">
              <div style="font-weight:500;font-size:14px">
                ${esc(f.nome)}
                ${f.ativo ? '' : '<span class="etiqueta etiqueta-neutra" style="margin-left:6px">inativo</span>'}
              </div>
              <div style="font-size:12px;color:var(--texto-2)">
                ${[f.documento, f.contato, f.telefone].filter(Boolean).map(esc).join(' · ') || 'sem dados de contato'}
              </div>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0;flex-wrap:wrap">
              <button class="botao" style="height:32px;font-size:13px" data-editar="${esc(f.id)}">Editar</button>
              <button class="botao" style="height:32px;font-size:13px" data-pagamento="${esc(f.id)}" data-nome="${esc(f.nome)}">Pagamento</button>
              <button class="botao" style="height:32px;font-size:13px" data-alternar="${esc(f.id)}" data-ativo="${f.ativo}">
                ${f.ativo ? 'Desativar' : 'Ativar'}
              </button>
            </div>
          </div>`).join('')}
      </div>` : `
      <div class="vazio">
        <h3>${_busca ? 'Nada encontrado' : 'Nenhum fornecedor ainda'}</h3>
        <p>${_busca ? 'Tente outro termo.' : 'Cadastre quem você paga com frequência — os dados ficam salvos para todos os eventos.'}</p>
        ${_busca ? '' : `<button class="botao botao-primario" id="novo2">Cadastrar fornecedor</button>`}
      </div>`}
  `;

  const b = alvo.querySelector('#busca');
  b?.addEventListener('input', () => { _busca = b.value; telaFornecedores().then(() => {
    const n = document.querySelector('#busca'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); }
  }); });

  alvo.querySelector('#novo')?.addEventListener('click', () => modalFornecedor(null));
  alvo.querySelector('#novo2')?.addEventListener('click', () => modalFornecedor(null));
  alvo.querySelectorAll('[data-editar]').forEach(el =>
    el.addEventListener('click', () => modalFornecedor(lista.find(f => f.id === el.dataset.editar))));
  alvo.querySelectorAll('[data-pagamento]').forEach(el =>
    el.addEventListener('click', () => modalPagamento(el.dataset.pagamento, el.dataset.nome)));
  alvo.querySelectorAll('[data-alternar]').forEach(el =>
    el.addEventListener('click', async () => {
      try {
        await alternarFornecedor(el.dataset.alternar, el.dataset.ativo !== 'true');
        await telaFornecedores();
      } catch (e) { aviso(e.message, 'erro'); }
    }));
}

function modalFornecedor(f) {
  const edicao = !!f;
  f = f || {};
  abrirModal(edicao ? 'Editar fornecedor' : 'Novo fornecedor', `
    <form id="ff">
      <div class="campo">
        <label for="f-nome">Nome</label>
        <input class="controle" id="f-nome" value="${esc(f.nome || '')}" placeholder="A Produtora Ltda" required>
      </div>
      <div class="linha linha-2">
        <div class="campo">
          <label for="f-doc">CNPJ ou CPF</label>
          <input class="controle" id="f-doc" value="${esc(f.documento || '')}" inputmode="numeric">
        </div>
        <div class="campo">
          <label for="f-contato">Pessoa de contato</label>
          <input class="controle" id="f-contato" value="${esc(f.contato || '')}">
        </div>
      </div>
      <div class="linha linha-2">
        <div class="campo">
          <label for="f-email">Email</label>
          <input class="controle" type="email" id="f-email" value="${esc(f.email || '')}">
        </div>
        <div class="campo">
          <label for="f-tel">Telefone</label>
          <input class="controle" id="f-tel" value="${esc(f.telefone || '')}" inputmode="tel">
        </div>
      </div>
      <div class="campo">
        <label for="f-obs">Observações</label>
        <textarea class="controle" id="f-obs">${esc(f.observacoes || '')}</textarea>
      </div>
      <div class="modal-acoes">
        <button type="button" class="botao" id="f-cancelar">Cancelar</button>
        <button type="submit" class="botao botao-primario" id="f-salvar">${edicao ? 'Salvar' : 'Cadastrar'}</button>
      </div>
    </form>
  `);

  const q = s => document.querySelector(s);
  q('#f-cancelar').addEventListener('click', fecharModal);
  q('#ff').addEventListener('submit', async e => {
    e.preventDefault();
    const nome = q('#f-nome').value.trim();
    if (!nome) return aviso('Informe o nome.', 'aviso');
    await comBotao(q('#f-salvar'), async () => {
      try {
        await salvarFornecedor(_empresa.id, f.id || null, {
          nome, documento: q('#f-doc').value, contato: q('#f-contato').value,
          email: q('#f-email').value, telefone: q('#f-tel').value, observacoes: q('#f-obs').value,
        });
        aviso(f.id ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.');
        fecharModal();
        await telaFornecedores();
      } catch (err) { aviso(err.message, 'erro'); }
    });
  });
}

/* ── meios de pagamento ────────────────────────────── */

async function modalPagamento(fornecedorId, nome) {
  let meios = [];
  let semAcesso = false;
  try { meios = await listarMeiosPagamento(fornecedorId); }
  catch (e) { semAcesso = true; }

  if (semAcesso || (!meios.length && !podeGerir())) {
    return abrirModal(`Pagamento — ${nome}`, `
      <div class="vazio" style="border:none;padding:24px 0">
        <h3>Sem acesso</h3>
        <p>Dados bancários ficam visíveis apenas para quem tem permissão de confirmar pagamento.</p>
      </div>
      <div class="modal-acoes">
        <button type="button" class="botao" onclick="document.getElementById('modal-fechar').click()">Fechar</button>
      </div>`);
  }

  const atual = meios[0] || {};
  abrirModal(`Pagamento — ${nome}`, `
    <form id="fmp">
      ${atual.chave_pix ? `
        <div class="cartao" style="background:var(--ambar-fundo);border-color:var(--ambar);margin-bottom:14px">
          <div style="font-size:13px;color:var(--ambar)">
            <strong>Chave atual:</strong> ${esc(atual.chave_pix)}<br>
            Última alteração em ${dataBR(atual.atualizado_em)}.
            Toda mudança é registrada e sinalizada a quem for confirmar o próximo pagamento.
          </div>
        </div>` : ''}

      <div class="campo">
        <label for="mp-tipo">Forma</label>
        <select class="controle" id="mp-tipo">
          <option value="pix"   ${atual.tipo !== 'conta' ? 'selected' : ''}>PIX</option>
          <option value="conta" ${atual.tipo === 'conta' ? 'selected' : ''}>Conta bancária</option>
        </select>
      </div>

      <div id="mp-pix" ${atual.tipo === 'conta' ? 'hidden' : ''}>
        <div class="campo">
          <label for="mp-chave">Chave PIX</label>
          <input class="controle" id="mp-chave" value="${esc(atual.chave_pix || '')}"
                 placeholder="CNPJ, telefone, email ou chave aleatória">
        </div>
      </div>

      <div id="mp-conta" ${atual.tipo === 'conta' ? '' : 'hidden'}>
        <div class="linha linha-2">
          <div class="campo">
            <label for="mp-banco">Banco</label>
            <input class="controle" id="mp-banco" value="${esc(atual.banco || '')}">
          </div>
          <div class="campo">
            <label for="mp-ag">Agência</label>
            <input class="controle" id="mp-ag" value="${esc(atual.agencia || '')}">
          </div>
        </div>
        <div class="campo">
          <label for="mp-conta-num">Conta</label>
          <input class="controle" id="mp-conta-num" value="${esc(atual.conta || '')}">
        </div>
      </div>

      <div class="campo">
        <label for="mp-titular">Titular</label>
        <input class="controle" id="mp-titular" value="${esc(atual.titular || '')}"
               placeholder="Nome de quem recebe">
      </div>

      <div class="modal-acoes">
        <button type="button" class="botao" id="mp-cancelar">Cancelar</button>
        <button type="submit" class="botao botao-primario" id="mp-salvar">Salvar</button>
      </div>
    </form>
  `);

  const q = s => document.querySelector(s);
  q('#mp-tipo').addEventListener('change', () => {
    const pix = q('#mp-tipo').value === 'pix';
    q('#mp-pix').hidden = !pix;
    q('#mp-conta').hidden = pix;
  });
  q('#mp-cancelar').addEventListener('click', fecharModal);

  q('#fmp').addEventListener('submit', async e => {
    e.preventDefault();
    const tipo = q('#mp-tipo').value;
    if (tipo === 'pix' && !q('#mp-chave').value.trim()) return aviso('Informe a chave PIX.', 'aviso');

    if (atual.chave_pix && q('#mp-chave').value.trim() !== atual.chave_pix) {
      if (!confirm(
        'Você está alterando a chave PIX deste fornecedor.\n\n' +
        `Anterior: ${atual.chave_pix}\nNova: ${q('#mp-chave').value.trim()}\n\n` +
        'A mudança fica registrada e quem for confirmar o próximo pagamento será avisado. Confirma?'
      )) return;
    }

    await comBotao(q('#mp-salvar'), async () => {
      try {
        await salvarMeioPagamento(fornecedorId, atual.id || null, {
          tipo,
          chave_pix: tipo === 'pix' ? q('#mp-chave').value : null,
          banco: q('#mp-banco')?.value, agencia: q('#mp-ag')?.value,
          conta: q('#mp-conta-num')?.value, titular: q('#mp-titular').value,
        });
        aviso('Dados de pagamento salvos.');
        fecharModal();
      } catch (err) { aviso(err.message, 'erro'); }
    });
  });
}

function podeGerir() {
  const m = sessao.membros[0];
  return !!m && (m.papel === 'mestre' || m.papel === 'administrador' || m.gerir_fornecedores);
}
