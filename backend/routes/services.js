const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/auth');
const { withTenantTransaction } = require('../config/tenant-db');

router.use(authenticateToken);

const canManage = role => ['owner', 'manager'].includes(role);

// GET /api/services
router.get('/', async (req, res) => {
    try {
        const result = await withTenantTransaction(
            req.user.tenantId,
            client => client.query(
                `SELECT id, name, description, price, duration_minutes,
                        is_active, created_at, updated_at
                 FROM public.services
                 WHERE tenant_id = $1
                   AND ($2 IN ('owner', 'manager') OR is_active = TRUE)
                 ORDER BY created_at DESC`,
                [req.user.tenantId, req.user.role]
            ),
            req.user.userId
        );

        res.json({ success: true, services: result.rows });
    } catch (error) {
        console.error('Get services error:', error);
        res.status(500).json({ success: false, message: 'تعذر تحميل الخدمات' });
    }
});

// POST /api/services
router.post('/', async (req, res) => {
    if (!canManage(req.user.role)) {
        return res.status(403).json({ success: false, message: 'غير مصرح لك' });
    }

    const { name, description = '', price, durationMinutes = 30 } = req.body;
    const servicePrice = Number(price);
    const duration = Number(durationMinutes);

    if (
        typeof name !== 'string' || !name.trim() ||
        !Number.isFinite(servicePrice) || servicePrice < 0 ||
        !Number.isSafeInteger(duration) || duration <= 0
    ) {
        return res.status(400).json({ success: false, message: 'راجع اسم الخدمة والسعر والمدة' });
    }

    try {
        const result = await withTenantTransaction(
            req.user.tenantId,
            client => client.query(
                `INSERT INTO public.services
                    (tenant_id, name, description, price, duration_minutes)
                 VALUES ($1, $2, $3, $4, $5)
                 RETURNING id, name, description, price, duration_minutes, is_active`,
                [req.user.tenantId, name.trim(), String(description).trim(), servicePrice, duration]
            ),
            req.user.userId
        );

        res.status(201).json({ success: true, service: result.rows[0] });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ success: false, message: 'اسم الخدمة موجود بالفعل' });
        }
        console.error('Create service error:', error);
        res.status(500).json({ success: false, message: 'تعذر إضافة الخدمة' });
    }
});

// PATCH /api/services/:id
router.patch('/:id', async (req, res) => {
    if (!canManage(req.user.role)) {
        return res.status(403).json({ success: false, message: 'غير مصرح لك' });
    }

    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
        return res.status(400).json({ success: false, message: 'رقم الخدمة غير صحيح' });
    }

    const { name, description, price, durationMinutes, isActive } = req.body;

    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
        return res.status(400).json({ success: false, message: 'اسم الخدمة غير صحيح' });
    }
    if (price !== undefined && (!Number.isFinite(Number(price)) || Number(price) < 0)) {
        return res.status(400).json({ success: false, message: 'السعر غير صحيح' });
    }
    if (durationMinutes !== undefined && (!Number.isSafeInteger(Number(durationMinutes)) || Number(durationMinutes) <= 0)) {
        return res.status(400).json({ success: false, message: 'مدة الخدمة غير صحيحة' });
    }
    if (isActive !== undefined && typeof isActive !== 'boolean') {
        return res.status(400).json({ success: false, message: 'حالة الخدمة غير صحيحة' });
    }

    try {
        const result = await withTenantTransaction(
            req.user.tenantId,
            client => client.query(
                `UPDATE public.services
                 SET name = COALESCE($3, name),
                     description = COALESCE($4, description),
                     price = COALESCE($5, price),
                     duration_minutes = COALESCE($6, duration_minutes),
                     is_active = COALESCE($7, is_active),
                     updated_at = NOW()
                 WHERE tenant_id = $1 AND id = $2
                 RETURNING id, name, description, price, duration_minutes, is_active`,
                [
                    req.user.tenantId,
                    id,
                    name === undefined ? null : name.trim(),
                    description === undefined ? null : String(description).trim(),
                    price === undefined ? null : Number(price),
                    durationMinutes === undefined ? null : Number(durationMinutes),
                    isActive === undefined ? null : isActive
                ]
            ),
            req.user.userId
        );

        if (!result.rowCount) {
            return res.status(404).json({ success: false, message: 'الخدمة غير موجودة' });
        }

        res.json({ success: true, service: result.rows[0] });
    } catch (error) {
        if (error.code === '23505') {
            return res.status(409).json({ success: false, message: 'اسم الخدمة موجود بالفعل' });
        }
        console.error('Update service error:', error);
        res.status(500).json({ success: false, message: 'تعذر تعديل الخدمة' });
    }
});

module.exports = router;
