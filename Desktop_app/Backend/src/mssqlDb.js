import sql from 'mssql';

let pool;

const config = {
  server: process.env.MSSQL_SERVER || 'localhost',
  port: Number(process.env.MSSQL_PORT) || 1433,
  database: process.env.MSSQL_DATABASE || 'starmans',
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  options: {
    encrypt: process.env.MSSQL_ENCRYPT !== 'false',
    trustServerCertificate: process.env.MSSQL_TRUST_SERVER_CERTIFICATE !== 'false',
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

export async function connectMSSQL() {
  pool = await sql.connect(config);
  // Deliberately omit user/password from this log line — see DECISIONS.md
  // ("Bundled fix") for why the old MongoDB connect log leaked credentials.
  console.log(`MSSQL connected → ${config.server}:${config.port}/${config.database}`);
  return pool;
}

export function getPool() {
  if (!pool) throw new Error('MSSQL not connected yet. Call connectMSSQL() first.');
  return pool;
}

export { sql };
