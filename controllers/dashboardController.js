const supabase = require('../config/supabase');

exports.getDashboardData = async (req, res) => {
    const userId = Number(req.user?.id);
    
    if (!userId) {
        return res.status(400).json({ success: false, message: "User ID invalid" });
    }

    try {
        console.log(`🔄 Mengambil Dashboard Data Lengkap untuk: ${userId}`);

        // 1. DATA USER & AVATAR
        const { data: user } = await supabase
            .from('users')
            .select('name, xp, image_path')
            .eq('id', userId)
            .single();

        let avatarUrl = user?.image_path;
        if (!avatarUrl || avatarUrl.includes('dos:')) {
            const safeName = user?.name || 'User';
            avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(safeName)}&background=0D8ABC&color=fff`;
        }

        // 2. DATA SUBMISSION TERAKHIR (UNTUK WIDGET RATING) <--- INI YANG BARU
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

        // Format data submission agar rapi
        const lastSubmissionData = lastSub ? {
            title: lastSub.developer_journeys?.name || "Submission Kelas",
            rating: lastSub.rating || 0, // Bintang 1-5
            note: lastSub.note || "Belum ada catatan review.",
            reviewer_id: lastSub.reviewer_id,
            status: (lastSub.rating >= 3) ? "Lulus (Passed)" : "Perlu Revisi"
        } : null;

        // 3. STATISTIK (ML Features)
        // (Hitung manual seperti sebelumnya biar aman dari error view)
        
        // A. Durasi Belajar
        const { data: completions } = await supabase
            .from('developer_journey_completions').select('study_duration').eq('user_id', userId);
        let totalDuration = 0;
        if (completions) completions.forEach(c => totalDuration += Number(String(c.study_duration).replace(/\D/g, '') || 0));
        const avgDuration = completions?.length > 0 ? (totalDuration / completions.length) : 0;

        // B. Tracking
        const { data: trackings } = await supabase
            .from('developer_journey_trackings').select('last_viewed').eq('developer_id', userId);
        const totalModules = trackings?.length || 0;
        const loginDates = new Set(trackings?.map(t => new Date(t.last_viewed).toDateString()));
        let loginFrequency = loginDates.size || 1;

        // C. Nilai Ujian
        const { data: examResults } = await supabase
            .from('exam_results')
            .select('score, is_passed, exam_registrations!inner(examinees_id)')
            .eq('exam_registrations.examinees_id', userId);
        
        let totalScore = 0;
        let examCount = 0;
        let failedExams = 0;
        if (examResults) {
            examResults.forEach(item => {
                totalScore += Number(String(item.score).replace(/\D/g, '') || 0);
                examCount++;
                if (item.is_passed == 0) failedExams++;
            });
        }
        const avgScore = examCount > 0 ? (totalScore / examCount) : 0;

        // 4. DATA PENDUKUNG LAIN (Target, Active Course, Insight)
        
        // Active Course
        const { data: lastActivity } = await supabase
            .from('developer_journey_trackings')
            .select(`last_viewed, developer_journeys ( id, name, image_path, hours_to_study, difficulty )`)
            .eq('developer_id', userId)
            .order('last_viewed', { ascending: false })
            .limit(1)
            .maybeSingle();

        const activeCourse = lastActivity ? {
            title: lastActivity.developer_journeys.name,
            image: `https://dicoding-web-img.sgp1.cdn.digitaloceanspaces.com/original/academy/${lastActivity.developer_journeys.image_path}`,
            hours: lastActivity.developer_journeys.hours_to_study,
            level: lastActivity.developer_journeys.difficulty === 1 ? 'Beginner' : 'Intermediate',
            progress_percent: 75 
        } : null;

        // Target Belajar
        const { data: target } = await supabase
            .from('learning_targets')
            .select('*')
            .eq('user_id', userId)
            .eq('status', 'active')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        const learningTarget = {
            current: Math.round(avgDuration), // Kita pakai avg duration sebagai progress saat ini
            max: target?.target_value || 60,
            type: target?.target_type || 'study_duration',
            status: target?.status || 'No Target'
        };

        // Insight AI
        const { data: lastInsight } = await supabase
            .from('user_learning_insights')
            .select('learning_style, motivation_quote, suggestions')
            .eq('user_id', userId)
            .order('generated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        // 5. RESPONSE FINAL
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
                // DATA WIDGET TAMBAHAN
                last_submission: lastSubmissionData, // <--- Ini data Rating Bintang
                active_course: activeCourse,
                learning_target: learningTarget,
                recommendation: {
                    next_class: "Menjadi Android Developer Expert",
                    match_percent: 95,
                    reason: avgScore > 80 ? "Nilai ujianmu sangat bagus!" : "Lanjutan dari kelas saat ini."
                },
                exam_history: examResults?.slice(0, 3) || []
            }
        });

    } catch (err) {
        console.error("Dashboard Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};