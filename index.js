require('dotenv').config();
const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware Global
app.use(cors()); 
app.use(express.json()); // <--- WAJIB ADA: Biar bisa baca req.body (email/pass)

// Routes
app.get('/', (req, res) => {
    res.json({ message: "SmartLearn API is Ready!" });
});

app.use('/api', apiRoutes);

// Export app (PENTING UNTUK VERCEL)
module.exports = app;

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`✅ Server running locally on http://localhost:${PORT}`);
    });
}