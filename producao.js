// ═══════════════════════════════════════════════════════
// Produção — os itens orçados do evento
//
// A tabela mostra só o essencial: item, categoria, custo do
// evento anterior e valor orçado. Quantidade e diária existem
// como calculadora recolhida no cadastro, para os casos em que
// a conta importa — cachê de equipe, rádios, hospedagem.
// ═══════════════════════════════════════════════════════

import {
  empresaAtual, listarCategorias, criarCategoria, listarFornecedores,
  salvarItem, apagarItem, listarPrestacao, salvarPrestacao, apagarPrestacao,
} from './nucleo.js';
import { esc, aviso, abrirModal, fecharModal, comBotao, moeda, dataBR } from './ui.js';
import { contexto, recarregarItens } from './evento.js';
import { abrirImportacao } from './importacao.js';
import { modalNova, abaSolicitacoes } from './solicitacoes.js';

const SITUACOES = {
  previsto:   { rotulo: 'Previsto',   classe: 'etiqueta-neutra' },
  orcado:     { rotulo: 'Orçado',     classe: 'etiqueta-acento' },
  contratado: { rotulo: 'Contratado', classe: 'etiqueta-verde' },
  cancelado:  { rotulo: 'Cancelado',  classe: 'etiqueta-vermelha' },
};

let _categorias = [];
let _fornecedores = [];
let _filtroCategoria = '';
let _filtroSituacao = '';
let _busca = '';

export async function abaProducao(alvo) {
  const emp = empresaAtual();
  if (!_categorias.length) {
    try {
      [_categorias, _fornecedores] = await Promise.all([
        listarCategorias(emp.id, 'despesa'), listarFornecedores(emp.id),
      ]);
    } catch (e) { /* segue sem as listas auxiliares */ }
  }
  desenhar(alvo);
}

function desenhar(alvo) {
  const podeEditar = contexto.permissao?.admin || contexto.permissao?.editar_producao;
  const podeSolicitar = (contexto.permissao?.admin || contexto.permissao?.criar_solicitacao)
                        && contexto.evento.situacao !== 'encerrado';
  const aberto = contexto.evento.situacao !== 'encerrado';

  let itens = contexto.itens;
  if (_filtroCategoria) itens = itens.filter(i => (i.categoria_id || '') === _filtroCategoria);
  if (_filtroSituacao)  itens = itens.filter(i => i.situacao === _filtroSituacao);
  if (_busca) {
    const t = _busca.toLowerCase();
    itens = itens.filter(i =>
      (i.descricao || '').toLowerCase().includes(t) ||
      (i.fornecedor_nome || '').toLowerCase().includes(t) ||
      String(i.numero).includes(t));
  }

  const totalOrcado = itens.reduce((a, i) => a + Number(i.valor_orcado || 0), 0);
  const totalRef = itens.reduce((a, i) => a + Number(i.custo_referencia || 0), 0);

  alvo.innerHTML = `
    <div class="barra-filtros">
      <input class="controle" id="p-busca" placeholder="Buscar item, número ou fornecedor"
             value="${esc(_busca)}" style="flex:1;min-width:180px">
      <select class="controle" id="p-cat" style="width:auto;min-width:150px">
        <option value="">Todas as categorias</option>
        ${_categorias.map(c => `<option value="${esc(c.id)}" ${_filtroCategoria === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}
      </select>
      <select class="controle" id="p-sit" style="width:auto;min-width:130px">
        <option value="">Todas as situações</option>
        ${Object.entries(SITUACOES).map(([v, s]) => `<option value="${v}" ${_filtroSituacao === v ? 'selected' : ''}>${s.rotulo}</option>`).join('')}
      </select>
      ${podeEditar && aberto ? `
        <button class="botao" id="p-importar">Importar planilha</button>
        <button class="botao botao-primario" id="p-novo">Novo item</button>` : ''}
    </div>

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
              <th style="width:110px">Situação</th>
              ${podeSolicitar ? '<th style="width:44px"></th>' : ''}
              ${podeEditar ? '<th style="width:44px"></th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${itens.map(i => linha(i, podeEditar, podeSolicitar)).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="3">${itens.length} ${itens.length === 1 ? 'item' : 'itens'}</td>
              <td class="num" style="color:var(--texto-2)">${moeda(totalRef)}</td>
              <td class="num" style="font-weight:600">${moeda(totalOrcado)}</td>
              <td colspan="${(podeEditar ? 1 : 0) + (podeSolicitar ? 1 : 0) + 1}"></td>
            </tr>
          </tfoot>
        </table>
      </div>` : `
      <div class="vazio">
        <h3>${_busca || _filtroCategoria || _filtroSituacao ? 'Nada encontrado' : 'Nenhum item ainda'}</h3>
        <p>${_busca || _filtroCategoria || _filtroSituacao
              ? 'Ajuste os filtros para ver outros itens.'
              : 'Cadastre item a item, ou importe a planilha do evento anterior para começar com a base de custos pronta.'}</p>
        ${podeEditar && aberto && !_busca && !_filtroCategoria && !_filtroSituacao ? `
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
  q('#p-cat')?.addEventListener('change', e => { _filtroCategoria = e.target.value; desenhar(alvo); });
  q('#p-sit')?.addEventListener('change', e => { _filtroSituacao = e.target.value; desenhar(alvo); });
  q('#p-novo')?.addEventListener('click', () => modalItem(null));
  q('#p-novo2')?.addEventListener('click', () => modalItem(null));
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

  // atalho: abre a solicitação já com este item selecionado
  alvo.querySelectorAll('[data-solicitar]').forEach(el =>
    el.addEventListener('click', async e => {
      e.stopPropagation();
      const id = el.dataset.solicitar;
      await abaSolicitacoes(document.createElement('div'));
      modalNova(alvo, id);
    }));
}

function linha(i, podeEditar, podeSolicitar) {
  const s = SITUACOES[i.situacao] || SITUACOES.orcado;
  const dif = i.custo_referencia != null
    ? Number(i.valor_orcado) - Number(i.custo_referencia) : null;
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
      <td><span class="etiqueta ${s.classe}">${s.rotulo}</span></td>
      ${podeSolicitar ? `<td><button class="botao-icone" data-solicitar="${esc(i.id)}" title="Solicitar pagamento deste item">&#128181;</button></td>` : ''}
      ${podeEditar ? `<td><button class="botao-icone" data-editar="${esc(i.id)}" title="Editar">&#9998;</button></td>` : ''}
    </tr>`;
}

/* ── cadastro do item ──────────────────────────────── */

function modalItem(item) {
  const edicao = !!item;
  const i = item || {};

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
                 value="${i.custo_referencia ?? ''}" placeholder="opcional">
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
          fornecedor_id: q('#i-forn').value,
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
