(async function () {
    const token = sessionStorage.getItem('barberpro_token');

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

    try {
        const response = await fetch('/api/auth/me', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        const result = await response.json();

        if (!response.ok || !result.success || !result.user) {
            sessionStorage.removeItem('barberpro_token');
            window.location.replace('/pages/login.html');
            return;
        }

        const user = result.user;

        // إخفاء إدارة الموظفين عن الموظف العادي
        if (user.role === 'employee') {
            document.querySelectorAll('a').forEach(link => {
                if (link.textContent.includes('فريق العمل')) {
                    link.style.display = 'none';
                }
            });
        }

        // تحميل مؤشرات لوحة التحكم من API موحد
        try {
            const summaryResponse = await fetch('/api/dashboard/summary', {
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });

            const summaryResult = await summaryResponse.json();

            if (!summaryResponse.ok || !summaryResult.success || !summaryResult.summary) {
                throw new Error(summaryResult.message || 'Dashboard summary failed');
            }

            const data = summaryResult.summary;
            const cards = document.querySelectorAll('.stats .stat-card');

            const formatNumber = value =>
                Number(value || 0).toLocaleString('ar-EG');

            const formatMoney = value =>
                Number(value || 0).toLocaleString('ar-EG', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                });

            const values = [
                formatNumber(data.today_appointments),
                formatNumber(data.total_customers),
                `${formatMoney(data.today_revenue)} <small>ج.م</small>`,
                formatNumber(data.active_employees)
            ];

            cards.forEach((card, index) => {
                const number = card.querySelector('.stat-number');
                const status = card.querySelector('.stat-bottom .neutral-text');

                if (number && values[index] !== undefined) {
                    number.innerHTML = values[index];
                }

                if (status) {
                    status.textContent = 'محدث الآن';
                }
            });

        } catch (summaryError) {
            console.error('Dashboard summary error:', summaryError);

            document.querySelectorAll('.stats .stat-card').forEach(card => {
                const number = card.querySelector('.stat-number');
                const status = card.querySelector('.stat-bottom .neutral-text');

                if (number) number.textContent = 'تعذر التحميل';
                if (status) status.textContent = 'تحقق من اتصال السيرفر';
            });
        }



        const profileName = document.querySelector('.profile-info strong');
        const profileGreeting = document.querySelector('.profile-info small');
        const profileAvatar = document.querySelector('.profile-avatar');
        const heroTitle = document.querySelector('.hero-content h2');

        if (profileName) {
            profileName.textContent = user.fullName;
        }

        if (profileGreeting) {
            profileGreeting.textContent = user.tenantName;
        }

        if (profileAvatar) {
            profileAvatar.textContent =
                user.fullName.trim().charAt(0).toUpperCase();
        }

        if (heroTitle) {
            heroTitle.innerHTML =
                `أهلاً بك في ${escapeHtml(user.tenantName)}<br>` +
                '<span>كل تفاصيل صالونك... تحت سيطرتك.</span>';
        }

    } catch (error) {
        console.error('Dashboard authentication error:', error);
        document.body.innerHTML =
            '<div style="padding:30px;text-align:center;color:white">' +
            'تعذر الاتصال بالسيرفر. حدّث الصفحة وحاول مرة أخرى.' +
            '</div>';
    }
})();

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    })[char]);
}
