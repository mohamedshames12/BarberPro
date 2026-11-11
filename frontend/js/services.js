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

const form = document.getElementById('serviceForm');
const list = document.getElementById('servicesList');
const message = document.getElementById('serviceMessage');
const search = document.getElementById('serviceSearch');

let services = [];
let currentUser = null;

const canManage = () =>
    currentUser && ['owner', 'manager'].includes(currentUser.role);

function updateStats() {
    document.getElementById('totalServices').textContent = services.length;
    document.getElementById('activeServices').textContent =
        services.filter(s => s.is_active).length;
    document.getElementById('inactiveServices').textContent =
        services.filter(s => !s.is_active).length;
}

function resetForm() {
    form.reset();
    document.getElementById('serviceId').value = '';
    document.getElementById('formTitle').textContent = 'إضافة خدمة جديدة';
    document.getElementById('saveService').textContent = 'حفظ الخدمة';
    document.getElementById('cancelEdit').hidden = true;
    document.getElementById('serviceDuration').value = 30;
    message.textContent = '';
}

function renderServices() {
    const term = search.value.trim().toLowerCase();

    const filtered = services.filter(service =>
        service.name.toLowerCase().includes(term) ||
        (service.description || '').toLowerCase().includes(term)
    );

    list.replaceChildren();

    if (!filtered.length) {
        list.textContent = 'لا توجد خدمات لعرضها.';
        return;
    }

    filtered.forEach(service => {
        const card = document.createElement('article');
        card.className = 'service-card';

        const info = document.createElement('div');

        const name = document.createElement('h3');
        name.textContent = service.name;

        const description = document.createElement('p');
        description.textContent = service.description || 'بدون وصف';

        const price = document.createElement('p');
        price.className = 'service-price';
        price.textContent = `${Number(service.price).toFixed(2)} جنيه`;

        const duration = document.createElement('p');
        duration.textContent = `المدة: ${service.duration_minutes} دقيقة`;

        const status = document.createElement('p');
        status.className = `service-status ${service.is_active ? '' : 'inactive'}`;
        status.textContent = service.is_active ? '● خدمة نشطة' : '● خدمة متوقفة';

        info.append(name, description, price, duration, status);
        card.appendChild(info);

        if (canManage()) {
            const actions = document.createElement('div');
            actions.className = 'service-actions';

            const editButton = document.createElement('button');
            editButton.type = 'button';
            editButton.textContent = 'تعديل';
            editButton.addEventListener('click', () => editService(service));

            const toggleButton = document.createElement('button');
            toggleButton.type = 'button';
            toggleButton.textContent = service.is_active ? 'إيقاف الخدمة' : 'تفعيل الخدمة';
            toggleButton.addEventListener('click', () => toggleService(service));

            actions.append(editButton, toggleButton);
            card.appendChild(actions);
        }

        list.appendChild(card);
    });
}

async function loadServices() {
    try {
        const data = await api('/api/services');
        services = data.services || [];
        updateStats();
        renderServices();
    } catch (error) {
        list.textContent = error.message;
    }
}

function editService(service) {
    document.getElementById('serviceId').value = service.id;
    document.getElementById('serviceName').value = service.name;
    document.getElementById('servicePrice').value = service.price;
    document.getElementById('serviceDuration').value = service.duration_minutes;
    document.getElementById('serviceDescription').value = service.description || '';

    document.getElementById('formTitle').textContent = 'تعديل الخدمة';
    document.getElementById('saveService').textContent = 'حفظ التعديلات';
    document.getElementById('cancelEdit').hidden = false;

    document.getElementById('serviceFormPanel').scrollIntoView({
        behavior: 'smooth'
    });
}

async function toggleService(service) {
    const action = service.is_active ? 'إيقاف' : 'تفعيل';

    if (!confirm(`هل تريد ${action} خدمة ${service.name}؟`)) return;

    try {
        await api(`/api/services/${service.id}`, {
            method: 'PATCH',
            body: JSON.stringify({ isActive: !service.is_active })
        });

        await loadServices();
        message.textContent = `تم ${action} الخدمة بنجاح.`;
    } catch (error) {
        message.textContent = error.message;
    }
}

form.addEventListener('submit', async event => {
    event.preventDefault();

    const id = document.getElementById('serviceId').value;

    const payload = {
        name: document.getElementById('serviceName').value.trim(),
        price: Number(document.getElementById('servicePrice').value),
        durationMinutes: Number(document.getElementById('serviceDuration').value),
        description: document.getElementById('serviceDescription').value.trim()
    };

    message.textContent = 'جاري حفظ الخدمة...';

    try {
        await api(id ? `/api/services/${id}` : '/api/services', {
            method: id ? 'PATCH' : 'POST',
            body: JSON.stringify(payload)
        });

        resetForm();
        message.textContent = 'تم حفظ الخدمة بنجاح.';
        await loadServices();
    } catch (error) {
        message.textContent = error.message;
    }
});

document.getElementById('cancelEdit').addEventListener('click', resetForm);
search.addEventListener('input', renderServices);

async function initialize() {
    try {
        const me = await api('/api/auth/me');
        currentUser = me.user;

        if (!canManage()) {
            document.getElementById('serviceFormPanel').hidden = true;
        }

        await loadServices();
    } catch (error) {
        list.textContent = error.message;
    }
}

initialize();
