'use strict';

/* =========================================================
   Nossos Gastos - controle de gastos para casais
   ========================================================= */

const CATEGORIAS_PADRAO = [
  'Mercado', 'Gasolina', 'Água', 'Luz', 'Internet', 'Aluguel', 'Boleto',
  'Parcela de loja', 'Cartão de crédito', 'Saúde', 'Escola', 'Lazer', 'Outros'
];
const CORES_CAT = {
  'Mercado': '#16a34a', 'Gasolina': '#ea580c', 'Água': '#0284c7', 'Luz': '#eab308',
  'Internet': '#7c3aed', 'Aluguel': '#9333ea', 'Boleto': '#64748b',
  'Parcela de loja': '#db2777', 'Cartão de crédito': '#dc2626', 'Saúde': '#0d9488',
  'Escola': '#2563eb', 'Lazer': '#f59e0b', 'Outros': '#475569'
};
const PALETA = ['#0ea5e9', '#8b5cf6', '#f43f5e', '#84cc16', '#14b8a6', '#f97316', '#6366f1', '#a855f7', '#22c55e'];
const DIAS_ALERTA = 5;

/* ---------- Utilidades ---------- */
const $ = s => document.querySelector(s);
const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtCurto = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact' });
const brl = v => fmtBRL.format(v || 0);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const soma = lista => lista.reduce((s, c) => s + (Number(c.valor) || 0), 0);
const arred = v => Math.round(v * 100) / 100;
let contadorId = 0;
const uid = () => Date.now().toString(36) + (contadorId++).toString(36) + Math.random().toString(36).slice(2, 7);

function corCategoria(nome) {
  if (CORES_CAT[nome]) return CORES_CAT[nome];
  let h = 0;
  for (const ch of String(nome)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETA[h % PALETA.length];
}

/* ---------- Datas (sempre no formato AAAA-MM-DD) ---------- */
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hojeISO = () => iso(new Date());
const mesDe = s => s.slice(0, 7);
function parseISO(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function addMeses(s, n) {
  const [y, m, d] = s.split('-').map(Number);
  const alvo = new Date(y, m - 1 + n, 1);
  const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  alvo.setDate(Math.min(d, ultimoDia));
  return iso(alvo);
}
const somaMes = (ym, n) => addMeses(ym + '-01', n).slice(0, 7);
const diasAte = s => Math.round((parseISO(s) - parseISO(hojeISO())) / 86400000);
const fmtData = s => parseISO(s).toLocaleDateString('pt-BR');
const nomeMes = ym => {
  const s = parseISO(ym + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const nomeMesCurto = ym => parseISO(ym + '-01').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('. de ', '/').replace(' de ', '/');
const porData = (a, b) => a.vencimento.localeCompare(b.vencimento) || a.descricao.localeCompare(b.descricao);

/* =========================================================
   Armazenamento: local (só no aparelho) ou nuvem (Firebase)
   ========================================================= */
const Store = {
  contas: [],
  reservas: [],
  ajustes: [],
  sonhos: [],
  modo: 'local',
  base: null,
  cacheFotos: {},

  configurado() {
    const cfg = window.FIREBASE_CONFIG;
    return !!(cfg && cfg.apiKey && cfg.apiKey !== 'COLE_AQUI' && cfg.projectId);
  },

  async iniciar() {
    if (!this.configurado()) {
      this.contas = lerLocal('cg_contas');
      this.reservas = lerLocal('cg_reservas');
      this.ajustes = lerLocal('cg_ajustes');
      this.sonhos = lerLocal('cg_sonhos');
      setSync('local');
      return;
    }
    this.modo = 'nuvem';
    setSync('conectando');
    try {
      await carregarScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
      await carregarScript('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js');
      firebase.initializeApp(window.FIREBASE_CONFIG);
      const db = firebase.firestore();
      try { await db.enablePersistence({ synchronizeTabs: true }); } catch (e) { /* navegador sem suporte offline */ }
      this.base = db.collection('familias').doc(window.CODIGO_FAMILIA);
      ['contas', 'reservas', 'ajustes', 'sonhos'].forEach(col => {
        this.base.collection(col).onSnapshot({ includeMetadataChanges: true }, snap => {
          this[col] = snap.docs.map(d => d.data());
          setSync(snap.metadata.fromCache ? 'offline' : 'ok');
          render();
        }, err => {
          console.error(err);
          setSync('erro');
          toast('Erro ao sincronizar: confira as regras do Firestore.');
        });
      });
    } catch (e) {
      console.error(e);
      setSync('erro');
      toast('Não foi possível conectar. Verifique a internet.');
    }
  },

  persistirLocal() {
    localStorage.setItem('cg_contas', JSON.stringify(this.contas));
    localStorage.setItem('cg_reservas', JSON.stringify(this.reservas));
    localStorage.setItem('cg_ajustes', JSON.stringify(this.ajustes));
    localStorage.setItem('cg_sonhos', JSON.stringify(this.sonhos));
  },

  // Fotos ficam em uma coleção separada e só são baixadas quando alguém abre a foto
  salvarFoto(id, dado) {
    this.cacheFotos[id] = dado;
    if (this.modo === 'nuvem') {
      if (!this.base) { toast('Sem conexão com a nuvem.'); return false; }
      this.base.collection('fotos').doc(id).set({ id, dado, criadoEm: Date.now(), por: usuario() })
        .catch(e => { console.error(e); toast('Erro ao enviar a foto.'); });
      return true;
    }
    try {
      localStorage.setItem('cg_foto_' + id, dado);
      return true;
    } catch {
      toast('Sem espaço para fotos neste aparelho. Ative a sincronização na nuvem.');
      return false;
    }
  },

  async lerFoto(id) {
    if (this.cacheFotos[id]) return this.cacheFotos[id];
    let dado = null;
    if (this.modo === 'nuvem') {
      if (!this.base) return null;
      const doc = await this.base.collection('fotos').doc(id).get();
      dado = doc.exists ? doc.data().dado : null;
    } else {
      dado = localStorage.getItem('cg_foto_' + id);
    }
    if (dado) this.cacheFotos[id] = dado;
    return dado;
  },

  removerFotos(ids) {
    if (!ids.length) return;
    ids.forEach(id => delete this.cacheFotos[id]);
    if (this.modo === 'nuvem') {
      if (!this.base) return;
      const lote = firebase.firestore().batch();
      ids.forEach(id => lote.delete(this.base.collection('fotos').doc(id)));
      lote.commit().catch(console.error);
      return;
    }
    ids.forEach(id => localStorage.removeItem('cg_foto_' + id));
  },

  salvarVarios(col, objs) {
    const agora = Date.now();
    objs.forEach(o => { o.atualizadoEm = agora; o.atualizadoPor = usuario(); });
    if (this.modo === 'nuvem') {
      if (!this.base) return toast('Sem conexão com a nuvem.');
      const lote = firebase.firestore().batch();
      objs.forEach(o => lote.set(this.base.collection(col).doc(o.id), limparUndefined(o)));
      lote.commit().catch(e => { console.error(e); toast('Erro ao salvar na nuvem.'); });
      return;
    }
    objs.forEach(o => {
      const i = this[col].findIndex(x => x.id === o.id);
      if (i >= 0) this[col][i] = o; else this[col].push(o);
    });
    this.persistirLocal();
    render();
  },

  salvar(col, obj) { this.salvarVarios(col, [obj]); },

  removerVarios(col, ids) {
    if (this.modo === 'nuvem') {
      if (!this.base) return toast('Sem conexão com a nuvem.');
      const lote = firebase.firestore().batch();
      ids.forEach(id => lote.delete(this.base.collection(col).doc(id)));
      lote.commit().catch(e => { console.error(e); toast('Erro ao excluir na nuvem.'); });
      return;
    }
    this[col] = this[col].filter(x => !ids.includes(x.id));
    this.persistirLocal();
    render();
  }
};

function lerLocal(chave) {
  try { return JSON.parse(localStorage.getItem(chave) || '[]'); } catch { return []; }
}
function limparUndefined(o) { return JSON.parse(JSON.stringify(o)); }
function carregarScript(src) {
  return new Promise((ok, erro) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = erro;
    document.head.appendChild(s);
  });
}

function setSync(st) {
  const txt = {
    local: '📱 Salvo só neste aparelho',
    conectando: '⏳ Conectando…',
    ok: '☁️ Sincronizado',
    offline: '📴 Offline – sincroniza depois',
    erro: '⚠️ Erro de sincronização'
  }[st];
  $('#syncStatus').textContent = txt;
}

const usuario = () => localStorage.getItem('cg_usuario') || '';
// Nome do casal fica nos ajustes compartilhados, para aparecer igual nos dois aparelhos
const nomeCasal = () => Store.ajustes.find(a => a.id === 'geral')?.nomeCasal || '';

/* =========================================================
   Estado da tela
   ========================================================= */
const estado = {
  aba: 'painel',
  mes: hojeISO().slice(0, 7),
  filtroCat: 'todas',
  filtroStatus: 'todas',
  categoria: null,
  filtroSonho: 'todos'
};
const graficos = {};

function render() {
  const titulo = nomeCasal() || 'Nossos Gastos';
  $('#nomeApp').textContent = titulo;
  document.title = titulo;
  ({ painel: renderPainel, contas: renderContas, categorias: renderCategorias, reservas: renderReservas, sonhos: renderSonhos })[estado.aba]();
}

function trocarAba(aba) {
  estado.aba = aba;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + aba));
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === aba));
  render();
  window.scrollTo(0, 0);
}

function navMes() {
  const atual = estado.mes === hojeISO().slice(0, 7);
  return `<div class="month-nav">
    <button class="icon-btn" data-mes="-1" aria-label="Mês anterior">‹</button>
    <h2>${nomeMes(estado.mes)}</h2>
    <button class="icon-btn" data-mes="1" aria-label="Próximo mês">›</button>
    ${atual ? '' : '<button class="btn-link" data-mes="0">Hoje</button>'}
  </div>`;
}

/* ---------- Status das contas (verde / vermelho) ---------- */
function infoStatus(c) {
  if (c.pago) return { cls: 'pago', txt: 'Paga' + (c.pagoEm ? ' em ' + fmtData(c.pagoEm) : '') };
  const d = diasAte(c.vencimento);
  if (d < 0) return { cls: 'vencida', txt: `Vencida há ${-d} dia${d < -1 ? 's' : ''}` };
  if (d === 0) return { cls: 'proxima', txt: 'Vence hoje' };
  if (d <= DIAS_ALERTA) return { cls: 'proxima', txt: `Vence em ${d} dia${d > 1 ? 's' : ''}` };
  return { cls: 'pendente', txt: `Vence em ${d} dias` };
}

function itemConta(c) {
  const s = infoStatus(c);
  let tags = '';
  if (c.grupoId && !c.fixa) {
    const faltam = Store.contas.filter(x => x.grupoId === c.grupoId && !x.pago).length;
    tags = `<span class="tag">Parcela ${c.parcela}/${c.totalParcelas}</span>` +
      (faltam ? `<span class="tag tag-suave">faltam ${faltam}</span>` : '<span class="tag tag-suave">quitado</span>');
  } else if (c.fixa) {
    tags = '<span class="tag tag-suave">fixa</span>';
  }
  return `<div class="item st-${s.cls}">
    <button class="check" data-pagar="${c.id}" aria-label="${c.pago ? 'Desmarcar pagamento' : 'Marcar como paga'}" title="${c.pago ? 'Desmarcar pagamento' : 'Marcar como paga'}">${c.pago ? '✓' : ''}</button>
    <div class="info" data-editar="${c.id}">
      <div class="titulo">${esc(c.descricao)} ${tags}</div>
      <div class="sub"><span class="dot" style="background:${corCategoria(c.categoria)}"></span>${esc(c.categoria)} · ${fmtData(c.vencimento)} · <b>${s.txt}</b></div>
    </div>
    <div class="valor">${brl(c.valor)}</div>
  </div>`;
}

function togglePago(id) {
  const c = Store.contas.find(x => x.id === id);
  if (!c) return;
  const pago = !c.pago;
  Store.salvar('contas', { ...c, pago, pagoEm: pago ? hojeISO() : null });
  toast(pago ? '✅ Conta marcada como paga' : 'Pagamento desmarcado');
}

/* =========================================================
   Aba: Painel
   ========================================================= */
function gruposParcelados() {
  const grupos = {};
  Store.contas.filter(c => c.grupoId && !c.fixa).forEach(c => (grupos[c.grupoId] ??= []).push(c));
  return Object.values(grupos).map(lista => {
    lista.sort(porData);
    const abertas = lista.filter(c => !c.pago);
    const total = lista[0].totalParcelas;
    return {
      descricao: lista[lista.length - 1].descricao,
      categoria: lista[0].categoria,
      total,
      pagas: total - abertas.length,
      abertas,
      restante: soma(abertas),
      proxima: abertas[0]
    };
  }).filter(g => g.abertas.length).sort((a, b) => porData(a.proxima, b.proxima));
}

function htmlParcelas() {
  const grupos = gruposParcelados();
  if (!grupos.length) return '<p class="vazio">Nenhuma compra parcelada em aberto.</p>';
  return grupos.map(g => {
    const pct = Math.round(g.pagas / g.total * 100);
    return `<div class="parcela">
      <div class="topo"><span><span class="dot" style="background:${corCategoria(g.categoria)}"></span>${esc(g.descricao)}</span><span>${brl(g.restante)}</span></div>
      <div class="barra"><div style="width:${pct}%"></div></div>
      <div class="sub">${g.pagas} de ${g.total} pagas · <b>faltam ${g.abertas.length}</b> · próxima ${fmtData(g.proxima.vencimento)} (${brl(g.proxima.valor)})</div>
    </div>`;
  }).join('');
}

function renderPainel() {
  const doMes = Store.contas.filter(c => mesDe(c.vencimento) === estado.mes);
  const total = soma(doMes);
  const pago = soma(doMes.filter(c => c.pago));
  const aberto = total - pago;
  const alertas = Store.contas.filter(c => !c.pago && diasAte(c.vencimento) <= DIAS_ALERTA).sort(porData);
  const totalReservas = Store.reservas.reduce((s, r) => s + saldo(r), 0);
  const inicioSeisMeses = somaMes(estado.mes, -5);
  const temSeisMeses = Store.contas.some(c => mesDe(c.vencimento) >= inicioSeisMeses && mesDe(c.vencimento) <= estado.mes);

  $('#tab-painel').innerHTML = `
    ${navMes()}
    <div class="cards">
      <div class="card kpi"><span>Total do mês</span><strong>${brl(total)}</strong><small>${doMes.length} conta${doMes.length === 1 ? '' : 's'}</small></div>
      <div class="card kpi verde"><span>Já pago</span><strong>${brl(pago)}</strong></div>
      <div class="card kpi ${aberto > 0 ? 'vermelho' : ''}"><span>Falta pagar</span><strong>${brl(aberto)}</strong></div>
      <div class="card kpi"><span>Reservas e investimentos</span><strong>${brl(totalReservas)}</strong></div>
    </div>
    <div class="grid2">
      <div class="card">
        <h3>⚠️ Vencidas ou vencendo em até ${DIAS_ALERTA} dias</h3>
        ${alertas.length ? `<div class="lista">${alertas.map(itemConta).join('')}</div>` : '<p class="vazio">Tudo em dia! 🎉</p>'}
      </div>
      <div class="card">
        <h3>Gastos por categoria no mês</h3>
        ${doMes.length ? '<div class="chart-box"><canvas id="grafPizza"></canvas></div>' : '<p class="vazio">Nenhuma conta neste mês.</p>'}
      </div>
      <div class="card">
        <h3>Últimos 6 meses</h3>
        ${temSeisMeses ? '<div class="chart-box"><canvas id="grafMeses"></canvas></div>' : '<p class="vazio">Nenhuma conta nos últimos 6 meses.</p>'}
      </div>
      <div class="card">
        <h3>Parcelas em andamento</h3>
        ${htmlParcelas()}
      </div>
    </div>`;

  if (doMes.length) graficoPizza(doMes);
  if (temSeisMeses) graficoMeses();
}

/* =========================================================
   Aba: Contas
   ========================================================= */
function renderContas() {
  const doMes = Store.contas.filter(c => mesDe(c.vencimento) === estado.mes);
  const cats = [...new Set(doMes.map(c => c.categoria))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  if (estado.filtroCat !== 'todas' && !cats.includes(estado.filtroCat)) cats.push(estado.filtroCat);

  const filtroStatus = { todas: () => true, abertas: c => !c.pago, pagas: c => c.pago }[estado.filtroStatus];
  const lista = doMes
    .filter(c => estado.filtroCat === 'todas' || c.categoria === estado.filtroCat)
    .filter(filtroStatus)
    .sort(porData);

  const chip = (valor, rotulo, campo, atual) =>
    `<button class="chip ${valor === atual ? 'ativo' : ''}" data-${campo}="${esc(valor)}">${rotulo}</button>`;

  $('#tab-contas').innerHTML = `
    ${navMes()}
    <div class="filtros">
      ${chip('todas', 'Todas', 'fstatus', estado.filtroStatus)}
      ${chip('abertas', 'A pagar', 'fstatus', estado.filtroStatus)}
      ${chip('pagas', 'Pagas', 'fstatus', estado.filtroStatus)}
    </div>
    <div class="filtros">
      ${chip('todas', 'Todas as categorias', 'fcat', estado.filtroCat)}
      ${cats.map(c => chip(c, `<span class="dot" style="background:${corCategoria(c)}"></span>${esc(c)}`, 'fcat', estado.filtroCat)).join('')}
    </div>
    <div class="resumo-linha"><span>${lista.length} conta${lista.length === 1 ? '' : 's'}</span><span>Total: <b>${brl(soma(lista))}</b></span></div>
    ${lista.length
      ? `<div class="lista">${lista.map(itemConta).join('')}</div>`
      : '<div class="card"><p class="vazio">Nenhuma conta aqui. Toque no <b>＋</b> para adicionar.</p></div>'}`;
}

/* =========================================================
   Aba: Categorias (histórico de cada tipo de gasto)
   ========================================================= */
function todasCategorias() {
  return [...new Set(Store.contas.map(c => c.categoria))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function renderCategorias() {
  const el = $('#tab-categorias');
  const cats = todasCategorias();
  if (!cats.length) {
    el.innerHTML = '<div class="card"><p class="vazio">Cadastre contas para ver o histórico por categoria.</p></div>';
    return;
  }
  if (!cats.includes(estado.categoria)) estado.categoria = cats.includes('Mercado') ? 'Mercado' : cats[0];

  const daCat = Store.contas.filter(c => c.categoria === estado.categoria);
  const porMes = {};
  daCat.forEach(c => {
    const m = (porMes[mesDe(c.vencimento)] ??= { total: 0, qtd: 0, pago: 0 });
    m.total += c.valor; m.qtd++;
    if (c.pago) m.pago += c.valor;
  });
  const meses = Object.keys(porMes).sort();
  const total = soma(daCat);
  const maior = meses.reduce((a, m) => (!a || porMes[m].total > porMes[a].total ? m : a), null);

  el.innerHTML = `
    <div class="seletor">
      <label for="selCat"><b>Categoria:</b></label>
      <select id="selCat">${cats.map(c => `<option ${c === estado.categoria ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    </div>
    <div class="cards">
      <div class="card kpi"><span>Total gasto</span><strong>${brl(total)}</strong><small>${daCat.length} lançamento${daCat.length === 1 ? '' : 's'}</small></div>
      <div class="card kpi"><span>Média por mês</span><strong>${brl(total / meses.length)}</strong><small>${meses.length} mês(es)</small></div>
      <div class="card kpi"><span>Mês mais caro</span><strong>${brl(porMes[maior].total)}</strong><small>${nomeMes(maior)}</small></div>
      <div class="card kpi"><span>Mês atual</span><strong>${brl(porMes[hojeISO().slice(0, 7)]?.total)}</strong></div>
    </div>
    <div class="grid2">
      <div class="card">
        <h3>${esc(estado.categoria)} mês a mês</h3>
        <div class="chart-box"><canvas id="grafCategoria"></canvas></div>
      </div>
      <div class="card">
        <h3>Detalhe por mês</h3>
        <table>
          <thead><tr><th>Mês</th><th class="num">Qtd.</th><th class="num">Total</th><th></th></tr></thead>
          <tbody>
            ${meses.slice().reverse().map(m => `<tr>
              <td>${nomeMes(m)}</td>
              <td class="num">${porMes[m].qtd}</td>
              <td class="num"><b>${brl(porMes[m].total)}</b></td>
              <td class="num"><button class="btn-link" data-ver-mes="${m}">ver</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  $('#selCat').addEventListener('change', e => { estado.categoria = e.target.value; render(); });
  graficoCategoria(meses.slice(-24), porMes);
}

/* =========================================================
   Aba: Reservas e investimentos
   ========================================================= */
const saldo = r => (r.movs || []).reduce((s, m) => s + m.valor, 0);

function renderReservas() {
  const emerg = Store.reservas.filter(r => r.tipo === 'emergencia');
  const invest = Store.reservas.filter(r => r.tipo !== 'emergencia');
  const somaSaldo = l => l.reduce((s, r) => s + saldo(r), 0);

  const cartao = r => {
    const s = saldo(r);
    const movs = (r.movs || []).slice().sort((a, b) => b.data.localeCompare(a.data));
    const pct = r.meta > 0 ? Math.min(100, Math.round(s / r.meta * 100)) : null;
    return `<div class="card">
      <div class="reserva-topo">
        <div>
          <h3>${esc(r.nome)}</h3>
          <span class="tag">${r.tipo === 'emergencia' ? '🛟 Reserva de emergência' : '📈 Investimento'}</span>
        </div>
        <button class="icon-btn" data-edit-reserva="${r.id}" aria-label="Editar">✏️</button>
      </div>
      <div class="saldo">${brl(s)}</div>
      ${pct !== null ? `<div class="barra"><div style="width:${pct}%"></div></div>
        <div class="meta-txt">${pct}% da meta de ${brl(r.meta)} · faltam ${brl(Math.max(0, r.meta - s))}</div>` : ''}
      <div class="botoes">
        <button class="btn verde" data-mov="${r.id}" data-sinal="1">＋ Guardar</button>
        <button class="btn" data-mov="${r.id}" data-sinal="-1">− Retirar</button>
      </div>
      ${movs.length ? `<details><summary>Histórico (${movs.length})</summary>
        ${movs.map(m => `<div class="mov">
          <div>${esc(m.obs || (m.valor >= 0 ? 'Depósito' : 'Retirada'))}<small>${fmtData(m.data)}${m.por ? ' · ' + esc(m.por) : ''}</small></div>
          <div class="${m.valor >= 0 ? 'pos' : 'neg'}">${m.valor >= 0 ? '+' : ''}${brl(m.valor)}</div>
        </div>`).join('')}
      </details>` : ''}
    </div>`;
  };

  $('#tab-reservas').innerHTML = `
    <div class="cards">
      <div class="card kpi"><span>Reserva de emergência</span><strong>${brl(somaSaldo(emerg))}</strong></div>
      <div class="card kpi"><span>Investimentos</span><strong>${brl(somaSaldo(invest))}</strong></div>
      <div class="card kpi verde"><span>Total guardado</span><strong>${brl(somaSaldo(Store.reservas))}</strong></div>
    </div>
    <div class="cabecalho-acao">
      <h2>Reservas e investimentos</h2>
      <button class="btn primario" data-acao="nova-reserva">＋ Nova</button>
    </div>
    ${Store.reservas.length
      ? `<div class="reservas">${Store.reservas.slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')).map(cartao).join('')}</div>`
      : '<div class="card"><p class="vazio">Crie sua reserva de emergência ou um investimento para acompanhar quanto vocês já guardaram.</p></div>'}`;
}

/* =========================================================
   Aba: Sonhos e metas (com fotos das conquistas)
   ========================================================= */
const TIPOS_SONHO = {
  casal: { nome: 'Do casal', icone: '💑' },
  casa: { nome: 'Da casa', icone: '🏡' },
  individual: { nome: 'Individual', icone: '🙋' }
};
const MAX_FOTOS = 10;

function renderSonhos() {
  const f = estado.filtroSonho;
  const lista = Store.sonhos.filter(s => f === 'todos' || s.tipo === f);
  const emBusca = lista.filter(s => !s.conquistado)
    .sort((a, b) => (a.ano || 9999) - (b.ano || 9999) || a.titulo.localeCompare(b.titulo, 'pt-BR'));
  const conquistas = lista.filter(s => s.conquistado)
    .sort((a, b) => (b.conquistadoEm || '').localeCompare(a.conquistadoEm || ''));
  const chip = (valor, rotulo) => `<button class="chip ${valor === f ? 'ativo' : ''}" data-fsonho="${valor}">${rotulo}</button>`;

  $('#tab-sonhos').innerHTML = `
    <div class="cards">
      <div class="card kpi"><span>Sonhos</span><strong>${Store.sonhos.length}</strong></div>
      <div class="card kpi"><span>Em busca</span><strong>${Store.sonhos.filter(s => !s.conquistado).length}</strong></div>
      <div class="card kpi verde"><span>Conquistados</span><strong>${Store.sonhos.filter(s => s.conquistado).length}</strong></div>
      <div class="card kpi"><span>Metas para ${new Date().getFullYear() + 1}</span><strong>${Store.sonhos.filter(s => s.ano === new Date().getFullYear() + 1).length}</strong></div>
    </div>
    <div class="cabecalho-acao">
      <h2>Nossos sonhos</h2>
      <button class="btn primario" data-acao="novo-sonho">＋ Novo sonho</button>
    </div>
    <div class="filtros">
      ${chip('todos', 'Todos')}
      ${Object.entries(TIPOS_SONHO).map(([k, t]) => chip(k, `${t.icone} ${t.nome}`)).join('')}
    </div>
    ${!lista.length ? '<div class="card"><p class="vazio">Cadastre metas do casal, da casa ou individuais. Quando conquistarem, marquem e guardem a foto do momento. 📸</p></div>' : ''}
    ${emBusca.length ? `<h2 class="secao-titulo">✨ Em busca</h2><div class="sonhos">${emBusca.map(cartaoSonho).join('')}</div>` : ''}
    ${conquistas.length ? `<h2 class="secao-titulo">🏆 Conquistas</h2><div class="sonhos">${conquistas.map(cartaoSonho).join('')}</div>` : ''}`;
}

function cartaoSonho(s) {
  const t = TIPOS_SONHO[s.tipo] || TIPOS_SONHO.casal;
  const fotos = s.fotos || [];
  const pct = s.valorMeta > 0 ? Math.min(100, Math.round((s.valorGuardado || 0) / s.valorMeta * 100)) : null;
  return `<div class="card sonho ${s.conquistado ? 'conquistado' : ''}">
    ${fotos.length ? `<button class="capa" data-foto="${s.id}" data-idx="0" aria-label="Ver fotos">
      <img src="${fotos[0].thumb}" alt="Foto de ${esc(s.titulo)}">
      ${fotos.length > 1 ? `<span class="qtd">📷 ${fotos.length}</span>` : ''}
    </button>` : ''}
    <div class="sonho-corpo">
      <div class="reserva-topo">
        <div>
          <h3>${t.icone} ${esc(s.titulo)}</h3>
          <span class="tag">${t.nome}${s.tipo === 'individual' && s.pessoa ? ' · ' + esc(s.pessoa) : ''}</span>
          ${s.ano ? `<span class="tag tag-suave">Meta ${s.ano}</span>` : ''}
        </div>
        <button class="icon-btn" data-edit-sonho="${s.id}" aria-label="Editar">✏️</button>
      </div>
      ${s.descricao ? `<p class="ajuda sonho-desc">${esc(s.descricao)}</p>` : ''}
      ${pct !== null ? `<div class="barra"><div style="width:${pct}%"></div></div>
        <div class="meta-txt">${brl(s.valorGuardado)} de ${brl(s.valorMeta)} (${pct}%)</div>` : ''}
      ${s.conquistado
        ? `<div class="conquista-txt">🏆 Conquistado em ${fmtData(s.conquistadoEm)}</div>
           ${fotos.length ? '' : `<div class="botoes"><button class="btn" data-edit-sonho="${s.id}">📷 Adicionar foto</button></div>`}`
        : `<div class="botoes"><button class="btn verde" data-conquistar="${s.id}">🏆 Conquistamos!</button></div>`}
    </div>
  </div>`;
}

function lerImagem(arquivo) {
  return new Promise((ok, erro) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(url); erro(new Error('imagem')); };
    img.src = url;
  });
}

// Reduz a foto para caber no banco de dados (cada documento tem limite de 1 MB)
function redimensionar(img, max, qualidade) {
  const escala = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * escala);
  c.height = Math.round(img.naturalHeight * escala);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', qualidade);
}

function formSonho(s = null, conquistar = false) {
  const novo = !s;
  const anoQueVem = new Date().getFullYear() + 1;
  const v = s ? { ...s } : { titulo: '', tipo: 'casal', pessoa: '', ano: anoQueVem, valorMeta: 0, valorGuardado: 0, descricao: '', conquistado: false, conquistadoEm: null };
  if (conquistar) { v.conquistado = true; v.conquistadoEm = v.conquistadoEm || hojeISO(); }
  const fotos = [...(v.fotos || [])];
  const removidas = [];

  const corpo = abrirModal(conquistar ? '🏆 Registrar conquista' : novo ? 'Novo sonho' : 'Editar sonho', `
    <form id="fSonho" class="form" autocomplete="off">
      ${conquistar ? `<p class="ajuda">Parabéns! 🎉 Guardem uma foto desse momento para lembrar sempre.</p>` : ''}
      <label>Sonho / meta<input name="titulo" required maxlength="80" value="${esc(v.titulo)}" placeholder="Ex.: Viagem para Gramado, Comprar o sofá novo"></label>
      <div class="row">
        <label>De quem
          <select name="tipo">
            ${Object.entries(TIPOS_SONHO).map(([k, t]) => `<option value="${k}" ${v.tipo === k ? 'selected' : ''}>${t.icone} ${t.nome}</option>`).join('')}
          </select>
        </label>
        <label>Ano da meta<input name="ano" type="number" min="2000" max="2100" value="${v.ano || ''}" placeholder="${anoQueVem}"></label>
      </div>
      <label class="so-individual" ${v.tipo === 'individual' ? '' : 'hidden'}>Nome da pessoa<input name="pessoa" maxlength="30" value="${esc(v.pessoa || '')}" placeholder="${esc(usuario())}"></label>
      <div class="row">
        <label>Valor necessário (opcional)<input name="valorMeta" type="number" step="0.01" min="0" inputmode="decimal" value="${v.valorMeta || ''}"></label>
        <label>Já guardado<input name="valorGuardado" type="number" step="0.01" min="0" inputmode="decimal" value="${v.valorGuardado || ''}"></label>
      </div>
      <label>Descrição (opcional)<textarea name="descricao" rows="2" maxlength="300">${esc(v.descricao || '')}</textarea></label>
      <label class="check-line"><input type="checkbox" name="conquistado" ${v.conquistado ? 'checked' : ''}> 🏆 Já conquistamos</label>
      <label class="so-conquista" ${v.conquistado ? '' : 'hidden'}>Data da conquista<input name="conquistadoEm" type="date" value="${v.conquistadoEm || hojeISO()}"></label>
      <div>
        <div class="fotos-edit" id="fotosEdit"></div>
        <label class="btn btn-arquivo">📷 Adicionar fotos
          <input type="file" id="fotoArquivo" accept="image/*" multiple hidden>
        </label>
      </div>
      <div class="acoes">
        ${!novo ? '<button type="button" class="btn perigo" id="excluirSonho">Excluir</button>' : ''}
        <button type="submit" class="btn primario" id="salvarSonho">Salvar</button>
      </div>
    </form>`);

  const form = corpo.querySelector('#fSonho');
  const areaFotos = corpo.querySelector('#fotosEdit');
  const desenharFotos = () => {
    areaFotos.innerHTML = fotos.map((f, i) =>
      `<div class="mini"><img src="${f.thumb}" alt=""><button type="button" data-rm="${i}" aria-label="Remover foto">✕</button></div>`).join('');
  };
  desenharFotos();

  form.tipo.addEventListener('change', () => { form.querySelector('.so-individual').hidden = form.tipo.value !== 'individual'; });
  form.conquistado.addEventListener('change', () => { form.querySelector('.so-conquista').hidden = !form.conquistado.checked; });

  areaFotos.addEventListener('click', e => {
    const b = e.target.closest('[data-rm]');
    if (!b) return;
    const [f] = fotos.splice(Number(b.dataset.rm), 1);
    if (!f.nova) removidas.push(f.id);
    desenharFotos();
  });

  corpo.querySelector('#fotoArquivo').addEventListener('change', async e => {
    const arquivos = [...e.target.files].slice(0, MAX_FOTOS - fotos.length);
    if (!arquivos.length) return toast(`Limite de ${MAX_FOTOS} fotos por sonho.`);
    toast('Preparando fotos…');
    for (const arq of arquivos) {
      try {
        const img = await lerImagem(arq);
        let dado = redimensionar(img, 1280, 0.75);
        if (dado.length > 900000) dado = redimensionar(img, 960, 0.6);
        fotos.push({ id: uid(), thumb: redimensionar(img, 400, 0.7), dado, nova: true });
      } catch {
        toast('Não foi possível ler uma das imagens.');
      }
    }
    e.target.value = '';
    desenharFotos();
  });

  corpo.querySelector('#excluirSonho')?.addEventListener('click', () => {
    if (!confirm(`Excluir "${v.titulo}" e todas as fotos?`)) return;
    Store.removerFotos((v.fotos || []).map(f => f.id));
    Store.removerVarios('sonhos', [v.id]);
    fecharModal();
    toast('Sonho excluído');
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(form);
    const titulo = f.get('titulo').trim();
    if (!titulo) return;
    const conquistado = f.get('conquistado') === 'on';

    const novasOk = fotos.filter(x => x.nova).every(x => Store.salvarFoto(x.id, x.dado));
    if (!novasOk) return;
    Store.removerFotos(removidas);

    const tipo = f.get('tipo');
    Store.salvar('sonhos', {
      ...(s || { id: uid(), criadoPor: usuario(), criadoEm: Date.now() }),
      titulo,
      tipo,
      pessoa: tipo === 'individual' ? f.get('pessoa').trim() : '',
      ano: parseInt(f.get('ano'), 10) || null,
      valorMeta: arred(parseFloat(f.get('valorMeta')) || 0),
      valorGuardado: arred(parseFloat(f.get('valorGuardado')) || 0),
      descricao: f.get('descricao').trim(),
      conquistado,
      conquistadoEm: conquistado ? (f.get('conquistadoEm') || hojeISO()) : null,
      fotos: fotos.map(({ id, thumb }) => ({ id, thumb }))
    });
    fecharModal();
    toast(conquistado && !s?.conquistado ? '🎉 Parabéns pela conquista!' : 'Sonho salvo');
  });
}

async function verFoto(sonhoId, idx) {
  const s = Store.sonhos.find(x => x.id === sonhoId);
  const fotos = s?.fotos || [];
  if (!fotos.length) return;
  idx = (idx + fotos.length) % fotos.length;
  const foto = fotos[idx];

  const corpo = abrirModal(s.titulo, `
    <div class="visor">
      <img id="visorImg" src="${foto.thumb}" alt="Foto de ${esc(s.titulo)}">
      <div class="visor-nav">
        ${fotos.length > 1 ? `<button class="icon-btn" data-foto="${s.id}" data-idx="${idx - 1}" aria-label="Foto anterior">‹</button>` : '<span></span>'}
        <span>${fotos.length > 1 ? `${idx + 1} de ${fotos.length}` : ''}</span>
        ${fotos.length > 1 ? `<button class="icon-btn" data-foto="${s.id}" data-idx="${idx + 1}" aria-label="Próxima foto">›</button>` : '<span></span>'}
      </div>
      ${s.conquistado ? `<p class="ajuda">🏆 Conquistado em ${fmtData(s.conquistadoEm)}</p>` : ''}
      <p class="ajuda" id="visorStatus">Carregando foto em alta qualidade…</p>
      <div class="acoes"><a class="btn" id="visorBaixar" hidden>⬇️ Baixar foto</a></div>
    </div>`);

  const img = corpo.querySelector('#visorImg');
  try {
    const dado = await Store.lerFoto(foto.id);
    if (!img.isConnected) return; // usuário já trocou de foto ou fechou
    if (dado) {
      img.src = dado;
      const baixar = corpo.querySelector('#visorBaixar');
      baixar.href = dado;
      baixar.download = `${s.titulo.replace(/[^\w\- ]+/g, '').trim() || 'conquista'}-${idx + 1}.jpg`;
      baixar.hidden = false;
      corpo.querySelector('#visorStatus').remove();
    } else {
      corpo.querySelector('#visorStatus').textContent = 'Foto em alta qualidade indisponível (mostrando a miniatura).';
    }
  } catch (e) {
    console.error(e);
    corpo.querySelector('#visorStatus').textContent = 'Sem conexão: mostrando a miniatura.';
  }
}

/* =========================================================
   Gráficos
   ========================================================= */
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

function novoGrafico(id, config) {
  graficos[id]?.destroy();
  delete graficos[id];
  const canvas = document.getElementById(id);
  if (!window.Chart || !canvas) return;
  Chart.defaults.color = cssVar('--muted');
  Chart.defaults.borderColor = cssVar('--border');
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  graficos[id] = new Chart(canvas, config);
}

const tooltipBRL = {
  callbacks: { label: ctx => `${ctx.dataset.label ? ctx.dataset.label + ': ' : ctx.label + ': '}${brl(ctx.parsed.y ?? ctx.parsed)}` }
};

function graficoPizza(doMes) {
  const porCat = {};
  doMes.forEach(c => { porCat[c.categoria] = (porCat[c.categoria] || 0) + c.valor; });
  const cats = Object.keys(porCat).sort((a, b) => porCat[b] - porCat[a]);
  novoGrafico('grafPizza', {
    type: 'doughnut',
    data: {
      labels: cats,
      datasets: [{ data: cats.map(c => arred(porCat[c])), backgroundColor: cats.map(corCategoria), borderColor: cssVar('--card'), borderWidth: 2 }]
    },
    options: {
      maintainAspectRatio: false,
      cutout: '58%',
      plugins: {
        legend: { position: 'right', labels: { boxWidth: 12, padding: 10 } },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${brl(ctx.parsed)}` } }
      }
    }
  });
}

function graficoMeses() {
  const meses = Array.from({ length: 6 }, (_, i) => somaMes(estado.mes, i - 5));
  const dados = meses.map(m => {
    const l = Store.contas.filter(c => mesDe(c.vencimento) === m);
    return { pago: arred(soma(l.filter(c => c.pago))), aberto: arred(soma(l.filter(c => !c.pago))) };
  });
  novoGrafico('grafMeses', {
    type: 'bar',
    data: {
      labels: meses.map(nomeMesCurto),
      datasets: [
        { label: 'Pago', data: dados.map(d => d.pago), backgroundColor: cssVar('--green'), borderRadius: 4 },
        { label: 'A pagar', data: dados.map(d => d.aberto), backgroundColor: cssVar('--red'), borderRadius: 4 }
      ]
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, ticks: { callback: v => fmtCurto.format(v) } }
      },
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 12 } }, tooltip: tooltipBRL }
    }
  });
}

function graficoCategoria(meses, porMes) {
  const cor = corCategoria(estado.categoria);
  novoGrafico('grafCategoria', {
    type: 'bar',
    data: {
      labels: meses.map(nomeMesCurto),
      datasets: [{ label: estado.categoria, data: meses.map(m => arred(porMes[m].total)), backgroundColor: cor, borderRadius: 4 }]
    },
    options: {
      maintainAspectRatio: false,
      scales: { x: { grid: { display: false } }, y: { ticks: { callback: v => fmtCurto.format(v) } } },
      plugins: { legend: { display: false }, tooltip: tooltipBRL }
    }
  });
}

/* =========================================================
   Janelas (modais) e formulários
   ========================================================= */
function abrirModal(titulo, html) {
  $('#modalTitulo').textContent = titulo;
  $('#modalCorpo').innerHTML = html;
  const dlg = $('#modal');
  if (!dlg.open) dlg.showModal();
  return $('#modalCorpo');
}
const fecharModal = () => $('#modal').close();

function normalizarCategoria(txt) {
  const t = txt.trim().replace(/\s+/g, ' ');
  const existente = [...CATEGORIAS_PADRAO, ...todasCategorias()].find(c => c.toLowerCase() === t.toLowerCase());
  return existente || t.charAt(0).toUpperCase() + t.slice(1);
}

function formConta(c = null) {
  const novo = !c;
  const v = c || { descricao: '', categoria: '', valor: '', vencimento: hojeISO(), pago: false, obs: '' };
  const opcoes = [...new Set([...CATEGORIAS_PADRAO, ...todasCategorias()])].map(x => `<option value="${esc(x)}">`).join('');

  const corpo = abrirModal(novo ? 'Nova conta' : 'Editar conta', `
    <form id="fConta" class="form" autocomplete="off">
      <label>Descrição
        <input name="descricao" required maxlength="80" value="${esc(v.descricao)}" placeholder="Ex.: Compra do mês, Conta de luz">
      </label>
      <label>Categoria (tipo de gasto)
        <input name="categoria" list="listaCats" required maxlength="40" value="${esc(v.categoria)}" placeholder="Ex.: Mercado">
        <datalist id="listaCats">${opcoes}</datalist>
      </label>
      <div class="row">
        <label>Valor (R$)
          <input name="valor" type="number" step="0.01" min="0.01" inputmode="decimal" required value="${v.valor}">
        </label>
        <label>${novo ? 'Vencimento' : 'Vencimento'}
          <input name="vencimento" type="date" required value="${v.vencimento}">
        </label>
      </div>
      ${novo ? `
      <fieldset>
        <legend>Tipo</legend>
        <label class="radio"><input type="radio" name="tipo" value="unica" checked> Única</label>
        <label class="radio"><input type="radio" name="tipo" value="parcelada"> Parcelada</label>
        <label class="radio"><input type="radio" name="tipo" value="fixa"> Fixa (todo mês)</label>
      </fieldset>
      <div class="row so-parcelada" hidden>
        <label>Total de parcelas<input name="totalParcelas" type="number" min="2" max="120" value="10"></label>
        <label>Está na parcela nº<input name="parcelaAtual" type="number" min="1" max="120" value="1"></label>
      </div>
      <fieldset class="so-parcelada" hidden>
        <legend>O valor informado é</legend>
        <label class="radio"><input type="radio" name="valorModo" value="parcela" checked> De cada parcela</label>
        <label class="radio"><input type="radio" name="valorModo" value="total"> Total da compra</label>
      </fieldset>
      <div class="so-fixa" hidden>
        <label>Repetir por quantos meses<input name="meses" type="number" min="2" max="60" value="12"></label>
        <p class="ajuda">Ideal para água, luz, internet, aluguel. Depois você ajusta o valor de cada mês.</p>
      </div>` : ''}
      ${!novo && v.grupoId ? `<label class="check-line"><input type="checkbox" name="aplicarGrupo"> Aplicar descrição, categoria e valor às próximas ${v.fixa ? 'contas fixas' : 'parcelas'} não pagas</label>` : ''}
      <label class="check-line"><input type="checkbox" name="pago" ${v.pago ? 'checked' : ''}> ${novo ? 'Já está paga (a primeira, se for parcelada/fixa)' : 'Paga'}</label>
      <label>Observação (opcional)<input name="obs" maxlength="120" value="${esc(v.obs || '')}"></label>
      ${!novo ? `<p class="ajuda">Lançada por ${esc(v.criadoPor || '—')}${v.atualizadoPor ? ` · última alteração por ${esc(v.atualizadoPor)}` : ''}</p>` : ''}
      <div class="acoes">
        ${!novo ? '<button type="button" class="btn perigo" data-excluir="um">Excluir</button>' : ''}
        ${!novo && v.grupoId ? `<button type="button" class="btn perigo" data-excluir="grupo">Excluir ${v.fixa ? 'todas as fixas' : 'todas as parcelas'}</button>` : ''}
        <button type="submit" class="btn primario">Salvar</button>
      </div>
    </form>`);

  const form = corpo.querySelector('#fConta');

  if (novo) {
    const atualizarTipo = () => {
      const tipo = form.tipo.value;
      form.querySelectorAll('.so-parcelada').forEach(e => { e.hidden = tipo !== 'parcelada'; });
      form.querySelectorAll('.so-fixa').forEach(e => { e.hidden = tipo !== 'fixa'; });
    };
    form.querySelectorAll('input[name=tipo]').forEach(r => r.addEventListener('change', atualizarTipo));
    form.descricao.focus();
  }

  form.querySelectorAll('[data-excluir]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.excluir === 'grupo') {
      const ids = Store.contas.filter(x => x.grupoId === v.grupoId).map(x => x.id);
      if (!confirm(`Excluir todas as ${ids.length} contas deste grupo (pagas e não pagas)?`)) return;
      Store.removerVarios('contas', ids);
    } else {
      if (!confirm('Excluir esta conta?')) return;
      Store.removerVarios('contas', [v.id]);
    }
    fecharModal();
    toast('Conta excluída');
  }));

  form.addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(form);
    const descricao = f.get('descricao').trim();
    const categoria = normalizarCategoria(f.get('categoria'));
    const valor = arred(parseFloat(f.get('valor')));
    const vencimento = f.get('vencimento');
    const pago = f.get('pago') === 'on';
    const obs = f.get('obs').trim();
    if (!descricao || !categoria || !(valor > 0) || !vencimento) return toast('Preencha descrição, categoria, valor e vencimento.');

    if (!novo) {
      const lote = [{ ...v, descricao, categoria, valor, vencimento, obs, pago, pagoEm: pago ? (v.pagoEm || hojeISO()) : null }];
      if (f.get('aplicarGrupo') === 'on') {
        Store.contas
          .filter(x => x.grupoId === v.grupoId && x.id !== v.id && !x.pago && x.vencimento > v.vencimento)
          .forEach(x => lote.push({ ...x, descricao, categoria, valor }));
      }
      Store.salvarVarios('contas', lote);
      fecharModal();
      toast('Conta atualizada');
      return;
    }

    const base = { descricao, categoria, obs, criadoPor: usuario(), criadoEm: Date.now(), fixa: false, grupoId: null, parcela: null, totalParcelas: null };
    const itens = [];
    const tipo = f.get('tipo');

    if (tipo === 'parcelada') {
      const total = Math.max(2, parseInt(f.get('totalParcelas'), 10) || 2);
      const atual = Math.min(total, Math.max(1, parseInt(f.get('parcelaAtual'), 10) || 1));
      const valorParcela = f.get('valorModo') === 'total' ? arred(valor / total) : valor;
      const grupoId = uid();
      for (let n = atual; n <= total; n++) {
        const primeira = n === atual;
        itens.push({ ...base, id: uid(), valor: valorParcela, vencimento: addMeses(vencimento, n - atual),
          grupoId, parcela: n, totalParcelas: total, pago: primeira && pago, pagoEm: primeira && pago ? hojeISO() : null });
      }
    } else if (tipo === 'fixa') {
      const meses = Math.min(60, Math.max(2, parseInt(f.get('meses'), 10) || 12));
      const grupoId = uid();
      for (let i = 0; i < meses; i++) {
        itens.push({ ...base, id: uid(), valor, vencimento: addMeses(vencimento, i), grupoId, fixa: true,
          pago: i === 0 && pago, pagoEm: i === 0 && pago ? hojeISO() : null });
      }
    } else {
      itens.push({ ...base, id: uid(), valor, vencimento, pago, pagoEm: pago ? hojeISO() : null });
    }

    Store.salvarVarios('contas', itens);
    estado.mes = mesDe(vencimento);
    fecharModal();
    render();
    toast(itens.length > 1 ? `${itens.length} contas criadas` : 'Conta adicionada');
  });
}

function formReserva(r = null) {
  const novo = !r;
  const v = r || { nome: '', tipo: 'emergencia', meta: '' };
  const corpo = abrirModal(novo ? 'Nova reserva / investimento' : 'Editar', `
    <form id="fReserva" class="form" autocomplete="off">
      <label>Nome<input name="nome" required maxlength="60" value="${esc(v.nome)}" placeholder="Ex.: Reserva de emergência, Tesouro Selic, Viagem"></label>
      <label>Tipo
        <select name="tipo">
          <option value="emergencia" ${v.tipo === 'emergencia' ? 'selected' : ''}>🛟 Reserva de emergência</option>
          <option value="investimento" ${v.tipo !== 'emergencia' ? 'selected' : ''}>📈 Investimento / objetivo</option>
        </select>
      </label>
      <div class="row">
        <label>Meta (R$, opcional)<input name="meta" type="number" step="0.01" min="0" inputmode="decimal" value="${v.meta || ''}"></label>
        ${novo ? '<label>Valor que já tem (R$)<input name="inicial" type="number" step="0.01" min="0" inputmode="decimal" placeholder="0,00"></label>' : ''}
      </div>
      <p class="ajuda">Dica: a reserva de emergência ideal costuma ser de 6 meses dos gastos fixos da casa.</p>
      <div class="acoes">
        ${!novo ? '<button type="button" class="btn perigo" id="excluirReserva">Excluir</button>' : ''}
        <button type="submit" class="btn primario">Salvar</button>
      </div>
    </form>`);
  const form = corpo.querySelector('#fReserva');
  form.nome.focus();

  corpo.querySelector('#excluirReserva')?.addEventListener('click', () => {
    if (!confirm(`Excluir "${v.nome}" e todo o histórico?`)) return;
    Store.removerVarios('reservas', [v.id]);
    fecharModal();
    toast('Excluído');
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(form);
    const dados = { nome: f.get('nome').trim(), tipo: f.get('tipo'), meta: arred(parseFloat(f.get('meta')) || 0) };
    if (!dados.nome) return;
    if (novo) {
      const inicial = arred(parseFloat(f.get('inicial')) || 0);
      const movs = inicial > 0 ? [{ id: uid(), data: hojeISO(), valor: inicial, obs: 'Saldo inicial', por: usuario() }] : [];
      Store.salvar('reservas', { id: uid(), ...dados, movs, criadoPor: usuario(), criadoEm: Date.now() });
    } else {
      Store.salvar('reservas', { ...v, ...dados });
    }
    fecharModal();
    toast('Salvo');
  });
}

function formMov(id, sinal) {
  const r = Store.reservas.find(x => x.id === id);
  if (!r) return;
  const corpo = abrirModal(`${sinal > 0 ? 'Guardar em' : 'Retirar de'} ${r.nome}`, `
    <form id="fMov" class="form" autocomplete="off">
      <p class="ajuda">Saldo atual: <b>${brl(saldo(r))}</b></p>
      <div class="row">
        <label>Valor (R$)<input name="valor" type="number" step="0.01" min="0.01" inputmode="decimal" required></label>
        <label>Data<input name="data" type="date" required value="${hojeISO()}"></label>
      </div>
      <label>Observação (opcional)<input name="obs" maxlength="80" placeholder="${sinal > 0 ? 'Ex.: Sobra do salário, rendimento' : 'Ex.: Conserto do carro'}"></label>
      <div class="acoes"><button type="submit" class="btn primario">${sinal > 0 ? 'Guardar' : 'Retirar'}</button></div>
    </form>`);
  const form = corpo.querySelector('#fMov');
  form.valor.focus();
  form.addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(form);
    const valor = arred(parseFloat(f.get('valor')));
    if (!(valor > 0)) return;
    const mov = { id: uid(), data: f.get('data'), valor: sinal * valor, obs: f.get('obs').trim(), por: usuario() };
    Store.salvar('reservas', { ...r, movs: [...(r.movs || []), mov] });
    fecharModal();
    toast(sinal > 0 ? `💰 ${brl(valor)} guardado` : `${brl(valor)} retirado`);
  });
}

function pedirNome() {
  const corpo = abrirModal('Quem está usando?', `
    <form id="fNome" class="form" autocomplete="off">
      <p class="ajuda">Não precisa de senha. O nome só serve para mostrar quem lançou ou pagou cada conta.</p>
      <label>Seu nome<input name="nome" required maxlength="30" value="${esc(usuario())}" placeholder="Ex.: Maiara"></label>
      <div class="acoes"><button type="submit" class="btn primario">Entrar</button></div>
    </form>`);
  const form = corpo.querySelector('#fNome');
  form.nome.focus();
  form.addEventListener('submit', e => {
    e.preventDefault();
    const nome = form.nome.value.trim();
    if (!nome) return;
    localStorage.setItem('cg_usuario', nome);
    fecharModal();
    toast(`Olá, ${nome}! 👋`);
  });
}

function formConfig() {
  const nuvem = Store.modo === 'nuvem';
  const corpo = abrirModal('Configurações', `
    <div class="form">
      <label>Nome do casal (aparece no topo)
        <div style="display:flex;gap:8px">
          <input id="cfgCasal" maxlength="40" value="${esc(nomeCasal())}" placeholder="Ex.: Maiara & Ana">
          <button type="button" class="btn primario" id="cfgSalvarCasal">Salvar</button>
        </div>
      </label>
      <label>Usuário neste aparelho
        <div style="display:flex;gap:8px;align-items:center"><b style="color:var(--text);font-size:1rem">${esc(usuario() || '—')}</b>
        <button type="button" class="btn-link" id="cfgNome">trocar</button></div>
      </label>
      <div>
        <h3>Compartilhamento</h3>
        <p class="ajuda">${nuvem
          ? `☁️ Os dados estão sendo sincronizados na nuvem (código da família: <b>${esc(window.CODIGO_FAMILIA)}</b>). Todos os aparelhos com este app veem as mesmas contas.`
          : '📱 Os dados estão salvos <b>só neste aparelho</b>. Para compartilhar com seu par, configure o Firebase seguindo o arquivo <b>COMO-PUBLICAR.md</b>.'}</p>
      </div>
      <div>
        <h3>Cópia de segurança</h3>
        <p class="ajuda">Baixe um arquivo com todos os dados ou importe um backup (também serve para levar os dados de um aparelho para outro).</p>
        <div class="acoes" style="justify-content:flex-start">
          <button type="button" class="btn" id="cfgExportar">⬇️ Exportar backup</button>
          <button type="button" class="btn" id="cfgImportar">⬆️ Importar backup</button>
          <input type="file" id="cfgArquivo" accept="application/json,.json" hidden>
        </div>
      </div>
    </div>`);

  corpo.querySelector('#cfgSalvarCasal').addEventListener('click', () => {
    Store.salvar('ajustes', { id: 'geral', nomeCasal: corpo.querySelector('#cfgCasal').value.trim() });
    render();
    toast('Nome salvo');
  });
  corpo.querySelector('#cfgNome').addEventListener('click', pedirNome);
  corpo.querySelector('#cfgExportar').addEventListener('click', exportarBackup);
  corpo.querySelector('#cfgImportar').addEventListener('click', () => corpo.querySelector('#cfgArquivo').click());
  corpo.querySelector('#cfgArquivo').addEventListener('change', e => importarBackup(e.target.files[0]));
}

async function exportarBackup() {
  toast('Preparando backup…');
  const fotos = {};
  for (const s of Store.sonhos) {
    for (const f of s.fotos || []) {
      try { const d = await Store.lerFoto(f.id); if (d) fotos[f.id] = d; } catch { /* segue sem esta foto */ }
    }
  }
  const dados = {
    app: 'nossos-gastos', versao: 1, exportadoEm: new Date().toISOString(),
    contas: Store.contas, reservas: Store.reservas, ajustes: Store.ajustes, sonhos: Store.sonhos, fotos
  };
  const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `backup-gastos-${hojeISO()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importarBackup(arquivo) {
  if (!arquivo) return;
  try {
    const dados = JSON.parse(await arquivo.text());
    if (dados.app !== 'nossos-gastos' || !Array.isArray(dados.contas)) throw new Error('formato');
    if (!confirm(`Importar ${dados.contas.length} contas, ${(dados.reservas || []).length} reservas e ${(dados.sonhos || []).length} sonhos? Itens iguais serão substituídos.`)) return;
    if (dados.contas.length) Store.salvarVarios('contas', dados.contas);
    if (dados.reservas?.length) Store.salvarVarios('reservas', dados.reservas);
    if (dados.ajustes?.length) Store.salvarVarios('ajustes', dados.ajustes);
    Object.entries(dados.fotos || {}).forEach(([id, dado]) => Store.salvarFoto(id, dado));
    if (dados.sonhos?.length) Store.salvarVarios('sonhos', dados.sonhos);
    fecharModal();
    toast('Backup importado');
  } catch {
    toast('Arquivo de backup inválido.');
  }
}

/* ---------- Aviso rápido ---------- */
let timerToast;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(timerToast);
  timerToast = setTimeout(() => t.classList.remove('show'), 2600);
}

/* =========================================================
   Eventos
   ========================================================= */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-tab],[data-mes],[data-pagar],[data-editar],[data-fcat],[data-fstatus],[data-ver-mes],[data-mov],[data-edit-reserva],[data-fsonho],[data-edit-sonho],[data-conquistar],[data-foto],[data-acao]');
  if (!t) return;
  const d = t.dataset;
  if (d.tab) return trocarAba(d.tab);
  if (d.mes !== undefined) {
    estado.mes = d.mes === '0' ? hojeISO().slice(0, 7) : somaMes(estado.mes, Number(d.mes));
    return render();
  }
  if (d.pagar) return togglePago(d.pagar);
  if (d.editar) return formConta(Store.contas.find(c => c.id === d.editar));
  if (d.fcat) { estado.filtroCat = d.fcat; return render(); }
  if (d.fstatus) { estado.filtroStatus = d.fstatus; return render(); }
  if (d.verMes) {
    estado.mes = d.verMes;
    estado.filtroCat = estado.categoria;
    estado.filtroStatus = 'todas';
    return trocarAba('contas');
  }
  if (d.mov) return formMov(d.mov, Number(d.sinal));
  if (d.editReserva) return formReserva(Store.reservas.find(r => r.id === d.editReserva));
  if (d.acao === 'nova-conta') return formConta();
  if (d.fsonho) { estado.filtroSonho = d.fsonho; return render(); }
  if (d.editSonho) return formSonho(Store.sonhos.find(s => s.id === d.editSonho));
  if (d.conquistar) return formSonho(Store.sonhos.find(s => s.id === d.conquistar), true);
  if (d.foto) return verFoto(d.foto, Number(d.idx));
  if (d.acao === 'nova-reserva') return formReserva();
  if (d.acao === 'novo-sonho') return formSonho();
  if (d.acao === 'config') return formConfig();
});

// Sem nome cadastrado, a janela "Quem está usando?" não pode ser fechada
$('#modalFechar').addEventListener('click', () => { if (usuario()) fecharModal(); });
$('#modal').addEventListener('cancel', e => { if (!usuario()) e.preventDefault(); });

// Atualiza os "vence em X dias" quando o app volta a ser aberto em outro dia
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

/* =========================================================
   Início
   ========================================================= */
(async function iniciar() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(console.error);
  }
  render();
  await Store.iniciar();
  render();
  if (!usuario()) pedirNome();
})();
