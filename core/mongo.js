// import mongoose from 'mongoose';
// import chalk from './color.js';
// import { readFileSync, existsSync } from 'fs';
// import { join } from 'path';

// // Load config
// const configPath = join(process.cwd(), 'config.js');
// const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : {};

// let isConnected = false;
// let fallbackToJSON = false;

// // User Schema
// const userSchema = new mongoose.Schema({
//   jid: { type: String, required: true, unique: true },
//   name: String,
//   pushname: String,
//   isPremium: { type: Boolean, default: false },
//   isBanned: { type: Boolean, default: false },
//   isOwner: { type: Boolean, default: false },
//   commandsUsed: { type: Number, default: 0 },
//   lastActive: { type: Date, default: Date.now }
// }, { timestamps: true });

// // Settings Schema
// const settingsSchema = new mongoose.Schema({
//   key: { type: String, required: true, unique: true },
//   value: mongoose.Schema.Types.Mixed,
//   type: { type: String, default: 'string' }
// }, { timestamps: true });

// // Contact Schema
// const contactSchema = new mongoose.Schema({
//   jid: { type: String, required: true, unique: true },
//   name: String,
//   pushname: String,
//   isBusiness: { type: Boolean, default: false },
//   isEnterprise: { type: Boolean, default: false }
// }, { timestamps: true });

// export const UserModel = mongoose.model('User', userSchema);
// export const SettingsModel = mongoose.model('Settings', settingsSchema);
// export const ContactModel = mongoose.model('Contact', contactSchema);

// // JSON Fallback functions
// const jsonPath = join(process.cwd(), 'data');
// import { promises as fs } from 'fs';

// async function ensureDataDir() {
//   try {
//     await fs.access(jsonPath);
//   } catch {
//     await fs.mkdir(jsonPath, { recursive: true });
//   }
// }

// async function readJSON(file) {
//   await ensureDataDir();
//   try {
//     const data = await fs.readFile(join(jsonPath, `${file}.json`), 'utf8');
//     return JSON.parse(data);
//   } catch {
//     return {};
//   }
// }

// async function writeJSON(file, data) {
//   await ensureDataDir();
//   await fs.writeFile(join(jsonPath, `${file}.json`), JSON.stringify(data, null, 2));
// }

// export class Database {
  
//   async connect() {
//     if (!config.MONGODB_URI) {
//       fallbackToJSON = true;
//       console.log(chalk.yellow('[!] MongoDB URI not set, falling back to JSON files'));
//       return;
//     }

//     try {
//       await mongoose.connect(config.MONGODB_URI, {
//         useNewUrlParser: true,
//         useUnifiedTopology: true,
//       });
//       isConnected = true;
//       console.log(chalk.green('[✓] MongoDB Connected'));
//     } catch (err) {
//       fallbackToJSON = true;
//       console.log(chalk.red('[X] MongoDB Connection Error:'), err.message);
//       console.log(chalk.yellow('[!] Falling back to JSON files'));
//     }
//   }

//   // User methods
//    async getUser(jid) {
//     if (isConnected) {
//       let user = await UserModel.findOne({ jid });
//       if (!user) {
//         user = new UserModel({ jid });
//         await user.save();
//       }
//       return user;
//     } else {
//       const users = await readJSON('users');
//       if (!users[jid]) {
//         users[jid] = { jid, commandsUsed: 0, lastActive: new Date() };
//         await writeJSON('users', users);
//       }
//       return users[jid];
//     }
//   }

//    async updateUser(jid, update) {
//     if (isConnected) {
//       return await UserModel.findOneAndUpdate({ jid }, update, { new: true, upsert: true });
//     } else {
//       const users = await readJSON('users');
//       users[jid] = { ...users[jid], ...update, jid };
//       await writeJSON('users', users);
//       return users[jid];
//     }
//   }

//   // Settings methods
//    async getSetting(key) {
//     if (isConnected) {
//       const setting = await SettingsModel.findOne({ key });
//       return setting ? setting.value : config[key];
//     } else {
//       const settings = await readJSON('settings');
//       return settings[key] !== undefined ? settings[key] : config[key];
//     }
//   }

//    async setSetting(key, value) {
//     if (isConnected) {
//       await SettingsModel.findOneAndUpdate({ key }, { value }, { upsert: true });
//     } else {
//       const settings = await readJSON('settings');
//       settings[key] = value;
//       await writeJSON('settings', settings);
//     }
//     // Update config
//     config[key] = value;
//   }

//   // Contact methods
//  async saveContact(jid, contactData) {
//     if (isConnected) {
//       await ContactModel.findOneAndUpdate({ jid }, contactData, { upsert: true });
//     } else {
//       const contacts = await readJSON('contacts');
//       contacts[jid] = { ...contacts[jid], ...contactData, jid };
//       await writeJSON('contacts', contacts);
//     }
//   }
// }

// export default new Database();


import mongoose from 'mongoose';
import chalk from './color.js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Replace the config loading section at the top of your database.js:

// Load config
let config = {};
try {
  // For ES module config.js
  const configModule = await import(`file://${join(process.cwd(), 'config.js')}`);
  config = configModule.default || configModule;
  console.log(chalk.green('[✓] Config loaded from config.js'));
} catch (error) {
  // Fallback to JSON if .js fails
  const configPath = join(process.cwd(), 'config.json');
  if (existsSync(configPath)) {
    try {
      config = JSON.parse(readFileSync(configPath, 'utf8'));
      console.log(chalk.green('[✓] Config loaded from config.json'));
    } catch (jsonError) {
      console.log(chalk.yellow('[!] Config file not found or invalid, using empty config'));
    }
  } else {
    console.log(chalk.yellow('[!] Config file not found, using environment variables'));
  }
}

// Database State Management
class DatabaseState {
  static instance;
  
  constructor() {
    this.isConnected = false;
    this.fallbackToJSON = false;
    this.connectionRetries = 0;
    this.maxRetries = 3;
    this.retryDelay = 5000; // 5 seconds
  }
  
  static getInstance() {
    if (!DatabaseState.instance) {
      DatabaseState.instance = new DatabaseState();
    }
    return DatabaseState.instance;
  }
}

// Schemas
const Schemas = {
  User: new mongoose.Schema({
    jid: { 
      type: String, 
      required: true, 
      unique: true,
      index: true,
      trim: true 
    },
    name: {
      type: String,
      trim: true,
      maxlength: 100
    },
    pushname: {
      type: String,
      trim: true,
      maxlength: 100
    },
    isPremium: { 
      type: Boolean, 
      default: false 
    },
    isBanned: { 
      type: Boolean, 
      default: false 
    },
    isOwner: { 
      type: Boolean, 
      default: false 
    },
    commandsUsed: { 
      type: Number, 
      default: 0,
      min: 0
    },
    lastActive: { 
      type: Date, 
      default: Date.now,
      index: true
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  }, { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }),

  Settings: new mongoose.Schema({
    key: { 
      type: String, 
      required: true, 
      unique: true,
      index: true,
      trim: true 
    },
    value: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    type: { 
      type: String, 
      default: 'string',
      enum: ['string', 'number', 'boolean', 'object', 'array']
    },
    description: {
      type: String,
      trim: true
    },
    protected: {
      type: Boolean,
      default: false
    }
  }, { 
    timestamps: true 
  }),

  Contact: new mongoose.Schema({
    jid: { 
      type: String, 
      required: true, 
      unique: true,
      index: true,
      trim: true 
    },
    name: {
      type: String,
      trim: true,
      maxlength: 100
    },
    pushname: {
      type: String,
      trim: true,
      maxlength: 100
    },
    isBusiness: { 
      type: Boolean, 
      default: false 
    },
    isEnterprise: { 
      type: Boolean, 
      default: false 
    },
    lastSeen: {
      type: Date
    },
    profilePic: {
      type: String
    }
  }, { 
    timestamps: true 
  })
};

// Add indexes
Schemas.User.index({ lastActive: -1 });
Schemas.User.index({ isPremium: 1, commandsUsed: -1 });

// Create Models
export const UserModel = mongoose.model('User', Schemas.User);
export const SettingsModel = mongoose.model('Settings', Schemas.Settings);
export const ContactModel = mongoose.model('Contact', Schemas.Contact);

// JSON Storage with caching and better error handling
class JSONStorage {
  constructor() {
    this.basePath = join(__dirname, '../data');
    this.cache = new Map();
    this.cacheTTL = 5 * 60 * 1000; // 5 minutes
    this.writeQueue = new Map();
  }

  async ensureDataDir() {
    const fs = await import('fs').then(m => m.promises);
    try {
      await fs.access(this.basePath);
    } catch {
      await fs.mkdir(this.basePath, { recursive: true });
    }
  }

  getCacheKey(file) {
    return `${file}_${Date.now() / this.cacheTTL | 0}`;
  }

  async readJSON(file) {
    await this.ensureDataDir();
    
    const cacheKey = this.getCacheKey(file);
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const fs = await import('fs').then(m => m.promises);
    const filePath = join(this.basePath, `${file}.json`);
    
    try {
      const data = await fs.readFile(filePath, 'utf8');
      const parsed = JSON.parse(data);
      this.cache.set(cacheKey, parsed);
      return parsed;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, return empty structure
        const emptyData = {};
        this.cache.set(cacheKey, emptyData);
        return emptyData;
      }
      console.error(chalk.red(`[X] Error reading ${file}.json:`), error.message);
      return {};
    }
  }

  async writeJSON(file, data) {
    await this.ensureDataDir();
    
    const cacheKey = this.getCacheKey(file);
    this.cache.set(cacheKey, data);
    
    // Debounce writes to prevent rapid successive writes
    if (this.writeQueue.has(file)) {
      clearTimeout(this.writeQueue.get(file));
    }
    
    const writePromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(async () => {
        try {
          const fs = await import('fs').then(m => m.promises);
          await fs.writeFile(
            join(this.basePath, `${file}.json`),
            JSON.stringify(data, null, 2),
            'utf8'
          );
          this.writeQueue.delete(file);
          resolve();
        } catch (error) {
          console.error(chalk.red(`[X] Error writing ${file}.json:`), error.message);
          reject(error);
        }
      }, 100); // 100ms debounce
      
      this.writeQueue.set(file, timeoutId);
    });
    
    return writePromise;
  }

  clearCache() {
    this.cache.clear();
  }
}

// Main Database Class
export class Database {
  constructor() {
    this.state = DatabaseState.getInstance();
    this.jsonStorage = new JSONStorage();
    this.models = { UserModel, SettingsModel, ContactModel };
    this.connection = null;
  }

  async connect() {
    const mongoURI = config.MONGODB_URI || process.env.MONGODB_URI;
    
    if (!mongoURI) {
      this.state.fallbackToJSON = true;
      console.log(chalk.yellow('[!] MongoDB URI not found, using JSON storage'));
      return false;
    }

    try {
      // Close existing connection if any
      if (this.connection) {
        await mongoose.disconnect();
      }

      // Connection options
      const options = {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        family: 4,
        maxPoolSize: 10,
        retryWrites: true,
        w: 'majority'
      };

      this.connection = await mongoose.connect(mongoURI, options);
      this.state.isConnected = true;
      this.state.connectionRetries = 0;
      
      // Connection events
      mongoose.connection.on('error', (err) => {
        console.error(chalk.red('[X] MongoDB connection error:'), err.message);
      });

      mongoose.connection.on('disconnected', () => {
        this.state.isConnected = false;
        console.log(chalk.yellow('[!] MongoDB disconnected'));
      });

      console.log(chalk.green('[✓] MongoDB Connected successfully'));
      return true;
    } catch (error) {
      this.state.connectionRetries++;
      
      if (this.state.connectionRetries <= this.state.maxRetries) {
        console.log(chalk.yellow(`[!] Connection attempt ${this.state.connectionRetries} failed, retrying in ${this.state.retryDelay/1000}s...`));
        setTimeout(() => this.connect(), this.state.retryDelay);
      } else {
        this.state.fallbackToJSON = true;
        console.log(chalk.red('[X] Max connection retries reached, falling back to JSON storage'));
      }
      return false;
    }
  }

  async disconnect() {
    if (this.state.isConnected) {
      await mongoose.disconnect();
      this.state.isConnected = false;
      console.log(chalk.yellow('[!] MongoDB Disconnected'));
    }
  }

  // User Operations
  async getUser(jid) {
    if (this.state.isConnected) {
      try {
        let user = await UserModel.findOne({ jid });
        if (!user) {
          user = new UserModel({ jid });
          await user.save();
        }
        return user.toObject();
      } catch (error) {
        console.error(chalk.red('[X] Error getting user:'), error.message);
        throw error;
      }
    } else {
      const users = await this.jsonStorage.readJSON('users');
      if (!users[jid]) {
        users[jid] = {
          jid,
          commandsUsed: 0,
          lastActive: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        await this.jsonStorage.writeJSON('users', users);
      }
      return users[jid];
    }
  }

  async updateUser(jid, update) {
    if (this.state.isConnected) {
      try {
        const user = await UserModel.findOneAndUpdate(
          { jid },
          { 
            ...update,
            lastActive: new Date()
          },
          { 
            new: true, 
            upsert: true,
            runValidators: true 
          }
        );
        return user.toObject();
      } catch (error) {
        console.error(chalk.red('[X] Error updating user:'), error.message);
        throw error;
      }
    } else {
      const users = await this.jsonStorage.readJSON('users');
      users[jid] = {
        ...(users[jid] || {}),
        ...update,
        jid,
        lastActive: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await this.jsonStorage.writeJSON('users', users);
      return users[jid];
    }
  }

  async incrementCommandCount(jid) {
    if (this.state.isConnected) {
      await UserModel.updateOne(
        { jid },
        { 
          $inc: { commandsUsed: 1 },
          $set: { lastActive: new Date() }
        }
      );
    } else {
      const users = await this.jsonStorage.readJSON('users');
      if (users[jid]) {
        users[jid].commandsUsed = (users[jid].commandsUsed || 0) + 1;
        users[jid].lastActive = new Date().toISOString();
        await this.jsonStorage.writeJSON('users', users);
      }
    }
  }

  // Settings Operations
  async getSetting(key, defaultValue = null) {
    if (this.state.isConnected) {
      try {
        const setting = await SettingsModel.findOne({ key });
        if (setting) return setting.value;
        
        // Check config and environment
        return config[key] || process.env[key] || defaultValue;
      } catch (error) {
        console.error(chalk.red('[X] Error getting setting:'), error.message);
        return defaultValue;
      }
    } else {
      const settings = await this.jsonStorage.readJSON('settings');
      if (settings[key] !== undefined) return settings[key];
      return config[key] || process.env[key] || defaultValue;
    }
  }

  async setSetting(key, value, type = 'string', description = '', protectedFlag = false) {
    if (this.state.isConnected) {
      try {
        await SettingsModel.findOneAndUpdate(
          { key },
          { value, type, description, protected: protectedFlag },
          { upsert: true }
        );
      } catch (error) {
        console.error(chalk.red('[X] Error setting setting:'), error.message);
        throw error;
      }
    } else {
      const settings = await this.jsonStorage.readJSON('settings');
      settings[key] = value;
      await this.jsonStorage.writeJSON('settings', settings);
    }
    
    // Update in-memory config
    config[key] = value;
  }

  async getSettings(keys) {
    if (this.state.isConnected) {
      const settings = await SettingsModel.find({ key: { $in: keys } });
      const result = {};
      settings.forEach(setting => {
        result[setting.key] = setting.value;
      });
      return result;
    } else {
      const allSettings = await this.jsonStorage.readJSON('settings');
      const result = {};
      keys.forEach(key => {
        if (allSettings[key] !== undefined) {
          result[key] = allSettings[key];
        }
      });
      return result;
    }
  }

  // Contact Operations
  async saveContact(jid, contactData) {
    if (this.state.isConnected) {
      try {
        await ContactModel.findOneAndUpdate(
          { jid },
          { 
            ...contactData,
            jid,
            lastSeen: new Date()
          },
          { upsert: true }
        );
      } catch (error) {
        console.error(chalk.red('[X] Error saving contact:'), error.message);
      }
    } else {
      const contacts = await this.jsonStorage.readJSON('contacts');
      contacts[jid] = {
        ...(contacts[jid] || {}),
        ...contactData,
        jid,
        lastSeen: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await this.jsonStorage.writeJSON('contacts', contacts);
    }
  }

  async getContact(jid) {
    if (this.state.isConnected) {
      return await ContactModel.findOne({ jid });
    } else {
      const contacts = await this.jsonStorage.readJSON('contacts');
      return contacts[jid] || null;
    }
  }

  // Bulk Operations
  async bulkUpdateUsers(updates) {
    if (this.state.isConnected) {
      const bulkOps = updates.map(update => ({
        updateOne: {
          filter: { jid: update.jid },
          update: { $set: update },
          upsert: true
        }
      }));
      await UserModel.bulkWrite(bulkOps);
    } else {
      const users = await this.jsonStorage.readJSON('users');
      updates.forEach(update => {
        users[update.jid] = {
          ...(users[update.jid] || {}),
          ...update,
          updatedAt: new Date().toISOString()
        };
      });
      await this.jsonStorage.writeJSON('users', users);
    }
  }

  // Utility Methods
  async getStats() {
    if (this.state.isConnected) {
      const [userCount, premiumCount, activeUsers] = await Promise.all([
        UserModel.countDocuments(),
        UserModel.countDocuments({ isPremium: true }),
        UserModel.countDocuments({ 
          lastActive: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        })
      ]);
      
      return {
        userCount,
        premiumCount,
        activeUsers,
        storageType: 'mongodb'
      };
    } else {
      const users = await this.jsonStorage.readJSON('users');
      const userArray = Object.values(users);
      const premiumCount = userArray.filter(u => u.isPremium).length;
      const activeUsers = userArray.filter(u => {
        const lastActive = new Date(u.lastActive);
        return Date.now() - lastActive.getTime() < 24 * 60 * 60 * 1000;
      }).length;
      
      return {
        userCount: userArray.length,
        premiumCount,
        activeUsers,
        storageType: 'json'
      };
    }
  }

  async clearCache() {
    this.jsonStorage.clearCache();
  }

  // Health Check
  async healthCheck() {
    return {
      isConnected: this.state.isConnected,
      fallbackToJSON: this.state.fallbackToJSON,
      connectionRetries: this.state.connectionRetries,
      uptime: process.uptime()
    };
  }
}

// Singleton instance
const database = new Database();
export default database;

// Auto-reconnect on startup
if (config.MONGODB_URI || process.env.MONGODB_URI) {
  database.connect().catch(console.error);
}