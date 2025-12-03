const supabase = require('../config/supabase');

exports.getDashboardData = async (req, res) => {
    // Debug 1: Cek apakah ID User masuk dari Middleware?
    console.log("🔍 DEBUG START: Request Masuk");
    console.log("👤 User di Request:", req.user);
    
    // Pastikan ID dianggap angka (Integer), bukan String
    const userId = Number(req.user?.id); 

    if (!userId) {
        console.error("❌ ERROR: User ID tidak ditemukan atau 0");
        return res.status(400).json({ success: false, message: "User ID invalid" });
    }

    try {
        console.log(`📡 Mencari data di DB untuk User ID: ${userId} (Tipe: ${typeof userId})`);

        // 1. DATA PROFIL (Debug Query)
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('*') // Ambil semua kolom
            .eq('id', userId)
            .maybeSingle(); // Pakai maybeSingle biar gak error kalau kosong

        // --- CEK HASILNYA DI TERMINAL ---
        if (userError) {
            console.error("❌ DB Error saat ambil User:", userError.message);
        } else if (!user) {
            console.error("⚠️ DATA KOSONG: User dengan ID ini TIDAK DITEMUKAN di tabel users.");
            console.error("👉 Saran: Cek apakah ID di token sama dengan ID di tabel users?");
        } else {
            console.log("✅ DATA DITEMUKAN:", user.name);
        }
        // --------------------------------

        // 2. DATA KOMPLETION
        const { data: completions } = await supabase
            .from('developer_journey_completions')
            .select('study_duration')
            .eq('user_id', userId);

        // ... (Kode hitung durasi sama seperti sebelumnya) ...
        let totalDuration = 0;
        if (completions) {
            completions.forEach(c => {
                totalDuration += Number(String(c.study_duration).replace(/\D/g, '') || 0);
            });
        }
        const avgDuration = completions?.length > 0 ? (totalDuration / completions.length) : 0;

        // 3. DATA TRACKING
        const { data: trackings } = await supabase
            .from('developer_journey_trackings')
            .select('last_viewed')
            .eq('developer_id', userId);

        const totalModules = trackings?.length || 0;
        
        // ... (Kode hitung login frequency) ...
        const loginDates = new Set(trackings?.map(t => new Date(t.last_viewed).toDateString()));
        let loginFrequency = loginDates.size; 
        if (loginFrequency === 0 && user) loginFrequency = 1;

        // 4. DATA UJIAN
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

        // 5. ML FEATURES
        const mlFeatures = {
            avg_completion_time: Math.round(avgDuration),
            total_modules_read: totalModules,
            avg_exam_score: Math.round(avgScore),
            login_frequency: loginFrequency,
            failed_exams: failedExams
        };

        // 6. INSIGHT
        const { data: lastInsight } = await supabase
            .from('user_learning_insights')
            .select('learning_style, motivation_quote, suggestions')
            .eq('user_id', userId)
            .order('generated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        // LOGIKA AVATAR (Pencegah Gambar Rusak)
        let avatarUrl = user?.image_path;
        if (!avatarUrl || avatarUrl.includes('dos:')) {
            const safeName = user?.name || 'User';
            avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(safeName)}&background=0D8ABC&color=fff`;
        }

        // RESPONSE JSON
        res.json({
            success: true,
            data: {
                user: {
                    name: user?.name || 'User', // Kalau user null, dia lari ke 'User'
                    xp: user?.xp || 0,
                    avatar: avatarUrl
                },
                ml_features: mlFeatures,
                ai_insight: {
                    type: lastInsight?.learning_style || "Menunggu Analisis...",
                    motivation: lastInsight?.motivation_quote || "Silakan klik tombol 'Analisis' di dashboard.",
                    advice: lastInsight?.suggestions?.[0] || "Belum ada saran."
                },
                exam_history: examResults?.slice(0, 3) || []
            }
        });

    } catch (err) {
        console.error("🔥 CRITICAL ERROR:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};