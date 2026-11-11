const pool = require('./db');

async function withTenantTransaction(tenantId, callback, actorId = null) {
  if (!Number.isSafeInteger(tenantId) || tenantId <= 0) {
    throw new Error('Invalid tenant ID');
  }

  if (
    actorId !== null &&
    (!Number.isSafeInteger(actorId) || actorId <= 0)
  ) {
    throw new Error('Invalid actor ID');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      "SELECT set_config('app.tenant_id', $1, true)",
      [String(tenantId)]
    );

    await client.query(
      "SELECT set_config('app.actor_id', $1, true)",
      [actorId === null ? '' : String(actorId)]
    );

    const result = await callback(client);

    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { withTenantTransaction };
