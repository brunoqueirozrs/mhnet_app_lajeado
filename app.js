/**
 * ============================================================================
 * MHNET VENDAS - APP.JS V183 (UNIFICADO & REFATORADO)
 * ============================================================================
 */

// ============================================================
// CONFIGURAÇÃO
// ============================================================
const DEPLOY_ID = 'AKfycbydgHNvi0o4tZgqa37nY7-jzZd4g8Qcgo1K297KG6QKj90T2d8eczNEwWatGiXbvere';
const API_URL   = `https://script.google.com/macros/s/${DEPLOY_ID}/exec`;
const CALENDAR_URL = "https://calendar.google.com/calendar/u/0?cid=ZTZlNjQ2OWVkNzQ1YzMzYmIwMjg2YmFmYmM4NzA2ZmU4YzM3MWVhMDU1MWRiNDY2NDJkNTc2NTI5MmFhMDZmN0Bncm91cC5jYWxlbmRhci5nb29nbGUuY29t";
const ADMIN_NAME_CHECK = "BRUNO GARCIA QUEIROZ";

const VENDEDORES_OFFLINE = [
  "Bruno Garcia Queiroz",
  "Ana Paula Rodrigues",
  "Vitoria Caroline Baldez Rosales",
  "João Vithor Sader",
  "João Paulo da Silva Santos",
  "Claudia Maria Semmler",
  "Diulia Vitoria Machado Borges",
  "Elton da Silva Rodrigo Gonçalves",
  "Vendedor Teste"
];

// ============================================================
// ESTADO GLOBAL
// ============================================================
let loggedUser   = localStorage.getItem('loggedUser') || null;
let leadsCache   = [];
let vendorsCache = [];
let tasksCache   = [];
let materialsCache = [];
let leadAtualParaAgendar = null;
let currentFolderId = null;
let editingLeadIndex = null;
let syncQueue = JSON.parse(localStorage.getItem('mhnet_sync_queue') || '[]');

function isAdminUser() {
  if (!loggedUser) return false;
  return loggedUser.trim().toUpperCase().includes("BRUNO GARCIA");
}

// ============================================================
// INICIALIZAÇÃO
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  carregarVendedores();

  const saved = localStorage.getItem('mhnet_leads_cache');
  if (saved) { try { leadsCache = JSON.parse(saved); } catch(e) {} }

  if (loggedUser) {
    initApp();
    if (navigator.onLine) processarFilaSincronizacao();
  }
});

window.addEventListener('online', () => processarFilaSincronizacao());

function initApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('header').classList.remove('hidden');
  document.getElementById('mainScroll').classList.remove('hidden');
  document.getElementById('bottomNav').classList.remove('hidden');

  document.getElementById('userInfo').innerText = loggedUser;
  atualizarDataCabecalho();

  if (isAdminUser()) {
    document.getElementById('btnAdminSettings').classList.remove('hidden');
    document.getElementById('adminPanel').classList.remove('hidden');
  }
  if (isAdminUser()) {
    document.getElementById('divEncaminhar').style.display = 'block';
  }

  carregarLeads(false);
  carregarTarefas(false);
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
  const offlineOpts = VENDEDORES_OFFLINE.map(v => `<option value="${v}">${v}</option>`).join('');
  sel.innerHTML = '<option value="">Selecione...</option>' + offlineOpts;

  try {
    const res = await apiCall('getVendors', {}, false);
    if (res?.status === 'success' && res.data?.length > 0) {
      vendorsCache = res.data;
      const opts = res.data.map(v => `<option value="${v.nome}">${v.nome}</option>`).join('');
      sel.innerHTML = '<option value="">Selecione...</option>' + opts;
      atualizarSelectsVendedores(opts);
    }
  } catch(e) {}
}

function atualizarSelectsVendedores(opts) {
  const ids = ['modalLeadDestino','leadVendedorDestino','transfOrigem','transfDestino'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '<option value="">Selecione...</option>' + opts;
  });
}

// ============================================================
// NAVEGAÇÃO
// ============================================================
function navegarPara(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(pageId);
  if (target) target.classList.add('active');

  document.getElementById('mainScroll').scrollTo(0, 0);

  // Nav highlight
  const map = { dashboard:'navDash', gestaoLeads:'navLeads', tarefas:'navTasks', indicadores:'navInd' };
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('on'));
  if (map[pageId]) document.getElementById(map[pageId])?.classList.add('on');

  // Hooks
  if (pageId === 'dashboard')   { atualizarDashboard(); verificarAgendamentosHoje(); }
  if (pageId === 'tarefas')     renderTarefas();
  if (pageId === 'indicadores') carregarIndicadores();
  if (pageId === 'materiais' && !currentFolderId) carregarMateriais(null);
  if (pageId === 'cadastroLead' && editingLeadIndex === null) limparFormLead();
}

function verTodosLeads() {
  navegarPara('gestaoLeads');
  document.getElementById('searchLead').value = '';
  document.querySelectorAll('.filter-tag').forEach(b => b.classList.remove('on'));
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
  document.getElementById('statLeads').innerText = count;
  document.getElementById('statLeadsBody').innerText = count;
}

function verificarAgendamentosHoje() {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const r = leadsCache.filter(l => l.agendamento && l.agendamento.includes(hoje));
  const t = tasksCache.filter(k => k.dataLimite && k.dataLimite.includes(hoje) && k.status !== 'CONCLUIDA');
  const banner = document.getElementById('lembreteBanner');
  if (r.length > 0 || t.length > 0) banner.classList.add('show');
  else banner.classList.remove('show');
}

// ============================================================
// LEADS
// ============================================================
async function carregarLeads(showLoader = true) {
  if (!navigator.onLine) { renderLeads(); return; }
  const userToSend = isAdminUser() ? ADMIN_NAME_CHECK : loggedUser;
  const res = await apiCall('getLeads', { vendedor: userToSend }, showLoader);
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
    String(l.bairro || '').toLowerCase().includes(term)
  );
  renderListaLeadsHTML(final);
}

function renderListaLeadsHTML(lista) {
  const div = document.getElementById('listaLeadsGestao');
  if (!div) return;
  if (!lista.length) {
    div.innerHTML = '<div class="empty-state"><i class="fas fa-search"></i><p>Nenhum lead encontrado.</p></div>';
    return;
  }
  const badgeClass = s => {
    if (s === 'Venda Fechada') return 'fechado';
    if (s === 'Agendado')     return 'agendado';
    if (s === 'Negociação')   return 'negociacao';
    if (s === 'Novo')         return 'novo';
    return 'default';
  };
  div.innerHTML = lista.map(l => {
    const idx = leadsCache.indexOf(l);
    return `
    <div class="lead-card" onclick="abrirLeadDetalhes(${idx})">
      <div class="lead-top">
        <div class="lead-name">${l.nomeLead || '-'}</div>
        <span class="badge ${badgeClass(l.status)}">${l.status || 'Novo'}</span>
      </div>
      <div class="lead-location"><i class="fas fa-map-marker-alt"></i> ${l.bairro || '-'} · ${l.cidade || '-'}</div>
      ${l.agendamento ? `<div class="lead-sched"><i class="fas fa-clock"></i> ${l.agendamento.split(' ')[0]}</div>` : ''}
    </div>`;
  }).join('');
}

function filtrarPorStatus(status, btn) {
  document.querySelectorAll('.filter-tag').forEach(b => b.classList.remove('on'));
  if (btn) btn.classList.add('on');
  const lista = status === 'Todos' ? leadsCache : leadsCache.filter(l => l.status === status);
  renderListaLeadsHTML(lista);
}

function filtrarLeadsHoje() {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const lista = leadsCache.filter(l => l.timestamp && l.timestamp.includes(hoje));
  if (!lista.length) { alert('📅 Nenhum lead cadastrado hoje! Vamos pra cima! 🚀'); return; }
  navegarPara('gestaoLeads');
  renderListaLeadsHTML(lista);
}

function filtrarRetornos() {
  const hoje = new Date().toLocaleDateString('pt-BR');
  const lista = leadsCache.filter(l => l.agendamento && l.agendamento.includes(hoje));
  if (!lista.length) { alert('Nenhum retorno agendado para hoje.'); return; }
  navegarPara('gestaoLeads');
  renderListaLeadsHTML(lista);
}

function renderListaLeads(lista) { renderListaLeadsHTML(lista); }

// ============================================================
// DETALHE LEAD (MODAL)
// ============================================================
function abrirLeadDetalhes(index) {
  const l = leadsCache[index];
  if (!l) return;
  leadAtualParaAgendar = l;

  const setText = (id, v) => { const el = document.getElementById(id); if(el) el.innerText = v || '-'; };
  const setVal  = (id, v) => { const el = document.getElementById(id); if(el) el.value  = v || ''; };

  setText('modalLeadNome',      l.nomeLead);
  setText('modalLeadBairro',    l.bairro);
  setText('modalLeadCidade',    l.cidade);
  setText('modalLeadTelefone',  l.telefone);
  setText('modalLeadProvedor',  l.provedor);
  setVal('modalStatusFunil',    l.status);
  setVal('modalLeadObs',        l.observacao);
  setVal('inputObjecaoLead',    l.objecao);
  setVal('respostaObjecaoLead', l.respostaObjecao);

  // Agendamento
  if (l.agendamento) {
    const p = String(l.agendamento).split(' ');
    if (p[0]) {
      const [d, m, a] = p[0].split('/');
      const elData = document.getElementById('agendarData');
      if (elData && a && m && d) elData.value = `${a}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
    if (p[1]) { const elH = document.getElementById('agendarHora'); if(elH) elH.value = p[1]; }
  } else {
    const elData = document.getElementById('agendarData');
    if (elData) elData.value = '';
    const elH = document.getElementById('agendarHora');
    if (elH) elH.value = '';
  }

  const adminArea = document.getElementById('adminEncaminharArea');
  if (adminArea) {
    if (isAdminUser()) adminArea.classList.remove('hidden');
    else adminArea.classList.add('hidden');
  }

  const btnWhats = document.getElementById('btnModalWhats');
  if (btnWhats) btnWhats.onclick = () => abrirWhatsApp();

  renderTarefasNoModal(l.nomeLead);
  document.getElementById('leadModal').classList.add('open');
}

function fecharLeadModal() {
  document.getElementById('leadModal').classList.remove('open');
}

async function salvarEdicaoModal() {
  if (!leadAtualParaAgendar) return;
  const s = document.getElementById('modalStatusFunil').value;
  const o = document.getElementById('modalLeadObs').value;
  const d = document.getElementById('agendarData').value;
  const h = document.getElementById('agendarHora').value;

  leadAtualParaAgendar.status = s;
  leadAtualParaAgendar.observacao = o;

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
  setVal('leadNome',     l.nomeLead);
  setVal('leadTelefone', l.telefone);
  setVal('leadEndereco', l.endereco);
  setVal('leadBairro',   l.bairro);
  setVal('leadCidade',   l.cidade);
  setVal('leadProvedor', l.provedor);
  setVal('leadObs',      l.observacao);
  const s = document.getElementById('leadStatus'); if(s) s.value = l.status || 'Novo';
  editingLeadIndex = leadsCache.indexOf(l);
  document.getElementById('cadastroTitle').innerText = 'Editar Lead';
  fecharLeadModal();
  navegarPara('cadastroLead');
}

function limparFormLead() {
  ['leadNome','leadTelefone','leadEndereco','leadBairro','leadObs','leadProvedor'].forEach(id => {
    const el = document.getElementById(id); if(el) el.value = '';
  });
  const s = document.getElementById('leadStatus'); if(s) s.value = 'Novo';
  const c = document.getElementById('leadCidade'); if(c) c.value = 'Lajeado';
  document.getElementById('cadastroTitle').innerText = 'Novo Lead';
}

async function enviarLead() {
  const p = {
    vendedor:    loggedUser,
    nomeLead:    document.getElementById('leadNome').value,
    telefone:    document.getElementById('leadTelefone').value,
    endereco:    document.getElementById('leadEndereco').value,
    bairro:      document.getElementById('leadBairro').value,
    cidade:      document.getElementById('leadCidade').value,
    provedor:    document.getElementById('leadProvedor').value,
    interesse:   document.getElementById('leadInteresse').value,
    status:      document.getElementById('leadStatus').value,
    observacao:  document.getElementById('leadObs').value,
    novoVendedor: document.getElementById('leadVendedorDestino')?.value || ''
  };

  if (!p.nomeLead) { alert('⚠️ Informe o nome do cliente!'); return; }

  let route = 'addLead';
  if (editingLeadIndex !== null) {
    route = 'updateLeadFull';
    p._linha = leadsCache[editingLeadIndex]._linha;
  } else if (p.novoVendedor) {
    route = 'forwardLead';
    p.origem = loggedUser;
  }

  const res = await apiCall(route, p);
  if (res?.status === 'success' || res?.local) {
    // Atualiza cache local
    if (editingLeadIndex !== null) {
      leadsCache[editingLeadIndex] = { ...leadsCache[editingLeadIndex], ...p };
    } else {
      leadsCache.unshift({ ...p, timestamp: new Date().toLocaleDateString('pt-BR'), _linha: 9999 });
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

function abrirWhatsApp() {
  if (!leadAtualParaAgendar) return;
  const fone = String(leadAtualParaAgendar.telefone || '').replace(/\D/g, '');
  if (fone) window.open(`https://wa.me/55${fone}`, '_blank');
  else alert('Telefone não cadastrado.');
}

// ============================================================
// TAREFAS
// ============================================================
async function carregarTarefas(show = true) {
  if (!navigator.onLine && tasksCache.length > 0) { if(show) renderTarefas(); return; }
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
    div.innerHTML = '<div class="tasks-empty"><i class="fas fa-check-circle"></i><p>Nenhuma tarefa pendente!</p></div>';
    return;
  }
  const sorted = [...tasksCache].sort((a, b) => a.status === 'PENDENTE' ? -1 : 1);
  div.innerHTML = sorted.map(t => {
    const done = t.status === 'CONCLUIDA';
    return `
    <div class="task-item ${done ? 'done-item' : ''}">
      <div class="task-check ${done ? 'done' : ''}" onclick="toggleTask('${t.id}','${t.status}')">
        ${done ? '<i class="fas fa-check"></i>' : ''}
      </div>
      <div class="task-body">
        <div class="task-desc ${done ? 'done' : ''}">${t.descricao}</div>
        <div class="task-meta">
          ${t.dataLimite ? `<span class="task-chip date"><i class="far fa-calendar"></i> ${t.dataLimite}</span>` : ''}
          ${t.nomeLead   ? `<span class="task-chip lead">👤 ${t.nomeLead}</span>` : ''}
        </div>
      </div>
      <div class="task-del" onclick="excluirTarefa('${t.id}')"><i class="fas fa-trash-alt"></i></div>
    </div>`;
  }).join('');
}

function abrirModalTarefa() {
  const s = document.getElementById('taskLeadSelect');
  s.innerHTML = '<option value="">Nenhum</option>' + leadsCache.map(l => `<option value="${l.nomeLead}">${l.nomeLead}</option>`).join('');
  document.getElementById('taskModal').classList.add('open');
}

async function salvarTarefa() {
  const desc = document.getElementById('taskDesc').value;
  if (!desc) { alert('Informe a descrição!'); return; }
  const p = {
    vendedor:  loggedUser,
    descricao: desc,
    dataLimite: document.getElementById('taskDate').value,
    nomeLead:  document.getElementById('taskLeadSelect').value
  };
  await apiCall('addTask', p);
  document.getElementById('taskModal').classList.remove('open');
  document.getElementById('taskDesc').value = '';
  document.getElementById('taskDate').value = '';
  carregarTarefas(true);
}

async function toggleTask(id, currentStatus) {
  const t = tasksCache.find(x => x.id === id);
  if (t) {
    t.status = currentStatus === 'PENDENTE' ? 'CONCLUIDA' : 'PENDENTE';
    renderTarefas();
    if (leadAtualParaAgendar) renderTarefasNoModal(leadAtualParaAgendar.nomeLead);
  }
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
    lst.innerHTML = t.map(x => `<div style="background:var(--surface);padding:10px;border-radius:8px;margin-bottom:6px;font-size:.82rem;display:flex;gap:8px;align-items:center;"><input type="checkbox" onchange="toggleTask('${x.id}','${x.status}')"> ${x.descricao}</div>`).join('');
  } else {
    sec.classList.add('hidden');
  }
}

function abrirCalendario() {
  window.open(CALENDAR_URL, '_blank');
}

// ============================================================
// FALTAS
// ============================================================
async function enviarJustificativa() {
  const p = {
    vendedor:    loggedUser,
    dataFalta:   document.getElementById('faltaData').value,
    motivo:      document.getElementById('faltaMotivo').value,
    observacao:  document.getElementById('faltaObs').value
  };
  if (!p.dataFalta || !p.motivo) { alert('Preencha data e tipo!'); return; }
  const f = document.getElementById('faltaArquivo').files[0];
  showLoading(true);
  if (f) {
    const r = new FileReader();
    r.onload = async e => {
      p.fileData = e.target.result;
      p.fileName = f.name;
      p.mimeType = f.type;
      await apiCall('registerAbsence', p, false);
      showLoading(false);
      alert('✅ Justificativa enviada!');
      navegarPara('dashboard');
    };
    r.readAsDataURL(f);
  } else {
    await apiCall('registerAbsence', p, false);
    showLoading(false);
    alert('✅ Justificativa enviada!');
    navegarPara('dashboard');
  }
}

async function verHistoricoFaltas() {
  document.getElementById('formFaltaContainer').classList.add('hidden');
  document.getElementById('historicoFaltasContainer').classList.remove('hidden');
  const res = await apiCall('getAbsences', { vendedor: loggedUser }, false);
  const div = document.getElementById('listaHistoricoFaltas');
  if (res?.status === 'success' && res.data?.length) {
    div.innerHTML = res.data.map(f => `
      <div class="history-item">
        <div class="h-motivo">${f.motivo}</div>
        <div class="h-meta">
          <span><i class="far fa-calendar"></i> ${f.dataFalta}</span>
          <span class="h-status">${f.status}</span>
          ${f.link ? `<a href="${f.link}" target="_blank" style="color:var(--navy);font-size:.7rem;font-weight:700;">Ver anexo</a>` : ''}
        </div>
      </div>`).join('');
  } else {
    div.innerHTML = '<div class="empty-state"><i class="fas fa-history"></i><p>Sem histórico.</p></div>';
  }
}

function ocultarHistoricoFaltas() {
  document.getElementById('formFaltaContainer').classList.remove('hidden');
  document.getElementById('historicoFaltasContainer').classList.add('hidden');
}

// ============================================================
// INDICADORES
// ============================================================
function abrirIndicadores() {
  navegarPara('indicadores');
  carregarIndicadores();
}

async function carregarIndicadores() {
  const res = await apiCall('getIndicators', { vendedor: loggedUser }, false);
  if (res?.status === 'success') {
    const d = res.data;
    document.getElementById('indMes').innerText = d.mes || '';
    document.getElementById('funnelLeads').innerText = d.totalLeads || 0;
    document.getElementById('indRealizado').innerText = d.vendas || 0;
    document.getElementById('indNegociacao').innerText = d.negociacao || 0;

    // Progress bars — proporcionais ao total de leads
    const total = d.totalLeads || 1;
    document.getElementById('pbLeads').style.width = '100%';
    document.getElementById('pbVendas').style.width = Math.min(100, ((d.vendas / total) * 100)) + '%';
    document.getElementById('pbNeg').style.width = Math.min(100, ((d.negociacao / total) * 100)) + '%';

    // Mensagem IA motivacional
    const iaRes = await apiCall('analyzeIndicators', { meta: 20, vendas: d.vendas }, false);
    if (iaRes?.message) {
      document.getElementById('iaMsgBox').classList.remove('hidden');
      document.getElementById('iaMsgTxt').innerText = iaRes.message;
    }
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

  const btnVolt  = document.getElementById('btnVoltarMateriais');
  const titleEl  = document.getElementById('tituloMateriais');

  const res = await apiCall('getImages', { folderId: f }, false);
  if (res?.status === 'success' && res.data) {
    materialsCache = res.data;
    if (btnVolt) {
      if (res.isRoot) {
        btnVolt.onclick = () => navegarPara('dashboard');
        if (titleEl) titleEl.innerText = 'Materiais';
      } else {
        btnVolt.onclick = () => carregarMateriais(null);
        if (titleEl) titleEl.innerText = '← Voltar';
      }
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
  document.querySelectorAll('#materiais .filter-tag').forEach(b => b.classList.remove('on'));
  if (btn) btn.classList.add('on');
  const input = document.getElementById('searchMateriais');
  if (input) { input.value = termo === 'Todos' ? '' : termo; }
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
        <div class="mat-actions">
          <a href="${item.downloadUrl}" target="_blank" class="mat-act dl"><i class="fas fa-download"></i></a>
          <button onclick="window.open('https://wa.me/?text=${encodeURIComponent(item.viewUrl)}','_blank')" class="mat-act wh"><i class="fab fa-whatsapp"></i></button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ============================================================
// OBJEÇÕES & IA
// ============================================================
async function combaterObjecaoGeral() {
  const o = document.getElementById('inputObjecaoGeral').value;
  if (!o) { alert('Informe a objeção!'); return; }
  const div = document.getElementById('resultadoObjecaoGeral');
  div.style.display = 'block';
  div.innerText = '⏳ Gerando resposta...';
  const res = await apiCall('solveObjection', { objection: o });
  div.innerText = res?.answer || 'Indisponível.';
}

async function combaterObjecaoLead() {
  const o = document.getElementById('inputObjecaoLead').value;
  if (!o) { alert('Informe a objeção!'); return; }
  const res = await apiCall('solveObjection', { objection: o });
  if (res?.status === 'success') document.getElementById('respostaObjecaoLead').value = res.answer;
}

async function salvarObjecaoLead() {
  if (!leadAtualParaAgendar) return;
  await apiCall('saveObjectionLead', {
    vendedor: loggedUser,
    nomeLead: leadAtualParaAgendar.nomeLead,
    objection: document.getElementById('inputObjecaoLead').value,
    answer:    document.getElementById('respostaObjecaoLead').value
  });
  alert('✅ Objeção salva!');
}

async function gerarCoachIA() {
  showLoading(true);
  const res = await apiCall('askAI', { question: 'Dê uma frase motivacional curta e poderosa para um vendedor externo de internet.' }, false);
  showLoading(false);
  if (res?.answer) alert('💪 ' + res.answer);
}

async function consultarPlanosIA() {
  document.getElementById('chatModal').classList.add('open');
}

function toggleChat() {
  document.getElementById('chatModal').classList.remove('open');
}

async function enviarMensagemChat() {
  const input = document.getElementById('chatInput');
  const m = input.value.trim();
  if (!m) return;
  const hist = document.getElementById('chatHistory');
  hist.innerHTML += `<div class="chat-msg user">${m}</div>`;
  input.value = '';
  hist.scrollTop = hist.scrollHeight;

  hist.innerHTML += `<div class="chat-msg ai" id="chatTyping">⏳ Pensando...</div>`;
  const res = await apiCall('askAI', { question: `Contexto: Sistema MHNET Vendas. Pergunta: ${m}` }, false);
  document.getElementById('chatTyping')?.remove();
  hist.innerHTML += `<div class="chat-msg ai">${res?.answer || 'Não consegui responder.'}</div>`;
  hist.scrollTop = hist.scrollHeight;
}

// ============================================================
// GPS
// ============================================================
async function buscarEnderecoGPS() {
  if (!navigator.geolocation) { alert('GPS indisponível.'); return; }
  showLoading(true, 'Localizando...');
  navigator.geolocation.getCurrentPosition(async pos => {
    try {
      const { latitude, longitude } = pos.coords;
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
      const data = await res.json();
      if (data?.address) {
        const a = data.address;
        const setV = (id, v) => { const el = document.getElementById(id); if(el) el.value = v || ''; };
        setV('leadEndereco', a.road);
        setV('leadBairro',   a.suburb || a.neighbourhood || a.quarter);
        setV('leadCidade',   a.city || a.town || a.village);
        alert('✅ Endereço preenchido pelo GPS!');
      }
    } catch(e) { alert('Erro ao obter endereço.'); }
    showLoading(false);
  }, () => { showLoading(false); alert('Permissão de GPS negada.'); });
}

// ============================================================
// ADMIN
// ============================================================
function abrirConfiguracoes() {
  document.getElementById('configModal').classList.add('open');
}

async function gerirEquipe(acao) {
  const nome = document.getElementById('cfgNomeVendedor').value;
  const meta = document.getElementById('cfgMeta').value;
  if (!nome) { alert('Informe o nome!'); return; }
  await apiCall('manageTeam', { acao, nome, meta });
  alert('✅ Feito!');
  carregarVendedores();
}

function abrirTransferenciaEmLote() {
  document.getElementById('modalTransferencia').classList.add('open');
}

async function executarTransferenciaLote() {
  const from = document.getElementById('transfOrigem').value;
  const to   = document.getElementById('transfDestino').value;
  if (!from || !to) { alert('Selecione origem e destino!'); return; }
  if (from === to)  { alert('Origem e destino iguais!'); return; }
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
  const offlineRoutes = ['addLead','updateStatus','addTask','registerAbsence'];
  if (!navigator.onLine && offlineRoutes.includes(route)) {
    syncQueue.push({ route, payload, timestamp: Date.now() });
    localStorage.setItem('mhnet_sync_queue', JSON.stringify(syncQueue));
    if (show) showLoading(false);
    return { status: 'success', local: true };
  }
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      body: JSON.stringify({ route, payload })
    });
    const json = await res.json();
    if (show) showLoading(false);
    return json;
  } catch(e) {
    if (show) showLoading(false);
    return { status: 'error', message: 'Conexão falhou' };
  }
}

// ============================================================
// LOADING
// ============================================================
function showLoading(state) {
  const el = document.getElementById('loader');
  if (el) el.classList.toggle('active', state);
}
