const express = require('express');
const router = express.Router();

const authenticateToken = require('../middleware/auth');
const { withTenantTransaction } = require('../config/tenant-db');
const { bcrypt } = require('../config/security');

router.use(authenticateToken);

function canManageEmployees(role) {
  return ['owner', 'manager'].includes(role);
}

// عرض قائمة الموظفين
router.get('/', async (req, res) => {
  if (!canManageEmployees(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'You are not allowed to view employees'
    });
  }

  try {
    const result = await withTenantTransaction(
      req.user.tenantId,
      async (client) => {
        return client.query(
          `SELECT id, full_name, email, role, status, created_at
           FROM public.users
           WHERE tenant_id = $1
             AND role = 'employee'
           ORDER BY created_at DESC
           LIMIT 500`,
          [req.user.tenantId]
        );
      }
    );

    return res.json({
      success: true,
      employees: result.rows.map((employee) => ({
        id: Number(employee.id),
        fullName: employee.full_name,
        email: employee.email,
        role: employee.role,
        status: employee.status,
        createdAt: employee.created_at
      }))
    });
  } catch (error) {
    console.error('Employees list error:', error.message);

    return res.status(500).json({
      success: false,
      message: 'Unable to load employees'
    });
  }
});

// إضافة موظف جديد
router.post('/', async (req, res) => {
  if (!canManageEmployees(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'You are not allowed to create employees'
    });
  }

  const fullName =
    typeof req.body?.fullName === 'string'
      ? req.body.fullName.trim()
      : '';

  const email =
    typeof req.body?.email === 'string'
      ? req.body.email.trim().toLowerCase()
      : '';

  const password = req.body?.password;

  if (
    fullName.length < 2 ||
    fullName.length > 150 ||
    email.length > 255 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    typeof password !== 'string' ||
    password.length < 8 ||
    Buffer.byteLength(password, 'utf8') > 72
  ) {
    return res.status(400).json({
      success: false,
      message: 'Invalid employee data'
    });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await withTenantTransaction(
      req.user.tenantId,
      async (client) => {
        return client.query(
          `SELECT public.create_tenant_employee(
            $1, $2, $3, $4, $5
          ) AS user_id`,
          [
            req.user.tenantId,
            req.user.userId,
            fullName,
            email,
            passwordHash
          ]
        );
      },
      req.user.userId
    );

    return res.status(201).json({
      success: true,
      message: 'Employee created successfully',
      employee: {
        id: Number(result.rows[0].user_id),
        fullName,
        email,
        role: 'employee',
        status: 'active'
      }
    });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'This email is already registered for this shop'
      });
    }

    console.error('Employee creation error:', error.message);

    return res.status(500).json({
      success: false,
      message: 'Unable to create employee'
    });
  }
});

// تفعيل أو تعطيل موظف
router.patch('/:id/status', async (req, res) => {
  if (!canManageEmployees(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: 'You are not allowed to manage employees'
    });
  }

  const employeeId = Number(req.params.id);
  const status = req.body?.status;

  if (
    !Number.isSafeInteger(employeeId) ||
    employeeId <= 0 ||
    !['active', 'disabled'].includes(status)
  ) {
    return res.status(400).json({
      success: false,
      message: 'Invalid employee ID or status'
    });
  }

  try {
    const result = await withTenantTransaction(
      req.user.tenantId,
      async (client) => {
        return client.query(
          `UPDATE public.users
           SET status = $1, updated_at = NOW()
           WHERE id = $2
             AND tenant_id = $3
             AND role = 'employee'
           RETURNING id, full_name, email, role, status`,
          [status, employeeId, req.user.tenantId]
        );
      }
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    const employee = result.rows[0];

    return res.json({
      success: true,
      message: 'Employee status updated successfully',
      employee: {
        id: Number(employee.id),
        fullName: employee.full_name,
        email: employee.email,
        role: employee.role,
        status: employee.status
      }
    });
  } catch (error) {
    console.error('Employee status update error:', error.message);

    return res.status(500).json({
      success: false,
      message: 'Unable to update employee status'
    });
  }
});

module.exports = router;
