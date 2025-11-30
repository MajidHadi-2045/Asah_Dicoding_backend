const supabase = require('../config/supabase');

exports.getDashboardData = async (req, res) => {
    const userId = req.user.id; // Didapat dari middleware

    try {
        console.log(`Fetching dashboard data for User ID: ${userId}...`);

        // Panggil Function RPC di Database Supabase
        const { data, error } = await supabase
            .rpc('get_dashboard_data', { target_user_id: userId });

        if (error) {
            console.error("Supabase RPC Error:", error);
            return res.status(500).json({ success: false, error: error.message });
        }

        res.json({
            success: true,
            data: data
        });

    } catch (err) {
        console.error("Server Error:", err.message);
        res.status(500).json({ success: false, error: err.message });
    }
};