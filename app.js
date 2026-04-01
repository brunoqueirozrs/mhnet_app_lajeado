/**
 * ============================================================================
 * MHNET VENDAS — APP.JS V220
 * ADIÇÕES:
 *  #1 LEADS: exibe dataCadastro, ultimaAtualizacao, vendedor, observações
 *     + animação/destaque para leads sem atualização há 10+ dias (exceto perdas)
 *  #2 CONCORRENTES: sincroniza com aba "Concorrentes" da planilha
 *  #3 INDICADORES: dashboard admin (por vendedor/dia) + vendedor (histórico + comparativo)
 *     + mini-gráfico de barras inline
 *  #4 FTTA PROSPECÇÃO: colunas corretas + lembrete automático 2 meses
 *     + formulário para adicionar/editar prospecto + badge de alerta visual
 * ============================================================================
 */

// ============================================================
// CONFIG
// ============================================================
const DEPLOY_ID  = 'AKfycbzNNkCf08grP8ceWC1eYATGVzEUO0JgX8ITChWoS1oml9gN1boWnz-B_BRs3DNn1Ug';
const API_URL    = `https://script.google.com/macros/s/${DEPLOY_ID}/exec`;
const GEMINI_KEY = 'AIzaSyC854djGrgcGEPbhTYm46Q2ayyJBp-tNv4';
const CALENDAR_URL = 'https://calendar.google.com/calendar/u/0?cid=ZTZlNjQ2OWVkNzQ1YzMzYmIwMjg2YmFmYmM4NzA2ZmU4YzM3MWVhMDU1MWRiNDY2NDJkNTc2NTI5MmFhMDZmN0Bncm91cC5jYWxlbmRhci5nb29nbGUuY29t';
const ADMIN_NAME_CHECK = 'BRUNO GARCIA QUEIROZ';
const EMAIL_ADMIN = 'bruno.queiroz@mhnet.com.br';

let AI_DISPONIVEL = null;

const MHNET_CONTEXT = `
Você é o assistente de vendas da MHNET, empresa de internet fibra óptica (FTTA) em Lajeado e Estrela/RS, Vale do Taquari.
Planos: 100Mbps a 1Gbps. Diferenciais: atendimento local humanizado, técnico no mesmo dia, sem fidelidade longa.
Serviços: MHPlay (streaming), câmeras de segurança, telefone fixo, IP fixo.
Responda de forma direta, objetiva e útil para vendedores de campo. Máximo 5 linhas.`;

const VENDEDORES_OFFLINE = [
  'Bruno Garcia Queiroz','Ana Paula Rodrigues','Vitoria Caroline Baldez Rosales',
  'João Vithor Sader','João Paulo da Silva Santos','Claudia Maria Semmler',
  'Diulia Vitoria Machado Borges','Elton da Silva Rodrigo Gonçalves','Vendedor Teste'
];

// ============================================================
// ESTADO GLOBAL
// ============================================================
let loggedUser          = localStorage.getItem('loggedUser') || null;
let leadsCache          = [];
let vendorsCache        = [];
let tasksCache          = [];
let materialsCache      = [];
let concorrentesCache   = [];
let fttaCache           = { lajeado: [], estrela: [], prospeccao: [] };
let fttaTabAtual        = 'lajeado';
let leadAtualParaAgendar = null;
let currentFolderId     = null;
let editingLeadIndex    = null;
let compSelecionado     = null;
let editingCompId       = null;
let editingFttaItem     = null;
let editingProspeccaoItem = null;
let syncQueue = JSON.parse(localStorage.getItem('mhnet_sync_queue') || '[]');

function isAdminUser() {
  if (!loggedUser) return false;
  return loggedUser.trim().toUpperCase().includes('BRUNO GARCIA');
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  carregarVendedores();
  const saved = localStorage.getItem('mhnet_leads_cache');
  if (saved) { try { leadsCache = JSON.parse(saved); } catch(e) {} }

  if (loggedUser) {
    initApp();
    if (navigator.onLine) {
      processarFilaSincronizacao();
      validarIA();
    }
  }

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    window._pwaPrompt = e;
    document.getElementById('btnInstalarPWA')?.classList.remove('hidden');
  });
});

window.addEventListener('online', () => {
  processarFilaSincronizacao();
  if (AI_DISPONIVEL === null) validarIA();
});

function instalarPWA() {
  if (window._pwaPrompt) {
    window._pwaPrompt.prompt();
    window._pwaPrompt.userChoice.then(() => {
      window._pwaPrompt = null;
      document.getElementById('btnInstalarPWA')?.classList.add('hidden');
    });
  }
}

async function validarIA() {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'Responda somente: IA OK' }] }], generationConfig: { maxOutputTokens: 10, temperature: 0 } })
    });
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    AI_DISPONIVEL = text.length > 0;
  } catch(e) { AI_DISPONIVEL = false; }
}

function initApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('header').classList.remove('hidden');
  document.getElementById('mainScroll').classList.remove('hidden');
  document.getElementById('bottomNav').classList.remove('hidden');

  const nameEl = document.getElementById('userInfo');
  if (nameEl) nameEl.innerText = loggedUser;
  const dsbName = document.getElementById('dsb-username');
  if (dsbName) dsbName.innerText = loggedUser;

  atualizarDataCabecalho();

  if (isAdminUser()) {
    document.getElementById('btnAdminSettings')?.classList.remove('hidden');
    document.getElementById('adminPanel')?.classList.remove('hidden');
    const divEnc = document.getElementById('divEncaminhar');
    if (divEnc) divEnc.style.display = 'block';
    document.getElementById('btnAdminConcorrente')?.classList.remove('hidden');
  }

  carregarLeads(false);
  carregarTarefas(false);
  carregarConcorrentes();
  navegarPara('dashboard');
}

// ============================================================
// AUTH
// ============================================================
function setLoggedUser() {
  const v = document.getElementById('userSelect').value;
  if (!v) { alert('⚠️ Selecione um vendedor!'); return; }
  loggedUser = v;
  localStorage.setItem('loggedUser', v);
  initApp();
  validarIA();
}

function logout() {
  if (confirm('Sair do sistema?')) {
    localStorage.removeItem('loggedUser');
    location.reload();
  }
}

async function carregarVendedores() {
  const sel = document.getElementById('userSelect');
  if (!sel) return;
  const offOpts = VENDEDORES_OFFLINE.map(v => `<option value="${v}">${v}</option>`).join('');
  sel.innerHTML = `<option value="">Selecione...</option>${offOpts}`;
  try {
    const res = await apiCall('getVendors', {}, false);
    if (res?.status === 'success' && res.data?.length > 0) {
      vendorsCache = res.data;
      const opts = res.data.map(v => `<option value="${v.nome}">${v.nome}</option>`).join('');
      sel.innerHTML = `<option value="">Selecione...</option>${opts}`;
      atualizarSelectsVendedores(opts);
    }
  } catch(e) {}
}

function atualizarSelectsVendedores(opts) {
  ['modalLeadDestino','leadVendedorDestino','transfOrigem','transfDestino'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<option value="">Selecione...</option>${opts}`;
  });
}

// ============================================================
// NAVEGAÇÃO
// ============================================================
function navegarPara(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const t = document.getElementById(pageId);
  if (t) t.classList.add('active');
  document.getElementById('mainScroll')?.scrollTo(0, 0);

  const navMap = { dashboard:'navDash', gestaoLeads:'navLeads', tarefas:'navTasks', ftta:'navFtta' };
  document.querySelectorAll('.nav-i').forEach(n => n.classList.remove('on'));
  if (navMap[pageId]) document.getElementById(navMap[pageId])?.classList.add('on');
  document.querySelectorAll('.dsb-item').forEach(i => i.classList.remove('on'));

  if (pageId === 'dashboard')    { atualizarDashboard(); verificarAgendamentosHoje(); }
  if (pageId === 'tarefas')      renderTarefas();
  if (pageId === 'indicadores')  carregarIndicadores();
  if (pageId === 'materiais' && !currentFolderId) carregarMateriais(null);
  if (pageId === 'ftta')         carregarFtta();
  if (pageId === 'cadastroLead' && editingLeadIndex === null) limparFormLead();
  if (pageId === 'faltas')       carregarHistoricoFaltas();
}

function verTodosLeads() {
  navegarPara('gestaoLeads');
  const inp = document.getElementById('searchLead');
  if (inp) inp.value = '';
  document.querySelectorAll('.filter-scroll .ftag').forEach(b => b.classList.remove('on'));
  document.getElementById('ftTodos')?.classList.add('on');
  renderLeads();
}

function cancelarCadastro() {
  editingLeadIndex = null;
  document.getElementById('cadastroTitle').innerText = 'Novo Lead';
  navegarPara('gestaoLeads');
}

// ============================================================
// HEADER UTILS
// ============================================================
function atualizarDataCabecalho() {
  const el = document.getElementById('headerDate');
  if (el) el.innerText = new Date().toLocaleDateString('pt-BR');
}

function atualizarDashboard() {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const count = leadsCache.filter(l => l.timestamp && l.timestamp.includes(hoje)).length;
  ['statLeads','statLeadsBody'].forEach(id => {
    const el = document.getElementById(id); if (el) el.innerText = count;
  });
}

function verificarAgendamentosHoje() {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const r = leadsCache.filter(l => l.agendamento && l.agendamento.includes(hoje));
  const t = tasksCache.filter(k => k.dataLimite && k.dataLimite.includes(hoje) && k.status !== 'CONCLUIDA');
  const banner = document.getElementById('lembreteBanner');
  if (banner) {
    banner.classList.toggle('show', r.length > 0 || t.length > 0);
    const total = r.length + t.length;
    const txtEl = banner.querySelector('.lb-sub');
    if (txtEl) txtEl.textContent = `${total} retorno${total !== 1 ? 's' : ''} e/ou tarefa${total !== 1 ? 's' : ''} hoje.`;
  }
}

// ============================================================
// LEADS
// ============================================================
async function carregarLeads(showLoader = true) {
  if (!navigator.onLine) { renderLeads(); return; }
  const user = isAdminUser() ? ADMIN_NAME_CHECK : loggedUser;
  const res = await apiCall('getLeads', { vendedor: user }, showLoader);
  if (res?.status === 'success') {
    leadsCache = res.data || [];
    leadsCache.sort((a, b) => b._linha - a._linha);
    localStorage.setItem('mhnet_leads_cache', JSON.stringify(leadsCache));
    if (document.getElementById('gestaoLeads').classList.contains('active')) renderLeads();
    atualizarDashboard();
    verificarAgendamentosHoje();
  }
}

function renderLeads(lista = null) {
  const term = (document.getElementById('searchLead')?.value || '').toLowerCase();
  const final = lista || leadsCache.filter(l =>
    String(l.nomeLead || '').toLowerCase().includes(term) ||
    String(l.bairro   || '').toLowerCase().includes(term) ||
    String(l.telefone || '').toLowerCase().includes(term)
  );
  renderListaLeadsHTML(final, 'listaLeadsGestao');
}

/**
 * Calcula quantos dias se passaram desde a última atualização do lead
 * Retorna null se não houver data; retorna -1 se status for perda/sem interesse
 */
function diasSemAtualizacao(lead) {
  const statusPerda = ['Sem Interesse', 'Perda', 'Desistiu', 'Não tem interesse'];
  if (statusPerda.some(s => String(lead.status || '').toLowerCase().includes(s.toLowerCase()))) {
    return -1; // Não sinaliza perdas
  }
  const ref = lead.ultimaAtualizacao || lead.dataCadastro || lead.timestamp;
  if (!ref) return null;
  // Tenta parsear dd/MM/yyyy ou dd/MM/yyyy HH:mm
  let dt = null;
  const str = String(ref).split(' ')[0]; // pega só a data
  if (str.includes('/')) {
    const p = str.split('/');
    if (p.length === 3) dt = new Date(parseInt(p[2]), parseInt(p[1])-1, parseInt(p[0]));
  } else if (str.includes('-')) {
    dt = new Date(str);
  }
  if (!dt || isNaN(dt)) return null;
  const hoje = new Date(); hoje.setHours(0,0,0,0);
  dt.setHours(0,0,0,0);
  return Math.floor((hoje - dt) / (1000 * 60 * 60 * 24));
}

function renderListaLeadsHTML(lista, containerId = 'listaLeadsGestao') {
  const div = document.getElementById(containerId);
  if (!div) return;
  if (!lista.length) {
    div.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i><p>Nenhum lead encontrado.</p></div>';
    return;
  }
  const badgeClass = s => {
    if (s === 'Venda Fechada') return 'fechado';
    if (s === 'Agendado')      return 'agendado';
    if (s === 'Negociação')    return 'negociacao';
    if (s === 'Novo')          return 'novo';
    return 'default';
  };

  div.innerHTML = lista.map(l => {
    const idx = leadsCache.indexOf(l);
    const fone = String(l.telefone || '').replace(/\D/g, '');
    const endCompleto = encodeURIComponent([l.endereco, l.bairro, l.cidade].filter(Boolean).join(', '));
    const dias = diasSemAtualizacao(l);
    const semAtualizar = dias !== null && dias !== -1 && dias >= 10;

    // Estilo do card: destaque laranja/vermelho se sem atualização há 10+ dias
    let cardStyle = '';
    let alertaBadge = '';
    if (semAtualizar) {
      cardStyle = 'border-left: 3px solid #f59e0b; animation: pulseAlert 2.5s ease-in-out infinite;';
      alertaBadge = `<div style="display:flex;align-items:center;gap:4px;font-size:.62rem;font-weight:800;color:#92400e;background:#fff7ed;border:1px solid #fde68a;border-radius:5px;padding:2px 7px;margin-bottom:6px;">
        <i class="fas fa-clock"></i> Sem atualização há ${dias} dias
      </div>`;
    }

    // Data de cadastro e última atualização
    const metaInfo = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:5px;">
      ${l.dataCadastro ? `<span style="font-size:.62rem;color:var(--text-3);"><i class="fas fa-calendar-plus" style="margin-right:2px;opacity:.6;"></i>${l.dataCadastro}</span>` : ''}
      ${l.ultimaAtualizacao ? `<span style="font-size:.62rem;color:var(--text-3);"><i class="fas fa-pen" style="margin-right:2px;opacity:.6;"></i>${l.ultimaAtualizacao}</span>` : ''}
      ${isAdminUser() && l.vendedor ? `<span style="font-size:.62rem;color:var(--navy);font-weight:700;"><i class="fas fa-user" style="margin-right:2px;"></i>${l.vendedor}</span>` : ''}
    </div>`;

    // Trecho de observação (máx 60 chars)
    const obsPreview = l.observacao && l.observacao.length > 0
      ? `<div style="font-size:.72rem;color:var(--text-2);background:var(--surface);border-radius:6px;padding:5px 8px;margin-bottom:6px;line-height:1.4;border-left:2px solid var(--border);">${String(l.observacao).slice(0,80)}${l.observacao.length > 80 ? '...' : ''}</div>`
      : '';

    return `
    <div class="lead-card" style="${cardStyle}">
      ${alertaBadge}
      <div class="lc-top">
        <div class="lc-name" onclick="abrirLeadDetalhes(${idx})">${l.nomeLead || '-'}</div>
        <span class="badge ${badgeClass(l.status)}">${l.status || 'Novo'}</span>
      </div>
      ${metaInfo}
      <div class="lc-city"><i class="fas fa-map-marker-alt" style="margin-right:4px;"></i>${l.bairro || '-'} · ${l.cidade || '-'}</div>
      ${l.telefone ? `<div class="lc-phone"><i class="fas fa-phone" style="font-size:.7rem;opacity:.6;"></i> ${l.telefone}</div>` : ''}
      ${l.provedor ? `<div class="lc-provedor"><i class="fas fa-wifi"></i> ${l.provedor}</div>` : ''}
      ${obsPreview}
      ${l.agendamento ? `<div class="lc-sched"><i class="fas fa-clock"></i> ${l.agendamento.split(' ')[0]}</div>` : ''}
      <div class="lc-btns">
        ${fone ? `<button class="lc-btn call" onclick="ligarPara('${fone}')"><i class="fas fa-phone"></i> Ligar</button>` : ''}
        ${fone ? `<button class="lc-btn whats" onclick="abrirWhatsAppDireto('${fone}')"><i class="fab fa-whatsapp"></i></button>` : ''}
        ${endCompleto ? `<button class="lc-btn map" onclick="abrirMaps('${endCompleto}')"><i class="fas fa-map-marker-alt"></i></button>` : ''}
        <button class="lc-btn detail" onclick="abrirLeadDetalhes(${idx})"><i class="fas fa-expand-alt"></i> Ver</button>
      </div>
    </div>`;
  }).join('');
}

function filtrarPorStatus(status, btn) {
  document.querySelectorAll('#gestaoLeads .ftag').forEach(b => b.classList.remove('on'));
  if (btn) btn.classList.add('on');
  const lista = status === 'Todos' ? leadsCache : leadsCache.filter(l => l.status === status);
  renderListaLeadsHTML(lista, 'listaLeadsGestao');
}

function filtrarLeadsHoje() {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const lista = leadsCache.filter(l => l.timestamp && l.timestamp.includes(hoje));
  if (!lista.length) { alert('📅 Nenhum lead cadastrado hoje!'); return; }
  navegarPara('gestaoLeads');
  renderListaLeadsHTML(lista, 'listaLeadsGestao');
}

function filtrarRetornos() {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const leadsHoje = leadsCache.filter(l => l.agendamento && l.agendamento.includes(hoje));
  if (!leadsHoje.length) {
    const tarefasHoje = tasksCache.filter(t => t.dataLimite && t.dataLimite.includes(hoje) && t.status !== 'CONCLUIDA');
    if (tarefasHoje.length) { navegarPara('tarefas'); return; }
    alert('Nenhum retorno agendado para hoje.');
    return;
  }
  const idx = leadsCache.indexOf(leadsHoje[0]);
  navegarPara('gestaoLeads');
  renderListaLeadsHTML(leadsHoje, 'listaLeadsGestao');
  if (idx >= 0) setTimeout(() => abrirLeadDetalhes(idx), 300);
}

// ============================================================
// AÇÕES DIRETAS
// ============================================================
function ligarPara(fone) { window.location.href = `tel:+55${fone}`; }
function abrirWhatsAppDireto(fone) { window.open(`https://wa.me/55${fone}`, '_blank'); }
function abrirMaps(endCompleto) { window.open(`https://maps.google.com/?q=${endCompleto}`, '_blank'); }

// ============================================================
// LEAD MODAL
// ============================================================
function abrirLeadDetalhes(index) {
  const l = leadsCache[index];
  if (!l) return;
  leadAtualParaAgendar = l;

  const setText = (id, v) => { const el = document.getElementById(id); if(el) el.innerText = v || '-'; };
  const setVal  = (id, v) => { const el = document.getElementById(id); if(el) el.value  = v || ''; };

  setText('modalLeadNome',     l.nomeLead);
  setText('modalLeadBairro',   l.bairro);
  setText('modalLeadCidade',   l.cidade);
  setText('modalLeadTelefone', l.telefone);
  setText('modalLeadProvedor', l.provedor || '-');
  setText('modalLeadPlano',    l.planoAtual || '-');
  setText('modalLeadValor',    l.valorPlano ? `R$ ${l.valorPlano}` : '-');
  setVal('modalStatusFunil',   l.status);
  setVal('modalLeadObs',       l.observacao);
  setVal('inputObjecaoLead',   l.objecao || '');
  setVal('respostaObjecaoLead', l.respostaObjecao || '');

  // Vendedor e datas no modal
  const vendEl = document.getElementById('modalLeadVendedor');
  if (vendEl) {
    vendEl.innerText = l.vendedor || '-';
    vendEl.closest?.('.modal-meta-row')?.classList?.toggle('hidden', !l.vendedor && !isAdminUser());
  }
  const dcEl = document.getElementById('modalLeadDataCadastro');
  if (dcEl) dcEl.innerText = l.dataCadastro || '-';
  const uaEl = document.getElementById('modalLeadUltAtual');
  if (uaEl) uaEl.innerText = l.ultimaAtualizacao || '-';

  const fidBox = document.getElementById('modalFidelidadeBox');
  if (l.fidelidade) {
    const fid = new Date(l.fidelidade);
    const hoje = new Date();
    const diffDays = Math.ceil((fid - hoje) / (1000 * 60 * 60 * 24));
    fidBox.classList.remove('hidden');
    if (diffDays <= 0) {
      fidBox.innerHTML = `<i class="fas fa-unlock"></i> Fidelidade <b>VENCIDA</b> — ótima hora para fechar!`;
      fidBox.style.background = '#d1fae5'; fidBox.style.color = '#065f46';
    } else if (diffDays <= 30) {
      fidBox.innerHTML = `<i class="fas fa-clock"></i> Fidelidade vence em <b>${diffDays} dias</b> — momento ideal!`;
    } else {
      fidBox.innerHTML = `<i class="fas fa-lock"></i> Fidelidade até ${fid.toLocaleDateString('pt-BR')}`;
    }
  } else { fidBox.classList.add('hidden'); }

  if (l.agendamento) {
    const p = String(l.agendamento).split(' ');
    if (p[0]) {
      const [d, m, a] = p[0].split('/');
      const elD = document.getElementById('agendarData');
      if (elD && a) elD.value = `${a}-${(m||'01').padStart(2,'0')}-${(d||'01').padStart(2,'0')}`;
    }
    const elH = document.getElementById('agendarHora');
    if (elH && p[1]) elH.value = p[1];
  } else {
    const elD = document.getElementById('agendarData'); if (elD) elD.value = '';
    const elH = document.getElementById('agendarHora'); if (elH) elH.value = '';
  }

  const adm = document.getElementById('adminEncaminharArea');
  if (adm) adm.classList.toggle('hidden', !isAdminUser());

  const fone = String(l.telefone || '').replace(/\D/g, '');
  document.getElementById('btnModalWhats').onclick = () => abrirWhatsAppDireto(fone);
  document.getElementById('btnModalCall').onclick  = () => ligarPara(fone);
  const endCompleto = encodeURIComponent([l.endereco, l.bairro, l.cidade].filter(Boolean).join(', '));
  document.getElementById('btnModalMap').onclick   = () => abrirMaps(endCompleto);

  renderTarefasNoModal(l.nomeLead);
  document.getElementById('leadModal').classList.add('open');
}

function fecharLeadModal() { document.getElementById('leadModal').classList.remove('open'); }

async function salvarEdicaoModal() {
  if (!leadAtualParaAgendar) return;
  const s = document.getElementById('modalStatusFunil').value;
  const o = document.getElementById('modalLeadObs').value;
  const d = document.getElementById('agendarData').value;
  const h = document.getElementById('agendarHora').value;

  leadAtualParaAgendar.status = s;
  leadAtualParaAgendar.observacao = o;
  leadAtualParaAgendar.ultimaAtualizacao = new Date().toLocaleDateString('pt-BR') + ' ' + new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
  if (d) {
    const [a, m, day] = d.split('-');
    leadAtualParaAgendar.agendamento = `${day}/${m}/${a} ${h || ''}`.trim();
  }

  localStorage.setItem('mhnet_leads_cache', JSON.stringify(leadsCache));
  if (document.getElementById('gestaoLeads').classList.contains('active')) renderLeads();

  showLoading(true);
  await Promise.all([
    apiCall('updateStatus',     { vendedor: loggedUser, nomeLead: leadAtualParaAgendar.nomeLead, status: s }, false),
    apiCall('updateObservacao', { vendedor: loggedUser, nomeLead: leadAtualParaAgendar.nomeLead, observacao: o }, false)
  ]);
  if (d) await apiCall('updateAgendamento', { vendedor: loggedUser, nomeLead: leadAtualParaAgendar.nomeLead, agendamento: leadAtualParaAgendar.agendamento }, false);
  showLoading(false);
  fecharLeadModal();
}

function editarLeadAtual() {
  if (!leadAtualParaAgendar) return;
  const l = leadAtualParaAgendar;
  const setVal = (id, v) => { const el = document.getElementById(id); if(el) el.value = v || ''; };
  setVal('leadNome', l.nomeLead); setVal('leadTelefone', l.telefone);
  setVal('leadEndereco', l.endereco); setVal('leadNumero', l.numero || '');
  setVal('leadComplemento', l.complemento || ''); setVal('leadBairro', l.bairro);
  setVal('leadCidade', l.cidade); setVal('leadProvedor', l.provedor);
  setVal('leadValorPlano', l.valorPlano || ''); setVal('leadPlanoAtual', l.planoAtual || '');
  setVal('leadFidelidade', l.fidelidade || ''); setVal('leadObs', l.observacao);
  const st = document.getElementById('leadStatus'); if (st) st.value = l.status || 'Novo';
  editingLeadIndex = leadsCache.indexOf(l);
  document.getElementById('cadastroTitle').innerText = 'Editar Lead';
  fecharLeadModal();
  navegarPara('cadastroLead');
}

function limparFormLead() {
  ['leadNome','leadTelefone','leadEndereco','leadNumero','leadComplemento','leadBairro','leadObs','leadProvedor','leadValorPlano','leadPlanoAtual','leadFidelidade'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = '';
  });
  const st = document.getElementById('leadStatus'); if(st) st.value = 'Novo';
  const ci = document.getElementById('leadCidade'); if(ci) ci.value = 'Lajeado';
  document.getElementById('cadastroTitle').innerText = 'Novo Lead';
}

async function enviarLead() {
  const nome = document.getElementById('leadNome').value.trim();
  if (!nome) { alert('⚠️ Informe o nome do cliente!'); return; }

  const p = {
    vendedor: loggedUser, nomeLead: nome,
    telefone: document.getElementById('leadTelefone').value,
    endereco: [document.getElementById('leadEndereco').value, document.getElementById('leadNumero').value].filter(Boolean).join(', '),
    numero: document.getElementById('leadNumero').value,
    complemento: document.getElementById('leadComplemento').value,
    bairro: document.getElementById('leadBairro').value,
    cidade: document.getElementById('leadCidade').value,
    provedor: document.getElementById('leadProvedor').value,
    valorPlano: document.getElementById('leadValorPlano').value,
    planoAtual: document.getElementById('leadPlanoAtual').value,
    fidelidade: document.getElementById('leadFidelidade').value,
    interesse: document.getElementById('leadInteresse')?.value || 'Médio',
    status: document.getElementById('leadStatus').value,
    observacao: document.getElementById('leadObs').value,
    novoVendedor: document.getElementById('leadVendedorDestino')?.value || ''
  };

  let route = 'addLead';
  if (editingLeadIndex !== null) {
    route = 'updateLeadFull';
    p._linha = leadsCache[editingLeadIndex]._linha;
  }

  const res = await apiCall(route, p);
  if (res?.status === 'success' || res?.local) {
    const now = new Date();
    const hoje = now.toLocaleDateString('pt-BR');
    if (editingLeadIndex !== null) {
      leadsCache[editingLeadIndex] = { ...leadsCache[editingLeadIndex], ...p, ultimaAtualizacao: hoje };
    } else {
      leadsCache.unshift({ ...p, timestamp: hoje, dataCadastro: hoje, ultimaAtualizacao: hoje, _linha: Date.now() });
    }
    localStorage.setItem('mhnet_leads_cache', JSON.stringify(leadsCache));
    editingLeadIndex = null;
    alert('✅ Lead salvo com sucesso!');
    carregarLeads(false);
    navegarPara('gestaoLeads');
  } else {
    alert('❌ Erro ao salvar. Verifique a conexão.');
  }
}

async function excluirLead() {
  if (!confirm('Excluir este lead?')) return;
  await apiCall('deleteLead', { vendedor: loggedUser, _linha: leadAtualParaAgendar._linha });
  leadsCache = leadsCache.filter(l => l !== leadAtualParaAgendar);
  localStorage.setItem('mhnet_leads_cache', JSON.stringify(leadsCache));
  fecharLeadModal();
  renderLeads();
}

async function marcarVendaFechada() {
  if (!confirm('Confirmar Venda Fechada? 🎉')) return;
  await apiCall('updateStatus', { vendedor: loggedUser, nomeLead: leadAtualParaAgendar.nomeLead, status: 'Venda Fechada' });
  leadAtualParaAgendar.status = 'Venda Fechada';
  leadAtualParaAgendar.ultimaAtualizacao = new Date().toLocaleDateString('pt-BR');
  localStorage.setItem('mhnet_leads_cache', JSON.stringify(leadsCache));
  alert('🎉 Parabéns pela venda!');
  fecharLeadModal();
  renderLeads();
}

async function encaminharLeadModal() {
  const n = document.getElementById('modalLeadDestino').value;
  if (!n) { alert('Selecione um vendedor destino'); return; }
  if (!confirm(`Encaminhar para ${n}?`)) return;
  await apiCall('forwardLead', { nomeLead: leadAtualParaAgendar.nomeLead, novoVendedor: n, origem: loggedUser });
  alert('✅ Lead encaminhado!');
  fecharLeadModal();
  carregarLeads();
}

// ============================================================
// FTTA — LAJEADO / ESTRELA
// ============================================================
async function carregarFtta() {
  const div = document.getElementById('listaFtta');
  if (!div) return;
  div.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Carregando...</p></div>';
  try {
    const [resL, resE, resP] = await Promise.all([
      apiCall('getFttaLeads',      { aba: 'FTTA LAJEADO' }, false),
      apiCall('getFttaLeads',      { aba: 'FTTA ESTRELA' }, false),
      apiCall('getFttaProspeccao', {}, false)
    ]);
    if (resL?.status === 'success') fttaCache.lajeado    = resL.data || [];
    if (resE?.status === 'success') fttaCache.estrela    = resE.data || [];
    if (resP?.status === 'success') fttaCache.prospeccao = resP.data || [];
  } catch(e) { console.error('Erro FTTA:', e); }
  renderFttaLista();
}

function setFttaTab(tab) {
  fttaTabAtual = tab;
  document.querySelectorAll('#ftta .ftag').forEach(b => b.classList.remove('on'));
  const tabMap = { lajeado:'fttaTabLaj', estrela:'fttaTabEst', prospeccao:'fttaTabPro' };
  document.getElementById(tabMap[tab])?.classList.add('on');
  filtrarFtta();
}

function filtrarFtta() {
  const term = (document.getElementById('searchFtta')?.value || '').toLowerCase();
  let lista = fttaCache[fttaTabAtual] || [];
  if (term) lista = lista.filter(l =>
    String(l.nomeBloco || l.nome || '').toLowerCase().includes(term) ||
    String(l.bairro || '').toLowerCase().includes(term) ||
    String(l.cidade || '').toLowerCase().includes(term)
  );
  renderFttaLista(lista);
}

function renderFttaLista(lista = null) {
  if (!lista) lista = fttaCache[fttaTabAtual] || [];
  const div = document.getElementById('listaFtta');
  if (!div) return;
  if (!lista.length) {
    div.innerHTML = `<div class="empty-state"><i class="fas fa-network-wired"></i><p>Nenhum registro encontrado.</p></div>`;
    return;
  }
  if (fttaTabAtual === 'prospeccao') renderFttaProspeccao(lista, div);
  else renderFttaBlocos(lista, div);
}

function renderFttaBlocos(lista, div) {
  const abaAtual = fttaTabAtual === 'lajeado' ? 'FTTA LAJEADO' : 'FTTA ESTRELA';
  div.innerHTML = lista.map((item, idx) => {
    const fone = String(item.contato || '').replace(/\D/g, '');
    return `
    <div class="lead-card" style="${item.alertaVisita ? 'border-left:3px solid #f59e0b;' : ''}">
      <div class="lc-top">
        <div class="lc-name">${item.nomeBloco || '-'}</div>
        ${item.alertaVisita ? `<span class="badge agendado">⚠️ Visitar</span>` : `<span class="badge novo">Ativo</span>`}
      </div>
      <div class="lc-city"><i class="fas fa-map-marker-alt" style="margin-right:4px;"></i>${item.bairro || '-'} · ${item.cidade || '-'}</div>
      ${item.sindico ? `<div class="lc-phone" style="font-size:.75rem;color:var(--text-2);"><i class="fas fa-user-tie" style="opacity:.6;margin-right:3px;"></i>${item.sindico}</div>` : ''}
      ${item.contato ? `<div class="lc-phone"><i class="fas fa-phone" style="opacity:.6;"></i> ${item.contato}</div>` : ''}
      ${item.endereco ? `<div class="lc-city" style="font-size:.7rem;"><i class="fas fa-road" style="margin-right:3px;"></i>${item.endereco}</div>` : ''}
      <div style="display:flex;gap:6px;margin:8px 0 4px;background:var(--surface);border-radius:8px;padding:8px 10px;font-size:.72rem;flex-wrap:wrap;">
        <div style="flex:1;"><span style="color:var(--text-3);font-weight:700;font-size:.62rem;display:block;text-transform:uppercase;">Última visita</span>
          <span style="font-weight:700;color:${item.alertaVisita ? 'var(--warning)' : 'var(--text-1)'};">${item.ultimaVisita || '—'}</span></div>
        <div style="flex:1;"><span style="color:var(--text-3);font-weight:700;font-size:.62rem;display:block;text-transform:uppercase;">Próxima</span>
          <span style="font-weight:700;color:${item.alertaVisita ? 'var(--danger)' : 'var(--success)'};">${item.proximaVisita || 'Não registrado'}</span></div>
      </div>
      <div class="lc-btns" style="flex-wrap:wrap;gap:5px;">
        ${fone ? `<button class="lc-btn call" onclick="ligarPara('${fone}')"><i class="fas fa-phone"></i> Ligar</button>` : ''}
        ${fone ? `<button class="lc-btn whats" onclick="abrirWhatsAppDireto('${fone}')"><i class="fab fa-whatsapp"></i></button>` : ''}
        <button class="lc-btn detail" onclick="registrarVisitaFtta(${item._linha},'${abaAtual}')" style="background:#d1fae5;color:#065f46;border-color:#a7f3d0;">
          <i class="fas fa-calendar-check"></i> Registrar Visita
        </button>
        <button class="lc-btn detail" onclick="abrirEditarFttaBloco(${idx},'${abaAtual}')"><i class="fas fa-edit"></i> Editar</button>
      </div>
    </div>`;
  }).join('');
}

async function registrarVisitaFtta(linha, aba) {
  if (!confirm('Registrar visita de hoje neste bloco?')) return;
  showLoading(true);
  const res = await apiCall('updateFttaVisita', { _linha: linha, aba, vendedor: loggedUser }, false);
  showLoading(false);
  if (res?.status === 'success') { alert('✅ Visita registrada! Próximo retorno em 2 meses.'); carregarFtta(); }
  else alert('❌ Erro ao registrar. Verifique conexão.');
}

function abrirEditarFttaBloco(idx, aba) {
  const lista = fttaTabAtual === 'lajeado' ? fttaCache.lajeado : fttaCache.estrela;
  editingFttaItem = { ...lista[idx], aba };
  const setV = (id, v) => { const el = document.getElementById(id); if(el) el.value = v || ''; };
  setV('fttaBlocoNome', editingFttaItem.nomeBloco); setV('fttaBlocoSindico', editingFttaItem.sindico);
  setV('fttaBlocoContato', editingFttaItem.contato); setV('fttaBlocoEndereco', editingFttaItem.endereco);
  setV('fttaBlocoBairro', editingFttaItem.bairro); setV('fttaBlocoCidade', editingFttaItem.cidade);
  document.getElementById('modalFttaBloco').classList.add('open');
}

async function salvarEdicaoFttaBloco() {
  if (!editingFttaItem) return;
  const d = {
    aba: editingFttaItem.aba, _linha: editingFttaItem._linha,
    nomeBloco: document.getElementById('fttaBlocoNome').value,
    sindico: document.getElementById('fttaBlocoSindico').value,
    contato: document.getElementById('fttaBlocoContato').value,
    endereco: document.getElementById('fttaBlocoEndereco').value,
    bairro: document.getElementById('fttaBlocoBairro').value,
    cidade: document.getElementById('fttaBlocoCidade').value
  };
  showLoading(true);
  const res = await apiCall('updateFttaBloco', d, false);
  showLoading(false);
  if (res?.status === 'success') {
    alert('✅ Bloco atualizado!');
    document.getElementById('modalFttaBloco').classList.remove('open');
    carregarFtta();
  } else alert('❌ Erro ao salvar.');
}

// ============================================================
// FTTA PROSPECÇÃO V220
// ============================================================
function renderFttaProspeccao(lista, div) {
  // Conta alertas
  const alertas = lista.filter(i => i.alertaProxAcao && !String(i.adquado||'').toUpperCase().includes('ADQUADO')).length;
  let htmlHeader = '';
  if (alertas > 0) {
    htmlHeader = `<div style="background:#fff7ed;border:1px solid #fde68a;border-left:3px solid #f59e0b;border-radius:9px;padding:10px 14px;margin-bottom:12px;display:flex;align-items:center;gap:8px;">
      <i class="fas fa-bell" style="color:#f59e0b;"></i>
      <div>
        <div style="font-size:.8rem;font-weight:700;color:#92400e;">${alertas} prospecção${alertas>1?'ões':''} com ação vencida!</div>
        <div style="font-size:.68rem;color:#b45309;">Registre a ação para manter o controle.</div>
      </div>
    </div>`;
  }

  // Botão para adicionar nova prospecção
  const btnAdd = isAdminUser() ? `<button onclick="abrirModalNovaProspeccao()" class="btn btn-navy btn-sm" style="margin-bottom:12px;width:100%;"><i class="fas fa-plus"></i> Nova Prospecção</button>` : '';

  div.innerHTML = htmlHeader + btnAdd + lista.map((item, idx) => {
    const fone = String(item.contato || '').replace(/\D/g, '');
    const jaAdquado = String(item.adquado || '').toUpperCase().includes('ADQUADO');
    const alerta = item.alertaProxAcao && !jaAdquado;
    const dias = item.diasParaAcao;

    let proxAcaoBadge = '';
    if (!jaAdquado && item.proximaAcaoCalc) {
      if (dias !== null && dias <= 0) {
        proxAcaoBadge = `<span style="font-size:.62rem;font-weight:800;background:#fee2e2;color:#b91c1c;border-radius:5px;padding:2px 7px;"><i class="fas fa-exclamation-triangle"></i> VENCIDA há ${Math.abs(dias)} dias</span>`;
      } else if (dias !== null && dias <= 7) {
        proxAcaoBadge = `<span style="font-size:.62rem;font-weight:800;background:#fff7ed;color:#92400e;border-radius:5px;padding:2px 7px;"><i class="fas fa-clock"></i> Ação em ${dias} dias</span>`;
      }
    }

    return `
    <div class="lead-card" style="${alerta ? 'border-left:3px solid #f59e0b;animation:pulseAlert 2.5s ease-in-out infinite;' : ''}${jaAdquado ? 'opacity:.55;' : ''}">
      <div class="lc-top">
        <div class="lc-name">${item.nome || '-'}</div>
        ${jaAdquado ? `<span class="badge fechado">✅ Adquado</span>` : `<span class="badge negociacao">Prospecção</span>`}
      </div>
      ${proxAcaoBadge ? `<div style="margin-bottom:6px;">${proxAcaoBadge}</div>` : ''}
      ${item.construtora ? `<div class="lc-city"><i class="fas fa-building" style="margin-right:4px;"></i>${item.construtora}</div>` : ''}
      <div class="lc-city"><i class="fas fa-map-marker-alt" style="margin-right:4px;"></i>${item.bairro || '-'} · ${item.cidade || '-'}</div>
      ${item.endereco ? `<div class="lc-city" style="font-size:.7rem;"><i class="fas fa-road" style="margin-right:3px;"></i>${item.endereco}</div>` : ''}
      ${item.sindico ? `<div class="lc-phone" style="font-size:.75rem;"><i class="fas fa-user-tie" style="opacity:.6;margin-right:3px;"></i>${item.sindico}</div>` : ''}
      
      <div style="display:flex;gap:6px;margin:8px 0 4px;background:var(--surface);border-radius:8px;padding:8px 10px;font-size:.72rem;flex-wrap:wrap;">
        ${item.dataEntrega ? `<div style="flex:1;"><span style="color:var(--text-3);font-weight:700;font-size:.62rem;display:block;text-transform:uppercase;">Entrega prevista</span><span style="font-weight:700;color:var(--text-1);">${item.dataEntrega}</span></div>` : ''}
        ${item.consultor ? `<div style="flex:1;"><span style="color:var(--text-3);font-weight:700;font-size:.62rem;display:block;text-transform:uppercase;">Consultor</span><span style="font-weight:700;color:var(--navy);">${item.consultor}</span></div>` : ''}
        ${item.ultimaAcao ? `<div style="flex:1;min-width:100%;"><span style="color:var(--text-3);font-weight:700;font-size:.62rem;display:block;text-transform:uppercase;">Última ação</span><span style="color:var(--text-2);">${item.ultimaAcao}</span></div>` : ''}
        ${item.proximaAcaoCalc ? `<div style="flex:1;min-width:100%;"><span style="color:var(--text-3);font-weight:700;font-size:.62rem;display:block;text-transform:uppercase;">Próxima ação (calculada)</span><span style="font-weight:700;color:${alerta ? 'var(--danger)':'var(--navy)'};">${item.proximaAcaoCalc}</span></div>` : ''}
      </div>

      <div class="lc-btns" style="flex-wrap:wrap;gap:5px;">
        ${fone ? `<button class="lc-btn call" onclick="ligarPara('${fone}')"><i class="fas fa-phone"></i> Ligar</button>` : ''}
        ${fone ? `<button class="lc-btn whats" onclick="abrirWhatsAppDireto('${fone}')"><i class="fab fa-whatsapp"></i></button>` : ''}
        ${!jaAdquado ? `
        <button class="lc-btn detail" onclick="registrarAcaoProspeccao(${idx})" style="background:#dbeafe;color:#1d4ed8;border-color:#bfdbfe;">
          <i class="fas fa-check-circle"></i> Registrar Ação
        </button>
        <button class="lc-btn detail" onclick="confirmarAdquarFtta(${idx})" style="background:#d1fae5;color:#065f46;border-color:#a7f3d0;">
          <i class="fas fa-network-wired"></i> Marcar Adquado
        </button>` : ''}
        ${isAdminUser() ? `<button class="lc-btn detail" onclick="abrirEditarProspeccao(${idx})"><i class="fas fa-edit"></i> Editar</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

async function registrarAcaoProspeccao(idx) {
  const item = fttaCache.prospeccao[idx];
  if (!item) return;
  if (!confirm(`Registrar ação de hoje para "${item.nome}"?\n→ Próxima ação será calculada para daqui 2 meses.`)) return;
  showLoading(true);
  const res = await apiCall('updateFttaProspeccao', {
    _linha: item._linha, nome: item.nome, construtora: item.construtora,
    sindico: item.sindico, contato: item.contato, endereco: item.endereco,
    bairro: item.bairro, cidade: item.cidade, consultor: item.consultor || loggedUser,
    registrarAcao: true
  }, false);
  showLoading(false);
  if (res?.status === 'success') { alert('✅ Ação registrada! Lembrete em 2 meses.'); carregarFtta(); }
  else alert('❌ Erro ao registrar.');
}

function abrirModalNovaProspeccao() {
  editingProspeccaoItem = null;
  document.getElementById('prosTitulo').innerText = 'Nova Prospecção';
  ['prosNome','prosConstrutora','prosSindico','prosContato','prosEndereco','prosBairro','prosCidade','prosConsultor','prosDataEntrega'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = '';
  });
  document.getElementById('modalProspeccao').classList.add('open');
}

function abrirEditarProspeccao(idx) {
  const item = fttaCache.prospeccao[idx];
  if (!item) return;
  editingProspeccaoItem = item;
  document.getElementById('prosTitulo').innerText = 'Editar Prospecção';
  const setV = (id, v) => { const el = document.getElementById(id); if(el) el.value = v||''; };
  setV('prosNome', item.nome); setV('prosConstrutora', item.construtora);
  setV('prosSindico', item.sindico); setV('prosContato', item.contato);
  setV('prosEndereco', item.endereco); setV('prosBairro', item.bairro);
  setV('prosCidade', item.cidade); setV('prosConsultor', item.consultor);
  document.getElementById('modalProspeccao').classList.add('open');
}

async function salvarProspeccao() {
  const nome = document.getElementById('prosNome').value.trim();
  if (!nome) { alert('Informe o nome!'); return; }
  const d = {
    nome, construtora: document.getElementById('prosConstrutora').value,
    sindico: document.getElementById('prosSindico').value,
    contato: document.getElementById('prosContato').value,
    endereco: document.getElementById('prosEndereco').value,
    bairro: document.getElementById('prosBairro').value,
    cidade: document.getElementById('prosCidade').value,
    consultor: document.getElementById('prosConsultor').value || loggedUser,
    dataEntrega: document.getElementById('prosDataEntrega')?.value || ''
  };
  showLoading(true);
  let res;
  if (editingProspeccaoItem) {
    res = await apiCall('updateFttaProspeccao', { ...d, _linha: editingProspeccaoItem._linha }, false);
  } else {
    res = await apiCall('addFttaProspeccao', d, false);
  }
  showLoading(false);
  if (res?.status === 'success') {
    alert('✅ Salvo!');
    document.getElementById('modalProspeccao').classList.remove('open');
    carregarFtta();
  } else alert('❌ Erro ao salvar.');
}

async function confirmarAdquarFtta(idx) {
  const item = fttaCache.prospeccao[idx];
  if (!item) return;
  const cidadeLower = String(item.cidade || '').toLowerCase();
  const destino = cidadeLower.includes('estrela') ? 'FTTA ESTRELA' : 'FTTA LAJEADO';
  if (!confirm(`Marcar "${item.nome}" como Adquado?\nSerá movido para ${destino}.`)) return;
  showLoading(true);
  const res = await apiCall('adquarFttaProspeccao', { _linha: item._linha, nome: item.nome, sindico: item.sindico, contato: item.contato, endereco: item.endereco, bairro: item.bairro, cidade: item.cidade, consultor: item.consultor }, false);
  showLoading(false);
  if (res?.status === 'success') { alert(`✅ Movido para ${res.abaDestino || destino}!`); carregarFtta(); }
  else alert('❌ Erro ao mover. Tente novamente.');
}

// ============================================================
// CONCORRENTES V220 — Sincroniza com planilha
// ============================================================
async function carregarConcorrentes() {
  if (!navigator.onLine) {
    const saved = localStorage.getItem('mhnet_concorrentes_v2');
    if (saved) try { concorrentesCache = JSON.parse(saved); } catch(e) {}
    renderGridConcorrentes();
    return;
  }
  const res = await apiCall('getConcorrentes', {}, false);
  if (res?.status === 'success' && res.data?.length > 0) {
    concorrentesCache = res.data;
    localStorage.setItem('mhnet_concorrentes_v2', JSON.stringify(concorrentesCache));
  } else {
    // Fallback para localStorage legado
    const saved = localStorage.getItem('mhnet_concorrentes_v2') || localStorage.getItem('mhnet_concorrentes');
    if (saved) try { concorrentesCache = JSON.parse(saved); } catch(e) {}
  }
  renderGridConcorrentes();
}

function inicializarConcorrentes() { carregarConcorrentes(); }

function renderGridConcorrentes() {
  const grid = document.getElementById('compGrid');
  if (!grid) return;
  if (!concorrentesCache.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:span 2"><i class="fas fa-binoculars"></i><p>Carregando concorrentes...</p></div>';
    return;
  }
  grid.innerHTML = concorrentesCache.map(c => `
    <div class="comp-card" onclick="selecionarConcorrente('${c.id || c._linha}')">
      <div class="comp-logo" style="background:${c.cor || c.color || '#1565c0'};">${c.sigla}</div>
      <div class="comp-name">${c.name}</div>
      <div class="comp-type">${c.type}</div>
      ${isAdminUser() ? `<div style="margin-top:6px;display:flex;gap:4px;">
        <button onclick="event.stopPropagation();editarConcorrente('${c.id || c._linha}')" style="flex:1;background:#dbeafe;color:#1d4ed8;border:none;border-radius:5px;padding:4px;font-size:.65rem;font-weight:700;cursor:pointer;">✏️ Editar</button>
        <button onclick="event.stopPropagation();excluirConcorrente('${c.id || c._linha}')" style="flex:1;background:#fee2e2;color:#b91c1c;border:none;border-radius:5px;padding:4px;font-size:.65rem;font-weight:700;cursor:pointer;">🗑️</button>
      </div>` : ''}
    </div>`).join('');
}

function selecionarConcorrente(id) {
  compSelecionado = concorrentesCache.find(c => String(c.id || c._linha) === String(id));
  if (!compSelecionado) return;
  document.querySelectorAll('.comp-card').forEach(c => c.classList.remove('selected'));
  const det = document.getElementById('compDetail');
  det.classList.remove('hidden');
  det.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  document.getElementById('compDetailLogo').style.background = compSelecionado.cor || '#1565c0';
  document.getElementById('compDetailLogo').innerText = compSelecionado.sigla;
  document.getElementById('compDetailName').innerText = compSelecionado.name;
  document.getElementById('compDetailType').innerText = compSelecionado.type;
  document.getElementById('compPros').innerHTML = compSelecionado.pros.map(p => `<div class="pc-item">${p}</div>`).join('');
  document.getElementById('compCons').innerHTML = compSelecionado.cons.map(c => `<div class="pc-item">${c}</div>`).join('');
  document.getElementById('compMhnet').innerText = compSelecionado.mhnet;
  const resp = document.getElementById('compAiResp');
  resp.classList.add('hidden'); resp.innerText = '';
  document.getElementById('compAiQuestion').value = '';
}

function abrirModalNovoConcorrente() {
  editingCompId = null;
  document.getElementById('compModalTitle').innerText = 'Novo Concorrente';
  ['compFormNome','compFormSigla','compFormTipo','compFormMhnet','compFormPros','compFormCons'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = '';
  });
  const cor = document.getElementById('compFormCor'); if(cor) cor.value = '#1565c0';
  document.getElementById('modalConcorrente').classList.add('open');
}

function editarConcorrente(id) {
  const c = concorrentesCache.find(x => String(x.id || x._linha) === String(id));
  if (!c) return;
  editingCompId = id;
  document.getElementById('compModalTitle').innerText = 'Editar Concorrente';
  document.getElementById('compFormNome').value  = c.name;
  document.getElementById('compFormSigla').value = c.sigla;
  document.getElementById('compFormTipo').value  = c.type;
  document.getElementById('compFormCor').value   = c.cor || '#1565c0';
  document.getElementById('compFormMhnet').value = c.mhnet;
  document.getElementById('compFormPros').value  = Array.isArray(c.pros) ? c.pros.join('\n') : String(c.pros||'');
  document.getElementById('compFormCons').value  = Array.isArray(c.cons) ? c.cons.join('\n') : String(c.cons||'');
  document.getElementById('modalConcorrente').classList.add('open');
}

async function salvarConcorrente() {
  const nome  = document.getElementById('compFormNome').value.trim();
  const sigla = document.getElementById('compFormSigla').value.trim().toUpperCase();
  if (!nome || !sigla) { alert('Preencha nome e sigla!'); return; }
  const d = {
    name: nome, sigla, type: document.getElementById('compFormTipo').value.trim(),
    cor: document.getElementById('compFormCor').value,
    mhnet: document.getElementById('compFormMhnet').value.trim(),
    pros: document.getElementById('compFormPros').value.split('\n').filter(Boolean),
    cons: document.getElementById('compFormCons').value.split('\n').filter(Boolean)
  };
  if (editingCompId) {
    const existing = concorrentesCache.find(c => String(c.id || c._linha) === String(editingCompId));
    if (existing) d._linha = existing._linha;
  }
  showLoading(true);
  const res = await apiCall('saveConcorrente', d, false);
  showLoading(false);
  document.getElementById('modalConcorrente').classList.remove('open');
  await carregarConcorrentes();
  alert('✅ Concorrente salvo!');
}

async function excluirConcorrente(id) {
  if (!confirm('Excluir este concorrente?')) return;
  const c = concorrentesCache.find(x => String(x.id || x._linha) === String(id));
  if (!c) return;
  showLoading(true);
  await apiCall('deleteConcorrente', { _linha: c._linha }, false);
  showLoading(false);
  await carregarConcorrentes();
  document.getElementById('compDetail').classList.add('hidden');
}

async function analisarConcorrenteIA() {
  if (!compSelecionado) { alert('Selecione um concorrente!'); return; }
  const q = document.getElementById('compAiQuestion').value.trim();
  const prompt = q
    ? `Sobre o concorrente ${compSelecionado.name} em Lajeado/RS: ${q}. Considere que a MHNET oferece: ${compSelecionado.mhnet}`
    : `Crie um script de vendas para MHNET abordando cliente da ${compSelecionado.name}. 2 desvantagens do concorrente e 2 vantagens da MHNET. Máximo 5 linhas.`;
  const resp = document.getElementById('compAiResp');
  resp.classList.remove('hidden');
  resp.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analisando...';
  const answer = await callGeminiDirect(prompt);
  resp.innerHTML = answer || 'IA indisponível no momento.';
}

// ============================================================
// INDICADORES V220
// ============================================================
function abrirIndicadores() { navegarPara('indicadores'); carregarIndicadores(); }

async function carregarIndicadores() {
  showLoading(true);
  if (isAdminUser()) {
    await carregarIndicadoresAdmin();
  } else {
    await carregarIndicadoresVendedor();
  }
  showLoading(false);
}

async function carregarIndicadoresAdmin(mes = null, ano = null) {
  const params = { vendedor: loggedUser };
  if (mes !== null) params.mes = mes;
  if (ano !== null) params.ano = ano;

  const res = await apiCall('getAdminIndicators', params, false);
  if (res?.status !== 'success') return;
  const d = res.data;

  document.getElementById('indMes').innerText = d.periodo || '';
  document.getElementById('funnelLeads').innerText   = d.totalGeral || 0;
  document.getElementById('indRealizado').innerText  = d.vendasGeral || 0;
  document.getElementById('indNegociacao').innerText = d.totalLeadsHoje || 0;
  const total = d.totalGeral || 1;
  document.getElementById('pbLeads').style.width  = '100%';
  document.getElementById('pbVendas').style.width = Math.min(100, (d.vendasGeral / total) * 100) + '%';
  document.getElementById('pbNeg').style.width    = '0%';

  // Atualiza labels para contexto admin
  const lblLeads = document.getElementById('indLabelLeads');
  if (lblLeads) lblLeads.innerText = 'Total de Leads (período)';
  const lblVendas = document.getElementById('indLabelVendas');
  if (lblVendas) lblVendas.innerText = 'Vendas Fechadas';
  const lblNeg = document.getElementById('indLabelNeg');
  if (lblNeg) lblNeg.innerText = 'Leads Hoje (todos vendedores)';

  // Ranking de vendedores
  const rankDiv = document.getElementById('indRankingVendedores');
  if (rankDiv && d.ranking?.length) {
    rankDiv.classList.remove('hidden');
    rankDiv.innerHTML = `
      <div style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--text-3);margin-bottom:10px;display:flex;align-items:center;gap:6px;">
        <i class="fas fa-crown" style="color:var(--warning);"></i> Ranking da Equipe
      </div>
      ${d.ranking.map((v, i) => `
      <div style="background:${i === 0 ? '#fffbeb' : 'var(--card)'};border:1px solid ${i === 0 ? '#fde68a' : 'var(--border)'};border-radius:var(--r-sm);padding:10px 12px;margin-bottom:7px;display:flex;align-items:center;gap:10px;">
        <div style="width:24px;height:24px;border-radius:50%;background:${i===0?'var(--warning)':i===1?'#94a3b8':'#cbd5e1'};display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:900;color:#fff;flex-shrink:0;">${i+1}</div>
        <div style="flex:1;">
          <div style="font-size:.82rem;font-weight:700;color:var(--text-1);">${v.nome}</div>
          <div style="font-size:.65rem;color:var(--text-3);">${v.totalLeads} leads · ${v.leadsHoje} hoje · Conv. ${v.conversao}%</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:1.1rem;font-weight:900;color:var(--navy);">${v.vendas}</div>
          <div style="font-size:.6rem;color:var(--text-3);text-transform:uppercase;">vendas</div>
        </div>
      </div>`).join('')}
    `;
  }

  // Mini gráfico de barras (série diária)
  renderMiniGrafico(d.serieDiaria || [], 'indGrafico', 'Leads por Dia');

  // Filtro de mês
  const filtroDiv = document.getElementById('indFiltroMes');
  if (filtroDiv) filtroDiv.classList.remove('hidden');
}

async function carregarIndicadoresVendedor() {
  const res = await apiCall('getVendedorIndicators', { vendedor: loggedUser }, false);
  if (res?.status !== 'success') return;
  const d = res.data;

  document.getElementById('indMes').innerText = d.mesAtual || '';
  document.getElementById('funnelLeads').innerText   = d.totalAtual || 0;
  document.getElementById('indRealizado').innerText  = d.vendaAtual || 0;
  document.getElementById('indNegociacao').innerText = d.negAtual || 0;
  const total = d.totalAtual || 1;
  document.getElementById('pbLeads').style.width  = '100%';
  document.getElementById('pbVendas').style.width = Math.min(100, (d.vendaAtual / total) * 100) + '%';
  document.getElementById('pbNeg').style.width    = Math.min(100, (d.negAtual / total) * 100) + '%';

  // Comparativo com mês anterior
  const comparDiv = document.getElementById('indComparativo');
  if (comparDiv) {
    comparDiv.classList.remove('hidden');
    const crescStr = d.crescimento !== null
      ? `${d.crescimento > 0 ? '+' : ''}${d.crescimento}%`
      : '—';
    const crescColor = d.crescimento > 0 ? 'var(--success)' : d.crescimento < 0 ? 'var(--danger)' : 'var(--text-3)';
    comparDiv.innerHTML = `
      <div style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--text-3);margin-bottom:10px;">Comparativo com ${d.mesAnterior}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
        <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--r-sm);padding:10px;text-align:center;">
          <div style="font-size:1.4rem;font-weight:900;color:var(--text-3);">${d.totalAnterior}</div>
          <div style="font-size:.6rem;color:var(--text-3);text-transform:uppercase;">Leads ant.</div>
        </div>
        <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--r-sm);padding:10px;text-align:center;">
          <div style="font-size:1.4rem;font-weight:900;color:${crescColor};">${crescStr}</div>
          <div style="font-size:.6rem;color:var(--text-3);text-transform:uppercase;">Crescimento</div>
        </div>
        <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--r-sm);padding:10px;text-align:center;">
          <div style="font-size:1.4rem;font-weight:900;color:var(--text-3);">${d.vendaAnterior}</div>
          <div style="font-size:.6rem;color:var(--text-3);text-transform:uppercase;">Vendas ant.</div>
        </div>
      </div>`;
  }

  // Chip de leads hoje
  const hojeTile = document.getElementById('indLeadsHoje');
  if (hojeTile) {
    hojeTile.classList.remove('hidden');
    hojeTile.innerHTML = `<div style="font-size:2rem;font-weight:900;color:var(--cyan);">${d.leadsHoje}</div><div style="font-size:.6rem;color:var(--text-3);text-transform:uppercase;">Leads Hoje</div>`;
  }

  renderMiniGrafico(d.serieDiaria || [], 'indGrafico', 'Leads por Dia');

  const iaRes = await apiCall('analyzeIndicators', { meta: 20, vendas: d.vendaAtual }, false);
  if (iaRes?.message) {
    document.getElementById('iaMsgBox').classList.remove('hidden');
    document.getElementById('iaMsgTxt').innerText = iaRes.message;
  }
}

/**
 * Renderiza mini-gráfico de barras SVG inline
 */
function renderMiniGrafico(serie, containerId, titulo) {
  const div = document.getElementById(containerId);
  if (!div || !serie.length) return;

  const maxVal = Math.max(...serie.map(s => s.leads), 1);
  const barW = Math.max(8, Math.floor(280 / serie.length) - 2);
  const chartH = 60;

  const bars = serie.map((s, i) => {
    const h = Math.max(3, Math.round((s.leads / maxVal) * chartH));
    const x = i * (barW + 2);
    const y = chartH - h;
    const isToday = s.dia === new Date().toLocaleDateString('pt-BR');
    return `<g>
      <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="2"
        fill="${isToday ? 'var(--cyan)' : 'var(--navy-mid)'}" opacity="${isToday ? 1 : 0.65}"/>
      ${s.leads > 0 ? `<text x="${x + barW/2}" y="${y - 2}" text-anchor="middle" font-size="7" fill="var(--text-3)">${s.leads}</text>` : ''}
    </g>`;
  }).join('');

  // Datas (últimos e primeiro da série)
  let labelHtml = '';
  if (serie.length > 0) {
    const first = serie[0].dia.split('/').slice(0,2).join('/');
    const last  = serie[serie.length-1].dia.split('/').slice(0,2).join('/');
    labelHtml = `<div style="display:flex;justify-content:space-between;font-size:.6rem;color:var(--text-3);margin-top:2px;"><span>${first}</span><span>${last}</span></div>`;
  }

  div.classList.remove('hidden');
  div.innerHTML = `
    <div style="font-size:.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.08em;color:var(--text-3);margin-bottom:8px;">${titulo}</div>
    <svg width="100%" height="${chartH + 10}" viewBox="0 0 ${serie.length * (barW + 2)} ${chartH + 10}" preserveAspectRatio="none">
      ${bars}
    </svg>
    ${labelHtml}`;
}

// Filtro de mês para admin
function filtrarIndicadoresMes() {
  const sel = document.getElementById('selFiltroMes');
  if (!sel) return;
  const val = sel.value;
  if (!val) {
    carregarIndicadoresAdmin();
    return;
  }
  const [ano, mes] = val.split('-');
  carregarIndicadoresAdmin(parseInt(mes)-1, parseInt(ano));
}

// ============================================================
// TAREFAS
// ============================================================
async function carregarTarefas(show = true) {
  const res = await apiCall('getTasks', { vendedor: loggedUser }, false);
  if (res?.status === 'success') {
    tasksCache = res.data || [];
    if (show) renderTarefas();
  }
  verificarAgendamentosHoje();
}

function renderTarefas() {
  const div = document.getElementById('listaTarefasContainer');
  if (!div) return;
  if (!tasksCache.length) {
    div.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle"></i><p>Nenhuma tarefa pendente!</p></div>';
    return;
  }
  const sorted = [...tasksCache].sort((a,b) => a.status === 'PENDENTE' ? -1 : 1);
  div.innerHTML = sorted.map(t => {
    const done = t.status === 'CONCLUIDA';
    return `
    <div class="task-item ${done ? 'done-item' : ''}">
      <div class="t-check ${done ? 'done' : ''}" onclick="toggleTask('${t.id}','${t.status}')">
        ${done ? '<i class="fas fa-check"></i>' : ''}
      </div>
      <div class="t-body">
        <div class="t-desc ${done ? 'done' : ''}">${t.descricao}</div>
        <div class="t-meta">
          ${t.dataLimite ? `<span class="t-chip date"><i class="far fa-calendar"></i> ${t.dataLimite}</span>` : ''}
          ${t.nomeLead ? `<span class="t-chip lead" onclick="irParaLeadDaTarefa('${t.nomeLead}')" style="cursor:pointer;">👤 ${t.nomeLead}</span>` : ''}
        </div>
      </div>
      <div class="t-del" onclick="excluirTarefa('${t.id}')"><i class="fas fa-trash-alt"></i></div>
    </div>`;
  }).join('');
}

function irParaLeadDaTarefa(nomeLead) {
  const idx = leadsCache.findIndex(l => l.nomeLead === nomeLead);
  if (idx >= 0) { navegarPara('gestaoLeads'); setTimeout(() => abrirLeadDetalhes(idx), 200); }
  else alert(`Lead "${nomeLead}" não encontrado.`);
}

function abrirModalTarefa() {
  const s = document.getElementById('taskLeadSelect');
  s.innerHTML = '<option value="">Nenhum</option>' + leadsCache.map(l => `<option value="${l.nomeLead}">${l.nomeLead}</option>`).join('');
  document.getElementById('taskModal').classList.add('open');
}

async function salvarTarefa() {
  const desc = document.getElementById('taskDesc').value.trim();
  if (!desc) { alert('Informe a descrição!'); return; }
  await apiCall('addTask', {
    vendedor: loggedUser, descricao: desc,
    dataLimite: document.getElementById('taskDate').value,
    nomeLead: document.getElementById('taskLeadSelect').value
  });
  document.getElementById('taskModal').classList.remove('open');
  document.getElementById('taskDesc').value = '';
  document.getElementById('taskDate').value = '';
  carregarTarefas(true);
}

async function toggleTask(id, currentStatus) {
  const t = tasksCache.find(x => x.id === id);
  if (t) { t.status = currentStatus === 'PENDENTE' ? 'CONCLUIDA' : 'PENDENTE'; renderTarefas(); }
  await apiCall('toggleTask', { taskId: id, status: currentStatus, vendedor: loggedUser }, false);
}

async function excluirTarefa(id) {
  if (!confirm('Excluir tarefa?')) return;
  tasksCache = tasksCache.filter(t => t.id !== id);
  renderTarefas();
  await apiCall('toggleTask', { taskId: id, status: 'DELETED', vendedor: loggedUser }, false);
}

async function limparTarefasConcluidas() {
  if (!confirm('Arquivar tarefas concluídas?')) return;
  tasksCache = tasksCache.filter(t => t.status !== 'CONCLUIDA');
  renderTarefas();
  await apiCall('archiveTasks', { vendedor: loggedUser }, false);
}

function renderTarefasNoModal(nomeLead) {
  const sec = document.getElementById('sectionTarefasLead');
  const lst = document.getElementById('listaTarefasLead');
  const t = tasksCache.filter(x => x.nomeLead === nomeLead && x.status !== 'CONCLUIDA');
  if (t.length > 0) {
    sec.classList.remove('hidden');
    lst.innerHTML = t.map(x => `<div style="background:var(--surface);padding:9px;border-radius:7px;margin-bottom:5px;font-size:.8rem;display:flex;gap:7px;align-items:center;"><input type="checkbox" onchange="toggleTask('${x.id}','${x.status}')"> ${x.descricao}</div>`).join('');
  } else { sec.classList.add('hidden'); }
}

function abrirCalendario() { window.open(CALENDAR_URL, '_blank'); }

// ============================================================
// FALTAS
// ============================================================
async function enviarJustificativa() {
  const data    = document.getElementById('faltaData').value;
  const motivo  = document.getElementById('faltaMotivo').value;
  const obs     = document.getElementById('faltaObs').value;
  const arquivo = document.getElementById('faltaArquivo').files[0];
  if (!data || !motivo) { alert('⚠️ Preencha data e tipo de solicitação!'); return; }
  const payload = { vendedor: loggedUser, dataFalta: data, motivo, observacao: obs, emailAdmin: EMAIL_ADMIN };
  showLoading(true);
  if (arquivo) {
    try {
      const base64 = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload  = e => res(e.target.result);
        reader.onerror = () => rej(new Error('Erro ao ler arquivo'));
        reader.readAsDataURL(arquivo);
      });
      payload.fileData = base64; payload.fileName = arquivo.name; payload.mimeType = arquivo.type;
    } catch(e) {}
  }
  const res = await apiCall('registerAbsence', payload, false);
  showLoading(false);
  if (res?.status === 'success') {
    alert('✅ Solicitação enviada!\nUm e-mail foi encaminhado ao gestor.');
    limparFormFalta();
    carregarHistoricoFaltas();
  } else {
    alert('❌ Erro ao enviar: ' + (res?.message || 'Verifique a conexão.'));
  }
}

function limparFormFalta() {
  ['faltaData','faltaMotivo','faltaObs','faltaArquivo'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = '';
  });
}

async function carregarHistoricoFaltas() {
  const div = document.getElementById('listaHistoricoFaltas');
  if (!div) return;
  div.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-3);"><i class="fas fa-spinner fa-spin"></i></div>';
  const params = isAdminUser() ? { vendedor: 'TODOS' } : { vendedor: loggedUser };
  const res = await apiCall('getAbsences', params, false);
  if (res?.status === 'success' && res.data?.length) {
    div.innerHTML = res.data.map(f => `
      <div class="hist-falta">
        ${isAdminUser() ? `<div style="font-size:.65rem;font-weight:800;color:var(--navy);margin-bottom:3px;">${f.vendedor}</div>` : ''}
        <div class="hf-motivo">${f.motivo}</div>
        <div class="hf-meta">
          <span><i class="far fa-calendar"></i> ${f.dataFalta}</span>
          <span class="hf-status">${f.status || 'ENVIADO'}</span>
          ${f.obs ? `<span style="color:var(--text-3);">${f.obs}</span>` : ''}
          ${f.link ? `<a href="${f.link}" target="_blank" style="color:var(--navy);font-size:.7rem;font-weight:700;">📎 Ver Anexo</a>` : ''}
        </div>
      </div>`).join('');
  } else {
    div.innerHTML = '<div class="empty-state"><i class="fas fa-history"></i><p>Sem histórico.</p></div>';
  }
}

// ============================================================
// MATERIAIS
// ============================================================
async function carregarMateriais(f = null) {
  const div = document.getElementById('materiaisGrid');
  if (!div) return;
  currentFolderId = f;
  div.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Carregando...</p></div>';
  const res = await apiCall('getImages', { folderId: f }, false);
  if (res?.status === 'success' && res.data) {
    materialsCache = res.data;
    const btnV = document.getElementById('btnVoltarMateriais');
    const tit  = document.getElementById('tituloMateriais');
    if (btnV) {
      if (res.isRoot) { btnV.onclick = () => navegarPara('dashboard'); if (tit) tit.innerText = 'Materiais'; }
      else { btnV.onclick = () => carregarMateriais(null); if (tit) tit.innerText = '← Voltar'; }
    }
    renderMateriais(materialsCache);
  } else {
    div.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i><p>Erro ao carregar.</p></div>';
  }
}

function buscarMateriais() {
  const term = (document.getElementById('searchMateriais')?.value || '').toLowerCase();
  renderMateriais(materialsCache.filter(m => m.name.toLowerCase().includes(term)));
}

function filtrarMateriaisBtn(termo, btn) {
  document.querySelectorAll('#materiais .ftag').forEach(b => b.classList.remove('on'));
  if (btn) btn.classList.add('on');
  const inp = document.getElementById('searchMateriais');
  if (inp) { inp.value = termo === 'Todos' ? '' : termo; }
  buscarMateriais();
}

function renderMateriais(items) {
  const div = document.getElementById('materiaisGrid');
  if (!div) return;
  if (!items.length) { div.innerHTML = '<div class="empty-state" style="grid-column:span 2"><i class="fas fa-folder-open"></i><p>Vazio.</p></div>'; return; }
  div.innerHTML = items.map(item => {
    if (item.type === 'folder') {
      return `<div class="mat-folder" onclick="carregarMateriais('${item.id}')"><i class="fas fa-folder"></i><span>${item.name}</span></div>`;
    }
    return `
    <div class="mat-file">
      <div class="mat-thumb"><img src="${item.thumbnail}" loading="lazy" alt="${item.name}"></div>
      <div class="mat-info">
        <div class="mat-name">${item.name}</div>
        <div class="mat-acts">
          <a href="${item.downloadUrl}" target="_blank" class="mat-act dl"><i class="fas fa-download"></i></a>
          <button onclick="window.open('https://wa.me/?text=${encodeURIComponent(item.viewUrl)}','_blank')" class="mat-act wh"><i class="fab fa-whatsapp"></i></button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ============================================================
// IA HÍBRIDA — Gemini direto com fallback backend
// ============================================================
async function callGeminiDirect(userPrompt) {
  try {
    const fullPrompt = `${MHNET_CONTEXT}\n\nPergunta/Solicitação: ${userPrompt}`;
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: fullPrompt }] }], generationConfig: { maxOutputTokens: 500, temperature: 0.7 } })
    });
    if (!res.ok) { AI_DISPONIVEL = false; return null; }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) { AI_DISPONIVEL = true; return text; }
    return null;
  } catch(e) { AI_DISPONIVEL = false; return null; }
}

// ============================================================
// OBJEÇÕES & IA
// ============================================================
async function combaterObjecaoGeral() {
  const o = document.getElementById('inputObjecaoGeral').value.trim();
  if (!o) { alert('Informe a objeção!'); return; }
  const div = document.getElementById('resultadoObjecaoGeral');
  div.classList.remove('hidden');
  div.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando resposta...';
  const prompt = `Você é um vendedor expert da MHNET. Um cliente disse: "${o}". Responda de forma persuasiva e empática em até 4 linhas.`;
  let answer = await callGeminiDirect(prompt);
  if (!answer) { const res = await apiCall('solveObjection', { objection: o }, false); answer = res?.answer; }
  div.innerHTML = answer || '⚠️ IA indisponível.';
  div.style.color = answer ? 'var(--text-1)' : 'var(--danger)';
}

async function combaterObjecaoLead() {
  const o = document.getElementById('inputObjecaoLead').value.trim();
  if (!o) { alert('Informe a objeção!'); return; }
  let answer = await callGeminiDirect(`Vendedor da MHNET. Cliente disse: "${o}". Resposta persuasiva em até 4 linhas.`);
  if (!answer) { const res = await apiCall('solveObjection', { objection: o }, false); answer = res?.answer; }
  if (answer) document.getElementById('respostaObjecaoLead').value = answer;
  else alert('⚠️ IA indisponível.');
}

async function salvarObjecaoLead() {
  if (!leadAtualParaAgendar) return;
  await apiCall('saveObjectionLead', {
    vendedor: loggedUser, nomeLead: leadAtualParaAgendar.nomeLead,
    objection: document.getElementById('inputObjecaoLead').value,
    answer: document.getElementById('respostaObjecaoLead').value
  });
  alert('✅ Objeção salva!');
}

async function gerarCoachIA() {
  showLoading(true);
  const prompt = 'Dê uma frase motivacional curta e poderosa para um vendedor externo de internet porta a porta. Máximo 2 linhas.';
  let answer = await callGeminiDirect(prompt);
  if (!answer) { const res = await apiCall('askAI', { question: prompt }, false); answer = res?.answer; }
  showLoading(false);
  if (answer) alert('💪 ' + answer);
  else alert('⚠️ IA indisponível no momento.');
}

// ============================================================
// CHAT IA
// ============================================================
function consultarPlanosIA() {
  document.getElementById('chatModal').classList.add('open');
  const hist = document.getElementById('chatHistory');
  if (!hist.children.length) {
    hist.innerHTML = '<div class="c-msg ai">👋 Olá! Sou o assistente MHNET. Posso ajudar com planos, scripts, objeções e muito mais!</div>';
  }
}

function toggleChat() { document.getElementById('chatModal').classList.remove('open'); }

async function enviarMensagemChat() {
  const input = document.getElementById('chatInput');
  const m = input.value.trim();
  if (!m) return;
  const hist = document.getElementById('chatHistory');
  hist.innerHTML += `<div class="c-msg user">${m}</div>`;
  input.value = '';
  hist.scrollTop = hist.scrollHeight;
  const typingId = 'typing_' + Date.now();
  hist.innerHTML += `<div class="c-msg ai" id="${typingId}"><i class="fas fa-circle-notch fa-spin"></i> Pensando...</div>`;
  hist.scrollTop = hist.scrollHeight;
  let answer = await callGeminiDirect(m);
  if (!answer) { const res = await apiCall('askAI', { question: m }, false); answer = res?.answer; }
  const el = document.getElementById(typingId);
  if (el) el.outerHTML = `<div class="c-msg ai">${answer || '⚠️ IA temporariamente indisponível.'}</div>`;
  hist.scrollTop = hist.scrollHeight;
}

// ============================================================
// GPS
// ============================================================
async function buscarEnderecoGPS() {
  if (!navigator.geolocation) { alert('GPS indisponível.'); return; }
  showLoading(true);
  navigator.geolocation.getCurrentPosition(async pos => {
    try {
      const { latitude, longitude } = pos.coords;
      const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
      const data = await res.json();
      if (data?.address) {
        const a = data.address;
        const setV = (id, v) => { const el = document.getElementById(id); if(el && v) el.value = v; };
        setV('leadEndereco', a.road || a.pedestrian);
        setV('leadBairro', a.suburb || a.neighbourhood || a.quarter);
        setV('leadCidade', a.city || a.town || a.village);
        alert('✅ Endereço preenchido!');
      }
    } catch(e) { alert('Erro ao obter endereço.'); }
    showLoading(false);
  }, () => { showLoading(false); alert('Permissão GPS negada.'); }, { timeout: 10000 });
}

// ============================================================
// ADMIN
// ============================================================
function abrirConfiguracoes() { document.getElementById('configModal').classList.add('open'); }

async function gerirEquipe(acao) {
  const nome = document.getElementById('cfgNomeVendedor').value.trim();
  const meta  = document.getElementById('cfgMeta').value;
  if (!nome) { alert('Informe o nome!'); return; }
  await apiCall('manageTeam', { acao, nome, meta });
  alert('✅ Feito!');
  carregarVendedores();
  document.getElementById('cfgNomeVendedor').value = '';
}

function abrirTransferenciaEmLote() {
  document.getElementById('modalTransferencia').classList.add('open');
}

async function executarTransferenciaLote() {
  const from = document.getElementById('transfOrigem').value;
  const to   = document.getElementById('transfDestino').value;
  if (!from || !to)  { alert('Selecione origem e destino!'); return; }
  if (from === to)   { alert('Origem e destino iguais!'); return; }
  if (!confirm(`Transferir todos os leads de ${from} para ${to}?`)) return;
  const res = await apiCall('transferAllLeads', { from, to });
  if (res?.status === 'success') alert(`✅ ${res.count} leads transferidos!`);
  document.getElementById('modalTransferencia').classList.remove('open');
  carregarLeads();
}

// ============================================================
// SYNC QUEUE (OFFLINE)
// ============================================================
async function processarFilaSincronizacao() {
  if (!syncQueue.length) return;
  const queue = [...syncQueue];
  syncQueue = [];
  localStorage.setItem('mhnet_sync_queue', '[]');
  for (const item of queue) {
    try { await apiCall(item.route, item.payload, false); }
    catch(e) { syncQueue.push(item); }
  }
  localStorage.setItem('mhnet_sync_queue', JSON.stringify(syncQueue));
}

// ============================================================
// API CALL
// ============================================================
async function apiCall(route, payload = {}, show = true) {
  if (show) showLoading(true);
  const offlineRoutes = ['addLead','updateStatus','addTask','registerAbsence','updateObservacao','updateAgendamento'];
  if (!navigator.onLine && offlineRoutes.includes(route)) {
    syncQueue.push({ route, payload, timestamp: Date.now() });
    localStorage.setItem('mhnet_sync_queue', JSON.stringify(syncQueue));
    if (show) showLoading(false);
    return { status: 'success', local: true };
  }
  try {
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 15000);
    const res  = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ route, payload }),
      signal: ctrl.signal
    });
    clearTimeout(tid);
    const json = await res.json();
    if (show) showLoading(false);
    return json;
  } catch(e) {
    if (show) showLoading(false);
    if (offlineRoutes.includes(route)) {
      syncQueue.push({ route, payload, timestamp: Date.now() });
      localStorage.setItem('mhnet_sync_queue', JSON.stringify(syncQueue));
      return { status: 'success', local: true };
    }
    return { status: 'error', message: 'Conexão falhou' };
  }
}

function showLoading(state) {
  const el = document.getElementById('loader');
  if (el) el.classList.toggle('active', state);
}
