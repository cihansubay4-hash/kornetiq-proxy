const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

// Render → Environment bölümünden okunur.
const {
  SUPABASE_URL,
  SUPABASE_KEY,
  DEVICE_TOKEN
} = process.env;

for (const [name, value] of Object.entries({
  SUPABASE_URL,
  SUPABASE_KEY,
  DEVICE_TOKEN
})) {
  if (!value) {
    console.error(`Eksik ortam değişkeni: ${name}`);
    process.exit(1);
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

// Bu adresler sunucunun çalıştığını gösterir.
app.get('/', (req, res) => {
  res.status(200).send('KORNETIQ ara sunucu çalışıyor.');
});

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Gönderilmeyen isteğe bağlı ölçümler null olur.
function sayi(value, name, min, max, integer = false) {
  if (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '')
  ) {
    return null;
  }

  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error(`${name}: sayisal deger gerekli`);
  }

  const result = Number(value);

  if (
    !Number.isFinite(result) ||
    (integer && !Number.isInteger(result)) ||
    result < min ||
    result > max
  ) {
    throw new Error(`${name}: gecersiz deger`);
  }

  return result;
}

function gpsDurumu(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if ([true, 1, '1', 'true'].includes(value)) return true;
  if ([false, 0, '0', 'false'].includes(value)) return false;

  throw new Error('gps_durumu: true, false, 1 veya 0 olmali');
}

app.post('/veri-gonder', async (req, res) => {
  // Arduino aynı DEVICE_TOKEN değerini bu başlıkta göndermeli.
  if (req.get('x-device-token') !== DEVICE_TOKEN) {
    return res.status(401).send('Yetkisiz cihaz');
  }

  const body = req.body || {};
  let kayit;

  try {
    if (
      typeof body.cihaz_id !== 'string' ||
      !body.cihaz_id.trim()
    ) {
      throw new Error('cihaz_id gerekli');
    }

    const nabiz = sayi(
      body.nabiz,
      'nabiz',
      0,
      2147483647,
      true
    );

    if (nabiz === null) {
      throw new Error('nabiz gerekli; algilanmiyorsa 0 gonderin');
    }

    const cameraStatus = body.camera_status ?? null;

    if (
      cameraStatus !== null &&
      typeof cameraStatus !== 'string'
    ) {
      throw new Error('camera_status metin olmali');
    }

    kayit = {
      helmet_id: body.cihaz_id.trim(),
      heart_rate: nabiz,
      battery_level: sayi(body.batarya, 'batarya', 0, 100, true),
      is_gps_active: gpsDurumu(body.gps_durumu),
      latitude: sayi(body.latitude, 'latitude', -90, 90),
      longitude: sayi(body.longitude, 'longitude', -180, 180),
      camera_status: cameraStatus
    };
  } catch (err) {
    return res.status(400).send(err.message);
  }

  try {
    // Cihazın mevcut baret kaydını bul.
    const { data: helmet, error: lookupError } = await supabase
      .from('helmets')
      .select('id')
      .eq('helmet_id', kayit.helmet_id)
      .maybeSingle();

    if (lookupError) {
      console.error('Baret sorgu hatası:', lookupError.message);
      return res.status(500).send('Baret sorgulanamadi');
    }

    if (!helmet) {
      return res.status(404).send(
        'Bu cihaz_id ile kayitli baret yok'
      );
    }

    // Ölçümü geçmiş kayıtlarına ekle.
    const { error: logError } = await supabase
      .from('telemetry_logs')
      .insert([kayit]);

    if (logError) {
      console.error('Veri kayıt hatası:', logError.message);
      return res.status(500).send('Veri kaydedilemedi');
    }

    const simdi = new Date().toISOString();

    // Aktiflik yalnızca nabza bağlıdır.
    const guncelleme = {
      bpm: kayit.heart_rate,
      helmet_on: kayit.heart_rate > 0,
      online: true,
      last_seen: simdi,
      updated_at: simdi
    };

    // Gönderilmeyen diğer bilgiler mevcut değeri değiştirmez.
    if (kayit.battery_level !== null) {
      guncelleme.battery = kayit.battery_level;
    }

    if (kayit.is_gps_active !== null) {
      guncelleme.gps = kayit.is_gps_active;
    }

    if (kayit.latitude !== null) {
      guncelleme.latitude = kayit.latitude;
    }

    if (kayit.longitude !== null) {
      guncelleme.longitude = kayit.longitude;
    }

    const { data: updated, error: updateError } = await supabase
      .from('helmets')
      .update(guncelleme)
      .eq('id', helmet.id)
      .select('id')
      .maybeSingle();

    if (updateError || !updated) {
      console.error(
        'Baret güncelleme hatası:',
        updateError?.message || 'Baret bulunamadı'
      );

      return res.status(500).send(
        'Olcum kaydedildi ancak baret durumu guncellenemedi'
      );
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
