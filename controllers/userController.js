// controllers/userController.js (atau gabung di dashboardController)
const supabase = require('../config/supabase');

exports.updateLearningTarget = async (req, res) => {
    const authId = req.user?.id; // UUID dari Token
    const { target_minutes } = req.body; // Input dari Frontend (misal: 60)

    // 1. Validasi Input
    if (!authId) return res.status(401).json({ success: false, message: "Unauthorized" });
    if (!target_minutes || isNaN(target_minutes)) {
        return res.status(400).json({ success: false, message: "Target harus berupa angka (menit)." });
    }

    try {
        console.log(`🎯 Update Target untuk UUID: ${authId} -> ${target_minutes} Menit`);

        // 2. Cari ID Integer User dulu (Karena tabel learning_targets butuh user_id integer)
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('uuid', authId)
            .single();

        if (userError || !user) {
            return res.status(404).json({ success: false, message: "User tidak ditemukan." });
        }

        const userId = user.id; // Ini ID Integer (misal: 531259)

        // 3. Simpan Target ke Database
        // Kita gunakan 'upsert': Kalau ada update, kalau gak ada insert.
        // Asumsi: Satu user cuma punya satu target aktif tipe 'study_duration'
        
        const { data, error } = await supabase
            .from('learning_targets')
            .upsert({ 
                user_id: userId,
                target_value: target_minutes,
                target_type: 'study_duration',
                status: 'active',
                updated_at: new Date() // Pastikan ada kolom ini atau hapus jika tidak ada
            }, { 
                onConflict: 'user_id, target_type' // Kunci agar tidak duplikat
            })
            .select();

        if (error) throw error;

        res.json({
            success: true,
            message: "Target belajar berhasil diperbarui!",
            data: {
                target_minutes: target_minutes,
                display: `${(target_minutes / 60).toFixed(1)} Jam`
            }
        });

    } catch (err) {
        console.error("Update Target Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};