/* 开发者面板：用户画像。按知识点切换，查看掌握度等多维环图。 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});
  SHT.devProfile = SHT.devProfile || {};
  SHT.devProfile.selectedKp = '';

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pct(v) { return v == null ? '待验证' : Math.round(v * 100) + '%'; }
  function secs(ms) { return ms ? (Math.round(ms / 100) / 10 + ' 秒') : '暂无'; }

  function ringSvg(kp) {
    const metrics = [
      { key: 'mastery', label: '掌握度', value: kp.mastery != null ? kp.mastery : kp.masteryScore, color: '#86b5df' },
      { key: 'independence', label: '独立性', value: kp.independenceRate, color: '#95c9a8' },
      { key: 'fluency', label: '熟练度', value: kp.fluency, color: '#e2c37f' },
      { key: 'retention', label: '保持度', value: kp.retention, color: '#b8a9d5' },
      { key: 'transfer', label: '迁移度', value: kp.transfer, color: '#8dc4c5' }
    ];
    const center = 120, baseR = 92, step = 15, stroke = 9;
    let svg = '<svg class="profile-ring-svg" viewBox="0 0 240 240" role="img" aria-label="单元板块多维掌握环图">';
    metrics.forEach(function (m, i) {
      const r = baseR - i * step;
      const c = 2 * Math.PI * r;
      const value = m.value == null ? 0 : Math.max(0, Math.min(1, m.value));
      svg += '<circle cx="' + center + '" cy="' + center + '" r="' + r + '" fill="none" stroke="#edf2f7" stroke-width="' + stroke + '"></circle>';
      if (value > 0) {
        svg += '<circle cx="' + center + '" cy="' + center + '" r="' + r + '" fill="none" stroke="' + m.color + '" stroke-width="' + stroke + '" stroke-linecap="round" stroke-dasharray="' + (c * value) + ' ' + (c * (1 - value)) + '" transform="rotate(-90 ' + center + ' ' + center + ')"></circle>';
      }
    });
    svg += '</svg>';
    return { svg: svg, metrics: metrics };
  }

  function render() {
    const root = document.getElementById('profileRoot');
    if (!root) return;
    const state = (SHT.devProfile.state && SHT.devProfile.state()) || {};
    const learner = SHT.learner && SHT.learner.build ? SHT.learner.build(state.events || []) : {};
    const profile = SHT.assessment && SHT.assessment.buildUserProfile
      ? SHT.assessment.buildUserProfile({ rounds: state.rounds || {}, events: state.events || [], learnerModel: learner })
      : null;
    if (!profile) { root.innerHTML = '<div class="profile-empty">评价模块尚未加载</div>'; return; }
    const kps = profile.knowledgePoints || [];
    if (!kps.length) {
      root.innerHTML = '<div class="profile-page"><div class="profile-head"><div><h2>用户画像</h2><p>按知识点查看掌握维度。</p></div></div><div class="profile-empty">还没有作答记录。完成一轮后这里会显示单元板块画像。</div></div>';
      return;
    }
    const selectedKey = kps.some(function (k) { return k.key === SHT.devProfile.selectedKp; })
      ? SHT.devProfile.selectedKp : kps[0].key;
    SHT.devProfile.selectedKp = selectedKey;
    const kp = kps.filter(function (k) { return k.key === selectedKey; })[0];
    const ring = ringSvg(kp);
    const options = kps.map(function (k) {
      return '<option value="' + esc(k.key) + '"' + (k.key === selectedKey ? ' selected' : '') + '>' +
        esc(k.kp) + ' · ' + esc(k.pathLabel || '') + '</option>';
    }).join('');
    const legend = ring.metrics.map(function (m) {
      return '<div class="profile-metric-row"><span><i style="background:' + m.color + '"></i>' + m.label + '</span><b>' + pct(m.value) + '</b></div>';
    }).join('');
    const list = kps.map(function (k) {
      return '<button type="button" class="profile-kp-row' + (k.key === selectedKey ? ' is-selected' : '') + '" data-profile-kp="' + esc(k.key) + '">' +
        '<div class="profile-kp-main"><strong>' + esc(k.kp) + '</strong><span class="profile-state ' + (k.tone || 'is-muted') + '">' + esc(k.stateLabel) + '</span></div>' +
        '<div class="profile-kp-meta"><span>掌握概率：' + pct(k.mastery) + '</span><span>覆盖率：' + pct(k.targetCount ? k.covered / k.targetCount : null) + '</span><span>建议：' + esc(k.nextAction && k.nextAction.action || '') + '</span></div>' +
        '<div class="profile-kp-evidence">' + (k.evidence || []).map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</div>' +
      '</button>';
    }).join('');
    root.innerHTML = '<div class="profile-page">' +
      '<div class="profile-head"><div><h2>用户画像</h2><p>选择当前单元的一个学习板块，查看掌握度、独立性、熟练度、保持度和迁移度。</p></div>' +
        '<span class="profile-version">' + esc(profile.version) + '</span></div>' +
      '<div class="profile-layout">' +
        '<section class="profile-panel profile-ring-panel">' +
          '<div class="profile-panel-title">单元板块掌握画像</div>' +
          '<div class="profile-kp-picker"><button type="button" class="profile-step" data-profile-step="-1" title="上一个板块">‹</button>' +
            '<select id="profileKpSelect" class="profile-select">' + options + '</select>' +
            '<button type="button" class="profile-step" data-profile-step="1" title="下一个板块">›</button></div>' +
          '<div class="profile-selected-name">' + esc(kp.pathLabel || '知识点') + ' · ' + esc(kp.kp) + '</div>' +
          '<div class="profile-ring-wrap">' + ring.svg + '</div>' +
          '<div class="profile-metric-list">' + legend + '</div>' +
        '</section>' +
        '<section class="profile-panel profile-detail-panel">' +
          '<div class="profile-panel-title">当前板块</div>' +
          '<div class="profile-detail-state ' + (kp.tone || 'is-muted') + '">' + esc(kp.stateLabel) + '</div>' +
          '<div class="profile-detail-grid">' +
            '<div><span>掌握概率</span><b>' + pct(kp.mastery) + '</b></div>' +
            '<div><span>目标覆盖</span><b>' + (kp.covered || 0) + ' / ' + (kp.targetCount || 0) + '</b></div>' +
            '<div><span>独立答对</span><b>' + (kp.independent || 0) + ' 次</b></div>' +
            '<div><span>提示后答对</span><b>' + (kp.assisted || 0) + ' 次</b></div>' +
            '<div><span>答错</span><b>' + (kp.wrong || 0) + ' 次</b></div>' +
            '<div><span>平均用时</span><b>' + secs(kp.averageMs) + '</b></div>' +
          '</div>' +
          '<div class="profile-detail-next">下一步：' + esc(kp.nextAction && kp.nextAction.action || '继续补测') + '</div>' +
          '<div class="profile-pending"><span>熟练度</span><b>待接入题目预计时长</b></div><div class="profile-pending"><span>保持度 / 迁移度</span><b>待后续反馈任务</b></div>' +
        '</section>' +
      '</div>' +
      '<section class="profile-panel profile-list-panel">' +
        '<div class="profile-panel-title">单元板块 <span>' + kps.length + ' 个</span></div>' + list +
      '</section>' +
      '<div class="profile-caveat">' + profile.caveats.map(esc).join('　') + '</div>' +
    '</div>';
    root.onchange = function (e) {
      if (e.target && e.target.id === 'profileKpSelect') {
        SHT.devProfile.selectedKp = e.target.value;
        render();
      }
    };
    root.onclick = function (e) {
      const target = e.target && e.target.closest ? e.target.closest('[data-profile-kp], [data-profile-step]') : null;
      if (!target) return;
      if (target.dataset.profileKp) {
        SHT.devProfile.selectedKp = target.dataset.profileKp;
        render();
        return;
      }
      const dir = Number(target.dataset.profileStep);
      const at = kps.findIndex(function (k) { return k.key === selectedKey; });
      const next = (at + dir + kps.length) % kps.length;
      SHT.devProfile.selectedKp = kps[next].key;
      render();
    };
  }

  SHT.devProfile.render = render;
})(window);
