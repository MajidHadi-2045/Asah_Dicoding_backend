const supabase = require('../config/supabase');
const tf = require('@tensorflow/tfjs');

// URL Model kamu (Ganti dengan link Supabase Storage kamu nanti)
const MODEL_URL = 'https://link-kamu.supabase.co/storage/v1/object/public/ml-models/model.json';

// Mapping Label (Minta ini ke Tim ML: Angka 0 itu tipe apa, Angka 1 tipe apa)
const LABEL_MAP = {
    0: { type: 'Fast Learner', motivation: 'Kecepatanmu luar biasa! Jangan lupa istirahat.' },
    1: { type: 'Consistent Learner', motivation: 'Konsistensi adalah kunci. Pertahankan!' },
    2: { type: 'Reflective Learner', motivation: 'Pemahamanmu sangat dalam. Hebat!' },
    3: { type: 'Struggling Learner', motivation: 'Jangan menyerah, coba ulangi materi dasar.' }
};

exports.generatePrediction = async (req, res) => {
    const userId = req.user.id;

    try {
        console.log(`🤖 Memulai AI Prediction untuk User ID: ${userId}`);

        // 1. AMBIL DATA USER DARI DATABASE (Input Features)
        // Kita butuh data mentah: Nilai rata-rata, durasi belajar, jumlah modul, dll.
        // Asumsi: Kita pakai view 'view_ai_learning_insight' atau query manual.
        const { data: stats, error: dbError } = await supabase
            .rpc('get_dashboard_data', { target_user_id: userId }); // Kita pakai fungsi yg sudah ada biar praktis

        if (dbError || !stats.ml_features) throw new Error("Gagal mengambil data statistik user.");

        // Data yang akan dimasukkan ke AI (URUTAN HARUS SAMA DENGAN SAAT TRAINING TIM ML)
        // Contoh: [avg_exam_score, total_modules_read, avg_completion_time]
        const features = stats.ml_features;
        const inputData = [
            features.avg_exam_score || 0, 
            features.total_modules_read || 0,
            features.avg_completion_time || 0
        ];

        console.log("📊 Input Data:", inputData);

        // 2. LOAD MODEL AI
        // (Ini akan mendownload model dari URL setiap kali dipanggil)
        const model = await tf.loadLayersModel(MODEL_URL);

        // 3. LAKUKAN PREDIKSI
        const inputTensor = tf.tensor2d([inputData]); // Ubah ke format Tensor
        const prediction = model.predict(inputTensor);
        const resultIndex = prediction.argMax(-1).dataSync()[0]; // Ambil index dengan probabilitas tertinggi

        // 4. TERJEMAHKAN HASIL (Angka -> Teks)
        const hasil = LABEL_MAP[resultIndex] || LABEL_MAP[1]; // Default ke Consistent kalau error
        const confidence = Math.max(...prediction.dataSync()); // Seberapa yakin AI-nya

        console.log(`🎯 Hasil Prediksi: ${hasil.type} (Confidence: ${confidence})`);

        // 5. SIMPAN KE DATABASE
        const { error: saveError } = await supabase
            .from('user_learning_insights')
            .insert({
                user_id: userId,
                learning_style: hasil.type,
                prediction_confidence: confidence,
                motivation_quote: hasil.motivation,
                suggestions: ["Cek materi rekomendasi", "Latihan soal lagi"], // Saran bisa dibuat dinamis juga
                generated_at: new Date()
            });

        if (saveError) throw saveError;

        // 6. Kirim Balik ke Frontend
        res.json({
            success: true,
            message: "AI selesai menghitung!",
            data: {
                type: hasil.type,
                motivation: hasil.motivation
            }
        });

    } catch (err) {
        console.error("❌ AI Error:", err.message);
        // Jangan bikin server crash, balikan error yang rapi
        res.status(500).json({ success: false, error: err.message });
    }
};