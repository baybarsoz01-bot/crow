const socket = io();

// === DOM Elemanları ===
const loginScreen = document.getElementById('login-screen');
const appLayout = document.getElementById('app-layout');
const joinBtn = document.getElementById('join-btn');
const nicknameInput = document.getElementById('nickname-input');
const sidebarNickname = document.getElementById('sidebar-nickname');
const userAvatar = document.getElementById('user-avatar');
const roomSearch = document.getElementById('room-search');
const roomList = document.getElementById('room-list');
const privateRoomList = document.getElementById('private-room-list');
const customRoomInput = document.getElementById('custom-room-input');
const createRoomBtn = document.getElementById('create-room-btn');
const joinCodeInput = document.getElementById('join-code-input');
const joinCodeBtn = document.getElementById('join-code-btn');
const headerRoomCode = document.getElementById('header-room-code');

const imageUpload = document.getElementById('image-upload');
const imagePreviewContainer = document.getElementById('image-preview-container');
const imagePreview = document.getElementById('image-preview');
const removeImageBtn = document.getElementById('remove-image-btn');
const chatForm = document.getElementById('chat-form');
const recentRoomsList = document.getElementById('recent-rooms-list');
let typingTimeout = null;
let typingUsers = new Set();
let messageIdCounter = 0;
let loginTime = null;
let currentImageBase64 = null;
let myFriends = [];
let allOnlineUsers = [];
const recentTitle = document.getElementById('recent-title');
const rightSidebar = document.getElementById('right-sidebar');
const dashboardView = document.getElementById('dashboard-view');
const chatView = document.getElementById('chat-view');
const dashUsername = document.getElementById('dash-username');
const dashStatUsers = document.getElementById('dash-stat-users');
const dashStatRooms = document.getElementById('dash-stat-rooms');
const dashStatTime = document.getElementById('dash-stat-time');
const navHomeBtn = document.getElementById('nav-home-btn');
const messageInput = document.getElementById('message-input');
const messagesContainer = document.getElementById('messages');
const currentRoomNameDisplay = document.getElementById('current-room-name');
const headerRoomIcon = document.getElementById('header-room-icon');
const headerRoomDesc = document.getElementById('header-room-desc');
const headerOnlineCount = document.getElementById('header-online-count');
const typingIndicator = document.getElementById('typing-indicator');
const typingText = document.getElementById('typing-text');
const onlineUsersList = document.getElementById('online-users-list');

let myNickname = '';
let currentRoom = '';
let recentRooms = JSON.parse(localStorage.getItem('crow_recent_rooms') || '[]');
// Oda bilgileri
const roomData = {
    'Genel':   { icon: '💬', name: 'Genel Sohbet',      desc: 'Herkes burada, muhabbete katıl!' },
    'Yazılım': { icon: '💻', name: 'Yazılım & Kodlama', desc: 'Geliştiriciler için teknik sohbet.' },
    'Oyun':    { icon: '🎮', name: 'Oyun Dünyası',      desc: 'Beraber oynamak için takım arkadaşı bul.' },
    'Müzik':   { icon: '🎵', name: 'Müzik & Sanat',     desc: 'Favori parçalarını ve sanatçıları paylaş.' }
};

// ==============================
// BAŞLANGIÇTA ÖZEL ODALARI YÜKLE
// ==============================
async function loadCustomRooms() {
    try {
        const res = await fetch('/api/custom-rooms');
        const rooms = await res.json();
        rooms.forEach(room => {
            if (!roomData[room]) {
                roomData[room] = { icon: '🔒', name: room, desc: 'Özel oda' };
                addRoomToSidebar(room, '🔒');
            }
        });
    } catch (e) { console.log('Özel odalar yüklenemedi'); }
}

// ==============================
// 1. GERÇEK GİRİŞ AKIŞI (AUTH)
// ==============================
const authTabs = document.querySelectorAll('.auth-tab');
const authForm = document.getElementById('auth-form');
const authNickname = document.getElementById('auth-nickname');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const registerFields = document.getElementById('register-fields');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authError = document.getElementById('auth-error');

let isLoginMode = true;

// Sekme Geçişleri
authTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        authTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        isLoginMode = tab.getAttribute('data-tab') === 'login';
        
        registerFields.style.display = isLoginMode ? 'none' : 'block';
        authNickname.required = !isLoginMode;
        authSubmitBtn.innerText = isLoginMode ? 'Giriş Yap' : 'Kayıt Ol';
        authError.style.display = 'none';
    });
});

// Form Gönderimi (Giriş/Kayıt)
authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authError.style.display = 'none';
    const email = authEmail.value;
    const password = authPassword.value;
    const nickname = authNickname.value;

    const endpoint = isLoginMode ? '/api/login' : '/api/register';
    const body = isLoginMode ? { email, password } : { nickname, email, password };

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const data = await res.json();

        if (!res.ok) {
            authError.innerText = data.error || 'Bir hata oluştu.';
            authError.style.display = 'block';
            return;
        }

        if (isLoginMode) {
            // Giriş başarılı, uygulamaya geç
            startApp(data.user);
        } else {
            // Kayıt başarılı, login moduna geç
            authTabs[0].click();
            authError.style.color = '#10b981'; // Başarı rengi
            authError.innerText = data.message;
            authError.style.display = 'block';
            setTimeout(() => { authError.style.color = '#ef4444'; authError.style.display = 'none'; }, 3000);
        }
    } catch (err) {
        authError.innerText = 'Sunucuya bağlanılamadı.';
        authError.style.display = 'block';
    }
});

// Sayfa Yüklendiğinde Oturum Kontrolü
async function checkAuthSession() {
    try {
        const res = await fetch('/api/me');
        const data = await res.json();
        if (data.loggedIn) {
            startApp(data.user);
        }
    } catch (e) { console.log('Oturum kontrolü başarısız.'); }
}

async function startApp(user) {
    myNickname = user.nickname;
    sidebarNickname.innerText = user.nickname;
    userAvatar.innerText = user.avatar || user.nickname.charAt(0).toUpperCase();

    // Önce özel odaları yükle
    await loadCustomRooms();

    loginScreen.classList.remove('active');
    appLayout.classList.add('active');

    // Sunucuya adımızı kaydedelim
    socket.emit('set nickname', myNickname);

    // Başlangıçta ana ekranı (dashboard) göster
    showDashboard();
    renderRecentRooms();
}

// Uygulama açıldığında oturumu kontrol et
checkAuthSession();

function showDashboard() {
    currentRoom = null;
    document.querySelectorAll('.room-item').forEach(el => el.classList.remove('active'));
    navHomeBtn.classList.add('active');
    
    chatView.style.display = 'none';
    rightSidebar.style.display = 'none'; // Sağdaki sidebar'ı gizle ki geniş alan olsun
    dashboardView.style.display = 'flex';
    
    dashUsername.innerText = myNickname;
}

navHomeBtn.addEventListener('click', showDashboard);

// Saat güncellemesi
setInterval(() => {
    dashStatTime.innerText = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}, 1000);

// ==============================
// 2. ODA GEÇİŞLERİ
// ==============================
// Sol sidebar tıklamaları (event delegation)
roomList.addEventListener('click', (e) => {
    const item = e.target.closest('.room-item');
    if (item) joinRoom(item.getAttribute('data-room'));
});

// Sağ sidebar Katıl butonları
document.querySelectorAll('.join-room-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        joinRoom(btn.getAttribute('data-join'));
    });
});

// Sağ sidebar satır tıklaması
document.querySelectorAll('.popular-room-item').forEach(item => {
    item.addEventListener('click', () => {
        joinRoom(item.getAttribute('data-room'));
    });
});

function joinRoom(room) {
    if (room === currentRoom) return;

    // Arayüz geçişi
    navHomeBtn.classList.remove('active');
    dashboardView.style.display = 'none';
    chatView.style.display = 'flex';
    rightSidebar.style.display = 'block';

    // Typing durumunu sıfırla
    typingUsers.clear();
    updateTypingIndicator();

    currentRoom = room;

    // Mesajları temizle
    messagesContainer.innerHTML = '';

    // Header güncelle
    const isPrivate = roomData[room] && roomData[room].isPrivate;
    let info = roomData[room] || { icon: '🔒', name: room, desc: 'Özel oda', isPrivate: true };
    
    // Sunucudan daha taze bilgiyi al (eğer varsa)
    fetch('/api/room-info/' + room).then(r => r.json()).then(data => {
        if(data && data.code) {
            info.icon = data.icon || info.icon;
            info.desc = data.desc || info.desc;
            info.wallpaper = data.wallpaper || null;
            info.creator = data.creator;
            
            // Header'ı tekrar güncelle
            headerRoomIcon.innerText = info.icon;
            headerRoomDesc.innerText = info.desc;
            
            // Oda arka planı (wallpaper)
            if (info.wallpaper) {
                document.getElementById('messages').style.setProperty('--chat-wallpaper', `url('${info.wallpaper}')`);
            } else {
                document.getElementById('messages').style.setProperty('--chat-wallpaper', 'none');
            }

            // Kurucu bizsek ayarlar butonunu göster
            if (info.creator === myNickname) {
                document.getElementById('room-settings-btn').style.display = 'block';
            } else {
                document.getElementById('room-settings-btn').style.display = 'none';
            }
        } else {
            // Sadece gruplar veya sunucuda olmayan odalar
            document.getElementById('messages').style.setProperty('--chat-wallpaper', 'none');
            document.getElementById('room-settings-btn').style.display = 'none';
        }
    }).catch(e => console.error(e));

    currentRoomNameDisplay.innerText = info.name;
    headerRoomIcon.innerText = info.icon;
    headerRoomDesc.innerText = info.desc;

    if (info.code) {
        headerRoomCode.style.display = 'inline-block';
        headerRoomCode.querySelector('b').innerText = info.code;
        headerRoomCode.onclick = () => {
            navigator.clipboard.writeText(info.code);
            const orig = headerRoomCode.innerHTML;
            headerRoomCode.innerHTML = 'Kopyalandı!';
            setTimeout(() => headerRoomCode.innerHTML = orig, 1500);
        };
    } else {
        headerRoomCode.style.display = 'none';
    }

    // Sol sidebar aktif göstergesi
    document.querySelectorAll('.room-item').forEach(el => el.classList.remove('active'));
    const activeItem = document.querySelector(`.room-item[data-room="${room}"]`);
    if (activeItem) activeItem.classList.add('active');

    // Sağ sidebar "Katıl" buton durumlarını güncelle
    updateJoinButtons();

    // Sekme görünümünü güncelle (özel odalarda feed yok)
    if (typeof updateViewTabs === 'function') updateViewTabs();

    // Sunucuya katıl
    socket.emit('join room', { nickname: myNickname, roomName: room });

    // Son ziyaret edilenlere ekle
    addToRecent(room);
    messageInput.focus();
}

function updateJoinButtons() {
    document.querySelectorAll('.join-room-btn').forEach(btn => {
        const room = btn.getAttribute('data-join');
        if (room === currentRoom) {
            btn.innerText = 'İçindesin';
            btn.classList.add('joined');
        } else {
            btn.innerText = 'Katıl';
            btn.classList.remove('joined');
        }
    });
}

// ==============================
// 3. ÖZEL ODA OLUŞTURMA VE KATILMA
// ==============================
createRoomBtn.addEventListener('click', createCustomRoom);
customRoomInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') createCustomRoom(); });

function createCustomRoom() {
    const roomName = customRoomInput.value.trim();
    if (!roomName) return;

    // Sunucuya kalıcı olarak kaydet ve kodu al
    socket.emit('create room', roomName, (code) => {
        if (!roomData[roomName]) {
            roomData[roomName] = { icon: '🔒', name: roomName, desc: 'Özel oda', isPrivate: true, code: code };
            addRoomToSidebar(roomName, '🔒', true);
        }
        customRoomInput.value = '';
        joinRoom(roomName);
    });
}

joinCodeBtn.addEventListener('click', joinByCode);
joinCodeInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') joinByCode(); });

async function joinByCode() {
    const code = joinCodeInput.value.trim();
    if (!code) return;
    
    try {
        const res = await fetch('/api/verify-code/' + code);
        const data = await res.json();
        if (data.success) {
            const roomName = data.roomName;
            if (!roomData[roomName]) {
                roomData[roomName] = { icon: '🔒', name: roomName, desc: 'Özel oda', isPrivate: true, code: code };
                addRoomToSidebar(roomName, '🔒', true);
            }
            joinCodeInput.value = '';
            joinRoom(roomName);
        } else {
            alert(data.error);
        }
    } catch(e) {
        alert('Bağlantı hatası');
    }
}

function addRoomToSidebar(room, icon, isPrivate = false) {
    const li = document.createElement('li');
    li.classList.add('room-item');
    li.setAttribute('data-room', room);
    li.innerHTML = `
        <span class="room-item-icon">${icon}</span>
        <span class="room-item-name">${room}</span>
        <span class="room-item-count" data-room-count="${room}">0</span>
    `;
    if (isPrivate) {
        privateRoomList.appendChild(li);
    } else {
        roomList.appendChild(li);
    }
}

// ==============================
// 4. SON ZİYARETLER
// ==============================
function addToRecent(room) {
    recentRooms = recentRooms.filter(r => r !== room);
    recentRooms.unshift(room);
    if (recentRooms.length > 5) recentRooms.pop();
    localStorage.setItem('crow_recent_rooms', JSON.stringify(recentRooms));
    renderRecentRooms();
}

function renderRecentRooms() {
    recentRoomsList.innerHTML = '';
    if (recentRooms.length === 0) { recentTitle.style.display = 'none'; return; }
    recentTitle.style.display = 'block';
    recentRooms.forEach(room => {
        const info = roomData[room] || { icon: '🔒', name: room };
        const li = document.createElement('li');
        li.classList.add('room-item');
        li.setAttribute('data-room', room);
        if (room === currentRoom) li.classList.add('active');
        li.innerHTML = `
            <span class="room-item-icon">${info.icon}</span>
            <span class="room-item-name">${info.name}</span>
        `;
        li.addEventListener('click', () => joinRoom(room));
        recentRoomsList.appendChild(li);
    });
}

// ==============================
// 5. ARAMA
// ==============================
roomSearch.addEventListener('input', () => {
    const query = roomSearch.value.toLowerCase();
    document.querySelectorAll('#room-list .room-item').forEach(item => {
        const name = item.querySelector('.room-item-name').innerText.toLowerCase();
        item.style.display = name.includes(query) ? 'flex' : 'none';
    });
});

// ==============================
// 6. MESAJLAŞMA VE MEDYA
// ==============================
imageUpload.addEventListener('change', function() {
    const file = this.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            currentImageBase64 = e.target.result;
            imagePreview.src = currentImageBase64;
            imagePreviewContainer.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
});

removeImageBtn.addEventListener('click', () => {
    currentImageBase64 = null;
    imagePreviewContainer.style.display = 'none';
    imageUpload.value = '';
});

chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const msg = messageInput.value.trim();
    if (msg || currentImageBase64) {
        socket.emit('chat message', { text: msg, image: currentImageBase64 });
        socket.emit('stop typing');
        
        myStats.messages++; // İstatistikleri artır
        
        // Formu temizle
        messageInput.value = '';
        currentImageBase64 = null;
        imagePreviewContainer.style.display = 'none';
        imageUpload.value = '';
    }
});

// === Mesaj Geçmişi (Odaya girince) ===
socket.on('message history', (messages) => {
    messagesContainer.innerHTML = '';
    messages.forEach(data => appendMessage(data, false));
    scrollToBottom();
});

// === Yeni Mesaj ===
socket.on('chat message', (data) => appendMessage(data, true));

// === Oda Ayarları Değiştiğinde ===
socket.on('room settings updated', ({ room, settings }) => {
    if (currentRoom === room) {
        headerRoomIcon.innerText = settings.icon || '🔒';
        headerRoomDesc.innerText = settings.desc || 'Özel oda';
        if (settings.wallpaper) {
            document.getElementById('messages').style.setProperty('--chat-wallpaper', `url('${settings.wallpaper}')`);
        } else {
            document.getElementById('messages').style.setProperty('--chat-wallpaper', 'none');
        }
    }
});

// === Sistem Mesajları ===
socket.on('user joined', (nick) => appendSystemMessage(`${nick} sohbete katıldı.`));
socket.on('user left', (nick) => {
    appendSystemMessage(`${nick} sohbetten ayrıldı.`);
    typingUsers.delete(nick);
    updateTypingIndicator();
});

function appendMessage(data, animate) {
    const isMe = data.nickname === myNickname;
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', isMe ? 'sent' : 'received');
    if (animate) msgDiv.classList.add('animate');
    msgDiv.setAttribute('data-msg-id', data.id);

    const score = (data.upvotes || 0) - (data.downvotes || 0);

    const isPrivate = roomData[currentRoom] && roomData[currentRoom].isPrivate;
    if (!isPrivate) {
        msgDiv.classList.add('post-style');
    }

    let imageHtml = '';
    if (data.image) {
        imageHtml = `<img src="${data.image}" class="message-image" alt="Eklenen resim">`;
    }

    let avatarHtml = `<div class="online-user-avatar" style="margin-right:0.8rem; background: var(--primary-color);">${data.nickname.charAt(0).toUpperCase()}</div>`;
    if (data.avatar) {
        if (data.avatar.length < 5) {
            avatarHtml = `<div class="online-user-avatar" style="margin-right:0.8rem; background: transparent; font-size: 1.5rem;">${data.avatar}</div>`;
        } else {
            avatarHtml = `<img src="${data.avatar}" alt="Avatar" style="width:28px;height:28px;border-radius:50%;margin-right:0.8rem;object-fit:cover;">`;
        }
    }

    msgDiv.innerHTML = `
        <div class="message-top">
            <div class="message-info" style="display:flex; align-items:center;">
                ${avatarHtml}
                <span class="sender" style="--sender-color: ${data.nameColor || 'var(--primary-color)'};">${isMe ? 'Sen' : data.nickname}</span>
                <span class="time" style="margin-left:auto;">${timeAgo(data.date)}</span>
            </div>
        </div>
        ${imageHtml}
        <div class="message-text">${highlightMentions(escapeHtml(data.message))}</div>
        <div class="message-actions">
            <button class="upvote-btn" data-id="${data.id}" title="Beğen">
                <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M12 19V5M5 12l7-7 7 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <span class="vote-score" data-score-id="${data.id}">${score}</span>
            <button class="downvote-btn" data-id="${data.id}" title="Beğenme">
                <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
        </div>
    `;

    msgDiv.querySelector('.upvote-btn').addEventListener('click', () => {
        socket.emit('vote message', { msgId: data.id, direction: 'up' });
    });
    msgDiv.querySelector('.downvote-btn').addEventListener('click', () => {
        socket.emit('vote message', { msgId: data.id, direction: 'down' });
    });

    messagesContainer.appendChild(msgDiv);
}

function appendSystemMessage(text) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message', 'system-msg', 'animate');
    msgDiv.innerText = text;
    messagesContainer.appendChild(msgDiv);
    scrollToBottom();
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.innerText = text;
    return div.innerHTML;
}

// ==============================
// 7. MESAJ OY GÜNCELLEMELERİ
// ==============================
socket.on('message voted', ({ id, upvotes, downvotes, score }) => {
    const scoreEl = document.querySelector(`[data-score-id="${id}"]`);
    if (scoreEl) scoreEl.innerText = score;
});

// Eski upvote event'ini de yakala (geriye uyum)
socket.on('message upvoted', ({ id, upvotes }) => {
    const scoreEl = document.querySelector(`[data-score-id="${id}"]`);
    if (scoreEl) scoreEl.innerText = upvotes;
});

// ==============================
// 8. ODA İSTATİSTİKLERİ
// ==============================
socket.on('room stats', (counts) => {
    let totalUsers = 0;
    let totalRooms = Object.keys(counts).length;

    document.querySelectorAll('[data-room-count]').forEach(el => {
        const room = el.getAttribute('data-room-count');
        const c = counts[room] || 0;
        el.innerText = c;
        if(counts[room]) totalUsers += c;
    });
    
    if (currentRoom) {
        headerOnlineCount.innerText = counts[currentRoom] || 0;
    }

    // Dashboard istatistiklerini de güncelle
    dashStatUsers.innerText = totalUsers;
    dashStatRooms.innerText = totalRooms;
});

// ==============================
// 9. YAZIYOR GÖSTERGESİ
// ==============================
messageInput.addEventListener('input', () => {
    socket.emit('typing');
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        socket.emit('stop typing');
    }, 2000);
});

socket.on('user typing', (nick) => {
    typingUsers.add(nick);
    updateTypingIndicator();
});

socket.on('user stop typing', (nick) => {
    typingUsers.delete(nick);
    updateTypingIndicator();
});

function updateTypingIndicator() {
    if (typingUsers.size === 0) {
        typingIndicator.classList.remove('visible');
        typingText.innerText = '';
    } else {
        const names = Array.from(typingUsers);
        let text = '';
        if (names.length === 1) text = `${names[0]} yazıyor`;
        else if (names.length === 2) text = `${names[0]} ve ${names[1]} yazıyor`;
        else text = `${names.length} kişi yazıyor`;
        typingText.innerText = text + '...';
        typingIndicator.classList.add('visible');
    }
}

// ==============================
// 10. ÇEVRİMİÇİ KULLANICI LİSTESİ VE ARKADAŞLAR
// ==============================
socket.on('friends list', (friends) => {
    myFriends = friends || [];
    renderFriendsList();
    renderOnlineUsers(); // Buton durumlarını güncelle
});

socket.on('online users', (users) => {
    allOnlineUsers = users || [];
    renderOnlineUsers();
    renderFriendsList(); // Çevrimiçi durumlarını güncelle
});

function renderFriendsList() {
    const friendListEl = document.getElementById('friend-list');
    if (!friendListEl) return;
    
    friendListEl.innerHTML = '';
    if (myFriends.length === 0) {
        friendListEl.innerHTML = '<li style="font-size: 0.8rem; padding: 0 1rem; color: var(--text-muted);">Henüz arkadaşın yok.</li>';
        return;
    }
    
    myFriends.forEach(nick => {
        const isOnline = allOnlineUsers.includes(nick);
        const li = document.createElement('li');
        li.classList.add('room-item');
        
        // DM odası adı mantığı
        const dmRoomName = [myNickname, nick].sort().join('-');
        
        li.innerHTML = `
            <span class="room-item-icon">💬</span>
            <span class="room-item-name" style="flex:1">${nick}</span>
            <span style="width: 8px; height: 8px; border-radius: 50%; background: ${isOnline ? 'var(--online-color)' : 'var(--text-muted)'}; margin-right: 10px;"></span>
        `;
        li.addEventListener('click', () => {
            // Sunucuya odayı kur/katıl isteği gönder
            socket.emit('create room', dmRoomName, (code) => {
                if (!roomData[dmRoomName]) {
                    roomData[dmRoomName] = { icon: '💬', name: dmRoomName, desc: `${nick} ile özel sohbet`, isPrivate: true, code: code };
                }
                joinRoom(dmRoomName);
            });
        });
        friendListEl.appendChild(li);
    });
}

function renderOnlineUsers() {
    onlineUsersList.innerHTML = '';
    if (allOnlineUsers.length === 0) {
        onlineUsersList.innerHTML = '<li class="no-users">Henüz kimse yok...</li>';
        return;
    }
    allOnlineUsers.forEach(nick => {
        const li = document.createElement('li');
        li.classList.add('online-user-item');
        const isMe = nick === myNickname;
        const isFriend = myFriends.includes(nick);
        
        li.innerHTML = `
            <div class="online-user-avatar">${nick.charAt(0).toUpperCase()}</div>
            <span class="online-user-name">${nick}${isMe ? ' (Sen)' : ''}</span>
            ${!isMe ? `<button class="friend-btn" data-nick="${nick}" style="background:none; border:none; cursor:pointer; color: ${isFriend ? 'var(--text-color)' : 'var(--text-muted)'}; margin-right: 5px;" title="${isFriend ? 'Arkadaşlardan Çıkar' : 'Arkadaş Ekle'}">${isFriend ? '✖' : '➕'}</button>` : ''}
            <span class="online-user-dot"></span>
        `;
        
        const btn = li.querySelector('.friend-btn');
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (isFriend) socket.emit('remove friend', nick);
                else socket.emit('add friend', nick);
            });
        }
        
        onlineUsersList.appendChild(li);
    });
}

// ==============================
// 11. PROFİL SAYFASI
// ==============================
const profileOverlay = document.getElementById('profile-overlay');
const openProfileBtn = document.getElementById('open-profile-btn');
const closeProfileBtn = document.getElementById('close-profile-btn');
const profileAvatar = document.getElementById('profile-avatar');
const profileName = document.getElementById('profile-name');
const profileBio = document.getElementById('profile-bio');
const statMessages = document.getElementById('stat-messages');
const statUpvotes = document.getElementById('stat-upvotes');
const statRooms = document.getElementById('stat-rooms');
const profileRoomsList = document.getElementById('profile-rooms-list');
const profileJoinTime = document.getElementById('profile-join-time');
const profileCurrentRoom = document.getElementById('profile-current-room');

let myStats = { messages: 0, upvotesReceived: 0 };

// Profili aç
openProfileBtn.addEventListener('click', () => {
    updateProfileData();
    profileOverlay.classList.add('visible');
});

// Profili kapat
closeProfileBtn.addEventListener('click', () => {
    profileOverlay.classList.remove('visible');
});

// Overlay'e tıklayınca kapat
profileOverlay.addEventListener('click', (e) => {
    if (e.target === profileOverlay) {
        profileOverlay.classList.remove('visible');
    }
});

// ESC tuşu ile kapat
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && profileOverlay.classList.contains('visible')) {
        profileOverlay.classList.remove('visible');
    }
});

// Bio'yu localStorage'a kaydet
profileBio.addEventListener('input', () => {
    localStorage.setItem('crow_bio_' + myNickname, profileBio.value);
});

function updateProfileData() {
    profileAvatar.innerText = myNickname.charAt(0).toUpperCase();
    profileName.innerText = myNickname;
    profileCurrentRoom.innerText = currentRoom || '--';
    profileJoinTime.innerText = loginTime;

    // Bio'yu yükle
    const savedBio = localStorage.getItem('crow_bio_' + myNickname);
    if (savedBio) profileBio.value = savedBio;

    // İstatistikleri güncelle
    statMessages.innerText = myStats.messages;
    statUpvotes.innerText = myStats.upvotesReceived;
    statRooms.innerText = recentRooms.length;

    // Ziyaret edilen odalar
    profileRoomsList.innerHTML = '';
    recentRooms.forEach(room => {
        const info = roomData[room] || { icon: '🔒', name: room };
        const li = document.createElement('li');
        li.innerText = `${info.icon} ${info.name}`;
        profileRoomsList.appendChild(li);
    });
}

// Login zamanını kaydet (doLogin fonksiyonunu zenginleştir)
const originalDoLogin = doLogin;
doLogin = async function() {
    await originalDoLogin();
    loginTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// Mesaj gönderme sayacı
// Upvote aldığında sayaç artır
socket.on('message upvoted', ({ id, upvotes }) => {
    // Kendi mesajımıza gelen upvote'u say
    const msgEl = document.querySelector(`.message[data-msg-id="${id}"]`);
    if (msgEl && msgEl.classList.contains('sent')) {
        myStats.upvotesReceived = (myStats.upvotesReceived || 0) + 1;
    }
});

// ==============================
// 12. AYARLAR VE ÖZELLEŞTİRME
// ==============================
const appSettingsBtn = document.getElementById('app-settings-btn');
const appSettingsOverlay = document.getElementById('app-settings-overlay');
const closeAppSettingsBtn = document.getElementById('close-app-settings-btn');
const saveAppSettingsBtn = document.getElementById('save-app-settings-btn');

const roomSettingsBtn = document.getElementById('room-settings-btn');
const roomSettingsOverlay = document.getElementById('room-settings-overlay');
const closeRoomSettingsBtn = document.getElementById('close-room-settings-btn');
const saveRoomSettingsBtn = document.getElementById('save-room-settings-btn');

const saveProfileBtn = document.getElementById('save-profile-btn');

// --- Uygulama Ayarları Mantığı ---
function loadAppSettings() {
    const theme = localStorage.getItem('crow_theme') || 'light';
    const accent = localStorage.getItem('crow_accent') || '#000000';
    const fontsize = localStorage.getItem('crow_fontsize') || '16px';
    
    document.getElementById('as-theme').value = theme;
    document.getElementById('as-accent').value = accent;
    document.getElementById('as-fontsize').value = fontsize;
    
    applyAppSettings(theme, accent, fontsize);
}

function applyAppSettings(theme, accent, fontsize) {
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
    document.documentElement.style.setProperty('--primary-color', accent);
    document.documentElement.style.setProperty('--primary-hover', accent);
    document.documentElement.style.setProperty('--font-base-size', fontsize);
}

// Başlangıçta ayarları yükle
loadAppSettings();

appSettingsBtn.addEventListener('click', () => {
    appSettingsOverlay.classList.add('visible');
});

closeAppSettingsBtn.addEventListener('click', () => {
    appSettingsOverlay.classList.remove('visible');
});

saveAppSettingsBtn.addEventListener('click', () => {
    const theme = document.getElementById('as-theme').value;
    const accent = document.getElementById('as-accent').value;
    const fontsize = document.getElementById('as-fontsize').value;
    
    localStorage.setItem('crow_theme', theme);
    localStorage.setItem('crow_accent', accent);
    localStorage.setItem('crow_fontsize', fontsize);
    
    applyAppSettings(theme, accent, fontsize);
    appSettingsOverlay.classList.remove('visible');
});

// --- Profil Güncelleme ---
socket.on('profile data', (data) => {
    if (data.avatar) document.getElementById('profile-avatar-input').value = data.avatar;
    if (data.nameColor) document.getElementById('profile-color-input').value = data.nameColor;
    
    if (data.avatar) {
        if (data.avatar.length < 5) profileAvatar.innerText = data.avatar;
        else profileAvatar.innerHTML = `<img src="${data.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    }
});

saveProfileBtn.addEventListener('click', () => {
    const avatar = document.getElementById('profile-avatar-input').value.trim();
    const nameColor = document.getElementById('profile-color-input').value;
    
    socket.emit('update profile', { avatar: avatar || null, nameColor });
    alert('Profil güncellendi!');
});

socket.on('profile updated', ({ nickname, profile }) => {
    if (nickname === myNickname && profile.avatar) {
        if (profile.avatar.length < 5) profileAvatar.innerText = profile.avatar;
        else profileAvatar.innerHTML = `<img src="${profile.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
    }
});

// --- Oda Ayarları (Sadece Kurucu) ---
roomSettingsBtn.addEventListener('click', () => {
    roomSettingsOverlay.classList.add('visible');
});

closeRoomSettingsBtn.addEventListener('click', () => {
    roomSettingsOverlay.classList.remove('visible');
});

saveRoomSettingsBtn.addEventListener('click', () => {
    const icon = document.getElementById('rs-icon').value.trim() || '🔒';
    const desc = document.getElementById('rs-desc').value.trim() || 'Özel oda';
    const wallpaper = document.getElementById('rs-wallpaper').value.trim() || null;
    
    socket.emit('update room settings', { room: currentRoom, icon, desc, wallpaper });
    roomSettingsOverlay.classList.remove('visible');
});

// ==============================
// 14. YARD.İM FONKSİYONLARI
// ==============================
function timeAgo(dateStr) {
    if (!dateStr) return '';
    const now = new Date();
    const date = new Date(dateStr);
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return 'az önce';
    if (diff < 3600) return Math.floor(diff / 60) + ' dk önce';
    if (diff < 86400) return Math.floor(diff / 3600) + ' sa. önce';
    if (diff < 604800) return Math.floor(diff / 86400) + ' gün önce';
    return date.toLocaleDateString('tr-TR');
}

function highlightMentions(html) {
    return html.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
}

// ==============================
// 15. FEED (GÖNDERİ) SİSTEMİ
// ==============================
const viewTabs = document.getElementById('view-tabs');
const chatContentArea = document.getElementById('chat-content-area');
const feedContentArea = document.getElementById('feed-content-area');
const feedPosts = document.getElementById('feed-posts');
let postImageBase64 = null;

// Sekme geçişi
viewTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.view-tab');
    if (!tab) return;
    viewTabs.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const view = tab.getAttribute('data-view');
    if (view === 'chat') {
        chatContentArea.style.display = 'flex';
        feedContentArea.style.display = 'none';
    } else {
        chatContentArea.style.display = 'none';
        feedContentArea.style.display = 'flex';
        loadFeedPosts();
    }
});

// Gönderileri yükle
function loadFeedPosts() {
    socket.emit('get posts', currentRoom, (posts) => {
        feedPosts.innerHTML = '';
        if (!posts || posts.length === 0) {
            feedPosts.innerHTML = '<p style="color: var(--text-muted); text-align:center; padding: 2rem;">Henüz gönderi yok. İlk sen paylaş!</p>';
            return;
        }
        posts.forEach(p => appendPostCard(p));
    });
}

// Gönderi kartı oluştur
function appendPostCard(post) {
    const card = document.createElement('div');
    card.classList.add('post-card');
    card.setAttribute('data-post-id', post.id);
    const score = (post.upvotes || 0) - (post.downvotes || 0);
    const commentCount = (post.comments || []).length;

    let imageHtml = '';
    if (post.image) {
        imageHtml = `<img src="${post.image}" class="post-image" alt="Gönderi resmi">`;
    }

    card.innerHTML = `
        <div class="post-header">
            <div class="online-user-avatar" style="width:28px;height:28px;font-size:0.75rem;">${post.author.charAt(0).toUpperCase()}</div>
            <span class="post-author" style="color: ${post.nameColor || 'var(--text-color)'}">${post.author}</span>
            ${post.flair ? `<span class="post-flair">${post.flair}</span>` : ''}
            <span class="post-time">${timeAgo(post.date)}</span>
        </div>
        ${post.title ? `<div class="post-title">${escapeHtml(post.title)}</div>` : ''}
        <div class="post-content">${highlightMentions(escapeHtml(post.content))}</div>
        ${imageHtml}
        <div class="post-actions">
            <button class="post-action-btn post-upvote" data-id="${post.id}" title="Yukarı Oy">⬆</button>
            <span class="vote-score" data-post-score="${post.id}">${score}</span>
            <button class="post-action-btn post-downvote" data-id="${post.id}" title="Aşağı Oy">⬇</button>
            <button class="post-action-btn post-comment-toggle" data-id="${post.id}">💬 ${commentCount}</button>
            <button class="post-action-btn post-bookmark" data-id="${post.id}">🔖</button>
        </div>
        <div class="post-comments" id="comments-${post.id}" style="display:none;">
            <div class="comment-form">
                <input type="text" placeholder="Yorum yaz... (@isim ile etiketle)" id="comment-input-${post.id}">
                <button class="comment-submit-btn" data-id="${post.id}">Gönder</button>
            </div>
            <div class="comments-list" id="comments-list-${post.id}"></div>
        </div>
    `;

    // Oylama
    card.querySelector('.post-upvote').addEventListener('click', () => {
        socket.emit('vote post', { postId: post.id, direction: 'up' });
    });
    card.querySelector('.post-downvote').addEventListener('click', () => {
        socket.emit('vote post', { postId: post.id, direction: 'down' });
    });

    // Yorum toggle
    card.querySelector('.post-comment-toggle').addEventListener('click', () => {
        const commentsDiv = card.querySelector(`#comments-${post.id}`);
        commentsDiv.style.display = commentsDiv.style.display === 'none' ? 'block' : 'none';
    });

    // Bookmark
    card.querySelector('.post-bookmark').addEventListener('click', () => {
        socket.emit('bookmark post', post.id);
    });

    // Yorum gönder
    card.querySelector('.comment-submit-btn').addEventListener('click', () => {
        const input = card.querySelector(`#comment-input-${post.id}`);
        const text = input.value.trim();
        if (!text) return;
        socket.emit('add comment', { postId: post.id, text }, (comment) => {
            input.value = '';
        });
    });

    // Enter ile yorum gönder
    card.querySelector(`#comment-input-${post.id}`).addEventListener('keypress', (e) => {
        if (e.key === 'Enter') card.querySelector('.comment-submit-btn').click();
    });

    // Mevcut yorumları render et
    if (post.comments && post.comments.length > 0) {
        const listEl = card.querySelector(`#comments-list-${post.id}`);
        post.comments.forEach(c => {
            listEl.appendChild(createCommentEl(c));
        });
    }

    feedPosts.appendChild(card);
}

function createCommentEl(c) {
    const el = document.createElement('div');
    el.classList.add('comment-item');
    el.innerHTML = `
        <span class="comment-author" style="color: ${c.nameColor || 'var(--text-color)'}">${c.author}</span>
        <span class="comment-text">${highlightMentions(escapeHtml(c.text))}</span>
        <span class="comment-time">${timeAgo(c.date)}</span>
    `;
    return el;
}

// Socket event: yeni gönderi
socket.on('new post', (post) => {
    if (feedContentArea.style.display !== 'none') {
        feedPosts.insertBefore(appendPostCardAndReturn(post), feedPosts.firstChild);
    }
});

function appendPostCardAndReturn(post) {
    const tempDiv = document.createElement('div');
    feedPosts.appendChild(tempDiv); // geçici
    appendPostCard(post);
    const card = feedPosts.lastChild;
    feedPosts.removeChild(tempDiv);
    return card;
}

// Socket event: gönderi oylanması
socket.on('post voted', ({ id, score }) => {
    const el = document.querySelector(`[data-post-score="${id}"]`);
    if (el) el.innerText = score;
});

// Socket event: yeni yorum
socket.on('new comment', ({ postId, comment }) => {
    const listEl = document.querySelector(`#comments-list-${postId}`);
    if (listEl) {
        listEl.appendChild(createCommentEl(comment));
    }
    // Yorum sayısını güncelle
    const toggleBtn = document.querySelector(`.post-comment-toggle[data-id="${postId}"]`);
    if (toggleBtn) {
        const count = listEl ? listEl.children.length : 0;
        toggleBtn.innerHTML = `💬 ${count}`;
    }
});

// Bookmark güncellemesi
socket.on('bookmark updated', ({ postId, bookmarked }) => {
    const btn = document.querySelector(`.post-bookmark[data-id="${postId}"]`);
    if (btn) {
        btn.classList.toggle('bookmarked', bookmarked);
        btn.innerHTML = bookmarked ? '🔖✅' : '🔖';
    }
});

// Gönderi oluşturma
document.getElementById('submit-post-btn').addEventListener('click', () => {
    const title = document.getElementById('post-title-input').value.trim();
    const content = document.getElementById('post-content-input').value.trim();
    if (!title && !content && !postImageBase64) return;
    
    socket.emit('create post', {
        room: currentRoom,
        title,
        content,
        image: postImageBase64
    }, (post) => {
        document.getElementById('post-title-input').value = '';
        document.getElementById('post-content-input').value = '';
        postImageBase64 = null;
        document.getElementById('post-image-preview').style.display = 'none';
    });
});

// Gönderi resim yükleme
document.getElementById('post-image-upload').addEventListener('change', function() {
    const file = this.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            postImageBase64 = e.target.result;
            const preview = document.getElementById('post-image-preview');
            preview.querySelector('img').src = postImageBase64;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
});

document.getElementById('remove-post-image').addEventListener('click', () => {
    postImageBase64 = null;
    document.getElementById('post-image-preview').style.display = 'none';
});

// Odaya girildiğinde feed sekmesini göster/gizle
function updateViewTabs() {
    const isPrivate = roomData[currentRoom] && roomData[currentRoom].isPrivate;
    viewTabs.style.display = isPrivate ? 'none' : 'flex';
    // Varsayılan olarak sohbet sekmesini aktif yap
    chatContentArea.style.display = 'flex';
    feedContentArea.style.display = 'none';
    viewTabs.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
    const chatTab = viewTabs.querySelector('[data-view="chat"]');
    if (chatTab) chatTab.classList.add('active');
}

// ==============================
// 16. BİLDİRİM SİSTEMİ
// ==============================
const notifBtn = document.getElementById('notif-btn');
const notifBadge = document.getElementById('notif-badge');
const notifPanel = document.getElementById('notif-panel');
const notifList = document.getElementById('notif-list');
let notifData = [];

notifBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (notifPanel.style.display === 'none') {
        notifPanel.style.display = 'block';
        socket.emit('get notifications', (notifs) => {
            notifData = notifs || [];
            renderNotifications();
        });
    } else {
        notifPanel.style.display = 'none';
    }
});

document.addEventListener('click', (e) => {
    if (!notifPanel.contains(e.target) && e.target !== notifBtn) {
        notifPanel.style.display = 'none';
    }
});

document.getElementById('mark-all-read-btn').addEventListener('click', () => {
    socket.emit('mark notifications read');
    notifData.forEach(n => n.read = true);
    renderNotifications();
    notifBadge.style.display = 'none';
});

socket.on('notification', (notif) => {
    notifData.unshift(notif);
    updateNotifBadge();
});

socket.on('notifications list', (notifs) => {
    notifData = notifs || [];
    updateNotifBadge();
});

function updateNotifBadge() {
    const unread = notifData.filter(n => !n.read).length;
    if (unread > 0) {
        notifBadge.innerText = unread;
        notifBadge.style.display = 'flex';
    } else {
        notifBadge.style.display = 'none';
    }
}

function renderNotifications() {
    notifList.innerHTML = '';
    if (notifData.length === 0) {
        notifList.innerHTML = '<li style="padding: 1rem; text-align:center; color: var(--text-muted);">Bildirim yok.</li>';
        return;
    }
    notifData.forEach(n => {
        const li = document.createElement('li');
        li.classList.add('notif-item');
        if (!n.read) li.classList.add('unread');
        li.innerHTML = `
            <div>${n.text || 'Bildirim'}</div>
            <div class="notif-time">${timeAgo(n.time)}</div>
        `;
        notifList.appendChild(li);
    });
    updateNotifBadge();
}

