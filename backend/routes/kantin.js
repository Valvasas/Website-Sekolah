// routes/kantin.js — marketplace siswa: produk, pesanan, dan chat ringan
'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { authenticate } = require('../middleware/auth');
const getDB = require('../config/database');
const { log } = require('../middleware/auditLog');

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
const weekStartISO = () => {
    const date = new Date();
    const day = date.getDay() || 7;
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - day + 1);
    return date.toISOString();
};

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

function getProductReviewStats(db, ids = []) {
    if (!ids.length) return {};
    const placeholders = ids.map(() => '?').join(',');
    return db.prepare(`
        SELECT product_id, ROUND(AVG(rating), 2) as avg_rating, COUNT(*) as review_count
        FROM kantin_reviews
        WHERE product_id IN (${placeholders})
        GROUP BY product_id
    `).all(...ids).reduce((map, row) => {
        map[row.product_id] = row;
        return map;
    }, {});
}

function getWeeklyAchievements(db) {
    const weekStart = weekStartISO();
    const achievements = {};
    function add(productId, badge) {
        if (!productId) return;
        if (!achievements[productId]) achievements[productId] = [];
        achievements[productId].push(badge);
    }
    const categoryRows = db.prepare(`
        SELECT p.id, p.category, SUM(o.quantity) as sold
        FROM kantin_orders o
        JOIN kantin_products p ON p.id = o.product_id
        WHERE o.created_at >= ? AND p.category IN ('snack','minuman','makanan')
        GROUP BY p.id, p.category
        ORDER BY p.category ASC, sold DESC
    `).all(weekStart);
    ['snack','minuman','makanan'].forEach(category => {
        const top = categoryRows.find(row => row.category === category);
        if (top) add(top.id, {
            type: `${category}_terlaris`,
            label: `${category.charAt(0).toUpperCase() + category.slice(1)} terlaris minggu ini`,
            icon: category === 'minuman' ? 'fa-mug-saucer' : 'fa-trophy'
        });
    });
    const topSeller = db.prepare(`
        SELECT p.id, o.seller_id, SUM(o.total_price) as revenue
        FROM kantin_orders o
        JOIN kantin_products p ON p.id = o.product_id
        WHERE o.created_at >= ?
        GROUP BY o.seller_id
        ORDER BY revenue DESC
        LIMIT 1
    `).get(weekStart);
    if (topSeller) add(topSeller.id, { type:'top_seller', label:'Pedagang omzet tertinggi minggu ini', icon:'fa-crown' });
    const topReview = db.prepare(`
        SELECT p.id, AVG(r.rating) as avg_rating, COUNT(*) as total_review
        FROM kantin_reviews r
        JOIN kantin_products p ON p.id = r.product_id
        WHERE r.created_at >= ?
        GROUP BY p.id
        HAVING total_review >= 2
        ORDER BY avg_rating DESC, total_review DESC
        LIMIT 1
    `).get(weekStart);
    if (topReview) add(topReview.id, { type:'top_review', label:'Review tertinggi minggu ini', icon:'fa-star' });
    return achievements;
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
        const reviewStats = getProductReviewStats(db, rows.map(row => row.id));
        const achievements = getWeeklyAchievements(db);
        const scored = rows
            .map(row => ({
                ...row,
                avg_rating: reviewStats[row.id]?.avg_rating || 0,
                review_count: reviewStats[row.id]?.review_count || 0,
                achievements: achievements[row.id] || [],
                preference_score: scoreProductForProfile(row, profile)
            }))
            .sort((a, b) => ((b.achievements?.length || 0) - (a.achievements?.length || 0)) || (b.preference_score - a.preference_score) || String(b.created_at).localeCompare(String(a.created_at)));
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

router.get('/products/:id', authenticate, (req, res) => {
    if (!ensureStudent(req, res)) return;
    const db = getDB();
    try {
        const product = db.prepare(`
            SELECT p.*, u.nama_lengkap as seller_name, sp.kelas as seller_class, kp.selling_focus,
                   kp.payment_methods, kp.target_market, kp.hobbies, kp.preferences
            FROM kantin_products p
            JOIN users u ON u.id = p.seller_id
            LEFT JOIN siswa_profil sp ON sp.nisn = p.seller_nisn
            LEFT JOIN kantin_profiles kp ON kp.user_id = p.seller_id
            WHERE p.id = ? AND p.status != 'archived'
        `).get(req.params.id);
        if (!product) return res.status(404).json({ success: false, message: 'Produk tidak ditemukan.' });
        const stats = getProductReviewStats(db, [product.id])[product.id] || { avg_rating: 0, review_count: 0 };
        const achievements = getWeeklyAchievements(db)[product.id] || [];
        const reviews = db.prepare(`
            SELECT r.id, r.rating, r.comment, r.created_at, u.nama_lengkap as reviewer_name, sp.kelas as reviewer_class
            FROM kantin_reviews r
            JOIN users u ON u.id = r.reviewer_id
            LEFT JOIN siswa_profil sp ON sp.nisn = r.reviewer_nisn
            WHERE r.product_id = ?
            ORDER BY r.created_at DESC
            LIMIT 30
        `).all(product.id);
        const sellerProducts = db.prepare(`
            SELECT p.*, COALESCE(AVG(r.rating), 0) as avg_rating, COUNT(r.id) as review_count
            FROM kantin_products p
            LEFT JOIN kantin_reviews r ON r.product_id = p.id
            WHERE p.seller_id = ? AND p.status = 'active'
            GROUP BY p.id
            ORDER BY p.created_at DESC
            LIMIT 12
        `).all(product.seller_id);
        const sellerAchievementCount = db.prepare(`
            SELECT COUNT(*) as c FROM kantin_reviews
            WHERE seller_id = ? AND rating >= 4
        `).get(product.seller_id).c || 0;
        return res.json({
            success: true,
            data: {
                product: { ...product, avg_rating: stats.avg_rating || 0, review_count: stats.review_count || 0, achievements },
                seller: {
                    id: product.seller_id,
                    name: product.seller_name,
                    class: product.seller_class,
                    selling_focus: product.selling_focus,
                    payment_methods: product.payment_methods,
                    target_market: product.target_market,
                    achievement_count: sellerAchievementCount
                },
                seller_products: sellerProducts,
                reviews,
                can_review: Boolean(db.prepare('SELECT id FROM kantin_orders WHERE product_id = ? AND buyer_id = ? LIMIT 1').get(product.id, req.user.sub))
            }
        });
    } catch (err) {
        console.error('[Kantin product detail]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal memuat detail produk.' });
    }
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

router.post('/products/:id/reviews', authenticate, (req, res) => {
    if (!ensureStudent(req, res)) return;
    const db = getDB();
    const rating = Math.max(1, Math.min(5, parseInt(req.body.rating) || 0));
    const comment = cleanText(req.body.comment, 500);
    if (!rating) return res.status(400).json({ success: false, message: 'Rating wajib 1 sampai 5 bintang.' });
    try {
        const product = db.prepare('SELECT * FROM kantin_products WHERE id = ? AND status != ?').get(req.params.id, 'archived');
        if (!product) return res.status(404).json({ success: false, message: 'Produk tidak ditemukan.' });
        if (product.seller_id === req.user.sub) return res.status(400).json({ success: false, message: 'Tidak bisa memberi review pada produk sendiri.' });
        const ordered = db.prepare('SELECT id FROM kantin_orders WHERE product_id = ? AND buyer_id = ? LIMIT 1').get(product.id, req.user.sub);
        if (!ordered) return res.status(403).json({ success: false, message: 'Review hanya bisa diberikan setelah kamu pernah memesan produk ini.' });
        const existing = db.prepare('SELECT * FROM kantin_reviews WHERE product_id = ? AND reviewer_id = ?').get(product.id, req.user.sub);
        if (existing && Date.now() - new Date(existing.updated_at || existing.created_at).getTime() < 10 * 60 * 1000) {
            return res.status(429).json({ success: false, message: 'Tunggu beberapa menit sebelum mengubah review lagi.' });
        }
        if (existing) {
            db.prepare(`
                UPDATE kantin_reviews SET rating = ?, comment = ?, updated_at = ?
                WHERE product_id = ? AND reviewer_id = ?
            `).run(rating, comment, nowISO(), product.id, req.user.sub);
            return res.json({ success: true, message: 'Review produk diperbarui.' });
        }
        db.prepare(`
            INSERT INTO kantin_reviews
            (id,product_id,seller_id,reviewer_id,reviewer_nisn,rating,comment,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?)
        `).run(uuidv4(), product.id, product.seller_id, req.user.sub, req.user.nisn || null, rating, comment, nowISO(), nowISO());
        return res.status(201).json({ success: true, message: 'Review produk terkirim.' });
    } catch (err) {
        console.error('[Kantin review POST]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal menyimpan review.' });
    }
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
            SELECT o.*, p.name as product_name, p.image_url, buyer.nama_lengkap as buyer_name,
                   sp.kelas as buyer_class
            FROM kantin_orders o
            JOIN kantin_products p ON p.id = o.product_id
            JOIN users buyer ON buyer.id = o.buyer_id
            LEFT JOIN siswa_profil sp ON sp.nisn = o.buyer_nisn
            WHERE o.seller_id = ?
            ORDER BY o.created_at DESC
            LIMIT 100
        `).all(req.user.sub);
        const stats = {
            total_products: products.length,
            active_products: products.filter(p => p.status === 'active').length,
            total_orders: orders.length,
            gross_profit: orders
                .filter(row => String(row.status || '').toLowerCase() !== 'cancelled')
                .reduce((sum, row) => sum + Number(row.total_price || 0), 0),
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
            SELECT kc.id, kc.message, kc.attachment_url, kc.attachment_name, kc.attachment_type, kc.created_at, kc.sender_id, u.nama_lengkap as sender_name
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

router.patch('/orders/:id/status', authenticate, (req, res) => {
    if (!ensureStudent(req, res)) return;
    const db = getDB();
    const status = String(req.body.status || '').toLowerCase();
    if (!['completed', 'cancelled'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Status pesanan tidak valid.' });
    }

    try {
        const order = db.prepare(`
            SELECT o.*, p.name as product_name
            FROM kantin_orders o
            JOIN kantin_products p ON p.id = o.product_id
            WHERE o.id = ?
        `).get(req.params.id);
        if (!order || order.seller_id !== req.user.sub) {
            return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan di dashboard pedagangmu.' });
        }
        if (['completed', 'cancelled'].includes(String(order.status || '').toLowerCase())) {
            return res.status(409).json({ success: false, message: 'Pesanan ini sudah final dan tidak bisa diubah lagi.' });
        }

        const tx = db.transaction(() => {
            db.prepare('UPDATE kantin_orders SET status = ?, updated_at = ? WHERE id = ?')
                .run(status, nowISO(), order.id);
            if (status === 'cancelled') {
                db.prepare('UPDATE kantin_products SET stock = stock + ?, updated_at = ? WHERE id = ?')
                    .run(order.quantity || 1, nowISO(), order.product_id);
            }

            const notifTitle = status === 'completed' ? 'Pesanan Kantin selesai' : 'Pesanan Kantin dibatalkan';
            const notifMsg = status === 'completed'
                ? `Pesanan ${order.product_name} sudah ditandai selesai oleh penjual.`
                : `Pesanan ${order.product_name} dibatalkan oleh penjual. Stok dikembalikan.`;
            db.prepare(`
                INSERT INTO notifikasi (id,user_id,judul,pesan,tipe,is_read,link,created_at)
                VALUES (?,?,?,?,?,0,?,?)
            `).run(uuidv4(), order.buyer_id, notifTitle, notifMsg, status === 'completed' ? 'success' : 'warning', '/LMS.html#kantin', nowISO());

            db.prepare(`
                INSERT INTO kantin_chats
                (id,order_id,product_id,sender_id,receiver_id,message,attachment_url,attachment_name,attachment_type,created_at)
                VALUES (?,?,?,?,?,?,?,?,?,?)
            `).run(
                uuidv4(),
                order.id,
                order.product_id,
                req.user.sub,
                order.buyer_id,
                notifMsg,
                null,
                null,
                null,
                nowISO()
            );
        });
        tx();

        log(
            req.user.sub,
            status === 'completed' ? 'KANTIN_ORDER_COMPLETED' : 'KANTIN_ORDER_CANCELLED',
            'kantin_orders',
            order.id,
            { product_id: order.product_id, product_name: order.product_name, buyer_id: order.buyer_id, quantity: order.quantity, total_price: order.total_price },
            req.ip
        );

        return res.json({
            success: true,
            message: status === 'completed' ? 'Pesanan ditandai selesai.' : 'Pesanan dibatalkan dan stok dikembalikan.',
            data: { id: order.id, status }
        });
    } catch (err) {
        console.error('[Kantin order status PATCH]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal memperbarui status pesanan.' });
    }
});

router.get('/orders/:id/chat', authenticate, (req, res) => {
    if (!ensureStudent(req, res)) return;
    const db = getDB();
    try {
        const order = db.prepare(`
            SELECT o.*, p.name as product_name, p.image_url,
                   buyer.nama_lengkap as buyer_name, seller.nama_lengkap as seller_name
            FROM kantin_orders o
            JOIN kantin_products p ON p.id = o.product_id
            JOIN users buyer ON buyer.id = o.buyer_id
            JOIN users seller ON seller.id = o.seller_id
            WHERE o.id = ?
        `).get(req.params.id);
        if (!order || ![order.buyer_id, order.seller_id].includes(req.user.sub)) {
            return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
        }
        const chats = db.prepare(`
            SELECT kc.id, kc.message, kc.attachment_url, kc.attachment_name, kc.attachment_type,
                   kc.created_at, kc.sender_id, u.nama_lengkap as sender_name
            FROM kantin_chats kc
            JOIN users u ON u.id = kc.sender_id
            WHERE kc.order_id = ?
            ORDER BY kc.created_at ASC
            LIMIT 200
        `).all(order.id);
        return res.json({ success: true, data: { order, chats, current_user_id: req.user.sub } });
    } catch (err) {
        console.error('[Kantin chat GET]', err.message);
        return res.status(500).json({ success: false, message: 'Gagal memuat room chat.' });
    }
});

router.post('/orders/:id/chat', authenticate, (req, res) => {
    if (!ensureStudent(req, res)) return;
    const db = getDB();
    const message = cleanText(req.body.message, 700);
    const attachmentUrl = cleanUrl(req.body.attachment_url);
    if (!message && !attachmentUrl) return res.status(400).json({ success: false, message: 'Pesan atau lampiran wajib diisi.' });
    try {
        const order = db.prepare('SELECT * FROM kantin_orders WHERE id = ?').get(req.params.id);
        if (!order || ![order.buyer_id, order.seller_id].includes(req.user.sub)) {
            return res.status(404).json({ success: false, message: 'Pesanan tidak ditemukan.' });
        }
        const receiverId = req.user.sub === order.buyer_id ? order.seller_id : order.buyer_id;
        const id = uuidv4();
        db.prepare(`
            INSERT INTO kantin_chats
            (id,order_id,product_id,sender_id,receiver_id,message,attachment_url,attachment_name,attachment_type,created_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)
        `).run(
            id,
            order.id,
            order.product_id,
            req.user.sub,
            receiverId,
            message || '',
            attachmentUrl,
            cleanText(req.body.attachment_name, 180),
            cleanText(req.body.attachment_type, 80),
            nowISO()
        );
        return res.status(201).json({ success: true, message: 'Pesan terkirim.', data: { id } });
    } catch (err) {
        return res.status(500).json({ success: false, message: 'Gagal mengirim chat.' });
    }
});

module.exports = router;
