const supabase = require('../config/supabase');

// --- HELPER 1: Format Menit ke Jam/Menit ---
const formatDuration = (minutes) => {
    const num = Number(minutes) || 0;
    if (num >= 60) {
        const hours = (num / 60).toFixed(1).replace('.0', ''); 
        return `${hours} Jam`;
    }
    return `${num} Menit`;
};

// --- HELPER 2: Generate Deskripsi Berdasarkan Tipe Belajar ---
const getLearningDescription = (type) => {
    if (!type) return "Data aktivitas belum cukup untuk analisis mendalam.";
    
    const t = String(type).toLowerCase();
    
    if (t.includes('struggling')) {
        return "Terdeteksi adanya kendala pada pemahaman materi dasar. Konsistensi diperlukan.";
    } else if (t.includes('consistent')) {
        return "Hebat! Pola belajarmu sangat teratur. Data tracking menunjukkan kamu mengakses materi secara rutin setiap hari.";
    } else if (t.includes('fast') || t.includes('ambitious')) {
        return "Luar biasa! Kecepatan penyelesaian modulmu di atas rata-rata. Kamu memiliki daya tangkap yang cepat.";
    } else if (t.includes('high achiever') || t.includes('expert')) {
        return "Performa sempurna! Nilai submission dan ujianmu menunjukkan penguasaan materi yang sangat mendalam.";
    } else if (t.includes('procrastinator') || t.includes('deadliner')) {
        return "Pola belajar cenderung menumpuk di akhir waktu. Disarankan membagi waktu belajar lebih merata.";
    } else {
        return "Pola belajarmu unik dan sedang dianalisis lebih lanjut oleh sistem kami.";
    }
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
        // --- A. AMBIL DATA USER (LOGIKA HYBRID) ---
        let query = supabase.from('users').select('*');
        const isUuidFormat = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authId);

        if (isUuidFormat) query = query.eq('uuid', authId);
        else query = query.eq('id', authId);

        let { data: user, error: userError } = await query.maybeSingle();

        if (userError) console.error("❌ DB Error saat cari User:", userError.message);

        // Fallback user dummy
        if (!user) {
            console.warn("⚠️ User tidak ketemu. Pakai Dummy.");
            user = {
                id: isUuidFormat ? 0 : authId,
                name: "Guest User",
                image_path: null,
                student_id: "ID-???",
                university: "-",
                major: "-",
                mentor: "-"
            };
        }

        const userId = user.id;

        // Fix Avatar
        let avatarUrl = user?.image_path;
        if (!avatarUrl || avatarUrl.includes('dos:')) {
            const safeName = user?.name || 'User';
            avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(safeName)}&background=0D8ABC&color=fff`;
        }

        // --- B. HITUNG TOTAL XP ---
        const { data: xpData } = await supabase
            .from('developer_journey_completions')
            .select(`developer_journeys ( xp )`)
            .eq('user_id', userId);

        let totalXp = 0;
        if (xpData) {
            xpData.forEach(item => {
                if (item.developer_journeys && item.developer_journeys.xp) {
                    totalXp += Number(item.developer_journeys.xp);
                }
            });
        }

        // --- C. DATA SUBMISSION TERAKHIR ---
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

        // --- D. HITUNG STATISTIK ---
        
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

        // --- E. DATA PENDUKUNG UI ---

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

        // 2. Learning Target
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
            current: currentVal, 
            max: maxVal,
            current_display: formatDuration(currentVal),
            max_display: formatDuration(maxVal),
            type: target?.target_type || 'study_duration',
            status: target?.status || 'No Target',
            message: targetMessage 
        };

        // 3. Insight AI (Data Asli DB)
        const { data: lastInsight } = await supabase
            .from('user_learning_insights')
            .select('learning_style, motivation_quote, suggestions')
            .eq('user_id', userId)
            .order('generated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        // Proses Tipe & Deskripsi
        const insightType = lastInsight?.learning_style || "Menunggu Analisis...";
        const insightDescription = getLearningDescription(insightType);

        // 4. Rekomendasi
        const recommendation = {
            next_class: "Menjadi Android Developer Expert",
            match_percent: 95,
            reason: avgScore > 80 ? "Karena nilai ujianmu sangat bagus!" : "Lanjutan dari kelas saat ini."
        };

        // --- F. RESPONSE FINAL ---
        res.json({
            success: true,
            data: {
                user: {
                    name: user.name,
                    xp: totalXp, 
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
                
                // 👇 KEY 1: Learner Profile (Tipe + Deskripsi)
                learner_profile: {
                    type: insightType,
                    description: insightDescription
                },

                // 👇 KEY 2: AI Insight (Tipe + Motivasi + Saran)
                ai_insight: {
                    type: insightType, // Ditambahkan kembali sesuai request
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
    const authId = req.user?.id; 
    const { target_minutes } = req.body; 

    if (!authId) return res.status(401).json({ success: false, message: "Unauthorized" });
    if (!target_minutes || isNaN(target_minutes)) {
        return res.status(400).json({ success: false, message: "Target harus angka (menit)." });
    }

    try {
        console.log(`🎯 Update Target Request: ${authId} -> ${target_minutes} Menit`);

        let query = supabase.from('users').select('id');
        const isUuidFormat = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authId);

        if (isUuidFormat) query = query.eq('uuid', authId);
        else query = query.eq('id', authId);

        const { data: user, error: userError } = await query.single();

        if (userError || !user) {
            return res.status(404).json({ success: false, message: "User tidak ditemukan." });
        }

        const userId = user.id;

        // Manual Check Upsert
        const { data: existingTarget } = await supabase
            .from('learning_targets')
            .select('id')
            .eq('user_id', userId)
            .eq('target_type', 'study_duration')
            .maybeSingle();

        let resultData;

        if (existingTarget) {
            const { data, error } = await supabase
                .from('learning_targets')
                .update({ 
                    target_value: parseInt(target_minutes),
                    status: 'active',
                    start_date: new Date()
                })
                .eq('id', existingTarget.id)
                .select();
            if (error) throw error;
            resultData = data;
        } else {
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
        console.error("❌ SET TARGET ERROR:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};