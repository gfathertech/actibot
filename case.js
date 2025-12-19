import os from 'os';
import util from 'util';
import { exec, spawn } from 'child_process';
import { pathToFileURL } from 'url';
import { promisify } from 'util';
import fs from 'fs/promises';
import { fileTypeFromBuffer } from 'file-type';
import { pluginHandler } from './core/handler.js';
import Database from './core/mongo.js';
import Func from './core/function.js';

const execAsync = promisify(exec);

// Load config
import config from './config.js';

export async function caseRoute({ conn, m }) {
  try {
    // Security checks
    if (m.isBot) return;
    
    const isOwner = m.fromMe || m.sender === config.OWNER_NUMBER + '@s.whatsapp.net';
    const isCreator = isOwner;

    // Handle built-in commands
    switch (m.command) {
      case 'menu':
      case 'help':
      case 'start':
        return await showMenu(conn, m);
        
      case 'ping':
        return await handlePing(conn, m);
        
      case 'stats':
        return await handleStats(conn, m);
        
      case 'owner':
        return await handleOwner(conn, m);
        
      case 'reload':
        if (!isCreator) return m.reply('❌ You are not authorized.');
        return await handleReload(conn, m);
        
      case 'delete':
        if (!isCreator) return m.reply('❌ You are not authorized.');
        return await handleDelete(conn, m);
        
      case 'install':
        if (!isCreator) return m.reply('❌ You are not authorized.');
        return await handleInstall(conn, m);
        
      case 'list':
        return await handleList(conn, m);
        
      case 'uptime':
        return await handleUptime(conn, m);
        
      case 'restart':
        if (!isCreator) return m.reply('❌ Only owner can restart.');
        return await handleRestart(conn, m);
        
      case 'eval':
      case '>':
        if (!isCreator) return m.reply('❌ Only owner can use eval.');
        return await handleEval(conn, m);
        
      case 'exec':
      case '$':
        if (!isCreator) return m.reply('❌ Only owner can use exec.');
        return await handleExec(conn, m);
        
      case 'tagme':
        return await conn.sendMessage(m.chat, {
          text: 'Here you are! 👋',
          mentions: [m.sender]
        }, { quoted: m });
        
      case 'vcard':
        return await handleVCard(conn, m);
        
      default:
        // Handle eval-like shortcuts
        if (m.body?.startsWith('=>') && isCreator) {
          return await handleArrowEval(conn, m);
        }
        break;
    }
  } catch (error) {
    Func.log(`Case error: ${error.message}`, 'error');
    if (m.fromMe) {
      m.reply(`Error: ${error.message}`);
    }
  }
}

async function showMenu(conn, m) {
  const plugins = Array.from(pluginHandler.plugins.values());
  const categories = {};
  
  // Group plugins by category
  for (const plugin of plugins) {
    const category = plugin.category || 'general';
    if (!categories[category]) categories[category] = [];
    
    const commands = Array.isArray(plugin.command) ? plugin.command : [plugin.command];
    categories[category].push(...commands.map(cmd => config.PREFIX + cmd));
  }
  
  let menuText = `🤖 *${config.BOT_NAME} Menu*\n\n`;
  
  for (const [category, commands] of Object.entries(categories)) {
    menuText += `*${category.toUpperCase()}*\n`;
    menuText += `┌ ${commands.slice(0, 5).join(', ')}\n`;
    if (commands.length > 5) {
      menuText += `└ ...and ${commands.length - 5} more commands\n`;
    }
    menuText += '\n';
  }
  
  menuText += `📍 *Total Commands:* ${pluginHandler.commands.size}\n`;
  menuText += `⚡ *Prefix:* ${config.PREFIX}\n`;
  menuText += `👑 *Owner:* ${config.OWNER_NAME}\n\n`;
  menuText += `_Type ${config.PREFIX}help <command> for details_`;
  
  // Try to send with image first, fallback to text
  try {
    const imagePath = config.IMAGE_PATH + 'menu.jpg';
    try {
      await fs.access(imagePath);
      await conn.sendMessage(m.chat, {
        image: { url: imagePath },
        caption: menuText
      }, { quoted: m });
    } catch {
      // No image, send with buttons
      await conn.sendMessage(m.chat, {
        text: menuText,
        buttons: [
          { buttonId: `${config.PREFIX}owner`, buttonText: { displayText: '👑 Owner' }, type: 1 },
          { buttonId: `${config.PREFIX}stats`, buttonText: { displayText: '📊 Stats' }, type: 1 },
          { buttonId: `${config.PREFIX}list`, buttonText: { displayText: '📋 List' }, type: 1 }
        ],
        footer: config.BOT_FOOTER,
        headerType: 1
      }, { quoted: m });
    }
  } catch (error) {
    // Fallback to simple text
    await m.reply(menuText);
  }
}

async function handlePing(conn, m) {
  const start = Date.now();
  await m.react('🏓');
  const latency = Date.now() - start;
  
  await m.reply(`*PONG!* 🏓\n` +
    `⚡ *Latency:* ${latency}ms\n` +
    `💻 *Server:* ${os.hostname()}\n` +
    `🕒 *Uptime:* ${Func.formatTime(process.uptime() * 1000)}`);
}

async function handleStats(conn, m) {
  const used = process.memoryUsage();
  const formatMB = (bytes) => (bytes / 1024 / 1024).toFixed(2) + ' MB';
  
  const statsText = 
    `📊 *${config.BOT_NAME} Stats*\n\n` +
    `💾 *Memory Usage:*\n` +
    `  • RSS: ${formatMB(used.rss)}\n` +
    `  • Heap: ${formatMB(used.heapUsed)}/${formatMB(used.heapTotal)}\n` +
    `  • External: ${formatMB(used.external)}\n\n` +
    `🖥️ *System:*\n` +
    `  • Platform: ${os.platform()} ${os.arch()}\n` +
    `  • CPU: ${os.cpus()[0].model}\n` +
    `  • Uptime: ${Func.formatTime(process.uptime() * 1000)}\n\n` +
    `🤖 *Bot:*\n` +
    `  • Plugins: ${pluginHandler.plugins.size}\n` +
    `  • Commands: ${pluginHandler.commands.size}\n` +
    `  • Mode: ${config.MONGODB_URI ? 'Database' : 'JSON'}`;
  
  await m.reply(statsText);
}

async function handleOwner(conn, m) {
  const ownerText = 
    `👑 *Bot Owner*\n\n` +
    `• *Name:* ${config.OWNER_NAME}\n` +
    `• *Number:* ${config.OWNER_NUMBER}\n` +
    `• *Bot Name:* ${config.BOT_NAME}\n\n` +
    `_Contact owner for any issues or queries_`;
  
  await m.reply(ownerText);
}

async function handleReload(conn, m) {
  if (!m.args[0]) {
    // Reload all plugins
    await pluginHandler.loadPlugins();
    return m.reply(`♻️ Reloaded all plugins\n• Total: ${pluginHandler.plugins.size} plugins\n• Commands: ${pluginHandler.commands.size}`);
  }
  
  const pluginName = m.args[0];
  const result = await pluginHandler.reloadPlugin(pluginName);
  
  if (result.success) {
    await m.reply(result.message);
  } else {
    await m.reply(`❌ Failed to reload ${pluginName}: ${result.message}`);
  }
}

async function handleDelete(conn, m) {
  if (!m.args[0]) return m.reply('⚠️ Specify the plugin name to delete.');
  
  try {
    const pluginName = m.args[0];
    const pluginPath = `./plugins/${pluginName}.js`;
    await fs.unlink(pluginPath);
    
    // Remove from handler
    pluginHandler.plugins.delete(pluginName);
    for (const [cmd, plugin] of pluginHandler.commands.entries()) {
      if (plugin.name === pluginName) {
        pluginHandler.commands.delete(cmd);
      }
    }
    
    await m.reply(`🗑️ Deleted plugin: ${pluginName}`);
  } catch (error) {
    await m.reply(`❌ Delete error: ${error.message}`);
  }
}

async function handleInstall(conn, m) {
  if (!m.text || !m.text.startsWith('https://')) {
    return m.reply('❗ Send a valid raw GitHub file URL\nExample: .install https://raw.githubusercontent.com/user/repo/main/plugin.js');
  }
  
  try {
    const response = await fetch(m.text);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const code = await response.text();
    const fileName = m.text.split('/').pop() || `plugin-${Date.now()}.js`;
    const filePath = `./plugins/${fileName}`;
    
    await fs.writeFile(filePath, code);
    
    // Load the new plugin
    await pluginHandler.loadPlugins();
    
    await m.reply(`✅ Installed: ${fileName}\nType ${config.PREFIX}reload if not working`);
  } catch (error) {
    await m.reply(`❌ Install error: ${error.message}`);
  }
}

async function handleList(conn, m) {
  const plugins = Array.from(pluginHandler.plugins.values());
  const categories = {};
  
  for (const plugin of plugins) {
    const category = plugin.category || 'general';
    if (!categories[category]) categories[category] = [];
    categories[category].push(plugin);
  }
  
  let listText = `📋 *Command List*\n\n`;
  
  for (const [category, plugins] of Object.entries(categories)) {
    listText += `*${category.toUpperCase()}*\n`;
    for (const plugin of plugins) {
      const commands = Array.isArray(plugin.command) ? plugin.command : [plugin.command];
      listText += `• ${commands.map(cmd => config.PREFIX + cmd).join(', ')}`;
      if (plugin.description) listText += ` - ${plugin.description}`;
      listText += '\n';
    }
    listText += '\n';
  }
  
  listText += `Total: ${pluginHandler.plugins.size} plugins, ${pluginHandler.commands.size} commands`;
  
  await m.reply(listText);
}

async function handleUptime(conn, m) {
  const uptime = process.uptime();
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  
  await m.reply(`⏱️ *Uptime*\n${hours}h ${minutes}m ${seconds}s`);
}

async function handleRestart(conn, m) {
  await m.reply('🔄 Restarting bot...');
  
  spawn(process.argv[0], process.argv.slice(1), {
    stdio: 'inherit',
    shell: true
  });
  
  process.exit(0);
}

async function handleEval(conn, m) {
  try {
    const code = m.body.slice(m.command.length + 1).trim();
    let evaled = await eval(`(async () => { ${code} })()`);
    
    if (typeof evaled !== 'string') {
      evaled = util.inspect(evaled, { depth: 1 });
    }
    
    await m.reply(`📤 *Eval Result*\n\`\`\`javascript\n${evaled}\n\`\`\``);
  } catch (error) {
    await m.reply(`❌ *Eval Error*\n\`\`\`${error.message}\`\`\``);
  }
}

async function handleExec(conn, m) {
  try {
    const command = m.body.slice(m.command.length + 1).trim();
    const { stdout, stderr } = await execAsync(command, { timeout: 30000 });
    
    let result = '';
    if (stdout) result += `*STDOUT:*\n${stdout}\n`;
    if (stderr) result += `*STDERR:*\n${stderr}\n`;
    
    if (!result) result = 'Command executed (no output)';
    
    await m.reply(`💻 *Exec Result*\n\`\`\`${result}\`\`\``);
  } catch (error) {
    await m.reply(`❌ *Exec Error*\n\`\`\`${error.message}\`\`\``);
  }
}

async function handleVCard(conn, m) {
  const vcard = `
BEGIN:VCARD
VERSION:3.0
FN:${config.OWNER_NAME}
ORG:${config.BOT_NAME};
TEL;type=CELL;type=VOICE;waid=${config.OWNER_NUMBER}:+${config.OWNER_NUMBER}
END:VCARD`.trim();
  
  await conn.sendMessage(m.chat, {
    contacts: {
      displayName: config.OWNER_NAME,
      contacts: [{ vcard }]
    }
  }, { quoted: m });
}

async function handleArrowEval(conn, m) {
  try {
    const code = m.body.slice(3).trim();
    let evaled = await eval(`(async () => { ${code} })()`);
    
    if (typeof evaled !== 'string') {
      evaled = util.inspect(evaled, { depth: 1 });
    }
    
    await m.reply(`📤 *Eval*\n\`\`\`${evaled}\`\`\``);
  } catch (error) {
    await m.reply(`❌ *Error*\n\`\`\`${error.message}\`\`\``);
  }
}

export default caseRoute;