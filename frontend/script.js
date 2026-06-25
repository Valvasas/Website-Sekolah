/* Global public website interactions */
(function() {
    const hidePageLoader = () => {
        const loader = document.getElementById('page-loader');
        if (!loader || loader.classList.contains('loaded')) return;
        loader.classList.add('loaded');
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            window.setTimeout(hidePageLoader, 350);
        }, { once: true });
    } else {
        window.setTimeout(hidePageLoader, 350);
    }

    window.addEventListener('load', () => {
        window.setTimeout(hidePageLoader, 150);
    }, { once: true });

    window.setTimeout(hidePageLoader, 2500);
})();

document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
        window.closeNewsArticle?.();
    }
});


/* ── Fetch ticker bar dari API backend ── */
(function fetchTicker() {
    const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3001' : '';
    if (!document.querySelector('.ticker-inner')) return;

    function createTickerItem(text) {
        const item = document.createElement('span');
        item.className = 'ticker-item';

        const icon = document.createElement('i');
        icon.className = 'fas fa-circle';

        item.append(icon, document.createTextNode(` ${String(text || '').trim()}`));
        return item;
    }

    function createTickerSep() {
        const sep = document.createElement('span');
        sep.className = 'ticker-sep';
        sep.textContent = '|';
        return sep;
    }

    fetch(API_BASE + '/api/content/announcements')
        .then(r => r.ok ? r.json() : null)
        .then(json => {
            if (!json || !json.success || !json.data.length) return;
            const inner = document.querySelector('.ticker-inner');
            if (!inner) return;
            const label = inner.querySelector('.ticker-label');
            const fragment = document.createDocumentFragment();

            if (label) fragment.appendChild(label.cloneNode(true));

            json.data.forEach((a) => {
                const text = a && typeof a.isi === 'string' ? a.isi : '';
                if (!text.trim()) return;
                fragment.appendChild(createTickerItem(text));
                fragment.appendChild(createTickerSep());
                fragment.appendChild(createTickerItem(text));
                fragment.appendChild(createTickerSep());
            });

            inner.replaceChildren(fragment);
        })
        .catch(() => { /* pakai konten statis jika backend offline */ });
})();

/* ── Konten dinamis dari dashboard admin ── */
(function hydrateWebsiteContent() {
    const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3001' : '';
    const fallbackHomeNews = [
        {
            id: 'fallback-ppdb',
            title: 'PPDB dan Layanan Digital Sekolah',
            category: 'Pengumuman',
            excerpt: 'Informasi pendaftaran, layanan siswa, dan pembaruan agenda sekolah tersedia melalui portal digital.',
            body: 'Admin dapat mengganti feed ini dari Panel Admin melalui Konten Website dengan tipe Berita Sekolah dan placement home.',
            image_url: 'asset/Galeri.jpg',
            link_url: 'ppdb.html'
        },
        {
            id: 'fallback-lms',
            title: 'LMS Terintegrasi untuk Siswa',
            category: 'Akademik',
            excerpt: 'Materi, tugas, nilai, forum, dan layanan siswa dirapikan dalam satu dashboard.',
            body: 'LMS membantu siswa mengakses materi dan tugas tanpa perlu berpindah platform terlalu banyak.',
            image_url: 'asset/siswa akademik.jpg',
            link_url: 'LMS.html'
        },
        {
            id: 'fallback-prestasi',
            title: 'Ruang Prestasi dan Kegiatan Sekolah',
            category: 'Kesiswaan',
            excerpt: 'Berita prestasi, kegiatan jurusan, dan agenda sekolah bisa tampil sebagai feed artikel.',
            body: 'Gunakan konten dinamis admin untuk menambah banyak informasi tanpa membuat halaman beranda menumpuk.',
            image_url: 'asset/prestasi.jpg',
            link_url: 'kesiswaan.html'
        }
    ];

    function escapeSiteHtml(value) {
        return String(value || '').replace(/[&<>"']/g, c => ({
            '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
        }[c]));
    }

    function safeImageUrl(value, fallback) {
        const url = String(value || '').trim();
        if (!url) return fallback;
        if (/^(https?:\/\/|\/uploads\/|uploads\/|asset\/)/i.test(url)) return url;
        return fallback;
    }

    function safeLinkUrl(value) {
        const url = String(value || '').trim();
        if (/^(https?:\/\/|\/|[a-z0-9\-]+\.html)/i.test(url)) return url;
        return '';
    }

    async function getWebsiteContent(params) {
        const query = new URLSearchParams(params);
        const response = await fetch(`${API_BASE}/api/content/website?${query.toString()}`);
        if (!response.ok) return [];
        const json = await response.json();
        return json && json.success && Array.isArray(json.data) ? json.data : [];
    }

    function renderGallery(items) {
        const grid = document.querySelector('.dynamic-gallery');
        if (!grid || !items.length) return;
        grid.innerHTML = items.map(item => {
            const title = escapeSiteHtml(item.title || 'Dokumentasi Sekolah');
            const excerpt = escapeSiteHtml(item.excerpt || item.body || 'Kegiatan SMK Negeri 1 Terisi');
            const category = escapeSiteHtml(item.category || 'umum');
            const image = escapeSiteHtml(safeImageUrl(item.image_url, 'asset/Galeri.jpg'));
            return `
                <div class="gallery-box" data-category="${category}">
                    <img src="${image}" alt="${title}" loading="lazy">
                    <div class="gallery-overlay">
                        <div class="overlay-text">
                            <h4>${title}</h4>
                            <p>${excerpt}</p>
                        </div>
                        <i class="fas fa-search-plus"></i>
                    </div>
                </div>
            `;
        }).join('');
        if (typeof window.refreshGalleryFilters === 'function') window.refreshGalleryFilters();
    }

    function renderPpdbInfo(items) {
        const container = document.querySelector('.info-cards');
        if (!container || !items.length) return;
        container.innerHTML = items.slice(0, 4).map(item => {
            const icon = String(item.icon || 'fa-circle-info').replace(/[^a-z0-9\-\s]/gi, '').trim() || 'fa-circle-info';
            return `
                <div class="info-card">
                    <i class="fas ${escapeSiteHtml(icon)}"></i>
                    <h4>${escapeSiteHtml(item.title)}</h4>
                    <p>${escapeSiteHtml(item.excerpt || item.body || '')}</p>
                </div>
            `;
        }).join('');
    }

    function renderHomeNews(items) {
        const rows = Array.isArray(items) && items.length ? items : fallbackHomeNews;
        if (document.getElementById('berita-sekolah')) return;
        const portal = document.getElementById('portal-layanan');
        const anchor = portal?.nextSibling || document.getElementById('kontak') || document.querySelector('footer');
        if (!anchor) return;
        window.__schoolNewsItems = rows.slice(0, 12);
        const section = document.createElement('section');
        section.className = 'section bg-light school-news-section';
        section.id = 'berita-sekolah';
        section.innerHTML = `
            <div class="container">
                <div class="section-header center reveal active">
                    <h4 class="sub-title">Berita Sekolah</h4>
                    <h2>Informasi Terbaru</h2>
                    <div class="line"></div>
                </div>
                <div class="news-slider-shell">
                    <button class="news-slide-btn prev" type="button" aria-label="Berita sebelumnya" onclick="slideHomeNews(-1)"><i class="fas fa-chevron-left"></i></button>
                    <div class="news-slider" id="home-news-slider">
                    ${window.__schoolNewsItems.map((item, index) => {
                        const image = escapeSiteHtml(safeImageUrl(item.image_url, 'asset/Galeri.jpg'));
                        const link = safeLinkUrl(item.link_url);
                        return `
                            <article class="news-card">
                                <img src="${image}" alt="${escapeSiteHtml(item.title)}" loading="lazy">
                                <div class="news-card-body">
                                    <span>${escapeSiteHtml(item.category || 'Informasi')}</span>
                                    <h3>${escapeSiteHtml(item.title)}</h3>
                                    <p>${escapeSiteHtml(item.excerpt || item.body || '')}</p>
                                    <div class="news-actions">
                                        <button class="news-link news-open" type="button" onclick="openNewsArticle(${index})">Baca artikel <i class="fas fa-arrow-right"></i></button>
                                        ${link ? `<a href="${escapeSiteHtml(link)}" class="news-link">Buka halaman</a>` : ''}
                                    </div>
                                </div>
                            </article>
                        `;
                    }).join('')}
                    </div>
                    <button class="news-slide-btn next" type="button" aria-label="Berita berikutnya" onclick="slideHomeNews(1)"><i class="fas fa-chevron-right"></i></button>
                </div>
            </div>
        `;
        if (portal?.parentNode) portal.parentNode.insertBefore(section, portal.nextSibling);
        else anchor.parentNode.insertBefore(section, anchor);
    }

    window.slideHomeNews = function(direction) {
        const slider = document.getElementById('home-news-slider');
        if (!slider) return;
        const card = slider.querySelector('.news-card');
        const step = card ? card.getBoundingClientRect().width + 18 : 320;
        slider.scrollBy({ left: direction * step, behavior: 'smooth' });
    };

    window.openNewsArticle = function(index) {
        const item = (window.__schoolNewsItems || [])[index];
        if (!item) return;
        let modal = document.getElementById('newsArticleModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'newsArticleModal';
            modal.className = 'news-article-modal';
            modal.innerHTML = `
                <div class="news-article-box" role="dialog" aria-modal="true" aria-labelledby="newsArticleTitle">
                    <button class="news-article-close" type="button" aria-label="Tutup artikel" onclick="closeNewsArticle()"><i class="fas fa-times"></i></button>
                    <img id="newsArticleImage" alt="">
                    <div class="news-article-content">
                        <span id="newsArticleCategory"></span>
                        <h3 id="newsArticleTitle"></h3>
                        <p id="newsArticleBody"></p>
                        <a id="newsArticleLink" class="news-link" target="_blank" rel="noopener">Buka halaman terkait <i class="fas fa-arrow-right"></i></a>
                    </div>
                </div>
            `;
            modal.addEventListener('click', event => {
                if (event.target === modal) window.closeNewsArticle();
            });
            document.body.appendChild(modal);
        }
        const image = modal.querySelector('#newsArticleImage');
        image.src = safeImageUrl(item.image_url, 'asset/Galeri.jpg');
        image.alt = item.title || 'Berita sekolah';
        modal.querySelector('#newsArticleCategory').textContent = item.category || 'Informasi';
        modal.querySelector('#newsArticleTitle').textContent = item.title || 'Berita sekolah';
        modal.querySelector('#newsArticleBody').textContent = item.body || item.excerpt || 'Belum ada isi detail.';
        const link = modal.querySelector('#newsArticleLink');
        const href = safeLinkUrl(item.link_url);
        link.style.display = href ? 'inline-flex' : 'none';
        if (href) link.href = href;
        modal.classList.add('open');
        document.body.style.overflow = 'hidden';
    };

    window.closeNewsArticle = function() {
        document.getElementById('newsArticleModal')?.classList.remove('open');
        document.body.style.overflow = '';
    };

    document.addEventListener('DOMContentLoaded', async () => {
        try {
            const jobs = [];
            if (document.querySelector('.dynamic-gallery')) {
                jobs.push(getWebsiteContent({ type:'galeri', placement:'galeri', limit:60 }).then(renderGallery));
            }
            if (document.querySelector('.info-cards')) {
                jobs.push(getWebsiteContent({ type:'ppdb_info', placement:'hero_ppdb', limit:4 }).then(renderPpdbInfo));
            }
            if (document.getElementById('home')) {
                jobs.push(getWebsiteContent({ type:'berita', placement:'home', limit:12 }).then(renderHomeNews));
            }
            await Promise.all(jobs);
        } catch (error) {
            if (document.getElementById('home')) renderHomeNews(fallbackHomeNews);
        }
    });
})();

document.addEventListener('DOMContentLoaded', () => {
    
    const navbar = document.querySelector('.navbar');
    const mobileMenu = document.getElementById('mobile-menu');
    const navMenu = document.querySelector('.nav-menu');

    if (navbar) {
        window.addEventListener('scroll', () => {
            if (window.scrollY > 50) navbar.classList.add('scrolled');
            else navbar.classList.remove('scrolled');
        });
    }

    if (mobileMenu && navMenu) {
        mobileMenu.setAttribute('aria-expanded', 'false');
        mobileMenu.setAttribute('aria-controls', 'primary-navigation');
        navMenu.id = navMenu.id || 'primary-navigation';
        const setMobileMenuOpen = (open) => {
            navMenu.classList.toggle('active', open);
            mobileMenu.classList.toggle('is-active', open);
            mobileMenu.classList.toggle('active', open);
            document.body.classList.toggle('nav-open', open);
            mobileMenu.setAttribute('aria-expanded', open ? 'true' : 'false');
            document.body.style.overflow = open ? 'hidden' : '';
            const bars = mobileMenu.querySelectorAll('.bar');
            if (open) {
                bars[0].style.transform = 'rotate(-45deg) translate(-5px, 6px)';
                bars[1].style.opacity = '0';
                bars[2].style.transform = 'rotate(45deg) translate(-5px, -6px)';
            } else {
                bars[0].style.transform = 'none';
                bars[1].style.opacity = '1';
                bars[2].style.transform = 'none';
            }
        };

        mobileMenu.addEventListener('click', () => {
            setMobileMenuOpen(!navMenu.classList.contains('active'));
        });
        mobileMenu.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                mobileMenu.click();
            }
        });

        navMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => setMobileMenuOpen(false));
        });

        document.addEventListener('click', event => {
            if (!navMenu.classList.contains('active')) return;
            if (navMenu.contains(event.target) || mobileMenu.contains(event.target)) return;
            setMobileMenuOpen(false);
        });

        document.addEventListener('keydown', event => {
            if (event.key !== 'Escape' || !navMenu.classList.contains('active')) return;
            setMobileMenuOpen(false);
            mobileMenu.focus();
        });
    }

    const darkModeToggle = document.getElementById('darkModeToggle');
    const bodyTheme = document.body;

    if (darkModeToggle) {
        const iconTheme = darkModeToggle.querySelector('i');
        
        // 1. Cek memori browser (localStorage) saat halaman pertama kali dimuat
        const currentTheme = localStorage.getItem('theme');
        if (currentTheme === 'dark') {
            bodyTheme.classList.add('dark-theme');
            iconTheme.classList.replace('fa-moon', 'fa-sun'); // Ganti icon jadi matahari
            darkModeToggle.setAttribute('aria-pressed', 'true');
        } else {
            darkModeToggle.setAttribute('aria-pressed', 'false');
        }

        // 2. Beri event pada tombol saat diklik
        darkModeToggle.addEventListener('click', () => {
            bodyTheme.classList.toggle('dark-theme');
            
            // Jika mode gelap aktif
            if (bodyTheme.classList.contains('dark-theme')) {
                localStorage.setItem('theme', 'dark'); // Simpan ke storage
                iconTheme.classList.replace('fa-moon', 'fa-sun');
                darkModeToggle.setAttribute('aria-pressed', 'true');
            } else {
                // Jika mode terang aktif
                localStorage.setItem('theme', 'light'); // Simpan ke storage
                iconTheme.classList.replace('fa-sun', 'fa-moon');
                darkModeToggle.setAttribute('aria-pressed', 'false');
            }
        });
    }

    const reveals = document.querySelectorAll('.reveal');
    const revealOnScroll = () => {
        const windowHeight = window.innerHeight;
        reveals.forEach((reveal) => {
            const elementTop = reveal.getBoundingClientRect().top;
            if (elementTop < windowHeight - 80) reveal.classList.add('active');
        });
    };
    window.addEventListener('scroll', revealOnScroll);
    revealOnScroll(); // Trigger on load

    const heroVideo = document.querySelector('.hero-bg-video');
    if (heroVideo) {
        const canLoadVideo = !navigator.connection?.saveData && !window.matchMedia('(max-width: 768px)').matches;
        if (canLoadVideo) {
            window.setTimeout(() => {
                heroVideo.querySelectorAll('source[data-src]').forEach(source => {
                    source.src = source.dataset.src;
                    source.removeAttribute('data-src');
                });
                heroVideo.load();
                heroVideo.play().catch(() => {});
            }, 1200);
        }
    }

    const counters = document.querySelectorAll('.counter');
    const statsSection = document.getElementById('statistik');
    let hasCounted = false;

    if (statsSection && counters.length > 0) {
        const observer = new IntersectionObserver((entries) => {
            if(entries[0].isIntersecting && !hasCounted) {
                hasCounted = true;
                counters.forEach(counter => {
                    const target = +counter.getAttribute('data-target');
                    const speed = target / 50; 
                    const updateCount = () => {
                        const current = +counter.innerText;
                        if (current < target) {
                            counter.innerText = Math.ceil(current + speed);
                            setTimeout(updateCount, 40);
                        } else {
                            counter.innerText = target;
                        }
                    };
                    updateCount();
                });
            }
        }, { threshold: 0.5 });
        observer.observe(statsSection);
    }

    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    let facilityTimer;
    let currentTab = 0;

    function switchTab(index) {
        tabBtns.forEach(btn => btn.classList.remove('active'));
        tabContents.forEach(content => {
            content.classList.remove('active');
            content.style.opacity = '0';
            content.style.visibility = 'hidden';
        });
        
        if (tabBtns[index] && tabContents[index]) {
            tabBtns[index].classList.add('active');
            tabContents[index].classList.add('active');
            tabContents[index].style.visibility = 'visible';
            setTimeout(() => { tabContents[index].style.opacity = '1'; }, 50);
        }
    }

    function startFacilitySlider() {
        clearInterval(facilityTimer);
        if (window.matchMedia('(max-width: 768px)').matches) return;
        facilityTimer = setInterval(() => {
            currentTab = (currentTab + 1) % tabBtns.length;
            switchTab(currentTab);
        }, 5000); // Ganti tiap 5 detik (waktu yang ideal)
    }

    if (tabBtns.length > 0 && tabContents.length > 0) {
        tabBtns.forEach((btn, index) => {
            btn.addEventListener('click', () => {
                currentTab = index;
                switchTab(currentTab);
                startFacilitySlider(); // Reset timer setelah diklik manual
            });
        });
        startFacilitySlider(); // Jalankan saat pertama kali load
    }

    const eskulBg = document.getElementById('eskul-bg');
    const eskulCard = document.getElementById('eskul-card');
    const eskulTitle = document.getElementById('eskul-title');
    const eskulDesc = document.getElementById('eskul-desc');
    const eskulSection = document.getElementById('eskul');
    
    const allBubbles = document.querySelectorAll('.bubble-item, .bubble-center');

    if (allBubbles.length > 0 && eskulCard) {
        const canHoverEskul = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        
        function updateEskulInfo(element) {
            const bg = element.getAttribute('data-bg');
            const title = element.getAttribute('data-title');
            const desc = element.getAttribute('data-desc');
            
            // Tangkap identifier untuk posisi (cth: 'b1', 'b2')
            const positionClass = element.classList.contains('bubble-center') ? 'bubble-center' : element.classList[1];

            // 1. Ubah Background dan TETAPKAN (Persistent)
            if (bg) {
                eskulBg.style.backgroundImage = `url('${bg}')`;
                eskulSection.classList.add('active-mode');
            }
            
            // 2. Munculkan Teks Card Sesuai Posisi Target
            if (title && desc) {
                eskulTitle.textContent = title;
                eskulDesc.textContent = desc;
                allBubbles.forEach(bubble => {
                    bubble.classList.remove('active');
                    bubble.setAttribute('aria-pressed', 'false');
                });
                element.classList.add('active');
                element.setAttribute('aria-pressed', 'true');
                
                // Setel ulang class untuk reset animasi lalu tambahkan kelas posisinya
                eskulCard.className = `eskul-info-card show ${positionClass}`;
            }
        }

        // Set gambar background awal dari bubble OSIS (Agar tidak blank pertama kali)
        const centerBubble = document.querySelector('.bubble-center');
        if (centerBubble) {
            const defaultBg = centerBubble.getAttribute('data-bg');
            if (defaultBg) eskulBg.style.backgroundImage = `url('${defaultBg}')`;
            updateEskulInfo(centerBubble);
        }

        allBubbles.forEach(bubble => {
            bubble.setAttribute('role', 'button');
            bubble.setAttribute('tabindex', '0');
            bubble.setAttribute('aria-pressed', bubble.classList.contains('active') ? 'true' : 'false');

            // MUNCULKAN Card & Ganti Gambar saat kursor masuk
            bubble.addEventListener('mouseenter', function() {
                if (!canHoverEskul()) return;
                updateEskulInfo(this);
            });
            
            // Di desktop card boleh hilang setelah hover; di layar sentuh card harus persisten.
            bubble.addEventListener('mouseleave', function() {
                if (!canHoverEskul()) return;
                eskulCard.classList.remove('show');
            });

            bubble.addEventListener('click', function() {
                updateEskulInfo(this);
            });

            bubble.addEventListener('keydown', function(event) {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                updateEskulInfo(this);
            });
        });
    }

    function applyGalleryFilter(filterValue) {
        document.querySelectorAll('.gallery-box').forEach(item => {
            const itemCategory = item.getAttribute('data-category');
            if (filterValue === 'all' || filterValue === itemCategory) item.classList.remove('hide');
            else item.classList.add('hide');
        });
    }

    window.refreshGalleryFilters = function() {
        const filterBtns = document.querySelectorAll('.filter-btn');
        const galleryItems = document.querySelectorAll('.gallery-box');
        if (!filterBtns.length || !galleryItems.length) return;
        filterBtns.forEach(btn => {
            if (btn.dataset.bound === '1') return;
            btn.dataset.bound = '1';
            btn.addEventListener('click', () => {
                filterBtns.forEach(button => button.classList.remove('active'));
                btn.classList.add('active');
                applyGalleryFilter(btn.getAttribute('data-filter') || 'all');
            });
        });
        const active = document.querySelector('.filter-btn.active');
        applyGalleryFilter(active ? active.getAttribute('data-filter') || 'all' : 'all');
    };
    window.refreshGalleryFilters();

    // --- 7. JURUSAN ACCORDION (TOGGLE CLASS .ACTIVE) ---
    const jurusanCards = document.querySelectorAll('.j-card');
    const isMobile = () => window.innerWidth <= 992;
    
    if (jurusanCards.length > 0) {
        jurusanCards.forEach(card => {
            card.addEventListener('click', (event) => {
                if (!isMobile()) return;
                if (event.target.closest('a, button')) return;

                const isActive = card.classList.contains('active');
                jurusanCards.forEach(otherCard => otherCard.classList.remove('active'));

                if (!isActive) {
                    card.classList.add('active');
                    setTimeout(() => {
                        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }, 100);
                }
            });
        });

        if (isMobile()) jurusanCards[0].classList.add('active');

        window.addEventListener('resize', () => {
            if (!isMobile()) {
                jurusanCards.forEach(card => card.classList.remove('active'));
                return;
            }

            if (!document.querySelector('.j-card.active')) {
                jurusanCards[0].classList.add('active');
            }
        });
    }

    // --- 8. LOGIN MODAL LEGACY: redirect ke flow login yang benar-benar aktif ---
    (function initLoginModal() {
        const loginModal = document.getElementById('loginModal');
        if (!loginModal) return;

        const openLoginButtons = document.querySelectorAll('[data-open-login], .open-login, #openLoginBtn');
        const closeLoginBtn = document.getElementById('closeLoginBtn');
        const openLoginModal = (event) => {
            if (event) event.preventDefault();
            loginModal.classList.add('active');
            loginModal.setAttribute('aria-hidden', 'false');
            document.body.style.overflow = 'hidden';
            loginModal.querySelector('input, a, button')?.focus();
        };
        const closeLoginModal = () => {
            loginModal.classList.remove('active');
            loginModal.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
        };

        openLoginButtons.forEach(button => button.addEventListener('click', openLoginModal));
        closeLoginBtn?.addEventListener('click', closeLoginModal);
        loginModal.addEventListener('click', (event) => {
            if (event.target === loginModal) closeLoginModal();
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && loginModal.classList.contains('active')) closeLoginModal();
        });

        document.querySelectorAll('.login-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const targetId = tab.dataset.target;
                if (!targetId) return;
                if (targetId === 'form-guru') {
                    window.location.href = '/admin-panel/login.html';
                    return;
                }
                document.querySelectorAll('.login-tab').forEach(item => item.classList.remove('active'));
                document.querySelectorAll('.login-form').forEach(form => form.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(targetId)?.classList.add('active');
            });
        });

        document.querySelectorAll('.login-form').forEach(form => {
            form.addEventListener('submit', (event) => {
                event.preventDefault();
                if (form.id === 'form-guru') {
                    window.location.href = '/admin-panel/login.html';
                    return;
                }
                window.location.href = '/login.html';
            });
        });
    })();

    // --- 9. PUSAT LAYANAN DIGITAL - MODAL SKL ---
    const sklCard = document.getElementById('skl-card');
    const sklModal = document.getElementById('sklModal');
    const sklBox = sklModal ? sklModal.querySelector('.skl-modal-box') : null;

    if (sklCard && sklModal) {
        sklCard.addEventListener('click', (e) => {
            e.preventDefault();
            sklModal.style.opacity = '1';
            sklModal.style.visibility = 'visible';
            sklModal.setAttribute('aria-hidden', 'false');
            if (sklBox) sklBox.style.transform = 'translateY(0)';
            document.body.style.overflow = 'hidden';
            window.setTimeout(() => {
                sklModal.querySelector('#sklNisn, input')?.focus();
            }, 80);
        });

        // Tutup modal saat klik overlay
        sklModal.addEventListener('click', (e) => {
            if (e.target === sklModal) closeSklModal();
        });

        // Tutup dengan Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeSklModal();
        });
    }

    // Fungsi untuk menutup SKL Modal
    window.closeSklModal = function() {
        if (!sklModal || !sklBox) return;
        sklModal.style.opacity = '0';
        sklModal.style.visibility = 'hidden';
        sklModal.setAttribute('aria-hidden', 'true');
        sklBox.style.transform = 'translateY(-40px)';
        document.body.style.overflow = '';
    };

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
        }[char]));
    }

    function setSklMessage(message, type = 'error') {
        const messageEl = document.getElementById('sklInlineMessage');
        if (!messageEl) return;
        messageEl.textContent = message;
        messageEl.classList.toggle('success', type === 'success');
    }

    function resetSklButton(btn) {
        if (!btn) return;
        btn.innerHTML = '<i class="fas fa-search"></i> Cari & Unduh SKL';
        btn.disabled = false;
        btn.style.background = '';
        btn.style.color = '';
    }

    function downloadVerifiedSkl(data) {
        const safeName = String(data.nama || 'siswa').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') || 'siswa';
        const tanggalLahir = data.ttl
            ? new Date(data.ttl).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
            : '-';
        const tahunLulus = Number.parseInt(data.tahun_lulus, 10);
        const tahunPelajaran = Number.isFinite(tahunLulus) ? `${tahunLulus - 1}/${tahunLulus}` : '-';
        const kode = `SKL-${escapeHtml(data.tahun_lulus || '')}-${Date.now().toString(36).toUpperCase()}`;
        const html = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>SKL ${escapeHtml(data.nama || '')}</title>
<style>
body{font-family:Arial,sans-serif;line-height:1.55;color:#111827;margin:48px}
.kop{text-align:center;border-bottom:3px double #111827;padding-bottom:16px;margin-bottom:32px}
.kop h1{font-size:18px;margin:0;text-transform:uppercase}
.kop h2{font-size:16px;margin:4px 0 0;text-transform:uppercase}
.nomor{text-align:center;margin-bottom:28px}
table{width:100%;border-collapse:collapse;margin:18px 0}
td{padding:6px 8px;vertical-align:top}
td:first-child{width:190px;font-weight:700}
.status{font-weight:800;letter-spacing:.08em}
.ttd{margin-top:48px;width:320px;margin-left:auto;text-align:left}
.kode{margin-top:32px;font-size:12px;color:#475569}
@media print{body{margin:24mm}.no-print{display:none}}
</style>
</head>
<body>
<button class="no-print" onclick="window.print()">Cetak / Simpan PDF</button>
<div class="kop">
<h1>Pemerintah Provinsi Jawa Barat</h1>
<h2>SMK Negeri 1 Terisi</h2>
<div>Jl. Raya Terisi, Kec. Terisi, Kabupaten Indramayu, Jawa Barat 45262</div>
</div>
<h2 style="text-align:center;text-decoration:underline">Surat Keterangan Lulus</h2>
<div class="nomor">Nomor: ${escapeHtml(data.no_ijazah || '-')}</div>
<p>Yang bertanda tangan di bawah ini menerangkan bahwa:</p>
<table>
<tr><td>Nama Lengkap</td><td>: ${escapeHtml(data.nama)}</td></tr>
<tr><td>NISN</td><td>: ${escapeHtml(data.nisn)}</td></tr>
<tr><td>Tanggal Lahir</td><td>: ${escapeHtml(tanggalLahir)}</td></tr>
<tr><td>Program Keahlian</td><td>: ${escapeHtml(data.jurusan || '-')}</td></tr>
<tr><td>Kelas</td><td>: ${escapeHtml(data.kelas || '-')}</td></tr>
<tr><td>Nilai Rata-rata</td><td>: ${escapeHtml(Number(data.nilai_rata || 0).toFixed(2))}</td></tr>
</table>
<p>Telah dinyatakan <span class="status">LULUS</span> pada tahun pelajaran ${escapeHtml(tahunPelajaran)} berdasarkan data kelulusan sekolah.</p>
<div class="ttd">
<p>Indramayu, ${escapeHtml(new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }))}</p>
<p>Kepala SMK Negeri 1 Terisi,</p>
<br><br><br>
<strong>Agung Hendra Adiwiguna, S.Kom., M.M.</strong><br>
NIP. 19800101 200501 1 001
</div>
<div class="kode">Kode verifikasi: ${kode}</div>
</body>
</html>`;

        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `SKL_${escapeHtml(data.nisn || '')}_${safeName}.html`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    window.cariSKL = async function(btn) {
        const API_BASE = window.location.protocol === 'file:' ? 'http://localhost:3001' : '';
        const nisn = document.getElementById('sklNisn')?.value.replace(/\D/g, '').slice(0, 10) || '';
        const nama = document.getElementById('sklNama')?.value.trim() || '';
        const ttl = document.getElementById('sklTanggalLahir')?.value || '';
        const tahun = document.getElementById('sklTahun')?.value || '';

        setSklMessage('');
        if (!nisn || nisn.length !== 10 || !nama || !ttl || !tahun) {
            setSklMessage('Lengkapi NISN 10 digit, nama, tanggal lahir, dan tahun lulus.');
            return;
        }

        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memverifikasi...';
        btn.disabled = true;

        try {
            const response = await fetch(`${API_BASE}/api/content/skl/cari`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nisn, nama, ttl, tahun_lulus: tahun }),
            });
            const json = await response.json().catch(() => ({}));
            if (!response.ok || !json.success || !json.data) {
                throw new Error(json.message || 'Data tidak dapat diverifikasi.');
            }

            btn.innerHTML = '<i class="fas fa-check-circle"></i> Data valid - mengunduh...';
            btn.style.background = '#059669';
            btn.style.color = '#fff';
            setSklMessage('Data valid. Dokumen sedang disiapkan.', 'success');
            downloadVerifiedSkl(json.data);
            window.setTimeout(() => {
                resetSklButton(btn);
                window.closeSklModal();
            }, 900);
        } catch (error) {
            setSklMessage(error.message || 'Gagal menghubungi server SKL.');
            resetSklButton(btn);
        }
    };

    // --- 10. STAGGERED REVEAL KARTU SAAT MASUK VIEWPORT ---
    (function() {
        const cards = document.querySelectorAll('.layanan-grid .l-card');
        if (!cards.length) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const cards2 = entry.target.querySelectorAll('.l-card');
                    cards2.forEach((c, i) => {
                        c.style.opacity = '0';
                        c.style.transform = 'translateY(30px)';
                        setTimeout(() => {
                            c.style.transition = 'opacity 0.5s ease, transform 0.5s cubic-bezier(0.25,1,0.5,1)';
                            c.style.opacity = '1';
                            c.style.transform = 'translateY(0)';
                        }, i * 90);
                    });
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.2 });

        const grid = document.querySelector('.layanan-grid');
        if (grid) observer.observe(grid);
    })();
});

/* ============================================================
   Struktur organisasi sekolah
   Semua fungsi menggunakan prefix "org" agar tidak bentrok
   dengan fungsi yang sudah ada di website.
   ============================================================ */

/* =============================================
   DATA STAFF LENGKAP - 50 ORANG
   40 Guru + 10 Staf TU
   Tambahkan properti foto di data orang jika ingin memakai file asli:
   foto: 'asset/foto/agung-hendra.jpg'
   ============================================= */
const ORG_DATA = {

  /* -- PIMPINAN INTI -- */
  pimpinan: [
    {
      id: 'P01',
      nama: 'Agung Hendra Adiwiguna, S.Kom., M.M.',
      jabatan: 'Kepala Sekolah',
      mapel: '-',
      tipe: 'pimpinan',
      icon: 'fa-crown',
      tier: 1,
      nip: '19800101 200501 1 001',
      pendidikan: 'S2 Manajemen',
      tugas: [
        'Memimpin dan mengelola seluruh kegiatan sekolah',
        'Menetapkan kebijakan dan program kerja tahunan',
        'Membina hubungan dengan komite, DU/DI, dan instansi terkait',
        'Bertanggung jawab atas mutu lulusan dan akreditasi sekolah',
        'Mengelola anggaran dan sumber daya manusia sekolah',
        'Menandatangani seluruh dokumen resmi sekolah',
      ],
      atasan: null,
      bawahan: ['P02','P03','P04','P05','T01'],
    },
    {
      id: 'P02',
      nama: 'Drs. Heru Santoso, M.Pd.',
      jabatan: 'Wakasek Kurikulum',
      mapel: 'Matematika',
      tipe: 'pimpinan',
      icon: 'fa-book-open',
      tier: 2,
      nip: '19750312 200012 1 003',
      pendidikan: 'S2 Pendidikan Matematika',
      tugas: [
        'Menyusun program kurikulum dan kalender akademik',
        'Mengkoordinasikan seluruh kegiatan belajar mengajar',
        'Mengelola jadwal pelajaran dan pembagian tugas guru',
        'Memonitoring evaluasi dan penilaian hasil belajar siswa',
        'Mengembangkan kurikulum merdeka dan program P5',
        'Mengkoordinasikan kegiatan ujian nasional dan UKK',
      ],
      atasan: 'P01',
      bawahan: ['K01','K02','K03','K04','G01','G02','G03','G04','G05','G24','G25','G26','G27','G28','G29','G30','G38'],
    },
    {
      id: 'P03',
      nama: 'Sri Wahyuni, S.Pd., M.M.',
      jabatan: 'Wakasek Kesiswaan',
      mapel: 'PKn',
      tipe: 'pimpinan',
      icon: 'fa-users',
      tier: 2,
      nip: '19780525 200212 2 004',
      pendidikan: 'S2 Manajemen Pendidikan',
      tugas: [
        'Membina seluruh kegiatan ekstrakurikuler dan OSIS',
        'Menangani pelanggaran tata tertib siswa',
        'Mengkoordinasikan program bimbingan dan konseling',
        'Mengelola data kehadiran dan kedisiplinan siswa',
        'Memfasilitasi pencapaian prestasi dan penghargaan siswa',
        'Mengkoordinasikan kegiatan upacara dan hari besar nasional',
      ],
      atasan: 'P01',
      bawahan: ['G06','G07','G08','G31','G32','G39'],
    },
    {
      id: 'P04',
      nama: 'Bambang Priyono, S.T., M.T.',
      jabatan: 'Wakasek Sarana Prasarana',
      mapel: 'Fisika Terapan',
      tipe: 'pimpinan',
      icon: 'fa-tools',
      tier: 2,
      nip: '19721108 200003 1 002',
      pendidikan: 'S2 Teknik Industri',
      tugas: [
        'Mengelola inventaris sarana dan prasarana sekolah',
        'Merencanakan dan mengawasi perbaikan gedung sekolah',
        'Mengkoordinasikan penggunaan laboratorium dan bengkel',
        'Mengelola pengadaan peralatan praktik jurusan',
        'Menjaga keamanan dan kebersihan lingkungan sekolah',
        'Menyusun laporan sarana prasarana secara berkala',
      ],
      atasan: 'P01',
      bawahan: ['T06','T07'],
    },
    {
      id: 'P05',
      nama: 'Rina Marlina, S.E., M.Ak.',
      jabatan: 'Wakasek Hubungan Industri',
      mapel: 'Akuntansi',
      tipe: 'pimpinan',
      icon: 'fa-handshake',
      tier: 2,
      nip: '19810614 200501 2 005',
      pendidikan: 'S2 Akuntansi',
      tugas: [
        'Menjalin kerja sama dengan DU/DI dan mitra industri',
        'Mengelola program magang dan Praktik Kerja Lapangan (PKL)',
        'Mengkoordinasikan Bursa Kerja Khusus (BKK)',
        'Memantau penyerapan lulusan ke dunia kerja',
        'Menyusun MoU dengan perusahaan dan instansi mitra',
        'Mengembangkan program Teaching Factory (TEFA)',
      ],
      atasan: 'P01',
      bawahan: ['G09','G10'],
    },
  ],

  /* -- KOORDINATOR JURUSAN -- */
  koordinator: [
    {
      id: 'K01',
      nama: 'Deni Setiawan, S.Kom.',
      jabatan: 'Kaprodi TKJ',
      mapel: 'Teknik Komputer & Jaringan',
      tipe: 'pimpinan',
      icon: 'fa-network-wired',
      tier: 2,
      nip: '19850220 201001 1 006',
      pendidikan: 'S1 Teknik Informatika',
      tugas: [
        'Memimpin dan mengembangkan program keahlian TKJ',
        'Mengkoordinasikan seluruh guru produktif TKJ',
        'Menyusun silabus, modul ajar, dan perangkat pembelajaran TKJ',
        'Mengawasi dan mengevaluasi kegiatan praktikum Lab TKJ',
        'Mempersiapkan siswa menghadapi UKK TKJ',
        'Membina kemitraan dengan industri teknologi informasi',
      ],
      atasan: 'P02',
      bawahan: ['G11','G12','G13','G14','G33','G34','G40'],
    },
    {
      id: 'K02',
      nama: 'Wahyu Hidayat, S.T.',
      jabatan: 'Kaprodi TBSM',
      mapel: 'Teknik Bisnis Sepeda Motor',
      tipe: 'pimpinan',
      icon: 'fa-motorcycle',
      tier: 2,
      nip: '19830415 200901 1 007',
      pendidikan: 'S1 Teknik Mesin',
      tugas: [
        'Memimpin dan mengembangkan program keahlian TBSM',
        'Mengelola bengkel standar AHASS sekolah',
        'Mengkoordinasikan program PKL siswa TBSM',
        'Membina hubungan dengan Astra Honda Motor (AHM)',
        'Mempersiapkan siswa mengikuti sertifikasi resmi Honda',
        'Mengawasi kualitas praktik overhaul dan kelistrikan motor',
      ],
      atasan: 'P02',
      bawahan: ['G15','G16','G17','G35'],
    },
    {
      id: 'K03',
      nama: 'Siti Aminah, S.P., M.Si.',
      jabatan: 'Kaprodi ATPH',
      mapel: 'Agribisnis Tanaman Pangan',
      tipe: 'pimpinan',
      icon: 'fa-seedling',
      tier: 2,
      nip: '19870630 201201 2 008',
      pendidikan: 'S2 Ilmu Pertanian',
      tugas: [
        'Memimpin dan mengembangkan program keahlian ATPH',
        'Mengelola greenhouse, lahan pertanian, dan kebun sekolah',
        'Mengembangkan sistem budidaya hidroponik modern',
        'Mengkoordinasikan program PKL siswa ATPH',
        'Membina kemitraan dengan petani dan instansi pertanian',
        'Mengawasi kegiatan kultur jaringan dan pasca panen',
      ],
      atasan: 'P02',
      bawahan: ['G18','G19','G20','G37'],
    },
    {
      id: 'K04',
      nama: 'Hendra Wijaya, S.T.',
      jabatan: 'Kaprodi AKL',
      mapel: 'Akuntansi & Keuangan',
      tipe: 'pimpinan',
      icon: 'fa-calculator',
      tier: 2,
      nip: '19840918 201001 1 009',
      pendidikan: 'S1 Akuntansi',
      tugas: [
        'Memimpin dan mengembangkan program keahlian AKL',
        'Mengelola laboratorium bank mini sekolah',
        'Mengkoordinasikan program PKL siswa AKL',
        'Membina kerja sama dengan lembaga perbankan',
        'Mempersiapkan siswa menghadapi sertifikasi BNSP',
        'Mengawasi praktik laporan keuangan dan perpajakan',
      ],
      atasan: 'P02',
      bawahan: ['G21','G22','G23','G36'],
    },
  ],

  /* -- GURU (40 orang) -- */
  guru: [
    { id:'G01', nama:'Ratna Sari, S.Pd.',           jabatan:'Guru Matematika',          mapel:'Matematika',                    tipe:'guru', icon:'fa-square-root-alt',    tier:3, nip:'19900101 201401 2 010', pendidikan:'S1 Pend. Matematika',         tugas:['Mengajar Matematika kelas X-XII','Menyusun kisi-kisi soal ulangan harian dan PAS','Wali kelas XI TKJ 1','Pembina Olimpiade Matematika'], atasan:'P02', bawahan:[] },
    { id:'G02', nama:'Intan Permata, M.Pd.',        jabatan:'Guru Bahasa Indonesia',     mapel:'Bahasa Indonesia',              tipe:'guru', icon:'fa-book',               tier:3, nip:'19880214 201201 2 011', pendidikan:'S2 Pend. Bahasa Indonesia',   tugas:['Mengajar Bahasa Indonesia kelas X-XII','Koordinator Program Literasi Sekolah','Wali kelas X ATPH 1'], atasan:'P02', bawahan:[] },
    { id:'G03', nama:'Maya Sari, S.Pd.',            jabatan:'Guru Bahasa Inggris',       mapel:'Bahasa Inggris',                tipe:'guru', icon:'fa-language',           tier:3, nip:'19910505 201501 2 012', pendidikan:'S1 Pend. Bahasa Inggris',     tugas:['Mengajar Bahasa Inggris kelas X-XII','Koordinator English Club','Wali kelas XI AKL 1'], atasan:'P02', bawahan:[] },
    { id:'G04', nama:'Asep Hidayat, S.Pd.',         jabatan:'Guru PKn & PPKN',           mapel:'PKn & Pendidikan Pancasila',    tipe:'guru', icon:'fa-flag',               tier:3, nip:'19870808 201301 1 013', pendidikan:'S1 PKn',                      tugas:['Mengajar PKn kelas X-XII','Pembina Upacara Bendera','Koordinator Program P5'], atasan:'P02', bawahan:[] },
    { id:'G05', nama:'Usep Mulyadi, S.Ag.',         jabatan:'Guru PAI',                  mapel:'Pendidikan Agama Islam',        tipe:'guru', icon:'fa-mosque',             tier:3, nip:'19860912 201201 1 014', pendidikan:'S1 Pendidikan Agama Islam',   tugas:['Mengajar PAI kelas X-XII','Koordinator Rohani Islam (Rohis)','Pembina Pramuka'], atasan:'P02', bawahan:[] },
    { id:'G06', nama:'Rini Lestari, S.Pd.',         jabatan:'Guru Sejarah / BK',         mapel:'Sejarah & Bimbingan Konseling', tipe:'guru', icon:'fa-history',            tier:3, nip:'19920115 201601 2 015', pendidikan:'S1 Pend. Sejarah',           tugas:['Mengajar Sejarah Indonesia kelas X-XII','Koordinator BK Kesiswaan','Pembina OSIS'], atasan:'P03', bawahan:[] },
    { id:'G07', nama:'Joko Purnomo, S.Pd.',         jabatan:'Guru PJOK',                 mapel:'Pendidikan Jasmani & Olahraga', tipe:'guru', icon:'fa-running',            tier:3, nip:'19890320 201301 1 016', pendidikan:'S1 PJOK',                    tugas:['Mengajar PJOK kelas X-XII','Pembina kegiatan olahraga sekolah','Koordinator Paskibra'], atasan:'P03', bawahan:[] },
    { id:'G08', nama:'Dewi Anggraini, S.Pd.',       jabatan:'Guru Seni Budaya',          mapel:'Seni Budaya & Prakarya',        tipe:'guru', icon:'fa-palette',            tier:3, nip:'19930625 201701 2 017', pendidikan:'S1 Seni Rupa',               tugas:['Mengajar Seni Budaya kelas X-XII','Koordinator Ekskul Tari Tradisional','Pembina Mading Sekolah'], atasan:'P03', bawahan:[] },
    { id:'G09', nama:'Andi Prasetyo, S.Pd.',        jabatan:'Guru PKK / BKK',            mapel:'Produk Kreatif & KWU',          tipe:'guru', icon:'fa-lightbulb',          tier:3, nip:'19910718 201501 1 018', pendidikan:'S1 Ekonomi',                 tugas:['Mengajar PKK kelas XI-XII','Koordinator BKK Sekolah','Mengelola program magang siswa'], atasan:'P05', bawahan:[] },
    { id:'G10', nama:'Nurul Hidayah, S.E.',         jabatan:'Guru Ekonomi Bisnis',       mapel:'Ekonomi Bisnis',                tipe:'guru', icon:'fa-chart-line',         tier:3, nip:'19940202 201801 2 019', pendidikan:'S1 Manajemen',               tugas:['Mengajar Ekonomi Bisnis kelas X','Koordinator TEFA Sekolah','Pembina Koperasi Siswa'], atasan:'P05', bawahan:[] },
    { id:'G11', nama:'Ahmad Fauzi, S.Kom.',         jabatan:'Guru Produktif TKJ',        mapel:'Keamanan Jaringan',             tipe:'guru', icon:'fa-shield-alt',         tier:3, nip:'19920514 201601 1 020', pendidikan:'S1 Teknik Informatika',      tugas:['Mengajar Keamanan Jaringan kelas XI-XII','Pengelola Lab TKJ 1','Pembina IT Club'], atasan:'K01', bawahan:[] },
    { id:'G12', nama:'Rizki Maulana, S.T.',         jabatan:'Guru Produktif TKJ',        mapel:'Administrasi Server',           tipe:'guru', icon:'fa-server',             tier:3, nip:'19930810 201701 1 021', pendidikan:'S1 Teknik Informatika',      tugas:['Mengajar Administrasi Server Linux & Windows','Pengelola Lab TKJ 2','Wali kelas XII TKJ 2'], atasan:'K01', bawahan:[] },
    { id:'G13', nama:'Siti Rahayu, S.Kom.',         jabatan:'Guru Produktif TKJ',        mapel:'Desain Grafis & Web',           tipe:'guru', icon:'fa-code',               tier:3, nip:'19950112 201901 2 022', pendidikan:'S1 Ilmu Komputer',           tugas:['Mengajar Pemrograman Web & Desain Grafis','Wali kelas X TKJ 2','Koordinator Web Sekolah'], atasan:'K01', bawahan:[] },
    { id:'G14', nama:'Budi Santoso, A.Md.',         jabatan:'Guru Produktif TKJ',        mapel:'Instalasi Jaringan',            tipe:'guru', icon:'fa-ethernet',           tier:3, nip:'19961201 202001 1 023', pendidikan:'D3 Teknik Jaringan',         tugas:['Mengajar Instalasi LAN & Fiber Optik','Teknisi Lab Komputer sekolah','Wali kelas X TKJ 1'], atasan:'K01', bawahan:[] },
    { id:'G15', nama:'Agus Herawan, S.T.',          jabatan:'Guru Produktif TBSM',       mapel:'Perawatan Mesin Motor',         tipe:'guru', icon:'fa-wrench',             tier:3, nip:'19910330 201501 1 024', pendidikan:'S1 Teknik Mesin',            tugas:['Mengajar Overhaul Mesin Motor','Teknisi Bengkel AHASS Sekolah','Wali kelas XI TBSM 1'], atasan:'K02', bawahan:[] },
    { id:'G16', nama:'Supardi, S.T.',               jabatan:'Guru Produktif TBSM',       mapel:'Kelistrikan Motor',             tipe:'guru', icon:'fa-bolt',               tier:3, nip:'19880704 201201 1 025', pendidikan:'S1 Teknik Elektro',          tugas:['Mengajar Sistem Kelistrikan Motor','Mengajar Sistem Injeksi PGM-FI','Wali kelas XII TBSM 1'], atasan:'K02', bawahan:[] },
    { id:'G17', nama:'Hadi Kusuma, S.T.',           jabatan:'Guru Produktif TBSM',       mapel:'Manajemen Bengkel',             tipe:'guru', icon:'fa-store-alt',          tier:3, nip:'19900917 201401 1 026', pendidikan:'S1 Manajemen Industri',      tugas:['Mengajar Manajemen Bengkel','Mengajar Kewirausahaan Otomotif','Wali kelas X TBSM 2'], atasan:'K02', bawahan:[] },
    { id:'G18', nama:'Yuli Astuti, S.P.',           jabatan:'Guru Produktif ATPH',       mapel:'Budidaya Tanaman Pangan',       tipe:'guru', icon:'fa-leaf',               tier:3, nip:'19920822 201601 2 027', pendidikan:'S1 Agronomi',                tugas:['Mengajar Budidaya Sayuran & Buah','Pengelola Greenhouse Sekolah','Wali kelas XI ATPH 1'], atasan:'K03', bawahan:[] },
    { id:'G19', nama:'Tono Prasetyo, S.P.',         jabatan:'Guru Produktif ATPH',       mapel:'Kultur Jaringan',               tipe:'guru', icon:'fa-microscope',         tier:3, nip:'19940405 201801 1 028', pendidikan:'S1 Biologi Pertanian',       tugas:['Mengajar Kultur Jaringan Tanaman','Mengajar Perlindungan Tanaman','Wali kelas X ATPH 2'], atasan:'K03', bawahan:[] },
    { id:'G20', nama:'Lina Marlina, S.P.',          jabatan:'Guru Produktif ATPH',       mapel:'Agribisnis & Pemasaran',        tipe:'guru', icon:'fa-store',              tier:3, nip:'19961015 202001 2 029', pendidikan:'S1 Agribisnis',              tugas:['Mengajar Agribisnis Digital','Mengajar Pasca Panen','Wali kelas XII ATPH 1'], atasan:'K03', bawahan:[] },
    { id:'G21', nama:'Mira Susanti, S.E.',          jabatan:'Guru Produktif AKL',        mapel:'Komputer Akuntansi',            tipe:'guru', icon:'fa-laptop-code',        tier:3, nip:'19910628 201501 2 030', pendidikan:'S1 Akuntansi',               tugas:['Mengajar MYOB & Accurate','Mengajar Spreadsheet Akuntansi','Wali kelas XI AKL 1'], atasan:'K04', bawahan:[] },
    { id:'G22', nama:'Farida Hanum, S.Ak.',         jabatan:'Guru Produktif AKL',        mapel:'Perpajakan',                    tipe:'guru', icon:'fa-file-invoice-dollar', tier:3, nip:'19930314 201701 2 031', pendidikan:'S1 Akuntansi Perpajakan',    tugas:['Mengajar Perpajakan & e-Faktur','Mengajar Administrasi Keuangan','Wali kelas XII AKL 1'], atasan:'K04', bawahan:[] },
    { id:'G23', nama:'Dian Purnama, S.E.',          jabatan:'Guru Produktif AKL',        mapel:'Perbankan Syariah',             tipe:'guru', icon:'fa-university',         tier:3, nip:'19950720 201901 2 032', pendidikan:'S1 Ekonomi Syariah',         tugas:['Mengajar Perbankan & Bank Mini','Pengelola Koperasi Siswa','Wali kelas X AKL 1'], atasan:'K04', bawahan:[] },
    { id:'G24', nama:'Eko Prasetyo, S.Pd.',         jabatan:'Guru Matematika',           mapel:'Matematika',                    tipe:'guru', icon:'fa-square-root-alt',    tier:3, nip:'19941201 201801 1 033', pendidikan:'S1 Pend. Matematika',        tugas:['Mengajar Matematika kelas X-XII','Pembina Olimpiade Matematika Tingkat Kabupaten','Wali kelas X AKL 2'], atasan:'P02', bawahan:[] },
    { id:'G25', nama:'Nina Kusuma, S.Pd.',          jabatan:'Guru Bahasa Indonesia',     mapel:'Bahasa Indonesia',              tipe:'guru', icon:'fa-book',               tier:3, nip:'19930808 201701 2 034', pendidikan:'S1 Pend. Bahasa Indonesia',  tugas:['Mengajar Bahasa Indonesia','Koordinator Perpustakaan Sekolah','Wali kelas XII AKL 2'], atasan:'P02', bawahan:[] },
    { id:'G26', nama:'Rudi Hartono, S.Pd.',         jabatan:'Guru Bahasa Inggris',       mapel:'Bahasa Inggris',                tipe:'guru', icon:'fa-language',           tier:3, nip:'19910225 201501 1 035', pendidikan:'S1 Sastra Inggris',          tugas:['Mengajar Bahasa Inggris','Pembina English Club','Wali kelas XI TBSM 2'], atasan:'P02', bawahan:[] },
    { id:'G27', nama:'Tuti Rahayu, S.Pd.',          jabatan:'Guru IPA Terapan',          mapel:'IPA Terapan',                   tipe:'guru', icon:'fa-flask',              tier:3, nip:'19900612 201401 2 036', pendidikan:'S1 Pend. IPA',               tugas:['Mengajar IPA Terapan kelas X','Pengelola Laboratorium IPA','Wali kelas X TBSM 1'], atasan:'P02', bawahan:[] },
    { id:'G28', nama:'Gunawan, S.Pd.',              jabatan:'Guru Fisika Terapan',       mapel:'Fisika Terapan',                tipe:'guru', icon:'fa-atom',               tier:3, nip:'19880418 201201 1 037', pendidikan:'S1 Pend. Fisika',            tugas:['Mengajar Fisika Terapan','Pembina KIR (Karya Ilmiah Remaja)','Wali kelas XII TBSM 2'], atasan:'P02', bawahan:[] },
    { id:'G29', nama:'Hartini, S.Pd.',              jabatan:'Guru Kimia Terapan',        mapel:'Kimia Terapan',                 tipe:'guru', icon:'fa-vial',               tier:3, nip:'19920903 201601 2 038', pendidikan:'S1 Pend. Kimia',             tugas:['Mengajar Kimia Terapan','Pengelola Lab Kimia','Wali kelas XI ATPH 2'], atasan:'P02', bawahan:[] },
    { id:'G30', nama:'Supriyadi, S.Pd.',            jabatan:'Guru Geografi & Lingkungan',mapel:'Geografi & Lingkungan',         tipe:'guru', icon:'fa-globe-asia',         tier:3, nip:'19870115 201201 1 039', pendidikan:'S1 Geografi',                tugas:['Mengajar Geografi & Lingkungan Hidup','Koordinator Program Adiwiyata','Wali kelas X ATPH 1'], atasan:'P02', bawahan:[] },
    { id:'G31', nama:'Dwi Cahyani, S.Pd.',          jabatan:'Guru BK',                   mapel:'Bimbingan Konseling',           tipe:'guru', icon:'fa-heart',              tier:3, nip:'19940516 201801 2 040', pendidikan:'S1 Bimbingan Konseling',     tugas:['Konseling siswa bermasalah akademik & sosial','Koordinator Siswa Berprestasi','Mengelola data absensi BK'], atasan:'P03', bawahan:[] },
    { id:'G32', nama:'Yusuf Aryanto, S.Pd.',        jabatan:'Guru PJOK',                 mapel:'PJOK',                          tipe:'guru', icon:'fa-futbol',             tier:3, nip:'19911204 201501 1 041', pendidikan:'S1 PJOK',                    tugas:['Mengajar PJOK kelas X-XII','Pelatih Tim Futsal Sekolah','Wali kelas X TBSM 2'], atasan:'P03', bawahan:[] },
    { id:'G33', nama:'Mulyadi, S.T.',               jabatan:'Guru Produktif TKJ',        mapel:'Cloud Computing & IoT',         tipe:'guru', icon:'fa-cloud',              tier:3, nip:'19960330 202101 1 042', pendidikan:'S1 Informatika',             tugas:['Mengajar Cloud Computing','Mengajar IoT Dasar','Wali kelas XII TKJ 1'], atasan:'K01', bawahan:[] },
    { id:'G34', nama:'Irawati, S.Kom.',             jabatan:'Guru Produktif TKJ',        mapel:'Cybersecurity',                 tipe:'guru', icon:'fa-lock',               tier:3, nip:'19970714 202201 2 043', pendidikan:'S1 Ilmu Komputer',           tugas:['Mengajar Cybersecurity','Mengajar Forensik Digital','Wali kelas XI TKJ 2'], atasan:'K01', bawahan:[] },
    { id:'G35', nama:'Panji Wicaksono, S.T.',       jabatan:'Guru Produktif TBSM',       mapel:'Chassis & Sistem Rem',          tipe:'guru', icon:'fa-car-crash',          tier:3, nip:'19950822 201901 1 044', pendidikan:'S1 Teknik Mesin',            tugas:['Mengajar Sistem Rem & Suspensi','Mengajar Tune Up Motor','Wali kelas X TBSM 1'], atasan:'K02', bawahan:[] },
    { id:'G36', nama:'Sri Mulyani, S.Ak.',          jabatan:'Guru Produktif AKL',        mapel:'Laporan Keuangan',              tipe:'guru', icon:'fa-file-alt',           tier:3, nip:'19981005 202201 2 045', pendidikan:'S1 Akuntansi',               tugas:['Mengajar Laporan Keuangan','Mengajar Audit Internal Dasar','Wali kelas XI AKL 2'], atasan:'K04', bawahan:[] },
    { id:'G37', nama:'Firmansyah, S.P.',            jabatan:'Guru Produktif ATPH',       mapel:'Hidroponik & Aeroponik',        tipe:'guru', icon:'fa-water',              tier:3, nip:'19960611 202101 1 046', pendidikan:'S1 Hortikultura',            tugas:['Mengajar Sistem Hidroponik Modern','Pengelola Greenhouse Modern','Wali kelas XII ATPH 2'], atasan:'K03', bawahan:[] },
    { id:'G38', nama:'Hamzah Fauzi, S.Pd.',         jabatan:'Guru Informatika',          mapel:'Informatika Dasar',             tipe:'guru', icon:'fa-laptop',             tier:3, nip:'19980225 202201 1 047', pendidikan:'S1 Pendidikan Informatika',  tugas:['Mengajar Informatika kelas X','Pengelola Website Sekolah','Wali kelas X AKL 2'], atasan:'P02', bawahan:[] },
    { id:'G39', nama:'Putri Handayani, S.Pd.',      jabatan:'Guru Seni & Budaya',        mapel:'Seni Rupa & Desain',            tipe:'guru', icon:'fa-paint-brush',        tier:3, nip:'19991102 202301 2 048', pendidikan:'S1 Pendidikan Seni Rupa',    tugas:['Mengajar Seni Budaya','Pembina Paduan Suara','Wali kelas XI TBSM 1'], atasan:'P03', bawahan:[] },
    { id:'G40', nama:'Faisal Akbar, S.T.',          jabatan:'Guru Produktif TKJ',        mapel:'Mikrotik & Cisco Networking',   tipe:'guru', icon:'fa-router',             tier:3, nip:'19981214 202201 1 049', pendidikan:'S1 Teknik Jaringan',         tugas:['Mengajar Routing & Switching','Mengajar Konfigurasi MikroTik','Pembina IT Competition'], atasan:'K01', bawahan:[] },
  ],

  /* -- STAF TU (10 orang) -- */
  tu: [
    {
      id: 'T01',
      nama: 'Slamet Riyadi, S.E.',
      jabatan: 'Kepala Tata Usaha',
      mapel: '-',
      tipe: 'tu',
      icon: 'fa-briefcase',
      tier: 2,
      nip: '19770422 200003 1 001',
      pendidikan: 'S1 Administrasi Perkantoran',
      tugas: [
        'Memimpin dan mengkoordinasikan seluruh staf Tata Usaha',
        'Mengelola administrasi surat menyurat sekolah',
        'Mengawasi pengelolaan keuangan sekolah',
        'Menyusun laporan administrasi berkala kepada kepala sekolah',
        'Mengelola arsip, dokumen, dan inventaris sekolah',
        'Bertanggung jawab langsung kepada kepala sekolah',
      ],
      atasan: 'P01',
      bawahan: ['T02','T03','T04','T05','T06','T07','T08','T09','T10'],
    },
    {
      id: 'T02', nama: 'Yanti Kurniasih',       jabatan: 'Staf Administrasi Akademik', mapel:'-', tipe:'tu', icon:'fa-folder-open',   tier:3, nip:'19850910 200701 2 002', pendidikan:'D3 Administrasi',
      tugas: ['Mengelola data nilai dan rapor siswa','Mengurus legalisir dokumen akademik','Mencetak dan mendistribusikan jadwal pelajaran','Mengelola sistem informasi akademik sekolah'], atasan:'T01', bawahan:[],
    },
    {
      id: 'T03', nama: 'Gunawan Saputra',       jabatan: 'Staf Keuangan & Bendahara',  mapel:'-', tipe:'tu', icon:'fa-coins',         tier:3, nip:'19820601 200601 1 003', pendidikan:'S1 Akuntansi',
      tugas: ['Mengelola keuangan operasional sekolah','Membuat laporan keuangan bulanan','Mengelola BOS (Bantuan Operasional Sekolah)','Membayar gaji dan tunjangan seluruh staf'], atasan:'T01', bawahan:[],
    },
    {
      id: 'T04', nama: 'Neni Suryani',          jabatan: 'Staf Kepegawaian',           mapel:'-', tipe:'tu', icon:'fa-users-cog',     tier:3, nip:'19900715 201201 2 004', pendidikan:'S1 Manajemen SDM',
      tugas: ['Mengelola data kepegawaian guru dan staf','Mengurus kenaikan pangkat dan gaji berkala','Mengelola absensi pegawai harian','Membuat SK dan surat tugas pegawai'], atasan:'T01', bawahan:[],
    },
    {
      id: 'T05', nama: 'Dadan Rusmana',         jabatan: 'Staf Humas & Publikasi',     mapel:'-', tipe:'tu', icon:'fa-bullhorn',      tier:3, nip:'19930212 201601 1 005', pendidikan:'S1 Komunikasi',
      tugas: ['Mengelola media sosial resmi sekolah','Membuat press release dan publikasi kegiatan','Mengelola website dan konten digital sekolah','Mendokumentasikan seluruh kegiatan sekolah'], atasan:'T01', bawahan:[],
    },
    {
      id: 'T06', nama: 'Agus Priyatno',         jabatan: 'Staf Sarana & Pemeliharaan', mapel:'-', tipe:'tu', icon:'fa-hammer',        tier:3, nip:'19851118 200801 1 006', pendidikan:'SMK Teknik',
      tugas: ['Merawat gedung dan fasilitas sekolah','Mengelola inventaris perlengkapan sekolah','Mengawasi kebersihan lingkungan sekolah','Mengurus perbaikan kerusakan fasilitas'], atasan:'T01', bawahan:[],
    },
    {
      id: 'T07', nama: 'Wiji Lestari',          jabatan: 'Staf Perpustakaan',          mapel:'-', tipe:'tu', icon:'fa-book-reader',   tier:3, nip:'19920425 201601 2 007', pendidikan:'S1 Ilmu Perpustakaan',
      tugas: ['Mengelola koleksi buku perpustakaan','Melayani peminjaman dan pengembalian buku','Mengembangkan program literasi sekolah','Mengelola e-library digital sekolah'], atasan:'T01', bawahan:[],
    },
    {
      id: 'T08', nama: 'Rian Nurdin',           jabatan: 'Staf IT & Teknisi',          mapel:'-', tipe:'tu', icon:'fa-laptop-code',   tier:3, nip:'19960830 202001 1 008', pendidikan:'D3 Teknik Informatika',
      tugas: ['Memelihara infrastruktur jaringan sekolah','Mengelola server dan sistem CCTV','Mendukung kegiatan CBT Online sekolah','Troubleshooting komputer dan perangkat sekolah'], atasan:'T01', bawahan:[],
    },
    {
      id: 'T09', nama: 'Suminah',               jabatan: 'Staf Administrasi Kesiswaan',mapel:'-', tipe:'tu', icon:'fa-user-graduate',  tier:3, nip:'19880305 201001 2 009', pendidikan:'D3 Administrasi',
      tugas: ['Mengelola data biodata siswa','Mengurus PPDB dan mutasi siswa','Menerbitkan surat keterangan aktif siswa','Mengelola arsip ijazah dan dokumen resmi siswa'], atasan:'T01', bawahan:[],
    },
    {
      id: 'T10', nama: 'Parto Widodo',          jabatan: 'Petugas Keamanan & Kebersihan', mapel:'-', tipe:'tu', icon:'fa-shield-alt', tier:3, nip:'19800718 200501 1 010', pendidikan:'SMA',
      tugas: ['Menjaga keamanan lingkungan sekolah 24 jam','Mengontrol keluar masuk tamu sekolah','Memastikan kebersihan area sekolah','Mengurus kebutuhan kebersihan harian'], atasan:'T01', bawahan:[],
    },
  ],
};

/* -- Gabungkan semua staff -- */
const ORG_ALL_STAFF = [
  ...ORG_DATA.pimpinan,
  ...ORG_DATA.koordinator,
  ...ORG_DATA.guru,
  ...ORG_DATA.tu,
];

function orgSortStaff(a, b) {
  return (Number(a.tier || 3) - Number(b.tier || 3))
    || (Number(a.sort_order || 0) - Number(b.sort_order || 0))
    || String(a.nama || '').localeCompare(String(b.nama || ''));
}

function orgApplyRemoteRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return false;
  const normalized = rows.map(row => ({
    ...row,
    id: row.code || row.id,
    code: row.code || row.id,
    mapel: row.mapel || '-',
    icon: row.icon || 'fa-user',
    tier: Number(row.tier || 3),
    sort_order: Number(row.sort_order || 0),
    tugas: Array.isArray(row.tugas)
      ? row.tugas
      : String(row.tugas || '').split(/\r?\n/).map(item => item.trim()).filter(Boolean),
    bawahan: Array.isArray(row.bawahan) ? row.bawahan : [],
    atasan: row.atasan || null,
  })).sort(orgSortStaff);

  ORG_DATA.pimpinan = normalized.filter(row => row.tipe === 'pimpinan');
  ORG_DATA.koordinator = [];
  ORG_DATA.guru = normalized.filter(row => row.tipe === 'guru');
  ORG_DATA.tu = normalized.filter(row => row.tipe === 'tu');
  ORG_ALL_STAFF.splice(0, ORG_ALL_STAFF.length, ...normalized);
  return true;
}

async function orgLoadRemoteData() {
  try {
    const res = await fetch('/api/content/organization', { cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.success) return orgApplyRemoteRows(json.data);
  } catch (error) {
    return false;
  }
  return false;
}

/* -- Cari staff by ID -- */
function orgFindById(id) {
  return ORG_ALL_STAFF.find(s => s.id === id);
}

function orgGetPhoto(staff) {
  return staff.foto || '';
}

function orgGetInitials(name) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0))
    .join('')
    .toUpperCase();
}

function orgAvatarHtml(staff, className, fallbackIcon) {
  const photo = orgGetPhoto(staff);
  const fallback = fallbackIcon ? `<i class="fas ${staff.icon}"></i>` : orgGetInitials(staff.nama);
  return `
    <div class="${className}${photo ? ' has-photo' : ''}">
      ${photo ? `<img src="${photo}" alt="Foto ${staff.nama}">` : fallback}
    </div>
  `;
}

/* =============================================
   RENDER: BAGAN POHON
   ============================================= */
function orgBuildTree() {
  const root = document.getElementById('org-tree-root');
  if (!root) return;
  root.innerHTML = '';
  root.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:0;';

  const byParent = new Map();
  const staffCodes = new Set(ORG_ALL_STAFF.map(staff => staff.id));
  ORG_ALL_STAFF.forEach(staff => {
    const parentKey = staff.atasan && staffCodes.has(staff.atasan) ? staff.atasan : '__root__';
    if (!byParent.has(parentKey)) byParent.set(parentKey, []);
    byParent.get(parentKey).push(staff);
  });
  byParent.forEach(list => list.sort(orgSortStaff));

  const renderBranch = (items, level = 0) => {
    if (!items.length || level > 4) return;
    const row = document.createElement('div');
    row.className = 'org-tree-row';
    items.slice(0, level >= 3 ? 8 : 12).forEach(staff => row.appendChild(orgBuildNode(staff, level)));
    root.appendChild(row);

    const children = items
      .flatMap(staff => byParent.get(staff.id) || [])
      .sort(orgSortStaff);
    if (children.length) {
      root.appendChild(orgConnV(level >= 2 ? 20 : 30));
      renderBranch(children, level + 1);
    }
  };

  renderBranch(byParent.get('__root__') || [], 0);

  /* Catatan */
  const note = document.createElement('p');
  note.className = 'org-tree-note';
  note.innerHTML = '<i class="fas fa-info-circle" style="color:var(--secondary);margin-right:6px;"></i>Bagan menampilkan hierarki aktif dari data sekolah. Gunakan tab <strong>Daftar</strong> atau <strong>Bidang</strong> untuk melihat semuanya.';
  root.appendChild(note);
}

function orgBuildNode(staff, level) {
  if (!staff) return document.createElement('div');
  const wrap = document.createElement('div');
  wrap.className = `org-tree-node org-level-${level}`;
  wrap.style.animationDelay = `${level * 0.08}s`;

  const card = document.createElement('div');
  card.className = 'org-node-card';
  card.setAttribute('data-tier', staff.tier);
  card.setAttribute('data-id', staff.id);
  card.title = `${staff.nama} - ${staff.jabatan}`;

  card.innerHTML = `
    ${orgAvatarHtml(staff, 'org-node-avatar', true)}
    <div class="org-node-name">${staff.nama.split(',')[0]}</div>
    <div class="org-node-role">${staff.jabatan}</div>
    ${staff.tier <= 1 ? '<div class="org-node-badge">Pimpinan</div>' : ''}
  `;

  card.addEventListener('click', () => orgOpenDetail(staff.id));
  wrap.appendChild(card);
  return wrap;
}

function orgConnV(h) {
  const d = document.createElement('div');
  d.className = 'org-conn-v';
  d.style.height = (h || 36) + 'px';
  return d;
}

/* =============================================
   RENDER: TABEL DAFTAR
   ============================================= */
function orgBuildTable() {
  const tbody = document.getElementById('org-staff-tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  ORG_ALL_STAFF.forEach((staff, i) => {
    const tr = document.createElement('tr');
    tr.setAttribute('data-tipe', staff.tipe);
    tr.setAttribute('data-search', `${staff.nama} ${staff.jabatan} ${staff.mapel}`.toLowerCase());

    let typeLabel = 'Guru';
    let typeClass = 'guru';
    if (staff.tipe === 'pimpinan') { typeLabel = 'Pimpinan'; typeClass = 'pimpinan'; }
    else if (staff.tipe === 'tu')  { typeLabel = 'Staf TU';  typeClass = 'tu'; }

    tr.innerHTML = `
      <td style="color:#64748b;font-weight:700;font-size:0.78rem;">${i + 1}</td>
      <td>
        <div style="display:flex;align-items:center;gap:10px;">
          ${orgAvatarHtml(staff, 'org-table-avatar', true)}
          <div>
            <div style="font-weight:700;font-size:0.82rem;color:var(--primary);">${staff.nama}</div>
            <div style="font-size:0.68rem;color:#94a3b8;">${staff.nip}</div>
          </div>
        </div>
      </td>
      <td style="font-weight:600;font-size:0.82rem;">${staff.jabatan}</td>
      <td style="color:#64748b;font-size:0.78rem;">${staff.mapel}</td>
      <td><span class="org-type-badge ${typeClass}">${typeLabel}</span></td>
    `;

    tr.addEventListener('click', () => orgOpenDetail(staff.id));
    tbody.appendChild(tr);
  });
}

function orgFilterList(filter, btn) {
  document.querySelectorAll('.org-lf-chip').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  document.querySelectorAll('#org-staff-tbody tr').forEach(tr => {
    const tipe = tr.getAttribute('data-tipe');
    if (filter === 'all') {
      tr.classList.remove('org-hidden-row');
    } else if (filter === 'pimpinan') {
      tr.classList.toggle('org-hidden-row', tipe !== 'pimpinan');
    } else {
      tr.classList.toggle('org-hidden-row', tipe !== filter);
    }
  });
}

/* =============================================
   RENDER: DEPARTEMEN
   ============================================= */
function orgBuildDept() {
  const grid = document.getElementById('org-dept-grid');
  if (!grid) return;
  grid.innerHTML = '';

  const depts = [
    { nama:'Pimpinan Sekolah', sub:'Kepala sekolah, wakil, dan koordinator', icon:'fa-crown', members:[...ORG_DATA.pimpinan] },
  ];

  const guruGroups = new Map();
  ORG_DATA.guru.forEach(guru => {
    const key = guru.mapel && guru.mapel !== '-' ? guru.mapel : 'Guru Mapel Umum';
    if (!guruGroups.has(key)) guruGroups.set(key, []);
    guruGroups.get(key).push(guru);
  });
  [...guruGroups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([nama, members]) => depts.push({
      nama,
      sub: `${members.length} personel guru`,
      icon: 'fa-chalkboard-teacher',
      members: members.sort(orgSortStaff),
    }));

  if (ORG_DATA.tu.length) {
    depts.push({ nama:'Tata Usaha', sub:'Administrasi, layanan, sarpras, dan operasional', icon:'fa-briefcase', members:ORG_DATA.tu.sort(orgSortStaff) });
  }

  depts.forEach(dept => {
    const valid = dept.members.filter(Boolean);
    const card = document.createElement('div');
    card.className = 'org-dept-card';

    const membersHtml = valid.slice(0, 6).map(m => `
      <div class="org-dept-member-row" onclick="orgOpenDetail('${m.id}')">
        ${orgAvatarHtml(m, 'org-dept-member-avatar')}
        <div class="org-dept-member-info">
          <div class="org-dept-member-name">${m.nama.split(',')[0]}</div>
          <div class="org-dept-member-mapel">${m.jabatan}</div>
        </div>
        <i class="fas fa-chevron-right" style="color:var(--secondary);font-size:0.62rem;flex-shrink:0;"></i>
      </div>
    `).join('');

    const moreCount = valid.length - 6;

    card.innerHTML = `
      <div class="org-dept-card-header">
        <div class="org-dept-icon"><i class="fas ${dept.icon}"></i></div>
        <div style="flex:1;min-width:0;">
          <h3>${dept.nama}</h3>
          <p>${dept.sub}</p>
        </div>
        <div class="org-dept-count">${valid.length}</div>
      </div>
      <div class="org-dept-members">
        ${membersHtml}
        ${moreCount > 0 ? `<div class="org-dept-more" onclick="orgSwitchView('list', document.querySelector('[data-view=list]'))">
          +${moreCount} lainnya - Lihat semua
        </div>` : ''}
      </div>
    `;

    grid.appendChild(card);
  });
}

/* =============================================
   DETAIL PANEL
   ============================================= */
function orgOpenDetail(id) {
  const staff = orgFindById(id);
  if (!staff) return;

  const panel = document.getElementById('org-detail-panel');
  if (!panel) return;

  const detailAvatar = document.getElementById('org-det-avatar');
  if (detailAvatar) {
    const photo = orgGetPhoto(staff);
    detailAvatar.classList.toggle('has-photo', Boolean(photo));
    detailAvatar.innerHTML = photo
      ? `<img src="${photo}" alt="Foto ${staff.nama}">`
      : `<i class="fas ${staff.icon}"></i>`;
  }
  document.getElementById('org-det-name').textContent  = staff.nama;
  document.getElementById('org-det-role').textContent  = staff.jabatan;

  const atasan  = staff.atasan ? orgFindById(staff.atasan) : null;
  const bawahan = ORG_ALL_STAFF.filter(s => s.atasan === staff.id);

  document.getElementById('org-det-body').innerHTML = `
    <div class="org-photo-showcase">
      <div class="org-photo-preview${orgGetPhoto(staff) ? ' has-photo' : ''}">
        ${orgGetPhoto(staff) ? `<img src="${orgGetPhoto(staff)}" alt="Foto ${staff.nama}">` : `<i class="fas ${staff.icon}"></i>`}
      </div>
      <div class="org-photo-caption">
        <strong>${staff.nama.split(',')[0]}</strong>
        <span>${staff.jabatan}</span>
      </div>
    </div>

    <div class="org-detail-section">
      <div class="org-detail-section-title">Informasi Umum</div>
      <div class="org-detail-info-grid">
        <div class="org-di-item"><label>NIP</label><span>${staff.nip}</span></div>
        <div class="org-di-item"><label>Tipe</label><span>${staff.tipe === 'pimpinan' ? 'Pimpinan' : staff.tipe === 'tu' ? 'Staf TU' : 'Guru'}</span></div>
        <div class="org-di-item"><label>Bidang / Mapel</label><span>${staff.mapel}</span></div>
        <div class="org-di-item"><label>Pendidikan</label><span>${staff.pendidikan}</span></div>
      </div>
    </div>

    <div class="org-detail-section">
      <div class="org-detail-section-title">Tugas & Tanggung Jawab</div>
      <ul class="org-tugas-list">
        ${staff.tugas.map(t => `<li>${t}</li>`).join('')}
      </ul>
    </div>

    ${atasan ? `
    <div class="org-detail-section">
      <div class="org-detail-section-title">Bertanggung Jawab Kepada</div>
      <div class="org-dept-member-row" style="cursor:pointer;" onclick="orgCloseDetail();setTimeout(()=>orgOpenDetail('${atasan.id}'),220)">
        ${orgAvatarHtml(atasan, 'org-dept-member-avatar')}
        <div class="org-dept-member-info">
          <div class="org-dept-member-name">${atasan.nama.split(',')[0]}</div>
          <div class="org-dept-member-mapel">${atasan.jabatan}</div>
        </div>
        <i class="fas fa-arrow-right" style="color:var(--secondary);font-size:0.7rem;"></i>
      </div>
    </div>` : ''}

    ${bawahan.length ? `
    <div class="org-detail-section">
      <div class="org-detail-section-title">Membawahi (${bawahan.length} orang)</div>
      <div class="org-bawahan-chips">
        ${bawahan.map(b => `
          <div class="org-bawahan-chip" onclick="orgCloseDetail();setTimeout(()=>orgOpenDetail('${b.id}'),220)">
            ${b.nama.split(' ').slice(0,2).join(' ').replace(',','')}
          </div>
        `).join('')}
      </div>
    </div>` : ''}
  `;

  panel.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function orgCloseDetail() {
  const panel = document.getElementById('org-detail-panel');
  if (panel) panel.classList.remove('open');
  document.body.style.overflow = '';
}

/* Tutup dengan Escape */
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') orgCloseDetail();
});

/* =============================================
   SWITCH VIEW
   ============================================= */
function orgSwitchView(view, btn) {
  document.querySelectorAll('.ctrl-tab').forEach(b => b.classList.remove('active'));
  if (btn) {
    btn.classList.add('active');
  } else {
    const b = document.querySelector(`.ctrl-tab[data-view="${view}"]`);
    if (b) b.classList.add('active');
  }

  const views = ['tree','list','dept'];
  views.forEach(v => {
    const el = document.getElementById(`org-view-${v}`);
    if (el) el.style.display = v === view ? 'block' : 'none';
  });

  const legend = document.getElementById('org-legend-bar');
  if (legend) legend.style.display = view === 'tree' ? 'flex' : 'none';

  /* Reset search */
  const si = document.getElementById('org-search-input');
  if (si) si.value = '';
  orgClearSearch();
}

/* =============================================
   SEARCH
   ============================================= */
function orgHandleSearch(val) {
  const q = val.toLowerCase().trim();

  /* Highlight node di bagan */
  document.querySelectorAll('.org-node-card').forEach(card => {
    const id    = card.getAttribute('data-id');
    const staff = orgFindById(id);
    if (!staff) return;
    const text  = `${staff.nama} ${staff.jabatan} ${staff.mapel}`.toLowerCase();
    card.classList.toggle('org-highlight', q.length > 0 && text.includes(q));
  });

  /* Filter baris tabel */
  document.querySelectorAll('#org-staff-tbody tr').forEach(tr => {
    const search = tr.getAttribute('data-search') || '';
    tr.classList.toggle('org-hidden-row', q.length > 0 && !search.includes(q));
  });

  /* Filter dept member rows */
  document.querySelectorAll('.org-dept-member-row').forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = q.length > 0 && !text.includes(q) ? 'none' : '';
  });
}

function orgClearSearch() {
  document.querySelectorAll('.org-node-card').forEach(c => c.classList.remove('org-highlight'));
  document.querySelectorAll('#org-staff-tbody tr').forEach(tr => tr.classList.remove('org-hidden-row'));
  document.querySelectorAll('.org-dept-member-row').forEach(row => row.style.display = '');
}

/* =============================================
   TOAST
   ============================================= */
function orgShowToast(msg) {
  const t = document.getElementById('org-toast-notif');
  if (!t) return;
  t.innerHTML = `<i class="fas fa-info-circle" style="color:var(--secondary);"></i> ${msg}`;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

/* =============================================
   INIT - jalankan hanya jika elemen ada
   ============================================= */
document.addEventListener('DOMContentLoaded', async function () {
  if (!document.getElementById('org-tree-root')) return; /* hanya di profil.html */
  await orgLoadRemoteData();
  orgBuildTree();
  orgBuildTable();
  orgBuildDept();
});
/* ============================================================
   Akhir modul struktur organisasi
   ============================================================ */

