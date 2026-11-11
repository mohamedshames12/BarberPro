(function () {
    const TIME_ZONE = 'Africa/Cairo';
    const DAY_START = 6;
    const NIGHT_START = 18;

    function updateTheme() {
        const forcedTheme = new URLSearchParams(window.location.search).get('theme');
        if (forcedTheme === 'light' || forcedTheme === 'dark') {
            document.documentElement.setAttribute('data-theme', forcedTheme);
            document.documentElement.style.colorScheme = forcedTheme;
            return;
        }
        try {
            const hour = Number(
                new Intl.DateTimeFormat('en-GB', {
                    timeZone: TIME_ZONE,
                    hour: '2-digit',
                    hourCycle: 'h23'
                }).format(new Date())
            );

            const theme = hour >= DAY_START && hour < NIGHT_START
                ? 'light'
                : 'dark';

            document.documentElement.setAttribute('data-theme', theme);
            document.documentElement.style.colorScheme = theme;
        } catch (error) {
            document.documentElement.setAttribute('data-theme', 'dark');
            console.error('BarberPro theme error:', error);
        }
    }

    updateTheme();
    setInterval(updateTheme, 60 * 1000);

    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) updateTheme();
    });
})();
