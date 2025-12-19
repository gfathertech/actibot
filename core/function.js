import { fileTypeFromBuffer } from 'file-type';
import fs from 'fs/promises';
import { tmpdir } from 'os';
import sharp from "sharp";
import path from 'path';
// import serialize from './serialize.js';

const temp = process.platform === 'win32' ? process.env.TEMP : tmpdir();

export class Func {
   async getBuffer(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      throw new Error(`Failed to fetch buffer: ${error.message}`);
    }
  }

   decodeJid(jid) {
    if (!jid) return jid;
    if (jid === 'status@broadcast') return jid;
    if (jid.includes('@s.whatsapp.net')) return jid;
    if (jid.includes('@g.us')) return jid;
    
    // Handle lid and other jid formats
    const [user, server] = jid.split('@');
    if (server === 'lid') {
      // Convert lid to regular jid if possible
      return user + '@s.whatsapp.net';
    }
    return jid;
  }

   async sendText(conn, jid, text, quoted, options = {}) {
    return await conn.sendMessage(jid, { text }, { quoted, ...options });
  }

   async sendImageAd(conn, jid, title, desc, sourceUrl, thumbUrl, caption, large = true, attribution = true, quoted) {
    const thumbBuffer = await this.getBuffer(thumbUrl);
    
    return await conn.sendAdMessage(jid, {
      text: caption,
      contextInfo: {
        externalAdReply: {
          title,
          body: desc,
          sourceUrl,
          thumbnailUrl: thumbBuffer,
          mediaType: 1,
          renderLargerThumbnail: large,
          showAdAttribution: attribution
        }
      }
    }, { quoted });
  }

   async downloadMediaMessage(conn, message, filename) {
    try {
      const buffer = await conn.downloadMediaMessage(message);
      if (filename) {
        const mime = await fileTypeFromBuffer(buffer);
        const filePath = path.join(process.cwd(), `${filename}.${mime.ext}`);
        await fs.writeFile(filePath, buffer);
        return filePath;
      }
      return buffer;
    } catch (error) {
      throw new Error(`Download failed: ${error.message}`);
    }
  }

   log(message, type = 'info') {
    const colors = {
      info: '\x1b[36m',
      success: '\x1b[32m',
      warning: '\x1b[33m',
      error: '\x1b[31m',
      reset: '\x1b[0m'
    };
    
    const timestamp = new Date().toISOString();
    console.log(`${colors[type]}[${timestamp}] ${message}${colors.reset}`);
  }

   isUrl(string) {
    try {
      new URL(string);
      return true;
    } catch {
      return false;
    }
  }

   formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

   formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

    createRoundSticker(mediaBuffer) {
  const roundedSticker =  sharp(mediaBuffer)
    .resize(512, 512) 
    .composite([
      {
        input: Buffer.from(
          '<svg><circle cx="256" cy="256" r="256" fill="white" /></svg>' 
        ),
        blend: 'dest-in' 
      }
    ])
    .webp({ quality: 75 }) 
    .toBuffer();

  return roundedSticker;
};
}

export default new Func();