const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const { withTenantTransaction } = require('../config/tenant-db');

router.use(authenticateToken);

const validId = value => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

const money = value => Math.round(Number(value) * 100) / 100;

router.get('/completed-appointments', async (req, res) => {
  try {
    const result = await withTenantTransaction(
      req.user.tenantId,
      async client => {
        const params = [req.user.tenantId];
        let employeeFilter = '';

        if (req.user.role === 'employee') {
          params.push(req.user.userId);
          employeeFilter = 'AND a.employee_id = $2';
        }

        return client.query(`
          SELECT
            a.id,
            a.customer_name,
            a.customer_phone,
            a.service_name,
            a.employee_id,
            u.full_name AS employee_name,
            a.appointment_date,
            a.appointment_time,
            s.id AS service_id,
            s.price AS service_price
          FROM public.appointments a
          JOIN public.services s
            ON s.tenant_id = a.tenant_id
           AND LOWER(TRIM(s.name)) = LOWER(TRIM(a.service_name))
          LEFT JOIN public.users u
            ON u.tenant_id = a.tenant_id
           AND u.id = a.employee_id
          WHERE a.tenant_id = $1
            AND a.status = 'completed'
            ${employeeFilter}
            AND NOT EXISTS (
              SELECT 1
              FROM public.sales x
              WHERE x.tenant_id = a.tenant_id
                AND x.appointment_id = a.id
            )
          ORDER BY a.appointment_date DESC, a.appointment_time DESC
        `, params);
      },
      req.user.userId
    );

    res.json({ success: true, appointments: result.rows });
  } catch (error) {
    console.error('Completed appointments error:', error.message);
    res.status(500).json({
      success: false,
      message: 'تعذر تحميل الحجوزات المكتملة'
    });
  }
});

router.get('/', async (req, res) => {
  try {
    const result = await withTenantTransaction(
      req.user.tenantId,
      client => client.query(`
        SELECT s.*, COUNT(si.id)::INTEGER AS item_count
        FROM public.sales s
        LEFT JOIN public.sale_items si
          ON si.sale_id = s.id
         AND si.tenant_id = s.tenant_id
        WHERE s.tenant_id = $1
          AND ($2::BIGINT IS NULL OR s.employee_id = $2)
        GROUP BY s.id
        ORDER BY s.created_at DESC
        LIMIT 200
      `, [
        req.user.tenantId,
        req.user.role === 'employee' ? req.user.userId : null
      ]),
      req.user.userId
    );

    res.json({ success: true, sales: result.rows });
  } catch (error) {
    console.error('Get sales error:', error.message);
    res.status(500).json({ success: false, message: 'تعذر تحميل المبيعات' });
  }
});

router.get('/:id', async (req, res) => {
  const id = validId(req.params.id);
  if (!id) return res.status(400).json({ success: false, message: 'رقم فاتورة غير صحيح' });

  try {
    const result = await withTenantTransaction(
      req.user.tenantId,
      async client => {
        const sale = await client.query(`
          SELECT *
          FROM public.sales
          WHERE tenant_id = $1 AND id = $2
            AND ($3::BIGINT IS NULL OR employee_id = $3)
        `, [
          req.user.tenantId,
          id,
          req.user.role === 'employee' ? req.user.userId : null
        ]);

        if (!sale.rowCount) return null;

        const items = await client.query(`
          SELECT *
          FROM public.sale_items
          WHERE tenant_id = $1 AND sale_id = $2
          ORDER BY id
        `, [req.user.tenantId, id]);

        return { sale: sale.rows[0], items: items.rows };
      },
      req.user.userId
    );

    if (!result) {
      return res.status(404).json({ success: false, message: 'الفاتورة غير موجودة' });
    }

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Get invoice error:', error.message);
    res.status(500).json({ success: false, message: 'تعذر تحميل الفاتورة' });
  }
});

/* الفاتورة لا تُنشأ إلا من حجز مكتمل */
router.post('/', async (req, res) => {
  const appointmentId = validId(req.body.appointmentId);
  const paymentMethod = req.body.paymentMethod;
  const discount = money(req.body.discount ?? 0);
  const notes = typeof req.body.notes === 'string' ? req.body.notes.trim() : '';

  if (!appointmentId) {
    return res.status(400).json({
      success: false,
      message: 'اختر حلاقة مكتملة من القائمة'
    });
  }

  if (!['cash', 'card', 'wallet', 'other'].includes(paymentMethod)) {
    return res.status(400).json({ success: false, message: 'طريقة الدفع غير صحيحة' });
  }

  if (!Number.isFinite(discount) || discount < 0) {
    return res.status(400).json({ success: false, message: 'قيمة الخصم غير صحيحة' });
  }

  try {
    const sale = await withTenantTransaction(
      req.user.tenantId,
      async client => {
        const appointment = await client.query(`
          SELECT
            a.id,
            a.customer_name,
            a.customer_phone,
            a.service_name,
            a.employee_id,
            s.id AS service_id,
            s.price AS service_price
          FROM public.appointments a
          JOIN public.services s
            ON s.tenant_id = a.tenant_id
           AND LOWER(TRIM(s.name)) = LOWER(TRIM(a.service_name))
          WHERE a.tenant_id = $1
            AND a.id = $2
            AND a.status = 'completed'
            AND ($3::BIGINT IS NULL OR a.employee_id = $3)
          FOR UPDATE OF a
        `, [
          req.user.tenantId,
          appointmentId,
          req.user.role === 'employee' ? req.user.userId : null
        ]);

        if (!appointment.rowCount) {
          const error = new Error('الحلاقة غير مكتملة أو غير متاحة أو خدمتها غير مسجلة');
          error.status = 400;
          throw error;
        }

        const a = appointment.rows[0];

        const existing = await client.query(`
          SELECT id
          FROM public.sales
          WHERE tenant_id = $1 AND appointment_id = $2
          LIMIT 1
        `, [req.user.tenantId, appointmentId]);

        if (existing.rowCount) {
          const error = new Error('تم إصدار فاتورة لهذه الحلاقة بالفعل');
          error.status = 409;
          throw error;
        }

        const subtotal = money(a.service_price);

        if (discount > subtotal) {
          const error = new Error('الخصم لا يمكن أن يتجاوز قيمة الخدمة');
          error.status = 400;
          throw error;
        }

        const total = money(subtotal - discount);

        const inserted = await client.query(`
          INSERT INTO public.sales (
            tenant_id,
            appointment_id,
            employee_id,
            created_by,
            customer_name,
            customer_phone,
            payment_method,
            subtotal,
            discount,
            total,
            status,
            notes
          )
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'completed',$11)
          RETURNING *
        `, [
          req.user.tenantId,
          appointmentId,
          a.employee_id,
          req.user.userId,
          a.customer_name,
          a.customer_phone,
          paymentMethod,
          subtotal,
          discount,
          total,
          notes
        ]);

        const savedSale = inserted.rows[0];

        await client.query(`
          INSERT INTO public.sale_items (
            tenant_id,
            sale_id,
            service_id,
            service_name,
            quantity,
            unit_price,
            line_total
          )
          VALUES ($1,$2,$3,$4,1,$5,$5)
        `, [
          req.user.tenantId,
          savedSale.id,
          a.service_id,
          a.service_name,
          subtotal
        ]);

        return {
          ...savedSale,
          service_name: a.service_name,
          employee_id: a.employee_id
        };
      },
      req.user.userId
    );

    res.status(201).json({ success: true, sale });
  } catch (error) {
    console.error('Create sale error:', error.message);
    res.status(error.status || 500).json({
      success: false,
      message: error.status ? error.message : 'تعذر تسجيل البيع'
    });
  }
});

module.exports = router;
