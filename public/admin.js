const apiBase = '/api';
let authToken = localStorage.getItem('token') || '';
let statusChart;
let revenueChart;
let servicesChart;
const adminPage = document.body.dataset.page || 'dashboard';

function requireAdmin() {
  if (!authToken) {
    window.location.href = '/login.html';
    return false;
  }
  const role = localStorage.getItem('role');
  if (role !== 'admin') {
    window.location.href = '/login.html';
    return false;
  }
  return true;
}

function toast(msg) {
  const box = document.getElementById('admin-feedback');
  if (box) {
    box.textContent = msg;
    box.classList.add('visible');
    setTimeout(() => box.classList.remove('visible'), 2500);
  } else {
    alert(msg);
  }
}

function confirmAction(message) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-dialog');
    const text = document.getElementById('confirm-text');
    if (!modal || !text) return resolve(confirm(message));
    text.textContent = message;
    modal.classList.remove('hidden');
    const accept = document.getElementById('confirm-accept');
    const cancel = document.getElementById('confirm-cancel');
    const cleanup = (choice) => {
      modal.classList.add('hidden');
      accept.onclick = null;
      cancel.onclick = null;
      resolve(choice);
    };
    accept.onclick = () => cleanup(true);
    cancel.onclick = () => cleanup(false);
  });
}

const logout = document.getElementById('logout');
if (logout) {
  logout.onclick = () => {
    localStorage.removeItem('token');
    window.location.href = '/login.html';
  };
}

async function downloadInvoice(orderId, invoiceNumber) {
  if (!orderId) return toast('ID da encomenda em falta');
  try {
    const res = await fetch(`${apiBase}/orders/${orderId}/pdf`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || 'Falha ao obter a fatura');
    }
    const blob = await res.blob();
    const filename = invoiceNumber ? `fatura-${invoiceNumber}.pdf` : `fatura-${orderId}.pdf`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    toast(err.message || 'Erro ao baixar fatura');
  }
}

async function loadOrders() {
  if (!requireAdmin()) return;
  try {
    const res = await fetch(`${apiBase}/admin/orders`, { headers: { Authorization: `Bearer ${authToken}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Erro ao carregar encomendas');
    const list = document.getElementById('admin-orders');
    if (!list) return;
    list.innerHTML = '';
    data.orders.forEach((order) => {
      // materials: support materiais_array (from backend) or fallback to materiais_uploads JSON string
      let materials = [];
      if (Array.isArray(order.materiais_array)) {
        materials = order.materiais_array;
      } else if (order.materiais_uploads) {
        try {
          materials = typeof order.materiais_uploads === 'string' ? JSON.parse(order.materiais_uploads) : order.materiais_uploads;
          if (!Array.isArray(materials)) materials = [];
        } catch (e) {
          materials = [];
        }
      }

      // invoice fields
      const invoiceNumber = order.invoice_numero || (order.invoice_details && order.invoice_details.numero) || '';
      const invoiceEstado = order.invoice_estado || (order.invoice_details && order.invoice_details.estado) || '—';
      const invoiceId = order.invoice_id || (order.invoice_details && order.invoice_details.id) || '';

      // comprovativo link (invoice_details.comprovativo or order.comprovativo)
      const comprovativo = (order.invoice_details && order.invoice_details.comprovativo) || order.comprovativo || null;

      // feedback (array of objects)
      const feedbacks = Array.isArray(order.feedback) ? order.feedback : [];

      const card = document.createElement('div');
      card.className = 'card';

      // NEW: show "Documento final submetido" indicator when final_file exists; otherwise show message if paid and awaiting final
      card.innerHTML = `
        <h4>#${order.id} · ${order.tipo || '—'}</h4>
        <p>Cliente: ${order.user_name || ''} (${order.user_email || ''})</p>
        <p>Estado: <strong>${order.estado || '—'}</strong> · Fatura: ${invoiceNumber || '—'} (${invoiceEstado})</p>
        <p>Total: ${order.valor_total ?? (order.invoice_details && order.invoice_details.valor_total) ?? '—'}</p>
        ${order.final_file ? `<p class="success">Documento final submetido: <a href="${order.final_file}" target="_blank">ver/baixar</a></p>` : (invoiceEstado === 'PAGA' ? `<p class="muted">Aguardando entrega final</p>` : '')}
        <p>Materiais: ${materials.length ? materials.map((m) => `<a href="${m}" target="_blank" rel="noopener noreferrer">${m.split('/').pop()}</a>`).join(', ') : 'Nenhum'}</p>
        ${comprovativo ? `<p class="muted">Comprovativo: <a href="${comprovativo}" target="_blank" rel="noopener noreferrer">ver ficheiro</a></p>` : '<p class="muted">Comprovativo pendente</p>'}
        <div class="stacked-actions" style="margin-top:8px;"></div>
        <div class="admin-feedback-section" style="margin-top:12px;"></div>
      `;

      // actions container
      const actions = card.querySelector('.stacked-actions');

      // Approve / Reject buttons only for payment states still actionable by admin
      if (invoiceId) {
        const canValidatePayment = ['EMITIDA', 'PENDENTE', 'PENDENTE_VALIDACAO'].includes(invoiceEstado);
        if (canValidatePayment) {
          const approveBtn = document.createElement('button');
          approveBtn.className = 'primary';
          approveBtn.textContent = 'Marcar pago';
          approveBtn.dataset.invoice = invoiceId;
          approveBtn.dataset.number = invoiceNumber;
          approveBtn.dataset.email = order.user_email || '';
          approveBtn.onclick = () => approveInvoice(approveBtn.dataset.invoice, approveBtn.dataset.number, approveBtn.dataset.email);
          actions.appendChild(approveBtn);

          const rejectBtn = document.createElement('button');
          rejectBtn.className = 'ghost';
          rejectBtn.textContent = 'Rejeitar';
          rejectBtn.dataset.invoice = invoiceId;
          rejectBtn.dataset.order = order.id;
          rejectBtn.onclick = () => rejectInvoice(rejectBtn.dataset.invoice, rejectBtn.dataset.order);
          actions.appendChild(rejectBtn);
        } else {
          // invoiceEstado === 'PAGA' => show download + final upload (unless final_file exists)
          const downloadBtn = document.createElement('button');
          downloadBtn.className = 'ghost';
          downloadBtn.textContent = 'Baixar fatura';
          downloadBtn.onclick = () => downloadInvoice(order.id, invoiceNumber);
          actions.appendChild(downloadBtn);
        }
      } else {
        const noInv = document.createElement('span');
        noInv.className = 'muted';
        noInv.textContent = 'Sem fatura associada';
        actions.appendChild(noInv);
      }

      // If invoice paid and no final_file yet, show upload control
      if ((invoiceEstado === 'PAGA') && !order.final_file) {
        const uploadWrap = document.createElement('div');
        uploadWrap.className = 'upload-zone';
        uploadWrap.innerHTML = `<label>Entregar documento final</label><input type="file" data-file="${order.id}" /><button class="primary" data-action="final" data-order="${order.id}">Submeter</button>`;
        const inputFile = uploadWrap.querySelector(`input[data-file="${order.id}"]`);
        const finalBtn = uploadWrap.querySelector('button');
        finalBtn.onclick = () => uploadFinal(finalBtn.dataset.order, inputFile);
        card.appendChild(uploadWrap);
      }

      // Render feedback directly in the card
      const feedbackZone = card.querySelector('.admin-feedback-section');
      if (feedbacks.length) {
        const fbHeader = document.createElement('h4');
        fbHeader.textContent = 'Feedback recebido';
        feedbackZone.appendChild(fbHeader);
        feedbacks.forEach((fb) => {
          const fbDiv = document.createElement('div');
          fbDiv.className = 'list-item';
          const created = fb.created_at ? ` · ${fb.created_at}` : '';
          fbDiv.innerHTML = `<div><strong>${fb.rating}/5</strong><p class="muted">${fb.grade || '—'}${created}</p><p>${fb.comment || ''}</p></div>`;
          feedbackZone.appendChild(fbDiv);
        });
      } else {
        const noFb = document.createElement('p');
        noFb.className = 'muted';
        noFb.textContent = 'Sem feedback para esta encomenda';
        feedbackZone.appendChild(noFb);
      }

      list.appendChild(card);
    });
  } catch (err) {
    toast(err.message);
  }
}

async function approveInvoice(invoiceId, number, email) {
  if (!invoiceId) return;
  const ok = await confirmAction('Confirmar que o pagamento foi validado?');
  if (!ok) return;
  const form = new FormData();
  form.set('invoice_id', invoiceId);
  form.set('numero', number || '');
  form.set('email_cliente', email || '');
  const res = await fetch(`${apiBase}/admin/invoices/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) return toast(data.message || 'Erro ao validar pagamento');
  toast('Pagamento marcado como pago.');
  // reload orders and metrics; UI will reflect removal of approve/reject because backend returns new estado
  await loadOrders();
  await loadMetrics();
}

async function rejectInvoice(invoiceId, orderId) {
  if (!invoiceId) return;
  const ok = await confirmAction('Deseja marcar o pagamento como rejeitado/pendente?');
  if (!ok) return;
  const form = new FormData();
  form.set('invoice_id', invoiceId);
  form.set('order_id', orderId);
  const res = await fetch(`${apiBase}/admin/invoices/reject`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) return toast(data.message || 'Erro ao rejeitar');
  toast('Pagamento marcado como rejeitado.');
  await loadOrders();
  await loadMetrics();
}

async function uploadFinal(orderId, input) {
  if (!input?.files?.length) return toast('Selecione um ficheiro primeiro');
  const ok = await confirmAction('Entregar este documento ao cliente?');
  if (!ok) return;
  const form = new FormData();
  form.set('order_id', orderId);
  form.append('final', input.files[0]);
  const res = await fetch(`${apiBase}/admin/orders/final-upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) return toast(data.message || 'Erro ao enviar documento');
  toast('Documento final submetido.');
  await loadOrders();
}

async function loadUsers() {
  if (!requireAdmin()) return;
  const res = await fetch(`${apiBase}/admin/users`, { headers: { Authorization: `Bearer ${authToken}` } });
  const data = await res.json();
  const list = document.getElementById('admin-users');
  if (!list) return;
  if (!res.ok) {
    list.innerHTML = `<p class="muted">${data.message || 'Erro'}</p>`;
    return;
  }
  list.innerHTML = '';
  data.users.forEach((user) => {
    const row = document.createElement('div');
    row.className = 'list-item';
    row.innerHTML = `
      <div>
        <strong>${user.name}</strong>
        <p class="muted">${user.email} · ${user.role}</p>
      </div>
      <div class="stacked-actions">
        <button class="ghost" data-action="toggle" data-id="${user.id}" data-active="${user.active ? '1' : '0'}">${user.active ? 'Desativar' : 'Ativar'}</button>
        ${user.role !== 'admin' ? `<button class="ghost" data-action="delete" data-id="${user.id}">Eliminar</button>` : ''}
      </div>
    `;
    const toggleBtn = row.querySelector('button[data-action="toggle"]');
    if (toggleBtn) toggleBtn.onclick = () => toggleUser(user.id, !user.active);

    const deleteBtn = row.querySelector('button[data-action="delete"]');
    if (deleteBtn) deleteBtn.onclick = () => deleteUser(user.id);
    list.appendChild(row);
  });
}

async function toggleUser(userId, active) {
  const form = new FormData();
  form.set('user_id', userId);
  form.set('active', active ? '1' : '0');
  const res = await fetch(`${apiBase}/admin/users/toggle`, { method: 'POST', headers: { Authorization: `Bearer ${authToken}` }, body: form });
  const data = await res.json();
  if (!res.ok) return toast(data.message || 'Erro a atualizar utilizador');
  toast('Utilizador atualizado');
  loadUsers();
}

async function deleteUser(userId) {
  const ok = await confirmAction('Tem a certeza que deseja eliminar este utilizador?');
  if (!ok) return;

  const form = new FormData();
  form.set('user_id', userId);
  const res = await fetch(`${apiBase}/admin/users/delete`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: form,
  });
  const data = await res.json();
  if (!res.ok) return toast(data.message || 'Erro ao eliminar utilizador');
  toast('Utilizador eliminado');
  loadUsers();
}

async function loadMetrics() {
  const res = await fetch(`${apiBase}/admin/metrics`, { headers: { Authorization: `Bearer ${authToken}` } });
  const data = await res.json();
  const zone = document.getElementById('admin-metrics');
  if (!zone) return;
  if (!res.ok) {
    zone.innerHTML = `<p class="muted">${data.message || 'Erro ao carregar métricas'}</p>`;
    return;
  }
  const m = data.metrics;
  zone.innerHTML = `Pedidos: ${m.orders} · Faturas: ${m.invoices} · Pago: ${m.paid} · Pendente: ${m.pending} · Levantamentos em análise: ${m.payouts_pending}`;
  const affiliateSummary = document.getElementById('admin-affiliate-summary');
  if (affiliateSummary) {
    affiliateSummary.textContent = `Saldo pendente para afiliados: ${m.payouts_pending} MZN`;
  }
  const chartData = (data.status || []).map((s) => ({ label: s.estado, value: s.total }));
  if (window.Chart && document.getElementById('status-chart')) {
    const ctx = document.getElementById('status-chart').getContext('2d');
    if (statusChart) statusChart.destroy();
    statusChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: chartData.map((d) => d.label),
        datasets: [{ data: chartData.map((d) => d.value), backgroundColor: ['#1d4ed8', '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444'] }],
      },
      options: { plugins: { legend: { position: 'bottom' } } },
    });
  }
  if (window.Chart && document.getElementById('revenue-chart')) {
    const ctx = document.getElementById('revenue-chart').getContext('2d');
    if (revenueChart) revenueChart.destroy();
    const trend = (data.trend || []).reverse();
    revenueChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: trend.map((t) => t.mes),
        datasets: [{ label: 'Receita mensal (MZN)', data: trend.map((t) => t.total), borderColor: '#1d4ed8', fill: false }],
      },
      options: { plugins: { legend: { display: true } } },
    });
  }
  if (window.Chart && document.getElementById('services-chart')) {
    const ctx = document.getElementById('services-chart').getContext('2d');
    if (servicesChart) servicesChart.destroy();
    servicesChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: (data.services || []).map((s) => s.categoria),
        datasets: [{ label: 'Pedidos', data: (data.services || []).map((s) => s.total), backgroundColor: '#0ea5e9' }],
      },
      options: { indexAxis: 'y', plugins: { legend: { display: false } } },
    });
  }
  const leaders = document.getElementById('admin-affiliate-leaders');
  if (leaders) {
    leaders.innerHTML = '';
    (data.affiliates || []).forEach((a) => {
      const row = document.createElement('div');
      row.className = 'list-item';
      row.innerHTML = `<div><strong>${a.referrer_code || '—'}</strong><p class="muted">${a.total} encomendas</p></div><span class="badge">${a.valor} MZN</span>`;
      leaders.appendChild(row);
    });
  }
}

async function loadCommissions() {
  const res = await fetch(`${apiBase}/admin/commissions`, { headers: { Authorization: `Bearer ${authToken}` } });
  const data = await res.json();
  const list = document.getElementById('admin-commissions');
  if (!list) return;
  if (!res.ok) {
    list.innerHTML = `<p class="muted">${data.message || 'Erro'}</p>`;
    return;
  }
  list.innerHTML = '';
  data.commissions.forEach((c) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `<div><strong>Ref: ${c.referrer_code}</strong><p class="muted">Encomenda #${c.order_id} · ${c.amount} MZN</p></div><span class="badge">${c.status}</span>`;
    list.appendChild(item);
  });
}

async function loadPayouts() {
  const res = await fetch(`${apiBase}/admin/payouts`, { headers: { Authorization: `Bearer ${authToken}` } });
  const data = await res.json();
  const list = document.getElementById('admin-payouts');
  if (!list) return;
  if (!res.ok) {
    list.innerHTML = `<p class="muted">${data.message || 'Erro'}</p>`;
    return;
  }
  list.innerHTML = '';
  data.payouts.forEach((p) => {
    const item = document.createElement('div');
    item.className = 'list-item';

    // Render actions only when status is SOLICITADO or PENDENTE
    let actionsHtml = '';
    if (p.status === 'SOLICITADO' || p.status === 'PENDENTE') {
      actionsHtml = `<div class="stacked-actions">
        <button class="ghost" data-id="${p.id}" data-status="APROVADO">Aprovar</button>
        <button class="ghost" data-id="${p.id}" data-status="REJEITADO">Rejeitar</button>
      </div>`;
    } else {
      actionsHtml = `<div><strong>${p.status}</strong></div>`;
    }

    item.innerHTML = `
      <div>
        <strong>Pedido #${p.id}</strong>
        <p class="muted">${p.name || p.email} · ${p.valor} MZN · ${p.metodo}</p>
        <p class="muted">M-Pesa: ${p.mpesa_destino || '—'}</p>
      </div>
      ${actionsHtml}`;

    // attach handlers (if buttons exist)
    item.querySelectorAll('button').forEach((btn) => {
      btn.onclick = () => updatePayout(btn.dataset.id, btn.dataset.status, item);
    });
    list.appendChild(item);
  });
}

/**
 * Update payout and immediately update UI to remove buttons after approval/rejection.
 * itemEl is optional: if provided, we'll update it in-place (remove buttons and show final status).
 */
async function updatePayout(payoutId, status, itemEl = null) {
  const form = new FormData();
  form.set('payout_id', payoutId);
  form.set('status', status);
  form.set('notes', `Atualizado via painel para ${status}`);
  const res = await fetch(`${apiBase}/admin/payouts/update`, { method: 'POST', headers: { Authorization: `Bearer ${authToken}` }, body: form });
  const data = await res.json();
  if (!res.ok) return toast(data.message || 'Erro ao atualizar pagamento');

  // immediate UI change: if itemEl passed, replace actions with status label
  if (itemEl) {
    const statusLabel = document.createElement('div');
    statusLabel.innerHTML = `<strong>${data.status || status}</strong>`;
    const actionsNode = itemEl.querySelector('.stacked-actions');
    if (actionsNode) {
      actionsNode.replaceWith(statusLabel);
    } else {
      // fallback: append status label
      itemEl.appendChild(statusLabel);
    }
  }

  toast('Estado do levantamento atualizado');
  // refresh lists to keep everything consistent
  loadPayouts();
  loadCommissions();
}

async function loadAudits() {
  const res = await fetch(`${apiBase}/admin/audits`, { headers: { Authorization: `Bearer ${authToken}` } });
  const data = await res.json();
  const list = document.getElementById('admin-audits');
  if (!list) return;
  if (!res.ok) {
    list.innerHTML = `<p class="muted">${data.message || 'Erro'}</p>`;
    return;
  }
  list.innerHTML = '';
  (data.audits || []).forEach((a) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `<div><strong>${a.action}</strong><p class="muted">${a.email || 'anónimo'} · ${a.meta}</p></div><span class="badge">${a.created_at || ''}</span>`;
    list.appendChild(item);
  });
}

async function loadFeedbackAdmin() {
  const zone = document.getElementById('admin-feedback-list');
  if (!zone) return;
  const res = await fetch(`${apiBase}/admin/feedback`, { headers: { Authorization: `Bearer ${authToken}` } });
  const data = await res.json();
  zone.innerHTML = '';
  if (!res.ok) {
    zone.innerHTML = `<p class="muted">${data.message || 'Não foi possível carregar feedback'}</p>`;
    return;
  }
  (data.feedback || []).forEach((fb) => {
    const item = document.createElement('div');
    item.className = 'list-item';
    item.innerHTML = `<div><strong>Pedido #${fb.order_id}</strong><p class="muted">${fb.rating}/5 · ${fb.grade || '—'}</p><p>${fb.comment || ''}</p></div><span class="badge">${fb.created_at || ''}</span>`;
    zone.appendChild(item);
  });
}

async function loadServices() {
  const res = await fetch(`${apiBase}/admin/services`, { headers: { Authorization: `Bearer ${authToken}` } });
  const data = await res.json();
  const list = document.getElementById('admin-services');
  if (!list) return;
  if (!res.ok) {
    list.innerHTML = `<p class="muted">${data.message || 'Erro ao carregar serviços'}</p>`;
    return;
  }
  list.innerHTML = '';
  data.services.forEach((svc) => {
    const item = document.createElement('div');
    item.className = 'card';
    item.innerHTML = `
      <h4>${svc.categoria}</h4>
      <p class="muted">${svc.contact_name} · ${svc.contact_email} ${svc.contact_phone ? ' · ' + svc.contact_phone : ''}</p>
      <p>${svc.detalhes || ''}</p>
      <p>${svc.norma_preferida ? 'Norma: ' + svc.norma_preferida + ' · ' : ''}${svc.software_preferido ? 'Software: ' + svc.software_preferido : ''}</p>
      ${svc.attachment ? `<p><a href="${svc.attachment}" target="_blank">Ver anexo</a></p>` : ''}
      <div class="inline-group">
        <select data-service="${svc.id}">
          ${['NOVO','EM_ANALISE','RESPONDIDO','CONCLUIDO'].map((s) => `<option value="${s}" ${svc.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
        <button class="ghost" data-btn="${svc.id}">Atualizar</button>
      </div>
    `;
    item.querySelector('button').onclick = () => updateServiceStatus(svc.id, item.querySelector('select').value);
    list.appendChild(item);
  });
}

async function updateServiceStatus(id, status) {
  const form = new FormData();
  form.set('service_id', id);
  form.set('status', status);
  const res = await fetch(`${apiBase}/admin/services/update`, { method: 'POST', headers: { Authorization: `Bearer ${authToken}` }, body: form });
  const data = await res.json();
  if (!res.ok) return toast(data.message || 'Erro ao atualizar serviço');
  toast('Serviço atualizado');
  loadServices();
}

async function loadAdminChat() {
  const chatBox = document.getElementById('admin-chat');
  if (!chatBox || !authToken) return;
  const filter = document.getElementById('chat-order')?.value;
  const res = await fetch(`${apiBase}/admin/chat${filter ? `?order_id=${filter}` : ''}`, { headers: { Authorization: `Bearer ${authToken}` } });
  const data = await res.json();
  chatBox.innerHTML = '';
  if (!res.ok) {
    chatBox.innerHTML = `<p class="muted">${data.message || 'Erro ao carregar estação'}</p>`;
    return;
  }
  (data.messages || []).forEach((msg) => {
    const row = document.createElement('div');
    row.className = 'chat-row';
    row.innerHTML = `
      <div>
        <strong>${msg.author || 'Admin'}</strong> ${msg.order_id ? `<span class="badge">#${msg.order_id}</span>` : ''}
        <p class="muted">${msg.created_at || ''}</p>
        <p>${msg.message || ''}</p>
        ${msg.attachment ? `<a href="${msg.attachment}" target="_blank">Ver anexo</a>` : ''}
      </div>
    `;
    chatBox.appendChild(row);
  });
}

async function sendAdminChat() {
  const msgInput = document.getElementById('chat-message');
  const fileInput = document.getElementById('chat-file');
  const orderInput = document.getElementById('chat-order');
  const form = new FormData();
  form.set('message', msgInput?.value || '');
  if (orderInput?.value) form.set('order_id', orderInput.value);
  if (fileInput?.files?.length) form.append('attachment', fileInput.files[0]);
  const res = await fetch(`${apiBase}/admin/chat`, { method: 'POST', headers: { Authorization: `Bearer ${authToken}` }, body: form });
  const data = await res.json();
  if (!res.ok) return toast(data.message || 'Erro ao enviar nota');
  toast('Nota registada');
  if (msgInput) msgInput.value = '';
  if (fileInput) fileInput.value = '';
  loadAdminChat();
}

const chatSend = document.getElementById('chat-send');
if (chatSend) {
  chatSend.onclick = sendAdminChat;
  document.getElementById('chat-refresh')?.addEventListener('click', loadAdminChat);
}

switch (adminPage) {
  case 'orders':
    loadOrders();
    loadMetrics();
    loadAudits();
    loadFeedbackAdmin();
    setInterval(() => {
      loadOrders();
      loadMetrics();
      loadAudits();
      loadFeedbackAdmin();
    }, 20000);
    break;
  case 'services':
    loadServices();
    setInterval(loadServices, 20000);
    break;
  case 'users':
    loadUsers();
    break;
  case 'metrics':
    loadMetrics();
    loadAudits();
    setInterval(() => {
      loadMetrics();
      loadAudits();
    }, 20000);
    break;
  case 'affiliates':
    loadCommissions();
    loadPayouts();
    loadMetrics();
    setInterval(() => {
      loadCommissions();
      loadPayouts();
    }, 20000);
    break;
  case 'chat':
    loadAdminChat();
    document.getElementById('chat-refresh')?.addEventListener('click', loadAdminChat);
    setInterval(loadAdminChat, 15000);
    break;
  default:
    loadMetrics();
    loadAudits();
}