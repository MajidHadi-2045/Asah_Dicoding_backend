const supabase = require('../config/supabase');

exports.setTarget = async (req, res) => {
    const { target_type, target_value } = req.body;
    const userId = req.user.id; // Didapat dari middleware

    try {
        // Validasi input
        if (!['module_count', 'study_duration'].includes(target_type)) {
            return res.status(400).json({ error: 'Invalid target type' });
        }

        // Upsert (Update kalau ada, Insert kalau belum)
        // Kita anggap 1 user cuma punya 1 target aktif per minggu
        const { data, error } = await supabase
            .from('learning_targets')
            .upsert({ 
                user_id: userId,
                target_type,
                target_value,
                status: 'active',
                start_date: new Date()
            })
            .select();

        if (error) throw error;

        res.status(200).json({ message: 'Target set successfully', data });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};