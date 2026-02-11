const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    downloadContentFromMessage 
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const sharp = require('sharp');
const pino = require('pino');

async function startBot() {
    // Menyimpan sesi agar tidak perlu scan ulang setiap restart
    const { state, saveCreds } = await useMultiFileAuthState('.baileys_auth');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false, // Diubah ke false karena kita akan handle manual di bawah
        logger: pino({ level: 'silent' }),
        browser: ['Bot Stiker', 'MacOS', '3.0.0']
    });

    // Simpan kredensial saat ada perubahan
    sock.ev.on('creds.update', saveCreds);

    // Monitor Koneksi
    // Monitor Koneksi
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            // Kita ubah QR menjadi string utuh agar tidak terpecah baris demi baris oleh log Railway
            qrcode.toString(qr, { type: 'terminal', small: true }, (err, qrString) => {
                if (err) return console.error('Gagal generate QR:', err);
                
                console.log('--- SCAN QR CODE DI BAWAH INI ---');
                // Menggunakan process.stdout.write untuk memastikan string dicetak apa adanya
                process.stdout.write(qrString + '\n');
            });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('✅ Bot Baileys Aktif!');
        }
    });

    // Logika Pesan Masuk
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;

        const from = m.key.remoteJid;
        const type = Object.keys(m.message)[0];
        
        // Ambil teks pesan
        const body = (type === 'conversation') ? m.message.conversation : 
                     (type === 'extendedTextMessage') ? m.message.extendedTextMessage.text : 
                     (type === 'imageMessage') ? m.message.imageMessage.caption : '';
        const command = body.toLowerCase();

        // FITUR STIKER (!s)
        if (command === '!s' || command === '!stiker') {
            const isImage = type === 'imageMessage' || (m.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage);
            
            if (isImage) {
                const quotaContent = m.message.imageMessage || m.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage;
                
                // Download Media
                const stream = await downloadContentFromMessage(quotaContent, 'image');
                let buffer = Buffer.from([]);
                for await (const chunk of stream) {
                    buffer = Buffer.concat([buffer, chunk]);
                }

                try {
                    const stickerBuffer = await sharp(buffer)
                        .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                        .webp()
                        .toBuffer();

                    await sock.sendMessage(from, { sticker: stickerBuffer });
                } catch (e) {
                    await sock.sendMessage(from, { text: '❌ Gagal membuat stiker.' });
                }
            } else {
                await sock.sendMessage(from, { text: 'Balas atau kirim gambar dengan caption *!s*' });
            }
        }

        // FITUR PING
        else if (command === 'ping') {
            await sock.sendMessage(from, { text: 'Pong! 🚀' });
        }
    });
}

startBot();