const supabase = require('../config/supabase');

exports.saveInsight = async (req, res) => {
    const userId = req.user.id;
    // Data ini dikirim oleh Frontend setelah TensorFlow selesai menghitung
    const { learning_style, prediction_confidence, motivation, suggestions } = req.body;

    try {
        console.log(`📥 Menyimpan Insight dari Frontend untuk User: ${userId}`);

        const { data, error } = await supabase
            .from('user_learning_insights')
            .insert({
                user_id: userId,
                learning_style: learning_style,
                prediction_confidence: prediction_confidence,
                motivation_quote: motivation,
                suggestions: suggestions, // Array
                generated_at: new Date()
            })
            .select();

        if (error) throw error;

        res.json({ success: true, message: "Insight berhasil disimpan!", data });

    } catch (err) {
        console.error("Save Insight Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};