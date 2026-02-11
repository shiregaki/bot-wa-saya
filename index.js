const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    fetchLatestBaileysVersion,
    downloadContentFromMessage 
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const sharp = require('sharp');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

async function startBot() {
    // Menggunakan folder sesi yang sudah berhasil terhubung sebelumnya
    const { state, saveCreds } = await useMultiFileAuthState('.baileys_session_pairing');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        printQRInTerminal: false
    });

    // --- LOGIKA PAIRING CODE (Hanya aktif jika belum login) ---
    if (!sock.authState.creds.registered) {
        console.log("--- MODUL PAIRING CODE AKTIF ---");
        const phoneNumber = "6282353025691"; // Ganti dengan nomor WhatsApp Anda (format internasional tanpa +)
        setTimeout(async () => {
            let code = await sock.requestPairingCode(phoneNumber);
            console.log(`✅ KODE PAIRING ANDA: ${code}`);
        }, 3000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('✅ Bot Online! Siap membuat stiker.');
        }
    });

    // --- LOGIKA PESAN MASUK (FITUR STIKER) ---
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;

        const from = m.key.remoteJid;
        const type = Object.keys(m.message)[0];
        
        // Ambil caption atau teks pesan
        const body = (type === 'conversation') ? m.message.conversation : 
                     (type === 'extendedTextMessage') ? m.message.extendedTextMessage.text : 
                     (type === 'imageMessage') ? m.message.imageMessage.caption : 
                     (type === 'videoMessage') ? m.message.videoMessage.caption : '';
        
        const command = body.toLowerCase();

        // Fitur Stiker (!s)
        if (command === '!s' || command === '!stiker') {
            // Cek apakah pesan berisi gambar/video atau membalas (reply) gambar/video
            const isImage = type === 'imageMessage' || m.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
            const isVideo = type === 'videoMessage' || m.message.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage;

            if (isImage || isVideo) {
                console.log(`⏳ Sedang memproses stiker untuk: ${from}`);
                
                // Ambil konten media (dari pesan langsung atau reply)
                const mediaContent = m.message.imageMessage || 
                                     m.message.videoMessage || 
                                     m.message.extendedTextMessage.contextInfo.quotedMessage.imageMessage || 
                                     m.message.extendedTextMessage.contextInfo.quotedMessage.videoMessage;

                try {
                    // Download Media
                    const stream = await downloadContentFromMessage(mediaContent, isImage ? 'image' : 'video');
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) {
                        buffer = Buffer.concat([buffer, chunk]);
                    }

                    let stickerBuffer;

                    if (isImage) {
                        // Proses Gambar dengan Sharp (Output: WebP 512x512)
                        stickerBuffer = await sharp(buffer)
                            .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
                            .webp()
                            .toBuffer();
                    } else {
                        // Untuk Video/GIF (WhatsApp membutuhkan library tambahan seperti ffmpeg untuk hasil sempurna)
                        // Sebagai dasar, kita kirimkan buffer asli jika ukurannya kecil
                        stickerBuffer = buffer; 
                    }

                    // Kirim Stiker
                    await sock.sendMessage(from, { 
                        sticker: stickerBuffer,
                        mimetype: 'image/webp'
                    }, { quoted: m });

                    console.log('✅ Stiker berhasil dikirim.');
                } catch (e) {
                    console.error('Gagal membuat stiker:', e);
                    await sock.sendMessage(from, { text: '❌ Gagal memproses media menjadi stiker.' });
                }
            } else {
                await sock.sendMessage(from, { text: 'Kirim gambar/video dengan caption *!s* atau balas gambar/video dengan *!s*' });
            }
        }
        
        // Fitur Ping
        else if (command === 'ping') {
            await sock.sendMessage(from, { text: 'Pong! Bot aktif 🚀' });
        }
    });
}

startBot();