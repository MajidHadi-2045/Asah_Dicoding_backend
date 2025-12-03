const supabase = require('../config/supabase');
const tf = require('@tensorflow/tfjs');

// URL Model dari Supabase Storage (Nanti diganti kalau sudah upload)
// Ingat: Supabase cuma menyimpan, Backend yang mendownload & menjalankan.
const MODEL_URL = 'https://link-kamu.supabase.co/storage/v1/object/public/ml-models/model.json';

const LABEL_MAP = {
    0: { type: 'Fast Learner', motivation: 'Kecepatanmu luar biasa! Jangan lupa istirahat.' },
    1: { type: 'Consistent Learner', motivation: 'Konsistensi adalah kunci. Pertahankan!' },
    2: { type: 'Reflective Learner', motivation: 'Pemahamanmu sangat dalam. Hebat!' },
    3: { type: 'Struggling Learner', motivation: 'Jangan menyerah, coba ulangi materi dasar.' }
};

exports.generatePrediction = async (req, res) => {
    const userId = req.user.id;

    try {
        console.log(`🤖 Backend sedang memproses AI untuk User ID: ${userId}`);

        // 1. Backend minta data user dari Database Supabase
        // (Kita pakai data mentah 5 fitur yang sudah kita siapkan)
        const { data: dashboardData, error: dbError } = await supabase
            .rpc('get_dashboard_data', { target_user_id: userId });

        if (dbError || !dashboardData.ml_features) {
            throw new Error("Gagal mengambil data statistik user dari database.");
        }

        const features = dashboardData.ml_features;
        
        // Input Data: [Nilai, Modul, Durasi, Login, Gagal]
        const inputData = [
            features.avg_completion_time || 0,
            features.total_modules_read || 0,
            features.avg_exam_score || 0,
            features.login_frequency || 0,
            features.failed_exams || 0
        ];

        console.log("📊 Data Input:", inputData);

        let hasilPrediksi;
        let confidenceScore;

        // 2. Backend Mencoba Menjalankan Model TensorFlow
        try {
            console.log("⏳ Mendownload model dari Supabase...");
            const model = await tf.loadLayersModel(MODEL_URL);
            
            const inputTensor = tf.tensor2d([inputData]);
            const prediction = model.predict(inputTensor);
            const resultIndex = prediction.argMax(-1).dataSync()[0];
            
            hasilPrediksi = LABEL_MAP[resultIndex];
            confidenceScore = Math.max(...prediction.dataSync());
            console.log("✅ Model AI Berhasil Dijalankan!");

        } catch (aiError) {
            console.warn("⚠️ Model belum ada di Supabase. Backend pakai logika manual.");
            
            // LOGIKA MANUAL (Jaga-jaga kalau file model belum diupload)
            if (features.failed_exams > 0 || features.avg_exam_score < 60) {
                hasilPrediksi = LABEL_MAP[3]; 
            } else if (features.avg_completion_time < 30 && features.avg_exam_score > 70) {
                hasilPrediksi = LABEL_MAP[0]; 
            } else if (features.total_modules_read > 10) {
                hasilPrediksi = LABEL_MAP[1]; 
            } else {
                hasilPrediksi = LABEL_MAP[2]; 
            }
            confidenceScore = 0.85;
        }

        // 3. Backend Menyimpan Hasilnya ke Database Supabase
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
                motivation: hasilPrediksi.motivation
            }
        });

    } catch (err) {
        console.error("❌ System Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};