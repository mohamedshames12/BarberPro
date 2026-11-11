(async function () {
    const token = sessionStorage.getItem('barberpro_token');

    const form = document.getElementById('employeeForm');
    const addButton = document.getElementById('addEmployeeButton');
    const formMessage = document.getElementById('employeeFormMessage');
    const employeesMessage = document.getElementById('employeesMessage');
    const tableBody = document.getElementById('employeesTableBody');
    const employeesCount = document.getElementById('employeesCount');
    const activeCount = document.getElementById('activeEmployeesCount');
    const logoutButton = document.getElementById('logoutButton');

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
                ...(options.headers || {})
            }
        });

        const result = await response.json().catch(() => ({}));

        if (response.status === 401) {
            sessionStorage.removeItem('barberpro_token');
            window.location.replace('/pages/login.html');
            throw new Error('انتهت جلسة الدخول. سجل الدخول مرة أخرى.');
        }

        return { response, result };
    }

    function showMessage(element, message, success = false) {
        element.textContent = message;
        element.style.color = success ? '#7de0a1' : '#ff9999';
    }

    function createCell(value) {
        const cell = document.createElement('td');
        cell.textContent = value;
        return cell;
    }

    async function loadEmployees() {
        employeesMessage.textContent = 'جارٍ تحميل الموظفين...';
        tableBody.replaceChildren();

        const { response, result } = await apiRequest('/api/employees');

        if (!response.ok || !result.success) {
            throw new Error(result.message || 'تعذر تحميل الموظفين');
        }

        const employees = result.employees || [];

        employeesCount.textContent =
            employees.length.toLocaleString('ar-EG');

        const activeEmployees = employees.filter(
            employee => employee.status === 'active'
        ).length;

        activeCount.textContent =
            activeEmployees.toLocaleString('ar-EG');

        if (employees.length === 0) {
            employeesMessage.textContent = 'لا يوجد موظفون حتى الآن.';
            return;
        }

        employeesMessage.textContent = '';

        employees.forEach(employee => {
            const row = document.createElement('tr');

            row.appendChild(createCell(employee.fullName));
            row.appendChild(createCell(employee.email));

            const statusCell = document.createElement('td');
            const statusBadge = document.createElement('span');

            statusBadge.className =
                `employee-status ${employee.status}`;

            statusBadge.textContent =
                employee.status === 'active' ? 'نشط' : 'معطل';

            statusCell.appendChild(statusBadge);
            row.appendChild(statusCell);

            const date = employee.createdAt
                ? new Date(employee.createdAt).toLocaleDateString('ar-EG')
                : '—';

            row.appendChild(createCell(date));

            tableBody.appendChild(row);
        });
    }

    try {
        const { response, result } = await apiRequest('/api/auth/me');

        if (!response.ok || !result.success || !result.user) {
            throw new Error('تعذر التحقق من الحساب');
        }

        if (!['owner', 'manager'].includes(result.user.role)) {
            document.querySelector('.employees-main').textContent =
                'ليس لديك صلاحية الوصول إلى إدارة الموظفين.';
            return;
        }

        await loadEmployees();

    } catch (error) {
        showMessage(employeesMessage, error.message);
        return;
    }

    form.addEventListener('submit', async event => {
        event.preventDefault();

        const fullName = document.getElementById('employeeName').value.trim();
        const email = document.getElementById('employeeEmail').value.trim();
        const password = document.getElementById('employeePassword').value;

        addButton.disabled = true;
        addButton.textContent = 'جارٍ إضافة الموظف...';
        formMessage.textContent = '';

        try {
            const { response, result } = await apiRequest('/api/employees', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ fullName, email, password })
            });

            if (!response.ok || !result.success) {
                throw new Error(result.message || 'تعذرت إضافة الموظف');
            }

            form.reset();
            showMessage(formMessage, 'تم إنشاء حساب الموظف بنجاح.', true);

            await loadEmployees();

        } catch (error) {
            showMessage(formMessage, error.message);
        } finally {
            addButton.disabled = false;
            addButton.textContent = 'إضافة الموظف';
        }
    });
})();
