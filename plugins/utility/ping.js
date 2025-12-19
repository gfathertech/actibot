import { performance } from "perf_hooks";

export default {
  name: "ping",
  category: "utility",
  command: ["ping"],
  run: async (conn, m) => {
    const start = performance.now();
    m.reply(`Pong! ${(performance.now() - start).toFixed(2)} ms`);
  }
}