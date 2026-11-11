const token = sessionStorage.getItem('barberpro_token');

if (!token) {
    location.href = '/pages/login.html';
}

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

const form = document.getElementById('bookingForm');
const message = document.getElementById('bookingMessage');
const list = document.getElementById('bookingsList');
const employeeSelect = document.getElementById('bookingEmployee');
const serviceSelect = document.getElementById('bookingService');

let appointments = [];
let currentUser = null;

function statusName(status) {
    return {
        pending: 'قيد الانتظار',
        confirmed: 'مؤكد',
        completed: 'مكتمل',
        cancelled: 'ملغي'
    }[status] || status;
}

function updateStats() {
    const today = new Date().toLocaleDateString('en-CA');
    document.getElementById('totalBookings').textContent = appointments.length;
    document.getElementById('todayBookings').textContent =
        appointments.filter(a => String(a.appointment_date).slice(0, 10) === today).length;
    document.getElementById('pendingBookings').textContent =
        appointments.filter(a => a.status === 'pending').length;
    document.getElementById('completedBookings').textContent =
        appointments.filter(a => a.status === 'completed').length;
}

function renderAppointments() {
    const dateFilter = document.getElementById('filterDate').value;
    const statusFilter = document.getElementById('filterStatus').value;

    const filtered = appointments.filter(a => {
        const date = String(a.appointment_date).slice(0, 10);
        return (!dateFilter || date === dateFilter) &&
               (!statusFilter || a.status === statusFilter);
    });

    list.replaceChildren();

    if (!filtered.length) {
        list.textContent = 'لا توجد حجوزات مطابقة.';
        return;
    }

    filtered.forEach(a => {
        const row = document.createElement('div');
        row.className = 'booking-row';

        const values = [
            a.customer_name,
            a.customer_phone,
            a.service_name,
            `${String(a.appointment_date).slice(0, 10)} - ${String(a.appointment_time).slice(0, 5)}`,
            statusName(a.status)
        ];

        values.forEach(value => {
            const cell = document.createElement('span');
            cell.textContent = value ?? '';
            row.appendChild(cell);
        });

        const controls = document.createElement('div');
        controls.className = 'booking-controls';

        if (currentUser) {
            const select = document.createElement('select');

            ['pending', 'confirmed', 'completed', 'cancelled'].forEach(status => {
                const option = document.createElement('option');
                option.value = status;
                option.textContent = statusName(status);
                select.appendChild(option);
            });

            select.value = a.status;
            select.addEventListener('change', async () => {
                try {
                    await api(`/api/appointments/${a.id}/status`, {
                        method: 'PATCH',
                        body: JSON.stringify({ status: select.value })
                    });
                    await loadAppointments();
                } catch (error) {
                    alert(error.message);
                    select.value = a.status;
                }
            });

            controls.appendChild(select);
        }

        row.appendChild(controls);
        list.appendChild(row);
    });
}

async function loadAppointments() {
    const data = await api('/api/appointments');
    appointments = data.appointments || [];
    updateStats();
    renderAppointments();
}

async function loadServices() {
    const data = await api('/api/services');
    serviceSelect.replaceChildren();

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'اختر الخدمة';
    serviceSelect.appendChild(placeholder);

    (data.services || []).filter(service => service.is_active).forEach(service => {
        const option = document.createElement('option');
        option.value = service.name;
        option.textContent = `${service.name} - ${Number(service.price).toFixed(2)} جنيه - ${service.duration_minutes} دقيقة`;
        serviceSelect.appendChild(option);
    });
}

async function loadEmployees() {
    try {
        const data = await api('/api/employees');
        (data.employees || []).filter(e => e.status === 'active').forEach(employee => {
            const option = document.createElement('option');
            option.value = employee.id;
            option.textContent = employee.full_name;
            employeeSelect.appendChild(option);
        });
    } catch (error) {
        console.warn('تعذر تحميل الموظفين:', error.message);
    }
}

async function initialize() {
    try {
        const me = await api('/api/auth/me');
        currentUser = me.user;

        if (!['owner', 'manager'].includes(currentUser.role)) {
            form.hidden = true;
            document.querySelector('.appointments-panel h2').textContent = 'حجوزاتك';
        } else {
            await loadEmployees();
            await loadServices();
        }

        await loadAppointments();
    } catch (error) {
        list.textContent = error.message;
    }
}

form.addEventListener('submit', async event => {
    event.preventDefault();
    message.textContent = 'جاري حفظ الحجز...';

    const payload = {
        customerName: document.getElementById('customerName').value.trim(),
        customerPhone: document.getElementById('customerPhone').value.trim(),
        serviceName: serviceSelect.value.trim(),
        employeeId: employeeSelect.value || null,
        appointmentDate: document.getElementById('bookingDate').value,
        appointmentTime: document.getElementById('bookingTime').value,
        notes: document.getElementById('bookingNotes').value.trim()
    };

    try {
        await api('/api/appointments', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        message.textContent = 'تم حفظ الحجز بنجاح.';
        form.reset();
        await loadAppointments();
    } catch (error) {
        message.textContent = error.message;
    }
});

document.getElementById('filterDate').addEventListener('change', renderAppointments);
document.getElementById('filterStatus').addEventListener('change', renderAppointments);

initialize();
