// Chat widget simples (polling). Requer token no localStorage.
(function(){
  const token = localStorage.getItem('token') || '';
  const api = '/api/admin/chat';
  function createWidget(){
    if (document.getElementById('chat-widget')) return;
    const w = document.createElement('div');
    w.id = 'chat-widget';
    w.style.position = 'fixed';
    w.style.right = '18px';
    w.style.bottom = '18px';
    w.style.width = '320px';
    w.style.maxHeight = '420px';
    w.style.zIndex = 99999;
    w.innerHTML = `<div id="cw-header" style="background:#0b63e6;padding:8px;border-radius:8px 8px 0 0;color:#fff;display:flex;justify-content:space-between;align-items:center;">
        <strong>Suporte</strong><button id="cw-close" style="background:transparent;border:none;color:#fff;cursor:pointer">×</button></div>
      <div id="cw-body" style="background:#071426;padding:8px;color:#ddd;overflow:auto;height:260px;border:1px solid rgba(255,255,255,0.04)"></div>
      <div style="display:flex;gap:6px;padding:8px;background:linear-gradient(180deg,#061026,#071426);border-radius:0 0 8px 8px;">
        <input id="cw-input" placeholder="Escreva..." style="flex:1;padding:8px;border-radius:6px;border:1px solid rgba(255,255,255,0.06);background:#0f2236;color:#fff"/>
        <button id="cw-send" class="primary">Enviar</button>
      </div>`;
    document.body.appendChild(w);
    document.getElementById('cw-close').onclick = () => w.style.display='none';
    document.getElementById('cw-send').onclick = sendMsg;
    refresh();
    setInterval(refresh, 7000);
  }
  async function refresh(){
    try {
      const res = await fetch(api, { headers: token ? { Authorization: 'Bearer ' + token } : {}});
      const data = await res.json();
      const body = document.getElementById('cw-body');
      if (!body) return;
      body.innerHTML = '';
      (data.messages||[]).reverse().forEach(m => {
        const div = document.createElement('div');
        div.style.padding='6px';
        div.style.marginBottom='6px';
        div.innerHTML = `<div style="font-size:12px;color:#9fb4d6">${m.author || m.email || 'Admin'} · <span style="color:#aaa;font-size:11px">${m.created_at || ''}</span></div><div style="margin-top:4px">${(m.message||'').replace(/\n/g,'<br/>')}</div>`;
        body.appendChild(div);
      });
      body.scrollTop = body.scrollHeight;
    } catch (e) { /* ignore */ }
  }
  async function sendMsg(){
    const txt = document.getElementById('cw-input').value.trim();
    if (!txt) return;
    const form = new FormData();
    form.set('message', txt);
    try {
      const res = await fetch(api, { method: 'POST', headers: token ? { Authorization: 'Bearer ' + token } : {}, body: form});
      if (!res.ok) { alert('Erro ao enviar'); return; }
      document.getElementById('cw-input').value='';
      refresh();
    } catch(e){ console.error(e); alert('Falha ao enviar'); }
  }
  // inject stylesheet minimal
  const style = document.createElement('style');
  style.innerHTML = `#chat-widget .primary{background:#06d6a0;border:none;padding:6px 10px;border-radius:6px;color:#04202a;cursor:pointer;font-weight:700}`;
  document.head.appendChild(style);
  // init
  document.addEventListener('DOMContentLoaded', createWidget);
})();