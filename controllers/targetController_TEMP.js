const supabase = require('../config/supabase');

exports.setTarget = async (req, res) => {
    const userId = req.user.id;
    // Frontend mengirim: { target_type: 'duration', target_value: 60 }
    const { target_type, target_value } = req.body;

    try {
        console.log(`🎯 Menyimpan Target untuk User: ${userId}`);

        // 1. Validasi Input
        if (!['module_count', 'study_duration'].includes(target_type)) {
            return res.status(400).json({ success: false, message: 'Tipe target tidak valid.' });
        }

        // 2. Simpan ke Database (Upsert: Update kalau ada, Insert kalau belum)
        // Kita set status 'active' dan start_date hari ini
        const { data, error } = await supabase
            .from('learning_targets')
            .upsert({ 
                user_id: userId,
                target_type: target_type,
                target_value: target_value,
                status: 'active',
                start_date: new Date()
            }, { onConflict: 'user_id' }) // Asumsi 1 user cuma punya 1 target aktif
            .select();

        if (error) throw error;

        res.json({
            success: true,
            message: "Target berhasil disimpan!",
            data: data
        });

    } catch (err) {
        console.error("Target Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};