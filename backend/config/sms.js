'use strict';

function normalizePhone(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (digits.startsWith('0')) return `+62${digits.slice(1)}`;
    if (digits.startsWith('62')) return `+${digits}`;
    if (String(value || '').trim().startsWith('+')) return `+${digits}`;
    return digits ? `+${digits}` : '';
}

function isConfigured() {
    return process.env.SMS_PROVIDER === 'twilio'
        && Boolean(process.env.TWILIO_ACCOUNT_SID)
        && Boolean(process.env.TWILIO_AUTH_TOKEN)
        && Boolean(process.env.TWILIO_FROM_NUMBER);
}

async function sendOTP(phone, otp) {
    if (!isConfigured()) {
        throw new Error('Gateway SMS belum dikonfigurasi.');
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const auth = Buffer.from(`${accountSid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64');
    const body = new URLSearchParams({
        To: normalizePhone(phone),
        From: process.env.TWILIO_FROM_NUMBER,
        Body: `Kode verifikasi EduGate Anda: ${otp}. Berlaku 10 menit. Jangan berikan kode ini kepada siapa pun.`,
    });

    const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,
        {
            method: 'POST',
            headers: {
                Authorization: `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body,
            signal: AbortSignal.timeout(10_000),
        }
    );

    if (!response.ok) {
        const detail = await response.text();
        throw new Error(`Twilio menolak pengiriman SMS (${response.status}): ${detail.slice(0, 160)}`);
    }
}

module.exports = { isConfigured, normalizePhone, sendOTP };
