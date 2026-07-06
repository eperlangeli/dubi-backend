const { AsyncLocalStorage } = require('async_hooks');
const jwt = require('jsonwebtoken');

const storage = new AsyncLocalStorage();
const DB_CONTEXT_IDLE_TIMEOUT_MS = Math.max(
  1000,
  Number(process.env.DB_CONTEXT_IDLE_TIMEOUT_MS || 60000)
);

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
  let ended = false;

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
    await client.query(
      "SELECT set_config('idle_in_transaction_session_timeout', $1, true)",
      [String(DB_CONTEXT_IDLE_TIMEOUT_MS)]
    );
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [String(userId)]);
    req.userId = userId;

    const originalEnd = res.end.bind(res);
    res.end = (...args) => {
      if (ended) return res;
      ended = true;

      finalize()
        .catch((error) => {
          console.error('Failed to finalize request DB context before response end:', error.message);
        })
        .finally(() => {
          originalEnd(...args);
        });

      return res;
    };

    storage.run({ client, userId }, () => {
      res.once('close', finalize);
      next();
    });
  } catch (error) {
    if (client && !finalized) {
      finalized = true;
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        console.error('Failed to rollback request DB context:', rollbackError.message);
      } finally {
        client.release();
      }
    }
    next(error);
  }
};

const checkNotSuspended = (pool) => async (req, res, next) => {
  if (!req.userId) return next();

  try {
    const { rows } = await pool.query(
      'SELECT is_suspended FROM users WHERE id = $1',
      [req.userId]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    if (rows[0].is_suspended) {
      return res.status(403).json({
        error: 'Account sospeso. Contatta support@dubi.health'
      });
    }

    return next();
  } catch (error) {
    return next(error);
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
  checkNotSuspended,
  withSharedWriteContext
};
