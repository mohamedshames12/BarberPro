const express = require('express');
const router = express.Router();

const authenticateToken = require('../middleware/auth');
const { withTenantTransaction } = require('../config/tenant-db');

router.use(authenticateToken);

function cleanText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function validEmail(value) {
    return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

router.get('/stats', async (req, res) => {
    try {
        const result = await withTenantTransaction(
            req.user.tenantId,
            (client) => client.query(
                `SELECT COUNT(*)::INTEGER AS total_customers
                 FROM public.customers`
            )
        );

        return res.json({
            success: true,
            totalCustomers: result.rows[0].total_customers
        });
    } catch (error) {
        console.error('Customers stats error:', error);
        return res.status(503).json({
            success: false,
            message: 'تعذر تحميل إحصائيات العملاء'
        });
    }
});

router.get('/', async (req, res) => {
    try {
        const result = await withTenantTransaction(
            req.user.tenantId,
            (client) => client.query(
                `SELECT id, full_name, phone, email, birth_date,
                        notes, created_at, updated_at
                 FROM public.customers
                 ORDER BY created_at DESC
                 LIMIT 500`
            )
        );

        return res.json({
            success: true,
            customers: result.rows
        });
    } catch (error) {
        console.error('Customers list error:', error);
        return res.status(503).json({
            success: false,
            message: 'تعذر تحميل قائمة العملاء'
        });
    }
});

router.post('/', async (req, res) => {
    const fullName = cleanText(req.body?.fullName);
    const phone = cleanText(req.body?.phone) || null;
    const email = cleanText(req.body?.email) || null;
    const birthDate = cleanText(req.body?.birthDate) || null;
    const notes = cleanText(req.body?.notes) || null;

    if (!fullName || fullName.length > 150) {
        return res.status(400).json({
            success: false,
            message: 'اسم العميل مطلوب وبحد أقصى 150 حرفًا'
        });
    }

    if (phone && phone.length > 30) {
        return res.status(400).json({
            success: false,
            message: 'رقم الهاتف طويل جدًا'
        });
    }

    if (email && (email.length > 255 || !validEmail(email))) {
        return res.status(400).json({
            success: false,
            message: 'البريد الإلكتروني غير صحيح'
        });
    }

    if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
        return res.status(400).json({
            success: false,
            message: 'تاريخ الميلاد غير صحيح'
        });
    }

    if (!['owner', 'manager', 'employee'].includes(req.user.role)) {
        return res.status(403).json({
            success: false,
            message: 'ليس لديك صلاحية إضافة العملاء'
        });
    }

    try {
        const result = await withTenantTransaction(
            req.user.tenantId,
            (client) => client.query(
                `INSERT INTO public.customers
                    (tenant_id, full_name, phone, email, birth_date, notes)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING id, full_name, phone, email, birth_date,
                           notes, created_at, updated_at`,
                [
                    req.user.tenantId,
                    fullName,
                    phone,
                    email,
                    birthDate,
                    notes
                ]
            )
        );

        return res.status(201).json({
            success: true,
            message: 'تمت إضافة العميل بنجاح',
            customer: result.rows[0]
        });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({
                success: false,
                message: 'رقم الهاتف مسجل بالفعل لدى هذا الصالون'
            });
        }

        if (error.code === '22007' || error.code === '22008') {
            return res.status(400).json({
                success: false,
                message: 'تاريخ الميلاد غير صحيح'
            });
        }

        console.error('Add customer error:', error);
        return res.status(503).json({
            success: false,
            message: 'تعذرت إضافة العميل حاليًا'
        });
    }
});


// Update customer: owner and manager only
router.put('/:id', async (req, res) => {
    if (!['owner', 'manager'].includes(req.user.role)) {
        return res.status(403).json({
            success: false,
            message: 'ليس لديك صلاحية تعديل بيانات العملاء'
        });
    }

    const customerId = Number(req.params.id);
    if (!Number.isSafeInteger(customerId) || customerId <= 0) {
        return res.status(400).json({
            success: false,
            message: 'رقم العميل غير صحيح'
        });
    }

    const fullName = cleanText(req.body?.fullName);
    const phone = cleanText(req.body?.phone) || null;
    const email = cleanText(req.body?.email) || null;
    const birthDate = cleanText(req.body?.birthDate) || null;
    const notes = cleanText(req.body?.notes) || null;

    if (!fullName || fullName.length > 150) {
        return res.status(400).json({
            success: false,
            message: 'اسم العميل مطلوب وبحد أقصى 150 حرفًا'
        });
    }

    if (phone && phone.length > 30) {
        return res.status(400).json({
            success: false,
            message: 'رقم الهاتف طويل جدًا'
        });
    }

    if (email && (email.length > 255 || !validEmail(email))) {
        return res.status(400).json({
            success: false,
            message: 'البريد الإلكتروني غير صحيح'
        });
    }

    if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
        return res.status(400).json({
            success: false,
            message: 'تاريخ الميلاد غير صحيح'
        });
    }

    try {
        const result = await withTenantTransaction(
            req.user.tenantId,
            (client) => client.query(
                `UPDATE public.customers
                 SET full_name = $1,
                     phone = $2,
                     email = $3,
                     birth_date = $4,
                     notes = $5,
                     updated_at = NOW()
                 WHERE id = $6
                 RETURNING id, full_name, phone, email, birth_date,
                           notes, created_at, updated_at`,
                [fullName, phone, email, birthDate, notes, customerId]
            )
        );

        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'العميل غير موجود'
            });
        }

        return res.json({
            success: true,
            message: 'تم تعديل بيانات العميل بنجاح',
            customer: result.rows[0]
        });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({
                success: false,
                message: 'رقم الهاتف مسجل بالفعل لدى هذا الصالون'
            });
        }

        if (error.code === '22007' || error.code === '22008') {
            return res.status(400).json({
                success: false,
                message: 'تاريخ الميلاد غير صحيح'
            });
        }

        console.error('Update customer error:', error);
        return res.status(503).json({
            success: false,
            message: 'تعذر تعديل بيانات العميل حاليًا'
        });
    }
});


// Delete customer: owner and manager only
router.delete('/:id', async (req, res) => {
    if (!['owner', 'manager'].includes(req.user.role)) {
        return res.status(403).json({
            success: false,
            message: 'ليس لديك صلاحية حذف العملاء'
        });
    }

    const customerId = Number(req.params.id);
    if (!Number.isSafeInteger(customerId) || customerId <= 0) {
        return res.status(400).json({
            success: false,
            message: 'رقم العميل غير صحيح'
        });
    }

    try {
        const result = await withTenantTransaction(
            req.user.tenantId,
            (client) => client.query(
                `DELETE FROM public.customers
                 WHERE id = $1
                 RETURNING id`,
                [customerId]
            )
        );

        if (result.rowCount === 0) {
            return res.status(404).json({
                success: false,
                message: 'العميل غير موجود'
            });
        }

        return res.json({
            success: true,
            message: 'تم حذف العميل بنجاح'
        });
    } catch (error) {
        console.error('Delete customer error:', error);
        return res.status(503).json({
            success: false,
            message: 'تعذر حذف العميل حاليًا'
        });
    }
});

module.exports = router;
