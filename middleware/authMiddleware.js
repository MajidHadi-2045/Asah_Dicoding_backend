const supabase = require('../config/supabase');

const authMiddleware = async (req, res, next) => {
    try {
        // 1. Ambil Token dari Header (Format: "Bearer eyJhbGci...")
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
            return res.status(401).json({ success: false, message: 'Akses ditolak. Token tidak ada.' });
        }

        const token = authHeader.split(' ')[1]; // Ambil string setelah kata 'Bearer'

        if (!token) {
            return res.status(401).json({ success: false, message: 'Format token salah.' });
        }

        // 2. Cek ke Supabase Auth: Apakah token ini valid & belum expired?
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ success: false, message: 'Token tidak valid atau kedaluwarsa.' });
        }

        // 3. JEMBATAN PENTING:
        // Token cuma bawa Email/UUID. Kita butuh ID Integer (user_id) untuk query database lain.
        // Cari ID Integer user berdasarkan email dari token.
        const { data: dbUser, error: dbError } = await supabase
            .from('users')
            .select('id, email, name')
            .eq('email', user.email)
            .single();

        if (dbError || !dbUser) {
            return res.status(404).json({ success: false, message: 'Data user tidak ditemukan di sistem.' });
        }

        // 4. Simpan data user ke variable 'req' biar bisa dipakai di Controller
        req.user = dbUser; 
        
        console.log(`User terverifikasi: ${req.user.email} (ID: ${req.user.id})`);
        
        // Lanjut ke controller berikutnya
        next();

    } catch (err) {
        console.error("Middleware Error:", err.message);
        res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server autentikasi.' });
    }
};

module.exports = authMiddleware;