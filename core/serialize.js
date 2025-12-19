import {
  areJidsSameUser,
  delay,
  downloadMediaMessage,
  extractMessageContent,
  jidNormalizedUser,
  generateMessageIDV2,
  generateWAMessage,
  generateWAMessageFromContent
} from 'baileys';
import { fileTypeFromBuffer } from 'file-type';
import fs from 'fs';
import pino from 'pino';
import path from 'path';
import Func from './function.js';

const messId = generateMessageIDV2().slice(0, 4);

export function Client(conn) {
  const client = Object.defineProperties(conn, {
    getJid: {
      async value(sender) {
        if (!conn.isLid) conn.isLid = {};
        if (conn.isLid[sender]) return conn.isLid[sender];
        if (!sender.endsWith("@lid")) return sender;

        for (let chat of Object.values(conn.chats)) {
          if (!chat.metadata?.participants) continue;
          let user = chat.metadata.participants.find(p => p.id === sender);
          if (user) {
            return conn.isLid[sender] = user?.phoneNumber || user?.jid;
          }
        }
        return sender;
      }
    },

    insertAllGroup: {
      async value() {
        const groups = await conn.groupFetchAllParticipating().catch(_ => null) || {};
        for (const group in groups) {
          conn.chats[group] = {
            ...(conn.chats[group] || {}),
            id: group,
            subject: groups[group].subject,
            isChats: true,
            metadata: groups[group]
          };
        }
        return conn.chats;
      }
    },

    parseMention: {
      value(text) {
        return [...text.matchAll(/@([0-9]{5,16}|0)/g)].map(v => v[1] + '@s.whatsapp.net') || [];
      }
    },

    getFile: {
      async value(PATH, saveToFile = false) {
        let filename;
        let data;

        if (Buffer.isBuffer(PATH)) {
          data = PATH;
        } else if (PATH instanceof ArrayBuffer) {
          data = Buffer.from(PATH);
        } else if (/^data:.*?\/.*?;base64,/i.test(PATH)) {
          data = Buffer.from(PATH.split`,`[1], 'base64');
        } else if (/^https?:\/\//.test(PATH)) {
          data = await Func.getBuffer(PATH);
        } else if (fs.existsSync(PATH)) {
          filename = PATH;
          data = fs.readFileSync(PATH);
        } else if (typeof PATH === 'string') {
          data = PATH;
        } else {
          data = Buffer.alloc(0);
        }

        if (!Buffer.isBuffer(data)) throw new TypeError('Result is not a buffer');
        
        const type = await fileTypeFromBuffer(data) || {
          mime: 'application/octet-stream',
          ext: '.bin'
        };

        if (data && saveToFile && !filename) {
          filename = path.join(process.cwd(), '../tmp/' + new Date * 1 + '.' + type.ext);
          await fs.promises.writeFile(filename, data);
        }

        return {
          filename,
          ...type,
          data,
          deleteFile() {
            return filename && fs.promises.unlink(filename);
          }
        };
      },
      enumerable: true
    },

    downloadMediaMessage: {
      async value(message, filename) {
        let media = await downloadMediaMessage(message, "buffer", {}, {
          logger: pino({ timestamp: () => `,"time":"${new Date().toJSON()}"`, level: "fatal" }).child({ class: "hisoka" }),
          reuploadRequest: conn.updateMediaMessage
        });

        if (filename) {
          let mime = await fileTypeFromBuffer(media);
          let filePath = path.join(process.cwd(), `${filename}.${mime.ext}`);
          fs.promises.writeFile(filePath, media);
          return filePath;
        }

        return media;
      },
      enumerable: true
    },

    sendAlbumMessage: {
      async value(jid, medias, options = {}) {
        const userJid = conn.user?.id || conn.authState?.creds?.me?.id;
        if (!Array.isArray(medias) || medias.length < 2) throw new Error("Album minimal berisi 2 gambar.");

        const time = options.delay || 3000;
        if (options.quoted) options.ephemeralExpiration = options.quoted.expiration || 0;
        delete options.delay;
        
        const album = await generateWAMessageFromContent(jid, {
          albumMessage: {
            expectedImageCount: medias.filter(media => media.image).length,
            expectedVideoCount: medias.filter(media => media.video).length,
            ...options
          }
        }, { userJid, ...options });

        await conn.relayMessage(jid, album.message, { messageId: album.key.id });

        for (const i in medias) {
          const media = medias[i];
          let msg;

          if (media.image) {
            msg = await generateWAMessage(jid, {
              image: media.image,
              ...media,
              ...options
            }, {
              userJid,
              upload: async (readStream, opts) => {
                const up = await conn.waUploadToServer(readStream, { ...opts });
                return up;
              },
              ...options
            });
          } else if (media.video) {
            msg = await generateWAMessage(jid, {
              video: media.video,
              ...media,
              ...options
            }, {
              userJid,
              upload: async (readStream, opts) => {
                const up = await conn.waUploadToServer(readStream, {...opts });
                return up;
              },
              ...options
            });
          }

          if (msg) {
            msg.message.messageContextInfo = {
              messageAssociation: {
                associationType: 1,
                parentMessageKey: album.key
              }
            };
          }

          await conn.relayMessage(jid, msg.message, { messageId: msg.key.id });
          await delay(time);
        }

        return album;
      }
    },

    sendSticker: {
      async value(jid, path, m, options = {}) {
        let { data, mime } = await conn.getFile(path);
        if (data.length == 0) throw new TypeError("File Tidak Ditemukan");
        
        let exif = { 
          packName: options.packname || global.stickpack, 
          packPublish: options.packpublish || global.stickauth 
        };
        
        let sticker = await (await import('./exif.js')).writeExif({ mimetype: mime, data }, exif);
        return conn.sendMessage(jid, { sticker }, { quoted: m, ephemeralExpiration: m.expiration });
      }
    },

    sendGroupV4Invite: {
      async value(groupJid, participant, inviteCode, inviteExpiration, groupName = 'unknown subject', caption = 'Invitation to join my WhatsApp group', jpegThumbnail, options = {}) {
        const msg = generateWAMessageFromContent(participant, {
          groupInviteMessage: {
            inviteCode,
            inviteExpiration: parseInt(inviteExpiration) || + new Date(new Date + (3 * 86400000)),
            groupJid,
            groupName,
            jpegThumbnail,
            caption
          }
        }, {
          userJid: conn.user.id,
          ...options
        });
        
        await conn.relayMessage(participant, msg.message, { messageId: msg.key.id });
        return msg;
      },
      enumerable: true
    }

  });

  return client;
}

export default async function serialize(conn, msg) {
  if (!msg) return;
  
  let m = {};
  m.message = parseMessage(msg.message);

  if (msg.key) {
    m.key = msg.key;
    m.id = m.key.id;
    m.device = /^3A/.test(m.id) ? 'ios' : /^3E/.test(m.id) ? 'web' : /^.{21}/.test(m.id) ? 'android' : /^.{18}/.test(m.id) ? 'desktop' : 'unknown';
    m.isBot = m.id.startsWith(messId);
    m.chat = await conn.getJid(m.key.remoteJidAlt || m.key.remoteJid);
    m.isGroup = m.chat.endsWith('@g.us');
    m.sender = await conn.getJid(m.key.participantAlt || m.key.participantPn || m.key.participant || m.chat);
    m.fromMe = m.key.fromMe || areJidsSameUser(m.sender, jidNormalizedUser(conn.user?.id));
  }

  m.pushname = msg.pushName;

  if (m.message) {
    m.type = getContentType(m.message);
    m.msg = parseMessage(m.message[m.type]) || m.message[m.type];
    let mention = [...(m.msg?.contextInfo?.mentionedJid || []), ...(m.msg?.contextInfo?.groupMentions?.map(v => v.groupJid) || [])];
    m.mentions = await Promise.all(mention.map(jid => conn.getJid(jid)));
    m.body = m.msg?.text || m.msg?.conversation || m.msg?.caption || m.message?.conversation || m.msg?.selectedButtonId || m.msg?.singleSelectReply?.selectedRowId || m.msg?.selectedId || m.msg?.contentText || m.msg?.selectedDisplayText || m.msg?.title || m.msg?.name || "";
    m.prefix = new RegExp(`^[°•π÷×¶∆£¢€¥®™+✓=|/~!?@#%^&.©^]`, "gi").test(m.body) ? m.body.match(new RegExp(`^[°•π÷×¶∆£¢€¥®™+✓=|/~!?@#%^&.©^]`, "gi"))[0] : "";
    m.command = m.body && m.body.trim().replace(m.prefix, '').trim().split(/ +/).shift();
    m.cmd = m.prefix + m.command;
    m.args = m.body.trim().split(/ +/).slice(1);
    m.text = m.args.join(" ");
    m.expiration = m.msg?.contextInfo?.expiration || 0;
    m.isMedia = !!m.msg?.mimetype || !!m.msg?.thumbnailDirectPath;
    m.download = () => conn.downloadMediaMessage(m);
    m.isQuoted = false;

    // Quoted message handler
    if (m.msg?.contextInfo?.quotedMessage) {
      m.isQuoted = true;
      m.quoted = {};
      m.quoted.message = parseMessage(m.msg?.contextInfo?.quotedMessage);
      
      if (m.quoted.message) {
        m.quoted.type = getContentType(m.quoted.message) || Object.keys(m.quoted.message)[0];
        m.quoted.msg = parseMessage(m.quoted.message[m.quoted.type]) || m.quoted.message[m.quoted.type];
        m.quoted.isMedia = !!m.quoted.msg?.mimetype || !!m.quoted.msg?.thumbnailDirectPath;
        m.quoted.key = {
          remoteJid: m.msg?.contextInfo?.remoteJid || m.chat,
          participant: jidNormalizedUser(m.msg?.contextInfo?.participant),
          fromMe: areJidsSameUser(jidNormalizedUser(m.msg?.contextInfo?.participant), jidNormalizedUser(conn?.user?.id)),
          id: m.msg?.contextInfo?.stanzaId
        };
        m.quoted.id = m.msg?.contextInfo?.stanzaId;
        m.quoted.device = /^3A/.test(m.quoted.id) ? 'ios' : /^3E/.test(m.quoted.id) ? 'web' : /^.{21}/.test(m.quoted.id) ? 'android' : /^.{18}/.test(m.quoted.id) ? 'desktop' : 'unknown';
        m.quoted.chat = /g\.us|status/.test(m.msg?.contextInfo?.remoteJid) ? m.quoted.key.participant : m.quoted.key.remoteJid;
        m.quoted.fromMe = m.quoted.key.fromMe;
        m.quoted.sender = await conn.getJid(jidNormalizedUser(m.msg?.contextInfo?.participant || m.quoted.from));
        let mention = [...(m.quoted.msg?.contextInfo?.mentionedJid || []), ...(m.quoted.msg?.contextInfo?.groupMentions?.map(v => v.groupJid) || [])];
        m.quoted.mentions = await Promise.all(mention.map(jid => conn.getJid(jid)));
        m.quoted.body = m.quoted.msg?.text || m.quoted.msg?.caption || m.quoted?.message?.conversation || m.quoted.msg?.selectedButtonId || m.quoted.msg?.singleSelectReply?.selectedRowId || m.quoted.msg?.selectedId || m.quoted.msg?.contentText || m.quoted.msg?.selectedDisplayText || m.quoted.msg?.title || m.quoted?.msg?.name || "";
        m.quoted.args = m.quoted.body.trim().split(/ +/).slice(1);
        m.quoted.text = m.quoted.args.join(" ");
        m.quoted.download = () => conn.downloadMediaMessage(m.quoted);
      }
    }
  }

  // Quick reply
  m.reply = async (text, options = {}) => {
    if (typeof text === "string") {
      await conn.sendMessage(
        m.chat, {
          text,
          contextInfo: {
            mentionedJid: [...conn.parseMention(text)],
          },
          ...options,
        }, {
          quoted: m,
          ephemeralExpiration: m.expiration,
          ...options,
        }
      );
    } else if (typeof text === "object") {
      await conn.sendMessage(
        m.chat, {
          ...text,
          ...options,
        }, {
          quoted: m,
          ephemeralExpiration: m.expiration,
          ...options,
        }
      );
    }
  };

  // React to message
  m.react = async (emoji) => {
    return await conn.sendMessage(m.chat, {
      react: {
        text: emoji,
        key: m.key
      }
    });
  };

  return m;
}

function parseMessage(content) {
  content = extractMessageContent(content);

  if (content && content.viewOnceMessageV2Extension) {
    content = content.viewOnceMessageV2Extension.message;
  }
  if (content && content.protocolMessage && content.protocolMessage.type == 14) {
    let type = getContentType(content.protocolMessage);
    content = content.protocolMessage[type];
  }
  if (content && content.message) {
    let type = getContentType(content.message);
    content = content.message[type];
  }

  return content;
}

const getContentType = (content) => {
  if (content) {
    const keys = Object.keys(content);
    const key = keys.find(k => (k === 'conversation' || k.endsWith('Message') || k.includes('V2') || k.includes('V3')) && k !== 'senderKeyDistributionMessage');
    return key;
  }
};