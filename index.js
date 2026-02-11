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
    console.log('🚀 Memulai inisialisasi bot...');

    try {
        // Menggunakan folder .baileys_session_v2 untuk menyimpan sesi
        const { state, saveCreds } = await useMultiFileAuthState('.baileys_session_v2');
        console.log('✅ Folder sesi berhasil dimuat.');

        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false, // Kita handle manual agar log Railway tidak pecah
            logger: pino({ level: 'info' }), // Naikkan level log ke info untuk melihat aktivitas
            browser: ['Bot Stiker Saya', 'Chrome', '1.0.0']
        });

        console.log('📡 Menunggu respon dari server WhatsApp...');

        // Simpan kredensial saat ada perubahan
        sock.ev.on('creds.update', saveCreds);

        // Monitor Koneksi
        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.log('--- QR CODE TERDETEKSI ---');
                qrcode.toString(qr, { type: 'terminal', small: true }, (err, qrString) => {
                    if (err) return console.error('Gagal generate QR:', err);
                    process.stdout.write(qrString + '\n');
                    console.log('Silakan scan QR di atas melalui HP Anda.');
                });
            }

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('❌ Koneksi terputus! Mencoba hubungkan ulang:', shouldReconnect);
                if (shouldReconnect) startBot();
            } else if (connection === 'open') {
                console.log('✅ BOT BERHASIL TERHUBUNG DAN ONLINE!');
            }
        });

        // Logika Pesan Masuk
        sock.ev.on('messages.upsert', async ({ messages }) => {
            const m = messages[0];
            if (!m.message || m.key.fromMe) return;

            const from = m.key.remoteJid;
            console.log(`📩 Pesan masuk dari: ${from}`);
            
            const type = Object.keys(m.message)[0];
            const body = (type === 'conversation') ? m.message.conversation : 
                         (type === 'extendedTextMessage') ? m.message.extendedTextMessage.text : 
                         (type === 'imageMessage') ? m.message.imageMessage.caption : '';
            
            const command = body.toLowerCase();

            if (command === 'ping') {
                await sock.sendMessage(from, { text: 'Pong! Bot aktif 🚀' });
            }

            // Fitur Stiker (!s)
            if (command === '!s' || command === '!stiker') {
                const isImage = type === 'imageMessage' || (m.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage);
                if (isImage) {
                    const quotaContent = m.message.imageMessage || m.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage;
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
                        console.error('Error Sharp:', e);
                    }
                }
            }
        });

    } catch (error) {
        console.error('❌ Terjadi kesalahan fatal saat start up:', error);
    }
}

// Jalankan bot
startBot();