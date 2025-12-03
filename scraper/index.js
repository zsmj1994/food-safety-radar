const fs = require('fs/promises');
const path = require('path');
const axios = require('axios');
const OpenAI = require('openai');

// Configuration
const TARGET_URL = 'https://www.jsxishan.gov.cn/qscjgj/zfxxgk/zfxxgkml_1/spaq/index.shtml'; // Wuxi Food Safety Sampling Information
const BASE_DOMAIN = 'https://www.jsxishan.gov.cn';
const DATA_FILE = path.join(__dirname, '../data.json');
const LAST_UPDATE_DATE = '2025-11-20';

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function main() {
  console.log('Starting scraper...');

  // 1. Fetch HTML
  let htmlContent;
  try {
    console.log(`Fetching ${TARGET_URL}...`);
    const response = await axios.get(TARGET_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000
    });
    htmlContent = response.data;
    console.log('HTML fetched successfully.');
  } catch (error) {
    console.error('Error fetching HTML:', error.message);
    process.exit(1);
  }

  // 2. AI Parse
  let extractedData = [];
  try {
    console.log('Sending HTML to OpenAI for parsing...');
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant that extracts structured data from HTML. 
          You must output valid JSON only. 
          The JSON should be an object with a key "announcements" containing an array of objects.
          Each object must have: "title", "url", "date".
          
          Rules:
          1. Extract food safety announcement titles, links, and dates from the HTML.
          2. **【关键修改】只提取 公开日期 在 2025-11-26 (含) 之后的公告。** **任何早于 2025-11-26 的公告必须被忽略。**
          3. If the link is relative (starts with / or ./ or just a filename), prepend the base domain: ${BASE_DOMAIN}. 
             Note: The HTML might use relative paths like './202311/t20231127_123.html'. You need to resolve them correctly relative to the current page or just use the base domain if it fits. 
             Ideally, return the full absolute URL.
          4. Date format should be YYYY-MM-DD.
          `
        },
        {
          role: "user",
          content: `Extract the announcement list from this HTML:\n\n${htmlContent.substring(0, 15000)}` // Limit length to avoid token limits if HTML is huge
        }
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(completion.choices[0].message.content);
    extractedData = result.announcements || [];
    console.log(`Extracted ${extractedData.length} items.`);
  } catch (error) {
    console.error('Error parsing with OpenAI:', error);
    process.exit(1);
  }

  // 3. Data Contrast
  let historyData = [];
  try {
    const dataStr = await fs.readFile(DATA_FILE, 'utf-8');
    historyData = JSON.parse(dataStr);
  } catch (error) {
    console.log('No history data found or error reading file, starting fresh.');
    historyData = [];
  }

  const newItems = extractedData.filter(item => {
    return !historyData.some(historyItem => historyItem.url === item.url);
  });

  console.log(`Found ${newItems.length} new announcements.`);

  // 4. Webhook Notification
  if (newItems.length > 0) {
    const webhookUrl = process.env.WEBHOOK_URL;
    if (webhookUrl) {
      try {
        console.log('Sending webhook notification...');
        const payload = {
          msgtype: "markdown", // Example for DingTalk/Feishu, or just generic JSON
          content: {
            text: `### 🚨 锡市监食品安全速报: 发现 ${newItems.length} 条新公告\n\n` +
              newItems.map(item => `- [${item.date}] [${item.title}](${item.url})`).join('\n')
          },
          // Generic fallback
          text: `Found ${newItems.length} new announcements:\n` + newItems.map(item => `${item.date}: ${item.title} - ${item.url}`).join('\n')
        };

        await axios.post(webhookUrl, payload);
        console.log('Webhook sent successfully.');
      } catch (error) {
        console.error('Error sending webhook:', error.message);
      }
    } else {
      console.log('No WEBHOOK_URL configured, skipping notification.');
    }
  }

  // 5. Save Data
  // Merge new items to history. We can just replace history with the latest scrape + old ones, 
  // or just append new ones. To keep it simple and avoid duplicates, we'll merge by URL.
  // Actually, the requirement says "Save all announcements (new + old)".
  // A simple way is to keep the `extractedData` as the fresh source of truth for "latest", 
  // but we might want to keep older ones that fell off the first page.
  // Let's append newItems to historyData.
  const updatedData = [...newItems, ...historyData];

  // Optional: Deduplicate again just in case
  const uniqueData = Array.from(new Map(updatedData.map(item => [item.url, item])).values());

  await fs.writeFile(DATA_FILE, JSON.stringify(uniqueData, null, 2), 'utf-8');
  console.log('Data saved.');
}

main();
