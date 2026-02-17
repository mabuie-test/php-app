(function () {
  const API = '/api/support/chat';
  const STORAGE_KEY = 'support_chat_session_v1';
  const EMOJIS = ['😀', '😊', '😍', '🤝', '🙏', '🔥', '👍', '👏', '🎓', '💬'];

  let poll = null;
  let state = { sessionId: '', token: '', status: '' };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      state = { ...state, ...parsed };
    } catch (_) {}
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function fmtDate(ts) {
    if (!ts) return '';
    try { return new Date(ts).toLocaleString(); } catch { return ts; }
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function build() {
    if (document.getElementById('support-chat-root')) return;
    const root = document.createElement('div');
    root.id = 'support-chat-root';
    root.innerHTML = `
      <button id="support-chat-toggle" title="Atendimento">💬</button>
      <div id="support-chat-box" class="hidden">
        <div class="chat-head">
          <strong>Suporte ao cliente</strong>
          <button id="support-chat-close">✕</button>
        </div>
        <div id="chat-start-panel" class="chat-start">
          <input id="chat-guest-name" placeholder="Seu nome" />
          <input id="chat-guest-email" placeholder="Seu email (opcional)" />
          <textarea id="chat-first-message" rows="2" placeholder="Como podemos ajudar?"></textarea>
          <button id="chat-start-btn" class="chat-btn">Iniciar atendimento</button>
        </div>
        <div id="chat-room" class="hidden">
          <div id="chat-messages" class="chat-messages"></div>
          <div class="chat-tools">
            <input id="chat-file" type="file" />
            <div class="emoji-picker" id="emoji-picker"></div>
          </div>
          <div class="chat-compose">
            <textarea id="chat-input" rows="2" placeholder="Digite sua mensagem"></textarea>
            <button id="chat-send" class="chat-btn">Enviar</button>
          </div>
          <div id="chat-status" class="chat-status"></div>
        </div>
        <div id="chat-rating" class="hidden chat-rating">
          <p>Avalie seu atendimento:</p>
          <div id="chat-stars" class="stars"></div>
          <textarea id="chat-rating-comment" rows="2" placeholder="Comentário (opcional)"></textarea>
          <button id="chat-rate-btn" class="chat-btn">Enviar avaliação</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    const style = document.createElement('style');
    style.textContent = `
      #support-chat-toggle{position:fixed;right:16px;bottom:16px;border:none;border-radius:999px;width:58px;height:58px;cursor:pointer;background:linear-gradient(135deg,var(--primary),var(--secondary));color:#fff;font-size:24px;z-index:9998;box-shadow:0 12px 30px rgba(11,99,230,.35)}
      #support-chat-box{position:fixed;right:16px;bottom:86px;width:min(380px,calc(100vw - 20px));max-height:80vh;background:#0b1426;border:1px solid rgba(255,255,255,.14);border-radius:14px;overflow:hidden;z-index:9999;display:flex;flex-direction:column}
      #support-chat-box.hidden,.hidden{display:none!important}
      .chat-head{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:rgba(11,99,230,.18)}
      .chat-head button{background:transparent;border:none;color:#fff;cursor:pointer}
      .chat-start,.chat-rating{padding:10px;display:flex;flex-direction:column;gap:8px}
      .chat-start input,.chat-start textarea,#chat-input,#chat-rating-comment{background:#101f35;color:#fff;border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:10px}
      .chat-btn{background:linear-gradient(135deg,var(--primary),var(--secondary));color:#fff;border:none;border-radius:8px;padding:10px;cursor:pointer;font-weight:700}
      .chat-messages{padding:10px;overflow:auto;display:flex;flex-direction:column;gap:8px;max-height:46vh}
      .msg{padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.06)}
      .msg.admin{border-left:3px solid var(--accent)}
      .msg.system{border-left:3px solid var(--warning)}
      .msg .meta{font-size:11px;color:#9db0cf;margin-bottom:4px}
      .chat-tools{display:flex;align-items:center;gap:8px;padding:8px 10px}
      .emoji-picker{display:flex;flex-wrap:wrap;gap:4px}
      .emoji-picker button{background:rgba(255,255,255,.08);border:none;border-radius:8px;cursor:pointer;padding:4px 6px}
      .chat-compose{display:flex;gap:8px;padding:8px 10px}
      .chat-compose textarea{flex:1}
      .chat-status{padding:0 10px 10px;font-size:12px;color:#a9bad6}
      .stars{display:flex;gap:6px}
      .stars button{border:none;background:rgba(255,255,255,.08);color:#ffd166;border-radius:8px;padding:6px 8px;cursor:pointer}
    `;
    document.head.appendChild(style);

    EMOJIS.forEach((emoji) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = emoji;
      b.onclick = () => {
        const input = document.getElementById('chat-input');
        if (input) input.value += emoji;
      };
      document.getElementById('emoji-picker').appendChild(b);
    });

    for (let i = 1; i <= 5; i++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = '★'.repeat(i);
      b.dataset.value = String(i);
      document.getElementById('chat-stars').appendChild(b);
    }
  }

  async function request(path, opts = {}, withToken = false) {
    const headers = opts.headers || {};
    if (withToken && state.token) headers['X-Chat-Token'] = state.token;
    const res = await fetch(`${API}${path}`, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Erro na requisição');
    return data;
  }

  function renderMessages(messages) {
    const box = document.getElementById('chat-messages');
    if (!box) return;
    box.innerHTML = '';
    (messages || []).forEach((m) => {
      const row = document.createElement('div');
      row.className = `msg ${m.sender_type || ''}`;
      row.innerHTML = `<div class="meta">${escapeHtml(m.sender_name)} · ${escapeHtml(fmtDate(m.created_at))}</div><div>${escapeHtml(m.message || '').replace(/\n/g, '<br>')}</div>`;
      if (m.attachment) {
        const a = document.createElement('a');
        a.href = m.attachment;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = '📎 Anexo';
        row.appendChild(a);
      }
      box.appendChild(row);
    });
    box.scrollTop = box.scrollHeight;
  }

  async function refresh() {
    if (!state.sessionId) return;
    const data = await request(`/messages?session_id=${encodeURIComponent(state.sessionId)}`, {}, true);
    state.status = data.session?.status || state.status;
    renderMessages(data.messages || []);

    const status = document.getElementById('chat-status');
    if (status) {
      status.textContent = `Status: ${state.status}${data.session?.agent_name ? ` · Agente: ${data.session.agent_name}` : ' · aguardando agente'}`;
    }

    const shouldRate = state.status === 'waiting_rating' && !data.session?.rating;
    document.getElementById('chat-rating')?.classList.toggle('hidden', !shouldRate);
  }

  async function startChat() {
    const name = document.getElementById('chat-guest-name')?.value?.trim() || 'Visitante';
    const email = document.getElementById('chat-guest-email')?.value?.trim() || '';
    const message = document.getElementById('chat-first-message')?.value?.trim() || '';
    const form = new FormData();
    form.set('name', name);
    form.set('email', email);
    form.set('message', message);
    const data = await request('/start', { method: 'POST', body: form });
    state.sessionId = data.session_id;
    state.token = data.token;
    state.status = data.status;
    saveState();
    document.getElementById('chat-start-panel')?.classList.add('hidden');
    document.getElementById('chat-room')?.classList.remove('hidden');
    await refresh();
    if (poll) clearInterval(poll);
    poll = setInterval(() => refresh().catch(() => {}), 4000);
  }

  async function sendMessage() {
    if (!state.sessionId) return;
    const input = document.getElementById('chat-input');
    const file = document.getElementById('chat-file');
    const txt = input?.value?.trim() || '';
    if (!txt && !(file?.files?.length)) return;
    const form = new FormData();
    form.set('session_id', state.sessionId);
    form.set('message', txt);
    if (file?.files?.length) form.append('attachment', file.files[0]);
    await request('/message', { method: 'POST', body: form }, true);
    if (input) input.value = '';
    if (file) file.value = '';
    await refresh();
  }

  async function sendRating() {
    const selected = document.querySelector('#chat-stars button.active');
    if (!selected) return alert('Selecione uma nota de 1 a 5.');
    const form = new FormData();
    form.set('session_id', state.sessionId);
    form.set('rating', selected.dataset.value);
    form.set('comment', document.getElementById('chat-rating-comment')?.value?.trim() || '');
    await request('/rate', { method: 'POST', body: form }, true);
    document.getElementById('chat-rating')?.classList.add('hidden');
    await refresh();
  }

  function bind() {
    document.getElementById('support-chat-toggle')?.addEventListener('click', () => document.getElementById('support-chat-box')?.classList.toggle('hidden'));
    document.getElementById('support-chat-close')?.addEventListener('click', () => document.getElementById('support-chat-box')?.classList.add('hidden'));
    document.getElementById('chat-start-btn')?.addEventListener('click', () => startChat().catch((e) => alert(e.message)));
    document.getElementById('chat-send')?.addEventListener('click', () => sendMessage().catch((e) => alert(e.message)));
    document.getElementById('chat-rate-btn')?.addEventListener('click', () => sendRating().catch((e) => alert(e.message)));

    document.querySelectorAll('#chat-stars button').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('#chat-stars button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
      });
    });
  }

  function init() {
    build();
    bind();
    loadState();
    if (state.sessionId && state.token) {
      document.getElementById('chat-start-panel')?.classList.add('hidden');
      document.getElementById('chat-room')?.classList.remove('hidden');
      refresh().catch(() => {});
      poll = setInterval(() => refresh().catch(() => {}), 4000);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
