const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const readline = require('readline');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const question = (text) => new Promise((resolve) => rl.question(text, resolve));

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('.baileys_session_pairing');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        printQRInTerminal: false // Matikan QR karena kita pakai kode
    });

    // FITUR PAIRING CODE
    if (!sock.authState.creds.registered) {
        console.log("--- MODUL PAIRING CODE AKTIF ---");
        // GANTI NOMOR DI BAWAH DENGAN NOMOR BOT ANDA (Gunakan format 62xxx)
        const phoneNumber = "6282353025691"; 
        
        setTimeout(async () => {
            let code = await sock.requestPairingCode(phoneNumber);
            console.log(`✅ KODE PAIRING ANDA: ${code}`);
            console.log("Buka WA > Perangkat Tertaut > Tautkan Perangkat > Tautkan dengan nomor telepon saja.");
        }, 3000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('✅ Bot Berhasil Online via Pairing Code!');
        }
    });
}

startBot();