// ============================================
// SW.JS - S-STORES PWA
// Tối ưu cache cho mobile
// ============================================

const CACHE_NAME = 's-stores-v3.0.0';
const DATA_CACHE_NAME = 's-stores-data-v1';
const IMAGE_CACHE_NAME = 's-stores-images-v1';

// ===== 1. STATIC ASSETS =====
const STATIC_ASSETS = [
    '/',
    '/dashboard.html',
    '/register.html',
    '/store.html',
    '/manifest.json',
    'https://cdn.tailwindcss.com',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
    'https://www.gstatic.com/firebasejs/8.10.1/firebase-app.js',
    'https://www.gstatic.com/firebasejs/8.10.1/firebase-database.js',
    'https://www.gstatic.com/firebasejs/8.10.1/firebase-storage.js'
];

// ===== 2. INSTALL =====
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('📦 Caching static assets...');
                // Thêm từng file, không fail nếu 1 file lỗi
                return Promise.allSettled(
                    STATIC_ASSETS.map(url => 
                        cache.add(url).catch(() => 
                            console.warn('⚠️ Failed to cache:', url)
                        )
                    )
                );
            })
            .then(() => self.skipWaiting())
    );
});

// ===== 3. ACTIVATE =====
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => 
                    key !== CACHE_NAME && 
                    key !== DATA_CACHE_NAME &&
                    key !== IMAGE_CACHE_NAME
                )
                .map(key => {
                    console.log('🧹 Deleting old cache:', key);
                    return caches.delete(key);
                })
            );
        })
        .then(() => self.clients.claim())
    );
});

// ===== 4. FETCH - TỐI ƯU =====
self.addEventListener('fetch', event => {
    const url = event.request.url;
    
    // ==== 4a. CACHE ẢNH SẢN PHẨM ====
    if (url.includes('picsum.photos') || 
        url.includes('i.ibb.co') || 
        url.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
        event.respondWith(
            caches.open(IMAGE_CACHE_NAME).then(cache => {
                return cache.match(event.request).then(response => {
                    if (response) {
                        console.log('📸 Image from cache:', url.split('/').pop());
                        return response;
                    }
                    return fetch(event.request).then(networkResponse => {
                        if (networkResponse && networkResponse.status === 200) {
                            cache.put(event.request, networkResponse.clone());
                        }
                        return networkResponse;
                    }).catch(() => {
                        // Fallback ảnh mặc định nếu lỗi
                        return new Response('', { status: 404 });
                    });
                });
            })
        );
        return;
    }
    
    // ==== 4b. CACHE FIREBASE DATA (QUAN TRỌNG NHẤT) ====
    if (url.includes('firebasedatabase.app')) {
        event.respondWith(
            caches.open(DATA_CACHE_NAME).then(cache => {
                return cache.match(event.request).then(cached => {
                    if (cached) {
                        console.log('📦 Firebase data from cache');
                        // Trả về cache, nhưng vẫn fetch bản mới ngầm
                        fetch(event.request).then(response => {
                            if (response && response.status === 200) {
                                cache.put(event.request, response.clone());
                            }
                        }).catch(() => {});
                        return cached;
                    }
                    return fetch(event.request).then(response => {
                        if (response && response.status === 200) {
                            console.log('💾 Caching Firebase data');
                            cache.put(event.request, response.clone());
                        }
                        return response;
                    });
                });
            })
        );
        return;
    }
    
    // ==== 4c. STATIC ASSETS ====
    if (url.startsWith(self.location.origin) ||
        url.includes('cdn.tailwindcss.com') ||
        url.includes('cdnjs.cloudflare.com') ||
        url.includes('gstatic.com') ||
        url.includes('fonts.googleapis.com') ||
        url.includes('fonts.gstatic.com')) {
        event.respondWith(
            caches.match(event.request)
                .then(cachedResponse => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    return fetch(event.request)
                        .then(response => {
                            if (!response || response.status !== 200) {
                                return response;
                            }
                            const clone = response.clone();
                            caches.open(CACHE_NAME)
                                .then(cache => cache.put(event.request, clone))
                                .catch(() => {});
                            return response;
                        })
                        .catch(() => {
                            if (event.request.mode === 'navigate') {
                                return caches.match('/dashboard.html');
                            }
                            return new Response('Offline', { status: 503 });
                        });
                })
        );
        return;
    }
});

// ===== 5. PUSH NOTIFICATIONS =====
self.addEventListener('push', event => {
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'S-STORES';
    const options = {
        body: data.body || 'Bạn có thông báo mới!',
        icon: 'https://i.ibb.co/dJxJHqB9/logo-icon-192.png',
        badge: 'https://i.ibb.co/dJxJHqB9/logo-icon-192.png',
        vibrate: [200, 100, 200],
        data: { url: data.url || '/dashboard.html' }
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

// ===== 6. NOTIFICATION CLICK =====
self.addEventListener('notificationclick', event => {
    event.notification.close();
    const url = event.notification.data?.url || '/dashboard.html';
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then(clients => {
            for (let client of clients) {
                if (client.url === url && 'focus' in client) {
                    return client.focus();
                }
            }
            return clients.openWindow(url);
        })
    );
});

// ===== 7. BACKGROUND SYNC (optional) =====
// Cho phép sync dữ liệu khi có mạng
self.addEventListener('sync', event => {
    if (event.tag === 'sync-data') {
        event.waitUntil(
            // Đồng bộ dữ liệu khi có mạng
            caches.open(DATA_CACHE_NAME).then(cache => {
                // Logic sync ở đây
                console.log('🔄 Syncing data...');
            })
        );
    }
});