const apiBase = '/api';
let authToken = localStorage.getItem('token') || '';
const params = new URLSearchParams(window.location.search);
const orderId = params.get('id');

function ensureProgressBox(formEl, key = 'proof') {
  if (!formEl) return null;
  let box = formEl.querySelector(`.upload-progress-wrap[data-key="${key}"]`);
  if (!box) {
    box = document.createElement('div');
    box.className = 'upload-progress-wrap';
    box.dataset.key = key;
    box.innerHTML = '<div class="upload-progress-label">Progresso do upload</div><progress class="upload-progress" max="100" value="0"></progress><div class="upload-progress-value">0%</div>';
    formEl.appendChild(box);
  }
  return box;
}

function uploadWithProgress(url, { headers = {}, formData, onProgress }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    Object.entries(headers || {}).forEach(([k, v]) => xhr.setRequestHeader(k, v));
    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable && onProgress) onProgress(Math.round((evt.loaded / evt.total) * 100));
    };
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText || '{}'); } catch (_) {}
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data });
    };
    xhr.onerror = () => reject(new Error('Falha de rede no upload'));
    xhr.send(formData);
  });
}


function requireAuth() {
  if (!authToken) {
    window.location.href = '/login.html';
    return false;
  }
  return true;
}

const logout = document.getElementById('logout');
if (logout) {
  logout.onclick = () => {
    localStorage.removeItem('token');
    window.location.href = '/login.html';
  };
}

async function loadInvoice() {
  if (!requireAuth() || !orderId) return;
  try {
    const res = await fetch(`${apiBase}/orders/${orderId}`, { headers: { Authorization: `Bearer ${authToken}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Não foi possível carregar a fatura');
    const order = data.order;
    const body = document.getElementById('invoice-body');
    const materials = order.materiais_uploads ? JSON.parse(order.materiais_uploads) : [];
    const descriptionHtml = (order.descricao || '—').replace(/\n/g, '<br>');
    const proofForm = document.getElementById('proof-form');
    if (proofForm) {
      proofForm.dataset.invoice = order.invoice_id || order.id;
    }
    body.innerHTML = `
      <p><strong>Fatura:</strong> ${order.invoice_numero || '—'}</p>
      <p><strong>Estado:</strong> ${order.invoice_estado || 'EMITIDA'}</p>
      <p><strong>Trabalho:</strong> ${order.tipo || '—'} (${order.area || '—'})</p>
      <p><strong>Nível:</strong> ${order.nivel || '—'} · <strong>Páginas:</strong> ${order.paginas || '—'}</p>
      <p><strong>Norma:</strong> ${order.norma || '—'}</p>
      <p><strong>Complexidade:</strong> ${order.complexidade || '—'} · <strong>Urgência:</strong> ${order.urgencia || '—'}</p>
      <p><strong>Prazo desejado:</strong> ${order.prazo_entrega || '—'}</p>
      <p><strong>Descrição do pedido:</strong><br>${descriptionHtml}</p>
      <p><strong>Materiais informados:</strong> ${order.materiais_info || 'Não'}</p>
      <p><strong>Percentual de uso dos materiais:</strong> ${order.materiais_percentual || '—'}${order.materiais_percentual ? '%' : ''}</p>
      <p><strong>Valor:</strong> ${order.valor_total || order.total || '—'} MZN</p>
      <p><strong>Materiais fornecidos:</strong> ${materials.length ? materials.map((m) => `<a href="${m}" target="_blank">${m.split('/').pop()}</a>`).join(', ') : 'Nenhum'}</p>
      ${order.comprovativo ? `<p class="muted">Comprovativo já enviado: <a href="${order.comprovativo}" target="_blank">abrir</a></p>` : ''}
      <hr />
      <p><strong>Pagamento M-Pesa</strong></p>
      <p>Número: 851619970 · Titular: Maria António Chicavele</p>
      <p class="muted">Após pagar, envie o comprovativo nesta página.</p>
      ${order.final_file ? `<p class="success">Documento final: <a href="${order.final_file}" target="_blank">download</a></p>` : ''}
    `;
  } catch (err) {
    alert(err.message);
  }
}

const refreshBtn = document.getElementById('refresh-invoice');
if (refreshBtn) refreshBtn.onclick = loadInvoice;
const backBtn = document.getElementById('back-dashboard');
if (backBtn) backBtn.onclick = () => (window.location.href = '/documents.html');
const pdfBtn = document.getElementById('download-pdf');
if (pdfBtn) {
  pdfBtn.onclick = async () => {
    if (!requireAuth()) return;
    const res = await fetch(`${apiBase}/orders/${orderId}/pdf`, { headers: { Authorization: `Bearer ${authToken}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fatura-${orderId}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };
}

const proofForm = document.getElementById('proof-form');
if (proofForm) {
  proofForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!requireAuth()) return;
    const submitBtn = proofForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    const form = new FormData();
    form.set('invoice_id', proofForm.dataset.invoice || (new URLSearchParams(window.location.search)).get('invoice_id') || '');
    form.set('order_id', orderId);
    const fileField = document.getElementById('proof-file');
    if (fileField?.files?.length) {
      form.append('comprovativo', fileField.files[0]);
    }
    const progressBox = ensureProgressBox(proofForm, 'proof-upload');
    const progress = progressBox?.querySelector('progress');
    const progressValue = progressBox?.querySelector('.upload-progress-value');
    try {
      if (progressBox) progressBox.classList.add('visible');
      if (progress) progress.value = 0;
      if (progressValue) progressValue.textContent = '0%';
      const res = await uploadWithProgress(`${apiBase}/orders/proof`, {
        headers: { Authorization: `Bearer ${authToken}` },
        formData: form,
        onProgress: (pct) => {
          if (progress) progress.value = pct;
          if (progressValue) progressValue.textContent = `${pct}%`;
        },
      });
      if (!res.ok) throw new Error(res.data.message || 'Falha ao enviar comprovativo');
      alert('Comprovativo enviado com sucesso.');
      loadInvoice();
    } catch (err) {
      alert(err.message);
    } finally {
      setTimeout(() => progressBox?.classList.remove('visible'), 1200);
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

loadInvoice();
setInterval(loadInvoice, 12000);
