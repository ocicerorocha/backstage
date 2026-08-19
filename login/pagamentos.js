// ═══════════════════════════════════════════════════════
// Agenda de pagamentos
//
// A tela de quem paga. Fica no nível da empresa: na segunda-feira
// ninguém paga "o Irecê", paga o que vence naquele dia, venha de
// onde vier.
//
// Sem projeção de cobertura e sem separação por fonte — a fonte
// só se sabe na hora de pagar, e a receita entra de forma
// imprevisível. O que ajuda a decidir é o ACUMULADO: quanto terá
// saído do caixa se você pagar tudo até ali.
// ═══════════════════════════════════════════════════════

import {
  empresaAtual, listarAgenda, adiamentosDasParcelas, pagamentosDaParcela,
  registrarPagamento, estornarPagamento, adiarParcela, marcarUrgente,
  enviarComprovante, linkComprovante, comprimirImagem, listarFontes, sessao,
} from './nucleo.js';
import { esc, aviso, abrirModal, fecharModal, comBotao, moeda, dataBR } from './ui.js';

let _linhas = [];
let _adiamentos = [];
let _filtroEvento = '';
let _soUrgentes = false;

const hoje = () => new Date().toISOString().slice(0, 10);

export async function telaPagamentos() {
  const alvo = document.querySelector('#conteudo');
  const emp = empresaAtual();
  if (!emp) {
    alvo.innerHTML = `<div class="vazio"><h3>Sem produtora</h3><p>Você não está vinculado a nenhuma produtora.</p></div>`;
    return;
  }

  alvo.innerHTML = `<div style="padding:40px;text-align:center;color:var(--texto-2)">Carregando agenda...</div>`;
  try {
    [_linhas, _adiamentos] = await Promise.all([listarAgenda(emp.id), adiamentosDasParcelas()]);
  } catch (e) {
    alvo.innerHTML = `<div class="vazio"><h3>Não consegui carregar</h3><p>${esc(e.message)}</p></div>`;
    return;
  }
  desenhar(alvo);
}

function desenhar(alvo) {
  let linhas = _linhas;
  if (_filtroEvento) linhas = linhas.filter(l => l.evento_id === _filtroEvento);
  if (_soUrgentes)   linhas = linhas.filter(l => l.urgente);

  const eventos = [...new Map(_linhas.map(l => [l.evento_id, l.evento_nome])).entries()];
  const h = hoje();

  const vencidas = linhas.filter(l => l.vencimento && l.vencimento < h);
  const semData  = linhas.filter(l => !l.vencimento);
  const futuras  = linhas.filter(l => l.vencimento && l.vencimento >= h);

  // agrupa as futuras por dia, e vai somando o acumulado
  const porDia = new Map();
  futuras.forEach(l => {
    if (!porDia.has(l.vencimento)) porDia.set(l.vencimento, []);
    porDia.get(l.vencimento).push(l);
  });
  const dias = [...porDia.keys()].sort();

  const totalVencido = vencidas.reduce((a, l) => a + Number(l.falta), 0);
  const total7 = futuras
    .filter(l => l.vencimento <= somarDias(h, 7))
    .reduce((a, l) => a + Number(l.falta), 0);
  const totalTudo = linhas.reduce((a, l) => a + Number(l.falta), 0);
  const urgentes = linhas.filter(l => l.urgente).length;

  let acumulado = totalVencido;

  alvo.innerHTML = `
    <div class="pagina-topo">
      <h1>Agenda de pagamentos</h1>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:18px">
      <div class="metrica">
        <div class="rotulo">Vencido</div>
        <div class="valor" style="color:${totalVencido > 0 ? 'var(--vermelho)' : 'var(--texto-2)'}">${moeda(totalVencido)}</div>
        <div class="rotulo" style="margin-top:2px">${vencidas.length} ${vencidas.length === 1 ? 'parcela' : 'parcelas'}</div>
      </div>
      <div class="metrica">
        <div class="rotulo">Próximos 7 dias</div>
        <div class="valor" style="color:var(--ambar)">${moeda(total7)}</div>
      </div>
      <div class="metrica">
        <div class="rotulo">Total a pagar</div>
        <div class="valor">${moeda(totalTudo)}</div>
        <div class="rotulo" style="margin-top:2px">${linhas.length} ${linhas.length === 1 ? 'parcela' : 'parcelas'}</div>
      </div>
    </div>

    <div class="barra-filtros">
      <select class="controle" id="a-evento" style="width:auto;min-width:200px">
        <option value="">Todos os eventos</option>
        ${eventos.map(([id, nome]) => `<option value="${esc(id)}" ${_filtroEvento === id ? 'selected' : ''}>${esc(nome)}</option>`).join('')}
      </select>
      <button class="botao ${_soUrgentes ? 'botao-primario' : ''}" id="a-urgentes">
        ${_soUrgentes ? 'Mostrando urgentes' : `Só urgentes${urgentes ? ' (' + urgentes + ')' : ''}`}
      </button>
    </div>

    ${!linhas.length ? `
      <div class="vazio">
        <h3>Nada a pagar</h3>
        <p>Não há parcelas aprovadas aguardando pagamento${_filtroEvento || _soUrgentes ? ' com estes filtros' : ''}.</p>
      </div>` : ''}

    ${vencidas.length ? `
      <div class="dia-cabeca vencido">
        <span>Vencido</span>
        <span class="num">${moeda(totalVencido)}</span>
      </div>
      ${vencidas.map(l => cartao(l, true)).join('')}` : ''}

    ${dias.map(d => {
      const doDia = porDia.get(d);
      const totalDia = doDia.reduce((a, l) => a + Number(l.falta), 0);
      acumulado += totalDia;
      return `
        <div class="dia-cabeca">
          <span>${nomeDoDia(d)}</span>
          <span class="num">${moeda(totalDia)}</span>
          <span class="acumulado">acumulado ${moeda(acumulado)}</span>
        </div>
        ${doDia.map(l => cartao(l, false)).join('')}`;
    }).join('')}

    ${semData.length ? `
      <div class="dia-cabeca">
        <span>Sem vencimento definido</span>
        <span class="num">${moeda(semData.reduce((a, l) => a + Number(l.falta), 0))}</span>
      </div>
      ${semData.map(l => cartao(l, false)).join('')}` : ''}
  `;

  alvo.querySelector('#a-evento').addEventListener('change', e => {
    _filtroEvento = e.target.value; desenhar(alvo);
  });
  alvo.querySelector('#a-urgentes').addEventListener('click', () => {
    _soUrgentes = !_soUrgentes; desenhar(alvo);
  });
  alvo.querySelectorAll('[data-pagar]').forEach(b =>
    b.addEventListener('click', e => { e.stopPropagation(); modalPagar(b.dataset.pagar); }));
  alvo.querySelectorAll('[data-adiar]').forEach(b =>
    b.addEventListener('click', e => { e.stopPropagation(); modalAdiar(b.dataset.adiar); }));
  alvo.querySelectorAll('[data-urgente]').forEach(b =>
    b.addEventListener('click', async e => {
      e.stopPropagation();
      try {
        await marcarUrgente(b.dataset.urgente, b.dataset.estado !== 'true');
        await telaPagamentos();
      } catch (err) { aviso(err.message, 'erro'); }
    }));
}

function cartao(l, vencido) {
  const ad = _adiamentos.find(a => a.parcela_id === l.parcela_id);
  const pagoParcial = Number(l.pago) > 0.005;
  return `
    <div class="pag-cartao ${vencido ? 'vencido' : ''} ${l.urgente ? 'urgente' : ''}">
      <span class="marca"></span>
      <div style="flex:1;min-width:0">
        <div style="font-weight:500">
          <span style="color:var(--texto-3);font-variant-numeric:tabular-nums">${String(l.item_numero).padStart(3, '0')}</span>
          ${esc(l.item_descricao)}
        </div>
        <div style="font-size:12px;color:var(--texto-2)">
          ${esc(l.fornecedor_nome || 'sem favorecido')} · ${esc(l.evento_nome)}
          ${l.vencimento ? ' · vence ' + dataBR(l.vencimento) : ' · sem data'}
        </div>
        ${l.pag_chave || l.pag_conta ? `
          <div style="font-size:12px;color:var(--texto-3);margin-top:2px">
            ${l.pag_tipo === 'conta'
              ? `${esc(l.pag_banco || '')} ag ${esc(l.pag_agencia || '—')} cc ${esc(l.pag_conta || '—')}`
              : `PIX ${esc(l.pag_chave || '—')}`}
          </div>` : ''}
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
          ${l.urgente ? '<span class="etiqueta etiqueta-ambar">urgente</span>' : ''}
          ${l.pag_divergente ? '<span class="etiqueta etiqueta-vermelha">dados diferentes do cadastro</span>' : ''}
          ${pagoParcial ? `<span class="etiqueta etiqueta-verde">pago ${moeda(l.pago)}</span>` : ''}
          ${ad ? `<span class="etiqueta etiqueta-neutra" title="${esc(ad.ultimo_motivo || '')}">adiada ${ad.vezes}×</span>` : ''}
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:17px;font-weight:600;font-variant-numeric:tabular-nums">${moeda(l.falta)}</div>
        <div style="display:flex;gap:4px;margin-top:6px;justify-content:flex-end;flex-wrap:wrap">
          <button class="botao" style="height:30px;font-size:12px;padding:0 10px"
                  data-urgente="${esc(l.parcela_id)}" data-estado="${l.urgente}">
            ${l.urgente ? 'Tirar urgência' : 'Urgente'}
          </button>
          <button class="botao" style="height:30px;font-size:12px;padding:0 10px"
                  data-adiar="${esc(l.parcela_id)}">Adiar</button>
          <button class="botao botao-primario" style="height:30px;font-size:12px;padding:0 12px"
                  data-pagar="${esc(l.parcela_id)}">Pagar</button>
        </div>
      </div>
    </div>`;
}

function somarDias(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function nomeDoDia(iso) {
  const h = hoje();
  if (iso === h) return 'Hoje, ' + dataBR(iso);
  if (iso === somarDias(h, 1)) return 'Amanhã, ' + dataBR(iso);
  const dias = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
  const d = new Date(iso + 'T12:00:00');
  return `${dias[d.getDay()]}, ${dataBR(iso)}`;
}

/* ── confirmar pagamento ───────────────────────────── */

async function modalPagar(parcelaId) {
  const l = _linhas.find(x => x.parcela_id === parcelaId);
  if (!l) return;

  let fontes = [], anteriores = [];
  try {
    [fontes, anteriores] = await Promise.all([
      listarFontes(l.evento_id), pagamentosDaParcela(parcelaId),
    ]);
  } catch (e) { aviso(e.message, 'erro'); }

  abrirModal('Confirmar pagamento', `
    <div style="margin-bottom:14px">
      <div style="font-weight:600;font-size:15px">${esc(l.item_descricao)}</div>
      <div style="font-size:13px;color:var(--texto-2)">
        ${esc(l.fornecedor_nome || 'sem favorecido')} · ${esc(l.evento_nome)}
      </div>
    </div>

    ${l.pag_chave || l.pag_conta ? `
      <div class="cartao" style="padding:12px;margin-bottom:14px;${l.pag_divergente ? 'background:var(--ambar-fundo);border-color:var(--ambar)' : ''}">
        <div style="font-size:12px;color:var(--texto-3);margin-bottom:3px">Para onde vai</div>
        <div style="font-size:15px;font-weight:500">
          ${l.pag_tipo === 'conta'
            ? `${esc(l.pag_banco || '')} · ag ${esc(l.pag_agencia || '—')} · cc ${esc(l.pag_conta || '—')}`
            : `PIX ${esc(l.pag_chave || '—')}`}
        </div>
        ${l.pag_titular ? `<div style="font-size:12px;color:var(--texto-2)">${esc(l.pag_titular)}</div>` : ''}
        ${l.pag_divergente ? `
          <div style="font-size:12px;color:var(--ambar);margin-top:8px">
            <strong>Atenção:</strong> estes dados são diferentes dos que estão no cadastro do fornecedor.
            Confira antes de pagar.
          </div>` : ''}
      </div>` : `
      <div class="cartao" style="background:var(--vermelho-fundo);border-color:var(--vermelho);padding:12px;margin-bottom:14px">
        <div style="font-size:13px;color:var(--vermelho)">
          Esta solicitação não trouxe dados de pagamento.
        </div>
      </div>`}

    ${anteriores.length ? `
      <div style="margin-bottom:14px">
        <div style="font-size:12px;color:var(--texto-3);margin-bottom:6px">Já registrado nesta parcela</div>
        <div class="cartao" style="padding:0;overflow:hidden">
          ${anteriores.map(p => `
            <div class="linha-lista">
              <div style="flex:1;min-width:0">
                <div style="font-size:13px">${dataBR(p.data)} · ${esc(p.usuario?.nome || '—')}</div>
                ${p.observacao ? `<div style="font-size:12px;color:var(--texto-2)">${esc(p.observacao)}</div>` : ''}
                ${p.autoaprovado ? '<span class="etiqueta etiqueta-ambar" style="margin-top:3px">autoaprovado</span>' : ''}
              </div>
              <span class="num" style="font-weight:500;color:${Number(p.valor) < 0 ? 'var(--vermelho)' : 'var(--verde)'}">
                ${moeda(p.valor)}
              </span>
              ${Number(p.valor) > 0 && !anteriores.some(x => x.estorno_de === p.id)
                ? `<button class="botao" style="height:28px;font-size:12px;padding:0 8px" data-estornar="${esc(p.id)}">Estornar</button>` : ''}
            </div>`).join('')}
        </div>
      </div>` : ''}

    <form id="fpg">
      <div class="linha linha-2">
        <div class="campo">
          <label for="pg-valor">Valor pago</label>
          <input class="controle" id="pg-valor" type="number" min="0.01" step="0.01"
                 value="${Number(l.falta).toFixed(2)}" required>
          <div class="dica">Falta ${moeda(l.falta)} nesta parcela</div>
        </div>
        <div class="campo">
          <label for="pg-data">Data</label>
          <input class="controle" id="pg-data" type="date" value="${hoje()}">
        </div>
      </div>

      <div class="campo">
        <label for="pg-fonte">De onde saiu</label>
        <select class="controle" id="pg-fonte">
          <option value="">— não informar —</option>
          ${fontes.filter(f => f.ativa).map(f => `<option value="${esc(f.id)}">${esc(f.nome)}</option>`).join('')}
        </select>
        <div class="dica">A fonte é escolhida agora, no momento do pagamento</div>
      </div>

      <div class="campo">
        <label>Comprovante</label>
        <div class="area-arquivo" id="pg-area" style="padding:18px">
          <div style="font-size:14px" id="pg-arq-nome">Anexar comprovante</div>
          <div style="font-size:12px;color:var(--texto-2)">Foto ou PDF</div>
          <input type="file" id="pg-arq" accept="image/*,application/pdf" style="display:none">
        </div>
      </div>

      <div class="campo">
        <label for="pg-obs">Observação</label>
        <input class="controle" id="pg-obs" placeholder="Opcional">
      </div>

      <div class="modal-acoes">
        <button type="button" class="botao" id="pg-cancelar">Cancelar</button>
        <button type="submit" class="botao botao-primario" id="pg-salvar">Registrar pagamento</button>
      </div>
    </form>
  `);

  const q = s => document.querySelector(s);
  let arquivo = null;

  q('#pg-cancelar').addEventListener('click', fecharModal);
  q('#pg-area').addEventListener('click', () => q('#pg-arq').click());
  q('#pg-arq').addEventListener('change', async e => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      arquivo = f.type.startsWith('image/') ? await comprimirImagem(f, 1600, .8) : f;
      q('#pg-arq-nome').textContent = arquivo.name;
    } catch (err) { aviso(err.message, 'erro'); }
  });

  document.querySelectorAll('[data-estornar]').forEach(b =>
    b.addEventListener('click', async () => {
      const motivo = prompt('Motivo do estorno:');
      if (motivo === null) return;
      try {
        await estornarPagamento(b.dataset.estornar, motivo);
        aviso('Estorno registrado.');
        fecharModal();
        await telaPagamentos();
      } catch (e) { aviso(e.message, 'erro'); }
    }));

  q('#fpg').addEventListener('submit', async e => {
    e.preventDefault();
    const valor = Number(q('#pg-valor').value) || 0;
    if (valor <= 0) return aviso('Informe o valor pago.', 'aviso');

    await comBotao(q('#pg-salvar'), async () => {
      try {
        let comprovante = null;
        if (arquivo) comprovante = await enviarComprovante(arquivo);
        await registrarPagamento(parcelaId, {
          valor,
          data: q('#pg-data').value,
          fonte_id: q('#pg-fonte').value,
          comprovante_url: comprovante,
          observacao: q('#pg-obs').value,
        });
        aviso('Pagamento registrado.');
        fecharModal();
        await telaPagamentos();
      } catch (err) { aviso(err.message, 'erro', 6000); }
    });
  });
}

/* ── adiar ─────────────────────────────────────────── */

function modalAdiar(parcelaId) {
  const l = _linhas.find(x => x.parcela_id === parcelaId);
  if (!l) return;
  const ad = _adiamentos.find(a => a.parcela_id === parcelaId);

  abrirModal('Adiar pagamento', `
    <div style="margin-bottom:14px">
      <div style="font-weight:600">${esc(l.item_descricao)}</div>
      <div style="font-size:13px;color:var(--texto-2)">
        ${esc(l.fornecedor_nome || '—')} · ${moeda(l.falta)}
        ${l.vencimento ? ' · vence ' + dataBR(l.vencimento) : ''}
      </div>
    </div>

    ${ad ? `
      <div class="cartao" style="background:var(--ambar-fundo);border-color:var(--ambar);padding:10px;margin-bottom:14px">
        <div style="font-size:12px;color:var(--ambar)">
          Esta parcela já foi adiada ${ad.vezes} ${ad.vezes === 1 ? 'vez' : 'vezes'}.
          ${ad.ultimo_motivo ? `Último motivo: ${esc(ad.ultimo_motivo)}` : ''}
        </div>
      </div>` : ''}

    <form id="fad">
      <div class="campo">
        <label for="ad-data">Nova data</label>
        <input class="controle" id="ad-data" type="date" value="${esc(l.vencimento || hoje())}" required>
      </div>
      <div class="campo">
        <label for="ad-motivo">Motivo</label>
        <input class="controle" id="ad-motivo" placeholder="Renegociado com o fornecedor">
        <div class="dica">Fica registrado. Ajuda a negociar sabendo o histórico.</div>
      </div>
      <div class="modal-acoes">
        <button type="button" class="botao" id="ad-cancelar">Cancelar</button>
        <button type="submit" class="botao botao-primario" id="ad-salvar">Adiar</button>
      </div>
    </form>
  `);

  document.getElementById('ad-cancelar').addEventListener('click', fecharModal);
  document.getElementById('fad').addEventListener('submit', async e => {
    e.preventDefault();
    const data = document.getElementById('ad-data').value;
    if (!data) return aviso('Informe a nova data.', 'aviso');
    await comBotao(document.getElementById('ad-salvar'), async () => {
      try {
        await adiarParcela(parcelaId, data, document.getElementById('ad-motivo').value);
        aviso('Vencimento remarcado.');
        fecharModal();
        await telaPagamentos();
      } catch (err) { aviso(err.message, 'erro'); }
    });
  });
}
