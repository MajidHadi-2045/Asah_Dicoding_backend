const supabase = require('../config/supabase');
const { Resend } = require('resend');

// Pastikan API KEY ada di .env
const resend = new Resend(process.env.RESEND_API_KEY);

// === 1. DAFTAR EMAIL TUJUAN (Hardcode di sini) ===
// Masukkan email siapa saja yang mau dikirim (Wajib terdaftar di tabel users)
const TARGET_EMAILS = [
    'goodakun42@gmail.com',
    'email.tester.lain@gmail.com' 
];

exports.sendWeeklyMotivation = async (req, res) => {
    try {
        console.log("📧 Memulai Pengiriman Email ke Target Khusus...");

        // 2. AMBIL DATA USER (Hanya yang ada di list TARGET_EMAILS)
        const { data: users, error } = await supabase
            .from('users')
            .select(`
                email,
                name,
                user_learning_insights (
                    motivation_quote,
                    suggestions,
                    generated_at
                )
            `)
            // FILTER: Hanya ambil jika emailnya ada di dalam array TARGET_EMAILS
            .in('email', TARGET_EMAILS); 

        if (error) throw error;

        if (!users || users.length === 0) {
            return res.json({ success: false, message: "Tidak ada user yang cocok dengan daftar email target." });
        }

        console.log(`Menemukan ${users.length} user target.`);

        // 3. LOOPING PENGIRIMAN EMAIL
        const emailPromises = users.map(async (user) => {
            
            // Logika Fallback (Jika data kosong, pakai Dummy)
            // Ambil insight terbaru (index 0) karena returnnya array
            const latestInsight = user.user_learning_insights?.[0]; 

            const motivation = latestInsight?.motivation_quote 
                || "Konsistensi adalah kunci kemenangan! Jangan biarkan hari ini berlalu tanpa belajar sedikitpun.";
            
            const suggestion = latestInsight?.suggestions?.[0] 
                || "Coba luangkan waktu 15 menit untuk mereview materi modul terakhir yang kamu buka.";

            const userName = user.name || "Student";

            // Desain HTML
            const emailHtml = `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
                    <div style="background-color: #2563eb; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                        <h1 style="color: #ffffff; margin: 0;">SmartLearn Weekly 🚀</h1>
                    </div>
                    
                    <div style="border: 1px solid #e5e7eb; padding: 20px; border-radius: 0 0 8px 8px;">
                        <p>Halo, <strong>${userName}</strong>!</p>
                        <p>Siap untuk level up minggu ini? Berikut adalah insight personal untukmu:</p>
                        
                        <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
                            <p style="margin: 0; font-style: italic; font-size: 16px;">
                                "${motivation}"
                            </p>
                        </div>

                        <p><strong>💡 Saran Tindakan:</strong><br> ${suggestion}</p>

                        <div style="text-align: center; margin-top: 30px;">
                            <a href="https://smartlearn-frontend.vercel.app" 
                               style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                                Buka Dashboard Saya
                            </a>
                        </div>
                    </div>
                    
                    <p style="text-align: center; font-size: 12px; color: #6b7280; margin-top: 20px;">
                        Email ini dikirim khusus untuk tim SmartLearn.
                    </p>
                </div>
            `;

            // Kirim via Resend
            // INGAT: Jika pakai Resend Free, 'to' harus sama dengan email pendaftar Resend
            // Kecuali kamu sudah verifikasi domain sendiri.
            return resend.emails.send({
                from: 'SmartLearn <onboarding@resend.dev>', 
                to: user.email, 
                subject: `🔥 Semangat Minggu Ini untuk ${userName}!`,
                html: emailHtml
            });
        });

        // Tunggu semua selesai
        const results = await Promise.all(emailPromises);

        res.json({
            success: true,
            message: `Berhasil mengirim ${results.length} email ke daftar target.`,
            targets: TARGET_EMAILS
        });

    } catch (err) {
        console.error("Email Error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
};