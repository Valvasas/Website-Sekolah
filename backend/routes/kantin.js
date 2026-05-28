// routes/kantin.js — marketplace siswa: produk, pesanan, dan chat ringan
'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../middleware/auth');
const getDB = require('../config/database');

const router = express.Router();
const STUDENT_ROLES = ['siswa', 'wali_murid'];
const PAYMENT_METHODS = ['DANA', 'OVO', 'GoPay', 'ShopeePay', 'QRIS', 'Tunai', 'e-money'];

const nowISO = () => new Date().toISOString();
const cleanText = (value, max = 240) => (
    value === undefined || value === null
        ? null
        : String(value).replace(/[<>]/g, '').trim().slice(0, max) || null
);
const cleanUrl = value => {
    const text = cleanText(value, 500);
    if (!text) return null;
    return /^(https?:\/\/|\/uploads\/|uploads\/|asset\/|\/asset\/)/i.test(text) ? text : null;
};
const cleanList = (value, max = 240) => cleanText(value, max);

function splitKeywords(value) {
    return String(value || '')
        .toLowerCase()
        .split(/[,;\s]+/)
        .map(v => v.trim())
        .filter(Boolean);
}

function scoreProductForProfile(product, profile) {
    const prefs = [
        ...splitKeywords(profile?.preferences),
        ...splitKeywords(profile?.hobbies),
        ...splitKeywords(profile?.target_market)
    ];
    if (!prefs.length) return 0;
    const haystack = `${product.name || ''} ${product.description || ''} ${product.category || ''} ${product.tags || ''}`.toLowerCase();
    return prefs.reduce((score, key) => score + (haystack.includes(key) ? 1 : 0), 0);
}

function ensureStudent(req, res) {
    if (STUDENT_ROLES.includes(req.user?.role)) return true;
    res.status(403).json({ success: false, message: 'Fitur Kantin ku hanya untuk akun siswa/wali.' });
    return false;
}

router.get('/products', authenticate, (req, res) => {
    if (!ensureStudent(req, res)) return;
    const db = getDB();
    const search = cleanText(req.query.search, 80);
    const category = cleanText(req.query.category, 80);
    const conds = ["p.status = 'active'"];
    const params = [];
    if (category) {
        conds.push('p.category = ?');
        params.push(category);
    }
    if (search) {
        conds.push('(p.name LIKE ? OR p.description LIKE ? OR p.tags LIKE ? OR u.nama_lengkap LIKE ?)');
        params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    try {
        const rows = db.prepare(`
            SELECT p.*, u.nama_lengkap as seller_name, sp.kelas as seller_class
            FROM kantin_products p
            JOIN users u ON u.id = p.seller_id
            LEFT JOIN siswa_profil sp ON sp.nisn = p.seller_nisn
            WHERE ${conds.join(' AND ')}
            ORDER BY p.created_at DESC
            LIMIT 80
        `).all(...params);
        const profile = db.prepare('SELECT * FROM kantin_profiles WHERE user_id = ?').get(req.user.sub);
        const scored = rows
            .map(row => ({ ...row, preference_score: scoreProductForProfile(row, profile) }))
            .sort((a, b) => (b.preference_score - a.preference_score) || String(b.created_at).localeCompare(String(a.created_at)));
        return res.json({ success: true, data: scored, profile: profile || null });
    } catch (err) {
        console.error('[Kantin products GET]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal memuat produk Kantin ku.' });
    }
});

router.get('/profile', authenticate, (req, res) => {
    if (!ensureStudent(req, res)) return;
    const db = getDB();
    const profile = db.prepare('SELECT * FROM kantin_profiles WHERE user_id = ?').get(req.user.sub);
    return res.json({ success: true, data: profile || {
        user_id: req.user.sub,
        nisn: req.user.nisn || null,
        selling_focus: '',
        payment_methods: '',
        target_market: '',
        hobbies: '',
        preferences: ''
    } });
});

router.put('/profile', authenticate, (req, res) => {
    if (!ensureStudent(req, res)) return;
    const db = getDB();
    const payload = {
        user_id: req.user.sub,
        nisn: req.user.nisn || null,
        selling_focus: cleanList(req.body.selling_focus, 240),
        payment_methods: cleanList(req.body.payment_methods, 240),
        target_market: cleanList(req.body.target_market, 240),
        hobbies: cleanList(req.body.hobbies, 240),
        preferences: cleanList(req.body.preferences, 240),
        now: nowISO()
    };
    db.prepare(`
        INSERT INTO kantin_profiles
        (user_id,nisn,selling_focus,payment_methods,target_market,hobbies,preferences,created_at,updated_at)
        VALUES (@user_id,@nisn,@selling_focus,@payment_methods,@target_market,@hobbies,@preferences,@now,@now)
        ON CONFLICT(user_id) DO UPDATE SET
            selling_focus = excluded.selling_focus,
            payment_methods = excluded.payment_methods,
            target_market = excluded.target_market,
            hobbies = excluded.hobbies,
            preferences = excluded.preferences,
            updated_at = excluded.updated_at
    `).run(payload);
    return res.json({ success: true, message: 'Profil Kantin ku tersimpan.' });
});

router.post('/products', authenticate, (req, res) => {
    if (!ensureStudent(req, res)) return;
    const db = getDB();
    const name = cleanText(req.body.name, 120);
    const price = Math.max(0, parseInt(req.body.price) || 0);
    const stock = Math.max(0, parseInt(req.body.stock) || 0);
    if (!name || price < 500) {
        return res.status(400).json({ success: false, message: 'Nama produk dan harga minimal Rp500 wajib diisi.' });
    }
    try {
        const id = uuidv4();
        db.prepare(`
            INSERT INTO kantin_products
            (id,seller_id,seller_nisn,name,description,category,tags,price,stock,image_url,chat_contact,emoney_provider,emoney_account,status,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?)
        `).run(
            id,
            req.user.sub,
            req.user.nisn || null,
            name,
            cleanText(req.body.description, 700),
            cleanText(req.body.category, 80),
            cleanText(req.body.tags, 240),
            price,
            stock,
            cleanUrl(req.body.image_url),
            cleanText(req.body.chat_contact, 30),
            cleanText(req.body.emoney_provider, 40),
            cleanText(req.body.emoney_account, 80),
            nowISO(),
            nowISO()
        );
        return res.status(201).json({ success: true, message: 'Produk berhasil diterbitkan.', data: { id } });
    } catch (err) {
        console.error('[Kantin product POST]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal menerbitkan produk.' });
    }
});

router.put('/products/:id', authenticate, (req, res) => {
    if (!ensureStudent(req, res)) return;
    const db = getDB();
    const existing = db.prepare('SELECT * FROM kantin_products WHERE id = ? AND seller_id = ?').get(req.params.id, req.user.sub);
    if (!existing) return res.status(404).json({ success: false, message: 'Produk tidak ditemukan di dashboard pedagangmu.' });
    const name = cleanText(req.body.name, 120);
    const price = Math.max(0, parseInt(req.body.price) || 0);
    if (!name || price < 500) return res.status(400).json({ success: false, message: 'Nama produk dan harga minimal Rp500 wajib diisi.' });
    db.prepare(`
        UPDATE kantin_products SET
            name = ?, description = ?, category = ?, tags = ?, price = ?, stock = ?,
            image_url = ?, chat_contact = ?, emoney_provider = ?, emoney_account = ?,
            status = ?, updated_at = ?
        WHERE id = ? AND seller_id = ?
    `).run(
        name,
        cleanText(req.body.description, 700),
        cleanText(req.body.category, 80),
        cleanText(req.body.tags, 240),
        price,
        Math.max(0, parseInt(req.body.stock) || 0),
        cleanUrl(req.body.image_url),
        cleanText(req.body.chat_contact, 30),
        cleanText(req.body.emoney_provider, 40),
        cleanText(req.body.emoney_account, 80),
        ['active','paused','sold_out'].includes(req.body.status) ? req.body.status : 'active',
        nowISO(),
        req.params.id,
        req.user.sub
    );
    return res.json({ success: true, message: 'Produk berhasil diperbarui.' });
});

router.delete('/products/:id', authenticate, (req, res) => {
    if (!ensureStudent(req, res)) return;
    const db = getDB();
    const info = db.prepare("UPDATE kantin_products SET status = 'archived', updated_at = ? WHERE id = ? AND seller_id = ?")
        .run(nowISO(), req.params.id, req.user.sub);
    if (!info.changes) return res.status(404).json({ success: false, message: 'Produk tidak ditemukan di dashboard pedagangmu.' });
    return res.json({ success: true, message: 'Produk diarsipkan.' });
});

router.get('/seller/dashboard', authenticate, (req, res) => {
    if (!ensureStudent(req, res)) return;
    const db = getDB();
    try {
        const products = db.prepare(`
            SELECT * FROM kantin_products
            WHERE seller_id = ? AND status != 'archived'
            ORDER BY created_at DESC
            LIMIT 100
        `).all(req.user.sub);
        const orders = db.prepare(`
            SELECT o.*, p.name as product_name, p.image_url, buyer.nama_lengkap as buyer_name
            FROM kantin_orders o
            JOIN kantin_products p ON p.id = o.product_id
            JOIN users buyer ON buyer.id = o.buyer_id
            WHERE o.seller_id = ?
            ORDER BY o.created_at DESC
            LIMIT 100
        `).all(req.user.sub);
        const stats = {
            total_products: products.length,
            active_products: products.filter(p => p.status === 'active').length,
            total_orders: orders.length,
            gross_profit: orders.reduce((sum, row) => sum + Number(row.total_price || 0), 0),
            pending_orders: orders.filter(row => row.status === 'pending').length
        };
        return res.json({ success: true, data: { products, orders, stats } });
    } catch (err) {
        console.error('[Kantin seller dashboard]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal memuat dashboard pedagang.' });
    }
});

router.post('/products/:id/order', authenticate, (req, res) => {
    if (!ensureStudent(req, res)) return;
    const db = getDB();
    const quantity = Math.max(1, Math.min(parseInt(req.body.quantity) || 1, 99));
    const payment = PAYMENT_METHODS.includes(req.body.payment_method) ? req.body.payment_method : 'e-money';
    try {
        const product = db.prepare(`
            SELECT * FROM kantin_products WHERE id = ? AND status = 'active'
        `).get(req.params.id);
        if (!product) return res.status(404).json({ success: false, message: 'Produk tidak ditemukan.' });
        if (product.seller_id === req.user.sub) {
            return res.status(400).json({ success: false, message: 'Kamu tidak bisa memesan produk sendiri.' });
        }
        if (product.stock < quantity) {
            return res.status(400).json({ success: false, message: 'Stok produk tidak cukup.' });
        }

        const id = uuidv4();
        const total = product.price * quantity;
        const tx = db.transaction(() => {
            db.prepare(`
                INSERT INTO kantin_orders
                (id,product_id,buyer_id,buyer_nisn,seller_id,quantity,total_price,note,payment_method,payment_reference,status,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?, 'pending', ?, ?)
            `).run(
                id, product.id, req.user.sub, req.user.nisn || null, product.seller_id,
                quantity, total, cleanText(req.body.note, 400), payment,
                cleanText(req.body.payment_reference, 120), nowISO(), nowISO()
            );
            db.prepare('UPDATE kantin_products SET stock = stock - ?, updated_at = ? WHERE id = ?')
                .run(quantity, nowISO(), product.id);
        });
        tx();
        return res.status(201).json({ success: true, message: 'Pesanan dibuat. Hubungi penjual untuk konfirmasi pembayaran.', data: { id, total_price: total } });
    } catch (err) {
        console.error('[Kantin order POST]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal membuat pesanan.' });
    }
});

router.get('/orders', authenticate, (req, res) => {
    if (!ensureStudent(req, res)) return;
    const db = getDB();
    try {
        const rows = db.prepare(`
            SELECT o.*, p.name as product_name, p.image_url,
                   buyer.nama_lengkap as buyer_name, seller.nama_lengkap as seller_name
            FROM kantin_orders o
            JOIN kantin_products p ON p.id = o.product_id
            JOIN users buyer ON buyer.id = o.buyer_id
            JOIN users seller ON seller.id = o.seller_id
            WHERE o.buyer_id = ? OR o.seller_id = ?
            ORDER BY o.created_at DESC
            LIMIT 80
        `).all(req.user.sub, req.user.sub);
        const chatStmt = db.prepare(`
            SELECT kc.id, kc.message, kc.created_at, kc.sender_id, u.nama_lengkap as sender_name
            FROM kantin_chats kc
            JOIN users u ON u.id = kc.sender_id
            WHERE kc.order_id = ?
            ORDER BY kc.created_at DESC
            LIMIT 5
        `);
        return res.json({
            success: true,
            data: rows.map(row => ({
                ...row,
                chats: chatStmt.all(row.id).reverse()
            }))
        });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Gagal memuat pesanan.' });
    }
});

router.post('/orders/:id/chat', authenticate, (req, res) => {
    if (!ensureStudent(req, res)) return;
    const db = getDB();
    const message = cleanText(req.body.message, 700);
    if (!message) return res.status(400).json({ success: false, message: 'Pesan tidak boleh kosong.' });
    try {
        const order = db.prepare('SELECT * FROM kantin_orders WHERE id = ?').get(req.params.id);
        if (!order || ![order.buyer_id, order.seller_id].includes(req.user.sub)) {
            return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
        }
        const receiverId = req.user.sub === order.buyer_id ? order.seller_id : order.buyer_id;
        const id = uuidv4();
        db.prepare(`
            INSERT INTO kantin_chats (id,order_id,product_id,sender_id,receiver_id,message,created_at)
            VALUES (?,?,?,?,?,?,?)
        `).run(id, order.id, order.product_id, req.user.sub, receiverId, message, nowISO());
        return res.status(201).json({ success: true, message: 'Pesan terkirim.', data: { id } });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Gagal mengirim chat.' });
    }
});

module.exports = router;
