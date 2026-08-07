// ═══════════════════════════════════════════════════════
// Eventos — lista por produtora e cadastro
// ═══════════════════════════════════════════════════════

import {
  sessao, listarEventos, criarEvento, atualizarEvento, buscarEvento,
  empresasOndeCrio, souAdmin, enviarLogo, comprimirImagem,
  listarFontes, criarFontes,
} from '../nucleo.js';
import {
  esc, aviso, abrirModal, fecharModal, comBotao,
  periodo, numero, iniciais, SITUACAO_EVENTO,
} from '../ui.js';

const FONTES_SUGERIDAS = ['Conta própria', 'Bilheteria', 'Patrocinador'];

export async function telaEventos() {
  const app = document.getElementById('app');
  const alvo = app.querySelector('#conteudo');
  alvo.innerHTML = `<div style="padding:40px;text-align:center;color:var(--texto-2)">Carregando eventos...</div>`;

  let eventos;
  try {
    eventos = await listarEventos();
  } catch (e) {
    alvo.innerHTML = `<div class="vazio"><h3>Não consegui carregar</h3><p>${esc(e.message)}</p></div>`;
    return;
  }

  const podeCriar = empresasOndeCrio().length > 0;

  if (!eventos.length) {
    alvo.innerHTML = `
      <div class="pagina-topo"><h1>Eventos</h1></div>
      <div class="vazio">
        <h3>Nenhum evento ainda</h3>
        <p>${podeCriar
            ? 'Comece cadastrando o primeiro evento da produtora.'
            : 'Você ainda não recebeu acesso a nenhum evento.'}</p>
        ${podeCriar ? `<button class="botao botao-primario" id="novo">Cadastrar evento</button>` : ''}
      </div>`;
    alvo.querySelector('#novo')?.addEventListener('click', () => modalEvento(null, telaEventos));
    return;
  }

  // Agrupa por produtora — uma pessoa pode atender mais de uma
  const grupos = new Map();
  for (const ev of eventos) {
    const chave = ev.empresa?.id || 'sem';
    if (!grupos.has(chave)) grupos.set(chave, { empresa: ev.empresa, eventos: [] });
    grupos.get(chave).eventos.push(ev);
  }

  alvo.innerHTML = `
    <div class="pagina-topo">
      <h1>Eventos</h1>
      <div class="espaco"></div>
      ${podeCriar ? `<button class="botao botao-primario" id="novo">Novo evento</button>` : ''}
    </div>
    ${[...grupos.values()].map(g => grupoHTML(g, grupos.size > 1)).join('')}
  `;

  alvo.querySelector('#novo')?.addEventListener('click', () => modalEvento(null, telaEventos));
  alvo.querySelectorAll('[data-evento]').forEach(el => {
    el.addEventListener('click', () => modalEvento(el.dataset.evento, telaEventos));
  });
}

function grupoHTML(g, mostrarCabeca) {
  const emp = g.empresa || { nome: 'Sem produtora' };
  return `
    <div class="grupo-empresa">
      ${mostrarCabeca ? `
        <div class="cabeca">
          ${emp.logo_url
            ? `<img class="logo" src="${esc(emp.logo_url)}" alt="">`
            : `<div class="logo"></div>`}
          <h2>${esc(emp.nome)}</h2>
        </div>` : ''}
      <div class="eventos-grade">
        ${g.eventos.map(cartaoHTML).join('')}
      </div>
    </div>`;
}

function cartaoHTML(ev) {
  const sit = SITUACAO_EVENTO[ev.situacao] || SITUACAO_EVENTO.planejamento;
  return `
    <button class="evento-cartao" data-evento="${esc(ev.id)}">
      ${ev.logo_url
        ? `<img class="evento-logo" src="${esc(ev.logo_url)}" alt="">`
        : `<div class="evento-logo-vazio">${esc(iniciais(ev.nome))}</div>`}
      <div class="evento-corpo">
        <div class="nome">${esc(ev.nome)}</div>
        <div class="meta">${esc(periodo(ev.data_inicio, ev.data_fim))}</div>
        ${ev.cidade ? `<div class="meta">${esc(ev.cidade)}</div>` : ''}
        <div class="rodape">
          <span class="etiqueta ${sit.classe}">${sit.rotulo}</span>
          ${ev.publico_estimado
            ? `<span style="font-size:12px;color:var(--texto-3)">${numero(ev.publico_estimado)} pessoas</span>`
            : ''}
        </div>
      </div>
    </button>`;
}

/* ── cadastro e edição ─────────────────────────────── */

async function modalEvento(id, aoSalvar) {
  const edicao = !!id;
  let ev = {};
  let fontes = [];

  if (edicao) {
    try {
      ev = await buscarEvento(id);
      fontes = await listarFontes(id);
    } catch (e) { return aviso(e.message, 'erro'); }
  }

  const empresas = edicao ? [] : empresasOndeCrio();
  if (!edicao && !empresas.length) return aviso('Você não pode criar eventos.', 'erro');

  const podeEditar = edicao ? souAdmin(ev.empresa?.id) : true;

  abrirModal(edicao ? ev.nome : 'Novo evento', `
    <form id="fev">
      ${!edicao && empresas.length > 1 ? `
        <div class="campo">
          <label for="ev-empresa">Produtora</label>
          <select class="controle" id="ev-empresa">
            ${empresas.map(e => `<option value="${esc(e.id)}">${esc(e.nome)}</option>`).join('')}
          </select>
        </div>` : ''}

      <div class="campo">
        <label for="ev-nome">Nome do evento</label>
        <input class="controle" id="ev-nome" value="${esc(ev.nome || '')}"
               placeholder="São João Irecê 2027" ${podeEditar ? '' : 'disabled'} required>
      </div>

      <div class="campo">
        <label>Logo do evento</label>
        <div class="envio-logo">
          <img class="previa" id="ev-previa" alt=""
               src="${esc(ev.logo_url || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E')}">
          <div>
            <button type="button" class="botao" id="ev-escolher" ${podeEditar ? '' : 'disabled'}>Escolher imagem</button>
            <input type="file" id="ev-arquivo" accept="image/*">
            <div class="dica">Aparece na lista e no cabeçalho dos relatórios</div>
          </div>
        </div>
      </div>

      <div class="linha linha-2">
        <div class="campo">
          <label for="ev-inicio">Início</label>
          <input class="controle" type="date" id="ev-inicio"
                 value="${esc((ev.data_inicio || '').slice(0,10))}" ${podeEditar ? '' : 'disabled'}>
        </div>
        <div class="campo">
          <label for="ev-fim">Término</label>
          <input class="controle" type="date" id="ev-fim"
                 value="${esc((ev.data_fim || '').slice(0,10))}" ${podeEditar ? '' : 'disabled'}>
        </div>
      </div>

      <div class="linha linha-2">
        <div class="campo">
          <label for="ev-cidade">Cidade</label>
          <input class="controle" id="ev-cidade" value="${esc(ev.cidade || '')}"
                 placeholder="Irecê" ${podeEditar ? '' : 'disabled'}>
        </div>
        <div class="campo">
          <label for="ev-publico">Público estimado</label>
          <input class="controle" type="number" min="0" id="ev-publico"
                 value="${esc(ev.publico_estimado ?? '')}" placeholder="12000" ${podeEditar ? '' : 'disabled'}>
        </div>
      </div>

      <div class="campo">
        <label for="ev-local">Local</label>
        <input class="controle" id="ev-local" value="${esc(ev.local || '')}"
               placeholder="Parque de Exposições" ${podeEditar ? '' : 'disabled'}>
      </div>

      ${edicao ? `
        <div class="campo">
          <label for="ev-situacao">Situação</label>
          <select class="controle" id="ev-situacao" ${podeEditar ? '' : 'disabled'}>
            ${Object.entries(SITUACAO_EVENTO).map(([v, s]) =>
              `<option value="${v}" ${ev.situacao === v ? 'selected' : ''}>${s.rotulo}</option>`).join('')}
          </select>
        </div>` : `
        <div class="campo">
          <label>Fontes de pagamento</label>
          <div id="ev-fontes" style="display:flex;flex-direction:column;gap:7px">
            ${FONTES_SUGERIDAS.map(f => `
              <label style="display:flex;align-items:center;gap:8px;font-size:14px;cursor:pointer">
                <input type="checkbox" class="ev-fonte" value="${esc(f)}" checked> ${esc(f)}
              </label>`).join('')}
          </div>
          <div class="dica">De onde o dinheiro sai. Você escolhe a fonte na hora de pagar, não agora — e pode editar essa lista depois.</div>
        </div>`}

      <div class="campo">
        <label for="ev-obs">Observações</label>
        <textarea class="controle" id="ev-obs" ${podeEditar ? '' : 'disabled'}>${esc(ev.observacoes || '')}</textarea>
      </div>

      ${edicao && fontes.length ? `
        <div class="campo">
          <label>Fontes cadastradas</label>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            ${fontes.map(f => `<span class="etiqueta ${f.ativa ? 'etiqueta-neutra' : 'etiqueta-vermelha'}">${esc(f.nome)}</span>`).join('')}
          </div>
        </div>` : ''}

      ${podeEditar ? `
        <div class="modal-acoes">
          <button type="button" class="botao" id="ev-cancelar">Cancelar</button>
          <button type="submit" class="botao botao-primario" id="ev-salvar">
            ${edicao ? 'Salvar' : 'Criar evento'}
          </button>
        </div>` : `
        <div class="modal-acoes">
          <button type="button" class="botao" id="ev-cancelar">Fechar</button>
        </div>`}
    </form>
  `);

  const q = s => document.querySelector(s);
  let arquivoLogo = null;

  q('#ev-cancelar').addEventListener('click', fecharModal);

  q('#ev-escolher')?.addEventListener('click', () => q('#ev-arquivo').click());
  q('#ev-arquivo')?.addEventListener('change', async e => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) return aviso('Escolha um arquivo de imagem.', 'erro');
    try {
      arquivoLogo = await comprimirImagem(f, 512);
      q('#ev-previa').src = URL.createObjectURL(arquivoLogo);
    } catch (err) { aviso(err.message, 'erro'); }
  });

  q('#fev').addEventListener('submit', async e => {
    e.preventDefault();
    if (!podeEditar) return;

    const nome = q('#ev-nome').value.trim();
    if (!nome) return aviso('Informe o nome do evento.', 'aviso');

    const inicio = q('#ev-inicio').value || null;
    const fim = q('#ev-fim').value || null;
    if (inicio && fim && fim < inicio) return aviso('O término não pode ser antes do início.', 'aviso');

    await comBotao(q('#ev-salvar'), async () => {
      try {
        let logo_url = ev.logo_url;
        if (arquivoLogo) logo_url = await enviarLogo(arquivoLogo, 'evento');

        const dados = {
          nome,
          cidade: q('#ev-cidade').value,
          local: q('#ev-local').value,
          data_inicio: inicio,
          data_fim: fim,
          publico_estimado: q('#ev-publico').value,
          observacoes: q('#ev-obs').value,
          logo_url,
        };

        if (edicao) {
          dados.situacao = q('#ev-situacao').value;
          await atualizarEvento(id, dados);
          aviso('Evento atualizado.');
        } else {
          dados.empresa_id = q('#ev-empresa')?.value || empresas[0].id;
          dados.dono_id = sessao.usuario.id;
          const novo = await criarEvento(dados);

          const marcadas = [...document.querySelectorAll('.ev-fonte:checked')].map(c => c.value);
          if (marcadas.length) {
            try { await criarFontes(novo.id, marcadas); }
            catch (err) { aviso('Evento criado, mas as fontes falharam: ' + err.message, 'aviso'); }
          }
          aviso('Evento criado.');
        }

        fecharModal();
        await aoSalvar();
      } catch (err) {
        aviso(err.message, 'erro');
      }
    });
  });
}
