const express = require('express');
const app = express();

app.use(express.json());

app.post('/webhook', async (req, res) => {
  try {
    const payload = req.body;
    const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;

    if (!discordWebhookUrl) {
      return res.status(500).send('Chưa cấu hình DISCORD_WEBHOOK_URL');
    }

    const response = await fetch(discordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: "Webhook Bot",
        content: `🔔 **Thông báo mới:**\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``
      })
    });

    if (response.ok) {
      res.status(200).send('OK');
    } else {
      res.status(500).send('Lỗi gửi webhook');
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('Server Error');
  }
});

app.get('/', (req, res) => res.send('Server running!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));
