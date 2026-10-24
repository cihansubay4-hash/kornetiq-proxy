const express = require('express');
const { createClient } = require('@supabase/supabase-client');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Kopyaladığınız bilgileri aşağıdaki tırnakların içine yapıştırın
const SUPABASE_URL = 'https://supabase.co'; 
const SUPABASE_KEY = 'https://qoxmrcuwbntorxcczyry.supabase.com';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// SIM800C modülünün şifresiz HTTP POST isteği atacağı kapı
app.post('/veri-gonder', async (req, res) => {
    try {
        // SIM800C'den gelen ham verileri yakalıyoruz
        const { cihaz_id, nabiz, batarya, baret_durumu, gps_durumu } = req.body;

        // Yakalanan verileri Supabase tablonuza yazıyoruz
        // NOT: Eğer Supabase'deki tablo adınız farklıysa 'sensor_logs' kısmını değiştirin.
        const { data, error } = await supabase
            .from('sensor_logs') 
            .insert([{ 
                cihaz_id: cihaz_id, 
                nabiz: nabiz,        
                batarya: batarya,    
                baret: baret_durumu, 
                gps: gps_durumu      
            }]);

        if (error) throw error;
        
        // SIM800C modülüne her şeyin yolunda olduğunu bildiren HTTP 200 kodu dönüyoruz
        res.status(200).send('OK');
    } catch (err) {
        console.error(err);
        res.status(500).send('Hata olustu');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Köprü sunucu ${PORT} portunda çalışıyor.`));





