import fs from 'fs';

export default {
    name: "sfp",
    category: "owner",
    command: ["sfp", "safeplugin"],
    settings: {
    owner: true
    },
    run: async (conn, m, { quoted }) => {
        if (!m.text) return m.reply(`Nama filenya??\nContoh: ${m.cmd} folder/namafile`);
        if (!quoted.text) return m.reply(`balas pesan nya!`)
        let path = './plugins/' + m.text.replace(/\.\.|\/+/g, "_") + '.js'
        await fs.writeFileSync(path, m.quoted.text)
        m.reply(`tersimpan di ${path}`)
    }
}