const supabase = require('../config/supabase');

exports.setTarget = async (req, res) => {
    const userId = req.user.id;
    const { target_type, target_value } = req.body;

    try {
        console.log(`🎯 Menyimpan Target untuk User ID: ${userId}`);

        // 1. Validasi Input
        if (!['module_count', 'study_duration'].includes(target_type)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Tipe target salah. Gunakan "module_count" atau "study_duration".' 
            });
        }

        if (!target_value || target_value <= 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Nilai target harus angka lebih dari 0.' 
            });
        }

        // 2. Cek apakah user sudah punya target yang statusnya 'active'?
        const { data: existingTarget } = await supabase
            .from('learning_targets')
            .select('id')
            .eq('user_id', userId)
            .eq('status', 'active')
            .maybeSingle();

        let resultData, resultError;

        if (existingTarget) {
            // SKENARIO A: Sudah punya -> Kita UPDATE target lamanya
            console.log("🔄 Mengupdate target lama...");
            const response = await supabase
                .from('learning_targets')
                .update({ 
                    target_type: target_type,
                    target_value: target_value,
                    start_date: new Date() // Reset tanggal mulai jadi hari ini
                })
                .eq('id', existingTarget.id)
                .select();
            
            resultData = response.data;
            resultError = response.error;

        } else {
            // SKENARIO B: Belum punya -> Kita INSERT target baru
            console.log("➕ Membuat target baru...");
            const response = await supabase
                .from('learning_targets')
                .insert({ 
                    user_id: userId,
                    target_type: target_type,
                    target_value: target_value,
                    status: 'active',
                    start_date: new Date()
                })
                .select();

            resultData = response.data;
            resultError = response.error;
        }

        // 3. Cek Error Database
        if (resultError) throw resultError;

        // 4. Kirim Response Sukses (Format Seragam)
        res.json({
            success: true,
            message: "Target belajar berhasil disimpan!",
            data: resultData
        });

    } catch (err) {
        console.error("Target Controller Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};