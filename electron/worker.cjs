// Background Worker Script (Utility Process)
// Background memory manager for performance optimization
const { parentPort } = require('electron');

console.log('[WORKER] Background utility process is running...');

if (parentPort) {
  parentPort.on('close', () => {
    process.exit(0);
  });
}

const workerInterval = setInterval(() => {
  // Lakukan pembersihan atau task berat di sini saat aplikasi aktif
}, 60000);

process.on('SIGTERM', () => {
  clearInterval(workerInterval);
  process.exit(0);
});

process.on('SIGINT', () => {
  clearInterval(workerInterval);
  process.exit(0);
});
