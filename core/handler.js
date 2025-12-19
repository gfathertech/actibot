import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import Database from './mongo.js';
import Func from './function.js';
import { caseRoute } from '../case.js';

// Load config
const configPath = join(process.cwd(), 'config.js');
import config from '../config.js';

// Plugin loader
class PluginHandler {
  constructor() {
    this.plugins = new Map();
    this.commands = new Map();
  }

  async loadPlugins() {
    const pluginsDir = join(process.cwd(), 'plugins');
    const { readdir, stat } = await import('fs/promises');
    
    try {
      const files = await readdir(pluginsDir);
      
      for (const file of files) {
        if (file.endsWith('.js')) {
          try {
            const pluginPath = join(pluginsDir, file);
            const fileStat = await stat(pluginPath);
            if (!fileStat.isFile()) continue;

            // Clear cache for hot reload
            const cacheKey = require.resolve(pluginPath);
            if (require.cache[cacheKey]) delete require.cache[cacheKey];

            // Dynamic import with cache busting
            const pluginModule = await import(`../plugins/${file}?update=${Date.now()}`);
            const plugin = pluginModule.default;
            
            if (plugin && plugin.name && plugin.command) {
              this.plugins.set(plugin.name, plugin);
              
              // Register all command aliases
              const commands = Array.isArray(plugin.command) ? plugin.command : [plugin.command];
              for (const cmd of commands) {
                this.commands.set(cmd, plugin);
              }
              
              Func.log(`Loaded plugin: ${plugin.name} (${commands.join(', ')})`, 'success');
            }
          } catch (error) {
            Func.log(`Failed to load plugin ${file}: ${error.message}`, 'error');
          }
        }
      }
      
      Func.log(`Total plugins loaded: ${this.plugins.size}`, 'success');
      Func.log(`Total commands registered: ${this.commands.size}`, 'success');
    } catch (error) {
      Func.log(`Error reading plugins directory: ${error.message}`, 'error');
    }
  }

  async reloadPlugin(pluginName) {
    try {
      const pluginFile = `${pluginName}.js`;
      const pluginPath = join(process.cwd(), 'plugins', pluginFile);
      
      // Clear from cache
      const cacheKey = require.resolve(pluginPath);
      if (require.cache[cacheKey]) delete require.cache[cacheKey];
      
      // Remove old commands
      for (const [cmd, plugin] of this.commands.entries()) {
        if (plugin.name === pluginName) {
          this.commands.delete(cmd);
        }
      }
      this.plugins.delete(pluginName);
      
      // Reload plugin
      const pluginModule = await import(`../plugins/${pluginFile}?update=${Date.now()}`);
      const plugin = pluginModule.default;
      
      if (plugin && plugin.name && plugin.command) {
        this.plugins.set(plugin.name, plugin);
        
        const commands = Array.isArray(plugin.command) ? plugin.command : [plugin.command];
        for (const cmd of commands) {
          this.commands.set(cmd, plugin);
        }
        
        return { success: true, message: `Reloaded plugin: ${plugin.name}` };
      }
    } catch (error) {
      return { success: false, message: `Reload failed: ${error.message}` };
    }
  }

  getPlugin(command) {
    return this.commands.get(command);
  }
}

export const pluginHandler = new PluginHandler();

// Message handler
export default async function handler(conn, m) {
  try {
    if (!m.message || m.isBot) return;
    
    // Update user in database
    await Database.updateUser(m.sender, {
      pushname: m.pushname,
      lastActive: new Date()
    });

    // Handle .setcmd for configuration
    if (m.command === 'setcmd' && m.isQuoted) {
      return await handleSetCmd(conn, m);
    }

    // Check if it's a command
    if (m.prefix && m.command) {
      // Rate limiting (basic implementation)
      const user = await Database.getUser(m.sender);
      if (user.commandsUsed > 1000 && !user.isPremium && !user.isOwner) {
        return m.reply('Rate limit exceeded. Please wait before sending more commands.');
      }

      await Database.updateUser(m.sender, {
        commandsUsed: user.commandsUsed + 1
      });

      // Check for plugin command
      const plugin = pluginHandler.getPlugin(m.command);
      if (plugin) {
        return await handlePlugin(conn, m, plugin);
      }

      // Fallback to case.js for built-in commands
      return await caseRoute({ conn, m });
    }

    // Handle non-command messages (anti-link, anti-spam, etc.)
    await handleMessageFilters(conn, m);

  } catch (error) {
    Func.log(`Handler error: ${error.message}`, 'error');
    if (m.fromMe) {
      m.reply(`Error: ${error.message}`);
    }
  }
}

async function handleSetCmd(conn, m) {
  try {
    if (!m.fromMe && m.sender !== config.OWNER_NUMBER + '@s.whatsapp.net') {
      return m.reply('Only owner can change settings.');
    }

    const settingText = m.quoted.text || m.quoted.body;
    const lines = settingText.split('\n').filter(line => line.includes('='));
    
    for (const line of lines) {
      const [key, ...valueParts] = line.split('=');
      const value = valueParts.join('=').trim();
      
      if (key && value && config.hasOwnProperty(key)) {
        // Convert value to appropriate type
        let finalValue = value;
        if (value.toLowerCase() === 'true') finalValue = true;
        else if (value.toLowerCase() === 'false') finalValue = false;
        else if (!isNaN(value) && value !== '') finalValue = Number(value);
        
        await Database.setSetting(key, finalValue);
        config[key] = finalValue;
      }
    }
    
    m.reply('Settings updated successfully!');
  } catch (error) {
    m.reply(`Error updating settings: ${error.message}`);
  }
}

async function handlePlugin(conn, m, plugin) {
  try {
    // Check plugin settings
    if (plugin.settings) {
      if (plugin.settings.owner && !m.fromMe && m.sender !== config.OWNER_NUMBER + '@s.whatsapp.net') {
        return m.reply('This command is only for bot owner.');
      }
      
      if (plugin.settings.group && !m.isGroup) {
        return m.reply('This command can only be used in groups.');
      }
      
      if (plugin.settings.admin && m.isGroup) {
        const metadata = await conn.groupMetadata(m.chat).catch(() => null);
        if (metadata) {
          const participant = metadata.participants.find(p => p.id === m.sender);
          if (!participant || !['admin', 'superadmin'].includes(participant.admin)) {
            return m.reply('This command requires admin privileges.');
          }
        }
      }
      
      if (plugin.settings.botAdmin && m.isGroup) {
        const metadata = await conn.groupMetadata(m.chat).catch(() => null);
        if (metadata) {
          const botParticipant = metadata.participants.find(p => p.id === conn.user.id);
          if (!botParticipant || !['admin', 'superadmin'].includes(botParticipant.admin)) {
            return m.reply('Bot needs admin privileges for this command.');
          }
        }
      }
    }

    // Prepare context for plugin
    const context = {
      metadata: m.isGroup ? await conn.groupMetadata(m.chat).catch(() => null) : null,
      Func,
      config,
      Database
    };

    // Execute plugin
    await plugin.run(conn, m, context);

  } catch (error) {
    Func.log(`Plugin ${plugin.name} error: ${error.message}`, 'error');
    if (m.fromMe || m.sender === config.OWNER_NUMBER + '@s.whatsapp.net') {
      m.reply(`Plugin error: ${error.message}`);
    } else {
      m.reply('An error occurred while executing the command.');
    }
  }
}

async function handleMessageFilters(conn, m) {
  // Anti-link
  const antiLink = await Database.getSetting('ANTI_LINK');
  if (antiLink && m.isGroup && !m.fromMe) {
    const linkRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;
    if (linkRegex.test(m.body)) {
      const metadata = await conn.groupMetadata(m.chat);
      const participant = metadata.participants.find(p => p.id === m.sender);
      
      // Don't restrict admins if configured
      if (!participant || !['admin', 'superadmin'].includes(participant.admin)) {
        await m.reply('Links are not allowed in this group!');
        await conn.sendMessage(m.chat, { delete: m.key });
        return;
      }
    }
  }

  // Anti-bot
  const antiBot = await Database.getSetting('ANTI_BOT');
  if (antiBot && m.isGroup && m.message?.protocolMessage?.type === 14) {
    // This is a bot message, delete it
    await conn.sendMessage(m.chat, { delete: m.key });
  }

  // Auto-react
  const autoReact = await Database.getSetting('AUTO_REACT_MESSAGES');
  if (autoReact && m.isGroup) {
    const reactions = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
    const randomReaction = reactions[Math.floor(Math.random() * reactions.length)];
    await m.react(randomReaction);
  }
}