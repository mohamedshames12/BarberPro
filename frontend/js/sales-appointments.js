document.addEventListener('DOMContentLoaded', () => {
  const token = sessionStorage.getItem('barberpro_token');
  const oldCustomer = document.getElementById('saleCustomer');
  const oldForm = oldCustomer?.closest('form') || document.querySelector('form');

  if (!oldForm) return;

  // إخفاء نموذج البيع اليدوي القديم
  oldForm.style.display = 'none';

  const section = document.createElement('section');
  section.id = 'completedInvoicePanel';
  section.innerHTML = `
    <style>
      #completedInvoicePanel {
        direction: rtl;
        color: inherit;
        margin: 18px 0 28px;
      }
      #completedInvoicePanel .ci-card {
        background: var(--card-bg, #171717);
        border: 1px solid rgba(212,175,55,.35);
        border-radius: 14px;
        padding: 20px;
        margin-bottom: 16px;
      }
      #completedInvoicePanel label {
        display:block;
        margin: 12px 0 7px;
        font-weight:600;
      }
      #completedInvoicePanel select,
      #completedInvoicePanel input,
      #completedInvoicePanel textarea {
        width:100%;
        box-sizing:border-box;
        padding:12px;
        border-radius:8px;
        border:1px solid #777;
        background:#111;
        color:#fff;
      }
      #completedInvoicePanel .ci-grid {
        display:grid;
        grid-template-columns:repeat(auto-fit,minmax(180px,1fr));
        gap:12px;
        margin-top:16px;
      }
      #completedInvoicePanel .ci-value {
        background:rgba(212,175,55,.08);
        padding:12px;
        border-radius:8px;
        min-height:24px;
      }
      #completedInvoicePanel .ci-total {
        font-size:20px;
        font-weight:bold;
        color:#d4af37;
        margin-top:16px;
      }
      #completedInvoicePanel button {
        border:0;
        border-radius:8px;
        padding:13px 20px;
        margin-top:16px;
        background:#c9a43b;
        color:#111;
        font-weight:bold;
        cursor:pointer;
      }
      #completedInvoicePanel button:disabled {
        opacity:.5;
        cursor:not-allowed;
      }
      #completedInvoicePanel .ci-message {
        margin-top:12px;
        line-height:1.8;
      }

      html[data-theme="light"] #completedInvoicePanel .ci-card {
        background: #ffffff;
        color: #202633;
        border-color: #e1e5ec;
        box-shadow: 0 4px 16px rgba(30,40,55,.06);
      }
      html[data-theme="light"] #completedInvoicePanel select,
      html[data-theme="light"] #completedInvoicePanel input,
      html[data-theme="light"] #completedInvoicePanel textarea {
        background: #ffffff;
        color: #202633;
        border-color: #d5dbe5;
      }
      html[data-theme="light"] #completedInvoicePanel .ci-value {
        background: #f4f6f9;
        color: #202633;
      }
      html[data-theme="light"] #completedInvoicePanel .ci-total {
        color: #98702b;
      }
      html[data-theme="light"] #completedInvoicePanel button {
        background: #b58b3c;
        color: #ffffff;
      }
    </style>

    <div class="ci-card">
      <h2>إصدار فاتورة لحلاقة مكتملة</h2>
      <p>اختر حجزًا انتهت خدمته بالفعل. بيانات العميل والخدمة والسعر تُحمّل تلقائيًا.</p>

      <label for="ciAppointment">الحجوزات المكتملة غير المفوترة</label>
      <select id="ciAppointment">
        <option value="">جاري تحميل الحجوزات...</option>
      </select>

      <div class="ci-grid">
        <div><label>اسم العميل</label><div class="ci-value" id="ciCustomer">—</div></div>
        <div><label>رقم الهاتف</label><div class="ci-value" id="ciPhone">—</div></div>
        <div><label>الخدمة</label><div class="ci-value" id="ciService">—</div></div>
        <div><label>الموظف</label><div class="ci-value" id="ciEmployee">—</div></div>
        <div><label>سعر الخدمة</label><div class="ci-value" id="ciPrice">—</div></div>
      </div>

      <form id="ciInvoiceForm">
        <label for="ciPayment">طريقة الدفع</label>
        <select id="ciPayment" required>
          <option value="cash">نقدي</option>
          <option value="card">بطاقة</option>
          <option value="wallet">محفظة إلكترونية</option>
          <option value="other">أخرى</option>
        </select>

        <label for="ciDiscount">الخصم بالجنيه</label>
        <input id="ciDiscount" type="number" min="0" step="0.01" value="0">

        <label for="ciNotes">ملاحظات</label>
        <textarea id="ciNotes" rows="2" placeholder="ملاحظات اختيارية"></textarea>

        <div class="ci-total">الإجمالي النهائي: <span id="ciTotal">0.00</span> ج</div>
        <button id="ciSubmit" type="submit" disabled>إصدار الفاتورة وحفظ البيع</button>
        <div class="ci-message" id="ciMessage" role="status"></div>
      </form>
    </div>
  `;

  oldForm.parentNode.insertBefore(section, oldForm);

  const $ = id => document.getElementById(id);
  let appointments = [];
  let selected = null;

  async function api(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'حدث خطأ في الاتصال');
    return data;
  }

  function resetDetails() {
    selected = null;
    ['ciCustomer','ciPhone','ciService','ciEmployee','ciPrice'].forEach(id => $(id).textContent = '—');
    $('ciTotal').textContent = '0.00';
    $('ciSubmit').disabled = true;
  }

  function updateTotal() {
    if (!selected) return;
    const discount = Number($('ciDiscount').value || 0);
    const price = Number(selected.service_price);
    $('ciTotal').textContent = Math.max(0, price - discount).toFixed(2);
  }

  function chooseAppointment() {
    const id = Number($('ciAppointment').value);
    selected = appointments.find(item => Number(item.id) === id) || null;

    if (!selected) {
      resetDetails();
      return;
    }

    $('ciCustomer').textContent = selected.customer_name || '—';
    $('ciPhone').textContent = selected.customer_phone || '—';
    $('ciService').textContent = selected.service_name || '—';
    $('ciEmployee').textContent = selected.employee_name || '—';
    $('ciPrice').textContent = Number(selected.service_price).toFixed(2) + ' ج';
    $('ciDiscount').value = '0';
    $('ciSubmit').disabled = false;
    updateTotal();
  }

  async function loadAppointments() {
    const select = $('ciAppointment');

    try {
      const data = await api('/api/sales/completed-appointments');
      appointments = data.appointments || [];
      select.innerHTML = '';

      if (!appointments.length) {
        select.innerHTML = '<option value="">لا توجد حلاقات مكتملة غير مفوترة</option>';
        resetDetails();
        return;
      }

      select.innerHTML = '<option value="">اختر الحلاقة المكتملة</option>';
      appointments.forEach(item => {
        const option = document.createElement('option');
        option.value = item.id;
        const date = item.appointment_date
          ? new Date(item.appointment_date).toLocaleDateString('ar-EG')
          : '';
        option.textContent =
          `${item.customer_name} — ${item.service_name} — ${date}`;
        select.appendChild(option);
      });
      resetDetails();
    } catch (error) {
      select.innerHTML = '<option value="">تعذر تحميل الحجوزات المكتملة</option>';
      $('ciMessage').textContent = error.message;
      $('ciMessage').style.color = '#ff7777';
    }
  }

  $('ciAppointment').addEventListener('change', chooseAppointment);
  $('ciDiscount').addEventListener('input', updateTotal);

  $('ciInvoiceForm').addEventListener('submit', async event => {
    event.preventDefault();

    if (!selected) {
      $('ciMessage').textContent = 'اختر حلاقة مكتملة أولًا';
      return;
    }

    const discount = Number($('ciDiscount').value || 0);
    if (!Number.isFinite(discount) || discount < 0 || discount > Number(selected.service_price)) {
      $('ciMessage').textContent = 'الخصم غير صحيح';
      return;
    }

    const button = $('ciSubmit');
    button.disabled = true;
    $('ciMessage').textContent = 'جاري إصدار الفاتورة...';

    try {
      const result = await api('/api/sales', {
        method: 'POST',
        body: JSON.stringify({
          appointmentId: selected.id,
          paymentMethod: $('ciPayment').value,
          discount,
          notes: $('ciNotes').value
        })
      });

      const invoice = result.sale;
      $('ciMessage').style.color = '#7ee0a1';
      $('ciMessage').textContent =
        `تم إصدار الفاتورة رقم ${invoice.invoice_number} بنجاح — الإجمالي ${Number(invoice.total).toFixed(2)} جنيه`;

      await loadAppointments();

      // تحديث سجل الفواتير والإحصائيات الموجودة في الصفحة
      setTimeout(() => window.location.reload(), 1800);
    } catch (error) {
      $('ciMessage').style.color = '#ff7777';
      $('ciMessage').textContent = error.message;
      button.disabled = false;
    }
  });

  loadAppointments();
});
