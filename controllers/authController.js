const supabase = require('../config/supabase');
// 👇 Tambahan PENTING: Import createClient untuk fitur Update Password
const { createClient } = require('@supabase/supabase-js');

exports.login = async (req, res) => {
    const { email, password } = req.body;

    // Validasi input sederhana
    if (!email || !password) {
        return res.status(400).json({ 
            success: false, 
            message: "Email dan Password wajib diisi!" 
        });
    }

    try {
        console.log(`Mencoba login untuk email: ${email}...`);

        // 1. Cek Email & Password ke Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (authError) {
            console.error("Auth Error:", authError.message);
            return res.status(401).json({ 
                success: false, 
                message: "Email atau Password salah!" 
            });
        }

        // 2. Jika Password benar, cari data profil lengkap di tabel 'users'
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('*') 
            .eq('email', email)
            .single();

        if (userError || !userData) {
            console.error("User Data Error:", userError);
            return res.status(404).json({ 
                success: false, 
                message: "Login berhasil, tapi data profil tidak ditemukan di database." 
            });
        }

        console.log("Login Berhasil:", userData.name);

        // 3. Kirim Token & Data User ke Frontend
        res.json({
            success: true,
            message: "Login Berhasil!",
            token: authData.session.access_token, 
            user: {
                id: userData.id,       
                uuid: userData.uuid,   
                name: userData.name,
                email: userData.email,
                role: userData.user_role
            }
        });

    } catch (err) {
        console.error("Server Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

exports.register = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ success: false, message: "Email dan Password wajib diisi." });
    }

    try {
        console.log(`📝 Mencoba aktivasi akun untuk: ${email}`);

        // LANGKAH 1: Cek apakah Email ini ada di Database Excel?
        const { data: existingUser, error: checkError } = await supabase
            .from('users')
            .select('id, uuid, email')
            .eq('email', email)
            .maybeSingle();

        // Jika email tidak ditemukan di tabel users
        if (!existingUser) {
            return res.status(403).json({ 
                success: false, 
                message: "Email Anda tidak terdaftar sebagai Peserta/Siswa. Hubungi Admin." 
            });
        }

        // LANGKAH 2: Cek apakah dia sudah pernah daftar sebelumnya?
        if (existingUser.uuid) {
            return res.status(400).json({ 
                success: false, 
                message: "Akun ini sudah aktif sebelumnya. Silakan langsung Login." 
            });
        }

        // LANGKAH 3: Daftarkan ke Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: email,
            password: password,
        });

        if (authError) {
            return res.status(400).json({ success: false, message: authError.message });
        }
        
        res.json({
            success: true,
            message: "Aktivasi Berhasil! Silakan Login dengan password baru Anda.",
        });

    } catch (err) {
        console.error("Register Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// 1. KIRIM EMAIL RESET
exports.forgotPassword = async (req, res) => {
    const { email } = req.body;
    
    // URL Frontend
    const RESET_PAGE_URL = 'https://capstone-learning-insight.netlify.app/reset-password'; 

    try {
        console.log(`📧 Mengirim link reset password ke: ${email}`);

        const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: RESET_PAGE_URL,
        });

        if (error) throw error;

        res.json({
            success: true,
            message: "Link reset password telah dikirim ke email Anda. Cek Inbox/Spam.",
        });

    } catch (err) {
        console.error("Forgot Pass Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// 2. SIMPAN PASSWORD BARU (VERSI PERBAIKAN)
exports.updatePassword = async (req, res) => {
    const { new_password } = req.body;
    
    // Ambil Token User dari Header yang dikirim Frontend
    const userToken = req.headers.authorization; 

    if (!new_password) return res.status(400).json({ success: false, message: "Password baru wajib diisi." });
    if (!userToken) return res.status(401).json({ success: false, message: "Token tidak ditemukan." });

    try {
        console.log(`🔐 Mengupdate password user...`);

        // --- TRIK PENTING DI SINI ---
        // Kita buat Client Sementara khusus untuk user ini menggunakan Token dia.
        // Ini supaya Supabase tahu "Siapa" yang sedang ganti password.
        const supabaseUser = createClient(
            process.env.SUPABASE_URL, 
            process.env.SUPABASE_KEY, 
            {
                global: {
                    headers: { Authorization: userToken } // Token ditempel disini
                }
            }
        );

        // Update password menggunakan client sementara tadi
        const { error } = await supabaseUser.auth.updateUser({ 
            password: new_password 
        });

        if (error) throw error;

        res.json({
            success: true,
            message: "Password berhasil diubah! Silakan login kembali.",
        });

    } catch (err) {
        console.error("Update Pass Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};