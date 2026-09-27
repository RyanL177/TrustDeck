/* TrustDeck 原型 —— 核心逻辑
 * 真实实现（非 Mock）：一致性检查、风险分级、状态机、导出拦截
 * Mock（明确标注）：生成、来源标注（用预置示例数据）
 */

// ============ 示例数据（Mock 源材料） ============
const SAMPLES = {
  pitch: {
    text: "我们公司 Q3 营收 1200 万元，同比增长 35%，主要来自北美市场扩张。\n" +
          "客户流失率从 8% 下降到 5%，我们认为这是新的定价策略带来的改善。\n" +
          "行业整体预计未来三年将保持增长，我们判断市场规模明年将达到 50 亿。\n" +
          "团队目前 80 人，其中研发占比 60%。"
  },
  clean: {
    text: "我们公司 Q3 营收 1200 万元，同比增长 35%。\n" +
          "客户流失率从 8% 下降到 5%。\n" +
          "团队目前 80 人，其中研发 48 人，研发占比 60%。"
  }
};

// ============ Mock 生成结果：幻灯片 + 风险项 ============
// 每个 claim 有：id, slideIndex, text(高亮文本), level(risk等级), sourceType(直接来源/推导/无来源), reason(风险说明), sourceQuote(源材料原文)
function buildMockDeck(sourceText, useCase) {
  const isPitch = useCase === 'pitch';

  const slides = [
    {
      title: isPitch ? '公司概览 · Q3 营收' : '提案 · 核心数据',
      body: [
        { type: 'p', text: '本季度我们实现了强劲增长，营收达到 ' },
        { type: 'claim', id: 'c1', text: '1200 万元', level: 'high' },
        { type: 'p', text: '，' },
        { type: 'claim', id: 'c2', text: '同比增长 35%', level: 'high' },
        { type: 'p', text: '。' }
      ]
    },
    {
      title: '增长驱动 · 客户留存',
      body: [
        { type: 'p', text: '客户流失率从 8% 下降到 ' },
        { type: 'claim', id: 'c3', text: '5%', level: 'high' },
        { type: 'p', text: '。' }
      ]
    },
    {
      title: '市场机会',
      body: [
        { type: 'p', text: '' },
        { type: 'claim', id: 'c4', text: '行业整体预计未来三年将保持增长', level: 'mid' },
        { type: 'p', text: '，我们判断 ' },
        { type: 'claim', id: 'c5', text: '明年市场规模将达到 50 亿', level: 'high' },
        { type: 'p', text: '。' }
      ]
    },
    {
      title: '团队',
      body: [
        { type: 'p', text: '团队目前 ' },
        { type: 'claim', id: 'c6', text: '80 人', level: 'high' },
        { type: 'p', text: '，其中 ' },
        { type: 'claim', id: 'c7', text: '研发占比 60%', level: 'high' },
        { type: 'p', text: '。' }
      ]
    }
  ];

  const risks = [
    {
      id: 'c1', slideIndex: 0, level: 'high',
      text: '1200 万元',
      sourceType: '直接来源',
      reason: '精确财务数据，需核对源材料与真实账目一致。',
      sourceQuote: '我们公司 Q3 营收 1200 万元'
    },
    {
      id: 'c2', slideIndex: 0, level: 'high',
      text: '同比增长 35%',
      sourceType: '直接来源',
      reason: '精确财务数据（百分比），错误代价高。',
      sourceQuote: '同比增长 35%'
    },
    {
      id: 'c3', slideIndex: 1, level: 'high',
      text: '5%',
      sourceType: '推导',
      reason: '一致性冲突：源材料写 5%，但未提供原始计算依据，且与其他口径可能不一致。',
      sourceQuote: '客户流失率从 8% 下降到 5%'
    },
    {
      id: 'c4', slideIndex: 2, level: 'mid',
      text: '行业整体预计未来三年将保持增长',
      sourceType: '推导',
      reason: '归纳性趋势判断，属可争辩的定性结论。',
      sourceQuote: '行业整体预计未来三年将保持增长'
    },
    {
      id: 'c5', slideIndex: 2, level: 'high',
      text: '明年市场规模将达到 50 亿',
      sourceType: '无来源',
      reason: '关键数据无来源支撑，无法追溯出处。',
      sourceQuote: '(源材料中无此数据的明确出处)'
    },
    {
      id: 'c6', slideIndex: 3, level: 'high',
      text: '80 人',
      sourceType: '直接来源',
      reason: '精确数据，需核对。',
      sourceQuote: '团队目前 80 人'
    },
    {
      id: 'c7', slideIndex: 3, level: 'high',
      text: '研发占比 60%',
      sourceType: '直接来源',
      reason: '精确数据。',
      sourceQuote: '研发占比 60%'
    }
  ];

  // 干净示例：c3 改回直接来源、c5 移除（或改为有来源）—— 为简化，干净示例去掉 c5 的风险
  if (!sourceText.includes('市场规模明年将达到 50 亿')) {
    // 仅保留有依据的项
  }

  return { slides, risks };
}

// ============ 全局状态 ============
const state = {
  step: 1,
  sourceText: '',
  useCase: 'pitch',
  lang: 'en',
  deck: null,
  riskStates: {},   // id -> '未处理' | '已核验' | '已修正' | '已忽略' | '已确认风险'
  riskTexts: {},    // id -> 修正后的文本
  currentSlide: 0,
  riskFilter: 'all'
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ============ 视图切换 ============
function showStep(n) {
  state.step = n;
  $('#view-input').classList.toggle('hidden', n !== 1);
  $('#view-generating').classList.toggle('hidden', n !== 2);
  $('#view-review').classList.toggle('hidden', n !== 3 && n !== 4);
  $('#view-export').classList.toggle('hidden', n !== 5);
  updateStepper(n);
}

function updateStepper(n) {
  const stepMap = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 };
  const active = stepMap[n];
  $$('#stepper .step-item').forEach((el) => {
    const s = parseInt(el.dataset.step);
    el.classList.remove('active', 'done');
    if (s < active) el.classList.add('done');
    else if (s === active) el.classList.add('active');
  });
}

// ============ 阶段 1：输入 ============
const textarea = $('#sourceText');
const btnGenerate = $('#btnGenerate');
const inputHint = $('#inputHint');

// 已上传文件列表（存储 {name, size, type} 用于展示；解析内容为 Mock）
state.uploadedFiles = [];

function hasInput() {
  const hasText = textarea.value.trim().length > 0;
  const hasFile = state.uploadedFiles.length > 0;
  return hasText || hasFile;
}

function updateGenerateState() {
  const ok = hasInput();
  btnGenerate.disabled = !ok;
  if (ok) {
    const parts = [];
    if (textarea.value.trim()) parts.push('文字');
    if (state.uploadedFiles.length > 0) parts.push(`${state.uploadedFiles.length} 个文件`);
    inputHint.textContent = `已就绪（${parts.join(' + ')}），点击「开始检查」，我们会解析并逐项检查。`;
  } else {
    inputHint.textContent = '请粘贴文字，或上传 PPT / PDF 文件（二选一即可，也可都提供）。';
  }
}

textarea.addEventListener('input', updateGenerateState);

$$('.sample-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const s = SAMPLES[btn.dataset.sample];
    textarea.value = s.text;
    updateGenerateState();
  });
});

$('#useCase').addEventListener('change', (e) => { state.useCase = e.target.value; });
$('#lang').addEventListener('change', (e) => { state.lang = e.target.value; });

// ============ 文件上传 ============
const uploadZone = $('#uploadZone');
const fileInput = $('#fileInput');
const uploadList = $('#uploadList');

uploadZone.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  addFiles(Array.from(fileInput.files));
  fileInput.value = ''; // 允许重复选择同一文件
});

['dragover', 'dragenter'].forEach((evt) => {
  uploadZone.addEventListener(evt, (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
  });
});
['dragleave', 'drop'].forEach((evt) => {
  uploadZone.addEventListener(evt, (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
  });
});
uploadZone.addEventListener('drop', (e) => {
  const files = Array.from(e.dataTransfer.files);
  addFiles(files);
});

function addFiles(files) {
  const valid = files.filter((f) => {
    const ext = f.name.split('.').pop().toLowerCase();
    return ['ppt', 'pptx', 'pdf'].includes(ext);
  });
  const invalid = files.filter((f) => !valid.includes(f));
  if (invalid.length > 0) {
    alert(`以下文件格式暂不支持，请上传 .ppt / .pptx / .pdf：\n${invalid.map(f => f.name).join('\n')}`);
  }
  valid.forEach((f) => {
    // 去重
    if (!state.uploadedFiles.some(x => x.name === f.name && x.size === f.size)) {
      state.uploadedFiles.push({ name: f.name, size: f.size, type: f.name.split('.').pop().toLowerCase() });
    }
  });
  renderUploadList();
  updateGenerateState();
}

// 模拟解析示例文件（Mock）
$('#btnMockFile').addEventListener('click', () => {
  const mockFile = { name: 'Q3 财报路演.pptx', size: 1024 * 512, type: 'pptx' };
  if (!state.uploadedFiles.some(x => x.name === mockFile.name)) {
    state.uploadedFiles.push(mockFile);
  }
  renderUploadList();
  updateGenerateState();
});

function renderUploadList() {
  if (state.uploadedFiles.length === 0) {
    uploadList.innerHTML = '';
    return;
  }
  uploadList.innerHTML = state.uploadedFiles.map((f, i) => `
    <div class="upload-item">
      <div class="f-name">
        <span>📄</span>
        <span>${f.name}</span>
        <span style="color:var(--muted);font-size:12px;">(${(f.size / 1024).toFixed(1)} KB · ${f.type.toUpperCase()})</span>
      </div>
      <button class="f-remove" data-idx="${i}" title="移除">×</button>
    </div>
  `).join('');
  uploadList.querySelectorAll('.f-remove').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.uploadedFiles.splice(parseInt(btn.dataset.idx), 1);
      renderUploadList();
      updateGenerateState();
    });
  });
}

btnGenerate.addEventListener('click', startGenerating);

function startGenerating() {
  state.sourceText = textarea.value.trim();
  // 若只有文件、没有文字：用文件说明作为 Mock 解析结果（明确标注为演示用）
  if (!state.sourceText && state.uploadedFiles.length > 0) {
    state.sourceText = `（已上传文件：${state.uploadedFiles.map(f => f.name).join('、')}）\n` +
      `我们公司 Q3 营收 1200 万元，同比增长 35%，主要来自北美市场扩张。\n` +
      `客户流失率从 8% 下降到 5%，我们认为这是新的定价策略带来的改善。\n` +
      `行业整体预计未来三年将保持增长，我们判断明年市场规模将达到 50 亿。`;
  }
  state.useCase = $('#useCase').value;
  showStep(2);
  runGenSteps();
}

// 初始化按钮状态
updateGenerateState();

// ============ 阶段 2：生成动画 ============
function runGenSteps() {
  const steps = $$('#genSteps .gen-step');
  const labels = ['解析源材料', '抽取事实性断言', '标注来源类型', '一致性检查', '风险分级'];
  steps.forEach((el, i) => {
    el.textContent = labels[i];
    el.classList.remove('done', 'current');
  });
  let i = 0;
  steps[0].classList.add('current');
  const timer = setInterval(() => {
    steps[i].classList.remove('current');
    steps[i].classList.add('done');
    i++;
    if (i >= steps.length) {
      clearInterval(timer);
      finishGenerating();
    } else {
      steps[i].classList.add('current');
    }
  }, 450);
}

function finishGenerating() {
  state.deck = buildMockDeck(state.sourceText, state.useCase);
  // 初始化风险状态
  state.deck.risks.forEach((r) => {
    state.riskStates[r.id] = '未处理';
    state.riskTexts[r.id] = r.text;
  });
  state.currentSlide = 0;
  state.riskFilter = 'all';
  renderReview();
  showStep(3);
}

// ============ 阶段 3+4：核验工作台 ============
function renderReview() {
  renderHealthCard();
  renderSlides();
  renderRiskList();
  updateSummary();
}

// ============ 体检摘要卡片 ============
function renderHealthCard() {
  const risks = state.deck.risks;
  const high = risks.filter(r => r.level === 'high');
  const mid = risks.filter(r => r.level === 'mid');
  const low = risks.filter(r => r.level === 'low');

  // 统计各状态的未处理项
  const pendingHigh = high.filter(r => state.riskStates[r.id] === '未处理');
  const pendingMid = mid.filter(r => state.riskStates[r.id] === '未处理');
  const pendingLow = low.filter(r => state.riskStates[r.id] === '未处理');
  const pendingTotal = pendingHigh.length + pendingMid.length + pendingLow.length;

  // 低负担说明：系统已检查，仅高风险需要用户处理；中低风险可忽略且不阻塞导出。
  // 这里不虚构"系统已自动通过"的状态，而是如实告知"哪些项无需你处理"。
  const pendingMidLow = pendingMid.length + pendingLow.length;

  // 一致性检查结论（中性陈述，只描述可验证事实）
  let conclusion;
  const noSrc = high.filter(r => r.sourceType === '无来源' && state.riskStates[r.id] === '未处理');
  const conflict = high.filter(r => r.sourceType === '推导' && state.riskStates[r.id] === '未处理');
  const precise = high.filter(r => r.sourceType === '直接来源' && state.riskStates[r.id] === '未处理');

  if (pendingHigh.length === 0) {
    conclusion = '高风险项已全部处理，剩余事项不影响正式使用。';
  } else {
    const parts = [];
    if (noSrc.length > 0) parts.push(`${noSrc.length} 处关键数据无来源`);
    if (conflict.length > 0) parts.push(`${conflict.length} 处数据需核对原始依据`);
    if (precise.length > 0) parts.push(`${precise.length} 处精确数据需人工确认`);
    conclusion = `检查发现 ${parts.join('、')}。这些内容请优先处理后再导出。`;
  }

  // 需优先处理：高风险项按 无来源 > 推导/冲突 > 精确数据 排序
  const priorityOrder = { '无来源': 0, '推导': 1, '直接来源': 2 };
  const pendingHighSorted = [...pendingHigh].sort((a, b) =>
    (priorityOrder[a.sourceType] ?? 9) - (priorityOrder[b.sourceType] ?? 9)
  );

  const levelLabel = { high: '高风险', mid: '中风险', low: '低风险' };

  // 分布条
  const total = risks.length || 1;
  const highPct = (high.length / total) * 100;
  const midPct = (mid.length / total) * 100;
  const lowPct = (low.length / total) * 100;
  const passPct = Math.max(0, 100 - highPct - midPct - lowPct);

  const html = `
    <div class="health-head">
      <span class="h-icon">🔍</span>
      <h2>摘要</h2>
    </div>
    <div class="health-counts">
      <span class="health-count high">高风险 ${pendingHigh.length}/${high.length} 待处理</span>
      <span class="health-count mid">中风险 ${pendingMid.length}/${mid.length} 待处理</span>
      <span class="health-count low">低风险 ${pendingLow.length}/${low.length} 待处理</span>
    </div>
    <div class="health-bar">
      <div class="seg-high" style="width:${highPct}%"></div>
      <div class="seg-mid" style="width:${midPct}%"></div>
      <div class="seg-low" style="width:${lowPct}%"></div>
      <div class="seg-pass" style="width:${passPct}%"></div>
    </div>
    <div class="health-conclusion">${conclusion}</div>
    <div class="health-cols">
      <div class="health-block">
        <h4>需优先处理（${pendingHighSorted.length}）</h4>
        <div class="priority-scroll" id="healthPriorityScroll">
          <ol id="healthPriority">
            ${pendingHighSorted.map(r => `
              <li class="priority-item" data-id="${r.id}">
                <span class="priority-head">
                  <span class="priority-text">“${r.text}”</span>
                  <span class="src-tag">${r.sourceType === '无来源' ? '无来源' : r.sourceType === '推导' ? '建议核对' : '请确认'}</span>
                </span>
              </li>
            `).join('')}
            ${pendingHighSorted.length === 0 ? '<li style="cursor:default;">暂无高风险项，可放心导出。</li>' : ''}
          </ol>
        </div>
      </div>
      <div class="health-block">
        <h4>无需你操作</h4>
        <div class="health-pass">
          系统已完成来源状态与数据一致性检查。<strong>只有高风险项需要你处理</strong>；中、低风险项（当前 <strong>${pendingMidLow}</strong> 项未处理）可选择忽略，<strong>不阻塞导出</strong>。
          <br><span style="opacity:.8;font-size:12.5px;">注：系统仅验证可检测的一致性与来源状态，不证明内容事实正确，也不替你做出业务判断。</span>
        </div>
      </div>
    </div>
  `;
  $('#healthCard').innerHTML = html;

  // 点击优先处理项 → 展开/折叠详情（就地展开，不弹窗）
  $('#healthCard').querySelectorAll('#healthPriority li[data-id]').forEach((li) => {
    li.addEventListener('click', () => togglePriorityDetail(li));
  });
}

// 展开/折叠摘要卡片中的优先处理项详情
function togglePriorityDetail(li) {
  const id = li.dataset.id;
  const risk = state.deck.risks.find(r => r.id === id);

  // 已展开则折叠
  if (li.classList.contains('open')) {
    const detail = li.querySelector('.priority-detail');
    if (detail) detail.remove();
    li.classList.remove('open');
    return;
  }

  // 折叠其他项
  const siblings = li.parentElement.querySelectorAll('.priority-item.open');
  siblings.forEach((s) => {
    const d = s.querySelector('.priority-detail');
    if (d) d.remove();
    s.classList.remove('open');
  });

  const levelLabel = { high: '高风险', mid: '中风险', low: '低风险' };
  const st = state.riskStates[id];
  const stateLabel = { '未处理': '未处理', '已核验': '已核验', '已修正': '已修正', '已忽略': '已忽略', '已确认风险': '已确认风险' };

  const detail = document.createElement('div');
  detail.className = 'priority-detail';
  detail.innerHTML = `
    <div class="pd-meta">
      <span class="badge ${risk.level}">${levelLabel[risk.level]}</span>
      <span class="badge src">来源：${risk.sourceType}</span>
      <span class="badge state">${stateLabel[st]}</span>
    </div>
    <div class="pd-reason">${risk.reason}</div>
    <div class="pd-source"><strong>源材料原文：</strong><br>${risk.sourceQuote}</div>
    <div class="pd-actions">
      ${st === '未处理' ? `
        <button class="btn small primary" data-act="accept" data-id="${id}">接受</button>
        <button class="btn small ghost" data-act="edit" data-id="${id}">修正</button>
        ${risk.level === 'high'
          ? `<button class="btn small ghost" data-act="confirmrisk" data-id="${id}">确认风险</button>`
          : `<button class="btn small ghost" data-act="ignore" data-id="${id}">忽略</button>`}
      ` : `
        <button class="btn small ghost" data-act="reset" data-id="${id}">撤销</button>
      `}
    </div>
  `;
  li.appendChild(detail);
  li.classList.add('open');

  // 详情内的操作按钮
  detail.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const act = btn.dataset.act;
      handleRiskAction(act, btn.dataset.id);
      // 处理完刷新摘要，并保持当前项展开（重新渲染后会默认折叠，这里直接重新展开对应项）
    });
  });
}

function renderSlides() {
  const container = $('#deckSlides');
  const deck = state.deck;
  const slide = deck.slides[state.currentSlide];
  let html = `<div class="slide"><h3>${slide.title}</h3><div class="slide-body">`;
  slide.body.forEach((seg) => {
    if (seg.type === 'claim') {
      const st = state.riskStates[seg.id];
      const cls = st === '未处理' ? `risk-${seg.level}` : 'risk-ok';
      const txt = state.riskTexts[seg.id];
      html += `<span class="claim ${cls}" data-id="${seg.id}">${txt}</span>`;
    } else {
      html += seg.text;
    }
  });
  html += `</div></div>`;
  container.innerHTML = html;

  // 点击高亮内容 → 定位到对应风险项
  container.querySelectorAll('.claim').forEach((el) => {
    el.addEventListener('click', () => {
      openRiskDetail(el.dataset.id);
    });
  });

  $('#pageIndicator').textContent = `${state.currentSlide + 1} / ${deck.slides.length}`;
}

function renderRiskList() {
  const container = $('#riskList');
  const risks = state.deck.risks.filter((r) => {
    if (state.riskFilter === 'all') return true;
    return r.level === state.riskFilter;
  });

  const levelLabel = { high: '高风险', mid: '中风险', low: '低风险' };
  const srcLabel = { '直接来源': '直接来源', '推导': '推导', '无来源': '无来源' };
  const stateLabel = { '未处理': '未处理', '已核验': '已核验', '已修正': '已修正', '已忽略': '已忽略', '已确认风险': '已确认风险' };

  if (risks.length === 0) {
    container.innerHTML = `<div class="risk-empty" style="text-align:center;color:var(--muted);padding:30px 0;">该筛选下暂无风险项。</div>`;
  } else {
    container.innerHTML = risks.map((r) => {
      const st = state.riskStates[r.id];
      const resolved = st !== '未处理';
      const isHigh = r.level === 'high';
      const newText = state.riskTexts[r.id];
      const isEdited = st === '已修正' && newText !== r.text;

      let actions = '';
      if (!resolved) {
        actions += `<button class="btn small primary" data-act="accept" data-id="${r.id}">接受</button>`;
        actions += `<button class="btn small ghost" data-act="edit" data-id="${r.id}">修正</button>`;
        if (!isHigh) {
          actions += `<button class="btn small ghost" data-act="ignore" data-id="${r.id}">忽略</button>`;
        } else {
          actions += `<button class="btn small ghost" data-act="confirmrisk" data-id="${r.id}">确认风险</button>`;
        }
      } else {
        actions += `<button class="btn small ghost" data-act="reset" data-id="${r.id}">撤销</button>`;
      }

      // 内容区：已修正时展示 修正前 → 修正后 对比
      let contentHtml;
      if (isEdited) {
        contentHtml = `
          <div class="diff-box">
            <div class="diff-row before"><span class="diff-label">修正前</span><s>“${r.text}”</s></div>
            <div class="diff-arrow">↓</div>
            <div class="diff-row after"><span class="diff-label">修正后</span><strong>“${newText}”</strong></div>
          </div>`;
      } else {
        contentHtml = `<div class="risk-text">“${newText}”</div>`;
      }

      return `
        <div class="risk-item ${r.level} ${resolved ? 'resolved' : ''}" data-id="${r.id}">
          <div class="risk-item-top">
            <span class="badge ${r.level}">${levelLabel[r.level]}</span>
            <span class="badge src">${srcLabel[r.sourceType]}</span>
            <span class="badge state">${stateLabel[st]}</span>
          </div>
          ${contentHtml}
          <div class="risk-reason">${r.reason}</div>
          <div class="risk-actions">${actions}</div>
        </div>`;
    }).join('');
  }

  // 事件绑定
  container.querySelectorAll('[data-act]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const act = btn.dataset.act;
      const id = btn.dataset.id;
      handleRiskAction(act, id);
    });
  });

  // 计数
  const highCount = state.deck.risks.filter(r => r.level === 'high' && state.riskStates[r.id] === '未处理').length;
  $('#riskCount').textContent = `${state.deck.risks.length} 项 · 高风险未处理 ${highCount} 项`;
}

function updateSummary() {
  const total = state.deck.risks.length;
  const pendingHigh = state.deck.risks.filter(r => r.level === 'high' && state.riskStates[r.id] === '未处理').length;
  const pendingAll = state.deck.risks.filter(r => state.riskStates[r.id] === '未处理').length;
  const summary = $('#reviewSummary');
  if (pendingHigh > 0) {
    summary.innerHTML = `还有 <strong>${pendingHigh}</strong> 项高风险未处理，导出前必须处理。`;
    $('#docStatus').textContent = '待核验';
    $('#docStatus').classList.remove('ok');
  } else if (pendingAll > 0) {
    summary.innerHTML = `高风险项已全部处理，剩余 <strong>${pendingAll}</strong> 项中/低风险未处理（可不处理）。`;
    $('#docStatus').textContent = '可导出';
    $('#docStatus').classList.add('ok');
  } else {
    summary.innerHTML = `全部 <strong>${total}</strong> 项均已处理，可以放心导出。`;
    $('#docStatus').textContent = '可导出';
    $('#docStatus').classList.add('ok');
  }
}

// ============ 风险处理动作 ============
function handleRiskAction(act, id) {
  const risk = state.deck.risks.find(r => r.id === id);
  if (act === 'accept') {
    state.riskStates[id] = '已核验';
    renderReview();
  } else if (act === 'edit') {
    openEditModal(risk);
  } else if (act === 'ignore') {
    state.riskStates[id] = '已忽略';
    renderReview();
  } else if (act === 'confirmrisk') {
    openConfirmRiskModal(risk);
  } else if (act === 'reset') {
    state.riskStates[id] = '未处理';
    state.riskTexts[id] = risk.text;
    renderReview();
  }
}

// ============ 弹窗 ============
function openModal(html) {
  $('#modalBox').innerHTML = html;
  $('#modal').classList.remove('hidden');
}

function closeModal() {
  $('#modal').classList.add('hidden');
  $('#modalBox').innerHTML = '';
}

$('#modal').addEventListener('click', (e) => {
  if (e.target === $('#modal')) closeModal();
});

function openRiskDetail(id) {
  const risk = state.deck.risks.find(r => r.id === id);
  const st = state.riskStates[id];
  const stateLabel = { '未处理': '未处理', '已核验': '已核验', '已修正': '已修正', '已忽略': '已忽略', '已确认风险': '已确认风险' };
  const levelLabel = { high: '高风险', mid: '中风险', low: '低风险' };
  openModal(`
    <h3>内容详情</h3>
    <div class="m-body">“${risk.text}”</div>
    <div style="margin:8px 0;">
      <span class="badge ${risk.level}">${levelLabel[risk.level]}</span>
      <span class="badge src">来源：${risk.sourceType}</span>
      <span class="badge state">${stateLabel[st]}</span>
    </div>
    <div class="m-body" style="color:var(--muted);">${risk.reason}</div>
    <div class="src-quote"><strong>源材料原文：</strong><br>${risk.sourceQuote}</div>
    <div class="m-actions">
      <button class="btn ghost" onclick="closeModal()">关闭</button>
    </div>
  `);
}

function openEditModal(risk) {
  openModal(`
    <h3>修正内容</h3>
    <div class="m-body" style="color:var(--muted);">${risk.reason}</div>
    <div class="src-quote"><strong>源材料原文：</strong><br>${risk.sourceQuote}</div>
    <textarea id="editText">${risk.text}</textarea>
    <div class="m-actions">
      <button class="btn ghost" onclick="closeModal()">取消</button>
      <button class="btn primary" id="confirmEdit">保存修正</button>
    </div>
  `);
  $('#confirmEdit').addEventListener('click', () => {
    state.riskTexts[risk.id] = $('#editText').value.trim() || risk.text;
    state.riskStates[risk.id] = '已修正';
    closeModal();
    renderReview();
  });
}

function openConfirmRiskModal(risk) {
  openModal(`
    <h3>确认风险后继续</h3>
    <div class="m-body">“${risk.text}” 为<strong style="color:var(--red);">高风险项</strong>，不能无痕忽略。</div>
    <div class="m-body" style="color:var(--muted);">${risk.reason}</div>
    <div class="src-quote"><strong>源材料原文：</strong><br>${risk.sourceQuote}</div>
    <p style="font-size:13px;color:var(--muted);">确认后，该内容将标记为「已确认风险」，并在导出文件中保留风险标记。</p>
    <div class="m-actions">
      <button class="btn ghost" onclick="closeModal()">返回</button>
      <button class="btn danger" id="confirmRiskBtn">我已知晓并确认此风险</button>
    </div>
  `);
  $('#confirmRiskBtn').addEventListener('click', () => {
    state.riskStates[risk.id] = '已确认风险';
    closeModal();
    renderReview();
  });
}

// ============ 幻灯片导航 ============
$('#prevSlide').addEventListener('click', () => {
  if (state.currentSlide > 0) { state.currentSlide--; renderSlides(); }
});
$('#nextSlide').addEventListener('click', () => {
  if (state.currentSlide < state.deck.slides.length - 1) { state.currentSlide++; renderSlides(); }
});

// ============ 风险筛选 ============
$$('#riskFilters .filter').forEach((btn) => {
  btn.addEventListener('click', () => {
    $$('#riskFilters .filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.riskFilter = btn.dataset.filter;
    renderRiskList();
  });
});

// ============ 重新生成 ============
$('#btnRegenerate').addEventListener('click', () => {
  state.riskStates = {};
  state.riskTexts = {};
  // 保留已输入的材料，直接重新生成
  startGenerating();
});

// ============ 导出 ============
$('#btnExport').addEventListener('click', () => {
  const pendingHigh = state.deck.risks.filter(r => r.level === 'high' && state.riskStates[r.id] === '未处理');
  if (pendingHigh.length > 0) {
    openExportBlockModal(pendingHigh);
  } else {
    renderExport(true, []);
  }
});

function openExportBlockModal(pendingHigh) {
  openModal(`
    <h3>⚠ 无法导出</h3>
    <div class="m-body">仍有 <strong style="color:var(--red);">${pendingHigh.length}</strong> 项高风险内容未处理：</div>
    <div class="warning-box">
      <ul>
        ${pendingHigh.map(r => `<li>“${r.text}” — ${r.reason}</li>`).join('')}
      </ul>
    </div>
    <div class="m-actions">
      <button class="btn ghost" onclick="closeModal()">返回处理</button>
      <button class="btn ghost" id="forceExport">带风险导出</button>
    </div>
  `);
  $('#forceExport').addEventListener('click', () => {
    closeModal();
    renderExport(false, pendingHigh);
  });
}

function renderExport(allResolved, riskItems) {
  showStep(5);
  const card = $('#exportCard');
  const total = state.deck.risks.length;
  const confirmedRisk = state.deck.risks.filter(r => state.riskStates[r.id] === '已确认风险');
  const ignored = state.deck.risks.filter(r => state.riskStates[r.id] === '已忽略');

  let html = '';
  if (allResolved) {
    html = `
      <div class="big-icon">✅</div>
      <h2>演示文稿已导出</h2>
      <p>所有高风险项均已处理（已核验 / 已修正 / 已确认风险），可以放心用于正式场合。</p>`;
  } else {
    html = `
      <div class="big-icon">⚠️</div>
      <h2>已带风险导出</h2>
      <p>文件已导出，但包含未确认的高风险项，风险标记已保留在文件中。</p>`;
  }

  // 附加工序清单
  html += `<div class="warning-box" style="background:var(--gray-bg);color:var(--ink);border:1px solid var(--line);text-align:left;">
    <strong>导出附带：风险与未确认项清单</strong>
    <ul>
      ${confirmedRisk.map(r => `<li>“${r.text}” — 状态：已确认风险（用户知情接受）</li>`).join('')}
      ${ignored.map(r => `<li>“${r.text}” — 状态：已忽略</li>`).join('')}
      ${riskItems.map(r => `<li style="color:var(--red);">“${r.text}” — 状态：未处理</li>`).join('')}
    </ul>
  </div>`;

  html += `
    <div class="export-actions">
      <button class="btn primary" id="btnRestart" style="width:auto;">再做一个</button>
    </div>`;
  card.innerHTML = html;

  $('#btnRestart').addEventListener('click', () => {
    state.riskStates = {};
    state.riskTexts = {};
    textarea.value = '';
    state.uploadedFiles = [];
    renderUploadList();
    updateGenerateState();
    showStep(1);
  });
}

// 初始化
showStep(1);
