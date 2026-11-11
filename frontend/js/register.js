const registerForm = document.getElementById('registerForm');
const registerButton = document.getElementById('registerButton');
const registerMessage = document.getElementById('registerMessage');

registerForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const data = {
        tenantName: document.getElementById('tenantName').value.trim(),
        tenantPhone: document.getElementById('tenantPhone').value.trim(),
        tenantEmail: document.getElementById('tenantEmail').value.trim(),
        tenantAddress: document.getElementById('tenantAddress').value.trim(),
        ownerName: document.getElementById('ownerName').value.trim(),
        ownerEmail: document.getElementById('ownerEmail').value.trim(),
        password: document.getElementById('password').value
    };

    registerButton.disabled = true;
    registerButton.textContent = 'جارٍ إنشاء الحساب...';
    registerMessage.textContent = '';

    try {
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || 'تعذر إنشاء الحساب');
        }

        registerMessage.textContent =
            'تم إنشاء حسابك بنجاح! كود الصالون: ' + result.tenantCode +
            ' — احتفظ بالكود لاستخدامه عند تسجيل الدخول.';

        registerMessage.classList.add('success');

        registerForm.reset();

    } catch (error) {
        registerMessage.textContent =
            error.message === 'Failed to fetch'
                ? 'تعذر الاتصال بالسيرفر. تأكد أن السيرفر يعمل.'
                : error.message;

        registerMessage.classList.remove('success');

    } finally {
        registerButton.disabled = false;
        registerButton.textContent = 'إنشاء حساب الصالون';
    }
});
