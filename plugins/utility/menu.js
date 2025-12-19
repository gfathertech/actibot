export default {
  name: "menu",
  category: "utility",
  command: ["menu"],
  run: async (conn, m) => {
  
    let plugins = Object.values(conn.plugins);
    
    let grouped = {};
    for (let plugin of plugins) {
      if (!grouped[plugin.category]) grouped[plugin.category] = [];
      grouped[plugin.category].push(plugin);
    }
    
    let menu = "";
    for (let [category, items] of Object.entries(grouped)) {
      menu += `# ${category.toUpperCase()}\n`;
      for (let item of items) {
        menu += `> ${m.prefix}${item.name}\n`; 
      }
      menu += "\n";
    }
    
    m.reply(menu);
  }
}