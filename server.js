const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto'); // Davet kodu üretmek için

const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const bcrypt = require('bcrypt');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
// Resim yüklemeleri (base64) için payload limitini 10MB'a çıkarıyoruz
const io = new Server(server, { maxHttpBufferSize: 1e7 });

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'crow_super_secret_key_123!',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // HTTPS kullanıyorsan true yap
});
app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());

// Socket.io ile Session paylaşımı
io.engine.use(sessionMiddleware);

// Statik dosyaları "public" klasöründen servis et
app.use(express.static(path.join(__dirname, 'public')));

// ==============================
// VERİTABANI BAĞLANTISI (MongoDB)
// ==============================
const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/crow';
console.log('🔍 MONGO_URI tanımlı mı?', !!process.env.MONGO_URI);
console.log('🔍 Bağlanılacak adres:', mongoURI.substring(0, 40) + '...');

mongoose.connect(mongoURI)
    .then(() => console.log('✅ MongoDB veritabanına bağlanıldı.'))
    .catch(err => console.error('❌ MongoDB bağlantı hatası:', err.message));

// Kullanıcı Şeması
const userSchema = new mongoose.Schema({
    nickname: { type: String, unique: true },
    email: { type: String, unique: true },
    password: { type: String },
    googleId: { type: String },
    facebookId: { type: String },
    avatar: { type: String, default: '👤' },
    nameColor: { type: String, default: '#6366f1' }
});
const User = mongoose.model('User', userSchema);

// Passport Yerel Strateji
passport.use(new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
    try {
        const user = await User.findOne({ email });
        if (!user) return done(null, false, { message: 'E-posta bulunamadı.' });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return done(null, false, { message: 'Şifre hatalı.' });
        return done(null, user);
    } catch (err) { return done(err); }
}));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    try { const user = await User.findById(id); done(null, user); } catch(err) { done(err); }
});

// ==============================
// KİMLİK DOĞRULAMA ROTALARI (API)
// ==============================
app.post('/api/register', async (req, res) => {
    try {
        const { nickname, email, password } = req.body;
        if (!nickname || !email || !password) return res.status(400).json({error: 'Tüm alanları doldurun.'});
        const existing = await User.findOne({ $or: [{ email }, { nickname }] });
        if (existing) return res.status(400).json({error: 'E-posta veya Takma ad zaten kullanılıyor.'});
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ nickname, email, password: hashedPassword });
        await user.save();
        res.status(201).json({message: 'Kayıt başarılı! Lütfen giriş yapın.'});
    } catch (err) { 
        console.error("Kayıt Hatası:", err);
        res.status(500).json({error: 'Sunucu hatası.'}); 
    }
});

app.post('/api/login', (req, res, next) => {
    passport.authenticate('local', (err, user, info) => {
        if (err) {
            console.error("Giriş Hatası:", err);
            return res.status(500).json({error: 'Sunucu hatası'});
        }
        if (!user) return res.status(401).json({error: info.message});
        req.logIn(user, (err) => {
            if (err) {
                console.error("Oturum Açma Hatası:", err);
                return res.status(500).json({error: 'Oturum açılamadı'});
            }
            res.json({ message: 'Giriş başarılı', user: { nickname: user.nickname, avatar: user.avatar } });
        });
    })(req, res, next);
});

app.get('/api/me', (req, res) => {
    if (req.user) res.json({ loggedIn: true, user: { nickname: req.user.nickname, avatar: req.user.avatar, nameColor: req.user.nameColor } });
    else res.json({ loggedIn: false });
});

app.post('/api/logout', (req, res) => {
    req.logout((err) => {
        if (err) return res.status(500).json({error: 'Çıkış yapılamadı.'});
        res.json({message: 'Çıkış yapıldı.'});
    });
});

// ==============================
// VERİ KALICILIĞI (Eski JSON Sistemi - Aşama aşama MongoDB'ye geçilecek)
// ==============================
const DATA_DIR = path.join(__dirname, 'data');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const POSTS_FILE = path.join(DATA_DIR, 'posts.json');
const NOTIFS_FILE = path.join(DATA_DIR, 'notifications.json');

// Klasör yoksa oluştur
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

function loadJSON(filePath, fallback) {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (e) {
        console.error(`Dosya okuma hatası (${filePath}):`, e.message);
    }
    return fallback;
}

function saveJSON(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error(`Dosya yazma hatası (${filePath}):`, e.message);
    }
}

// Kalıcı veriler
const messagesDB = loadJSON(MESSAGES_FILE, {});
const customRoomsDB = loadJSON(ROOMS_FILE, {});
const usersDB = loadJSON(USERS_FILE, {});
const postsDB = loadJSON(POSTS_FILE, {}); // { roomName: [postObj, ...] }
const notifsDB = loadJSON(NOTIFS_FILE, {}); // { nickname: [notifObj, ...] }

// Eski tip odaları yeni tipe taşı (Migration)
for (const [room, data] of Object.entries(customRoomsDB)) {
    if (typeof data === 'string') {
        customRoomsDB[room] = { code: data, creator: "Sistem", icon: "🔒", desc: "Özel oda", wallpaper: null };
    }
}
saveJSON(ROOMS_FILE, customRoomsDB);

const MAX_MESSAGES_PER_ROOM = 100;
let messageIdCounter = 0;
let postIdCounter = 0;

// Her mesajın/gönderinin ID'sini tarayarak en yüksek ID'yi bul
Object.values(messagesDB).forEach(msgs => {
    msgs.forEach(m => { if (m.id > messageIdCounter) messageIdCounter = m.id; });
});
Object.values(postsDB).forEach(posts => {
    posts.forEach(p => {
        if (p.id > postIdCounter) postIdCounter = p.id;
        if (p.comments) p.comments.forEach(c => { if (c.id > postIdCounter) postIdCounter = c.id; });
    });
});

// Bildirim oluştur
function addNotification(targetNick, notif) {
    if (!notifsDB[targetNick]) notifsDB[targetNick] = [];
    notifsDB[targetNick].unshift({ ...notif, time: new Date().toISOString(), read: false });
    if (notifsDB[targetNick].length > 50) notifsDB[targetNick] = notifsDB[targetNick].slice(0, 50);
    saveJSON(NOTIFS_FILE, notifsDB);
    // Eğer o kullanıcı çevrimiçi ise bildirimini anında gönder
    for (const [sid, nick] of onlineUsers.entries()) {
        if (nick === targetNick) {
            io.to(sid).emit('notification', notif);
            io.to(sid).emit('notifications list', notifsDB[targetNick]);
            break;
        }
    }
}

// @mention algılama
function extractMentions(text) {
    const matches = text.match(/@(\w+)/g);
    if (!matches) return [];
    return matches.map(m => m.slice(1));
}

// Çevrimiçi kullanıcı takibi
const roomOnlineUsers = {}; // { roomName: { socketId: nickname } }
const onlineUsers = new Map(); // Tüm çevrimiçi kullanıcıları genel olarak tutmak için

function getOnlineList(roomName) {
    if (!roomOnlineUsers[roomName]) return [];
    return Object.values(roomOnlineUsers[roomName]);
}

function getRoomCounts() {
    const counts = {};
    for (const [room, users] of Object.entries(roomOnlineUsers)) {
        counts[room] = Object.keys(users).length;
    }
    return counts;
}

function broadcastRoomStats() {
    io.emit('room stats', getRoomCounts());
}

function broadcastOnlineUsers(roomName) {
    io.to(roomName).emit('online users', getOnlineList(roomName));
}

// Kalıcı mesajı kaydet
function saveMessage(roomName, msgObj) {
    if (!messagesDB[roomName]) messagesDB[roomName] = [];
    messagesDB[roomName].push(msgObj);
    // Oda başına max mesaj sınırı
    if (messagesDB[roomName].length > MAX_MESSAGES_PER_ROOM) {
        messagesDB[roomName] = messagesDB[roomName].slice(-MAX_MESSAGES_PER_ROOM);
    }
    saveJSON(MESSAGES_FILE, messagesDB);
}

// Özel odayı kaydet ve davet kodunu döndür
function saveCustomRoom(roomName, creator) {
    if (!customRoomsDB[roomName]) {
        // Rastgele 6 haneli kod (örnek: A7B2X9)
        const code = crypto.randomBytes(3).toString('hex').toUpperCase();
        customRoomsDB[roomName] = {
            code: code,
            creator: creator,
            icon: '🔒',
            desc: 'Özel oda',
            wallpaper: null
        };
        saveJSON(ROOMS_FILE, customRoomsDB);
        return code;
    }
    return customRoomsDB[roomName].code;
}

// Kullanıcı profilini kaydet
function saveUserProfile(nickname, data) {
    if (!usersDB[nickname]) usersDB[nickname] = { friends: [] };
    if (data.avatar !== undefined) usersDB[nickname].avatar = data.avatar;
    if (data.nameColor !== undefined) usersDB[nickname].nameColor = data.nameColor;
    saveJSON(USERS_FILE, usersDB);
}

// Arkadaş ekle/çıkar
function toggleFriend(nickname, friendName, add) {
    if (!usersDB[nickname]) usersDB[nickname] = { friends: [] };
    if (!usersDB[nickname].friends) usersDB[nickname].friends = [];
    
    const friends = usersDB[nickname].friends;
    if (add && !friends.includes(friendName)) {
        friends.push(friendName);
    } else if (!add) {
        usersDB[nickname].friends = friends.filter(f => f !== friendName);
    }
    saveJSON(USERS_FILE, usersDB);
    return usersDB[nickname].friends;
}

// ==============================
// API ENDPOINT'LERİ
// ==============================

// Odaların sadece kendisinin katıldığı kısımları istemci yöneteceği için
// grupları (Genel vs) istemcide hardcode ettik.
// Oda listesini ve kodlarını istemciye vermiyoruz, davet ile katılacaklar.
app.get('/api/verify-code/:code', (req, res) => {
    const code = req.params.code.toUpperCase();
    const roomName = Object.keys(customRoomsDB).find(key => customRoomsDB[key].code === code);
    if (roomName) {
        res.json({ success: true, roomName, info: customRoomsDB[roomName] });
    } else {
        res.json({ success: false, error: 'Geçersiz davet kodu' });
    }
});

app.get('/api/room-info/:room', (req, res) => {
    const room = req.params.room;
    if (customRoomsDB[room]) {
        res.json(customRoomsDB[room]);
    } else {
        res.json({});
    }
});

// ==============================
// SOCKET.IO
// ==============================
io.on('connection', (socket) => {
    console.log('Bağlandı:', socket.id);

    // Bağlanır bağlanmaz oda istatistiklerini gönder
    socket.emit('room stats', getRoomCounts());

    // Kullanıcı odaya katıldığında
    socket.on('join room', ({ nickname, roomName }) => {
        // Eski odadan ayrıl
        if (socket.roomName && roomOnlineUsers[socket.roomName]) {
            delete roomOnlineUsers[socket.roomName][socket.id];
            socket.to(socket.roomName).emit('user left', socket.nickname);
            broadcastOnlineUsers(socket.roomName);
            socket.leave(socket.roomName);
        }

        socket.nickname = nickname;
        socket.roomName = roomName;

        // Yeni odaya katıl
        socket.join(roomName);
        if (!roomOnlineUsers[roomName]) roomOnlineUsers[roomName] = {};
        roomOnlineUsers[roomName][socket.id] = nickname;

        console.log(`${nickname} → ${roomName}`);

        // Mesaj geçmişini gönder (son 50 mesaj)
        const history = (messagesDB[roomName] || []).slice(-50);
        socket.emit('message history', history);

        // Odadaki diğer herkese yeni birinin katıldığını bildir
        socket.to(roomName).emit('user joined', nickname);

        // Herkese güncel istatistikleri gönder
        broadcastRoomStats();
        broadcastOnlineUsers(roomName);
    });

    // Özel oda oluşturma
    socket.on('create room', (roomName, callback) => {
        const code = saveCustomRoom(roomName, socket.nickname || 'Anonim');
        if(typeof callback === 'function') callback(code, customRoomsDB[roomName]);
    });

    // Mesaj alma ve iletme (Odaya özel, resim destekli)
    socket.on('chat message', (data) => {
        const msgId = ++messageIdCounter;
        const nick = socket.nickname || 'Anonim';
        const userProfile = usersDB[nick] || {};
        
        const messageData = {
            id: msgId,
            nickname: nick,
            avatar: userProfile.avatar || null,
            nameColor: userProfile.nameColor || '#000000',
            message: data.text || '',
            image: data.image || null,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            date: new Date().toISOString(),
            upvotes: 0,
            downvotes: 0,
            voters: {} // { nickname: 'up' | 'down' }
        };

        // Kalıcı olarak kaydet
        saveMessage(socket.roomName, messageData);

        // İstemciye gönderirken voters dizisini gizle
        const clientData = { ...messageData };
        delete clientData.voters;
        io.to(socket.roomName).emit('chat message', clientData);
    });

    // Mesaj oylama (Upvote / Downvote)
    socket.on('vote message', ({ msgId, direction }) => {
        for (const roomMsgs of Object.values(messagesDB)) {
            const msg = roomMsgs.find(m => m.id === msgId);
            if (msg) {
                if (!msg.voters || Array.isArray(msg.voters)) msg.voters = {};
                const prev = msg.voters[socket.nickname];
                if (prev === direction) {
                    delete msg.voters[socket.nickname]; // Aynı yöne tekrar basınca kaldır
                } else {
                    msg.voters[socket.nickname] = direction;
                }
                msg.upvotes = Object.values(msg.voters).filter(v => v === 'up').length;
                msg.downvotes = Object.values(msg.voters).filter(v => v === 'down').length;
                saveJSON(MESSAGES_FILE, messagesDB);
                io.to(socket.roomName).emit('message voted', {
                    id: msgId,
                    upvotes: msg.upvotes,
                    downvotes: msg.downvotes,
                    score: msg.upvotes - msg.downvotes
                });
                break;
            }
        }
    });

    // ==============================
    // GÖNDERİ (POST) SİSTEMİ
    // ==============================
    socket.on('create post', (data, callback) => {
        if (!socket.nickname) return;
        const postId = ++postIdCounter;
        const room = data.room || socket.roomName;
        const userProfile = usersDB[socket.nickname] || {};
        const post = {
            id: postId,
            author: socket.nickname,
            avatar: userProfile.avatar || null,
            nameColor: userProfile.nameColor || '#000000',
            room: room,
            title: data.title || '',
            content: data.content || '',
            image: data.image || null,
            flair: data.flair || null,
            date: new Date().toISOString(),
            upvotes: 0,
            downvotes: 0,
            voters: {},
            comments: [],
            bookmarks: []
        };
        if (!postsDB[room]) postsDB[room] = [];
        postsDB[room].push(post);
        saveJSON(POSTS_FILE, postsDB);

        // @mention bildirimleri
        const mentions = extractMentions(post.content);
        mentions.forEach(nick => {
            if (nick !== socket.nickname) {
                addNotification(nick, { type: 'mention', from: socket.nickname, postId: postId, room: room, text: `${socket.nickname} seni bir gönderide etiketledi.` });
            }
        });

        io.to(room).emit('new post', post);
        if (typeof callback === 'function') callback(post);
    });

    socket.on('get posts', (room, callback) => {
        const posts = (postsDB[room] || []).slice(-50).reverse();
        if (typeof callback === 'function') callback(posts);
    });

    socket.on('vote post', ({ postId, direction }) => {
        for (const roomPosts of Object.values(postsDB)) {
            const post = roomPosts.find(p => p.id === postId);
            if (post) {
                if (!post.voters || Array.isArray(post.voters)) post.voters = {};
                const prev = post.voters[socket.nickname];
                if (prev === direction) {
                    delete post.voters[socket.nickname];
                } else {
                    post.voters[socket.nickname] = direction;
                }
                post.upvotes = Object.values(post.voters).filter(v => v === 'up').length;
                post.downvotes = Object.values(post.voters).filter(v => v === 'down').length;
                saveJSON(POSTS_FILE, postsDB);
                io.to(post.room).emit('post voted', {
                    id: postId,
                    upvotes: post.upvotes,
                    downvotes: post.downvotes,
                    score: post.upvotes - post.downvotes
                });
                
                // Gönderi sahibine bildirim
                if (direction === 'up' && post.author !== socket.nickname) {
                    addNotification(post.author, { type: 'upvote', from: socket.nickname, postId, room: post.room, text: `${socket.nickname} gönderine oy verdi.` });
                }
                break;
            }
        }
    });

    socket.on('add comment', ({ postId, text, parentId }, callback) => {
        if (!socket.nickname || !text) return;
        for (const roomPosts of Object.values(postsDB)) {
            const post = roomPosts.find(p => p.id === postId);
            if (post) {
                const commentId = ++postIdCounter;
                const userProfile = usersDB[socket.nickname] || {};
                const comment = {
                    id: commentId,
                    author: socket.nickname,
                    avatar: userProfile.avatar || null,
                    nameColor: userProfile.nameColor || '#000000',
                    text: text,
                    parentId: parentId || null,
                    date: new Date().toISOString(),
                    upvotes: 0,
                    downvotes: 0,
                    voters: {}
                };
                post.comments.push(comment);
                saveJSON(POSTS_FILE, postsDB);

                io.to(post.room).emit('new comment', { postId, comment });
                
                // Gönderi sahibine bildirim
                if (post.author !== socket.nickname) {
                    addNotification(post.author, { type: 'comment', from: socket.nickname, postId, room: post.room, text: `${socket.nickname} gönderine yorum yaptı: "${text.substring(0, 40)}..."` });
                }

                // @mention
                const mentions = extractMentions(text);
                mentions.forEach(nick => {
                    if (nick !== socket.nickname && nick !== post.author) {
                        addNotification(nick, { type: 'mention', from: socket.nickname, postId, room: post.room, text: `${socket.nickname} seni bir yorumda etiketledi.` });
                    }
                });

                if (typeof callback === 'function') callback(comment);
                break;
            }
        }
    });

    // Bookmark
    socket.on('bookmark post', (postId) => {
        for (const roomPosts of Object.values(postsDB)) {
            const post = roomPosts.find(p => p.id === postId);
            if (post) {
                if (!post.bookmarks) post.bookmarks = [];
                const idx = post.bookmarks.indexOf(socket.nickname);
                if (idx >= 0) post.bookmarks.splice(idx, 1);
                else post.bookmarks.push(socket.nickname);
                saveJSON(POSTS_FILE, postsDB);
                socket.emit('bookmark updated', { postId, bookmarked: post.bookmarks.includes(socket.nickname) });
                break;
            }
        }
    });

    // Bildirimler
    socket.on('get notifications', (callback) => {
        if (typeof callback === 'function') {
            callback(notifsDB[socket.nickname] || []);
        }
    });

    socket.on('mark notifications read', () => {
        if (notifsDB[socket.nickname]) {
            notifsDB[socket.nickname].forEach(n => n.read = true);
            saveJSON(NOTIFS_FILE, notifsDB);
        }
    });

    // Yazıyor göstergesi
    socket.on('set nickname', (nick) => {
        socket.nickname = nick;
        onlineUsers.set(socket.id, nick);
        if (!usersDB[nick]) {
            usersDB[nick] = { avatar: null, nameColor: '#000000', friends: [] };
            saveJSON(USERS_FILE, usersDB);
        }
        if (!usersDB[nick].friends) usersDB[nick].friends = [];
        
        io.emit('online users', Array.from(new Set(onlineUsers.values())));
        
        socket.emit('profile data', usersDB[nick]);
        socket.emit('friends list', usersDB[nick].friends);
    });

    // Profil güncelleme
    socket.on('update profile', (data) => {
        if (!socket.nickname) return;
        saveUserProfile(socket.nickname, data);
        // Herkese yeni profili bildir ki mevcut mesajlardaki renkler/avatarlar güncellenebilsin
        io.emit('profile updated', { nickname: socket.nickname, profile: usersDB[socket.nickname] });
    });

    // Oda ayarları güncelleme
    socket.on('update room settings', (data) => {
        const room = data.room;
        if (customRoomsDB[room] && customRoomsDB[room].creator === socket.nickname) {
            if (data.icon !== undefined) customRoomsDB[room].icon = data.icon;
            if (data.desc !== undefined) customRoomsDB[room].desc = data.desc;
            if (data.wallpaper !== undefined) customRoomsDB[room].wallpaper = data.wallpaper;
            saveJSON(ROOMS_FILE, customRoomsDB);
            io.to(room).emit('room settings updated', { room, settings: customRoomsDB[room] });
        }
    });

    socket.on('typing', () => {
        if (socket.roomName) {
            socket.to(socket.roomName).emit('user typing', socket.nickname);
        }
    });

    socket.on('stop typing', () => {
        if (socket.roomName) {
            socket.to(socket.roomName).emit('user stop typing', socket.nickname);
        }
    });

    // Kullanıcı ayrıldığında
    // Arkadaş Ekleme / Çıkarma
    socket.on('add friend', (friendNick) => {
        if (!socket.nickname || !friendNick || socket.nickname === friendNick) return;
        const updatedFriends = toggleFriend(socket.nickname, friendNick, true);
        socket.emit('friends list', updatedFriends);
    });

    socket.on('remove friend', (friendNick) => {
        if (!socket.nickname || !friendNick) return;
        const updatedFriends = toggleFriend(socket.nickname, friendNick, false);
        socket.emit('friends list', updatedFriends);
    });

    socket.on('disconnect', () => {
        if (socket.nickname && socket.roomName) {
            socket.to(socket.roomName).emit('user left', socket.nickname);
            socket.to(socket.roomName).emit('user stop typing', socket.nickname);
            if (roomOnlineUsers[socket.roomName]) {
                delete roomOnlineUsers[socket.roomName][socket.id];
                if (Object.keys(roomOnlineUsers[socket.roomName]).length === 0) {
                    delete roomOnlineUsers[socket.roomName];
                }
            }
            broadcastRoomStats();
            broadcastOnlineUsers(socket.roomName);
        }
        
        onlineUsers.delete(socket.id);
        io.emit('online users', Array.from(new Set(onlineUsers.values())));
        
        console.log('Ayrıldı:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Crow Chat → http://localhost:${PORT}`);
});
