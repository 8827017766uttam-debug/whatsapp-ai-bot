import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_PROMPT = `You are an AI recruitment assistant for Accurafind (Contact: +91 8085274897). 
You help candidates applying for Blinkit and Zomato Rider Support roles. 
Job details:
- Salary: ₹15,700 CTC | ₹13,500 In-Hand
- Requirements: Laptop & Wi-Fi are MANDATORY, good communication skills.
- Hours: 9 hours working shift, rotational.
Answer candidate questions politely, concisely, and professionally.`;

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    
    if (qr) {
      console.log('\n========================================');
      console.log('SCAN THIS QR CODE WITH WHATSAPP ON YOUR PHONE:');
      console.log('========================================\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Connection closed. Reconnecting:', shouldReconnect);
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      console.log('✅ Accurafind WhatsApp Assistant is LIVE!');
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    const text = msg.message.conversation || msg.message.extendedTextMessage?.text;

    if (!text) return;

    console.log(`📩 Received message: "${text}" from ${sender}`);

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: text,
        config: {
          systemInstruction: SYSTEM_PROMPT
        }
      });

      const replyText = response.text;
      await sock.sendMessage(sender, { text: replyText });
      console.log(`📤 Sent AI reply to ${sender}`);
    } catch (err) {
      console.error('Error replying:', err);
    }
  });
}

startBot();
