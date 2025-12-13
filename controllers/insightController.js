const supabase = require('../config/supabase');
const tf = require('@tensorflow/tfjs');

// 1. KONFIGURASI MODEL
const MODEL_URL = 'https://xcnljwbftvrpzilgjnzi.supabase.co/storage/v1/object/public/ml-models/model.json'; 

// 2. DATA NORMALISASI
const SCALER_DATA = {
    minVal: [10, 0, 0, 0, 0],   
    scaleVal: [0.01, 0.05, 0.01, 0.1, 1] 
};

// 3. DATABASE LABEL LENGKAP
const LABEL_MAP = {
    0: { 
        type: 'Fast Learner', 
        motivation: 'Kecepatanmu luar biasa! Kamu melahap materi dengan sangat efisien.',
        suggestions: [
            "Ambil tantangan coding expert.",
            "Bantu teman di forum diskusi.",
            "Pelajari framework lanjutan."
        ]
    },
    1: { 
        type: 'Consistent Learner', 
        motivation: 'Konsistensi adalah kunci, dan kamu memilikinya. Pertahankan ritme ini!',
        suggestions: [
            "Pertahankan jadwal belajar harian.",
            "Review materi minggu lalu.",
            "Mulai proyek portofolio kecil."
        ]
    },
    2: { 
        type: 'High Achiever', // Saya ganti Reflective jadi High Achiever biar lebih keren
        motivation: 'Nilai sempurna! Pemahamanmu terhadap materi sangat mendalam.',
        suggestions: [
            "Eksplorasi dokumentasi resmi untuk detail teknis.",
            "Coba teknik Feynman untuk menguji pemahaman.",
            "Ikuti kompetisi atau Hackathon."
        ]
    },
    3: { 
        type: 'Struggling Learner', 
        motivation: 'Jangan menyerah, setiap error adalah langkah menuju keberhasilan.',
        suggestions: [
            "Ulangi materi dasar modul sebelumnya.",
            "Jangan ragu bertanya pada mentor.",
            "Fokus pada satu topik dalam satu waktu."
        ]
    }
};

exports.generatePrediction = async (req, res) => {
    const authId = req.user?.id; // UUID dari Token

    try {
        console.log(`🤖 Memulai Prediksi AI untuk UUID: ${authId}`);

        // --- 1. CARI USER INTEGER ID DULU ---
        // (Sama seperti dashboardController, kita butuh ID Integer untuk relasi)
        let queryUser = supabase.from('users').select('id');
        const isUuidFormat = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(authId);
        
        if (isUuidFormat) queryUser = queryUser.eq('uuid', authId);
        else queryUser = queryUser.eq('id', authId);

        const { data: userData } = await queryUser.maybeSingle();
        if (!userData) throw new Error("User tidak ditemukan.");
        const userId = userData.id;

        // --- 2. AMBIL DATA & HITUNG FITUR ---
        
        // A. Nilai Ujian
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

        // B. Durasi Belajar
        const { data: completions } = await supabase
            .from('developer_journey_completions')
            .select('study_duration')
            .eq('user_id', userId);
            
        let totalDuration = 0;
        if (completions) completions.forEach(c => totalDuration += Number(String(c.study_duration).replace(/\D/g, '') || 0));
        const avgTime = completions?.length > 0 ? (totalDuration / completions.length) : 0;

        // C. Tracking Aktivitas
        const { data: trackings } = await supabase
            .from('developer_journey_trackings')
            .select('last_viewed')
            .eq('developer_id', userId);
            
        const totalModules = trackings?.length || 0;
        const loginDates = new Set(trackings?.map(t => new Date(t.last_viewed).toDateString()));
        const loginFreq = loginDates.size || 0;

        // Data Mentah untuk Input AI
        const rawFeatures = [avgTime, totalModules, avgScore, loginFreq, failedExams];
        console.log("📊 Statistik User:", { avgScore, avgTime, totalModules, loginFreq, failedExams });

        // --- 3. PROSES PREDIKSI (AI + LOGIKA PINTAR) ---
        let hasilPrediksi;
        let confidenceScore;
        let isManualLogic = false;

        try {
            // Coba Load Model TensorFlow
            const model = await tf.loadLayersModel(MODEL_URL);
            
            // Normalisasi Data
            const normalizedInput = rawFeatures.map((val, index) => {
                return (val - SCALER_DATA.minVal[index]) * SCALER_DATA.scaleVal[index];
            });

            // Prediksi
            const inputTensor = tf.tensor2d([normalizedInput]);
            const prediction = model.predict(inputTensor);
            const resultIndex = prediction.argMax(-1).dataSync()[0];
            
            hasilPrediksi = LABEL_MAP[resultIndex];
            confidenceScore = Math.max(...prediction.dataSync());
            
            // 🔥 OVERRIDE AI: Jika AI bilang Struggling tapi nilainya bagus, kita koreksi!
            // Ini pengaman agar AI yang belum matang tidak memberikan label salah
            if (resultIndex === 3 && avgScore > 75) {
                console.log("⚠️ AI bilang Struggling, tapi nilai User Bagus. Switch ke Logika Manual.");
                throw new Error("AI Mismatch"); // Lempar ke catch di bawah
            }

        } catch (aiError) {
            isManualLogic = true;
            console.log("⚠️ Menggunakan Logika Cerdas (Rule-Based) karena:", aiError.message);

            // === LOGIKA MANUAL CERDAS (Supaya Variatif) ===
            
            // 1. High Achiever (Prioritas Tertinggi)
            if (avgScore >= 85 && failedExams <= 1) {
                hasilPrediksi = LABEL_MAP[2]; // High Achiever
            } 
            // 2. Fast Learner (Cepat & Nilai Oke)
            else if (avgTime < 45 && avgScore >= 70) {
                hasilPrediksi = LABEL_MAP[0]; // Fast Learner
            } 
            // 3. Consistent Learner (Rajin Login / Baca Modul)
            else if (loginFreq >= 5 || totalModules >= 20) {
                hasilPrediksi = LABEL_MAP[1]; // Consistent
            } 
            // 4. Struggling Learner (Sisa kondisi buruk)
            else if (failedExams > 2 || avgScore < 60) {
                hasilPrediksi = LABEL_MAP[3]; // Struggling
            } 
            // 5. Default (Jika data masih dikit banget, anggap Consistent dulu biar positif)
            else {
                hasilPrediksi = LABEL_MAP[1]; 
            }

            confidenceScore = 0.85; // Confidence manual
        }

        console.log(`✅ Hasil Akhir: ${hasilPrediksi.type} (Score: ${avgScore})`);

        // --- 4. SIMPAN KE DB (AGAR DASHBOARD BISA BACA) ---
        // Kita gunakan UPSERT agar tidak menumpuk data lama, tapi update yang terbaru
        
        // Cek data lama dulu (opsional, tapi bagus buat log)
        const { data: existingInsight } = await supabase
            .from('user_learning_insights')
            .select('id')
            .eq('user_id', userId)
            .maybeSingle();

        if (existingInsight) {
            // Update
            await supabase
                .from('user_learning_insights')
                .update({
                    learning_style: hasilPrediksi.type,
                    prediction_confidence: confidenceScore,
                    motivation_quote: hasilPrediksi.motivation,
                    suggestions: hasilPrediksi.suggestions,
                    generated_at: new Date()
                })
                .eq('id', existingInsight.id);
        } else {
            // Insert Baru
            await supabase
                .from('user_learning_insights')
                .insert({
                    user_id: userId,
                    learning_style: hasilPrediksi.type,
                    prediction_confidence: confidenceScore,
                    motivation_quote: hasilPrediksi.motivation,
                    suggestions: hasilPrediksi.suggestions,
                    generated_at: new Date()
                });
        }

        // --- RESPONSE ---
        res.json({
            success: true,
            message: "Analisis Selesai!",
            data: {
                type: hasilPrediksi.type,
                motivation: hasilPrediksi.motivation,
                suggestions: hasilPrediksi.suggestions,
                stats_used: {
                    avg_score: Math.round(avgScore),
                    failed_exams: failedExams,
                    login_frequency: loginFreq
                },
                method: isManualLogic ? "Rule-Based Logic" : "TensorFlow AI"
            }
        });

    } catch (err) {
        console.error("Critical Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};