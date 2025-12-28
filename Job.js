const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
    title: String,          // e.g. Software Engineer
    company: String,        // e.g. Google
    location: String,       // e.g. Bangalore / Remote
    type: String,           // Full-time / Internship
    description: String,

    postedBy: String,       // User ka naam (Dikhane ke liye)
    posterEmail: String,    // User ka email (Taaki hum 'My Posted Jobs' filter kar sakein)

    createdAt: { type: Date, default: Date.now },

    // --- NAYA FIELD: Applicants List ---
    // Yahan un users ki IDs save hongi jo "Apply" button dabayenge
    applicants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
});

module.exports = mongoose.model('Job', jobSchema);