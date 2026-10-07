(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const entry = $('private-entry'), dialog = $('private-dialog'), panel = $('private-panel');
  const input = $('private-password'), error = $('private-error'), submit = $('private-submit');
  const topbar = document.querySelector('.topbar');
  const alignPanel = () => { panel.style.top = Math.ceil(topbar.getBoundingClientRect().bottom + 12) + 'px'; };
  new ResizeObserver(alignPanel).observe(topbar);
  alignPanel();
  let session = null, expiryTimer, generation = 0, pending = null;
  const language = () => document.documentElement.dataset.lang === 'zh' ? 'zh' : 'en';
  const setLabel = () => {
    const label = session ? session.label[language()] : '••••••';
    entry.textContent = label;
    entry.setAttribute('aria-label', session ? label : '解锁访问');
    $('private-title').textContent = session ? label : '';
  };
  function hidePanel() {
    panel.hidden = true;
    document.body.classList.remove('private-open');
    entry.setAttribute('aria-expanded', 'false');
  }
  function clearSession() {
    session = null;
    clearTimeout(expiryTimer);
    hidePanel();
    panel.querySelector('iframe')?.remove();
    entry.removeAttribute('data-unlocked');
    input.value = '';
    setLabel();
  }
  function showPanel() {
    if (!session || session.expiresAt <= Date.now()) { clearSession(); return; }
    if (!panel.querySelector('iframe')) {
      const frame = document.createElement('iframe');
      frame.title = session.label[language()];
      frame.referrerPolicy = 'no-referrer';
      frame.src = '/private/view';
      panel.appendChild(frame);
    }
    panel.hidden = false;
    document.body.classList.add('private-open');
    entry.setAttribute('aria-expanded', 'true');
  }
  async function request(method, body, signal) {
    const response = await fetch('/private/session', {
      method, credentials: 'same-origin', cache: 'no-store', signal,
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    return { response, data: await response.json() };
  }
  entry.addEventListener('click', () => {
    if (session && session.expiresAt > Date.now()) { showPanel(); return; }
    clearSession();
    error.textContent = '';
    dialog.showModal();
    input.focus();
  });
  $('private-cancel').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    generation++;
    pending?.abort();
    pending = null;
    input.value = '';
    submit.disabled = false;
    submit.textContent = '解锁';
    entry.focus();
  });
  $('private-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled) return;
    if (location.protocol === 'file:') { error.textContent = '请从个人网站打开此入口。'; return; }
    const current = ++generation;
    pending = new AbortController();
    submit.disabled = true;
    submit.textContent = '正在验证…';
    error.textContent = '';
    const password = input.value;
    input.value = '';
    try {
      const { response, data } = await request('POST', { password }, pending.signal);
      if (current !== generation) return;
      if (!response.ok) {
        error.textContent = response.status === 429 ? `尝试次数过多，请约 ${Math.ceil(Number(response.headers.get('retry-after') || 900) / 60)} 分钟后再试。` : response.status === 401 ? '密码不正确，请重新输入。' : '暂时无法解锁，请稍后重试。';
        input.focus();
        return;
      }
      session = data;
      entry.setAttribute('data-unlocked', '');
      setLabel();
      expiryTimer = setTimeout(clearSession, Math.max(0, session.expiresAt - Date.now()));
      dialog.close();
      showPanel();
    } catch (cause) {
      if (current === generation && cause.name !== 'AbortError') error.textContent = '连接失败，请检查网络后重试。';
    } finally {
      if (current === generation) { submit.disabled = false; submit.textContent = '解锁'; pending = null; }
    }
  });
  $('private-lock').addEventListener('click', async () => {
    const button = $('private-lock');
    button.disabled = true;
    button.textContent = '正在锁定…';
    try {
      const { response } = await request('DELETE');
      if (!response.ok) throw new Error('lock');
      clearSession();
      entry.focus();
    } catch {
      button.textContent = '锁定失败，重试';
    } finally {
      button.disabled = false;
      if (!session) button.textContent = '重新锁定';
    }
  });
  $('private-close').addEventListener('click', hidePanel);
  document.querySelectorAll('.nav-link[data-view]').forEach(link => link.addEventListener('click', hidePanel));
  new MutationObserver(setLabel).observe(document.documentElement, { attributes: true, attributeFilter: ['data-lang'] });
  document.addEventListener('visibilitychange', () => { if (session && session.expiresAt <= Date.now()) clearSession(); });
  window.addEventListener('pagehide', clearSession);
  // Notice revocation in another tab without persisting secrets or content in browser storage.
  setInterval(async () => {
    if (!session || document.hidden) return;
    try { const { response } = await request('GET'); if (response.status === 401) clearSession(); } catch {}
  }, 60000);
})();
