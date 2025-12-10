const supabase = require('../config/supabase');
const tf = require('@tensorflow/tfjs');

// 1. KONFIGURASI MODEL
const MODEL_URL = 'https://xcnljwbftvrpzilgjnzi.supabase.co/storage/v1/object/public/ml-models/model.json'; // Ganti Project ID kamu

// 2. DATA NORMALISASI (Wajib diisi sesuai info Tim ML / scaling_info.json)
// Kalau belum ada datanya, biarkan default, tapi nanti akurasinya kurang maksimal.
const SCALER_DATA = {
    minVal: [10, 0, 0, 0, 0],   // [Time, Modules, Score, Login, Failed]
    scaleVal: [0.01, 0.05, 0.01, 0.1, 1] 
};

const LABEL_MAP = {
    0: { type: 'Fast Learner', motivation: 'Kecepatanmu luar biasa! Jangan lupa istirahat.' },
    1: { type: 'Consistent Learner', motivation: 'Konsistensi adalah kunci. Pertahankan!' },
    2: { type: 'Reflective Learner', motivation: 'Pemahamanmu sangat dalam. Hebat!' },
    3: { type: 'Struggling Learner', motivation: 'Jangan menyerah, coba ulangi materi dasar.' }
};

exports.generatePrediction = async (req, res) => {
    const userId = req.user.id;

    try {
        console.log(`🤖 Backend menyiapkan data AI untuk User ID: ${userId}`);

        // ==========================================
        // LANGKAH 1: AMBIL DATA MANUAL DARI DATABASE
        // (Pengganti RPC yang error tadi)
        // ==========================================
        
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

        // B. Durasi Belajar
        const { data: completions } = await supabase
            .from('developer_journey_completions')
            .select('study_duration')
            .eq('user_id', userId);

        let totalDuration = 0;
        if (completions) {
            completions.forEach(c => totalDuration += Number(String(c.study_duration).replace(/\D/g, '') || 0));
        }
        const avgTime = completions?.length > 0 ? (totalDuration / completions.length) : 0;

        // C. Tracking Modul & Login
        const { data: trackings } = await supabase
            .from('developer_journey_trackings')
            .select('last_viewed')
            .eq('developer_id', userId);

        const totalModules = trackings?.length || 0;
        const loginDates = new Set(trackings?.map(t => new Date(t.last_viewed).toDateString()));
        const loginFreq = loginDates.size || 0;

        // Data Mentah (Raw Features)
        const rawFeatures = [avgTime, totalModules, avgScore, loginFreq, failedExams];
        console.log("📊 Data Mentah:", rawFeatures);

        // ==========================================
        // LANGKAH 2: NORMALISASI DATA (PENTING!)
        // Ubah angka besar jadi 0.0 - 1.0 (Sesuai request Tim ML)
        // ==========================================
        const normalizedInput = rawFeatures.map((val, index) => {
            return (val - SCALER_DATA.minVal[index]) * SCALER_DATA.scaleVal[index];
        });
        
        console.log("📐 Data Ternormalisasi:", normalizedInput);

        // ==========================================
        // LANGKAH 3: PREDIKSI DENGAN TENSORFLOW.JS
        // ==========================================
        let hasilPrediksi;
        let confidenceScore;

        try {
            console.log("⏳ Mendownload model...");
            const model = await tf.loadLayersModel(MODEL_URL);
            
            // Input harus Tensor 2D: [[0.5, 0.2, ...]]
            const inputTensor = tf.tensor2d([normalizedInput]);
            
            const prediction = model.predict(inputTensor);
            const resultIndex = prediction.argMax(-1).dataSync()[0]; // Dapat index 0, 1, 2, atau 3
            
            hasilPrediksi = LABEL_MAP[resultIndex];
            confidenceScore = Math.max(...prediction.dataSync());
            
            console.log(`✅ AI Sukses! Hasil: ${hasilPrediksi.type}`);

        } catch (aiError) {
            console.warn("⚠️ Gagal Load Model (Fallback ke Logika Manual):", aiError.message);
            
            // LOGIKA MANUAL (JAGA-JAGA JIKA MODEL ERROR/BELUM UPLOAD)
            if (failedExams > 2 || avgScore < 50) {
                hasilPrediksi = LABEL_MAP[3]; 
            } else if (avgTime < 30 && avgScore > 80) {
                hasilPrediksi = LABEL_MAP[0]; 
            } else if (totalModules > 10) {
                hasilPrediksi = LABEL_MAP[1]; 
            } else {
                hasilPrediksi = LABEL_MAP[2]; 
            }
            confidenceScore = 0.5; // Confidence rendah karena manual
        }

        // ==========================================
        // LANGKAH 4: SIMPAN KE DATABASE
        // ==========================================
        const { error: saveError } = await supabase
            .from('user_learning_insights')
            .insert({
                user_id: userId,
                learning_style: hasilPrediksi.type,
                prediction_confidence: confidenceScore,
                motivation_quote: hasilPrediksi.motivation,
                suggestions: ["Cek materi rekomendasi", "Latihan soal lagi"],
                generated_at: new Date()
            });

        if (saveError) throw saveError;

        res.json({
            success: true,
            message: "Prediksi Selesai & Disimpan!",
            data: {
                type: hasilPrediksi.type,
                motivation: hasilPrediksi.motivation,
                input_used: rawFeatures // Debugging
            }
        });

    } catch (err) {
        console.error("❌ Insight Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};