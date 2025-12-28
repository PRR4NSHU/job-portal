const mongoose = require('mongoose');

// Sub-schema for Education/Certificates
const detailSchema = new mongoose.Schema({
    title: String,       // Degree or Certificate Name
    org: String,         // College or School Name
    year: String,
    isActive: { type: Boolean, default: true } // YES = Dikhega, NO = Delete ho gaya
});

const userSchema = new mongoose.Schema({
    name: String,
    email: String,
    password: String,
    age: Number,

    // Role: Default 'Student' rahega (System ke liye zaroori hai)
    role: { type: String, default: "Student" },

    // --- CONTACT & SOCIAL FIELDS (Defaults are Empty) ---
    phone: { type: String, default: "" },
    github: { type: String, default: "" },
    leetcode: { type: String, default: "" },
    instagram: { type: String, default: "" },
    // -------------------------------

    // --- UPDATED HERE ---
    // Default text hata diya hai, ab ye blank rahega
    headline: { type: String, default: "" },

    profilePic: { type: String, default: "" }, // Photo URL

    // Arrays for details
    education: [detailSchema],
    certificates: [detailSchema],

    // 'requests': Un logon ki ID jo mere dost banna chahte hain
    requests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // 'connections': Wo log jo dost ban chuke hain
    connections: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    // Profile Views Count
    profileViews: { type: Number, default: 0 },
    // --- NEW: SKILLS ARRAY ADDED HERE ---
    skills: { type: [String], default: [] },
    lastSeen: { type: Date, default: Date.now },
});

module.exports = mongoose.model('User', userSchema);