const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    content: String,
    timestamp: { type: Date, default: Date.now },
    
    
    // false = User ne abhi tak nahi dekha (Notification dikhao)
    // true = User ne dekh liya
    isRead: { type: Boolean, default: false } 
});

module.exports = mongoose.model('Message', messageSchema);