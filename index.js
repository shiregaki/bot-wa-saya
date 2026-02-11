const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const sharp = require('sharp');

// Konfigurasi Tanpa Path Manual (Biarkan Puppeteer Download Sendiri)
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        handleSIGINT: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--no-zygote',
            '--disable-gpu'
        ],
    }
});

// Menampilkan QR Code di Log Railway
client.on('qr', (qr) => {
    console.log('--- SCAN QR CODE DI LOGS RAILWAY ---');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.log('✅ Bot WhatsApp Berhasil Online di Railway!');
});

client.on('message', async (msg) => {
    const chat = await msg.getChat();
    const body = msg.body.toLowerCase();

    // 1. FITUR STIKER (!s atau !stiker)
    if (body === '!s' || body === '!stiker') {
        // Cek apakah ada media atau mereply media
        const hasMedia = msg.hasMedia || (msg.hasQuotedMsg && (await msg.getQuotedMessage()).hasMedia);
        
        if (hasMedia) {
            const media = msg.hasMedia ? await msg.downloadMedia() : await (await msg.getQuotedMessage()).downloadMedia();

            if (media && media.mimetype.includes('image')) {
                await chat.sendStateTyping();
                try {
                    const buffer = Buffer.from(media.data, 'base64');
                    
                    // Proses Gambar: Menjadi 512x512 WebP (Standar WhatsApp)
                    const processedImage = await sharp(buffer)
                        .resize(512, 512, {
                            fit: 'contain',
                            background: { r: 0, g: 0, b: 0, alpha: 0 }
                        })
                        .webp()
                        .toBuffer();

                    const sticker = new MessageMedia('image/webp', processedImage.toString('base64'), 'sticker.webp');
                    
                    await client.sendMessage(msg.from, sticker, {
                        sendMediaAsSticker: true,
                        stickerName: "Ultimate Sticker Bot",
                        stickerAuthor: "Gemini AI"
                    });
                } catch (err) {
                    console.error('Sharp Error:', err);
                    msg.reply('❌ Gagal memproses gambar menjadi stiker.');
                }
            } else {
                msg.reply('❌ Maaf, fitur ini hanya untuk gambar.');
            }
        } else {
            msg.reply('Balas atau kirim gambar dengan caption *!s* untuk membuat stiker.');
        }
    }

    // 2. FITUR PING
    else if (body === 'ping') {
        msg.reply('Pong! Bot aktif 24 jam 🤖');
    }

    // 3. FITUR MENU
    else if (body === '!menu') {
        const menuText = `
*--- ULTIMATE WA BOT ---*

1. *!s* - Kirim/balas gambar jadi stiker
2. *!jam* - Cek waktu server
3. *ping* - Cek koneksi bot

_Bot berjalan otomatis di Railway_
        `;
        msg.reply(menuText);
    }

    // 4. FITUR JAM (WIB)
    else if (body === '!jam') {
        const waktu = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
        msg.reply(`Waktu saat ini (WIB): \n${waktu}`);
    }
});

// Penanganan Error Tambahan agar Bot tidak sering restart
client.on('auth_failure', msg => console.error('Gagal Autentikasi:', msg));
client.on('disconnected', (reason) => console.log('Bot Terputus:', reason));

client.initialize();