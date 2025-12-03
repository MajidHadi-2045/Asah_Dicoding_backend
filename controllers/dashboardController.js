const supabase = require('../config/supabase');

exports.getDashboardData = async (req, res) => {
    const userId = req.user.id;

    try {
        console.log(`🔄 Menyiapkan data ML Features untuk User ID: ${userId}...`);

        // 1. DATA PROFIL
        const { data: user } = await supabase
            .from('users')
            .select('name, xp, image_path')
            .eq('id', userId)
            .single();

        // 2. HITUNG DURASI (avg_completion_time)
        const { data: completions } = await supabase
            .from('developer_journey_completions')
            .select('study_duration')
            .eq('user_id', userId);

        let totalDuration = 0;
        if (completions) {
            completions.forEach(c => {
                // Bersihkan data string jadi angka
                totalDuration += Number(String(c.study_duration).replace(/\D/g, '') || 0);
            });
        }
        const avgDuration = completions?.length > 0 ? (totalDuration / completions.length) : 0;

        // 3. HITUNG MODUL & LOGIN (total_modules_read & login_frequency)
        const { data: trackings } = await supabase
            .from('developer_journey_trackings')
            .select('last_viewed')
            .eq('developer_id', userId);

        const totalModules = trackings?.length || 0;

        // Hitung hari unik login
        const loginDates = new Set(trackings?.map(t => new Date(t.last_viewed).toDateString()));
        let loginFrequency = loginDates.size; 
        if (loginFrequency === 0 && user) loginFrequency = 1; // Minimal 1

        // 4. HITUNG NILAI & KEGAGALAN (avg_exam_score & failed_exams)
        const { data: examResults } = await supabase
            .from('exam_results')
            .select('score, is_passed, exam_registrations!inner(examinees_id)')
            .eq('exam_registrations.examinees_id', userId);

        let totalScore = 0;
        let examCount = 0;
        let failedExams = 0;

        if (examResults) {
            examResults.forEach(item => {
                const score = Number(String(item.score).replace(/\D/g, '') || 0);
                totalScore += score;
                examCount++;
                if (item.is_passed == 0) failedExams++;
            });
        }
        const avgScore = examCount > 0 ? (totalScore / examCount) : 0;

        // 5. PACKING DATA UNTUK ML
        const mlFeatures = {
            avg_completion_time: Math.round(avgDuration),
            total_modules_read: totalModules,
            avg_exam_score: Math.round(avgScore),
            login_frequency: loginFrequency,
            failed_exams: failedExams
        };

        // 6. AMBIL HASIL PREDIKSI SEBELUMNYA (Jika Ada)
        const { data: lastInsight } = await supabase
            .from('user_learning_insights')
            .select('learning_style, motivation_quote, suggestions')
            .eq('user_id', userId)
            .order('generated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        // 7. AMBIL TARGET & HISTORY (Pelengkap Dashboard)
        const { data: examHistory } = await supabase
            .from('exam_results')
            .select('score, is_passed, created_at, exam_registrations!inner(examinees_id, tutorial_id)')
            .eq('exam_registrations.examinees_id', userId)
            .order('created_at', { ascending: false })
            .limit(3);

        // RESPONSE JSON
        res.json({
            success: true,
            data: {
                user: {
                    name: user?.name || 'User',
                    xp: user?.xp || 0,
                    avatar: user?.image_path
                },
                // INI YANG AKAN DIPAKAI TENSORFLOW.JS DI FRONTEND
                ml_features: mlFeatures, 
                
                ai_insight: {
                    type: lastInsight?.learning_style || "Menunggu Analisis...",
                    motivation: lastInsight?.motivation_quote || "Silakan klik tombol 'Analisis' di dashboard.",
                    advice: lastInsight?.suggestions?.[0] || "Belum ada saran."
                },
                exam_history: examHistory || []
            }
        });

    } catch (err) {
        console.error("Dashboard Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};