const supabase = require('../config/supabase');
const tf = require('@tensorflow/tfjs');

// 1. KONFIGURASI MODEL
const MODEL_URL = 'https://xcnljwbftvrpzilgjnzi.supabase.co/storage/v1/object/public/ml-models/model.json'; 

// 2. DATA NORMALISASI (Sesuaikan dengan Tim ML nanti)
const SCALER_DATA = {
    minVal: [10, 0, 0, 0, 0],   
    scaleVal: [0.01, 0.05, 0.01, 0.1, 1] 
};

// 3. MAPPING OUTPUT AI KE KALIMAT MANUSIA (UPDATE DI SINI)
const LABEL_MAP = {
    0: { 
        type: 'Fast Learner', 
        motivation: 'Kecepatanmu luar biasa! Jangan lupa istirahat.',
        suggestions: [
            "Ambil tantangan coding expert.",
            "Bantu teman di forum diskusi.",
            "Pelajari framework lanjutan."
        ]
    },
    1: { 
        type: 'Consistent Learner', 
        motivation: 'Konsistensi adalah kunci. Pertahankan!',
        suggestions: [
            "Pertahankan jadwal belajar harian.",
            "Review materi minggu lalu.",
            "Mulai proyek portofolio kecil."
        ]
    },
    2: { 
        type: 'Reflective Learner', 
        motivation: 'Pemahamanmu sangat dalam. Hebat!',
        suggestions: [
            "Buat rangkuman materi sendiri.",
            "Eksplorasi dokumentasi resmi.",
            "Coba teknik Feynman untuk menguji pemahaman."
        ]
    },
    3: { 
        type: 'Struggling Learner', 
        motivation: 'Jangan menyerah, kegagalan adalah awal keberhasilan.',
        suggestions: [
            "Ulangi materi dasar modul sebelumnya.",
            "Jangan ragu bertanya pada mentor.",
            "Fokus pada satu topik dalam satu waktu."
        ]
    }
};

exports.generatePrediction = async (req, res) => {
    const userId = req.user.id;

    try {
        console.log(`🤖 Backend menyiapkan data AI untuk User ID: ${userId}`);

        // --- (BAGIAN 1: AMBIL DATA & HITUNG FITUR SAMA SEPERTI SEBELUMNYA) ---
        
        // A. Nilai Ujian
        const { data: examResults } = await supabase
            .from('exam_results')
            .select('score, is_passed, exam_registrations!inner(examinees_id)')
            .eq('exam_registrations.examinees_id', userId);

        let totalScore = 0, examCount = 0, failedExams = 0;
        if (examResults) {
            examResults.forEach(item => {
                totalScore += Number(item.score || 0);
                examCount++;
                if (item.is_passed === 0) failedExams++;
            });
        }
        const avgScore = examCount > 0 ? (totalScore / examCount) : 0;

        // B. Durasi
        const { data: completions } = await supabase
            .from('developer_journey_completions').select('study_duration').eq('user_id', userId);
        let totalDuration = 0;
        if (completions) completions.forEach(c => totalDuration += Number(String(c.study_duration).replace(/\D/g, '') || 0));
        const avgTime = completions?.length > 0 ? (totalDuration / completions.length) : 0;

        // C. Tracking
        const { data: trackings } = await supabase
            .from('developer_journey_trackings').select('last_viewed').eq('developer_id', userId);
        const totalModules = trackings?.length || 0;
        const loginDates = new Set(trackings?.map(t => new Date(t.last_viewed).toDateString()));
        const loginFreq = loginDates.size || 0;

        // Data Mentah
        const rawFeatures = [avgTime, totalModules, avgScore, loginFreq, failedExams];

        // --- (BAGIAN 2: NORMALISASI) ---
        const normalizedInput = rawFeatures.map((val, index) => {
            return (val - SCALER_DATA.minVal[index]) * SCALER_DATA.scaleVal[index];
        });

        // --- (BAGIAN 3: PREDIKSI AI) ---
        let hasilPrediksi;
        let confidenceScore;

        try {
            const model = await tf.loadLayersModel(MODEL_URL);
            const inputTensor = tf.tensor2d([normalizedInput]);
            const prediction = model.predict(inputTensor);
            const resultIndex = prediction.argMax(-1).dataSync()[0]; 
            
            // AMBIL DATA LENGKAP DARI MAP BARU KITA
            hasilPrediksi = LABEL_MAP[resultIndex]; 
            confidenceScore = Math.max(...prediction.dataSync());

        } catch (aiError) {
            console.warn("⚠️ Fallback Manual:", aiError.message);
            // Logika Manual juga harus punya suggestions
            if (failedExams > 2 || avgScore < 50) hasilPrediksi = LABEL_MAP[3]; 
            else if (avgTime < 30 && avgScore > 80) hasilPrediksi = LABEL_MAP[0]; 
            else if (totalModules > 10) hasilPrediksi = LABEL_MAP[1]; 
            else hasilPrediksi = LABEL_MAP[2]; 
            confidenceScore = 0.5;
        }

        // --- (BAGIAN 4: SIMPAN KE DB) ---
        const { error: saveError } = await supabase
            .from('user_learning_insights')
            .insert({
                user_id: userId,
                learning_style: hasilPrediksi.type,
                prediction_confidence: confidenceScore,
                motivation_quote: hasilPrediksi.motivation,
                suggestions: hasilPrediksi.suggestions, // <--- SEKARANG DIAMBIL DINAMIS
                generated_at: new Date()
            });

        if (saveError) throw saveError;

        // --- (RESPONSE) ---
        res.json({
            success: true,
            message: "Prediksi Selesai & Disimpan!",
            data: {
                type: hasilPrediksi.type,
                motivation: hasilPrediksi.motivation,
                suggestions: hasilPrediksi.suggestions, // <--- DIKIRIM KE FRONTEND JUGA
                input_used: rawFeatures
            }
        });

    } catch (err) {
        console.error("Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};