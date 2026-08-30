// ═══════════════════════════════════════════════════════
// Receitas — o dinheiro que entra
//
// Espelha as Solicitações: fonte → receita → parcela → recebimento.
// Recebido é a soma dos recebimentos; estorno é registro negativo.
// ═══════════════════════════════════════════════════════

import {
  listarFontesReceita, salvarFonteReceita, alternarFonteReceita, copiarFontesReceita,
  listarReceitas, listarParcelasReceita, criarReceita, apagarReceita,
  registrarRecebimento, estornarRecebimento, listarContas,
  listarEventos, empresaAtual,
} from './nucleo.js';
import { esc, aviso, abrirModal, fecharModal, comBotao, moeda, dataBR } from './ui.js';
import { contexto } from './evento.js';

const SITUACOES = {
  prevista:         { rotulo: 'Prevista',         classe: 'etiqueta-neutra' },
  recebida_parcial: { rotulo: 'Recebida parcial', classe: 'etiqueta-acento' },
  recebida:         { rotulo: 'Recebida',         classe: 'etiqueta-verde' },
};

let _receitas = [];
let _fontes = [];
let _parcelas = [];
let _filtro = '';

export async function abaReceitas(alvo) {
  const p = contexto.permissao || {};
  if (!p.admin && !p.ver_receitas) {
    alvo.innerHTML = `<div class="vazio"><h3>Sem acesso</h3><p>Você não tem permissão para ver as receitas deste evento.</p></div>`;
    return;
  }

  alvo.innerHTML = `<div style="padding:36px;text-align:center;color:var(--texto-2)">Carregando...</div>`;
  try {
    [_receitas, _fontes] = await Promise.all([
      listarReceitas(contexto.evento.id),
      listarFontesReceita(contexto.evento.id),
    ]);
    _parcelas = await listarParcelasReceita(_receitas.map(r => r.id));
  } catch (e) {
    alvo.innerHTML = `<div class="vazio"><h3>Não consegui carregar</h3><p>${esc(e.message)}</p></div>`;
    return;
  }
  desenhar(alvo);
}

/* ── recebido de uma parcela (soma dos recebimentos) ── */
function recebidoDaParcela(parcela) {
  return (parcela.recebimento || []).reduce((a, r) => a + Number(r.valor), 0);
}

/* ── lista ─────────────────────────────────────────── */

function desenhar(alvo) {
  const p = contexto.permissao || {};
  const podeLancar = p.admin || p.lancar_receitas;
  const aberto = contexto.evento.situacao !== 'encerrado';

  let lista = _receitas;
  if (_filtro) lista = lista.filter(r => r.situacao === _filtro);

  const previsto = _receitas.reduce((a, r) => a + Number(r.valor_previsto || 0), 0);
  const recebido = _receitas.reduce((a, r) => a + Number(r.recebido || 0), 0);
  const aReceber = Math.max(previsto - recebido, 0);

  alvo.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px">
      <div class="metrica"><div class="rotulo">Previsto</div><div class="valor">${moeda(previsto)}</div></div>
      <div class="metrica"><div class="rotulo">Recebido</div><div class="valor" style="color:var(--verde)">${moeda(recebido)}</div></div>
      <div class="metrica"><div class="rotulo">A receber</div><div class="valor" style="color:var(--ambar)">${moeda(aReceber)}</div></div>
    </div>

    <div class="barra-filtros">
      <select class="controle" id="r-filtro" style="width:auto;min-width:180px">
        <option value="">Todas as situações</option>
        ${Object.entries(SITUACOES).map(([v, s]) =>
          `<option value="${v}" ${_filtro === v ? 'selected' : ''}>${s.rotulo}</option>`).join('')}
      </select>
      <div style="flex:1"></div>
      ${podeLancar ? `<button class="botao" id="r-fontes">Gerir fontes</button>` : ''}
      ${podeLancar && aberto ? `<button class="botao botao-primario" id="r-nova">Nova receita</button>` : ''}
    </div>

    ${lista.length ? `
      <div class="tabela-rolagem">
        <table class="tabela">
          <thead>
            <tr>
              <th style="width:150px">Fonte</th>
              <th>Receita</th>
              <th style="width:130px" class="num">Previsto</th>
              <th style="width:130px" class="num">Recebido</th>
              <th style="width:150px">Situação</th>
            </tr>
          </thead>
          <tbody>${lista.map(linha).join('')}</tbody>
          <tfoot>
            <tr>
              <td colspan="2">${lista.length} ${lista.length === 1 ? 'receita' : 'receitas'}</td>
              <td class="num" style="font-weight:600">${moeda(lista.reduce((a, r) => a + Number(r.valor_previsto || 0), 0))}</td>
              <td class="num" style="font-weight:600;color:var(--verde)">${moeda(lista.reduce((a, r) => a + Number(r.recebido || 0), 0))}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>` : `
      <div class="vazio">
        <h3>${_filtro ? 'Nada nesta situação' : 'Nenhuma receita ainda'}</h3>
        <p>${_filtro ? 'Escolha outra situação.' : 'Cadastre a receita prevista do evento por fonte — bilheteria, patrocínio, camarotes, bar.'}</p>
        ${podeLancar && aberto && !_filtro ? `<button class="botao botao-primario" id="r-nova2">Nova receita</button>` : ''}
      </div>`}
  `;

  alvo.querySelector('#r-filtro')?.addEventListener('change', e => { _filtro = e.target.value; desenhar(alvo); });
  alvo.querySelector('#r-fontes')?.addEventListener('click', () => modalFontes(alvo));
  alvo.querySelector('#r-nova')?.addEventListener('click', () => modalNova(alvo));
  alvo.querySelector('#r-nova2')?.addEventListener('click', () => modalNova(alvo));
  alvo.querySelectorAll('[data-rec]').forEach(el =>
    el.addEventListener('click', () => modalDetalhe(el.dataset.rec, alvo)));
}

function linha(r) {
  const sit = SITUACOES[r.situacao] || SITUACOES.prevista;
  return `
    <tr data-rec="${esc(r.id)}" style="cursor:pointer">
      <td style="font-size:13px;color:var(--texto-2)">${esc(r.fonte_nome || '—')}</td>
      <td>
        <div style="font-weight:500">${esc(r.descricao || '—')}</div>
        ${r.pagador ? `<div style="font-size:12px;color:var(--texto-2)">${esc(r.pagador)}</div>` : ''}
      </td>
      <td class="num" style="font-weight:500">${moeda(r.valor_previsto)}</td>
      <td class="num" style="color:${Number(r.recebido) > 0 ? 'var(--verde)' : 'var(--texto-3)'}">
        ${Number(r.recebido) > 0 ? moeda(r.recebido) : '—'}
      </td>
      <td><span class="etiqueta ${sit.classe}">${sit.rotulo}</span></td>
    </tr>`;
}

/* ── nova receita ──────────────────────────────────── */

function modalNova(alvo) {
  const ativas = _fontes.filter(f => f.ativa);
  if (!ativas.length) {
    abrirModal('Nova receita', `
      <div class="vazio" style="border:none;padding:20px 0">
        <h3>Nenhuma fonte cadastrada</h3>
        <p>Cadastre ao menos uma fonte de receita antes (bilheteria, patrocínio…).</p>
      </div>
      <div class="modal-acoes">
        <button class="botao" id="rn-fechar">Fechar</button>
        <button class="botao botao-primario" id="rn-fontes">Gerir fontes</button>
      </div>`);
    document.getElementById('rn-fechar').addEventListener('click', fecharModal);
    document.getElementById('rn-fontes').addEventListener('click', () => { fecharModal(); modalFontes(alvo); });
    return;
  }

  abrirModal('Nova receita', `
    <form id="fr">
      <div class="linha linha-2">
        <div class="campo">
          <label for="r-fonte">Fonte</label>
          <select class="controle" id="r-fonte">
            ${ativas.map(f => `<option value="${esc(f.id)}">${esc(f.nome)}</option>`).join('')}
          </select>
        </div>
        <div class="campo">
          <label for="r-prev">Valor previsto</label>
          <input class="controle" id="r-prev" type="number" min="0.01" step="0.01" required>
        </div>
      </div>

      <div class="campo">
        <label for="r-desc">Descrição</label>
        <input class="controle" id="r-desc" placeholder="Cota de patrocínio master">
      </div>
      <div class="campo">
        <label for="r-pagador">Pagador</label>
        <input class="controle" id="r-pagador" placeholder="Quem paga (opcional)">
      </div>

      <div class="campo">
        <label>Parcelas previstas</label>
        <div id="r-parcelas"></div>
        <button type="button" class="botao" id="r-add" style="height:32px;font-size:13px;margin-top:8px">
          + Acrescentar parcela
        </button>
        <div class="dica" id="r-conf"></div>
      </div>

      <div class="campo">
        <label for="r-obs">Observações</label>
        <textarea class="controle" id="r-obs" placeholder="Opcional"></textarea>
      </div>

      <div class="modal-acoes">
        <button type="button" class="botao" id="r-cancelar">Cancelar</button>
        <button type="submit" class="botao botao-primario" id="r-salvar">Cadastrar receita</button>
      </div>
    </form>
  `);

  const q = s => document.querySelector(s);
  let parcelas = [{ vencimento: '', valor: '' }];

  const desenharParcelas = () => {
    q('#r-parcelas').innerHTML = parcelas.map((p, k) => `
      <div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">
        <input class="controle rp-venc" data-k="${k}" type="date" value="${p.vencimento}"
               style="height:36px;font-size:14px;flex:1">
        <input class="controle rp-val num" data-k="${k}" type="number" min="0.01" step="0.01"
               value="${p.valor}" placeholder="valor" style="height:36px;font-size:14px;width:130px">
        ${parcelas.length > 1 ? `<button type="button" class="botao-icone rp-rem" data-k="${k}">×</button>` : ''}
      </div>`).join('');

    q('#r-parcelas').querySelectorAll('.rp-venc').forEach(el =>
      el.addEventListener('change', () => { parcelas[el.dataset.k].vencimento = el.value; }));
    q('#r-parcelas').querySelectorAll('.rp-val').forEach(el =>
      el.addEventListener('input', () => { parcelas[el.dataset.k].valor = el.value; conferir(); }));
    q('#r-parcelas').querySelectorAll('.rp-rem').forEach(el =>
      el.addEventListener('click', () => { parcelas.splice(el.dataset.k, 1); desenharParcelas(); conferir(); }));
    conferir();
  };

  const conferir = () => {
    const total = Number(q('#r-prev').value) || 0;
    const soma = parcelas.reduce((a, p) => a + (Number(p.valor) || 0), 0);
    const el = q('#r-conf');
    if (Math.abs(soma - total) > 0.005) {
      el.innerHTML = `<span style="color:var(--ambar)">As parcelas somam ${moeda(soma)} de ${moeda(total)}.</span>`;
    } else {
      el.innerHTML = `<span style="color:var(--verde)">Parcelas conferem com o previsto.</span>`;
    }
  };

  q('#r-prev').addEventListener('input', () => {
    if (parcelas.length === 1) { parcelas[0].valor = q('#r-prev').value; desenharParcelas(); }
    else conferir();
  });
  q('#r-add').addEventListener('click', () => {
    const total = Number(q('#r-prev').value) || 0;
    const soma = parcelas.reduce((a, p) => a + (Number(p.valor) || 0), 0);
    parcelas.push({ vencimento: '', valor: Math.max(total - soma, 0).toFixed(2) });
    desenharParcelas();
  });
  q('#r-cancelar').addEventListener('click', fecharModal);
  desenharParcelas();

  q('#fr').addEventListener('submit', async e => {
    e.preventDefault();
    const previsto = Number(q('#r-prev').value) || 0;
    if (previsto <= 0) return aviso('Informe o valor previsto.', 'aviso');

    const validas = parcelas.filter(p => Number(p.valor) > 0);
    if (!validas.length) return aviso('Informe ao menos uma parcela com valor.', 'aviso');
    const soma = validas.reduce((a, p) => a + Number(p.valor), 0);
    if (Math.abs(soma - previsto) > 0.005) {
      return aviso(`As parcelas somam ${moeda(soma)}, o previsto é ${moeda(previsto)}.`, 'aviso');
    }

    await comBotao(q('#r-salvar'), async () => {
      try {
        await criarReceita(contexto.evento.id, {
          fonte_receita_id: q('#r-fonte').value,
          valor_previsto: previsto,
          descricao: q('#r-desc').value,
          pagador: q('#r-pagador').value,
          observacoes: q('#r-obs').value,
        }, validas);
        aviso('Receita cadastrada.');
        fecharModal();
        await abaReceitas(alvo);
      } catch (err) { aviso(err.message, 'erro'); }
    });
  });
}

/* ── detalhe da receita ────────────────────────────── */

function modalDetalhe(id, alvo) {
  const r = _receitas.find(x => x.id === id);
  if (!r) return;
  const sit = SITUACOES[r.situacao] || SITUACOES.prevista;
  const parcelas = _parcelas.filter(x => x.receita_id === id);
  const p = contexto.permissao || {};
  const podeLancar = p.admin || p.lancar_receitas;
  const aberto = contexto.evento.situacao !== 'encerrado';

  abrirModal(`Receita · ${esc(r.fonte_nome || 'sem fonte')}`, `
    <div style="display:flex;gap:12px;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap">
      <div style="flex:1;min-width:180px">
        <div style="font-size:16px;font-weight:600">${esc(r.descricao || '—')}</div>
        ${r.pagador ? `<div style="font-size:13px;color:var(--texto-2)">${esc(r.pagador)}</div>` : ''}
      </div>
      <div style="text-align:right">
        <div style="font-size:20px;font-weight:600;font-variant-numeric:tabular-nums">${moeda(r.valor_previsto)}</div>
        <span class="etiqueta ${sit.classe}" style="margin-top:4px">${sit.rotulo}</span>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
      <div class="metrica"><div class="rotulo">Recebido</div><div class="valor" style="font-size:16px;color:var(--verde)">${moeda(r.recebido)}</div></div>
      <div class="metrica"><div class="rotulo">A receber</div><div class="valor" style="font-size:16px;color:var(--ambar)">${moeda(r.a_receber)}</div></div>
    </div>

    ${r.observacoes ? `<div class="cartao" style="margin-bottom:14px;font-size:14px">${esc(r.observacoes)}</div>` : ''}

    <h3 style="font-size:14px;margin-bottom:8px">Parcelas e recebimentos</h3>
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px">
      ${parcelas.map(x => {
        const receb = recebidoDaParcela(x);
        const falta = Number(x.valor) - receb;
        const lancamentos = (x.recebimento || []).filter(g => !g.estorno_de && Number(g.valor) > 0);
        return `
        <div class="cartao">
          <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start">
            <div>
              <div style="font-size:14px">${x.vencimento ? 'Vence ' + dataBR(x.vencimento) : 'Sem vencimento'}</div>
              <div style="font-size:12px;color:${receb > 0.005 ? 'var(--verde)' : 'var(--texto-2)'}">
                ${receb > 0.005 ? 'recebido ' + moeda(receb) : 'nada recebido'}${falta > 0.005 ? ' · falta ' + moeda(falta) : ''}
              </div>
            </div>
            <div style="text-align:right">
              <div class="num" style="font-weight:500">${moeda(x.valor)}</div>
              ${podeLancar && aberto && falta > 0.005
                ? `<button class="botao" data-receber="${esc(x.id)}" data-falta="${falta.toFixed(2)}" style="height:30px;font-size:13px;margin-top:6px">Registrar recebimento</button>` : ''}
            </div>
          </div>
          ${lancamentos.length ? `
            <div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--borda);display:flex;flex-direction:column;gap:6px">
              ${lancamentos.map(g => `
                <div style="display:flex;justify-content:space-between;align-items:center;font-size:13px">
                  <span>${dataBR(g.data)} · <span style="color:var(--verde)">${moeda(g.valor)}</span></span>
                  ${podeLancar && aberto ? `<button class="botao-icone" data-estornar="${esc(g.id)}" title="Estornar">↩</button>` : ''}
                </div>`).join('')}
            </div>` : ''}
        </div>`;
      }).join('')}
    </div>

    <div style="font-size:12px;color:var(--texto-3);margin-bottom:6px">
      Cadastrada por ${esc(r.criado_por_nome || '—')} em ${dataBR(r.criado_em)}
    </div>

    <div class="modal-acoes">
      ${podeLancar && aberto && Number(r.recebido) <= 0.005
        ? `<button type="button" class="botao botao-perigo" id="rd-apagar" style="margin-right:auto">Apagar receita</button>` : ''}
      <button type="button" class="botao" id="rd-fechar">Fechar</button>
    </div>
  `);

  document.getElementById('rd-fechar').addEventListener('click', fecharModal);
  document.getElementById('rd-apagar')?.addEventListener('click', async () => {
    if (!confirm('Apagar esta receita? Fica registrado na auditoria.')) return;
    try {
      await apagarReceita(id);
      aviso('Receita apagada.');
      fecharModal();
      await abaReceitas(alvo);
    } catch (e) { aviso(e.message, 'erro'); }
  });
  document.querySelectorAll('[data-receber]').forEach(b =>
    b.addEventListener('click', () => modalRecebimento(b.dataset.receber, Number(b.dataset.falta), alvo)));
  document.querySelectorAll('[data-estornar]').forEach(b =>
    b.addEventListener('click', async () => {
      const motivo = prompt('Motivo do estorno:');
      if (motivo === null) return;
      try {
        await estornarRecebimento(b.dataset.estornar, motivo);
        aviso('Recebimento estornado.');
        fecharModal();
        await abaReceitas(alvo);
      } catch (e) { aviso(e.message, 'erro'); }
    }));
}

/* ── registrar recebimento ─────────────────────────── */

async function modalRecebimento(parcelaId, falta, alvo) {
  let contas = [];
  try { contas = await listarContas(contexto.evento.empresa?.id); } catch (_) {}
  abrirModal('Registrar recebimento', `
    <form id="frc">
      <div class="linha linha-2">
        <div class="campo">
          <label for="rc-valor">Valor</label>
          <input class="controle" id="rc-valor" type="number" min="0.01" step="0.01"
                 value="${falta > 0 ? falta.toFixed(2) : ''}" required>
        </div>
        <div class="campo">
          <label for="rc-data">Data</label>
          <input class="controle" id="rc-data" type="date" value="${new Date().toISOString().slice(0, 10)}">
        </div>
      </div>
      <div class="campo">
        <label for="rc-conta">Onde entrou (conta)</label>
        <select class="controle" id="rc-conta">
          <option value="">— não informar —</option>
          ${contas.map(c => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join('')}
        </select>
        <div class="dica">A conta onde o dinheiro entrou — alimenta o saldo em Contas.</div>
      </div>
      <div class="campo">
        <label for="rc-obs">Observação</label>
        <input class="controle" id="rc-obs" placeholder="Opcional">
      </div>
      <div class="modal-acoes">
        <button type="button" class="botao" id="rc-cancelar">Cancelar</button>
        <button type="submit" class="botao botao-primario" id="rc-salvar">Registrar</button>
      </div>
    </form>
  `);

  const q = s => document.querySelector(s);
  q('#rc-cancelar').addEventListener('click', fecharModal);
  q('#frc').addEventListener('submit', async e => {
    e.preventDefault();
    const valor = Number(q('#rc-valor').value) || 0;
    if (valor <= 0) return aviso('Informe o valor.', 'aviso');
    await comBotao(q('#rc-salvar'), async () => {
      try {
        await registrarRecebimento(parcelaId, {
          valor, data: q('#rc-data').value, conta_id: q('#rc-conta').value || null, observacao: q('#rc-obs').value,
        });
        aviso('Recebimento registrado.');
        fecharModal();
        await abaReceitas(alvo);
      } catch (err) { aviso(err.message, 'erro'); }
    });
  });
}

/* ── gerir fontes ──────────────────────────────────── */

async function modalFontes(alvo) {
  const eventoId = contexto.evento.id;

  const render = async () => {
    _fontes = await listarFontesReceita(eventoId);
    q('#mf-lista').innerHTML = _fontes.length
      ? _fontes.map(f => `
        <div class="linha-lista">
          <label class="caixa-perm" style="flex:1;margin:0">
            <input type="checkbox" data-ativa="${esc(f.id)}" ${f.ativa ? 'checked' : ''}>
            <span><span class="rot">${esc(f.nome)}</span>
              <span class="desc">${f.ativa ? 'ativa' : 'desativada'}</span></span>
          </label>
          <button class="botao-icone" data-renomear="${esc(f.id)}" title="Renomear">&#9998;</button>
        </div>`).join('')
      : `<p class="dica">Nenhuma fonte ainda.</p>`;

    q('#mf-lista').querySelectorAll('[data-ativa]').forEach(el =>
      el.addEventListener('change', async () => {
        try { await alternarFonteReceita(el.dataset.ativa, el.checked); await render(); }
        catch (e) { aviso(e.message, 'erro'); }
      }));
    q('#mf-lista').querySelectorAll('[data-renomear]').forEach(el =>
      el.addEventListener('click', async () => {
        const f = _fontes.find(x => x.id === el.dataset.renomear);
        const nome = prompt('Novo nome da fonte:', f?.nome || '');
        if (!nome?.trim()) return;
        try { await salvarFonteReceita(eventoId, el.dataset.renomear, nome); await render(); }
        catch (e) { aviso(e.message, 'erro'); }
      }));
  };
  const q = s => document.querySelector(s);

  // eventos anteriores da mesma empresa, para copiar fontes
  let outros = [];
  try {
    const emp = empresaAtual();
    outros = (await listarEventos())
      .filter(e => e.empresa?.id === emp?.id && e.id !== eventoId);
  } catch (e) { /* segue sem a opção de copiar */ }

  abrirModal('Fontes de receita', `
    <div id="mf-lista" style="margin-bottom:14px"></div>

    <form id="mf-nova" style="display:flex;gap:8px;margin-bottom:12px">
      <input class="controle" id="mf-nome" placeholder="Nova fonte (ex.: Bilheteria)" style="flex:1">
      <button type="submit" class="botao botao-primario">Adicionar</button>
    </form>

    ${outros.length ? `
      <div class="cartao" style="background:var(--superficie-2);border:none;padding:12px">
        <div class="rotulo" style="margin-bottom:6px">Copiar fontes de outro evento</div>
        <div style="display:flex;gap:8px">
          <select class="controle" id="mf-copiar-ev" style="flex:1">
            <option value="">— escolher evento —</option>
            ${outros.map(e => `<option value="${esc(e.id)}">${esc(e.nome)}</option>`).join('')}
          </select>
          <button type="button" class="botao" id="mf-copiar">Copiar</button>
        </div>
      </div>` : ''}

    <div class="modal-acoes">
      <button type="button" class="botao" id="mf-fechar">Fechar</button>
    </div>
  `);

  await render();

  q('#mf-fechar').addEventListener('click', async () => { fecharModal(); await abaReceitas(alvo); });
  q('#mf-nova').addEventListener('submit', async e => {
    e.preventDefault();
    const nome = q('#mf-nome').value.trim();
    if (!nome) return;
    try { await salvarFonteReceita(eventoId, null, nome); q('#mf-nome').value = ''; await render(); }
    catch (err) { aviso(err.message, 'erro'); }
  });
  q('#mf-copiar')?.addEventListener('click', async () => {
    const evId = q('#mf-copiar-ev').value;
    if (!evId) return aviso('Escolha um evento.', 'aviso');
    try {
      const fontes = await listarFontesReceita(evId);
      const nomes = fontes.filter(f => f.ativa).map(f => f.nome);
      if (!nomes.length) return aviso('Aquele evento não tem fontes ativas.', 'aviso');
      await copiarFontesReceita(eventoId, nomes);
      aviso(`${nomes.length} fonte(s) copiada(s).`);
      await render();
    } catch (e) { aviso(e.message, 'erro'); }
  });
}
