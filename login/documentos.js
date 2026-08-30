// ═══════════════════════════════════════════════════════
// Documentos — todos os anexos da produtora, num lugar só
//
// Junta os documentos ligados a itens de produção e a receitas
// de todos os eventos da produtora ativa. Filtros por evento,
// por categoria e busca por nome (do arquivo, do item ou da
// receita). Abrir usa link temporário; o depósito é fechado.
// ═══════════════════════════════════════════════════════

import { empresaAtual, souAdmin, listarDocumentosEmpresa, linkDocumento, apagarDocumento } from './nucleo.js';
import { esc, aviso, dataBR } from './ui.js';

let _emp = null;
let _docs = [];
let _fEvento = '';    // '' = todos
let _fCategoria = ''; // '' = todas
let _busca = '';

export async function telaDocumentos() {
  const alvo = document.querySelector('#conteudo');
  _emp = empresaAtual();
  if (!_emp) { alvo.innerHTML = `<div class="vazio"><h3>Sem produtora</h3></div>`; return; }

  alvo.innerHTML = `<div style="padding:40px;text-align:center;color:var(--texto-2)">Carregando documentos...</div>`;
  try {
    _docs = await listarDocumentosEmpresa(_emp.id);
  } catch (e) {
    alvo.innerHTML = `<div class="vazio"><h3>Não consegui carregar</h3><p>${esc(e.message)}</p></div>`;
    return;
  }
  pintar();
}

function tamanhoBonito(bytes) {
  const b = Number(bytes || 0);
  if (!b) return '';
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(0) + ' KB';
  return (b / 1024 / 1024).toFixed(1) + ' MB';
}

function iconeArquivo(tipo, nome) {
  const n = (nome || '').toLowerCase();
  const t = (tipo || '').toLowerCase();
  if (t.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic)$/.test(n)) return '🖼️';
  if (t === 'application/pdf' || n.endsWith('.pdf')) return '📄';
  if (/\.(xlsx?|csv)$/.test(n)) return '📊';
  if (/\.(docx?)$/.test(n)) return '📝';
  return '📎';
}

function pintar() {
  const alvo = document.querySelector('#conteudo');

  const eventos = [...new Map(_docs.map(d => [d.evento_id, d.evento_nome])).entries()]
    .map(([id, nome]) => ({ id, nome })).sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
  const categorias = [...new Set(_docs.map(d => d.categoria).filter(Boolean))].sort();

  let lista = _docs;
  if (_fEvento) lista = lista.filter(d => d.evento_id === _fEvento);
  if (_fCategoria) lista = lista.filter(d => (d.categoria || '') === _fCategoria);
  if (_busca) {
    const q = _busca.toLowerCase();
    lista = lista.filter(d =>
      (d.nome || '').toLowerCase().includes(q) ||
      (d.item_nome || '').toLowerCase().includes(q) ||
      (d.receita_nome || '').toLowerCase().includes(q) ||
      (d.categoria || '').toLowerCase().includes(q));
  }

  alvo.innerHTML = `
    <div class="pagina-topo">
      <h1>Documentos</h1>
      <div class="espaco"></div>
      <span style="color:var(--texto-2);font-size:13px">${lista.length} de ${_docs.length}</span>
    </div>

    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
      <input class="controle" id="d-busca" placeholder="Buscar por arquivo, item, receita ou categoria"
             value="${esc(_busca)}" style="flex:1;min-width:220px">
      <select class="controle" id="d-evento" style="width:auto;min-width:150px">
        <option value="">Todos os eventos</option>
        ${eventos.map(e => `<option value="${esc(e.id)}" ${_fEvento === e.id ? 'selected' : ''}>${esc(e.nome || '—')}</option>`).join('')}
      </select>
      <select class="controle" id="d-categoria" style="width:auto;min-width:150px">
        <option value="">Todas as categorias</option>
        ${categorias.map(c => `<option value="${esc(c)}" ${_fCategoria === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
      </select>
    </div>

    ${lista.length ? `
      <div class="cartao" style="padding:0;overflow:hidden">
        ${lista.map(d => {
          const vinc = d.item_id ? `Item: ${esc(d.item_nome || '—')}`
                     : d.receita_id ? `Receita: ${esc(d.receita_nome || '—')}`
                     : 'Evento';
          const podeApagar = souAdmin(_emp.id);
          return `
          <div class="linha-lista" data-doc="${esc(d.id)}" data-caminho="${esc(d.caminho)}" style="cursor:pointer">
            <div style="font-size:22px;flex-shrink:0;margin-right:4px">${iconeArquivo(d.tipo, d.nome)}</div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:500;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(d.nome)}</div>
              <div style="font-size:12px;color:var(--texto-2)">
                ${d.categoria ? `<span class="etiqueta etiqueta-neutra" style="margin-right:6px">${esc(d.categoria)}</span>` : ''}
                ${esc(d.evento_nome || '')} · ${vinc}${d.tamanho ? ' · ' + tamanhoBonito(d.tamanho) : ''} · ${dataBR(d.criado_em)}
              </div>
            </div>
            <button class="botao d-abrir" data-caminho="${esc(d.caminho)}" style="flex-shrink:0;height:32px;font-size:13px">Abrir</button>
            ${podeApagar ? `<button class="botao-icone d-apagar" data-doc="${esc(d.id)}" data-caminho="${esc(d.caminho)}" title="Excluir" style="flex-shrink:0">×</button>` : ''}
          </div>`;
        }).join('')}
      </div>` : `
      <div class="vazio">
        <h3>Nenhum documento</h3>
        <p>${_docs.length ? 'Nada bate com o filtro.' : 'Anexe contratos, notas e recibos nos itens de produção e nas receitas — eles aparecem aqui.'}</p>
      </div>`}
  `;

  const q = s => alvo.querySelector(s);
  q('#d-busca')?.addEventListener('input', e => { _busca = e.target.value; repintarLista(); });
  q('#d-evento')?.addEventListener('change', e => { _fEvento = e.target.value; pintar(); });
  q('#d-categoria')?.addEventListener('change', e => { _fCategoria = e.target.value; pintar(); });

  alvo.querySelectorAll('.d-abrir').forEach(b =>
    b.addEventListener('click', e => { e.stopPropagation(); abrir(b.dataset.caminho); }));
  alvo.querySelectorAll('[data-doc].linha-lista').forEach(l =>
    l.addEventListener('click', () => abrir(l.dataset.caminho)));
  alvo.querySelectorAll('.d-apagar').forEach(b =>
    b.addEventListener('click', e => { e.stopPropagation(); remover(b.dataset.doc, b.dataset.caminho); }));
}

// Rebusca só reaplica filtro de texto sem recriar os selects (mantém foco no campo).
function repintarLista() {
  const foco = document.activeElement;
  const pos = foco && foco.id === 'd-busca' ? foco.selectionStart : null;
  pintar();
  if (pos != null) {
    const nb = document.querySelector('#d-busca');
    if (nb) { nb.focus(); try { nb.setSelectionRange(pos, pos); } catch (_) {} }
  }
}

async function abrir(caminho) {
  try {
    const url = await linkDocumento(caminho);
    window.open(url, '_blank', 'noopener');
  } catch (e) { aviso(e.message, 'erro'); }
}

async function remover(id, caminho) {
  if (!confirm('Excluir este documento? O arquivo será apagado do depósito.')) return;
  try {
    await apagarDocumento(id, caminho);
    _docs = _docs.filter(d => d.id !== id);
    aviso('Documento excluído.');
    pintar();
  } catch (e) { aviso(e.message, 'erro'); }
}
