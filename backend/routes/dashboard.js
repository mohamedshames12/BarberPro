const express = require('express');
const router = express.Router();

const authenticateToken = require('../middleware/auth');
const { withTenantTransaction } = require('../config/tenant-db');

router.use(authenticateToken);

router.get('/summary', async (req, res) => {
  try {
    const { tenantId, role, userId } = req.user;

    const result = await withTenantTransaction(
      tenantId,
      (client) => client.query(
        `SELECT
          (
            SELECT COUNT(*)::INTEGER
            FROM public.appointments a
            WHERE a.appointment_date =
                  (NOW() AT TIME ZONE 'Africa/Cairo')::date
              AND a.status <> 'cancelled'
              AND ($1::text <> 'employee' OR a.employee_id = $2::integer)
          ) AS today_appointments,

          (
            SELECT COUNT(*)::INTEGER
            FROM public.customers
          ) AS total_customers,

          (
            SELECT COALESCE(SUM(s.total), 0)::NUMERIC(12,2)
            FROM public.sales s
            WHERE s.status = 'completed'
              AND s.created_at >= (
                DATE_TRUNC('day', NOW() AT TIME ZONE 'Africa/Cairo')
                AT TIME ZONE 'Africa/Cairo'
              )
              AND s.created_at < (
                (DATE_TRUNC('day', NOW() AT TIME ZONE 'Africa/Cairo')
                 + INTERVAL '1 day')
                AT TIME ZONE 'Africa/Cairo'
              )
              AND ($1::text <> 'employee' OR s.employee_id = $2::integer)
          ) AS today_revenue,

          (
            SELECT COUNT(*)::INTEGER
            FROM public.users u
            WHERE u.role = 'employee'
              AND u.status = 'active'
          ) AS active_employees`,
        [role, userId]
      )
    );

    return res.json({
      success: true,
      summary: result.rows[0]
    });
  } catch (error) {
    console.error('Dashboard summary error:', error);
    return res.status(503).json({
      success: false,
      message: 'تعذر تحميل مؤشرات لوحة التحكم'
    });
  }
});

module.exports = router;
