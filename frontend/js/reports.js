document.addEventListener('DOMContentLoaded', () => {
  const token = sessionStorage.getItem('barberpro_token');
  const $ = id => document.getElementById(id);
  let chart = null;

  const today = new Date();
  const localDate = date => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  $('reportFrom').value = localDate(monthStart);
  $('reportTo').value = localDate(today);

  const money = value =>
    Number(value || 0).toLocaleString('ar-EG', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }) + ' ج';

  async function loadReports() {
    const from = $('reportFrom').value;
    const to = $('reportTo').value;

    if (!from || !to || from > to) {
      $('reportMessage').textContent = 'اختر فترة تاريخ صحيحة';
      return;
    }

    if (!token) {
      $('reportMessage').textContent = 'انتهت جلسة الدخول. سجل الدخول مرة أخرى.';
      return;
    }

    $('reportMessage').textContent = 'جاري تحميل التقارير...';

    try {
      const response = await fetch(
        `/api/reports/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'تعذر تحميل التقارير');

      const s = data.summary || {};
      $('totalSales').textContent = money(s.total_sales);
      $('invoiceCount').textContent = Number(s.invoice_count || 0).toLocaleString('ar-EG');
      $('averageInvoice').textContent = money(s.average_invoice);
      $('todaySales').textContent = money(s.today_sales);
      $('todayInvoices').textContent = Number(s.today_invoices || 0).toLocaleString('ar-EG');
      $('monthSales').textContent = money(s.month_sales);

      renderChart(data.daily || []);
      renderServices(data.topServices || []);
      renderEmployees(data.employees || []);

      $('reportMessage').textContent = 'تم تحديث التقارير';
    } catch (error) {
      $('reportMessage').textContent = error.message;
    }
  }

  function renderChart(rows) {
    const canvas = $('salesChart');
    const ctx = canvas.getContext('2d');
    const empty = $('chartEmpty');

    if (chart) {
      chart.destroy();
      chart = null;
    }

    if (!rows.length) {
      canvas.hidden = true;
      empty.hidden = false;
      return;
    }

    canvas.hidden = false;
    empty.hidden = true;

    const width = canvas.clientWidth || 600;
    const height = canvas.clientHeight || 300;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    ctx.scale(ratio, ratio);

    const padding = { top: 25, right: 48, bottom: 45, left: 15 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const max = Math.max(...rows.map(r => Number(r.sales)), 1);

    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#444';
    ctx.fillStyle = '#aaa';

    for (let i = 0; i <= 4; i++) {
      const y = padding.top + chartHeight * i / 4;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText((max * (4 - i) / 4).toFixed(0), width - 5, y + 4);
    }

    const step = chartWidth / rows.length;
    const barWidth = Math.min(38, step * 0.55);

    rows.forEach((row, i) => {
      const value = Number(row.sales);
      const barHeight = value / max * chartHeight;
      const x = padding.left + step * i + (step - barWidth) / 2;
      const y = padding.top + chartHeight - barHeight;

      ctx.fillStyle = '#c9a43b';
      ctx.fillRect(x, y, barWidth, barHeight);

      ctx.fillStyle = '#eee';
      ctx.textAlign = 'center';
      const date = new Date(row.day).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit'
      });
      ctx.fillText(date, x + barWidth / 2, height - 15);
    });
  }

  function renderServices(rows) {
    const body = $('servicesTable');
    body.replaceChildren();

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="3">لا توجد خدمات مباعة في هذه الفترة</td></tr>';
      return;
    }

    rows.forEach(item => {
      const tr = document.createElement('tr');
      [item.service_name, Number(item.quantity).toLocaleString('ar-EG'), money(item.revenue)]
        .forEach(value => {
          const td = document.createElement('td');
          td.textContent = value;
          tr.appendChild(td);
        });
      body.appendChild(tr);
    });
  }

  function renderEmployees(rows) {
    const panel = $('employeeReport');
    if (!rows.length) {
      panel.hidden = true;
      return;
    }

    panel.hidden = false;
    const body = $('employeesTable');
    body.replaceChildren();

    rows.forEach(item => {
      const tr = document.createElement('tr');
      [
        item.employee_name,
        Number(item.invoice_count).toLocaleString('ar-EG'),
        money(item.total_sales)
      ].forEach(value => {
        const td = document.createElement('td');
        td.textContent = value;
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
  }

  $('applyFilter').addEventListener('click', loadReports);
  $('refreshReports').addEventListener('click', loadReports);
  loadReports();
});
