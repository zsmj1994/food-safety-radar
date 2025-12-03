const axios = require('axios');


async function main() {
    console.log('Starting scraper...');


    // 4. Webhook Notification
    const webhookUrl = process.env.WEBHOOK_URL;
    if (webhookUrl) {
        try {
            console.log('Sending webhook notification...');
            const payload = {
                msgtype: "markdown", // Example for DingTalk/Feishu, or just generic JSON
                content: `### 🚨 worklog提示: 别忘了记日志`
            };

            const result = await axios.post(webhookUrl, payload);
            console.log('Webhook sent successfully.', result.data);
        } catch (error) {
            console.error('Error sending webhook:', error.message);
        }
    } else {
        console.log('No WEBHOOK_URL configured, skipping notification.');
    }
}

main();
