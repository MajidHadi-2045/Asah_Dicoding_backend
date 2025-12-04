const supabase = require('../config/supabase');

// --- HELPER FUNCTION: Format Menit ke Jam/Menit ---
const formatDuration = (minutes) => {
    const num = Number(minutes) || 0;
    if (num >= 60) {
        // Contoh: 90 menit -> "1.5 Jam"
        const hours = (num / 60).toFixed(1).replace('.0', ''); 
        return `${hours} Jam`;
    }
    return `${num} Menit`;
};

exports.getDashboardData = async (req, res) => {
    // 1. Validasi User ID dari Token
    const userId = Number(req.user?.id);
    if (!userId) {
        return res.status(400).json({ success: false, message: "User ID invalid" });
    }

    try {
        console.log(`🔄 Mengambil FULL Dashboard Data untuk User ID: ${userId}`);

        // ==========================================
        // 1. AMBIL DATA USER & PROFIL
        // ==========================================
        const { data: user } = await supabase
            .from('users')
            .select('name, xp, image_path')
            .eq('id', userId)
            .single();

        // Fix Avatar (Mengganti 'dos:' dengan UI Avatars)
        let avatarUrl = user?.image_path;
        if (!avatarUrl || avatarUrl.includes('dos:')) {
            const safeName = user?.name || 'User';
            avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(safeName)}&background=0D8ABC&color=fff`;
        }

        // ==========================================
        // 2. DATA SUBMISSION TERAKHIR (Rating Bintang)
        // ==========================================
        const { data: lastSub } = await supabase
            .from('developer_journey_submissions')
            .select(`
                rating, 
                note, 
                reviewer_id, 
                created_at, 
                developer_journeys ( name )
            `)
            .eq('submitter_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        const lastSubmissionData = lastSub ? {
            title: lastSub.developer_journeys?.name || "Submission Kelas",
            rating: lastSub.rating || 0,
            note: lastSub.note || "Belum ada catatan review.",
            status: (lastSub.rating >= 3) ? "Lulus (Passed)" : "Perlu Revisi"
        } : null;

        // ==========================================
        // 3. HITUNG STATISTIK (Input untuk ML)
        // ==========================================
        
        // A. Rata-rata Durasi Belajar
        const { data: completions } = await supabase
            .from('developer_journey_completions')
            .select('study_duration')
            .eq('user_id', userId);

        let totalDuration = 0;
        if (completions) {
            completions.forEach(c => {
                totalDuration += Number(String(c.study_duration).replace(/\D/g, '') || 0);
            });
        }
        const avgDuration = completions?.length > 0 ? (totalDuration / completions.length) : 0;

        // B. Tracking (Jumlah Modul & Frekuensi Login)
        const { data: trackings } = await supabase
            .from('developer_journey_trackings')
            .select('last_viewed')
            .eq('developer_id', userId);

        const totalModules = trackings?.length || 0;
        
        // Hitung hari unik login
        const loginDates = new Set(trackings?.map(t => new Date(t.last_viewed).toDateString()));
        let loginFrequency = loginDates.size || 1;

        // C. Nilai Ujian & Kegagalan
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

        // ==========================================
        // 4. DATA PENDUKUNG (Target, Active Course, Insight)
        // ==========================================

        // A. Active Course & Hitungan Waktu
        const { data: lastActivity } = await supabase
            .from('developer_journey_trackings')
            .select(`
                last_viewed,
                developer_journeys ( id, name, image_path, hours_to_study, difficulty, deadline )
            `)
            .eq('developer_id', userId)
            .order('last_viewed', { ascending: false })
            .limit(1)
            .maybeSingle();

        let activeCourse = null;
        let targetMessage = "Tetapkan target belajar untuk memantau progresmu.";

        if (lastActivity && lastActivity.developer_journeys) {
            const dj = lastActivity.developer_journeys;
            
            // --- LOGIKA PESAN REKOMENDASI ---
            const hoursNeeded = dj.hours_to_study || 60; // Default 60 jam
            const daysAllowed = dj.deadline || 60;       // Default 60 hari
            
            // Rumus: Total Jam / Hari Tersedia
            const dailyEffort = (hoursNeeded / daysAllowed).toFixed(1).replace('.0', '');
            
            targetMessage = `Berdasarkan materi ${hoursNeeded} Jam, kamu perlu menyisihkan ${dailyEffort} Jam/hari untuk selesai tepat waktu.`;

            activeCourse = {
                title: dj.name,
                image: `https://dicoding-web-img.sgp1.cdn.digitaloceanspaces.com/original/academy/${dj.image_path}`,
                hours: hoursNeeded,
                hours_display: `${hoursNeeded} Jam`,
                level: dj.difficulty === 1 ? 'Beginner' : 'Intermediate',
                progress_percent: 75 // (Bisa dikembangkan logic real-nya nanti)
            };
        }

        // B. Learning Target (Target Mingguan)
        const { data: target } = await supabase
            .from('learning_targets')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        const currentVal = Math.round(avgDuration);
        const maxVal = target?.target_value || 60;

        const learningTarget = {
            // Data Angka (Untuk lebar Progress Bar)
            current: currentVal, 
            max: maxVal,
            
            // Data Teks (Untuk Label UI) -> Pakai Helper Function
            current_display: formatDuration(currentVal),
            max_display: formatDuration(maxVal),
            
            type: target?.target_type || 'study_duration',
            status: target?.status || 'No Target',
            message: targetMessage // Pesan rekomendasi masuk sini
        };

        // C. Insight AI (Data Terbaru)
        const { data: lastInsight } = await supabase
            .from('user_learning_insights')
            .select('learning_style, motivation_quote, suggestions')
            .eq('user_id', userId)
            .order('generated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        // D. Rekomendasi Statis (Bisa diganti logika matriks nanti)
        const recommendation = {
            next_class: "Menjadi Android Developer Expert",
            match_percent: 95,
            reason: avgScore > 80 ? "Karena nilai ujianmu sangat bagus!" : "Lanjutan dari kelas saat ini."
        };

        // ==========================================
        // 5. RESPONSE FINAL (JSON LENGKAP)
        // ==========================================
        res.json({
            success: true,
            data: {
                user: {
                    name: user?.name || 'User',
                    xp: user?.xp || 0,
                    avatar: avatarUrl
                },
                ml_features: {
                    avg_completion_time: Math.round(avgDuration),
                    total_modules_read: totalModules,
                    avg_exam_score: Math.round(avgScore),
                    login_frequency: loginFrequency,
                    failed_exams: failedExams
                },
                ai_insight: {
                    type: lastInsight?.learning_style || "Menunggu Analisis...",
                    motivation: lastInsight?.motivation_quote || "Silakan klik tombol 'Analisis' di dashboard.",
                    advice: lastInsight?.suggestions?.[0] || "Belum ada saran."
                },
                // --- Widget Tambahan ---
                last_submission: lastSubmissionData,
                active_course: activeCourse,
                learning_target: learningTarget,
                recommendation: recommendation,
                exam_history: examResults?.slice(0, 3) || []
            }
        });

    } catch (err) {
        console.error("Dashboard Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};