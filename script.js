'use strict';
const KEY = 'uniplan:v2';
const STATUS = { pending: 'Pendente', done: 'Concluída', late: 'Atrasada' };
const state = { tasks: [], subjects: [], cards: [], session: null, prefs: { view: 'dashboard', agenda: 'all', order: 'asc' } };

/* ---------- utilidades ---------- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => iso(new Date());
const addDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };
const parseDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }; // data local, sem erro de fuso
const fmt = s => parseDate(s).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
let noticeTimer;
function notify(msg, error) {
  const n = $('#notice');
  n.textContent = msg;
  n.className = 'notice' + (error ? ' error' : '');
  n.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { n.hidden = true; }, 6000);
}

/* ---------- persistência ---------- */
function seed() {
  const s = [['HTML e CSS', '#7c5cdb'], ['JavaScript', '#d9a03b'], ['Banco de Dados', '#2f9e8f'], ['Engenharia de Software', '#d9604b']]
    .map(([name, color]) => ({ id: uid(), name, color }));
  state.subjects = s;
  const t = (title, i, type, due, priority, done, desc) => ({ id: uid(), title, subjectId: s[i].id, type, due: addDays(due), priority, done, desc });
  state.tasks = [
    t('Hackathon UniPlan', 1, 'trabalho', 2, 'alta', false, 'Apresentação final do projeto.'),
    t('Prova de SQL', 2, 'prova', 5, 'alta', false, ''),
    t('Lista de exercícios 3', 2, 'exercício', 1, 'média', false, 'Joins e subconsultas.'),
    t('Diagrama de casos de uso', 3, 'trabalho', -2, 'média', false, ''),
    t('Resumo de Flexbox e Grid', 0, 'outro', -4, 'baixa', true, '')
  ];
  const c = (front, back, i, category, status = 'new') => ({ id: uid(), front, back, subjectId: s[i].id, category, status, reviews: status === 'new' ? 0 : 1 });
  state.cards = [
    c('O que é HTML semântico?', 'Uso de tags que descrevem o significado do conteúdo, como header, nav, main e footer.', 0, 'HTML', 'learned'),
    c('Para que serve o Flexbox?', 'Alinhar e distribuir itens em uma dimensão (linha ou coluna) dentro de um contêiner.', 0, 'CSS'),
    c('Qual a diferença entre Grid e Flexbox?', 'Grid organiza em duas dimensões (linhas e colunas); Flexbox em apenas uma.', 0, 'CSS'),
    c('O que é o DOM?', 'Representação em árvore da página que o JavaScript pode ler e modificar.', 1, 'DOM', 'practice'),
    c('Qual método seleciona o primeiro elemento que casa com um seletor CSS?', 'document.querySelector().', 1, 'DOM'),
    c('O que faz addEventListener?', 'Registra uma função para ser executada quando um evento ocorre em um elemento.', 1, 'Eventos'),
    c('Para que serve o localStorage?', 'Guardar pares chave/valor em texto no navegador, sem prazo de expiração.', 1, 'localStorage'),
    c('Como salvar um objeto no localStorage?', 'Converter com JSON.stringify e gravar com setItem; ler com getItem e JSON.parse.', 1, 'localStorage'),
    c('O que é uma função em JavaScript?', 'Bloco de código reutilizável que pode receber parâmetros e retornar um valor.', 1, 'Funções'),
    c('O que é uma chave primária?', 'Coluna (ou conjunto de colunas) que identifica de forma única cada linha da tabela.', 2, 'SQL'),
    c('Para que serve o comando SELECT?', 'Consultar e retornar dados de uma ou mais tabelas.', 2, 'SQL'),
    c('O que é um requisito funcional?', 'Descreve o que o sistema deve fazer.', 3, 'Requisitos')
  ];
}
function loadData() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) { seed(); saveData(); return; }
    const d = JSON.parse(raw);
    state.tasks = Array.isArray(d.tasks) ? d.tasks : [];
    state.subjects = Array.isArray(d.subjects) ? d.subjects : [];
    state.cards = Array.isArray(d.cards) ? d.cards : [];
    const ss = d.session;
    if (ss && Array.isArray(ss.queue)) {
      const ids = new Set(state.cards.map(c => c.id));
      ss.queue = ss.queue.filter(id => ids.has(id));
      if (ss.queue.length) { ss.idx = Math.min(Math.max(ss.idx | 0, 0), ss.queue.length - 1); ss.results = ss.results || {}; state.session = ss; }
    }
    const sv = $('#saved');
    if (sv) sv.textContent = 'Dados carregados do armazenamento do navegador';
    Object.assign(state.prefs, d.prefs || {});
  } catch (e) {
    notify('Não foi possível ler os dados salvos neste navegador. Os dados desta sessão não serão preservados.', true);
    if (!state.subjects.length) seed();
  }
}
function saveData() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ tasks: state.tasks, subjects: state.subjects, cards: state.cards, session: state.session, prefs: state.prefs }));
    const n = new Date(), el = $('#saved');
    if (el) el.textContent = `Salvo automaticamente às ${pad(n.getHours())}:${pad(n.getMinutes())}`;
  } catch (e) {
    notify('Não foi possível salvar: o armazenamento do navegador está indisponível ou cheio.', true);
  }
}
function refresh() { saveData(); renderAll(); }

/* ---------- regras de negócio ---------- */
const statusOf = t => t.done ? 'done' : (t.due < todayISO() ? 'late' : 'pending');
const subj = id => state.subjects.find(s => s.id === id) || { name: 'Sem disciplina', color: '#999999' };
function updateStatistics() {
  const st = { total: state.tasks.length, pending: 0, done: 0, late: 0, week: 0 };
  const limit = addDays(7), today = todayISO();
  state.tasks.forEach(t => {
    const s = statusOf(t);
    st[s]++;
    if (s === 'pending' && t.due >= today && t.due <= limit) st.week++;
  });
  st.pct = st.total ? Math.round(st.done / st.total * 100) : 0;
  st.cards = state.cards.length;
  st.cNew = state.cards.filter(x => x.status === 'new').length;
  st.cLearned = state.cards.filter(x => x.status === 'learned').length;
  st.cPractice = state.cards.filter(x => x.status === 'practice').length;
  st.cReviewed = st.cards - st.cNew;
  st.cPct = st.cards ? Math.round(st.cLearned / st.cards * 100) : 0;
  return st;
}
const byDate = dir => (a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.title.localeCompare(b.title)) * (dir === 'desc' ? -1 : 1);
function filterTasks() {
  const q = $('#q').value.trim().toLowerCase();
  const fs = $('#fl-status').value, fd = $('#fl-subject').value, fp = $('#fl-priority').value, ft = $('#fl-type').value;
  return state.tasks.filter(t =>
    (!q || t.title.toLowerCase().includes(q) || subj(t.subjectId).name.toLowerCase().includes(q)) &&
    (!fs || statusOf(t) === fs) && (!fd || t.subjectId === fd) && (!fp || t.priority === fp) && (!ft || t.type === ft)
  ).sort(byDate($('#order').value));
}

/* ---------- CRUD de atividades ---------- */
function addTask(data) { state.tasks.push({ id: uid(), done: false, ...data }); refresh(); notify('Atividade cadastrada.'); }
function editTask(id, data) {
  const t = state.tasks.find(x => x.id === id);
  if (t) Object.assign(t, data);
  refresh(); notify('Atividade atualizada.');
}
function deleteTask(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t || !confirm(`Excluir a atividade "${t.title}"? Esta ação não pode ser desfeita.`)) return;
  state.tasks = state.tasks.filter(x => x.id !== id);
  refresh(); notify('Atividade excluída.');
}
function toggleTaskStatus(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  t.done = !t.done;
  refresh(); notify(t.done ? 'Atividade concluída.' : 'Atividade reaberta.');
}

/* ---------- renderização ---------- */
function taskRow(t, full) {
  const st = statusOf(t), sb = subj(t.subjectId);
  const r = h('article', 'task' + (t.priority === 'alta' ? ' high' : '') + (st === 'late' ? ' late' : '') + (st === 'done' ? ' done' : ''));
  r.style.setProperty('--c', sb.color);
  const main = h('div', 'tmain');
  main.append(h('h3', 'ttitle', t.title));
  const meta = h('div', 'meta');
  const subjChip = h('span', 'chip subj', sb.name);
  subjChip.style.setProperty('--c', sb.color);
  meta.append(subjChip, h('span', 'chip', cap(t.type)), h('span', 'chip', 'Entrega ' + fmt(t.due)),
    h('span', 'chip' + (t.priority === 'alta' ? ' hi' : ''), 'Prioridade ' + t.priority), h('span', 'chip ' + st, STATUS[st]));
  main.append(meta);
  if (full && t.desc) main.append(h('p', 'desc', t.desc));
  r.append(main);
  const acts = h('div', 'acts');
  const btn = (txt, fn, cls) => { const b = h('button', 'btn small ' + cls, txt); b.type = 'button'; b.addEventListener('click', fn); return b; };
  acts.append(btn(t.done ? 'Reabrir' : 'Concluir', () => toggleTaskStatus(t.id), t.done ? 'ghost' : ''));
  if (full) acts.append(btn('Editar', () => openForm(t), 'ghost'), btn('Excluir', () => deleteTask(t.id), 'ghost danger'));
  r.append(acts);
  return r;
}
function emptyState(msg, label, fn) {
  const e = h('div', 'empty');
  e.append(h('p', '', msg));
  if (label) { const b = h('button', 'btn', label); b.type = 'button'; b.addEventListener('click', fn); e.append(b); }
  return e;
}
function renderDashboard() {
  const hr = new Date().getHours();
  $('#greeting').textContent = (hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite') + ', estudante!';
  $('#today').textContent = cap(new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  const s = updateStatistics();
  $('#s-total').textContent = s.total; $('#s-pending').textContent = s.pending;
  $('#s-done').textContent = s.done; $('#s-late').textContent = s.late;
  $('#s-cards').textContent = s.cards; $('#s-cnew').textContent = s.cNew;
  $('#ring2').style.setProperty('--v', s.cPct);
  $('#pct2').textContent = s.cPct + '%';
  $('#progressText2').textContent = s.cards ? `${s.cLearned} aprendido(s) · ${s.cReviewed} de ${s.cards} revisado(s)` : 'Crie flashcards para acompanhar sua revisão.';
  $('#ring').style.setProperty('--v', s.pct);
  $('#pct').textContent = s.pct + '%';
  $('#progressText').textContent = s.total ? `${s.done} de ${s.total} atividades concluídas` : 'Cadastre atividades para acompanhar seu progresso.';
  $('#upcomingInfo').textContent = s.week ? `${s.week} entrega(s) nos próximos 7 dias` : 'Nenhuma entrega nos próximos 7 dias.';
  const box = $('#upcoming');
  box.replaceChildren();
  const next = state.tasks.filter(t => !t.done).sort(byDate('asc')).slice(0, 5);
  if (!next.length) box.append(emptyState(s.total ? 'Tudo em dia! Nenhuma atividade pendente.' : 'Você ainda não tem atividades.', 'Nova atividade', () => openForm()));
  else next.forEach(t => box.append(taskRow(t, false)));
}
function fillSubjectSelects() {
  const f = $('#fl-subject'), cur = f.value, t = $('#t-subject'), curT = t.value;
  f.replaceChildren(new Option('Todas as disciplinas', ''));
  t.replaceChildren(new Option('Selecione...', ''));
  state.subjects.forEach(s => { f.append(new Option(s.name, s.id)); t.append(new Option(s.name, s.id)); });
  f.value = state.subjects.some(s => s.id === cur) ? cur : '';
  t.value = state.subjects.some(s => s.id === curT) ? curT : '';
}
function renderTasks() {
  const list = $('#taskList'), items = filterTasks();
  list.replaceChildren();
  $('#taskCount').textContent = `${items.length} de ${state.tasks.length} atividade(s)`;
  if (!state.tasks.length) list.append(emptyState('Nenhuma atividade cadastrada ainda.', 'Cadastrar primeira atividade', () => openForm()));
  else if (!items.length) list.append(emptyState('Nenhuma atividade corresponde aos filtros.', 'Limpar filtros', clearFilters));
  else items.forEach(t => list.append(taskRow(t, true)));
}
function renderAgenda() {
  const box = $('#agendaList'), mode = state.prefs.agenda, today = todayISO();
  $$('.seg button').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  box.replaceChildren();
  const items = state.tasks.filter(t => mode === 'all' || (!t.done && t.due >= today)).sort(byDate('asc'));
  if (!items.length) { box.append(emptyState(mode === 'all' ? 'A agenda está vazia.' : 'Nenhuma entrega próxima.', 'Nova atividade', () => openForm())); return; }
  const groups = new Map();
  items.forEach(t => { if (!groups.has(t.due)) groups.set(t.due, []); groups.get(t.due).push(t); });
  groups.forEach((arr, date) => {
    const day = h('div', 'day');
    const title = h('h3', '', cap(parseDate(date).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })));
    if (date === today) title.append(h('em', '', 'Hoje'));
    else if (date === addDays(1)) title.append(h('em', '', 'Amanhã'));
    day.append(title);
    const l = h('div', 'list');
    arr.forEach(t => l.append(taskRow(t, true)));
    day.append(l); box.append(day);
  });
}
function renderSubjects() {
  const box = $('#subjectList');
  box.replaceChildren();
  if (!state.subjects.length) { box.append(emptyState('Nenhuma disciplina cadastrada. Adicione uma acima para criar atividades.')); return; }
  state.subjects.forEach(s => {
    const n = state.tasks.filter(t => t.subjectId === s.id).length, nc = state.cards.filter(c => c.subjectId === s.id).length;
    const r = h('article', 'task');
    r.style.setProperty('--c', s.color);
    const main = h('div', 'tmain');
    main.style.display = 'flex'; main.style.alignItems = 'center'; main.style.gap = '12px';
    const dot = h('span', 'dot'); dot.style.setProperty('--c', s.color);
    const info = h('div');
    info.append(h('h3', 'ttitle', s.name), h('p', 'muted', `${n} tarefa(s) · ${nc} flashcard(s)`));
    main.append(dot, info); r.append(main);
    const b = h('button', 'btn small ghost danger', 'Excluir'); b.type = 'button';
    b.addEventListener('click', () => deleteSubject(s.id));
    r.append(b); box.append(r);
  });
}
function renderAll() { fillSubjectSelects(); renderDashboard(); renderTasks(); renderAgenda(); renderSubjects(); fillCardSelects(); renderFlashcards(); renderStudySession(); }
function showView(v) {
  state.prefs.view = v;
  $$('.view').forEach(s => { s.hidden = s.id !== 'view-' + v; });
  $$('#nav button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  saveData();
}

/* ---------- disciplinas ---------- */
function addSubject(e) {
  e.preventDefault();
  const name = $('#sub-name').value.trim(), err = $('#sub-error');
  err.textContent = '';
  if (!name) { err.textContent = 'Informe o nome da disciplina.'; return; }
  if (state.subjects.some(s => s.name.toLowerCase() === name.toLowerCase())) { err.textContent = 'Essa disciplina já existe.'; return; }
  state.subjects.push({ id: uid(), name, color: $('#sub-color').value });
  $('#sub-name').value = '';
  refresh(); notify('Disciplina adicionada.');
}
function deleteSubject(id) {
  const s = state.subjects.find(x => x.id === id);
  const n = state.tasks.filter(t => t.subjectId === id).length + state.cards.filter(c => c.subjectId === id).length;
  if (n) { notify(`Não é possível excluir "${s.name}": ela está vinculada a ${n} item(ns) (tarefas ou flashcards). Exclua ou edite esses itens primeiro.`, true); return; }
  if (!confirm(`Excluir a disciplina "${s.name}"?`)) return;
  state.subjects = state.subjects.filter(x => x.id !== id);
  refresh(); notify('Disciplina excluída.');
}

/* ---------- formulário ---------- */
function openForm(task) {
  if (!state.subjects.length) { showView('subjects'); notify('Cadastre uma disciplina antes de criar atividades.', true); return; }
  $('#taskForm').reset();
  $$('#taskForm .err').forEach(e => { e.textContent = ''; });
  $('#t-id').value = task ? task.id : '';
  $('#dlgTitle').textContent = task ? 'Editar atividade' : 'Nova atividade';
  if (task) {
    $('#t-title').value = task.title; $('#t-subject').value = task.subjectId; $('#t-type').value = task.type;
    $('#t-priority').value = task.priority; $('#t-date').value = task.due; $('#t-desc').value = task.desc || '';
  }
  $('#dlg').showModal();
  $('#t-title').focus();
}
function submitTask(e) {
  e.preventDefault();
  const data = {
    title: $('#t-title').value.trim(), subjectId: $('#t-subject').value, type: $('#t-type').value,
    priority: $('#t-priority').value, due: $('#t-date').value, desc: $('#t-desc').value.trim()
  };
  $('#e-title').textContent = data.title ? '' : 'Informe o título da atividade.';
  $('#e-subject').textContent = data.subjectId ? '' : 'Escolha uma disciplina.';
  $('#e-date').textContent = data.due ? '' : 'Informe a data de entrega.';
  if (!data.title || !data.subjectId || !data.due) return;
  const id = $('#t-id').value;
  if (id) editTask(id, data); else addTask(data);
  $('#taskForm').reset();
  $('#dlg').close();
}
function clearFilters() {
  $('#q').value = '';
  ['#fl-status', '#fl-subject', '#fl-priority', '#fl-type'].forEach(s => { $(s).value = ''; });
  renderTasks();
}

/* ---------- inicialização ---------- */
function init() {
  loadData();
  initCards();
  $('#order').value = state.prefs.order === 'desc' ? 'desc' : 'asc';
  $('#newTask').addEventListener('click', () => openForm());
  $('#cancel').addEventListener('click', () => $('#dlg').close());
  $('#taskForm').addEventListener('submit', submitTask);
  $('#subjectForm').addEventListener('submit', addSubject);
  $('#clear').addEventListener('click', clearFilters);
  $('#q').addEventListener('input', renderTasks);
  ['#fl-status', '#fl-subject', '#fl-priority', '#fl-type'].forEach(s => $(s).addEventListener('change', renderTasks));
  $('#order').addEventListener('change', () => { state.prefs.order = $('#order').value; saveData(); renderTasks(); });
  $$('#nav button').forEach(b => b.addEventListener('click', () => showView(b.dataset.view)));
  $$('.seg button').forEach(b => b.addEventListener('click', () => { state.prefs.agenda = b.dataset.mode; saveData(); renderAgenda(); }));
  renderAll();
  showView(['dashboard', 'tasks', 'agenda', 'subjects', 'cards', 'study'].includes(state.prefs.view) ? state.prefs.view : 'dashboard');
}
document.addEventListener('DOMContentLoaded', init);

/* ---------- flashcards ---------- */
const CSTATUS = { new: 'Não revisado', learned: 'Aprendido', practice: 'Precisa de prática' };
function mkBtn(txt, fn, cls) { const b = h('button', 'btn small ' + cls, txt); b.type = 'button'; b.addEventListener('click', fn); return b; }
function fillCardSelects() {
  [['#c-subject', 'Selecione...'], ['#cf-subject', 'Todas as disciplinas'], ['#rs-subject', 'Todas as disciplinas']].forEach(([sel, first]) => {
    const el = $(sel), cur = el.value;
    el.replaceChildren(new Option(first, ''));
    state.subjects.forEach(s => el.append(new Option(s.name, s.id)));
    el.value = state.subjects.some(s => s.id === cur) ? cur : '';
  });
  const cat = $('#cf-category'), curC = cat.value;
  cat.replaceChildren(new Option('Todas as categorias', ''));
  [...new Set(state.cards.map(c => c.category).filter(Boolean))].sort().forEach(c => cat.append(new Option(c, c)));
  cat.value = [...cat.options].some(o => o.value === curC) ? curC : '';
}
function filterFlashcards() {
  const q = $('#cf-q').value.trim().toLowerCase(), fd = $('#cf-subject').value, fc = $('#cf-category').value, fs = $('#cf-status').value;
  return state.cards.filter(c => (!q || c.front.toLowerCase().includes(q)) && (!fd || c.subjectId === fd) && (!fc || c.category === fc) && (!fs || c.status === fs));
}
function flipCard(c, big) {
  const wrap = h('div', 'flipcard' + (big ? ' big' : ''));
  wrap.tabIndex = 0;
  wrap.setAttribute('role', 'button');
  wrap.setAttribute('aria-pressed', 'false');
  wrap.setAttribute('aria-label', 'Virar cartão');
  const inner = h('div', 'inner');
  const face = (cls, label, txt, hint) => { const f = h('div', 'face ' + cls); f.append(h('small', 'tag', label), h('p', 'ftext', txt), h('small', 'hint', hint)); return f; };
  const front = face('front', 'Pergunta', c.front, 'Clique para ver a resposta');
  const back = face('back', 'Resposta', c.back, 'Clique para voltar à pergunta');
  back.setAttribute('aria-hidden', 'true');
  inner.append(front, back);
  wrap.append(inner);
  wrap.toggle = force => {
    const on = force === undefined ? !wrap.classList.contains('flipped') : force;
    wrap.classList.toggle('flipped', on);
    wrap.setAttribute('aria-pressed', String(on));
    front.setAttribute('aria-hidden', String(on));
    back.setAttribute('aria-hidden', String(!on));
    if (wrap._onflip) wrap._onflip(on);
  };
  wrap.addEventListener('click', () => wrap.toggle());
  wrap.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); wrap.toggle(); } });
  return wrap;
}
function cardEl(c) {
  const sb = subj(c.subjectId), el = h('article', 'fcard');
  const meta = h('div', 'meta'), sc = h('span', 'chip subj', sb.name), acts = h('div', 'acts'), fc = flipCard(c, false);
  sc.style.setProperty('--c', sb.color);
  meta.append(sc);
  if (c.category) meta.append(h('span', 'chip', c.category));
  meta.append(h('span', 'chip st-' + c.status, CSTATUS[c.status]));
  const flip = mkBtn('Ver resposta', () => fc.toggle(), 'ghost');
  fc._onflip = on => { flip.textContent = on ? 'Ver pergunta' : 'Ver resposta'; };
  acts.append(flip, mkBtn('Sei', () => recordFlashcardResult(c.id, 'learned'), ''),
    mkBtn('Ainda estou aprendendo', () => recordFlashcardResult(c.id, 'practice'), 'ghost'),
    mkBtn('Editar', () => openCardForm(c), 'ghost'), mkBtn('Excluir', () => deleteFlashcard(c.id), 'ghost danger'));
  el.append(meta, fc, acts);
  return el;
}
function renderFlashcards() {
  const s = updateStatistics(), list = $('#cardList'), items = filterFlashcards();
  $('#fs-total').textContent = s.cards; $('#fs-reviewed').textContent = s.cReviewed;
  $('#fs-learned').textContent = s.cLearned; $('#fs-practice').textContent = s.cPractice; $('#fs-pct').textContent = s.cPct + '%';
  $('#cardCount').textContent = `${items.length} de ${state.cards.length} flashcard(s)`;
  list.replaceChildren();
  if (!state.cards.length) list.append(emptyState('Nenhum flashcard criado ainda.', 'Criar primeiro flashcard', () => openCardForm()));
  else if (!items.length) list.append(emptyState('Nenhum flashcard corresponde aos filtros.'));
  else items.forEach(c => list.append(cardEl(c)));
}
function createFlashcard(data) { state.cards.push({ id: uid(), status: 'new', reviews: 0, ...data }); refresh(); notify('Flashcard criado.'); }
function editFlashcard(id, data) {
  const c = state.cards.find(x => x.id === id);
  if (c) Object.assign(c, data);
  refresh(); notify('Flashcard atualizado.');
}
function deleteFlashcard(id) {
  const c = state.cards.find(x => x.id === id);
  if (!c || !confirm(`Excluir o flashcard "${c.front}"? Esta ação não pode ser desfeita.`)) return;
  state.cards = state.cards.filter(x => x.id !== id);
  state.session = null;
  refresh(); notify('Flashcard excluído.');
}
function recordFlashcardResult(id, result, inSession) {
  const c = state.cards.find(x => x.id === id);
  if (!c) return;
  c.status = result; c.reviews = (c.reviews || 0) + 1;
  if (inSession && state.session) { state.session.results[id] = result; state.session.streak = result === 'learned' ? (state.session.streak || 0) + 1 : 0; }
  refresh();
}
function openCardForm(card) {
  if (!state.subjects.length) { showView('subjects'); notify('Cadastre uma disciplina antes de criar flashcards.', true); return; }
  $('#cardForm').reset();
  $$('#cardForm .err').forEach(e => { e.textContent = ''; });
  $('#c-id').value = card ? card.id : '';
  $('#cdlgTitle').textContent = card ? 'Editar flashcard' : 'Novo flashcard';
  if (card) { $('#c-front').value = card.front; $('#c-back').value = card.back; $('#c-subject').value = card.subjectId; $('#c-category').value = card.category || ''; }
  $('#cdlg').showModal();
  $('#c-front').focus();
}
function submitCard(e) {
  e.preventDefault();
  const data = { front: $('#c-front').value.trim(), back: $('#c-back').value.trim(), subjectId: $('#c-subject').value, category: $('#c-category').value.trim() };
  $('#e-cfront').textContent = data.front ? '' : 'Escreva a pergunta ou conceito.';
  $('#e-cback').textContent = data.back ? '' : 'Escreva a resposta.';
  $('#e-csub').textContent = data.subjectId ? '' : 'Escolha uma disciplina.';
  if (!data.front || !data.back || !data.subjectId) return;
  const id = $('#c-id').value;
  if (id) editFlashcard(id, data); else createFlashcard(data);
  $('#cardForm').reset();
  $('#cdlg').close();
}

/* ---------- sessão de revisão ---------- */
let studyBusy = false;
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const k = Math.floor(Math.random() * (i + 1)); [a[i], a[k]] = [a[k], a[i]]; } return a; }
function syncStudy() { saveData(); renderStudySession(); }
function startStudySession() {
  const fd = $('#rs-subject').value, fs = $('#rs-status').value;
  const queue = state.cards.filter(c => (!fd || c.subjectId === fd) && (!fs || c.status === fs)).map(c => c.id);
  if (!queue.length) { notify('Nenhum flashcard corresponde a essa seleção.', true); return; }
  if ($('#rs-shuffle').checked) shuffle(queue);
  state.session = { queue, idx: 0, revealed: false, results: {}, finished: false, streak: 0 };
  syncStudy();
}
function revealAnswer() { const w = $('#studyBox .flipcard'); if (w) w.toggle(); }
function nextFlashcard() {
  const s = state.session;
  if (!s) return;
  if (s.idx >= s.queue.length - 1) { finishStudySession(); return; }
  s.idx++; s.revealed = false; syncStudy();
}
function prevFlashcard() {
  const s = state.session;
  if (s && s.idx > 0) { s.idx--; s.revealed = false; syncStudy(); }
}
function answerSession(result) {
  const s = state.session;
  if (!s || studyBusy) return;
  studyBusy = true;
  const stage = $('#studyBox .stage');
  if (stage) stage.classList.add(result === 'learned' ? 'out-right' : 'out-left');
  setTimeout(() => {
    studyBusy = false;
    if (state.session !== s) return;
    recordFlashcardResult(s.queue[s.idx], result, true);
    nextFlashcard();
  }, 260);
}
function finishStudySession() { if (state.session) { state.session.finished = true; syncStudy(); } }
function endStudySession() { state.session = null; syncStudy(); }
function summaryEl(s) {
  const vals = Object.values(s.results), learned = vals.filter(v => v === 'learned').length;
  const pct = vals.length ? Math.round(learned / vals.length * 100) : 0;
  const card = h('div', 'card study summary'), grid = h('div', 'sum'), acts = h('div', 'acts center');
  const ring = h('div', 'ring');
  ring.style.setProperty('--v', pct);
  ring.append(h('span', '', pct + '%'));
  card.append(h('h2', '', 'Resumo da sessão'), ring, h('p', 'muted', vals.length ? 'Taxa de acerto nesta sessão.' : 'Nenhum cartão foi respondido nesta sessão.'));
  [['Revisados', vals.length], ['Aprendidos', learned], ['Precisam de prática', vals.length - learned]].forEach(([l, n]) => {
    const b = h('div', 'card stat');
    b.append(h('strong', '', String(n)), h('span', 'muted', l));
    grid.append(b);
  });
  acts.append(mkBtn('Nova sessão', endStudySession, ''), mkBtn('Ver flashcards', () => showView('cards'), 'ghost'));
  card.append(grid, acts);
  return card;
}
function renderStudySession() {
  const box = $('#studyBox'), s = state.session;
  box.replaceChildren();
  $('#setup').hidden = !!s || !state.cards.length;
  if (!state.cards.length) { box.append(emptyState('Você ainda não tem flashcards para revisar.', 'Criar primeiro flashcard', () => openCardForm())); return; }
  if (!s) return;
  if (s.finished) { box.append(summaryEl(s)); return; }
  const c = state.cards.find(x => x.id === s.queue[s.idx]);
  if (!c) { state.session = null; renderStudySession(); return; }
  const sb = subj(c.subjectId), wrap = h('div', 'study'), top = h('div', 'studytop');
  const bar = h('div', 'bar'), fill = h('span'), meta = h('div', 'meta center'), sc = h('span', 'chip subj', sb.name);
  top.append(h('span', 'muted', `Cartão ${s.idx + 1} de ${s.queue.length}`), h('span', 'chip streak', 'Sequência ×' + (s.streak || 0)));
  fill.style.width = Math.round(s.idx / s.queue.length * 100) + '%';
  bar.append(fill);
  sc.style.setProperty('--c', sb.color);
  meta.append(sc);
  if (c.category) meta.append(h('span', 'chip', c.category));
  if (s.results[c.id]) meta.append(h('span', 'chip st-' + s.results[c.id], 'Marcado: ' + CSTATUS[s.results[c.id]]));
  const stage = h('div', 'stage enter'), fc = flipCard(c, true);
  stage.append(fc);
  const reveal = mkBtn(s.revealed ? 'Ver pergunta' : 'Ver resposta', revealAnswer, 'ghost');
  const answers = h('div', 'acts center');
  answers.append(mkBtn('Sei', () => answerSession('learned'), ''), mkBtn('Ainda estou aprendendo', () => answerSession('practice'), 'ghost'));
  answers.hidden = !s.revealed;
  if (s.revealed) fc.toggle(true);
  fc._onflip = on => { s.revealed = on; answers.hidden = !on; reveal.textContent = on ? 'Ver pergunta' : 'Ver resposta'; };
  const nav = h('div', 'acts center'), prev = mkBtn('Anterior', prevFlashcard, 'ghost');
  prev.disabled = s.idx === 0;
  nav.append(reveal, prev, mkBtn(s.idx === s.queue.length - 1 ? 'Finalizar' : 'Próximo', nextFlashcard, 'ghost'), mkBtn('Encerrar sessão', finishStudySession, 'ghost danger'));
  wrap.append(top, bar, meta, stage, answers, nav, h('p', 'muted kb', 'Atalhos: Espaço vira o cartão, setas navegam, S = sei, N = ainda estou aprendendo.'));
  box.append(wrap);
}
function initCards() {
  $('#cf-new').addEventListener('click', () => openCardForm());
  $('#cf-clear').addEventListener('click', () => { $('#cf-q').value = ''; ['#cf-subject', '#cf-category', '#cf-status'].forEach(s => { $(s).value = ''; }); renderFlashcards(); });
  $('#cf-q').addEventListener('input', renderFlashcards);
  ['#cf-subject', '#cf-category', '#cf-status'].forEach(s => $(s).addEventListener('change', renderFlashcards));
  $('#cardForm').addEventListener('submit', submitCard);
  $('#c-cancel').addEventListener('click', () => $('#cdlg').close());
  $('#rs-start').addEventListener('click', startStudySession);
  $('#qa-task').addEventListener('click', () => openForm());
  $('#qa-card').addEventListener('click', () => openCardForm());
  $('#qa-study').addEventListener('click', () => showView('study'));
  document.addEventListener('keydown', e => {
    const s = state.session;
    if (state.prefs.view !== 'study' || !s || s.finished || $('#dlg').open || $('#cdlg').open) return;
    const t = e.target;
    if (/INPUT|TEXTAREA|SELECT/.test(t.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === ' ') { if (t.closest('button') || t.classList.contains('flipcard')) return; e.preventDefault(); revealAnswer(); }
    else if (k === 'arrowright') nextFlashcard();
    else if (k === 'arrowleft') prevFlashcard();
    else if (k === 's' && s.revealed) answerSession('learned');
    else if (k === 'n' && s.revealed) answerSession('practice');
  });
}