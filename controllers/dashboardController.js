const supabase = require('../config/supabase');

// --- HELPER FUNCTION: Format Menit ke Jam/Menit ---
const formatDuration = (minutes) => {
    const num = Number(minutes) || 0;
    if (num >= 60) {
        const hours = (num / 60).toFixed(1).replace('.0', ''); 
        return `${hours} Jam`;
    }
    return `${num} Menit`;
};

// ==========================================
// 1. GET DASHBOARD DATA (READ)
// ==========================================
exports.getDashboardData = async (req, res) => {
    const authId = req.user?.id; 

    console.log("\n================ DASHBOARD REQUEST ================");
    console.log("🔑 ID dari Token:", authId);

    if (!authId) {
        return res.status(401).json({ success: false, message: "Unauthorized: No Token ID" });
    }

    try {
        // --- A. AMBIL DATA USER (LOGIKA HYBRID UUID/INT) ---
        let query = supabase.from('users').select('*');
        const isUuidFormat = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authId);

        if (isUuidFormat) {
            query = query.eq('uuid', authId);
        } else {
            query = query.eq('id', authId);
        }

        let { data: user, error: userError } = await query.maybeSingle();

        if (userError) console.error("❌ DB Error saat cari User:", userError.message);

        // Fallback jika user tidak ketemu
        if (!user) {
            console.warn("⚠️ User tidak ketemu. Pakai Dummy.");
            user = {
                id: isUuidFormat ? 0 : authId,
                name: "Guest User",
                xp: 0,
                uuid: null,
                image_path: null
            };
        }

        const userId = user.id; // ID Integer untuk relasi

        // Fix Avatar
        let avatarUrl = user?.image_path;
        if (!avatarUrl || avatarUrl.includes('dos:')) {
            const safeName = user?.name || 'User';
            avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(safeName)}&background=0D8ABC&color=fff`;
        }

        // --- B. DATA SUBMISSION TERAKHIR ---
        const { data: lastSub } = await supabase
            .from('developer_journey_submissions')
            .select(`rating, note, reviewer_id, created_at, developer_journeys ( name )`)
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

        // --- C. HITUNG STATISTIK ---
        
        // 1. Durasi
        const { data: completions } = await supabase
            .from('developer_journey_completions')
            .select('study_duration')
            .eq('user_id', userId);

        let totalDuration = 0;
        if (completions) completions.forEach(c => totalDuration += Number(String(c.study_duration).replace(/\D/g, '') || 0));
        const avgDuration = completions?.length > 0 ? (totalDuration / completions.length) : 0;

        // 2. Tracking
        const { data: trackings } = await supabase
            .from('developer_journey_trackings')
            .select('last_viewed')
            .eq('developer_id', userId);

        const totalModules = trackings?.length || 0;
        const loginDates = new Set(trackings?.map(t => new Date(t.last_viewed).toDateString()));
        let loginFrequency = loginDates.size || 1;

        // 3. Nilai Ujian
        const { data: examResults } = await supabase
            .from('exam_results')
            .select('score, is_passed, exam_registrations!inner(examinees_id)')
            .eq('exam_registrations.examinees_id', userId);

        let totalScore = 0, examCount = 0, failedExams = 0;
        if (examResults) {
            examResults.forEach(item => {
                const score = Number(String(item.score).replace(/\D/g, '') || 0);
                totalScore += score;
                examCount++;
                if (item.is_passed == 0) failedExams++;
            });
        }
        const avgScore = examCount > 0 ? (totalScore / examCount) : 0;

        // --- D. DATA PENDUKUNG ---

        // 1. Active Course
        const { data: lastActivity } = await supabase
            .from('developer_journey_trackings')
            .select(`last_viewed, developer_journeys ( id, name, image_path, hours_to_study, difficulty, deadline )`)
            .eq('developer_id', userId)
            .order('last_viewed', { ascending: false })
            .limit(1)
            .maybeSingle();

        let activeCourse = null;
        let targetMessage = "Tetapkan target belajar untuk memantau progresmu.";

        if (lastActivity && lastActivity.developer_journeys) {
            const dj = lastActivity.developer_journeys;
            const hoursNeeded = dj.hours_to_study || 60; 
            const daysAllowed = dj.deadline || 60;      
            const dailyEffort = (hoursNeeded / daysAllowed).toFixed(1).replace('.0', '');
            targetMessage = `Berdasarkan materi ${hoursNeeded} Jam, kamu perlu menyisihkan ${dailyEffort} Jam/hari untuk selesai tepat waktu.`;

            activeCourse = {
                title: dj.name,
                image: `https://dicoding-web-img.sgp1.cdn.digitaloceanspaces.com/original/academy/${dj.image_path}`,
                hours: hoursNeeded,
                hours_display: `${hoursNeeded} Jam`,
                level: dj.difficulty === 1 ? 'Beginner' : 'Intermediate',
                progress_percent: 75 
            };
        }

        // 2. Learning Target (Ambil dari DB)
        const { data: target } = await supabase
            .from('learning_targets')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        const currentVal = Math.round(avgDuration);
        const maxVal = target?.target_value || 60; // Default 60 jika belum set target

        const learningTarget = {
            current: currentVal, 
            max: maxVal,
            current_display: formatDuration(currentVal),
            max_display: formatDuration(maxVal),
            type: target?.target_type || 'study_duration',
            status: target?.status || 'No Target',
            message: targetMessage 
        };

        // 3. Insight AI
        const { data: lastInsight } = await supabase
            .from('user_learning_insights')
            .select('learning_style, motivation_quote, suggestions')
            .eq('user_id', userId)
            .order('generated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        // 4. Rekomendasi
        const recommendation = {
            next_class: "Menjadi Android Developer Expert",
            match_percent: 95,
            reason: avgScore > 80 ? "Karena nilai ujianmu sangat bagus!" : "Lanjutan dari kelas saat ini."
        };

        // --- E. RESPONSE JSON ---
        res.json({
            success: true,
            data: {
                user: {
                    name: user.name,
                    xp: user.xp,
                    avatar: avatarUrl,
                    student_id: user.student_id || "R248D5Y0905", 
                    university: user.university || "Universitas Lampung", 
                    major: user.major || "Electrical Engineering",     
                    mentor: "Majid Solihin Hadi" 
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
                last_submission: lastSubmissionData,
                active_course: activeCourse,
                learning_target: learningTarget,
                recommendation: recommendation,
                exam_history: examResults?.slice(0, 3) || []
            }
        });

    } catch (err) {
        console.error("❌ DASHBOARD ERROR:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};

// ==========================================
// 2. SET LEARNING TARGET (WRITE)
// ==========================================
exports.setLearningTarget = async (req, res) => {
    const authId = req.user?.id; // UUID dari Token
    const { target_minutes } = req.body; // Input dari Frontend

    console.log("\n================ SET TARGET REQUEST ================");
    console.log("🔑 ID Token:", authId);
    console.log("🎯 Target Baru:", target_minutes);

    if (!authId) return res.status(401).json({ success: false, message: "Unauthorized" });
    if (!target_minutes || isNaN(target_minutes)) {
        return res.status(400).json({ success: false, message: "Target harus angka (menit)." });
    }

    try {
        // 1. Cari ID Integer User (Logic Hybrid seperti di atas)
        let query = supabase.from('users').select('id');
        const isUuidFormat = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authId);

        if (isUuidFormat) query = query.eq('uuid', authId);
        else query = query.eq('id', authId);

        const { data: user, error: userError } = await query.single();

        if (userError || !user) {
            return res.status(404).json({ success: false, message: "User profile not found." });
        }

        const userId = user.id;

        // 2. Upsert Target (Update kalau ada, Insert kalau belum)
        const { data, error } = await supabase
            .from('learning_targets')
            .upsert({ 
                user_id: userId,
                target_value: parseInt(target_minutes),
                target_type: 'study_duration',
                status: 'active',
                updated_at: new Date()
            }, { 
                onConflict: 'user_id, target_type' // Kunci unique constraint
            })
            .select();

        if (error) throw error;

        res.json({
            success: true,
            message: "Target belajar berhasil diperbarui!",
            data: data
        });

    } catch (err) {
        console.error("❌ SET TARGET ERROR:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};