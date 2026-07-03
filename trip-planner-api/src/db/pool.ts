import { Pool } from 'pg';
import 'dotenv/config';

// Pool único compartido por toda la app. No abrir conexiones nuevas
// en cada request: siempre importar `pool` desde acá.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL', err);
});
