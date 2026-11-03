import { calculateEconomics } from './lib/economics.js';
import { readState, writeState } from './lib/storage.js';

(() => {
  'use strict';
  const $ = (s) => document.querySelector(s),
    $$ = (s) => [...document.querySelectorAll(s)];
  const key = 'interview-workbench:v1';
  const schema = {
    questionIds: $$('.qa').map((q) => q.id),
    noteIds: $$('textarea[data-note]').map((t) => t.dataset.note),
    checkIds: $$('input[data-check]').map((c) => c.dataset.check),
  };
  let browserStorage = null;
  try {
    browserStorage = window.localStorage;
  } catch {}
  const loaded = readState(browserStorage, key, schema);
  let state = loaded.state;
  let storage = loaded.ok;
  function save() {
    const result = writeState(browserStorage, key, state);
    storage = result.ok;
    $('#saveStatus').textContent = result.ok
      ? '练习笔记已保存在此浏览器'
      : '浏览器未保存，请导出练习笔记';
    $('#saveStatus').classList.toggle('storage-warning', !result.ok);
    updateProgress();
  }
  function toast(t) {
    $('#toast').textContent = t;
    $('#toast').classList.add('show');
    clearTimeout(window.toastTimer);
    window.toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 2300);
  }
  const questions = $$('.qa').map((el) => ({
    id: el.id,
    title: el.querySelector('summary').textContent.trim(),
    category: el.dataset.category || '面试练习',
    priority: el.dataset.priority || 'extra',
    text: el.querySelector('.answer').textContent.trim(),
    el,
  }));
  $('#questionCount').textContent = questions.length;
  $('#mustCount').textContent = questions.filter((q) => q.priority === 'must').length;
  function updateProgress() {
    const done = questions.filter((q) => state.done.includes(q.id)).length;
    $('#progressLabel').textContent = done + ' / ' + questions.length + ' 题';
    $('#progressFill').style.width = (questions.length ? (done / questions.length) * 100 : 0) + '%';
  }
  function toggle(kind, id, button) {
    const a = state[kind],
      i = a.indexOf(id);
    if (i < 0) a.push(id);
    else a.splice(i, 1);
    button.setAttribute('aria-pressed', a.includes(id));
    button.textContent =
      kind === 'favorite'
        ? a.includes(id)
          ? '★ 已标重点'
          : '☆ 标记重点'
        : a.includes(id)
          ? '✓ 已练习'
          : '○ 标记已练';
    save();
  }
  questions.forEach((q) => {
    const tools = document.createElement('div');
    tools.className = 'qa-tools';
    for (const kind of ['favorite', 'done']) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn';
      b.setAttribute('aria-pressed', state[kind].includes(q.id));
      b.textContent =
        kind === 'favorite'
          ? state[kind].includes(q.id)
            ? '★ 已标重点'
            : '☆ 标记重点'
          : state[kind].includes(q.id)
            ? '✓ 已练习'
            : '○ 标记已练';
      b.addEventListener('click', () => toggle(kind, q.id, b));
      tools.append(b);
    }
    const meta = document.createElement('span');
    meta.className = 'question-meta';
    meta.textContent = q.category;
    tools.append(meta);
    q.el.append(tools);
  });
  $$('textarea[data-note]').forEach((t) => {
    if (state.notes[t.dataset.note] !== undefined) t.value = state.notes[t.dataset.note];
    t.addEventListener('input', () => {
      state.notes[t.dataset.note] = t.value;
      save();
    });
  });
  $$('input[data-check]').forEach((c) => {
    c.checked = !!state.checks[c.dataset.check];
    c.addEventListener('change', () => {
      state.checks[c.dataset.check] = c.checked;
      save();
    });
  });
  if (!storage) $('#saveStatus').textContent = '本地保存不可用，请导出练习笔记';
  updateProgress();
  function clearSearch() {
    $('#search').value = '';
    $('#filter').value = 'all';
    renderSearch();
  }
  function jump(id) {
    clearSearch();
    const t = document.getElementById(id);
    if (!t) return;
    if (t.tagName === 'DETAILS') t.open = true;
    t.scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#sidebar').classList.remove('open');
    $('#menu').setAttribute('aria-expanded', 'false');
  }
  function renderSearch() {
    const term = $('#search').value.trim().toLowerCase(),
      filter = $('#filter').value;
    const active = term || filter !== 'all';
    $('#searchPanel').hidden = !active;
    $('#chapters').hidden = !!active;
    if (!active) return;
    const found = questions.filter(
      (q) =>
        (!term || (q.title + ' ' + q.text + ' ' + q.category).toLowerCase().includes(term)) &&
        (filter === 'all' ||
          (filter === 'must' && q.priority === 'must') ||
          (filter === 'favorite' && state.favorite.includes(q.id)) ||
          (filter === 'unpracticed' && !state.done.includes(q.id))),
    );
    $('#searchCount').textContent = found.length + ' 道相关练习题';
    const list = $('#searchList');
    list.replaceChildren();
    if (!found.length) {
      const d = document.createElement('div');
      d.className = 'empty';
      d.textContent = '没有找到匹配题目。试试“核销”“AI”“客户”或切换筛选。';
      list.append(d);
    }
    found.forEach((q) => {
      const d = document.createElement('article');
      d.className = 'search-hit';
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = q.category + (q.priority === 'must' ? ' · 必练' : '');
      const h = document.createElement('h3');
      h.textContent = q.title;
      const p = document.createElement('p');
      p.textContent = q.text.slice(0, 170) + '…';
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = '查看答案与追问 →';
      b.addEventListener('click', () => jump(q.id));
      d.append(tag, h, p, b);
      list.append(d);
    });
  }
  $('#search').addEventListener('input', renderSearch);
  $('#filter').addEventListener('change', () => {
    renderSearch();
    if ($('#filter').value !== 'all') $('#searchPanel').scrollIntoView({ behavior: 'smooth' });
  });
  $('#clearSearch').addEventListener('click', clearSearch);
  $$('[data-jump]').forEach((b) => b.addEventListener('click', () => jump(b.dataset.jump)));
  $$('.sidebar nav a').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      jump(a.getAttribute('href').slice(1));
    }),
  );
  $('#menu').addEventListener('click', () => {
    const open = $('#sidebar').classList.toggle('open');
    $('#menu').setAttribute('aria-expanded', open);
  });
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 800 && !e.target.closest('#sidebar') && !e.target.closest('#menu')) {
      $('#sidebar').classList.remove('open');
      $('#menu').setAttribute('aria-expanded', 'false');
    }
  });
  if ('IntersectionObserver' in window) {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            $$('.sidebar nav a').forEach((a) =>
              a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id),
            );
          }
        });
      },
      { rootMargin: '-15% 0px -65% 0px', threshold: 0 },
    );
    $$('.chapter').forEach((s) => obs.observe(s));
  }
  $('#onlyMust').addEventListener('click', () => {
    $('#filter').value = 'must';
    renderSearch();
    $('#searchPanel').scrollIntoView({ behavior: 'smooth' });
  });
  let printState = [];
  window.addEventListener('beforeprint', () => {
    printState = questions.map((q) => q.el.open);
    questions.forEach((q) => (q.el.open = true));
    $$('textarea').forEach((t) => {
      t.style.height = Math.max(90, t.scrollHeight) + 'px';
    });
  });
  window.addEventListener('afterprint', () => {
    questions.forEach((q, i) => (q.el.open = printState[i]));
  });
  $('#print').addEventListener('click', () => window.print());
  $('#export').addEventListener('click', () => {
    const lines = [
      '# Interview Workbench · 面试练习笔记',
      '',
      '仅供个人练习；请妥善保管导出的内容。',
      '',
      '## 我的案例与回答',
    ];
    $$('textarea[data-note]').forEach((t) => {
      const label = t.id ? document.querySelector('label[for="' + CSS.escape(t.id) + '"]') : null;
      lines.push(
        '\n### ' +
          (label ? label.textContent : t.dataset.note) +
          '\n' +
          (t.value.trim() || '（尚未填写）'),
      );
    });
    lines.push('\n## 已标重点');
    questions
      .filter((q) => state.favorite.includes(q.id))
      .forEach((q) => lines.push('- ' + q.title));
    lines.push('\n## 已练习');
    questions.filter((q) => state.done.includes(q.id)).forEach((q) => lines.push('- ' + q.title));
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    const u = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = u;
    a.download = 'interview-workbench-notes.md';
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1500);
    toast('练习笔记已导出');
  });
  const quiz = $('#quiz');
  let current = null,
    tick = null,
    remaining = 90,
    asked = [];
  const categories = [...new Set(questions.map((q) => q.category))];
  categories.forEach((c) => {
    const op = document.createElement('option');
    op.value = c;
    op.textContent = c;
    $('#quizCategory').append(op);
  });
  function updateTimer() {
    $('#timer').textContent =
      Math.floor(remaining / 60)
        .toString()
        .padStart(2, '0') +
      ':' +
      (remaining % 60).toString().padStart(2, '0');
    $('#timer').classList.toggle('finished', remaining <= 0);
  }
  function pauseTimer() {
    if (tick) {
      clearInterval(tick);
      tick = null;
    }
    $('#timerStart').textContent = '开始计时';
  }
  function resetTimer() {
    pauseTimer();
    remaining = Number($('#duration').value);
    updateTimer();
  }
  function nextQuestion() {
    pauseTimer();
    const cat = $('#quizCategory').value;
    let pool = questions.filter((q) => cat === 'all' || q.category === cat);
    let fresh = pool.filter((q) => !asked.includes(q.id));
    if (!fresh.length) {
      asked = [];
      fresh = pool;
    }
    if (!fresh.length) return;
    current = fresh[Math.floor(Math.random() * fresh.length)];
    asked.push(current.id);
    $('#quizQuestion').textContent = current.title;
    $('#quizCategoryLabel').textContent =
      current.category + (current.priority === 'must' ? ' · 必练' : '');
    $('#quizAnswer').hidden = true;
    $('#showAnswer').textContent = '查看练习参考';
    $('#quizAnswer').innerHTML = current.el.querySelector('.answer').innerHTML;
    $('#quizAnswer')
      .querySelectorAll('[id]')
      .forEach((el) => el.removeAttribute('id'));
    $('#quizAnswer')
      .querySelectorAll('textarea,label')
      .forEach((el) => el.remove());
    resetTimer();
  }
  function openQuiz() {
    quiz.showModal();
    nextQuestion();
  }
  $('#startQuiz').addEventListener('click', openQuiz);
  $('#quizClose').addEventListener('click', () => quiz.close());
  quiz.addEventListener('close', pauseTimer);
  $('#nextQuestion').addEventListener('click', nextQuestion);
  $('#quizCategory').addEventListener('change', nextQuestion);
  $('#duration').addEventListener('change', resetTimer);
  $('#timerReset').addEventListener('click', resetTimer);
  $('#timerStart').addEventListener('click', () => {
    if (tick) {
      pauseTimer();
      return;
    }
    if (remaining <= 0) resetTimer();
    $('#timerStart').textContent = '暂停';
    tick = setInterval(() => {
      remaining--;
      updateTimer();
      if (remaining <= 0) {
        pauseTimer();
        toast('时间到，检查是否说清个人动作与结果');
      }
    }, 1000);
  });
  $('#showAnswer').addEventListener('click', () => {
    $('#quizAnswer').hidden = !$('#quizAnswer').hidden;
    $('#showAnswer').textContent = $('#quizAnswer').hidden ? '查看练习参考' : '收起参考';
  });
  $('#quizDone').addEventListener('click', () => {
    if (!current) return;
    if (!state.done.includes(current.id)) {
      state.done.push(current.id);
      const b = current.el.querySelectorAll('.qa-tools button')[1];
      b.setAttribute('aria-pressed', 'true');
      b.textContent = '✓ 已练习';
      save();
    }
    toast('已记录本题练习');
  });
  const ids = [
    'calcPrice',
    'calcCost',
    'calcOrders',
    'calcRate',
    'calcFee',
    'calcMarket',
    'calcOps',
  ];
  const fmt = (n) => new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 0 }).format(n);
  function calc() {
    const names = [
      'price',
      'cost',
      'orders',
      'redemptionRate',
      'feeRate',
      'marketing',
      'operations',
    ];
    const input = Object.fromEntries(ids.map((id, i) => [names[i], $('#' + id).value]));
    const r = calculateEconomics(input);
    $('#rRedeem').textContent = fmt(r.redeemed);
    $('#rRevenue').textContent = '¥' + fmt(r.revenue);
    $('#rContribution').textContent =
      (r.contribution < 0 ? '−¥' : '¥') + fmt(Math.abs(r.contribution));
    $('#rContribution').parentElement.classList.toggle('negative', r.contribution < 0);
    $('#rBreak').textContent = r.breakEvenOrders === null ? '无法平衡' : fmt(r.breakEvenOrders);
    $('#calcExplanation').textContent =
      r.unitContribution <= 0
        ? '每笔核销订单的贡献不为正，应先调整价格、服务成本或费用结构。'
        : Number(input.redemptionRate) <= 0
          ? '核销率为零时尚无已履约收入，应与支付金额区分。'
          : '每笔核销订单先贡献 ¥' +
            r.unitContribution.toFixed(2) +
            '，再覆盖营销与新增运营投入。全部参数均为练习假设。';
  }
  ids.forEach((id) => $('#' + id).addEventListener('input', calc));
  calc();
  $('#resetData').addEventListener('click', () => {
    if (
      !window.confirm(
        '清除本工具在此浏览器保存的笔记、重点和练习记录？此操作无法撤销，请先导出备份。',
      )
    )
      return;
    try {
      browserStorage?.removeItem(key);
      window.location.reload();
    } catch {
      toast('无法清除本地存储，请在浏览器设置中管理站点数据');
    }
  });
  $('#backtop').addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
})();
