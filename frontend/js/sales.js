const token = sessionStorage.getItem('barberpro_token');

if (!token) location.href = '/pages/login.html';

const api = async (url, options = {}) => {
    const response = await fetch(url, {
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(options.headers || {})
        }
    });

    if (response.status === 401) {
        sessionStorage.removeItem('barberpro_token');
        location.href = '/pages/login.html';
        throw new Error('انتهت جلسة الدخول');
    }

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'حدث خطأ');
    return data;
};

const itemsBox = document.getElementById('saleItems');
const message = document.getElementById('saleMessage');
const form = document.getElementById('saleForm');

let services = [];
let sales = [];
let currentUser = null;

const money = value => `${Number(value || 0).toFixed(2)} ج`;

async function loadServices() {
    const data = await api('/api/services');
    services = (data.services || []).filter(s => s.is_active);
}

async function loadEmployees() {
    const data = await api('/api/employees');
    const select = document.getElementById('saleEmployee');

    (data.employees || []).filter(e => e.status === 'active').forEach(employee => {
        const option = document.createElement('option');
        option.value = employee.id;
        option.textContent = employee.full_name;
        select.appendChild(option);
    });
}

function addItem() {
    const row = document.createElement('div');
    row.className = 'sale-item';

    const label = document.createElement('label');
    label.textContent = 'الخدمة';
    const select = document.createElement('select');
    select.required = true;

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'اختر الخدمة';
    select.appendChild(placeholder);

    services.forEach(service => {
        const option = document.createElement('option');
        option.value = service.id;
        option.textContent = `${service.name} - ${money(service.price)}`;
        select.appendChild(option);
    });
    label.appendChild(select);

    const quantityLabel = document.createElement('label');
    quantityLabel.textContent = 'الكمية';
    const quantity = document.createElement('input');
    quantity.type = 'number';
    quantity.min = '1';
    quantity.step = '1';
    quantity.value = '1';
    quantity.required = true;
    quantityLabel.appendChild(quantity);

    const total = document.createElement('strong');
    total.className = 'line-total';
    total.textContent = money(0);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-item';
    remove.textContent = 'حذف';
    remove.addEventListener('click', () => {
        row.remove();
        calculateTotals();
    });

    select.addEventListener('change', calculateTotals);
    quantity.addEventListener('input', calculateTotals);

    row.append(label, quantityLabel, total, remove);
    itemsBox.appendChild(row);
    calculateTotals();
}

function getSelectedItems() {
    return [...itemsBox.querySelectorAll('.sale-item')].map(row => {
        const serviceId = row.querySelector('select').value;
        const quantity = Number(row.querySelector('input').value);
        const service = services.find(s => String(s.id) === serviceId);
        return { serviceId, quantity, service };
    }).filter(item => item.service && Number.isSafeInteger(item.quantity) && item.quantity > 0);
}

function calculateTotals() {
    let subtotal = 0;

    itemsBox.querySelectorAll('.sale-item').forEach(row => {
        const id = row.querySelector('select').value;
        const quantity = Number(row.querySelector('input').value) || 0;
        const service = services.find(s => String(s.id) === id);
        const line = service ? Number(service.price) * quantity : 0;
        subtotal += line;
        row.querySelector('.line-total').textContent = money(line);
    });

    const discount = Math.max(0, Number(document.getElementById('saleDiscount').value) || 0);
    document.getElementById('saleSubtotal').textContent = money(subtotal);
    document.getElementById('saleTotal').textContent = money(Math.max(0, subtotal - discount));
}

function updateStats() {
    const today = new Date().toLocaleDateString('en-CA');
    const todaySales = sales.filter(s => String(s.created_at).slice(0, 10) === today);

    document.getElementById('totalSales').textContent = sales.length;
    document.getElementById('totalRevenue').textContent =
        money(sales.filter(s => s.status === 'completed').reduce((sum, s) => sum + Number(s.total), 0));
    document.getElementById('todayRevenue').textContent =
        money(todaySales.filter(s => s.status === 'completed').reduce((sum, s) => sum + Number(s.total), 0));
}

function renderSales() {
    const term = document.getElementById('salesSearch').value.trim().toLowerCase();
    const list = document.getElementById('salesList');
    list.replaceChildren();

    const filtered = sales.filter(s =>
        String(s.invoice_number).includes(term) ||
        String(s.customer_name).toLowerCase().includes(term)
    );

    if (!filtered.length) {
        list.textContent = 'لا توجد فواتير حتى الآن.';
        return;
    }

    filtered.forEach(sale => {
        const row = document.createElement('div');
        row.className = 'sale-row';

        const info = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = `فاتورة رقم ${sale.invoice_number}`;
        const details = document.createElement('small');
        details.textContent = `${sale.customer_name} • ${new Date(sale.created_at).toLocaleString('ar-EG')}`;
        info.append(title, details);

        const amount = document.createElement('strong');
        amount.textContent = money(sale.total);

        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'عرض وطباعة';
        button.addEventListener('click', () => showInvoice(sale.id));

        row.append(info, amount, button);
        list.appendChild(row);
    });
}

async function loadSales() {
    const data = await api('/api/sales');
    sales = data.sales || [];
    updateStats();
    renderSales();
}

async function showInvoice(id) {
    try {
        const data = await api(`/api/sales/${id}`);
        const sale = data.sale;

        const printArea = document.createElement('section');
        printArea.id = 'printInvoice';
        printArea.innerHTML = '';

        const heading = document.createElement('h1');
        heading.textContent = 'BarberPro - فاتورة مبيعات';

        const number = document.createElement('h2');
        number.textContent = `فاتورة رقم ${sale.invoice_number}`;

        const customer = document.createElement('p');
        customer.textContent = `العميل: ${sale.customer_name}`;

        const date = document.createElement('p');
        date.textContent = `التاريخ: ${new Date(sale.created_at).toLocaleString('ar-EG')}`;

        printArea.append(heading, number, customer, date);

        const table = document.createElement('table');
        table.style.width = '100%';
        table.border = '1';

        const header = document.createElement('tr');
        ['الخدمة', 'الكمية', 'السعر', 'الإجمالي'].forEach(text => {
            const th = document.createElement('th');
            th.textContent = text;
            header.appendChild(th);
        });
        table.appendChild(header);

        sale.items.forEach(item => {
            const tr = document.createElement('tr');
            [item.service_name, item.quantity, money(item.unit_price), money(item.line_total)].forEach(value => {
                const td = document.createElement('td');
                td.textContent = value;
                tr.appendChild(td);
            });
            table.appendChild(tr);
        });

        printArea.appendChild(table);

        const summary = document.createElement('div');
        summary.innerHTML = `
            <p>الإجمالي قبل الخصم: ${money(sale.subtotal)}</p>
            <p>الخصم: ${money(sale.discount)}</p>
            <h2>الإجمالي النهائي: ${money(sale.total)}</h2>
            <p>طريقة الدفع: ${sale.payment_method}</p>
        `;
        printArea.appendChild(summary);

        const old = document.getElementById('printInvoice');
        if (old) old.remove();
        document.body.appendChild(printArea);

        window.print();
        printArea.remove();
    } catch (error) {
        alert(error.message);
    }
}

document.getElementById('addSaleItem').addEventListener('click', addItem);
document.getElementById('saleDiscount').addEventListener('input', calculateTotals);
document.getElementById('salesSearch').addEventListener('input', renderSales);

form.addEventListener('submit', async event => {
    event.preventDefault();

    const items = getSelectedItems();
    if (!items.length) {
        message.textContent = 'اختر خدمة واحدة على الأقل.';
        return;
    }

    const payload = {
        customerName: document.getElementById('saleCustomer').value.trim(),
        customerPhone: document.getElementById('salePhone').value.trim(),
        employeeId: document.getElementById('saleEmployee').value || null,
        paymentMethod: document.getElementById('paymentMethod').value,
        discount: Number(document.getElementById('saleDiscount').value) || 0,
        notes: document.getElementById('saleNotes').value.trim(),
        items: items.map(item => ({
            serviceId: Number(item.serviceId),
            quantity: item.quantity
        }))
    };

    message.textContent = 'جاري تسجيل البيع وإصدار الفاتورة...';
    document.getElementById('saveSale').disabled = true;

    try {
        const result = await api('/api/sales', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        form.reset();
        itemsBox.replaceChildren();
        addItem();
        message.textContent = `تم إصدار الفاتورة رقم ${result.sale.invoice_number} بنجاح.`;
        await loadSales();
        await showInvoice(result.sale.id);
    } catch (error) {
        message.textContent = error.message;
    } finally {
        document.getElementById('saveSale').disabled = false;
    }
});

async function initialize() {
    try {
        const me = await api('/api/auth/me');
        currentUser = me.user;

        if (['owner', 'manager'].includes(currentUser.role)) {
            await loadEmployees();
        } else {
            document.getElementById('saleEmployee').value = '';
            document.getElementById('saleEmployee').disabled = true;
        }

        await loadServices();
        if (!services.length) {
            message.textContent = 'لا توجد خدمات نشطة. أضف خدمة أولًا من صفحة الخدمات والأسعار.';
        } else {
            addItem();
        }

        await loadSales();
    } catch (error) {
        message.textContent = error.message;
        document.getElementById('salesList').textContent = error.message;
    }
}

initialize();
