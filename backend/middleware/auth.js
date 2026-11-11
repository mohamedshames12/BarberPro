const { jwt, jwtSecret } = require('../config/security');
const { withTenantTransaction } = require('../config/tenant-db');

const allowedRoles = ['owner', 'manager', 'employee'];

async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  const token = authHeader.slice(7).trim();

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }

  let payload;

  try {
    payload = jwt.verify(token, jwtSecret, {
      algorithms: ['HS256']
    });
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }

  if (
    !Number.isSafeInteger(payload.userId) ||
    payload.userId <= 0 ||
    !Number.isSafeInteger(payload.tenantId) ||
    payload.tenantId <= 0 ||
    !allowedRoles.includes(payload.role)
  ) {
    return res.status(401).json({
      success: false,
      message: 'Invalid token payload'
    });
  }

  try {
    const user = await withTenantTransaction(
      payload.tenantId,
      async (client) => {
        const result = await client.query(
          `SELECT
             u.id,
             u.tenant_id,
             u.full_name,
             u.email,
             u.role,
             t.name AS tenant_name
           FROM public.users u
           INNER JOIN public.tenants t
             ON t.id = u.tenant_id
           WHERE u.id = $1
             AND u.tenant_id = $2
             AND u.status = 'active'
             AND t.status = 'active'
           LIMIT 1`,
          [payload.userId, payload.tenantId]
        );

        return result.rows[0] || null;
      }
    );

    if (!user || user.role !== payload.role) {
      return res.status(401).json({
        success: false,
        message: 'Account is inactive or access is no longer valid'
      });
    }

    req.user = {
      userId: Number(user.id),
      tenantId: Number(user.tenant_id),
      role: user.role,
      fullName: user.full_name,
      email: user.email,
      tenantName: user.tenant_name
    };

    return next();
  } catch (error) {
    console.error('Authentication database error:', error.message);

    return res.status(503).json({
      success: false,
      message: 'Unable to verify account right now'
    });
  }
}

module.exports = authenticateToken;
