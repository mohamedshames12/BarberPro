(async function () {
    const token = sessionStorage.getItem('barberpro_token');

    const form = document.getElementById('customerForm');
    const saveButton = document.getElementById('saveCustomerButton');
    const formMessage = document.getElementById('customerFormMessage');
    const tableBody = document.getElementById('customersTableBody');
    const listMessage = document.getElementById('customersListMessage');
    const searchInput = document.getElementById('customerSearch');
    const totalCustomers = document.getElementById('totalCustomers');
    const logoutButton = document.getElementById('logoutButton');

    let customers = [];
    let currentUserRole = '';
    let editingCustomerId = null;

    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            sessionStorage.removeItem('barberpro_token');
            window.location.replace('/pages/login.html');
        });
    }

    if (!token) {
        window.location.replace('/pages/login.html');
        return;
    }

    async function apiRequest(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            headers: {
                Authorization: `Bearer ${token}`,
                ...(options.body ? { 'Content-Type': 'application/json' } : {}),
                ...options.headers
            }
        });

        const result = await response.json().catch(() => ({}));

        if (response.status === 401) {
            sessionStorage.removeItem('barberpro_token');
            window.location.replace('/pages/login.html');
            throw new Error('انتهت جلسة تسجيل الدخول');
        }

        if (!response.ok) {
            throw new Error(result.message || 'حدث خطأ أثناء الاتصال بالسيرفر');
        }

        return result;
    }

    function showFormMessage(message, type) {
        formMessage.textContent = message;
        formMessage.className = type || '';
    }

    function canManageCustomers() {
        return ['owner', 'manager'].includes(currentUserRole);
    }

    function renderCustomers(items) {
        tableBody.replaceChildren();

        if (!items.length) {
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 5;
            cell.textContent = customers.length
                ? 'لا توجد نتائج مطابقة للبحث'
                : 'لا يوجد عملاء مسجلون حتى الآن';
            row.appendChild(cell);
            tableBody.appendChild(row);
            return;
        }

        items.forEach((customer) => {
            const row = document.createElement('tr');

            const nameCell = document.createElement('td');
            nameCell.textContent = customer.full_name || '—';

            const phoneCell = document.createElement('td');
            phoneCell.textContent = customer.phone || '—';

            const emailCell = document.createElement('td');
            emailCell.textContent = customer.email || '—';

            const dateCell = document.createElement('td');
            dateCell.textContent = customer.created_at
                ? new Intl.DateTimeFormat('ar-EG', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                }).format(new Date(customer.created_at))
                : '—';

            const actionsCell = document.createElement('td');

            if (canManageCustomers()) {
                const editButton = document.createElement('button');
                editButton.type = 'button';
                editButton.textContent = 'تعديل';
                editButton.className = 'customer-edit-button';
                editButton.addEventListener('click', () => editCustomer(customer));

                const deleteButton = document.createElement('button');
                deleteButton.type = 'button';
                deleteButton.textContent = 'حذف';
                deleteButton.className = 'customer-delete-button';
                deleteButton.addEventListener('click', () => deleteCustomer(customer.id));

                actionsCell.append(editButton, deleteButton);
            } else {
                actionsCell.textContent = '—';
            }

            row.append(nameCell, phoneCell, emailCell, dateCell, actionsCell);
            tableBody.appendChild(row);
        });
    }

    function editCustomer(customer) {
        editingCustomerId = customer.id;

        form.elements.fullName.value = customer.full_name || '';
        form.elements.phone.value = customer.phone || '';
        form.elements.email.value = customer.email || '';
        form.elements.birthDate.value = customer.birth_date
            ? String(customer.birth_date).slice(0, 10)
            : '';
        form.elements.notes.value = customer.notes || '';

        saveButton.textContent = 'حفظ التعديلات';
        showFormMessage('أنت تعدّل بيانات العميل: ' + customer.full_name, 'success');

        document.getElementById('addCustomerSection').scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }

    async function deleteCustomer(customerId) {
        if (!canManageCustomers()) {
            return;
        }

        const confirmed = window.confirm('هل أنت متأكد من حذف هذا العميل؟');
        if (!confirmed) {
            return;
        }

        try {
            const result = await apiRequest(`/api/customers/${encodeURIComponent(customerId)}`, {
                method: 'DELETE'
            });

            if (!result.success) {
                throw new Error(result.message || 'تعذر حذف العميل');
            }

            listMessage.textContent = 'تم حذف العميل بنجاح';
            await loadCustomers();
        } catch (error) {
            console.error('Delete customer error:', error);
            listMessage.textContent = error.message;
        }
    }

    function filterCustomers() {
        const query = searchInput.value.trim().toLocaleLowerCase();

        const filtered = customers.filter((customer) => {
            const name = String(customer.full_name || '').toLocaleLowerCase();
            const phone = String(customer.phone || '').toLocaleLowerCase();

            return name.includes(query) || phone.includes(query);
        });

        renderCustomers(filtered);
    }

    async function loadCustomers() {
        tableBody.innerHTML =
            '<tr><td colspan="5">جاري تحميل العملاء...</td></tr>';

        try {
            const result = await apiRequest('/api/customers/');

            if (!result.success || !Array.isArray(result.customers)) {
                throw new Error('استجابة قائمة العملاء غير صحيحة');
            }

            customers = result.customers;
            totalCustomers.textContent =
                customers.length.toLocaleString('ar-EG');

            filterCustomers();
            listMessage.textContent = '';
        } catch (error) {
            console.error('Load customers error:', error);
            tableBody.innerHTML =
                '<tr><td colspan="5">تعذر تحميل قائمة العملاء</td></tr>';
            listMessage.textContent = error.message;
        }
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (!form.reportValidity()) {
            return;
        }

        const formData = new FormData(form);

        const customer = {
            fullName: String(formData.get('fullName') || '').trim(),
            phone: String(formData.get('phone') || '').trim(),
            email: String(formData.get('email') || '').trim(),
            birthDate: String(formData.get('birthDate') || ''),
            notes: String(formData.get('notes') || '').trim()
        };

        saveButton.disabled = true;
        saveButton.textContent = 'جاري الحفظ...';
        showFormMessage('', '');

        try {
            const isEditing = editingCustomerId !== null;

            const result = await apiRequest(
                isEditing
                    ? `/api/customers/${encodeURIComponent(editingCustomerId)}`
                    : '/api/customers/',
                {
                    method: isEditing ? 'PUT' : 'POST',
                    body: JSON.stringify(customer)
                }
            );

            if (!result.success) {
                throw new Error(result.message || 'تعذرت إضافة العميل');
            }

            showFormMessage(
                isEditing ? 'تم تعديل بيانات العميل بنجاح' : 'تمت إضافة العميل بنجاح',
                'success'
            );

            form.reset();
            editingCustomerId = null;
            saveButton.textContent = 'حفظ العميل';
            await loadCustomers();
        } catch (error) {
            console.error('Add customer error:', error);
            showFormMessage(error.message, 'error');
        } finally {
            saveButton.disabled = false;
            saveButton.textContent = editingCustomerId !== null ? 'حفظ التعديلات' : 'حفظ العميل';
        }
    });

    searchInput.addEventListener('input', filterCustomers);

    try {
        const meResult = await apiRequest('/api/auth/me');

        currentUserRole = meResult.user?.role || '';

        await loadCustomers();
    } catch (error) {
        console.error('Customers page authentication error:', error);
        listMessage.textContent = error.message;
    }
})();
