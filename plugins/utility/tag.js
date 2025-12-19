// commands/tagall.js
export const name = 'tag';
export const aliases = [];      // optional
export const tags = ['group'];


export async function run({ Gfather, msg }) {
  const groupMetadata = m.groupMetadata
  const participants = m.participants;
  let args = m.args[1];

  const mentionedJid = participants.map(p => p.id);
  let messageText = '';

  if (!args || args === 'all') {
    messageText = participants
      .map((p, i) => `${i + 1}. @${p.id.split('@')[0]}`)
      .join('\n');
  } else if (args === 'admin' || args === 'admins') {
    const admins = participants.filter(p => p.admin);
    if (!admins.length) return msg.reply('No admins found');
    messageText = admins
      .map((a, i) => `${i + 1}. @${a.id.split('@')[0]}`)
      .join('\n');
  } else if (args === 'notadmin' || args === 'notadmins') {
    const notAdmins = participants.filter(p => !p.admin);
    messageText = notAdmins
      .map((a, i) => `${i + 1}. @${a.id.split('@')[0]}`)
      .join('\n');
  } else {
    return msg.reply('Usage: tag, tag admin, tag notadmin');
  }

  await Gfather.sendMessage(msg.chat, {
    text: messageText,
    mentions: mentionedJid
  }, { quoted: msg });
}