import config from './config.js';
import util from 'util';
import makeWASocket, {
    Browsers,
    DisconnectReason,
    useMultiFileAuthState,
    makeCacheableSignalKeyStore
} from 'baileys';
import { Boom } from '@hapi/boom';
import fs from 'fs';
import pino from 'pino';

import color from './core/color.js';
import { pluginHandler } from './core/handler.js';
import serialize, { Client } from './core/serialize.js';

async function startWA() {
    const { state, saveCreds } = await useMultiFileAuthState('sessions');

    const conn = makeWASocket({
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, pino().child({ level: 'silent', stream: 'store' }))
        },
        logger: pino({ level: 'silent' }),
        browser: Browsers.ubuntu('Chrome'),
        markOnlineOnConnect: false,
        generateHighQualityLinkPreview: true,
    });

    await Client(conn);

    await pluginHandler.loadPlugins();
    conn.plugins = pluginHandler.plugins;

    if (!conn.chats) conn.chats = {};

    // SIMPLE PAIRING CODE - JUST LIKE YOUR WORKING VERSION
    if (!conn.authState.creds.registered) {
        setTimeout(async () => {
            try {
                const code = await conn.requestPairingCode(config.PAIRING_NUMBER);
                console.log(color.green(`Pairing Code: ${code}`));
                console.log(color.cyan('Enter this code in WhatsApp → Settings → Linked Devices → Link a Device'));
            } catch (err) {
                console.log(color.red('[!] Failed to get pairing code:'), err);
            }
        }, 3000);
    }

    conn.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
        if (connection) console.log(color.yellow(`[+] Connection Status: ${connection}`));
        if (connection === 'close') {
            const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
            switch (statusCode) {
                case 408:
                    console.log(color.red('[+] Connection timed out. Restarting...'));
                    await startWA();
                    break;
                case 503:
                    console.log(color.red('[+] Unavailable service. Restarting...'));
                    await startWA();
                    break;
                case 428:
                    console.log(color.cyan('[+] Connection closed, restarting...'));
                    await startWA();
                    break;
                case 515:
                    console.log(color.cyan('[+] Need to restart, restarting...'));
                    await startWA();
                    break;
                case 401:
                    console.log(color.cyan('[+] Session Logged Out. Recreating session...'));
                    fs.rmSync('./sessions', { recursive: true, force: true });
                    await startWA();
                    break;
                case 403:
                    console.log(color.red(`[+] Your WhatsApp has been banned`));
                    fs.rmSync('./sessions', { recursive: true, force: true });
                    await startWA();
                    break;
                case 405:
                    console.log(color.cyan('[+] Session Not Logged In. Recreating session...'));
                    fs.rmSync('./sessions', { recursive: true, force: true });
                    await startWA();
                    break;
                default:
                    console.log("Unhandled connection issue:", statusCode);
                    process.exit(1);
            }
        }

        if (connection === 'open') {
            console.log(color.green('[+] Bot Connected.'));
            conn.insertAllGroup();
        }
    });

    conn.ev.on('creds.update', saveCreds);

    conn.ev.on('group-participants.update', async ({ id, participants, action }) => {
        if (!id) return;
        if (id === 'status@broadcast') return;
        if (!(id in conn.chats)) conn.chats[id] = { id };
        let chats = conn.chats[id];
        chats.isChats = true;
        const groupMetadata = await conn.groupMetadata(id).catch(_ => null);
        if (!groupMetadata) return;
        chats.subject = groupMetadata.subject;
        chats.metadata = groupMetadata;
    });

    conn.ev.on('groups.update', async (groupsUpdates) => {
        try {
            for (const update of groupsUpdates) {
                const id = update.id;
                if (!id || id === 'status@broadcast') continue;
                const isGroup = id.endsWith('@g.us');
                if (!isGroup) continue;
                let chats = conn.chats[id];
                if (!chats) chats = conn.chats[id] = { id };
                chats.isChats = true;
                const metadata = await conn.groupMetadata(id).catch(_ => null);
                if (metadata) chats.metadata = metadata;
                if (update.subject || metadata?.subject) chats.subject = update.subject || metadata.subject;
            }
        } catch (e) {
            console.error(e);
        }
    });

    conn.ev.on('messages.upsert', async ({ messages }) => {
        if (!messages[0]) return;

        let m = await serialize(conn, messages[0]);


console.log("-NEW LINE------NEW LINE-------NEW LINE-")

console.log(
  util.inspect(m, {
    depth: 4,
    colors: true,
  })
)


        if (m.chat.endsWith('@broadcast') || m.chat.endsWith('@newsletter')) return;
        if (m.message && !m.isBot) {
            console.log(color.cyan(' - FROM'), color.cyan(conn.chats[m.chat]?.subject), color.blueBright(m.chat));
            console.log(color.yellowBright(' - CHAT'), color.yellowBright(m.isGroup ? `Group (${m.sender} : ${m.pushname})` : 'Private'));
            console.log(color.greenBright(' - MESSAGE'), color.greenBright(m.body || m.type));
            console.log(color.magentaBright('-'.repeat(40)));
        }

        await (await import(`./core/handler.js?v=${Date.now()}`)).default(conn, m);
    });
}

// Start the bot with phone number setup if needed
async function initializeBot() {
    try {
        // Check if phone number is configured
        if (!config.PAIRING_NUMBER) {
            const readline = (await import('readline')).createInterface({
                input: process.stdin,
                output: process.stdout
            });

            const number = await new Promise((resolve) => {
                readline.question('📱 Enter your phone number (e.g., 1234567890): ', (answer) => {
                    readline.close();
                    resolve(answer);
                });
            });

            const cleanedNumber = number.replace(/\D/g, '');
            if (!cleanedNumber) {
                console.log(color.red('[!] Invalid phone number'));
                process.exit(1);
            }

            // Update config
            const updatedConfig = { ...config, PAIRING_NUMBER: cleanedNumber + '@s.whatsapp.net' };
            const configContent = `// config.js - ES Module Configuration
export default ${JSON.stringify(updatedConfig, null, 2)};`;
            fs.writeFileSync('./config.js', configContent);

            console.log(color.green('[+] Phone number saved to config.js'));
        }

        // Start the WhatsApp connection
        await startWA();
    } catch (error) {
        console.log(color.red('[!] Initialization error:'), error);
        process.exit(1);
    }
}

// Handle uncaught errors
process.on('uncaughtException', console.error);

// Start the bot
initializeBot();