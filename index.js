const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    fetchLatestBaileysVersion,
    downloadContentFromMessage 
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const { Sticker, StickerTypes } = require('wa-sticker-formatter'); // Library baru untuk konversi
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('.baileys_session_pairing');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        printQRInTerminal: false
    });

    // --- LOGIKA PAIRING CODE ---
    if (!sock.authState.creds.registered) {
        console.log("--- MODUL PAIRING CODE AKTIF ---");
        const phoneNumber = "6282353025691"; 
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
            console.log('✅ Bot Online! Siap membuat stiker Gambar & Video.');
        }
    });

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message || m.key.fromMe) return;

        const from = m.key.remoteJid;
        const type = Object.keys(m.message)[0];
        
        const body = (type === 'conversation') ? m.message.conversation : 
                     (type === 'extendedTextMessage') ? m.message.extendedTextMessage.text : 
                     (type === 'imageMessage') ? m.message.imageMessage.caption : 
                     (type === 'videoMessage') ? m.message.videoMessage.caption : '';
        
        const command = body.toLowerCase();

        if (command === '!s' || command === '!stiker') {
            const isImage = type === 'imageMessage' || m.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
            const isVideo = type === 'videoMessage' || m.message.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage;

            if (isImage || isVideo) {
                console.log(`⏳ Memproses media untuk: ${from}`);
                
                const mediaContent = m.message.imageMessage || 
                                     m.message.videoMessage || 
                                     m.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage || 
                                     m.message.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage;

                try {
                    // Download Media
                    const stream = await downloadContentFromMessage(mediaContent, isImage ? 'image' : 'video');
                    let buffer = Buffer.from([]);
                    for await (const chunk of stream) {
                        buffer = Buffer.concat([buffer, chunk]);
                    }

                    // Konversi media ke stiker menggunakan wa-sticker-formatter
                    const sticker = new Sticker(buffer, {
                        pack: 'My Sticker Bot', 
                        author: 'Railway Bot', 
                        type: StickerTypes.FULL, 
                        categories: ['🤩', '🎉'], 
                        id: '12345', 
                        quality: 70, // Kualitas dikurangi sedikit agar video < 1MB
                    });

                    const stickerBuffer = await sticker.toBuffer();
                    await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: m });
                    console.log('✅ Stiker berhasil dikirim.');

                } catch (e) {
                    console.error('Gagal membuat stiker:', e);
                    await sock.sendMessage(from, { text: '❌ Error: Pastikan durasi video < 7 detik.' });
                }
            } else {
                await sock.sendMessage(from, { text: 'Kirim/balas gambar atau video pendek dengan caption *!s*' });
            }
        } else if (command === 'ping') {
            await sock.sendMessage(from, { text: 'Pong! 🚀' });
        }
    });
}

startBot();