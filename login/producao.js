// ═══════════════════════════════════════════════════════
// Produção — os itens orçados do evento
//
// A tabela mostra só o essencial: item, categoria, custo do
// evento anterior e valor orçado. Quantidade e diária existem
// como calculadora recolhida no cadastro, para os casos em que
// a conta importa — cachê de equipe, rádios, hospedagem.
// ═══════════════════════════════════════════════════════

import {
  empresaAtual, listarCategorias, criarCategoria, listarFornecedores, salvarFornecedor,
  salvarItem, apagarItem, listarPrestacao, salvarPrestacao, apagarPrestacao,
  andamentoItens,
} from './nucleo.js';
import { esc, aviso, abrirModal, fecharModal, comBotao, moeda, dataBR, ligarCadastroRapido } from './ui.js';
import { contexto, recarregarItens } from './evento.js';
import { abrirImportacao } from './importacao.js';
import { modalNova, abaSolicitacoes } from './solicitacoes.js';

// Situação de planejamento — campo manual, escolhido no cadastro do item.
const SITUACOES = {
  previsto:   { rotulo: 'Previsto',   classe: 'etiqueta-neutra' },
  orcado:     { rotulo: 'Orçado',     classe: 'etiqueta-acento' },
  contratado: { rotulo: 'Contratado', classe: 'etiqueta-verde' },
  cancelado:  { rotulo: 'Cancelado',  classe: 'etiqueta-vermelha' },
};

// Andamento financeiro — segundo eixo, DERIVADO do dinheiro.
// Nunca é campo: sai da soma das solicitações e pagamentos do item.
const ANDAMENTO = {
  solicitado:   { rotulo: 'Solicitado',   cor: 'var(--ambar)'  },
  pago_parcial: { rotulo: 'Pago parcial', cor: 'var(--acento)' },
  pago:         { rotulo: 'Pago',         cor: 'var(--verde)'  },
};

// Decide o selo financeiro do item.
// A régua do "pago" é o valor ORÇADO, não o solicitado: um item pode ter
// a solicitação toda paga e ainda ter orçado sem solicitar — nesse caso
// continua "pago parcial", porque ainda há valor em aberto.
function andamentoDoItem(a, orcado) {
  const solicitado = Number(a?.solicitado || 0);
  const pago = Number(a?.pago || 0);
  const orc = Number(orcado || 0);
  if (solicitado <= 0.005 && pago <= 0.005) return null;   // nada aconteceu
  if (pago <= 0.005) return 'solicitado';                  // solicitado, nada pago
  const alvo = orc > 0.005 ? orc : solicitado;             // sem orçado, cai no solicitado
  if (pago + 0.005 >= alvo) return 'pago';                 // cobriu todo o orçado
  return 'pago_parcial';                                   // pago, mas ainda falta
}

let _categorias = [];
let _fornecedores = [];
let _andamento = {};        // item_id → { solicitado, pago, em_fluxo }
let _filtroCategorias = new Set();  // categoria_id (várias ao mesmo tempo)
let _filtroSituacoes = new Set();   // situação manual (várias)
let _filtroAndamentos = new Set();  // andamento financeiro (várias)
let _busca = '';
let _menuAberto = null;     // qual dropdown de filtro está aberto
let _fecharMenu = null;     // handler de clique-fora, guardado para remover depois

// Um filtro compacto: botão que abre uma lista de checkboxes.
// Multi-seleção, mas ocupa só o espaço de um botão quando fechado.
function filtroMenu(rotulo, grupo, opcoes, selecionadas) {
  if (!opcoes.length) return '';
  const n = selecionadas.size;
  const aberto = _menuAberto === grupo;
  return `
    <div class="filtro-drop" style="position:relative;display:inline-block">
      <button type="button" class="botao" data-menu="${grupo}"
        style="height:36px${n ? ';border-color:var(--acento);color:var(--acento)' : ''}">
        ${rotulo}${n ? ` · ${n}` : ''} <span style="opacity:.55;font-size:11px">▾</span>
      </button>
      ${aberto ? `
        <div style="position:absolute;z-index:40;top:calc(100% + 4px);left:0;min-width:190px;max-height:264px;
                    overflow:auto;background:var(--superficie-2);border:1px solid var(--borda);
                    border-radius:var(--raio);box-shadow:0 10px 26px rgba(0,0,0,.22);padding:6px">
          ${opcoes.map(([id, rot]) => `
            <label style="display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:6px;cursor:pointer;font-size:14px">
              <input type="checkbox" data-opt="${grupo}" value="${esc(id)}" ${selecionadas.has(id) ? 'checked' : ''}>
              <span>${esc(rot)}</span>
            </label>`).join('')}
        </div>` : ''}
    </div>`;
}

export async function abaProducao(alvo) {
  const emp = empresaAtual();
  if (!_categorias.length) {
    try {
      [_categorias, _fornecedores] = await Promise.all([
        listarCategorias(emp.id, 'despesa'), listarFornecedores(emp.id),
      ]);
    } catch (e) { /* segue sem as listas auxiliares */ }
  }
  // andamento financeiro por item — recarregado a cada abertura da aba
  try {
    const linhas = await andamentoItens(contexto.evento.id);
    _andamento = {};
    linhas.forEach(a => { _andamento[a.item_id] = a; });
  } catch (e) { _andamento = {}; /* segue sem o andamento; a tela não trava */ }
  desenhar(alvo);
}

function desenhar(alvo) {
  const podeEditar = contexto.permissao?.admin || contexto.permissao?.editar_producao;
  const podeSolicitar = (contexto.permissao?.admin || contexto.permissao?.criar_solicitacao)
                        && contexto.evento.situacao !== 'encerrado';
  const aberto = contexto.evento.situacao !== 'encerrado';

  let itens = contexto.itens;
  if (_filtroCategorias.size) itens = itens.filter(i => _filtroCategorias.has(i.categoria_id || ''));
  if (_filtroSituacoes.size)  itens = itens.filter(i => _filtroSituacoes.has(i.situacao));
  if (_filtroAndamentos.size)
    itens = itens.filter(i => _filtroAndamentos.has(andamentoDoItem(_andamento[i.id], i.valor_orcado) || '—'));
  if (_busca) {
    const t = _busca.toLowerCase();
    itens = itens.filter(i =>
      (i.descricao || '').toLowerCase().includes(t) ||
      (i.fornecedor_nome || '').toLowerCase().includes(t) ||
      String(i.numero).includes(t));
  }

  const totalOrcado = itens.reduce((a, i) => a + Number(i.valor_orcado || 0), 0);
  const totalRef = itens.reduce((a, i) => a + Number(i.custo_referencia || 0), 0);
  const totalPago = itens.reduce((a, i) => a + Number(_andamento[i.id]?.pago || 0), 0);
  const temFiltro = _busca || _filtroCategorias.size || _filtroSituacoes.size || _filtroAndamentos.size;

  alvo.innerHTML = `
    <div class="barra-filtros">
      <input class="controle" id="p-busca" placeholder="Buscar item, número ou fornecedor"
             value="${esc(_busca)}" style="flex:1;min-width:160px">
      ${filtroMenu('Categoria', 'cat', _categorias.map(c => [c.id, c.nome]), _filtroCategorias)}
      ${filtroMenu('Situação', 'sit', Object.entries(SITUACOES).map(([v, s]) => [v, s.rotulo]), _filtroSituacoes)}
      ${filtroMenu('Andamento', 'and', Object.entries(ANDAMENTO).map(([v, a]) => [v, a.rotulo]), _filtroAndamentos)}
      ${temFiltro ? `<button class="botao" id="p-limpar" style="height:36px">Limpar</button>` : ''}
      ${itens.length ? `<button class="botao" id="p-exportar" style="height:36px">Exportar</button>` : ''}
      ${podeEditar && aberto ? `
        <button class="botao" id="p-importar">Importar planilha</button>
        <button class="botao botao-primario" id="p-novo">Novo item</button>` : ''}
    </div>

    ${itens.length ? `
      <div style="display:flex;gap:22px;flex-wrap:wrap;align-items:baseline;margin-bottom:14px;padding:11px 16px;background:var(--superficie-2);border-radius:var(--raio)">
        <div><span style="font-size:12px;color:var(--texto-3)">Itens </span><strong style="font-variant-numeric:tabular-nums">${itens.length}</strong></div>
        <div><span style="font-size:12px;color:var(--texto-3)">Orçado </span><strong class="num">${moeda(totalOrcado)}</strong></div>
        <div><span style="font-size:12px;color:var(--texto-3)">Pago </span><strong class="num" ${totalPago > 0 ? 'style="color:var(--verde)"' : ''}>${moeda(totalPago)}</strong></div>
        <div><span style="font-size:12px;color:var(--texto-3)">A pagar </span><strong class="num" style="color:var(--ambar)">${moeda(Math.max(totalOrcado - totalPago, 0))}</strong></div>
        <div><span style="font-size:12px;color:var(--texto-3)">Ano anterior </span><strong class="num" style="color:var(--texto-2)">${moeda(totalRef)}</strong></div>
      </div>` : ''}

    ${!aberto ? `<p class="dica" style="margin-bottom:12px">Evento encerrado — os lançamentos estão travados.</p>` : ''}

    ${itens.length ? `
      <div class="tabela-rolagem">
        <table class="tabela">
          <thead>
            <tr>
              <th style="width:52px">Nº</th>
              <th>Item</th>
              <th style="width:150px">Categoria</th>
              <th style="width:120px" class="num">Ano anterior</th>
              <th style="width:130px" class="num">Orçado</th>
              <th style="width:130px" class="num">Pago</th>
              <th style="width:130px" class="num">A pagar</th>
              <th style="width:150px">Situação</th>
              ${podeSolicitar ? '<th style="width:44px"></th>' : ''}
              ${podeEditar ? '<th style="width:44px"></th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${itens.map(i => linha(i, podeEditar, podeSolicitar)).join('')}
          </tbody>
        </table>
      </div>` : `
      <div class="vazio">
        <h3>${temFiltro ? 'Nada encontrado' : 'Nenhum item ainda'}</h3>
        <p>${temFiltro
              ? 'Ajuste os filtros para ver outros itens.'
              : 'Cadastre item a item, ou importe a planilha do evento anterior para começar com a base de custos pronta.'}</p>
        ${podeEditar && aberto && !temFiltro ? `
          <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
            <button class="botao botao-primario" id="p-novo2">Novo item</button>
            <button class="botao" id="p-importar2">Importar planilha</button>
          </div>` : ''}
      </div>`}
  `;

  const q = s => alvo.querySelector(s);
  q('#p-busca')?.addEventListener('input', e => {
    _busca = e.target.value; desenhar(alvo);
    const n = alvo.querySelector('#p-busca');
    n.focus(); n.setSelectionRange(n.value.length, n.value.length);
  });
  alvo.querySelectorAll('[data-menu]').forEach(el =>
    el.addEventListener('click', e => {
      e.stopPropagation();
      const g = el.dataset.menu;
      _menuAberto = _menuAberto === g ? null : g;
      desenhar(alvo);
    }));
  alvo.querySelectorAll('[data-opt]').forEach(el =>
    el.addEventListener('change', () => {
      const g = el.dataset.opt, v = el.value;
      const set = g === 'cat' ? _filtroCategorias : g === 'sit' ? _filtroSituacoes : _filtroAndamentos;
      el.checked ? set.add(v) : set.delete(v);
      _menuAberto = g;   // mantém o dropdown aberto para marcar vários
      desenhar(alvo);
    }));
  q('#p-limpar')?.addEventListener('click', () => {
    _filtroCategorias.clear(); _filtroSituacoes.clear(); _filtroAndamentos.clear();
    _menuAberto = null;
    desenhar(alvo);
  });
  // fecha o dropdown ao clicar fora dele
  if (_fecharMenu) { document.removeEventListener('click', _fecharMenu); _fecharMenu = null; }
  if (_menuAberto) {
    _fecharMenu = (ev) => {
      if (ev.target.closest('.filtro-drop')) return;   // clique dentro: ignora
      _menuAberto = null;
      document.removeEventListener('click', _fecharMenu); _fecharMenu = null;
      desenhar(alvo);
    };
    setTimeout(() => document.addEventListener('click', _fecharMenu), 0);
  }
  q('#p-novo')?.addEventListener('click', () => modalItem(null));
  q('#p-novo2')?.addEventListener('click', () => modalItem(null));
  q('#p-exportar')?.addEventListener('click', () => exportarPlanilha(itens));
  q('#p-importar')?.addEventListener('click', () => abrirImportacao(_categorias));
  q('#p-importar2')?.addEventListener('click', () => abrirImportacao(_categorias));

  alvo.querySelectorAll('[data-item]').forEach(el =>
    el.addEventListener('click', () => {
      const it = contexto.itens.find(x => x.id === el.dataset.item);
      if (it) it.eh_verba ? modalPrestacao(it) : modalItem(it);
    }));
  alvo.querySelectorAll('[data-editar]').forEach(el =>
    el.addEventListener('click', e => {
      e.stopPropagation();
      modalItem(contexto.itens.find(x => x.id === el.dataset.editar));
    }));

  // atalho: abre a solicitação já com este item selecionado.
  // Antes, item sem saldo caía no primeiro item da lista — parecia
  // que trocava de item sozinho. Agora avisa e não abre.
  alvo.querySelectorAll('[data-solicitar]').forEach(el =>
    el.addEventListener('click', async e => {
      e.stopPropagation();
      const id = el.dataset.solicitar;
      const it = contexto.itens.find(x => x.id === id);
      const num = it ? String(it.numero).padStart(3, '0') : '';
      const orcado = Number(it?.valor_orcado || 0);
      const solicitado = Number(_andamento[id]?.solicitado || 0);

      if (orcado <= 0.005) {
        return aviso(`Item ${num} não tem valor orçado. Defina o orçado antes de solicitar.`, 'aviso');
      }
      if (solicitado + 0.005 >= orcado) {
        return aviso(`Item ${num} já teve todo o valor orçado solicitado (${moeda(solicitado)}).`, 'aviso');
      }

      await abaSolicitacoes(document.createElement('div'));
      modalNova(alvo, id);
    }));
}

function linha(i, podeEditar, podeSolicitar) {
  const s = SITUACOES[i.situacao] || SITUACOES.orcado;
  const dif = i.custo_referencia != null
    ? Number(i.valor_orcado) - Number(i.custo_referencia) : null;

  const a = _andamento[i.id];
  const pago = Number(a?.pago || 0);
  const emFluxo = Number(a?.em_fluxo || 0);
  const andKey = andamentoDoItem(a, i.valor_orcado);
  const and = andKey ? ANDAMENTO[andKey] : null;

  return `
    <tr data-item="${esc(i.id)}" style="cursor:pointer">
      <td style="color:var(--texto-3);font-variant-numeric:tabular-nums">${String(i.numero).padStart(3, '0')}</td>
      <td>
        <div style="font-weight:500">${esc(i.descricao)}</div>
        ${i.fornecedor_nome ? `<div style="font-size:12px;color:var(--texto-2)">${esc(i.fornecedor_nome)}</div>` : ''}
        ${i.eh_verba ? `<span class="etiqueta ${Number(i.falta_prestar) > 0 ? 'etiqueta-ambar' : 'etiqueta-verde'}" style="margin-top:4px">
            ${Number(i.falta_prestar) > 0 ? 'falta prestar ' + moeda(i.falta_prestar) : 'contas prestadas'}
          </span>` : ''}
      </td>
      <td style="color:var(--texto-2);font-size:13px">${esc(i.categoria_nome || '—')}</td>
      <td class="num" style="color:var(--texto-3)">
        ${i.custo_referencia != null ? moeda(i.custo_referencia) : '—'}
        ${dif != null && dif !== 0 ? `<div style="font-size:11px;color:${dif > 0 ? 'var(--vermelho)' : 'var(--verde)'}">${dif > 0 ? '+' : ''}${moeda(dif)}</div>` : ''}
      </td>
      <td class="num" style="font-weight:500">${moeda(i.valor_orcado)}</td>
      <td class="num">
        ${pago > 0.005 ? `<span style="color:var(--verde);font-weight:500">${moeda(pago)}</span>` : '<span style="color:var(--texto-3)">—</span>'}
        ${emFluxo > 0.005 ? `<div style="font-size:11px;color:var(--texto-2)">em fluxo ${moeda(emFluxo)}</div>` : ''}
      </td>
      <td class="num">
        ${(() => { const orc = Number(i.valor_orcado || 0); const ap = Math.max(orc - pago, 0); if (orc <= 0.005) return '<span style="color:var(--texto-3)">—</span>'; return ap > 0.005 ? `<span style="color:var(--ambar);font-weight:500">${moeda(ap)}</span>` : '<span style="color:var(--verde);font-weight:500">quitado</span>'; })()}
      </td>
      <td>
        <span class="etiqueta ${s.classe}">${s.rotulo}</span>
        ${and ? `<div style="font-size:11px;color:${and.cor};margin-top:4px">${and.rotulo}</div>` : ''}
      </td>
      ${podeSolicitar ? `<td><button class="botao-icone" data-solicitar="${esc(i.id)}" title="Solicitar pagamento deste item">&#128181;</button></td>` : ''}
      ${podeEditar ? `<td><button class="botao-icone" data-editar="${esc(i.id)}" title="Editar">&#9998;</button></td>` : ''}
    </tr>`;
}

/* ── cadastro do item ──────────────────────────────── */

function modalItem(item) {
  const edicao = !!item;
  const i = item || {};
  const podeAdmin = contexto.permissao?.admin;   // mestre ou administrador

  abrirModal(edicao ? `Item ${String(i.numero).padStart(3, '0')}` : 'Novo item', `
    <form id="fi">
      <div class="campo">
        <label for="i-desc">Item</label>
        <input class="controle" id="i-desc" value="${esc(i.descricao || '')}"
               placeholder="Sonorização do palco principal" required>
      </div>

      <div class="linha linha-2">
        <div class="campo">
          <label for="i-cat">Categoria</label>
          <select class="controle" id="i-cat">
            <option value="">— sem categoria —</option>
            ${_categorias.map(c => `<option value="${esc(c.id)}" ${i.categoria_id === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}
            <option value="__nova">+ criar categoria</option>
          </select>
        </div>
        <div class="campo">
          <label for="i-forn">Fornecedor</label>
          <select class="controle" id="i-forn">
            <option value="">— a definir —</option>
            ${_fornecedores.map(f => `<option value="${esc(f.id)}" ${i.fornecedor_id === f.id ? 'selected' : ''}>${esc(f.nome)}</option>`).join('')}
            <option value="__novo">+ cadastrar fornecedor</option>
          </select>
        </div>
      </div>

      <div class="linha linha-2">
        <div class="campo">
          <label for="i-valor">Valor orçado</label>
          <input class="controle" id="i-valor" type="number" min="0" step="0.01"
                 value="${i.valor_orcado ?? ''}" placeholder="0,00" required>
        </div>
        <div class="campo">
          <label for="i-ref">Custo do evento anterior</label>
          <input class="controle" id="i-ref" type="number" min="0" step="0.01"
                 value="${i.custo_referencia ?? ''}" placeholder="opcional"
                 ${podeAdmin ? '' : 'readonly style="opacity:.6;cursor:not-allowed"'}>
          ${podeAdmin ? '' : '<div class="dica" style="margin-top:4px">Definido pelo mestre ou administrador.</div>'}
        </div>
      </div>

      <details class="calculadora" ${i.quantidade ? 'open' : ''}>
        <summary>Calcular por quantidade e diária</summary>
        <div class="linha linha-2" style="margin-top:12px">
          <div class="campo">
            <label for="i-qnt">Quantidade</label>
            <input class="controle" id="i-qnt" type="number" min="0" step="0.001" value="${i.quantidade ?? ''}">
          </div>
          <div class="campo">
            <label for="i-dias">Diárias</label>
            <input class="controle" id="i-dias" type="number" min="0" step="0.001" value="${i.dias ?? ''}">
          </div>
        </div>
        <div class="campo">
          <label for="i-unit">Valor unitário</label>
          <input class="controle" id="i-unit" type="number" min="0" step="0.01" value="${i.valor_unitario ?? ''}">
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <button type="button" class="botao" id="i-calcular">Usar este cálculo</button>
          <span id="i-resultado" style="font-size:14px;color:var(--texto-2)"></span>
        </div>
      </details>

      <div class="linha linha-2" style="margin-top:14px">
        <div class="campo">
          <label for="i-sit">Situação</label>
          <select class="controle" id="i-sit">
            ${Object.entries(SITUACOES).map(([v, s]) =>
              `<option value="${v}" ${(i.situacao || 'orcado') === v ? 'selected' : ''}>${s.rotulo}</option>`).join('')}
          </select>
        </div>
        <div class="campo" style="display:flex;flex-direction:column;justify-content:flex-end">
          <label class="caixa-perm" style="margin-bottom:10px">
            <input type="checkbox" id="i-verba" ${i.eh_verba ? 'checked' : ''}>
            <span>
              <span class="rot">É uma verba</span>
              <span class="desc">Precisa ser destrinchada depois</span>
            </span>
          </label>
        </div>
      </div>

      <div class="campo">
        <label for="i-obs">Observações</label>
        <textarea class="controle" id="i-obs">${esc(i.observacoes || '')}</textarea>
      </div>

      <div class="modal-acoes">
        ${edicao ? `<button type="button" class="botao botao-perigo" id="i-apagar" style="margin-right:auto">Apagar</button>` : ''}
        <button type="button" class="botao" id="i-cancelar">Cancelar</button>
        <button type="submit" class="botao botao-primario" id="i-salvar">${edicao ? 'Salvar' : 'Cadastrar'}</button>
      </div>
    </form>
  `);

  const q = s => document.querySelector(s);

  q('#i-cat').addEventListener('change', async e => {
    if (e.target.value !== '__nova') return;
    const nome = prompt('Nome da nova categoria:');
    e.target.value = i.categoria_id || '';
    if (!nome?.trim()) return;
    try {
      const nova = await criarCategoria(empresaAtual().id, 'despesa', nome);
      _categorias.push(nova);
      const opt = document.createElement('option');
      opt.value = nova.id; opt.textContent = nova.nome;
      e.target.insertBefore(opt, e.target.lastElementChild);
      e.target.value = nova.id;
      aviso('Categoria criada.');
    } catch (err) { aviso(err.message, 'erro'); }
  });

  ligarCadastroRapido('#i-forn', _fornecedores,
    nome => salvarFornecedor(empresaAtual().id, null, { nome }));

  const calcular = () => {
    const v = (Number(q('#i-qnt').value) || 0) * (Number(q('#i-dias').value) || 0) * (Number(q('#i-unit').value) || 0);
    q('#i-resultado').textContent = v ? '= ' + moeda(v) : '';
    return v;
  };
  ['#i-qnt', '#i-dias', '#i-unit'].forEach(s => q(s).addEventListener('input', calcular));
  calcular();
  q('#i-calcular').addEventListener('click', () => {
    const v = calcular();
    if (!v) return aviso('Preencha quantidade, diárias e valor unitário.', 'aviso');
    q('#i-valor').value = v.toFixed(2);
    aviso('Valor orçado atualizado.');
  });

  q('#i-cancelar').addEventListener('click', fecharModal);

  q('#i-apagar')?.addEventListener('click', async () => {
    if (!confirm(`Apagar o item "${i.descricao}"?\n\nEssa ação fica registrada na auditoria.`)) return;
    try {
      await apagarItem(i.id);
      aviso('Item apagado.');
      fecharModal();
      await recarregarItens();
    } catch (err) { aviso(err.message, 'erro'); }
  });

  q('#fi').addEventListener('submit', async e => {
    e.preventDefault();
    const descricao = q('#i-desc').value.trim();
    if (!descricao) return aviso('Informe o item.', 'aviso');

    await comBotao(q('#i-salvar'), async () => {
      try {
        await salvarItem(contexto.evento.id, i.id || null, {
          descricao,
          categoria_id: q('#i-cat').value === '__nova' ? '' : q('#i-cat').value,
          fornecedor_id: q('#i-forn').value === '__novo' ? '' : q('#i-forn').value,
          valor_orcado: q('#i-valor').value,
          custo_referencia: q('#i-ref').value,
          situacao: q('#i-sit').value,
          eh_verba: q('#i-verba').checked,
          observacoes: q('#i-obs').value,
          quantidade: q('#i-qnt').value,
          dias: q('#i-dias').value,
          valor_unitario: q('#i-unit').value,
        });
        aviso(edicao ? 'Item atualizado.' : 'Item cadastrado.');
        fecharModal();
        await recarregarItens();
      } catch (err) { aviso(err.message, 'erro'); }
    });
  });
}

/* ── prestação de contas da verba ──────────────────── */

async function modalPrestacao(item) {
  let lancamentos = [];
  try { lancamentos = await listarPrestacao(item.id); }
  catch (e) { return aviso(e.message, 'erro'); }

  const prestado = lancamentos.reduce((a, l) => a + Number(l.valor), 0);
  const falta = Number(item.valor_orcado) - prestado;
  const podeEditar = contexto.permissao?.admin || contexto.permissao?.editar_producao;

  abrirModal(`Prestação de contas — ${item.descricao}`, `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">
      <div class="metrica">
        <div class="rotulo">Verba</div>
        <div class="valor" style="font-size:16px">${moeda(item.valor_orcado)}</div>
      </div>
      <div class="metrica">
        <div class="rotulo">Já prestado</div>
        <div class="valor" style="font-size:16px;color:var(--verde)">${moeda(prestado)}</div>
      </div>
      <div class="metrica">
        <div class="rotulo">${falta < 0 ? 'Excedeu' : 'Falta prestar'}</div>
        <div class="valor" style="font-size:16px;color:${falta < 0 ? 'var(--vermelho)' : falta > 0 ? 'var(--ambar)' : 'var(--verde)'}">
          ${moeda(Math.abs(falta))}
        </div>
      </div>
    </div>

    ${falta < 0 ? `
      <div class="cartao" style="background:var(--vermelho-fundo);border-color:var(--vermelho);margin-bottom:14px">
        <div style="font-size:13px;color:var(--vermelho)">
          Os lançamentos somam mais do que a verba. Ou houve gasto além do previsto, ou algum lançamento está errado.
        </div>
      </div>` : ''}

    ${lancamentos.length ? `
      <div class="cartao" style="padding:0;overflow:hidden;margin-bottom:14px">
        ${lancamentos.map(l => `
          <div class="linha-lista">
            <div style="flex:1;min-width:0">
              <div style="font-size:14px">${esc(l.descricao)}</div>
              <div style="font-size:12px;color:var(--texto-2)">${l.data ? dataBR(l.data) : 'sem data'}</div>
            </div>
            <span class="num" style="font-weight:500">${moeda(l.valor)}</span>
            ${podeEditar ? `<button class="botao-icone" data-apagar="${esc(l.id)}" title="Apagar">×</button>` : ''}
          </div>`).join('')}
      </div>` : `<p class="dica" style="margin-bottom:14px">Nenhum gasto lançado ainda.</p>`}

    ${podeEditar ? `
      <form id="fpc" class="cartao" style="background:var(--superficie-2);border:none">
        <div class="linha linha-2">
          <div class="campo" style="margin-bottom:10px">
            <label for="pc-desc">Gasto</label>
            <input class="controle" id="pc-desc" placeholder="Combustível da van" required>
          </div>
          <div class="campo" style="margin-bottom:10px">
            <label for="pc-valor">Valor</label>
            <input class="controle" id="pc-valor" type="number" min="0.01" step="0.01" required>
          </div>
        </div>
        <div class="campo" style="margin-bottom:10px">
          <label for="pc-data">Data</label>
          <input class="controle" id="pc-data" type="date">
        </div>
        <button type="submit" class="botao botao-primario botao-largo" id="pc-add">Lançar gasto</button>
      </form>` : ''}

    <div class="modal-acoes">
      <button type="button" class="botao" id="pc-fechar">Fechar</button>
      ${podeEditar ? `<button type="button" class="botao" id="pc-editar-item">Editar item</button>` : ''}
    </div>
  `);

  document.getElementById('pc-fechar').addEventListener('click', fecharModal);
  document.getElementById('pc-editar-item')?.addEventListener('click', () => { fecharModal(); modalItem(item); });

  document.querySelectorAll('[data-apagar]').forEach(b =>
    b.addEventListener('click', async () => {
      if (!confirm('Apagar este lançamento?')) return;
      try { await apagarPrestacao(b.dataset.apagar); await recarregarItens(); modalPrestacao(
        contexto.itens.find(x => x.id === item.id) || item); }
      catch (e) { aviso(e.message, 'erro'); }
    }));

  document.getElementById('fpc')?.addEventListener('submit', async e => {
    e.preventDefault();
    const q = s => document.querySelector(s);
    await comBotao(q('#pc-add'), async () => {
      try {
        await salvarPrestacao(item.id, null, {
          descricao: q('#pc-desc').value, valor: q('#pc-valor').value, data: q('#pc-data').value,
        });
        await recarregarItens();
        modalPrestacao(contexto.itens.find(x => x.id === item.id) || item);
      } catch (err) { aviso(err.message, 'erro'); }
    });
  });
}

/* ── exportar a produção para planilha (.xlsx) ─────── */
async function exportarPlanilha(itens) {
  try {
    const XLSX = await import('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm');
    const ev = contexto.evento;
    const SIT = { previsto:'Previsto', orcado:'Orçado', contratado:'Contratado', cancelado:'Cancelado' };
    const linhas = itens.map(i => {
      const a = _andamento[i.id] || {};
      return {
        'Nº': String(i.numero || '').padStart(3, '0'),
        'Item': i.descricao || '',
        'Categoria': i.categoria_nome || '',
        'Fornecedor': i.fornecedor_nome || '',
        'Ano anterior': Number(i.custo_referencia || 0),
        'Orçado': Number(i.valor_orcado || 0),
        'Solicitado': Number(a.solicitado || 0),
        'Pago': Number(a.pago || 0),
        'Situação': SIT[i.situacao] || i.situacao || '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Produção');
    const nome = `Producao_${String(ev?.nome || 'evento').replace(/[^\w]+/g, '_')}.xlsx`;
    XLSX.writeFile(wb, nome);
  } catch (e) {
    aviso('Não consegui exportar: ' + e.message, 'erro');
  }
}
