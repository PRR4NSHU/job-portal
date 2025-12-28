const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
    username: String,       // User ka naam
    // --- NAYA FIELD ---
    userEmail: String, // User ki unique ID taaki photo dhoond sakein
    content: String,        // Text message
    fileUrl: String,        // File ka path (Photo/Video/Audio)
    fileType: String,       // File kaisi hai (image/video/audio)
    createdAt: { type: Date, default: Date.now },
    
    // --- SOFT DELETE FIELD ---
    // false = Post sabko dikhega
    // true = Post user ne delete kar diya hai (Database mein rahega par dikhega nahi)
    isDeleted: { type: Boolean, default: false } ,
    likes: [{ type: String }], // Jo users like karenge unki IDs yahan aayengi
    comments: [{
        username: String,
        text: String,
        createdAt: { type: Date, default: Date.now }
    }]
});

module.exports = mongoose.model('Post', postSchema);