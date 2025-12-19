import os from "os";
import { performance } from "perf_hooks";

export default {
  name: "os",
  category: "utility",
  command: ["os"],
  run: async (conn, m) => {
    const start = performance.now();
    const end = performance.now();
    const latency = (end - start).toFixed(2);
    const rtt = Date.now() - start;
    const uptime = process.uptime();
    const mem = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    const toHMS = (sec) => {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = Math.floor(sec % 60);
      return [h, m, s].map(v => v.toString().padStart(2, "0")).join(":");
    };

    await m.reply(`
• *Latency* : ${latency} ms
• *RTT*     : ${rtt} ms
• *Uptime*  : ${toHMS(uptime)}

💻 *Memory*
• RSS   : ${(mem.rss / 1024 / 1024).toFixed(2)} MB
• Heap  : ${(mem.heapUsed / 1024 / 1024).toFixed(2)} / ${(mem.heapTotal / 1024 / 1024).toFixed(2)} MB
• Free  : ${(freeMem / 1024 / 1024).toFixed(2)} MB
• Total : ${(totalMem / 1024 / 1024).toFixed(2)} MB

⚙️ *Platform*
• Host  : ${os.hostname()}
• CPU   : ${os.cpus()[0].model} (${os.cpus().length} cores)
• Arch  : ${os.arch()}`
    );
  }
};