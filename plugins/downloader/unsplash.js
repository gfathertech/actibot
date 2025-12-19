import axios from "axios";
import * as cheerio from 'cheerio';

export const name = 'unsplash';
export const aliases = [];      // optional
export const tags = ['tools'];

export async function run({ Gfather, m }) {
  let args = m.args[1];
   m.reply(args)
  const url = `https://unsplash.com/s/photos/${encodeURIComponent(args)}`;
  const { data } = await axios.get(url);
  const $ = cheerio.load(data);
  const seen = new Set();
  const imageUrls = [];

  $('img[src^="https://images.unsplash.com"]').each((_, el) => {
    const fullUrl = $(el).attr('src');

    if (fullUrl && fullUrl.includes('photo') && !fullUrl.includes('profile')) {
      const baseUrl = fullUrl.split('?')[0];
      if (!seen.has(baseUrl)) {
        seen.add(baseUrl);
        imageUrls.push(fullUrl);
      }
    }
  });

  const arrayResults = imageUrls.slice(0, 10);
  if (!arrayResults.length) {
    return m.reply('No images found.');
  }

  const replyText = arrayResults
    .map((url, i) => `${i + 1}. ${url}`)
    .join('\n');;
  
  
for (let i = 0; i < arrayResults.length; i++) {
  await Gfather.sendMessage(m.chat, {
    image: { url: arrayResults[i] },
    caption: `Image ${i + 1} of ${arrayResults.length}\nGfather`
  }, { quoted: m });

  m.delay(500);  // 1 second delay between messages
}
  
  /*await Gfather.sendMessage(m.chat, {
  image: { url: arrayResults[0] },  // direct URL to the image
  caption: '     Gfather'
}, { quoted: m });*/
}

