/*
Name ; Pastebin Copy
Type : Plugins Esm 
Desk : Untuk Mengambil Isi Dari Url Pastebin
Sumber : https://whatsapp.com/channel/0029VaylUlU77qVT3vDPjv11
*/
import fetch from 'node-fetch';

let handler = async ({conn, m}) => {

let args = m.args;
  if (!args[1]) throw '• *Example :* .getpaste https://pastebin.com/KiCvmvCf';

  let url = args[1].trim();
  
  
  if (url.startsWith('https://pastebin.com/') && !url.includes('/raw/')) {
     url = url.replace('https://pastebin.com/', 'https://pastebin.com/raw/');
   }

  await conn.sendMessage(m.chat, { react: { text: '🔍', key: m.key } });
  
  const text = await getPastebinContent(url);
  if (text) {
    await m.reply(`📄 *Isi Pastebin:*\n\n${text}`);
  } else {
    await m.reply('❌ Gagal mengambil isi dari Pastebin.');
  }
};

handler.help = ['getpaste <url>'];
handler.tags = ['tools'];
handler.command = /^(getpaste)$/i;
export default handler;

async function getPastebinContent(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    return await res.text();
  } catch (error) {
    console.error('Error:', error.message);
    return null;
  }
}