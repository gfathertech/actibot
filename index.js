import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let restartCount = 0;
const maxRestarts = 10;

function startBot() {
  console.log(`🤖 Launching WhatsApp Bot... (Restart count: ${restartCount})`);
  
  const mainFile = path.join(__dirname, 'main.js');
  const args = [mainFile, ...process.argv.slice(2)];

  const worker = spawn(process.argv[0], args, {
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    env: { ...process.env, NODE_ENV: 'production' }
  });

  worker.on('message', (msg) => {
    if (msg === 'reset') {
      console.log('🔄 Received restart signal...');
      restartCount++;
      if (restartCount <= maxRestarts) {
        worker.kill();
        setTimeout(startBot, 2000);
      } else {
        console.error('❌ Maximum restart limit reached. Stopping bot.');
        process.exit(1);
      }
    }
  });

  worker.on('exit', (code, signal) => {
    console.log(`🔴 Bot process exited with code: ${code}, signal: ${signal}`);
    
    if (code === 0) {
      console.log('✅ Bot stopped gracefully.');
      process.exit(0);
    } else if (code === 1 || code === null) {
      restartCount++;
      if (restartCount <= maxRestarts) {
        console.log(`🔄 Auto-restarting... (${restartCount}/${maxRestarts})`);
        setTimeout(startBot, 5000);
      } else {
        console.error('❌ Maximum restart limit reached. Please check for errors.');
        process.exit(1);
      }
    } else {
      console.error(`❌ Fatal error. Exit code: ${code}`);
      process.exit(code);
    }
  });

  worker.on('error', (error) => {
    console.error('❌ Failed to start bot process:', error);
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT. Shutting down gracefully...');
    worker.kill('SIGINT');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM. Shutting down gracefully...');
    worker.kill('SIGTERM');
    process.exit(0);
  });
}

// Start the bot
startBot();