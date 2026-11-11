const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const { withTenantTransaction } = require('../config/tenant-db');

router.use(authenticateToken);

router.get('/summary', async (req, res) => {
  const from = req.query.from;
  const to = req.query.to;

  const validDate = value =>
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value));

  if (!validDate(from) || !validDate(to) || from > to) {
    return res.status(400).json({
      success: false,
      message: 'فترة التقرير غير صحيحة'
    });
  }

  try {
    const data = await withTenantTransaction(
      req.user.tenantId,
      async client => {
        const employeeOnly = req.user.role === 'employee';
        const employeeId = employeeOnly ? req.user.userId : null;

        const summary = await client.query(`
          SELECT
            COUNT(*)::INTEGER AS invoice_count,
            COALESCE(SUM(total), 0)::NUMERIC(12,2) AS total_sales,
            COALESCE(AVG(total), 0)::NUMERIC(12,2) AS average_invoice,
            COUNT(*) FILTER (
              WHERE created_at::date = CURRENT_DATE
            )::INTEGER AS today_invoices,
            COALESCE(SUM(total) FILTER (
              WHERE created_at::date = CURRENT_DATE
            ), 0)::NUMERIC(12,2) AS today_sales,
            COALESCE(SUM(total) FILTER (
              WHERE date_trunc('month', created_at) =
                    date_trunc('month', CURRENT_DATE)
            ), 0)::NUMERIC(12,2) AS month_sales
          FROM public.sales
          WHERE tenant_id = $1
            AND status = 'completed'
            AND created_at >= $2::date
            AND created_at < ($3::date + INTERVAL '1 day')
            AND ($4::BIGINT IS NULL OR employee_id = $4)
        `, [req.user.tenantId, from, to, employeeId]);

        const daily = await client.query(`
          SELECT
            created_at::date AS day,
            COUNT(*)::INTEGER AS invoices,
            COALESCE(SUM(total), 0)::NUMERIC(12,2) AS sales
          FROM public.sales
          WHERE tenant_id = $1
            AND status = 'completed'
            AND created_at >= $2::date
            AND created_at < ($3::date + INTERVAL '1 day')
            AND ($4::BIGINT IS NULL OR employee_id = $4)
          GROUP BY created_at::date
          ORDER BY day
        `, [req.user.tenantId, from, to, employeeId]);

        const services = await client.query(`
          SELECT
            si.service_name,
            SUM(si.quantity)::INTEGER AS quantity,
            COALESCE(SUM(si.line_total), 0)::NUMERIC(12,2) AS revenue
          FROM public.sale_items si
          JOIN public.sales s
            ON s.id = si.sale_id
           AND s.tenant_id = si.tenant_id
          WHERE si.tenant_id = $1
            AND s.status = 'completed'
            AND s.created_at >= $2::date
            AND s.created_at < ($3::date + INTERVAL '1 day')
            AND ($4::BIGINT IS NULL OR s.employee_id = $4)
          GROUP BY si.service_name
          ORDER BY revenue DESC
          LIMIT 10
        `, [req.user.tenantId, from, to, employeeId]);

        const employees = employeeOnly
          ? { rows: [] }
          : await client.query(`
              SELECT
                u.id AS employee_id,
                u.full_name AS employee_name,
                COUNT(s.id)::INTEGER AS invoice_count,
                COALESCE(SUM(s.total), 0)::NUMERIC(12,2) AS total_sales
              FROM public.users u
              LEFT JOIN public.sales s
                ON s.tenant_id = u.tenant_id
               AND s.employee_id = u.id
               AND s.status = 'completed'
               AND s.created_at >= $2::date
               AND s.created_at < ($3::date + INTERVAL '1 day')
              WHERE u.tenant_id = $1
                AND u.role = 'employee'
              GROUP BY u.id, u.full_name
              ORDER BY total_sales DESC
            `, [req.user.tenantId, from, to]);

        return {
          summary: summary.rows[0],
          daily: daily.rows,
          topServices: services.rows,
          employees: employees.rows
        };
      },
      req.user.userId
    );

    res.json({ success: true, ...data });
  } catch (error) {
    console.error('Reports summary error:', error.message);
    res.status(500).json({
      success: false,
      message: 'تعذر تحميل التقارير'
    });
  }
});

module.exports = router;
