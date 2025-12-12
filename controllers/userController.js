const supabase = require('../config/supabase');

exports.updateLearningTarget = async (req, res) => {
    const authId = req.user?.id; 
    const { target_minutes } = req.body; 

    // 1. Validasi Input
    if (!authId) return res.status(401).json({ success: false, message: "Unauthorized" });
    if (!target_minutes || isNaN(target_minutes)) {
        return res.status(400).json({ success: false, message: "Target harus berupa angka (menit)." });
    }

    try {
        console.log(`🎯 Update Target Request: ${authId} -> ${target_minutes} Menit`);

        // 2. Cari User ID (Logika Hybrid)
        let query = supabase.from('users').select('id');
        const isUuidFormat = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authId);

        if (isUuidFormat) query = query.eq('uuid', authId);
        else query = query.eq('id', authId);

        const { data: user, error: userError } = await query.single();

        if (userError || !user) {
            return res.status(404).json({ success: false, message: "User tidak ditemukan." });
        }

        const userId = user.id;

        // ============================================================
        // 3. LOGIKA BARU: CEK MANUAL (MENGHINDARI ERROR CONSTRAINT)
        // ============================================================
        
        // A. Cek dulu apakah target sudah ada?
        const { data: existingTarget } = await supabase
            .from('learning_targets')
            .select('id')
            .eq('user_id', userId)
            .eq('target_type', 'study_duration')
            .maybeSingle();

        let resultData;

        if (existingTarget) {
            // B. Jika ADA -> Lakukan UPDATE
            console.log("🔄 Data ditemukan, melakukan UPDATE...");
            const { data, error } = await supabase
                .from('learning_targets')
                .update({ 
                    target_value: parseInt(target_minutes),
                    start_date: new Date(), // Update tanggal mulai
                    status: 'active'
                })
                .eq('id', existingTarget.id) // Update berdasarkan ID yang ditemukan
                .select();
            
            if (error) throw error;
            resultData = data;

        } else {
            // C. Jika TIDAK ADA -> Lakukan INSERT
            console.log("➕ Data baru, melakukan INSERT...");
            const { data, error } = await supabase
                .from('learning_targets')
                .insert({ 
                    user_id: userId,
                    target_value: parseInt(target_minutes),
                    target_type: 'study_duration',
                    status: 'active',
                    start_date: new Date()
                })
                .select();

            if (error) throw error;
            resultData = data;
        }

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