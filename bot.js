import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import http from 'http';

dotenv.config();

// HTTP server for Render health checks
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Accurafind WhatsApp Assistant is running 24/7!\n');
}).listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 HTTP Server listening on port ${PORT}`);
});

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
    if (!msg?.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    
    // Extract text across all message wrapper types
    const text = 
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.ephemeralMessage?.message?.conversation ||
      msg.message.ephemeralMessage?.message?.extendedTextMessage?.text;

    if (!text) return;

    console.log(`📩 Received message from ${sender}: "${text}"`);

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: text,
        config: {
          systemInstruction: SYSTEM_PROMPT
        }
      });

      const replyText = response.text || "Thank you for reaching out to Accurafind. How can I assist you today?";
      await sock.sendMessage(sender, { text: replyText });
      console.log(`📤 Sent AI reply to ${sender}`);
    } catch (err) {
      console.error('❌ Error generating AI reply:', err.message || err);
    }
  });
}

startBot();
