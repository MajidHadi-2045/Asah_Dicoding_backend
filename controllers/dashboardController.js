const supabase = require('../config/supabase');

exports.getDashboardData = async (req, res) => {
    const userId = req.user.id; // ID User Integer

    try {
        console.log(`🔄 Mengambil data manual untuk User ID: ${userId}...`);

        // 1. AMBIL DATA PROFIL USER
        const { data: user } = await supabase
            .from('users')
            .select('name, email, image_path')
            .eq('id', userId)
            .single();

        // 2. AMBIL TOTAL XP (Hitung Manual)
        const { data: completions } = await supabase
            .from('developer_journey_completions')
            .select(`
                study_duration,
                developer_journeys ( xp )
            `)
            .eq('user_id', userId);

        let totalXp = 0;
        let totalDuration = 0;
        let completedCount = 0;

        // Loop pakai JavaScript (Lebih aman daripada SQL)
        if (completions) {
            completions.forEach(item => {
                // Ambil XP (Pastikan jadi angka)
                const xp = item.developer_journeys?.xp || 0;
                totalXp += Number(xp); 

                // Ambil Durasi (Bersihkan kalau ada teks aneh)
                const duration = String(item.study_duration).replace(/\D/g, ''); // Hapus huruf
                totalDuration += Number(duration || 0);
                
                completedCount++;
            });
        }

        // 3. AMBIL DATA TRACKING (Untuk Konsistensi)
        const { count: trackingCount } = await supabase
            .from('developer_journey_trackings')
            .select('id', { count: 'exact', head: true })
            .eq('developer_id', userId);

        // 4. AMBIL DATA UJIAN (Untuk Average Score)
        // Kita cari ID registrasi user dulu, baru ke result
        const { data: examResults } = await supabase
            .from('exam_results')
            .select('score, is_passed, exam_registrations!inner(examinees_id)')
            .eq('exam_registrations.examinees_id', userId);

        let totalScore = 0;
        let examCount = 0;
        let passedCount = 0;

        if (examResults) {
            examResults.forEach(item => {
                // Konversi Score ke Angka (Aman dari error)
                const score = Number(String(item.score).replace(/\D/g, '') || 0);
                totalScore += score;
                examCount++;
                if (item.is_passed == 1) passedCount++;
            });
        }

        // HITUNG RATA-RATA DI SINI (JAVASCRIPT)
        const avgScore = examCount > 0 ? (totalScore / examCount) : 0;
        const avgDuration = completedCount > 0 ? (totalDuration / completedCount) : 0;

        // 5. TENTUKAN TIPE BELAJAR (LOGIKA AI SEDERHANA)
        let learnerType = 'Balanced Learner';
        let motivation = 'Teruslah belajar!';
        
        if (avgDuration > 0 && avgDuration < 30) {
            learnerType = 'Fast Learner';
            motivation = 'Wow, kamu belajar sangat cepat! Jangan lupa pahami detailnya.';
        } else if (trackingCount > 10) {
            learnerType = 'Consistent Learner';
            motivation = 'Konsistensimu luar biasa. Pertahankan ritme ini!';
        } else if (avgScore > 80) {
            learnerType = 'Reflective Learner';
            motivation = 'Pemahamanmu sangat mendalam. Nilai ujianmu membuktikannya.';
        }

        // 6. SUSUN JSON FINAL
        const responseData = {
            user: {
                name: user?.name || 'User',
                xp: totalXp,
                avatar: user?.image_path
            },
            ai_insight: {
                type: learnerType,
                motivation: motivation,
                advice: examCount > 0 && avgScore < 60 ? "Coba review materi dasar lagi." : "Lanjut ke materi expert!"
            },
            ml_features: {
                avg_exam_score: Math.round(avgScore),
                total_modules_read: trackingCount || 0,
                avg_completion_time: Math.round(avgDuration)
            },
            exam_history: examResults?.slice(0, 3) || [] // Ambil 3 terakhir
        };

        res.json({
            success: true,
            data: responseData
        });

    } catch (err) {
        console.error("Dashboard Manual Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};