const express = require('express');
const router = express.Router();

const authenticateToken = require('../middleware/auth');
const { withTenantTransaction } = require('../config/tenant-db');

router.use(authenticateToken);

function canManage(role) {
    return ['owner', 'manager'].includes(role);
}

// عرض الحجوزات
router.get('/', async (req, res) => {
    try {
        const result = await withTenantTransaction(
            req.user.tenantId,
            async client => client.query(
                `SELECT id, customer_name, customer_phone, service_name,
                        employee_id, appointment_date, appointment_time,
                        notes, status, created_at
                 FROM public.appointments
                 WHERE tenant_id = $1
                   AND ($2 IN ('owner', 'manager') OR employee_id = $3)
                   AND NOT EXISTS (
                       SELECT 1
                       FROM public.sales s
                       WHERE s.tenant_id = public.appointments.tenant_id
                         AND s.appointment_id = public.appointments.id
                   )
                 ORDER BY appointment_date DESC, appointment_time DESC
                 LIMIT 500`,
                [req.user.tenantId, req.user.role, req.user.userId]
            )
        );

        return res.json({ success: true, appointments: result.rows });
    } catch (error) {
        console.error('Appointments list error:', error);
        return res.status(500).json({ success: false, message: 'تعذر تحميل الحجوزات' });
    }
});

// إضافة حجز
router.post('/', async (req, res) => {
    if (!canManage(req.user.role)) {
        return res.status(403).json({ success: false, message: 'غير مسموح' });
    }

    const {
        customerName, customerPhone, serviceName,
        employeeId, appointmentDate, appointmentTime, notes
    } = req.body;

    if (
        !customerName?.trim() ||
        !customerPhone?.trim() ||
        !serviceName?.trim() ||
        !/^\d{4}-\d{2}-\d{2}$/.test(appointmentDate || '') ||
        !/^\d{2}:\d{2}$/.test(appointmentTime || '')
    ) {
        return res.status(400).json({ success: false, message: 'يرجى إدخال بيانات الحجز بشكل صحيح' });
    }

    try {
        const result = await withTenantTransaction(
            req.user.tenantId,
            async client => {
                if (employeeId) {
                    const employee = await client.query(
                        `SELECT id FROM public.users
                         WHERE id = $1 AND tenant_id = $2
                           AND role = 'employee' AND status = 'active'`,
                        [employeeId, req.user.tenantId]
                    );

                    if (!employee.rowCount) {
                        const error = new Error('الموظف غير موجود أو غير نشط');
                        error.status = 400;
                        throw error;
                    }
                }

                const inserted = await client.query(
                    `INSERT INTO public.appointments
                     (tenant_id, customer_name, customer_phone, service_name,
                      employee_id, appointment_date, appointment_time, notes)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                     RETURNING *`,
                    [
                        req.user.tenantId,
                        customerName.trim(),
                        customerPhone.trim(),
                        serviceName.trim(),
                        employeeId || null,
                        appointmentDate,
                        appointmentTime,
                        notes?.trim() || null
                    ]
                );

                return inserted.rows[0];
            },
            req.user.userId
        );

        return res.status(201).json({ success: true, appointment: result });
    } catch (error) {
        console.error('Appointment creation error:', error);
        return res.status(error.status || 500).json({
            success: false,
            message: error.status ? error.message : 'تعذر حفظ الحجز'
        });
    }
});

// تحديث حالة الحجز
router.patch('/:id/status', async (req, res) => {
    const id = Number(req.params.id);
    const { status } = req.body;
    const allowed = ['pending', 'confirmed', 'completed', 'cancelled'];

    if (!Number.isSafeInteger(id) || id <= 0 || !allowed.includes(status)) {
        return res.status(400).json({ success: false, message: 'بيانات غير صحيحة' });
    }

    try {
        const result = await withTenantTransaction(
            req.user.tenantId,
            async client => client.query(
                `UPDATE public.appointments
                 SET status = $1, updated_at = NOW()
                 WHERE id = $2 AND tenant_id = $3
                   AND ($4 IN ('owner', 'manager') OR employee_id = $5)
                 RETURNING id, status`,
                [status, id, req.user.tenantId, req.user.role, req.user.userId]
            ),
            req.user.userId
        );

        if (!result.rowCount) {
            return res.status(404).json({ success: false, message: 'الحجز غير موجود أو غير مسموح' });
        }

        return res.json({ success: true, appointment: result.rows[0] });
    } catch (error) {
        console.error('Appointment status error:', error);
        return res.status(500).json({ success: false, message: 'تعذر تحديث الحجز' });
    }
});

module.exports = router;
