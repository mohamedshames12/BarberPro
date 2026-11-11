const loginForm = document.getElementById('loginForm');
const loginButton = document.getElementById('loginButton');
const loginMessage = document.getElementById('loginMessage');

loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const data = {
        tenantCode: document.getElementById('tenantCode').value.trim(),
        email: document.getElementById('email').value.trim(),
        password: document.getElementById('password').value
    };

    loginButton.disabled = true;
    loginButton.textContent = 'جارٍ تسجيل الدخول...';
    loginMessage.textContent = '';
    loginMessage.classList.remove('success');

    try {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (!response.ok || !result.token) {
            throw new Error(result.message || 'بيانات الدخول غير صحيحة');
        }

        sessionStorage.setItem('barberpro_token', result.token);

        const checkResponse = await fetch('/api/auth/me', {
            headers: {
                Authorization: `Bearer ${result.token}`
            }
        });

        const account = await checkResponse.json();

        if (!checkResponse.ok || !account.success) {
            sessionStorage.removeItem('barberpro_token');
            throw new Error(account.message || 'تعذر التحقق من الحساب');
        }

        loginMessage.textContent =
            `تم التحقق بنجاح، أهلاً ${account.user.fullName}`;
        loginMessage.classList.add('success');

        window.location.href = '../index.html';

    } catch (error) {
        loginMessage.textContent =
            error.message === 'Failed to fetch'
                ? 'تعذر الاتصال بالسيرفر'
                : error.message;

    } finally {
        loginButton.disabled = false;
        loginButton.textContent = 'تسجيل الدخول';
    }
});
