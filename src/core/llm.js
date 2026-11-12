/*
 * 模型调用客户端（浏览器直连，零依赖）
 *
 * 为什么不走代理：实测 POST https://api.deepseek.com/chat/completions 对
 * Origin: null 返回 access-control-allow-origin: null，file:// 打开可直接调，
 * 本机单人测试不需要额外进程。key 存在独立的 localStorage 项里，不进仓库、
 * 不进导出 JSON。要给别人用或上线时必须换成服务端代理。
 *
 * 这一层只负责「把话发出去、把 JSON 拿回来」，不含任何出题判断。
 * 判断在 agents.js（提示词）/ validate.js（代码闸）/ pipeline.js（编排）。
 */
(function (root) {
  const SHT = (root.SHT = root.SHT || {});

  const CONFIG_KEY = 'sht-llm-config-v1';
  const DEFAULTS = {
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    key: '',
    temperature: 0.6,
    maxTokens: 1600,
    timeoutMs: 90000
  };

  let config = null;
  const log = [];

  function load() {
    if (config) return config;
    let saved = {};
    try {
      saved = JSON.parse(root.localStorage.getItem(CONFIG_KEY) || '{}') || {};
    } catch (e) {
      saved = {};
    }
    config = Object.assign({}, DEFAULTS, saved);
    return config;
  }

  // 自增编号：审计台按它增量取「这次又发生了哪些调用」。
  // 用下标不行——日志超过 200 条会 shift，下标会往前漂，取重或取漏。
  let seq = 0;

  function record(entry) {
    seq += 1;
    log.push(Object.assign({ id: seq, at: new Date().toISOString() }, entry));
    if (log.length > 200) log.shift();
    return entry;
  }

  function classify(res, text) {
    if (res.status === 401 || res.status === 403) return { type: 'auth', message: '密钥无效或没有权限（HTTP ' + res.status + '）' };
    if (res.status === 402) return { type: 'quota', message: '账户余额不足（HTTP 402）' };
    if (res.status === 429) return { type: 'rate', message: '被限流（HTTP 429），稍后重试' };
    if (res.status >= 500) return { type: 'server', message: '服务端错误（HTTP ' + res.status + '）' };
    if (res.status === 400) return { type: 'bad_request', message: '请求被拒（HTTP 400）：' + String(text || '').slice(0, 160) };
    return { type: 'http', message: 'HTTP ' + res.status + '：' + String(text || '').slice(0, 160) };
  }

  // 模型偶尔会在 JSON 前后加解释、闭合不成对。先截取最外层大括号再试一次。
  function parseJsonLoose(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { /* 继续尝试 */ }
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try { return JSON.parse(raw.slice(start, end + 1)); } catch (e) { /* 放弃 */ }
    }
    return null;
  }

  /**
   * 发一次 chat/completions。
   * @param {object} opts {role, system, user, json, temperature, maxTokens, timeoutMs}
   * @returns {Promise<{ok:boolean, json?:object, text?:string, usage?:object, ms:number, error?:object}>}
   * 不抛异常：失败也返回对象，调用方据 error.type 决定重试还是记失败。
   */
  async function call(opts) {
    const cfg = load();
    const o = opts || {};
    const started = Date.now();

    /*
     * 审计要能回答「这次调用，模型到底看到了什么」——尤其是验证角色有没有
     * 看到学情。所以把这轮发的 system / user 留在内存日志里（各截 4000 字），
     * 只在本次会话内可读，不写 localStorage、不进导出 JSON。
     * 为什么截断：一整轮的提示词加起来有几十 KB，全留会把日志区拖垮；
     * 4000 字足够覆盖「待检的题」与「错题画像」这两个关键段落。
     */
    function trace(entry) {
      return record(Object.assign({
        system: String(o.system || '').slice(0, 4000),
        user: String(o.user || '').slice(0, 4000)
      }, entry));
    }

    if (!cfg.key) {
      return trace({ role: o.role || '', ok: false, ms: 0, errorType: 'no_key', message: '还没填 API Key', tokens: 0 });
    }
    if (typeof root.fetch !== 'function') {
      return trace({ role: o.role || '', ok: false, ms: 0, errorType: 'no_fetch', message: '当前环境没有 fetch', tokens: 0 });
    }

    const body = {
      model: cfg.model,
      messages: [
        { role: 'system', content: String(o.system || '') },
        { role: 'user', content: String(o.user || '') }
      ],
      temperature: o.temperature == null ? cfg.temperature : o.temperature,
      max_tokens: o.maxTokens == null ? cfg.maxTokens : o.maxTokens,
      stream: false
    };
    if (o.json !== false) body.response_format = { type: 'json_object' };

    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, o.timeoutMs || cfg.timeoutMs);

    let res, text;
    try {
      res = await fetch(cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + cfg.key
        },
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
    } catch (e) {
      clearTimeout(timer);
      const aborted = e && (e.name === 'AbortError' || String(e.message).indexOf('abort') >= 0);
      const ms = Date.now() - started;
      return trace({
        role: o.role || '', ok: false, ms: ms,
        errorType: aborted ? 'timeout' : 'network',
        message: aborted ? '超过 ' + Math.round((o.timeoutMs || cfg.timeoutMs) / 1000) + ' 秒没返回'
          : '网络不通：' + (e && e.message ? e.message : '未知错误') + '（检查代理或 CORS）',
        tokens: 0
      });
    }
    clearTimeout(timer);

    try {
      text = await res.text();
    } catch (e) {
      text = '';
    }

    if (!res.ok) {
      const err = classify(res, text);
      return trace({ role: o.role || '', ok: false, ms: Date.now() - started, errorType: err.type, message: err.message, tokens: 0 });
    }

    let payload = null;
    try { payload = JSON.parse(text); } catch (e) { payload = null; }
    if (!payload || !payload.choices || !payload.choices[0]) {
      return trace({ role: o.role || '', ok: false, ms: Date.now() - started, errorType: 'empty', message: '返回里没有 choices', tokens: 0 });
    }

    const content = payload.choices[0].message ? payload.choices[0].message.content : '';
    const usage = payload.usage || {};
    const ms = Date.now() - started;

    if (o.json === false) {
      return trace({ role: o.role || '', ok: true, ms: ms, text: String(content || ''), usage: usage, tokens: usage.total_tokens || 0 });
    }

    const parsed = parseJsonLoose(content);
    if (!parsed) {
      return trace({
        role: o.role || '', ok: false, ms: ms, errorType: 'json',
        message: '返回的不是合法 JSON：' + String(content || '').slice(0, 120),
        text: String(content || ''), tokens: usage.total_tokens || 0
      });
    }

    return trace({ role: o.role || '', ok: true, ms: ms, json: parsed, text: String(content || ''), usage: usage, tokens: usage.total_tokens || 0 });
  }

  SHT.llm = {
    config: load,
    defaults: DEFAULTS,
    save: function (patch) {
      const next = Object.assign({}, load(), patch || {});
      config = next;
      try { root.localStorage.setItem(CONFIG_KEY, JSON.stringify(next)); } catch (e) { /* 隐私模式忽略 */ }
      return next;
    },
    isReady: function () { const c = load(); return !!(c.key && c.baseUrl && c.model); },
    maskedKey: function () {
      const k = load().key || '';
      if (!k) return '';
      return k.length <= 8 ? '****' : k.slice(0, 4) + '****' + k.slice(-4);
    },
    call: call,
    log: function () { return log.slice(); },
    // 审计台读这个：每条都带 system / user 原文（截断 4000 字）、返回 json、耗时
    trace: function () { return log.slice(); },
    clearLog: function () { log.length = 0; },
    lastError: function () {
      for (let i = log.length - 1; i >= 0; i -= 1) {
        if (!log[i].ok) return log[i];
      }
      return null;
    },
    stats: function () {
      return log.reduce(function (s, e) {
        s.calls += 1;
        if (e.ok) s.ok += 1; else s.fail += 1;
        s.tokens += e.tokens || 0;
        s.ms += e.ms || 0;
        return s;
      }, { calls: 0, ok: 0, fail: 0, tokens: 0, ms: 0 });
    }
  };
})(window);
