const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();

app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

// Bu bilgiler Render → Environment bölümünden okunur.
const {
  SUPABASE_URL,
  SUPABASE_KEY,
  DEVICE_TOKEN
} = process.env;

if (!SUPABASE_URL || !SUPABASE_KEY || !DEVICE_TOKEN) {
  console.error(
    'Eksik ayar: Render Environment bölümünde ' +
    'SUPABASE_URL, SUPABASE_KEY ve DEVICE_TOKEN gerekli.'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

// Tarayıcıdan sunucunun çalışmasını kontrol etmek için.
app.get('/', (req, res) => {
  res.status(200).send('KORNETIQ ara sunucu çalışıyor.');
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Cihaz verilerini kabul eden adres.
app.post('/veri-gonder', async (req, res) => {
  // Cihaz aynı şifreyi x-device-token başlığında göndermeli.
  if (req.get('x-device-token') !== DEVICE_TOKEN) {
    return res.status(401).send('Yetkisiz cihaz');
  }

  const {
    cihaz_id,
    nabiz,
    batarya,
    baret_durumu,
    gps_durumu
  } = req.body || {};

  if (
    cihaz_id === undefined ||
    cihaz_id === null ||
    String(cihaz_id).trim() === ''
  ) {
    return res.status(400).send('cihaz_id gerekli');
  }

  const sensorVerileri = [
    nabiz,
    batarya,
    baret_durumu,
    gps_durumu
  ];

  if (sensorVerileri.some(value => value === undefined || value === null)) {
    return res.status(400).send('Eksik sensor verisi');
  }

  try {
    const { error } = await supabase
      .from('sensor_logs')
      .insert([{
        cihaz_id,
        nabiz,
        batarya,
        baret: baret_durumu,
        gps: gps_durumu
      }]);

    if (error) {
      console.error(
        'Supabase kayıt hatası:',
        error.code,
        error.message
      );
      return res.status(500).send('Veri kaydedilemedi');
    }

    return res.status(200).send('OK');
  } catch (err) {
    console.error('Sunucu hatası:', err.message);
    return res.status(500).send('Sunucu hatasi');
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`KORNETIQ ara sunucu ${PORT} portunda çalışıyor.`);
});
