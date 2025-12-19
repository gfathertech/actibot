import axios from 'axios';
import * as cheerio from "cheerio";




let handler = async ({Gfather, m }) => {
let text = m.text;


  if (!text) return m.reply(`Please provide the APK name`);
  try {
    // STEP 1: Search
    const searchURL = `https://www.apkmirror.com/?s=${encodeURIComponent(text)}`;
    const response = await axios.get(searchURL, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const $ = cheerio.load(response.data);
    const firstResult = $('.appRow').first();
    const appTitle = firstResult.find('.appRowTitle').text().trim();
    const appPage = 'https://www.apkmirror.com' + firstResult.find('a').attr('href');

    if (!appPage || !appTitle) {
      return m.reply("Sorry, I couldn’t find an APK matching that title.");
    }

    // STEP 2: Go to App Page and get first version
    const appDetails = await axios.get(appPage, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const $$ = cheerio.load(appDetails.data);
    const versionLink = 'https://www.apkmirror.com' + $$('.table-row a.accent_color').first().attr('href');

    if (!versionLink) {
      return m.reply("Couldn’t find a version to download.");
    }

    // STEP 3: Go to Version Page (with download variants)
    const versionPage = await axios.get(versionLink, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const $$$ = cheerio.load(versionPage.data);
    const variantPage = 'https://www.apkmirror.com' + $$$('a.downloadButton').first().attr('href');

    if (!variantPage) {
      return m.reply("Couldn’t find a download variant.");
    }

    // STEP 4: Go to Variant Page (actual download)
    const finalPage = await axios.get(variantPage, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const $$$$ = cheerio.load(finalPage.data);
    const downloadLink = 'https://www.apkmirror.com' + $$$$('a[rel="nofollow"]').first().attr('href');

    if (!downloadLink) {
      return m.reply("Couldn’t find the final download link.");
    }

    // Final reply
    const replyMessage = `*${appTitle}*\n\nVersion: ${versionLink.split('/')[5]}`;
    
    
    let dinput = downloadLink;
    let captiond = replyMessage;
    let mimetype = 'application/vnd.android.package-archive';
    let fileName = appTitle;

    await m.sendDocument(dinput, captiond, mimetype, fileName, Gfather, m);

  } catch (err) {
    console.error("APK Deep Fetch Error:", err.message);
    m.reply("Something went wrong while fetching the full APK download.");
  }
};

handler.command = /^apk$/i;
handler.help = ['Download apk from Apk mirror'];
handler.tags = ['downloader'];

export default handler;