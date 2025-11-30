const supabase = require('../config/supabase');

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
        // Kita butuh ID Integer (misal: 96989) untuk request ke dashboard nanti
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('*') // Ambil semua kolom (nama, role, xp, dll)
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
            token: authData.session.access_token, // Token rahasia (Bearer)
            user: {
                id: userData.id,       // ID Integer (PENTING)
                uuid: userData.uuid,   // ID Auth
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