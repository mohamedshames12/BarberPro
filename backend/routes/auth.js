const express = require('express');
const rateLimit = require('express-rate-limit');
const pool = require('../config/db');
const { withTenantTransaction } = require('../config/tenant-db');
const { bcrypt, jwt, jwtSecret, tokenExpiresIn } = require('../config/security');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many attempts. Try again later.'
  }
});

router.post('/register', authLimiter, async (req, res) => {
  try {
    const {
      tenantName,
      tenantPhone,
      tenantEmail,
      tenantAddress,
      ownerName,
      ownerEmail,
      password
    } = req.body;

    const validEmail = (value) =>
      typeof value === 'string' &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

    if (
      typeof tenantName !== 'string' ||
      !tenantName.trim() ||
      typeof ownerName !== 'string' ||
      !ownerName.trim() ||
      !validEmail(ownerEmail) ||
      (tenantEmail && !validEmail(tenantEmail)) ||
      (tenantPhone && typeof tenantPhone !== 'string') ||
      (tenantAddress && typeof tenantAddress !== 'string') ||
      typeof password !== 'string' ||
      password.length < 8 ||
      password.length > 72
    ) {
      return res.status(400).json({
        success: false,
        message: 'Please provide valid registration data. Password must be 8 to 72 characters.'
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `SELECT * FROM public.register_tenant($1, $2, $3, $4, $5, $6, $7)`,
      [
        tenantName.trim(),
        tenantPhone || null,
        tenantEmail || null,
        tenantAddress || null,
        ownerName.trim(),
        ownerEmail.trim().toLowerCase(),
        passwordHash
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Registration successful',
      tenantCode: result.rows[0].new_tenant_code
    });
  } catch (error) {
    console.error('Registration error:', error.message);

    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: 'This email is already registered'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Registration failed'
    });
  }
});

router.post('/login', authLimiter, async (req, res) => {
  try {
    const { tenantCode, email, password } = req.body;

    if (
      typeof tenantCode !== 'string' ||
      typeof email !== 'string' ||
      typeof password !== 'string' ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: 'Tenant code, email and password are required'
      });
    }

    const result = await pool.query(
      `SELECT * FROM public.authenticate_user($1::uuid, $2)`,
      [tenantCode.trim(), email.trim().toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Invalid login credentials'
      });
    }

    const user = result.rows[0];
    const passwordMatches = await bcrypt.compare(
      password,
      user.stored_password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: 'Invalid login credentials'
      });
    }

    const token = jwt.sign(
      {
        userId: Number(user.authenticated_user_id),
        tenantId: Number(user.authenticated_tenant_id),
        role: user.authenticated_role
      },
      jwtSecret,
      {
        algorithm: 'HS256',
        expiresIn: tokenExpiresIn
      }
    );

    return res.json({
      success: true,
      message: 'Login successful',
      token
    });
  } catch (error) {
    console.error('Login error:', error.message);

    return res.status(500).json({
      success: false,
      message: 'Login failed'
    });
  }
});


const authenticateToken = require('../middleware/auth');

router.get('/me', authenticateToken, (req, res) => {
  return res.json({
    success: true,
    user: req.user
  });
});

module.exports = router;
