const state = {
  route: 'dashboard',
  adminSub: 'projects',
  me: null,
  meta: null,
  filters: {},
  pagination: {}
};

const navItems = [
  ['dashboard', '首页'],
  ['requests', 'AI需求管理'],
  ['assets', 'AI资产管理'],
  ['learning', '学习天地'],
  ['approvals', '待办事项'],
  ['admin', '系统管理']
];

const hiddenRoutes = ['messages'];

const app = document.querySelector('#app');
const nav = document.querySelector('#nav');
const modal = document.querySelector('#modal');
const toast = document.querySelector('#toast');
const userChip = document.querySelector('#userChip');
const messageButton = document.querySelector('#messageButton');
const messageDot = document.querySelector('#messageDot');

boot();

async function boot() {
  bindGlobalEvents();
  await loadBase();
  routeFromHash();
  renderNav();
  await render();
}

function bindGlobalEvents() {
  window.addEventListener('hashchange', async () => {
    routeFromHash();
    renderNav();
    await render();
  });

  app.addEventListener('click', async (event) => {
    const target = event.target.closest('[data-action]');
    if (!target) return;
    const action = target.dataset.action;
    const id = target.dataset.id ? Number(target.dataset.id) : null;

    if (action === 'new-request') return openRequestModal();
    if (action === 'edit-request') return openRequestModal(id);
    if (action === 'claim-request') return claimRequest(id);
    if (action === 'delete-request') return deleteRequest(id);
    if (action === 'new-asset') return openAssetModal();
    if (action === 'edit-asset') return openAssetModal(id);
    if (action === 'view-asset-detail') return openAssetDetailModal(id);
    if (action === 'show-asset-preview') return showAssetPreview(id);
    if (action === 'request-access') return requestAssetAccess(id);
    if (action === 'open-asset') return openAsset(id);
    if (action === 'retire-asset') return retireAsset(id);
    if (action === 'open-message') return openMessage(id, target.dataset.route);
    if (action === 'approve-access') return reviewAccessRequest(id, 'approved');
    if (action === 'reject-access') return reviewAccessRequest(id, 'rejected');
    if (action === 'page-go') return changePage(target.dataset.pageKey, target.dataset.page);
    if (action === 'admin-sub') {
      state.adminSub = target.dataset.sub;
      return renderAdmin();
    }
    if (action === 'new-project') return openProjectModal();
    if (action === 'edit-project') return openProjectModal(id);
    if (action === 'new-user') return openUserModal();
    if (action === 'edit-user') return openUserModal(id);
    if (action === 'delete-user') return deleteUser(id);
    if (action === 'edit-parameter') return openParameterModal(target.dataset.kind, id);
    if (action === 'delete-parameter') return deleteParameter(target.dataset.kind, id);
    if (action === 'knowledge-search') return knowledgeSearch();
  });

  app.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    if (form.id === 'requestFilters') {
      resetPage('requests');
      return renderRequests();
    }
    if (form.id === 'assetFilters') {
      resetPage('assets');
      return renderAssets();
    }
    if (form.id === 'learningFilters') {
      resetPage('learningMaterials');
      return renderLearning();
    }
    if (form.id === 'projectFilters') {
      resetPage('adminProjects');
      return renderAdmin();
    }
    if (form.id === 'userFilters') {
      resetPage('adminUsers');
      return renderAdmin();
    }
  });

  app.addEventListener('change', async (event) => {
    const target = event.target.closest('[data-action="page-size"]');
    if (!target) return;
    await changePageSize(target.dataset.pageKey, target.value);
  });

  messageButton.addEventListener('click', () => {
    location.hash = 'messages';
  });
}

async function loadBase() {
  const [me, meta] = await Promise.all([api('/api/me'), api('/api/meta')]);
  state.me = me.user;
  state.meta = meta;
  userChip.textContent = state.me ? `${state.me.chinese_name} | ${state.me.role === 'admin' ? 'Admin' : 'User'}` : 'Guest';
  refreshMessageDot();
}

function routeFromHash() {
  const hash = location.hash.replace('#', '');
  state.route = navItems.some(([key]) => key === hash) || hiddenRoutes.includes(hash) ? hash : 'dashboard';
}

function renderNav() {
  nav.innerHTML = navItems.map(([key, label]) => `<button class="${state.route === key ? 'active' : ''}" data-route="${key}">${label}</button>`).join('');
  nav.querySelectorAll('button').forEach((button) => {
    button.addEventListener('click', () => {
      location.hash = button.dataset.route;
    });
  });
}

async function render() {
  if (state.route === 'dashboard') return renderDashboard();
  if (state.route === 'requests') return renderRequests();
  if (state.route === 'assets') return renderAssets();
  if (state.route === 'learning') return renderLearning();
  if (state.route === 'messages') return renderMessages();
  if (state.route === 'approvals') return renderApprovals();
  return renderAdmin();
}

async function renderDashboard() {
  const data = await api('/api/dashboard');
  app.innerHTML = `
    ${pageHead('首页 Dashboard', '集中查看 AI 需求、AI 资产、项目和用户的运营概况，并快速进入常用工作。', `
      <button class="btn" data-action="new-request">新增AI需求</button>
      <button class="btn secondary" data-action="new-asset">发布AI资产</button>
      <button class="btn secondary" onclick="location.hash='learning'">学习天地</button>
    `)}
    <div class="grid cols-4">
      ${statCard('AI 资产统计', data.stats.total_assets, `在线 ${data.stats.online_assets} / 注销 ${data.stats.retired_assets}`)}
      ${statCard('AI 需求统计', `${data.stats.active_requests} / ${data.stats.total_requests}`, '流程中 / 总需求')}
      ${statCard('项目个数', data.stats.projects, '已维护项目')}
      ${statCard('用户数', data.stats.users, '平台注册用户')}
    </div>
    <div class="grid cols-3 mt">
      <section class="panel">
        <div class="panel-title">资产按项目类型</div>
        <div class="panel-body"><div class="chart-box" id="projectTypeChart"></div></div>
      </section>
      <section class="panel">
        <div class="panel-title">AI 资产类型</div>
        <div class="panel-body"><div class="chart-box tall" id="assetTypeChart"></div></div>
      </section>
      <section class="panel">
        <div class="panel-title">需求按进度</div>
        <div class="panel-body"><div class="chart-box" id="requestStatusChart"></div></div>
      </section>
    </div>
    <section class="panel mt">
      <div class="panel-title">热门 AI 资产入口 <span class="label">Top 8 by views</span></div>
      <div class="panel-body">
        <div class="asset-grid">${data.hotAssets.map(assetCard).join('')}</div>
      </div>
    </section>
  `;
  renderDashboardCharts(data);
}

async function renderRequests() {
  const form = new FormData(document.querySelector('#requestFilters') || undefined);
  const params = new URLSearchParams({
    search: form.get('search') || state.filters.requestSearch || '',
    tagId: form.get('tagId') || '',
    status: form.get('status') || '',
    handlerId: form.get('handlerId') || ''
  });
  const data = await api(`/api/requests?${params}`);
  app.innerHTML = `
    ${pageHead('AI需求列表', '支持按编号、名称、登记人、受理人、项目、WBS、O2E、类型和状态检索需求。', `
      <button class="btn" data-action="new-request">新增AI需求</button>
      <button class="btn secondary" onclick="window.print()">导出列表</button>
    `)}
    <form class="filter" id="requestFilters">
      <input name="search" placeholder="输入编号/名称/客户/项目，支持模糊搜索" value="${h(params.get('search'))}">
      <select name="tagId"><option value="">全部类型标签</option>${options(state.meta.tags, params.get('tagId'))}</select>
      <select name="status">${statusOptions(params.get('status'))}</select>
      <select name="handlerId"><option value="">全部受理人</option>${userOptions(params.get('handlerId'))}</select>
      <button class="btn">查询</button>
    </form>
    ${table(
      ['需求编号', '需求名称', '类型', '登记人', '受理人', '客户名称', '项目名称', 'WBS', 'O2E', '状态', '操作'],
      data.requests.map((r) => [
        h(r.request_code),
        h(r.title),
        tagList(r.tags),
        h(r.requester_name || '-'),
        h(r.handler_name || '未认领'),
        h(r.customer_name || '无项目'),
        h(r.project_name || '无项目关联'),
        h(r.wbs_code || '-'),
        h(r.o2e_code || '-'),
        statusBadge(r.status),
        requestActions(r)
      ]),
      { pageKey: 'requests' }
    )}
  `;
}

async function renderAssets() {
  const form = new FormData(document.querySelector('#assetFilters') || undefined);
  const params = new URLSearchParams({
    search: form.get('search') || '',
    categoryId: form.get('categoryId') || '',
    visibility: form.get('visibility') || '',
    status: form.get('status') || 'online'
  });
  const data = await api(`/api/assets?${params}`);
  app.innerHTML = `
    ${pageHead('AI资产中心', '管理公开资产、非公开资产访问申请、资产发布、浏览量统计和注销。', `
      <button class="btn" data-action="new-asset">发布AI资产</button>
      <button class="btn secondary">访问申请审批</button>
    `)}
    <form class="filter" id="assetFilters">
      <input name="search" placeholder="搜索资产名称、负责人、描述" value="${h(params.get('search'))}">
      <select name="categoryId"><option value="">全部资产分类</option>${options(state.meta.assetCategories, params.get('categoryId'))}</select>
      <select name="visibility"><option value="">全部公开状态</option><option value="public" ${selected(params.get('visibility'), 'public')}>公开</option><option value="private" ${selected(params.get('visibility'), 'private')}>非公开</option></select>
      <select name="status"><option value="online" ${selected(params.get('status'), 'online')}>在线资产</option><option value="retired" ${selected(params.get('status'), 'retired')}>注销资产</option><option value="">全部状态</option></select>
      <button class="btn">查询</button>
    </form>
    <div class="asset-grid">${data.assets.slice(0, 4).map(assetCard).join('')}</div>
    <section class="asset-list mt">
      ${table(
        ['资产名称', '资产描述', '负责人', '分类', '公开状态', '当前状态', '浏览量', '操作'],
        data.assets.map((a) => [
          h(a.asset_name),
          clippedText(a.description || '-'),
          h(a.owner_name || '-'),
          h(a.category_name || '-'),
          a.visibility === 'public' ? badge('公开') : badge('非公开', 'warn'),
          a.status === 'online' ? badge('在线') : badge('注销', 'off'),
          h(a.views),
          assetActions(a)
        ]),
        { pageKey: 'assets' }
      )}
    </section>
  `;
}

async function renderLearning() {
  const form = new FormData(document.querySelector('#learningFilters') || undefined);
  const params = new URLSearchParams({
    search: form.get('search') || '',
    category: form.get('category') || ''
  });
  const data = await api(`/api/learning-materials?${params}`);
  const categories = [...new Set(data.materials.map((m) => m.category))];
  app.innerHTML = `
    ${pageHead('学习天地', '集中浏览资料、云文档和知识库内容，并通过 AI 接口查询维护资料中的文本信息。', `
      <button class="btn secondary">上传资料</button>
      <button class="btn secondary">维护外部链接</button>
    `)}
    <form class="filter" id="learningFilters">
      <input name="search" placeholder="搜索资料名称、描述、关键词" value="${h(params.get('search'))}">
      <select name="category"><option value="">全部资料分类</option>${categories.map((x) => `<option value="${h(x)}" ${selected(params.get('category'), x)}>${h(x)}</option>`).join('')}</select>
      <select><option>文件与云文档</option></select>
      <select><option>最近维护</option></select>
      <button class="btn">检索</button>
    </form>
    <div class="grid cols-wide">
      <section>
        ${pagedCards(data.materials, materialCard, 'learningMaterials', 'material-grid')}
      </section>
      <section class="panel">
        <div class="panel-title">知识库 AI 查询</div>
        <div class="panel-body">
          <textarea id="knowledgeQuestion" placeholder="输入你的问题，例如：AI资产发布需要哪些信息？"></textarea>
          <button class="btn mt" data-action="knowledge-search">查询知识库</button>
          <div id="knowledgeAnswer" class="time-item mt">查询结果会显示在这里。</div>
        </div>
      </section>
    </div>
  `;
}

async function renderMessages() {
  const data = await api('/api/messages');
  setMessageUnread(data.unread);
  app.innerHTML = `
    ${pageHead('消息中心', '查看资产访问申请、审批结果和系统提醒。点击消息可进入对应处理页面。', `
      <button class="btn secondary" onclick="location.hash='approvals'">进入待办事项</button>
    `)}
    ${table(
      ['状态', '标题', '内容', '发送人', '时间', '操作'],
      data.messages.map((m) => [
        m.read_at ? badge('已读') : badge('未读', 'warn'),
        h(m.title),
        h(m.message),
        h(m.actor_name || '系统'),
        h(formatTime(m.created_at)),
        `<button class="btn slim secondary" data-action="open-message" data-id="${m.id}" data-route="${h(m.target_route || '#approvals')}">查看</button>`
      ]),
      { pageKey: 'messages' }
    )}
  `;
}

async function renderApprovals() {
  const data = await api('/api/asset-access-requests');
  app.innerHTML = `
    ${pageHead('待办事项', '资产负责人可以审批自己负责资产的访问申请，管理员可以处理全部申请。', `
      <button class="btn secondary" onclick="location.hash='messages'">返回消息</button>
    `)}
    ${table(
      ['资产名称', '申请人', '申请理由', '状态', '审批人', '申请时间', '操作'],
      data.accessRequests.map((r) => [
        h(r.asset_name),
        `${h(r.requester_name)} / ${h(r.requester_english_name || '')}`,
        h(r.reason || '-'),
        accessStatusBadge(r.status),
        h(r.reviewer_name || '-'),
        h(formatTime(r.created_at)),
        r.status === 'pending'
          ? `<div class="row-actions"><button class="btn slim secondary" data-action="approve-access" data-id="${r.id}">通过</button><button class="btn slim danger" data-action="reject-access" data-id="${r.id}">拒绝</button></div>`
          : h(formatTime(r.reviewed_at))
      ]),
      { pageKey: 'approvals' }
    )}
  `;
}

async function renderAdmin() {
  if (state.route !== 'admin') return;
  const side = `
    <aside class="side">
      ${adminButton('projects', '项目信息维护')}
      ${adminButton('users', '用户信息维护')}
      ${adminButton('parameters', '参数信息维护')}
      ${adminButton('materials', '学习资料维护')}
      ${adminButton('logs', '日志信息查询')}
    </aside>
  `;

  let content = '';
  if (state.adminSub === 'users') content = await adminUsers();
  else if (state.adminSub === 'logs') content = await adminLogs();
  else if (state.adminSub === 'parameters') content = adminParameters();
  else if (state.adminSub === 'materials') content = adminMaterials();
  else content = await adminProjects();

  app.innerHTML = `${content.head}<div class="grid cols-admin">${side}<section>${content.body}</section></div>`;
}

async function adminProjects() {
  const form = new FormData(document.querySelector('#projectFilters') || undefined);
  const params = new URLSearchParams({ search: form.get('search') || '', categoryId: form.get('categoryId') || '' });
  const data = await api(`/api/projects?${params}`);
  return {
    head: pageHead('系统管理 / 项目列表', '先通过项目列表检索和定位项目，再点击进入项目信息维护详情页。', `
      <button class="btn" data-action="new-project">新增项目</button>
      <button class="btn secondary" onclick="window.print()">导出项目</button>
    `),
    body: `
      <form class="filter" id="projectFilters" style="grid-template-columns:1.4fr 1fr auto">
        <input name="search" placeholder="搜索 O2E / WBS / 客户 / 项目名称" value="${h(params.get('search'))}">
        <select name="categoryId"><option value="">全部项目类型</option>${options(state.meta.projectCategories, params.get('categoryId'))}</select>
        <button class="btn">查询</button>
      </form>
      ${table(
        ['O2E编号', 'WBS编号', '客户名称', '项目名称', '项目类型', 'PIC', 'MIC', 'AI需求', 'AI资产', '操作'],
        data.projects.map((p) => [
          h(p.o2e_code || '-'), h(p.wbs_code || '-'), h(p.customer_name), h(p.project_name), h(p.category_name || '-'),
          h(p.pic), h(p.mic), h(p.request_count), h(p.asset_count),
          `<button class="btn slim secondary" data-action="edit-project" data-id="${p.id}">查看/编辑</button>`
        ]),
        { pageKey: 'adminProjects' }
      )}
    `
  };
}

async function adminUsers() {
  const form = new FormData(document.querySelector('#userFilters') || undefined);
  const params = new URLSearchParams({ search: form.get('search') || '' });
  const data = await api(`/api/users?${params}`);
  return {
    head: pageHead('系统管理 / 用户列表', '先通过用户列表检索和定位用户，再点击进入用户信息维护详情页。', `
      <button class="btn" data-action="new-user">新增用户</button>
      <button class="btn secondary" onclick="window.print()">导出用户</button>
    `),
    body: `
      <form class="filter" id="userFilters" style="grid-template-columns:1fr auto">
        <input name="search" placeholder="搜索用户名 / 中文名 / 英文名 / 邮箱" value="${h(params.get('search'))}">
        <button class="btn">查询</button>
      </form>
      ${table(
        ['用户名', '中文姓名', '英文姓名', '邮箱', '级别', '角色', '提出需求', '受理需求', '负责资产', '操作'],
        data.users.map((u) => [
          h(u.username), h(u.chinese_name), h(u.english_name), h(u.email), h(u.level),
          u.role === 'admin' ? badge('管理员') : badge('普通用户'),
          h(u.requested_count), h(u.handled_count), h(u.asset_count),
          userActions(u)
        ]),
        { pageKey: 'adminUsers' }
      )}
    `
  };
}

async function adminLogs() {
  const data = await api('/api/audit-logs');
  return {
    head: pageHead('系统管理 / 日志信息查询', '记录需求流转、资产发布、用户变更等关键操作。', `<button class="btn secondary" onclick="window.print()">导出日志</button>`),
    body: table(
      ['类型', '操作', '内容', '操作人', '时间'],
      data.logs.map((l) => [h(l.entity_type), h(l.action), h(l.detail), h(l.actor_name || '-'), h(formatTime(l.created_at))]),
      { pageKey: 'adminLogs' }
    )
  };
}

function adminParameters() {
  const projectList = state.meta.projectCategories;
  const assetList = state.meta.assetCategories;
  return {
    head: pageHead('系统管理 / 参数信息维护', '统一维护项目分类、资产分类等系统参数，后续可继续扩展更多参数字典。', `<button class="btn">新增参数</button>`),
    body: `
      <div class="grid cols-2">
        <section class="panel">
          <div class="panel-title">项目分类</div>
          <div class="panel-body">
            ${table(
              ['分类名称', '参数类型', '操作'],
              projectList.map((x) => [
                h(x.name),
                h('项目分类'),
                parameterActions('project', x.id)
              ]),
              { pageKey: 'projectParameters' }
            )}
          </div>
        </section>
        <section class="panel">
          <div class="panel-title">资产分类</div>
          <div class="panel-body">
            ${table(
              ['分类名称', '参数类型', '操作'],
              assetList.map((x) => [
                h(x.name),
                h('资产分类'),
                parameterActions('asset', x.id)
              ]),
              { pageKey: 'assetParameters' }
            )}
          </div>
        </section>
      </div>
    `
  };
}

function adminMaterials() {
  return {
    head: pageHead('系统管理 / 学习资料维护', '管理员维护学习资料、外部链接和知识库文本。', `<button class="btn">新增资料</button>`),
    body: `<section class="panel"><div class="panel-title">维护说明</div><div class="panel-body">当前版本已支持学习资料浏览和知识库检索，维护表单会在下一轮细化。</div></section>`
  };
}

async function openRequestModal(id) {
  const data = id ? await api(`/api/requests/${id}`) : { request: {} };
  const r = data.request;
  openModal(id ? '编辑 AI 需求' : '新增 AI 需求', `
    <form id="requestForm" class="form-grid">
      <div class="field full"><span class="label">需求名称</span><input name="title" value="${h(r.title || '')}" required></div>
      <div class="field full"><span class="label">需求描述</span><textarea name="description">${h(r.description || '')}</textarea></div>
      <div class="field"><span class="label">关联项目</span><select name="project_id"><option value="">无项目关联</option>${projectOptions(r.project_id)}</select></div>
      <div class="field"><span class="label">受理人</span><select name="handler_id"><option value="">等待认领</option>${userOptions(r.handler_id)}</select></div>
      <div class="field"><span class="label">状态</span><select name="status">${statusOptions(r.status || '提出')}</select></div>
      <div class="field"><span class="label">需求类型</span><select name="tag_id">${options(state.meta.tags, r.tags?.[0]?.id)}</select></div>
      <div class="field full"><button class="btn">${id ? '保存需求' : '提交需求'}</button></div>
    </form>
  `);
  document.querySelector('#requestForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const body = {
      title: form.get('title'),
      description: form.get('description'),
      project_id: form.get('project_id') || null,
      no_project: !form.get('project_id'),
      handler_id: form.get('handler_id') || null,
      status: form.get('status'),
      tag_ids: [form.get('tag_id')].filter(Boolean)
    };
    await api(id ? `/api/requests/${id}` : '/api/requests', { method: id ? 'PATCH' : 'POST', body });
    closeModal();
    showToast('需求已保存');
    renderRequests();
  });
}

async function openAssetModal(id) {
  const data = id ? await api(`/api/assets/${id}`) : { asset: {} };
  const asset = data.asset;
  openModal(id ? '编辑 AI 资产' : '发布 AI 资产', assetQuickForm('modalAssetForm', asset));
  document.querySelector('#modalAssetForm').addEventListener('submit', saveQuickAsset);
}

async function openProjectModal(id) {
  const data = id ? await api(`/api/projects/${id}`) : { project: {} };
  const p = data.project;
  openModal(id ? '项目信息维护' : '新增项目', `
    <form id="projectForm" class="form-grid">
      <div class="field"><span class="label">O2E编号</span><input name="o2e_code" value="${h(p.o2e_code || '')}"></div>
      <div class="field"><span class="label">WBS编号</span><input name="wbs_code" value="${h(p.wbs_code || '')}"></div>
      <div class="field"><span class="label">客户名称</span><input name="customer_name" value="${h(p.customer_name || '')}" required></div>
      <div class="field"><span class="label">项目名称</span><input name="project_name" value="${h(p.project_name || '')}" required></div>
      <div class="field"><span class="label">PIC</span><input name="pic" value="${h(p.pic || '')}" required></div>
      <div class="field"><span class="label">MIC</span><input name="mic" value="${h(p.mic || '')}" required></div>
      <div class="field"><span class="label">项目类型</span><select name="category_id">${options(state.meta.projectCategories, p.category_id)}</select></div>
      <div class="field"><span class="label">项目状态</span><select name="status"><option value="active" ${selected(p.status, 'active')}>进行中</option><option value="potential" ${selected(p.status, 'potential')}>潜在项目</option><option value="closed" ${selected(p.status, 'closed')}>已结束</option></select></div>
      <div class="field full"><span class="label">项目描述</span><textarea name="description">${h(p.description || '')}</textarea></div>
      <div class="field full"><button class="btn">保存项目</button></div>
    </form>
  `);
  document.querySelector('#projectForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.target).entries());
    await api(id ? `/api/projects/${id}` : '/api/projects', { method: id ? 'PATCH' : 'POST', body });
    closeModal();
    showToast('项目已保存');
    renderAdmin();
  });
}

async function openUserModal(id) {
  const data = id ? await api(`/api/users/${id}`) : { user: {} };
  const u = data.user;
  openModal(id ? '用户信息维护' : '新增用户', `
    <form id="userForm" class="form-grid">
      <div class="field"><span class="label">中文姓名</span><input name="chinese_name" value="${h(u.chinese_name || '')}" required></div>
      <div class="field"><span class="label">英文姓名</span><input name="english_name" value="${h(u.english_name || '')}" required></div>
      <div class="field"><span class="label">邮箱</span><input name="email" value="${h(u.email || '')}" required></div>
      <div class="field"><span class="label">级别</span><select name="level">${['Intern','A1','A2','C1','C2','S1','S2','M','SM','P'].map((x) => `<option ${selected(u.level, x)}>${x}</option>`).join('')}</select></div>
      <div class="field"><span class="label">角色</span><select name="role"><option value="user" ${selected(u.role, 'user')}>普通用户</option><option value="admin" ${selected(u.role, 'admin')}>管理员用户</option></select></div>
      <div class="field"><span class="label">状态</span><select name="status"><option value="active" ${selected(u.status, 'active')}>启用</option><option value="inactive" ${selected(u.status, 'inactive')}>停用</option></select></div>
      <div class="field full"><span class="label">重置密码</span><input name="password" placeholder="留空则不修改"></div>
      <div class="field full"><button class="btn">保存用户</button></div>
    </form>
  `);
  document.querySelector('#userForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.target).entries());
    if (!body.password) delete body.password;
    if (id) {
      await api(`/api/users/${id}`, { method: 'PATCH', body });
    } else {
      body.password ||= 'admin123';
      await api('/api/users', { method: 'POST', body });
    }
    closeModal();
    showToast('用户已保存');
    renderAdmin();
  });
}

async function openParameterModal(kind, id) {
  const list = kind === 'project' ? state.meta.projectCategories : state.meta.assetCategories;
  const item = list.find((x) => Number(x.id) === Number(id)) || {};
  openModal(`${kind === 'project' ? '项目分类' : '资产分类'}维护`, `
    <form id="parameterForm" class="form-grid">
      <div class="field"><span class="label">参数类型</span><input value="${kind === 'project' ? '项目分类' : '资产分类'}" disabled></div>
      <div class="field"><span class="label">参数ID</span><input value="${h(item.id || '')}" disabled></div>
      <div class="field full"><span class="label">分类名称</span><input name="name" value="${h(item.name || '')}" required></div>
      <div class="field full"><button class="btn">保存参数</button></div>
    </form>
  `);
  document.querySelector('#parameterForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const body = Object.fromEntries(new FormData(event.target).entries());
    await api(`/api/parameters/${kind}/${id}`, { method: 'PATCH', body });
    await loadBase();
    showToast('参数已保存');
    closeModal();
    renderAdmin();
  });
}

async function claimRequest(id) {
  await api(`/api/requests/${id}/claim`, { method: 'POST' });
  showToast('需求已认领');
  renderRequests();
}

async function deleteRequest(id) {
  if (!(await confirmDialog('确认删除？'))) return;
  await api(`/api/requests/${id}`, { method: 'DELETE' });
  showToast('需求已删除');
  renderRequests();
}

async function retireAsset(id) {
  if (!(await confirmDialog('确认注销？'))) return;
  await api(`/api/assets/${id}`, { method: 'PATCH', body: { status: 'retired' } });
  showToast('资产已注销');
  renderAssets();
}

async function deleteUser(id) {
  if (!(await confirmDialog('确认删除？'))) return;
  await api(`/api/users/${id}`, { method: 'DELETE' });
  await loadBase();
  showToast('用户已删除');
  renderAdmin();
}

async function deleteParameter(kind, id) {
  if (!(await confirmDialog('确认删除？'))) return;
  await api(`/api/parameters/${kind}/${id}`, { method: 'DELETE' });
  await loadBase();
  showToast('参数已删除');
  renderAdmin();
}

async function requestAssetAccess(id) {
  await api(`/api/assets/${id}/access-requests`, { method: 'POST', body: { reason: '申请查看资产' } });
  showToast('访问申请已提交，资产负责人会收到消息通知');
}

async function openMessage(id, route) {
  await api(`/api/messages/${id}/read`, { method: 'POST' });
  refreshMessageDot();
  location.hash = route?.replace('#', '') || 'approvals';
}

async function reviewAccessRequest(id, status) {
  await api(`/api/asset-access-requests/${id}`, { method: 'PATCH', body: { status } });
  showToast(status === 'approved' ? '已通过访问申请' : '已拒绝访问申请');
  renderApprovals();
}

async function openAsset(id) {
  await api(`/api/assets/${id}/view`, { method: 'POST' });
  showToast('已记录浏览，实际链接会在正式环境打开');
}

async function openAssetDetailModal(id) {
  const data = await api(`/api/assets/${id}`);
  const asset = data.asset;
  openModal(`${asset.asset_name} / 详情`, `
    <div class="detail-grid">
      <div class="detail-item"><span class="label">资产名称</span><b>${h(asset.asset_name)}</b></div>
      <div class="detail-item"><span class="label">负责人</span><b>${h(asset.owner_name || '-')}</b></div>
      <div class="detail-item"><span class="label">资产分类</span><b>${h(asset.category_name || '-')}</b></div>
      <div class="detail-item"><span class="label">公开状态</span><b>${asset.visibility === 'public' ? '公开' : '非公开'}</b></div>
      <div class="detail-item"><span class="label">当前状态</span><b>${asset.status === 'online' ? '在线' : '注销'}</b></div>
      <div class="detail-item"><span class="label">浏览量</span><b>${h(asset.views || 0)}</b></div>
      <div class="detail-item full"><span class="label">访问/下载链接</span><div>${h(asset.access_url || asset.download_url || '-')}</div></div>
      <div class="detail-item full"><span class="label">资产描述</span><div class="detail-text">${h(asset.description || '-')}</div></div>
    </div>
  `);
}

async function showAssetPreview(id) {
  const data = await api(`/api/assets/${id}`);
  const asset = data.asset;
  if (!asset.preview_image_data) {
    showToast('该资产暂未上传预览图');
    return;
  }
  openModal(`${asset.asset_name} / 预览图`, `
    <div class="asset-preview-wrap">
      <img class="asset-preview-image" src="${h(asset.preview_image_data)}" alt="${h(asset.asset_name)} 预览图">
      <div class="label mt">${h(asset.preview_image_name || '资产预览图')}</div>
    </div>
  `);
}

async function saveQuickAsset(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  const body = Object.fromEntries(form.entries());
  delete body.preview_file;
  const file = event.target.querySelector('input[name="preview_file"]')?.files?.[0];
  if (file) {
    if (!file.type.startsWith('image/')) {
      showToast('请上传图片格式的预览图');
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      showToast('预览图请控制在 4MB 以内');
      return;
    }
    body.preview_image_data = await fileToDataUrl(file);
    body.preview_image_name = file.name;
  }
  const id = event.target.dataset.id;
  await api(id ? `/api/assets/${id}` : '/api/assets', { method: id ? 'PATCH' : 'POST', body });
  closeModal();
  showToast(id ? '资产已更新' : '资产已发布');
  renderAssets();
}

async function knowledgeSearch() {
  const question = document.querySelector('#knowledgeQuestion').value;
  const result = await api('/api/learning-materials/search', { method: 'POST', body: { question } });
  document.querySelector('#knowledgeAnswer').innerHTML = `<b>查询结果</b><br>${h(result.answer).replaceAll('\n', '<br>')}`;
}

function pageHead(title, desc, actions = '') {
  return `<div class="page-head"><div><h1>${h(title)}</h1><div class="desc">${h(desc)}</div></div><div class="actions">${actions}</div></div>`;
}

function statCard(label, value, trend) {
  return `<div class="card"><div class="label">${h(label)}</div><div class="value">${h(value)}</div><div class="trend">${h(trend)}</div></div>`;
}

function barRow(label, value, max) {
  const width = max ? Math.max(8, Math.round((value / max) * 100)) : 0;
  return `<div class="bar-row"><span>${h(label)}</span><span class="track"><span class="fill" style="width:${width}%"></span></span><b>${h(value)}</b></div>`;
}

function renderDashboardCharts(data) {
  if (!window.echarts) {
    showToast('ECharts 加载失败，请检查依赖');
    return;
  }
  const green = '#12945a';
  const greenDark = '#0b5f3d';
  const greenSoft = '#a6d9bc';
  const muted = '#65736b';
  const gridLine = 'rgba(18, 148, 90, .12)';
  const charts = [];

  charts.push(renderBarChart('projectTypeChart', data.projectTypes, {
    horizontal: true,
    color: green,
    maxLabelWidth: 82
  }));
  charts.push(renderPieChart('assetTypeChart', data.assetTypes));
  charts.push(renderBarChart('requestStatusChart', data.requestStatus, {
    horizontal: true,
    color: greenDark,
    maxLabelWidth: 54
  }));

  window.__dashboardCharts?.forEach((chart) => chart?.dispose?.());
  window.__dashboardCharts = charts.filter(Boolean);
  window.onresize = () => window.__dashboardCharts?.forEach((chart) => chart.resize());

  function renderBarChart(id, rows, options) {
    const el = document.getElementById(id);
    if (!el) return null;
    const chart = echarts.init(el);
    const labels = rows.map((x) => x.name);
    const values = rows.map((x) => Number(x.count || 0));
    chart.setOption({
      animationDuration: 650,
      grid: { left: options.maxLabelWidth, right: 30, top: 16, bottom: 18 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: gridLine } },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: muted, fontFamily: 'DengXian, Arial', fontSize: 12 }
      },
      yAxis: {
        type: 'category',
        data: labels,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#202622', fontFamily: 'DengXian, Arial', fontSize: 12 }
      },
      series: [{
        type: 'bar',
        data: values,
        barWidth: 8,
        label: { show: true, position: 'right', color: '#202622', fontSize: 12, fontFamily: 'DengXian, Arial' },
        itemStyle: {
          borderRadius: [0, 6, 6, 0],
          color: new echarts.graphic.LinearGradient(0, 0, 1, 0, [
            { offset: 0, color: greenDark },
            { offset: 1, color: options.color }
          ])
        },
        backgroundStyle: { color: '#edf2ef', borderRadius: 6 },
        showBackground: true
      }]
    });
    return chart;
  }

  function renderPieChart(id, rows) {
    const el = document.getElementById(id);
    if (!el) return null;
    const total = rows.reduce((sum, x) => sum + Number(x.count || 0), 0) || 1;
    const chart = echarts.init(el);
    chart.setOption({
      animationDuration: 700,
      color: [green, greenDark, greenSoft, '#dbe9e2'],
      tooltip: {
        trigger: 'item',
        formatter: (params) => `${params.name}<br/>${params.value} (${params.percent}%)`
      },
      legend: {
        bottom: 0,
        left: 0,
        itemWidth: 8,
        itemHeight: 8,
        textStyle: { color: muted, fontSize: 12, fontFamily: 'DengXian, Arial' }
      },
      series: [{
        type: 'pie',
        radius: ['42%', '68%'],
        center: ['50%', '44%'],
        avoidLabelOverlap: true,
        label: {
          formatter: (params) => `${Math.round((params.value / total) * 100)}%`,
          color: '#202622',
          fontSize: 12,
          fontFamily: 'DengXian, Arial'
        },
        labelLine: { lineStyle: { color: 'rgba(18, 148, 90, .32)' } },
        data: rows.map((x) => ({ name: x.name, value: Number(x.count || 0) }))
      }]
    });
    return chart;
  }
}

function assetCard(asset) {
  const visibility = asset.visibility === 'public' ? badge('公开') : badge('申请查看', 'warn');
  return `<div class="asset-card">
    <div class="asset-title"><span class="logo">${h(asset.asset_name.slice(0, 3).toUpperCase())}</span>${h(asset.asset_name)}</div>
    <p class="muted">${h(asset.description || '')}</p>
    <div class="meta-line">${visibility}<b>${h(asset.views || 0)} views</b></div>
  </div>`;
}

function materialCard(material) {
  return `<div class="material-card">
    <b>${h(material.title)}</b>
    <p class="muted">${h(material.description)}</p>
    <div class="meta-line"><span>${h(material.material_type)}</span><a class="btn slim secondary" href="${h(material.url)}" target="_blank">打开</a></div>
  </div>`;
}

const PAGE_SIZES = [10, 20, 50, 100];

function table(headers, rows, options = {}) {
  const pageKey = options.pageKey;
  const paged = pageKey ? paginate(rows, pageKey) : { rows, pager: null };
  const empty = `<tr><td colspan="${headers.length}" class="empty-cell">暂无数据</td></tr>`;
  return `
    <div class="table-wrap"><table><thead><tr>${headers.map((x) => `<th>${h(x)}</th>`).join('')}</tr></thead><tbody>${paged.rows.length ? paged.rows.map((row) => `<tr>${row.map((cell, i) => `<td data-label="${h(headers[i])}">${cell}</td>`).join('')}</tr>`).join('') : empty}</tbody></table></div>
    ${pageKey ? paginationControls(pageKey, paged.pager) : ''}
  `;
}

function pagedCards(items, renderer, pageKey, className) {
  const paged = paginate(items, pageKey);
  const body = paged.rows.length
    ? `<div class="${h(className)}">${paged.rows.map(renderer).join('')}</div>`
    : '<div class="empty-card">暂无数据</div>';
  return `${body}${paginationControls(pageKey, paged.pager)}`;
}

function clippedText(value, max = 36) {
  const text = String(value || '');
  const display = text.length > max ? `${text.slice(0, max)}...` : text;
  return `<span class="text-ellipsis" title="${h(text)}">${h(display)}</span>`;
}

function paginate(items, pageKey) {
  const pager = state.pagination[pageKey] || { page: 1, pageSize: 10 };
  const pageSize = PAGE_SIZES.includes(Number(pager.pageSize)) ? Number(pager.pageSize) : 10;
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Number(pager.page) || 1), totalPages);
  state.pagination[pageKey] = { page, pageSize, totalPages };
  const start = (page - 1) * pageSize;
  return {
    rows: items.slice(start, start + pageSize),
    pager: { page, pageSize, total, totalPages, start: total ? start + 1 : 0, end: Math.min(start + pageSize, total) }
  };
}

function paginationControls(pageKey, pager) {
  const disabledFirst = pager.page <= 1 ? 'disabled' : '';
  const disabledLast = pager.page >= pager.totalPages ? 'disabled' : '';
  return `
    <div class="pagination">
      <div class="page-size">
        <span>每页</span>
        <select data-action="page-size" data-page-key="${h(pageKey)}">
          ${PAGE_SIZES.map((size) => `<option value="${size}" ${selected(pager.pageSize, size)}>${size}</option>`).join('')}
        </select>
        <span>条</span>
      </div>
      <div class="page-summary">共 ${h(pager.total)} 条，显示 ${h(pager.start)}-${h(pager.end)}</div>
      <div class="page-buttons">
        <button class="page-btn" data-action="page-go" data-page-key="${h(pageKey)}" data-page="first" ${disabledFirst}>&lt;&lt;</button>
        <button class="page-btn" data-action="page-go" data-page-key="${h(pageKey)}" data-page="prev" ${disabledFirst}>&lt;</button>
        <button class="page-btn current" disabled>${h(pager.page)}</button>
        <button class="page-btn" data-action="page-go" data-page-key="${h(pageKey)}" data-page="next" ${disabledLast}>&gt;</button>
        <button class="page-btn" data-action="page-go" data-page-key="${h(pageKey)}" data-page="last" ${disabledLast}>&gt;&gt;</button>
      </div>
    </div>
  `;
}

async function changePageSize(pageKey, pageSize) {
  if (!pageKey) return;
  state.pagination[pageKey] = { page: 1, pageSize: Number(pageSize) || 10 };
  await render();
}

async function changePage(pageKey, direction) {
  if (!pageKey) return;
  const pager = state.pagination[pageKey] || { page: 1, pageSize: 10 };
  const totalPages = Math.max(1, Number(pager.totalPages) || Number(pager.page) || 1);
  const page = Number(pager.page) || 1;
  const nextPage = {
    first: 1,
    prev: Math.max(1, page - 1),
    next: page + 1,
    last: totalPages
  }[direction] || page;
  state.pagination[pageKey] = { ...pager, page: nextPage };
  await render();
}

function resetPage(pageKey) {
  if (state.pagination[pageKey]) state.pagination[pageKey].page = 1;
}

function requestActions(r) {
  const canEdit = state.me?.role === 'admin' || r.requester_id === state.me?.id || r.handler_id === state.me?.id;
  return `<div class="row-actions">
    ${canEdit ? `<button class="btn slim secondary" data-action="edit-request" data-id="${r.id}">编辑</button>` : ''}
    ${!r.handler_id ? `<button class="btn slim secondary" data-action="claim-request" data-id="${r.id}">认领</button>` : ''}
    ${canEdit ? `<button class="btn slim danger" data-action="delete-request" data-id="${r.id}">删除</button>` : ''}
  </div>`;
}

function userActions(u) {
  const canDelete = Number(u.id) !== Number(state.me?.id);
  return `<div class="row-actions">
    <button class="btn slim secondary" data-action="edit-user" data-id="${u.id}">查看/编辑</button>
    ${canDelete ? `<button class="btn slim danger" data-action="delete-user" data-id="${u.id}">删除</button>` : ''}
  </div>`;
}

function parameterActions(kind, id) {
  return `<div class="row-actions">
    <button class="btn slim secondary" data-action="edit-parameter" data-kind="${h(kind)}" data-id="${id}">查看/编辑</button>
    <button class="btn slim danger" data-action="delete-parameter" data-kind="${h(kind)}" data-id="${id}">删除</button>
  </div>`;
}

function assetActions(a) {
  const canEdit = state.me?.role === 'admin' || a.owner_id === state.me?.id;
  return `<div class="row-actions">
    ${a.visibility === 'public' ? `<button class="btn slim secondary" data-action="open-asset" data-id="${a.id}">访问入口</button>` : `<button class="btn slim secondary" data-action="request-access" data-id="${a.id}">申请查看</button>`}
    <button class="btn slim secondary" data-action="view-asset-detail" data-id="${a.id}">详情</button>
    <button class="btn slim secondary" data-action="show-asset-preview" data-id="${a.id}">预览图</button>
    ${canEdit ? `<button class="btn slim secondary" data-action="edit-asset" data-id="${a.id}">编辑</button>` : ''}
    ${canEdit ? `<button class="btn slim danger" data-action="retire-asset" data-id="${a.id}">注销</button>` : ''}
  </div>`;
}

function assetQuickForm(id = 'quickAssetForm', asset = {}) {
  return `<form id="${id}" class="form-grid" data-id="${asset.id || ''}">
    <div class="field full"><span class="label">关联需求</span><select name="request_id"><option value="">不关联需求</option></select></div>
    <div class="field full"><span class="label">资产名称</span><input name="asset_name" required placeholder="例如 Report Agent" value="${h(asset.asset_name || '')}"></div>
    <div class="field"><span class="label">资产分类</span><select name="category_id">${options(state.meta.assetCategories, asset.category_id)}</select></div>
    <div class="field"><span class="label">公开设置</span><select name="visibility"><option value="public" ${selected(asset.visibility, 'public')}>公开：展示访问入口</option><option value="private" ${selected(asset.visibility, 'private')}>不公开：需要申请查看</option></select></div>
    <div class="field full"><span class="label">访问/下载链接</span><input name="access_url" placeholder="https://..." value="${h(asset.access_url || asset.download_url || '')}"></div>
    <div class="field full"><span class="label">上传预览图</span><input name="preview_file" type="file" accept="image/*">${asset.preview_image_name ? `<span class="label">当前预览图：${h(asset.preview_image_name)}</span>` : ''}</div>
    <div class="field full"><span class="label">资产描述</span><textarea name="description">${h(asset.description || '')}</textarea></div>
    <div class="field full"><button class="btn">${asset.id ? '保存资产' : '提交发布'}</button></div>
  </form>`;
}

function tagList(tags = []) {
  return tags.map((tag) => `<span class="tag" title="${h(tag.description || '')}">${h(tag.name)}</span>`).join(' ');
}

function statusBadge(status) {
  if (status === '提出') return badge(status, 'warn');
  if (status === '注销') return badge(status, 'off');
  return badge(status);
}

function accessStatusBadge(status) {
  if (status === 'pending') return badge('待审批', 'warn');
  if (status === 'approved') return badge('已通过');
  return badge('已拒绝', 'off');
}

function badge(text, type = '') {
  return `<span class="status ${type}">${h(text)}</span>`;
}

function adminButton(sub, label) {
  return `<button class="${state.adminSub === sub ? 'active' : ''}" data-action="admin-sub" data-sub="${sub}">${h(label)}</button>`;
}

function options(items, selectedId = '') {
  return (items || []).map((item) => `<option value="${item.id}" ${selected(String(selectedId || ''), String(item.id))}>${h(item.name)}</option>`).join('');
}

function userOptions(selectedId = '') {
  return state.meta.users.map((u) => `<option value="${u.id}" ${selected(String(selectedId || ''), String(u.id))}>${h(u.chinese_name)} / ${h(u.english_name)}</option>`).join('');
}

function projectOptions(selectedId = '') {
  return state.meta.projects.map((p) => `<option value="${p.id}" ${selected(String(selectedId || ''), String(p.id))}>${h(p.wbs_code || p.o2e_code)} - ${h(p.customer_name)} / ${h(p.project_name)}</option>`).join('');
}

function statusOptions(value = '') {
  return `<option value="">全部状态</option>${['提出', '受理', '开发', '上线', '注销'].map((x) => `<option value="${x}" ${selected(value, x)}>${x}</option>`).join('')}`;
}

function selected(a, b) {
  return String(a || '') === String(b || '') ? 'selected' : '';
}

function maxCount(items) {
  return Math.max(1, ...items.map((x) => Number(x.count || 0)));
}

function openModal(title, body) {
  modal.classList.remove('confirm-modal');
  modal.innerHTML = `<div class="modal-head"><h2>${h(title)}</h2><button class="btn slim secondary" id="closeModal">关闭</button></div><div class="modal-body">${body}</div>`;
  modal.showModal();
  document.querySelector('#closeModal').addEventListener('click', closeModal);
}

function confirmDialog(message) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      modal.removeEventListener('close', onClose);
      if (modal.open) modal.close();
      modal.classList.remove('confirm-modal');
      modal.innerHTML = '';
      resolve(ok);
    };
    const onClose = () => {
      if (settled) return;
      settled = true;
      modal.classList.remove('confirm-modal');
      modal.innerHTML = '';
      resolve(false);
    };

    modal.classList.add('confirm-modal');
    modal.innerHTML = `
      <div class="modal-head">
        <h2>操作确认</h2>
        <button class="btn slim secondary" data-confirm-choice="cancel">关闭</button>
      </div>
      <div class="modal-body">
        <div class="confirm-box">
          <div class="confirm-title">${h(message)}</div>
          <div class="confirm-actions">
            <button class="btn secondary" data-confirm-choice="cancel">取消</button>
            <button class="btn danger" data-confirm-choice="confirm">确认</button>
          </div>
        </div>
      </div>
    `;
    modal.addEventListener('close', onClose, { once: true });
    modal.showModal();
    modal.querySelectorAll('[data-confirm-choice]').forEach((button) => {
      button.addEventListener('click', () => finish(button.dataset.confirmChoice === 'confirm'));
    });
  });
}

function closeModal() {
  modal.close();
  modal.classList.remove('confirm-modal');
  modal.innerHTML = '';
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2200);
}

async function refreshMessageDot() {
  try {
    const data = await api('/api/messages');
    setMessageUnread(data.unread);
  } catch (_error) {
    setMessageUnread(0);
  }
}

function setMessageUnread(count) {
  if (!messageDot) return;
  messageDot.hidden = Number(count || 0) <= 0;
  messageButton?.setAttribute('title', Number(count || 0) > 0 ? `消息：${count} 条未读` : '消息');
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    showToast(data.error || '请求失败');
    throw new Error(data.error || '请求失败');
  }
  return data;
}

function formatTime(value) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-';
}

function h(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
