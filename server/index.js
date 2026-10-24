import './config.js'; // must be first: sets TZ=Asia/Jakarta
import { createApp } from './app.js';
import { nowWib } from './lib/time.js';

const { app, db, cfg } = createApp();

const server = app.listen(cfg.port, cfg.host, () => {
  console.log(`[${nowWib()} WIB] Pasar Keripik server on http://localhost:${cfg.port} (db: ${cfg.dbFile})`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
