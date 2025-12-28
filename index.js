require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs');
const CryptoJS = require("crypto-js");
const os = require('os');

// Models Import
const User = require('./models/User');
const Post = require('./models/Post');
const Job = require('./models/Job');
const Message = require('./models/Message');

const app = express();

const SECRET_KEY = process.env.SECRET_KEY;

if (!SECRET_KEY) {
    console.error("FATAL ERROR: SECRET_KEY is missing in .env file.");
    process.exit(1);
}

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Database Connection
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ Database Connected"))
    .catch((err) => console.log("❌ Connection Error:", err));

// Multer Setup
const storage = multer.diskStorage({
    destination: './public/uploads/',
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });


// ================= ROUTES =================

// 1. Home Page
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/login.html');
});

// --- AUTH ROUTES ---

// 2. REGISTER USER (Updated to allow same Email with DIFFERENT Role)
app.post('/add-user', async (req, res) => {
    try {
        const role = req.body.role || "Student"; // Default role

        // CHECK: Email + Role combination check karo
        const existingUser = await User.findOne({ email: req.body.email, role: role });

        if (existingUser) {
            return res.status(400).json({ message: `This Email is already registered as a ${role}` });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(req.body.password, salt);

        const newUser = new User({
            name: req.body.name,
            email: req.body.email,
            password: hashedPassword,
            age: req.body.age,
            role: role
        });

        await newUser.save();
        res.json(newUser);
    } catch (err) { res.status(500).send("Error saving user"); }
});

// 3. LOGIN USER (Updated with Smart Logic for Multiple Accounts)
app.post('/login', async (req, res) => {
    try {
        const { email, password, role } = req.body;

        // CASE 1: If role is provided (User selected from popup)
        if (role) {
            const user = await User.findOne({ email: email, role: role });
            if (user) {
                const isMatch = await bcrypt.compare(password, user.password);
                if (isMatch) return res.json(user); // Login Success
            }
            return res.status(401).json({ message: "Invalid Credentials" });
        }

        // CASE 2: Initial Login (Check how many accounts exist)
        const users = await User.find({ email: email });

        if (users.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        // Check Password for all found users
        const validUsers = [];
        for (const user of users) {
            const isMatch = await bcrypt.compare(password, user.password);
            if (isMatch) validUsers.push(user);
        }

        if (validUsers.length === 0) {
            return res.status(401).json({ message: "Incorrect Password" });
        }

        // If only 1 valid account -> Direct Login
        if (validUsers.length === 1) {
            return res.json(validUsers[0]);
        }

        // If >1 valid accounts (Student + HR) -> Ask Frontend to show Popup
        if (validUsers.length > 1) {
            return res.status(300).json({
                message: "Multiple Accounts Found",
                roles: validUsers.map(u => u.role)
            });
        }

    } catch (err) { res.status(500).json({ message: "Server Error" }); }
});

// 4. Reset Password
app.post('/reset-password', async (req, res) => {
    try {
        const { email, newPassword } = req.body;
        // Reset password for ALL accounts with this email
        const users = await User.find({ email: email });
        if (users.length === 0) return res.status(404).json({ message: "User nahi mila!" });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // Update all documents with this email
        await User.updateMany({ email: email }, { password: hashedPassword });

        res.json({ message: "Password Reset Successfully! Ab login karein." });
    } catch (err) { res.status(500).json({ message: "Server Error" }); }
});


// --- POST ROUTES ---

app.post('/create-post', upload.single('media'), async (req, res) => {
    try {
        const { username, content, userEmail } = req.body;
        let fileUrl = '', fileType = '';
        if (req.file) {
            fileUrl = `/uploads/${req.file.filename}`;
            fileType = req.file.mimetype;
        }
        const newPost = new Post({ username, userEmail, content, fileUrl, fileType });
        await newPost.save();
        res.json({ message: "Post created!" });
    } catch (err) { res.status(500).send("Error creating post"); }
});

app.get('/posts', async (req, res) => {
    try {
        const posts = await Post.find({ isDeleted: false }).sort({ createdAt: -1 });
        const postsWithImages = await Promise.all(posts.map(async (post) => {
            if (post.userEmail) {
                const user = await User.findOne({ email: post.userEmail });
                return { ...post._doc, userProfilePic: user ? user.profilePic : null };
            } else {
                return { ...post._doc, userProfilePic: null };
            }
        }));
        res.json(postsWithImages);
    } catch (err) { res.status(500).send("Error fetching posts"); }
});

app.delete('/delete-post/:id', async (req, res) => {
    try {
        await Post.findByIdAndDelete(req.params.id);
        res.json({ message: "Post Deleted Successfully" });
    } catch (err) { res.status(500).send("Error deleting post"); }
});

app.post('/my-posts', async (req, res) => {
    try {
        const posts = await Post.find({ username: req.body.username }).sort({ createdAt: -1 });
        res.json(posts);
    } catch (err) { res.status(500).send("Error fetching user posts"); }
});

app.post('/like-post', async (req, res) => {
    try {
        const { postId, userId } = req.body;
        const post = await Post.findById(postId);
        if (post.likes.includes(userId)) {
            post.likes = post.likes.filter(id => id !== userId);
        } else {
            post.likes.push(userId);
        }
        await post.save();
        res.json({ message: "Success", likes: post.likes });
    } catch (err) { res.status(500).send("Error liking post"); }
});

app.post('/comment-post', async (req, res) => {
    try {
        const { postId, username, text } = req.body;
        const post = await Post.findById(postId);
        post.comments.push({ username, text });
        await post.save();
        res.json({ message: "Comment added", comments: post.comments });
    } catch (err) { res.status(500).send("Error commenting"); }
});


// --- JOB ROUTES ---

// 1. Post a Job (Restricted to Recruiter)
app.post('/add-job', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.body.posterEmail });

        // CHECK ROLE
        if (!user || user.role !== 'Recruiter') {
            return res.status(403).json({ message: "Access Denied: Only Recruiters can post jobs." });
        }

        const newJob = new Job(req.body);
        await newJob.save();
        res.json({ message: "Job Posted Successfully!" });
    } catch (err) { res.status(500).send("Error posting job"); }
});

app.get('/all-jobs', async (req, res) => {
    try {
        const jobs = await Job.find().sort({ createdAt: -1 });
        res.json(jobs);
    } catch (err) { res.status(500).send("Error fetching jobs"); }
});

app.post('/apply-job', async (req, res) => {
    try {
        const { jobId, userEmail } = req.body;
        const user = await User.findOne({ email: userEmail });
        const job = await Job.findById(jobId);

        if (job.applicants.includes(user._id)) {
            return res.status(400).json({ message: "You have already applied!" });
        }

        job.applicants.push(user._id);
        await job.save();
        res.json({ message: "Applied Successfully! Recruiter notified." });
    } catch (err) { res.status(500).send("Error applying"); }
});

app.post('/my-posted-jobs', async (req, res) => {
    try {
        const jobs = await Job.find({ posterEmail: req.body.email })
            .populate('applicants', 'name email phone headline profilePic github leetcode instagram')
            .sort({ createdAt: -1 });
        res.json(jobs);
    } catch (err) { res.status(500).send("Error fetching my jobs"); }
});

app.delete('/delete-job/:id', async (req, res) => {
    try {
        await Job.findByIdAndDelete(req.params.id);
        res.json({ message: "Job Deleted Successfully" });
    } catch (err) { res.status(500).send("Error deleting job"); }
});


// --- NETWORK & SEARCH ROUTES ---

app.post('/search-users', async (req, res) => {
    try {
        const { query, myId } = req.body;
        const me = await User.findById(myId);

        const users = await User.find({
            $and: [
                { _id: { $ne: myId } }, // RULE 1: Khud ko list se hatao (Not Equal to myId)
                {
                    $or: [
                        { name: { $regex: query, $options: 'i' } }, // Name match karega
                        { email: { $regex: query, $options: 'i' } } // RULE 2: Email bhi match karega
                    ]
                }
            ]
        }).select('name email headline profilePic requests _id');

        const results = users.map(user => {
            const isConnected = me.connections.includes(user._id);
            const isPending = user.requests.includes(myId);
            return { ...user.toObject(), isConnected, isPending };
        });
        res.json(results);
    } catch (err) { res.status(500).send("Error searching users"); }
});

app.post('/send-request', async (req, res) => {
    try {
        const { senderEmail, receiverId } = req.body;
        const sender = await User.findOne({ email: senderEmail });
        const receiver = await User.findById(receiverId);

        if (receiver.requests.includes(sender._id) || receiver.connections.includes(sender._id)) {
            return res.status(400).json({ message: "Request already sent or connected" });
        }
        receiver.requests.push(sender._id);
        await receiver.save();
        res.json({ message: "Request Sent Successfully!" });
    } catch (err) { res.status(500).send("Error"); }
});

// 3. Accept Request (With Auto "Hi" Message)
app.post('/accept-request', async (req, res) => {
    try {
        const { myEmail, requesterId } = req.body;
        const me = await User.findOne({ email: myEmail });
        const requester = await User.findById(requesterId);

        // 1. Connection Update Logic
        me.requests = me.requests.filter(id => id.toString() !== requesterId);
        me.connections.push(requesterId);
        requester.connections.push(me._id);

        await me.save();
        await requester.save();

        // 2. AUTO MESSAGE LOGIC (New Addition)
        const defaultMsg = "Hi! I accepted your connection request.";

        // Message ko Encrypt karna zaroori hai taki chat m sahi dikhe
        const encryptedContent = CryptoJS.AES.encrypt(defaultMsg, SECRET_KEY).toString();

        const autoMessage = new Message({
            sender: me._id,       // Message "Main" bhej raha hu (jisne accept kiya)
            receiver: requester._id, // Jisko accept kiya
            content: encryptedContent,
            isRead: false,
            timestamp: new Date()
        });

        await autoMessage.save();

        res.json({ message: "You are now connected and 'Hi' sent!" });
    } catch (err) { res.status(500).send("Error accepting request"); }
});

app.post('/get-network', async (req, res) => {
    try {
        const user = await User.findOne({ email: req.body.email })
            .populate('connections', 'name headline email profilePic')
            .populate('requests', 'name headline email profilePic');

        const connectionsWithMsg = await Promise.all(user.connections.map(async (conn) => {
            const lastMsg = await Message.findOne({
                $or: [{ sender: user._id, receiver: conn._id }, { sender: conn._id, receiver: user._id }]
            }).sort({ timestamp: -1 });

            let msgPreview = "Tap to chat";
            if (lastMsg) {
                try {
                    const bytes = CryptoJS.AES.decrypt(lastMsg.content, SECRET_KEY);
                    const originalText = bytes.toString(CryptoJS.enc.Utf8);
                    msgPreview = (lastMsg.sender.toString() === user._id.toString()) ? `You: ${originalText}` : originalText;
                } catch (e) { msgPreview = "Encrypted message"; }
            }
            return { ...conn.toObject(), lastMessage: msgPreview };
        }));
        res.json({ requests: user.requests, connections: connectionsWithMsg });
    } catch (err) { res.status(500).send("Error fetching network"); }
});

app.post('/remove-connection', async (req, res) => {
    try {
        const { myEmail, targetId } = req.body;
        const me = await User.findOne({ email: myEmail });
        const otherUser = await User.findById(targetId);
        me.connections = me.connections.filter(id => id.toString() !== targetId);
        otherUser.connections = otherUser.connections.filter(id => id.toString() !== me._id.toString());
        await me.save();
        await otherUser.save();
        res.json({ message: "Disconnected successfully" });
    } catch (err) { res.status(500).send("Error removing connection"); }
});


// --- CHAT ROUTES ---

app.post('/send-message', async (req, res) => {
    try {
        const { senderEmail, receiverId, content } = req.body;
        const sender = await User.findOne({ email: senderEmail });
        const encryptedContent = CryptoJS.AES.encrypt(content, SECRET_KEY).toString();
        const newMessage = new Message({ sender: sender._id, receiver: receiverId, content: encryptedContent, isRead: false });
        await newMessage.save();
        res.json({ message: "Sent!" });
    } catch (err) { res.status(500).send("Error sending message"); }
});

app.post('/get-messages', async (req, res) => {
    try {
        const { myEmail, friendId } = req.body;
        const me = await User.findOne({ email: myEmail });

        // --- NEW: FETCH FRIEND DETAILS ---
        const friend = await User.findById(friendId).select('name profilePic lastSeen');

        const messages = await Message.find({
            $or: [
                { sender: me._id, receiver: friendId },
                { sender: friendId, receiver: me._id }
            ]
        }).sort({ timestamp: 1 });

        const decryptedMessages = messages.map(msg => {
            try {
                const bytes = CryptoJS.AES.decrypt(msg.content, SECRET_KEY);
                const originalText = bytes.toString(CryptoJS.enc.Utf8);
                return {
                    sender: msg.sender,
                    receiver: msg.receiver,
                    content: originalText || "[Error]",
                    timestamp: msg.timestamp,
                    isRead: msg.isRead
                };
            } catch (e) { return msg; }
        });

        res.json({ messages: decryptedMessages, myId: me._id, friend: friend });
    } catch (err) { res.status(500).send("Error fetching messages"); }
});

app.post('/check-unread', async (req, res) => {
    try {
        const unreadCount = await Message.countDocuments({ receiver: req.body.myId, isRead: false });
        res.json({ unreadCount });
    } catch (err) { res.status(500).send("Error"); }
});

app.post('/mark-read', async (req, res) => {
    try {
        await Message.updateMany({ sender: req.body.friendId, receiver: req.body.myId, isRead: false }, { $set: { isRead: true } });
        res.json({ message: "Marked as read" });
    } catch (err) { res.status(500).send("Error"); }
});

// 1. ADD THIS NEW ROUTE (User Activity Update)
app.post('/update-activity', async (req, res) => {
    try {
        const { userId } = req.body;
        await User.findByIdAndUpdate(userId, { lastSeen: new Date() });
        res.json({ success: true });
    } catch (err) { res.status(500).send("Error"); }
});


// --- PROFILE ROUTES ---

app.post('/get-profile', async (req, res) => {
    try { const user = await User.findOne({ email: req.body.email }); res.json(user); }
    catch (err) { res.status(500).send("Error"); }
});

app.post('/update-profile-pic', upload.single('profilePic'), async (req, res) => {
    try {
        if (req.file) {
            const newPath = `/uploads/${req.file.filename}`;
            await User.findOneAndUpdate({ email: req.body.email }, { profilePic: newPath });
            res.json({ message: "Profile Updated", newPath: newPath });
        } else { res.status(400).send("No file uploaded"); }
    } catch (err) { res.status(500).send("Error updating profile"); }
});

// --- UPDATE PROFILE INFO (CONTACT + BIO) ---
app.post('/update-profile-data', async (req, res) => {
    try {
        const { email, headline, role, phone, github, leetcode, instagram } = req.body;

        // Find user and update fields
        await User.findOneAndUpdate(
            { email: email },
            {
                $set: {
                    headline: headline,
                    role: role,
                    phone: phone,
                    github: github,
                    leetcode: leetcode,
                    instagram: instagram
                }
            }
        );

        res.json({ message: "Profile Details Updated!" });
    } catch (err) {
        console.error(err);
        res.status(500).send("Error updating profile");
    }
});

app.post('/update-contact', async (req, res) => {
    try {
        const { email, phone, github, leetcode, instagram } = req.body;
        await User.findOneAndUpdate({ email: email }, { phone, github, leetcode, instagram });
        res.json({ message: "Contact details updated!" });
    } catch (err) { res.status(500).send("Error updating details"); }
});

app.post('/add-detail', async (req, res) => {
    try {
        const { email, type, title, org, year } = req.body;
        const user = await User.findOne({ email });
        if (type === 'education') user.education.push({ title, org, year });
        else user.certificates.push({ title, org, year });
        await user.save();
        res.json(user);
    } catch (err) { res.status(500).send("Error"); }
});

app.post('/delete-detail', async (req, res) => {
    try {
        const { email, type, id } = req.body;
        const user = await User.findOne({ email });
        const item = (type === 'education') ? user.education.id(id) : user.certificates.id(id);
        if (item) item.isActive = false;
        await user.save();
        res.json(user);
    } catch (err) { res.status(500).send("Error"); }
});

// --- SKILL ROUTES ---

// 1. Add Skill
app.post('/add-skill', async (req, res) => {
    try {
        const { email, skill } = req.body;
        // $addToSet use kiya taaki duplicate skills add na hon
        await User.findOneAndUpdate(
            { email: email },
            { $addToSet: { skills: skill } }
        );
        res.json({ message: "Skill Added" });
    } catch (err) { res.status(500).send("Error adding skill"); }
});

// 2. Remove Skill
app.post('/remove-skill', async (req, res) => {
    try {
        const { email, skill } = req.body;
        // $pull use kiya taaki list se skill hat jaye
        await User.findOneAndUpdate(
            { email: email },
            { $pull: { skills: skill } }
        );
        res.json({ message: "Skill Removed" });
    } catch (err) { res.status(500).send("Error removing skill"); }
});

// --- CHANGE PASSWORD ROUTE ---
app.post('/change-password', async (req, res) => {
    try {
        const { email, oldPassword, newPassword } = req.body;
        const user = await User.findOne({ email });

        if (!user) return res.status(404).json({ message: "User not found" });

        // 1. Check Old Password
        const isMatch = await bcrypt.compare(oldPassword, user.password);
        if (!isMatch) return res.status(400).json({ message: "Incorrect Old Password" });

        // 2. Hash New Password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        // 3. Update Database
        user.password = hashedPassword;
        await user.save();

        res.json({ message: "Password Changed Successfully!" });
    } catch (err) { res.status(500).send("Server Error"); }
});


// --- SERVER START ---
const getLocalIpAddress = () => {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) return iface.address;
        }
    }
    return 'localhost';
};

const port = process.env.PORT || 3000;
app.listen(port, '0.0.0.0', () => {
    const ip = getLocalIpAddress();
    console.log(`\n🚀 Server Running!`);
    console.log(`👉 Local (PC):     http://localhost:${port}`);
    console.log(`👉 Network (Mobile): http://${ip}:${port}`);
});