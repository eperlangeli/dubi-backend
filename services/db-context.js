const { AsyncLocalStorage } = require('async_hooks');
const jwt = require('jsonwebtoken');

const storage = new AsyncLocalStorage();

const createScopedPool = (pool) => ({
  query: (...args) => {
    const context = storage.getStore();
    return (context?.client || pool).query(...args);
  },
  connect: (...args) => pool.connect(...args),
  end: (...args) => pool.end(...args),
  on: (...args) => pool.on(...args)
});

const getBearerToken = (req) => {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');
  return scheme?.toLowerCase() === 'bearer' ? token : null;
};

const withAuthenticatedDbContext = (pool) => async (req, res, next) => {
  const token = getBearerToken(req);
  if (!token) return next();

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return next();
  }

  const userId = decoded.userId;
  if (!userId) return next();

  let client;
  let finalized = false;

  const finalize = async () => {
    if (finalized) return;
    finalized = true;

    try {
      if (res.statusCode >= 500) await client.query('ROLLBACK');
      else await client.query('COMMIT');
    } catch (error) {
      console.error('Failed to finalize request DB context:', error.message);
    } finally {
      client.release();
    }
  };

  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [String(userId)]);
    req.userId = userId;

    storage.run({ client, userId }, () => {
      res.once('finish', finalize);
      res.once('close', finalize);
      next();
    });
  } catch (error) {
    try {
      if (client) await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Failed to rollback request DB context:', rollbackError.message);
    } finally {
      if (client) client.release();
    }
    next(error);
  }
};

const withSharedWriteContext = async (pool, callback) => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.allow_shared_write', 'true', true)");
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  createScopedPool,
  withAuthenticatedDbContext,
  withSharedWriteContext
};
