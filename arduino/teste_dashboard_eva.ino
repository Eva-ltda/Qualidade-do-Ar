// Sketch de teste para o app EVA Dashboard Qualidade do Ar
// Formato serial esperado pelo app:
// tempInterno,humInterno,pressInterno,vocInternoReal,vocInternoCorrigido,
// tempExterno,humExterno,pressExterno,vocExternoReal,vocExternoCorrigido
//
// Exemplo:
// 25.3,58,1012,42.7,40.8,29.1,66,1008,55.4,52.0

const unsigned long SEND_INTERVAL_MS = 2000;

unsigned long lastSendAt = 0;
unsigned long sampleIndex = 0;

float clampFloat(float value, float minValue, float maxValue) {
  if (value < minValue) return minValue;
  if (value > maxValue) return maxValue;
  return value;
}

float triangleWave(unsigned long step, float period, float amplitude) {
  float phase = fmod((float)step, period) / period;
  float normalized = phase < 0.5f ? phase * 2.0f : (1.0f - phase) * 2.0f;
  return (normalized * 2.0f - 1.0f) * amplitude;
}

void sendFrame() {
  float tempInterno = 24.0f + triangleWave(sampleIndex, 26.0f, 2.8f);
  float humInterno = 56.0f + triangleWave(sampleIndex + 4, 20.0f, 9.0f);
  float pressInterno = 1012.0f + triangleWave(sampleIndex + 8, 32.0f, 6.0f);

  float vocInternoReal = 42.0f + triangleWave(sampleIndex + 2, 18.0f, 18.0f);
  float vocInternoCorrigido = vocInternoReal - 2.4f + triangleWave(sampleIndex + 5, 12.0f, 1.2f);

  float tempExterno = 29.0f + triangleWave(sampleIndex + 7, 24.0f, 4.5f);
  float humExterno = 64.0f + triangleWave(sampleIndex + 10, 22.0f, 12.0f);
  float pressExterno = 1008.0f + triangleWave(sampleIndex + 12, 34.0f, 7.0f);

  float vocExternoReal = 58.0f + triangleWave(sampleIndex + 3, 16.0f, 24.0f);
  float vocExternoCorrigido = vocExternoReal - 3.0f + triangleWave(sampleIndex + 9, 10.0f, 1.6f);

  tempInterno = clampFloat(tempInterno, 18.0f, 34.0f);
  humInterno = clampFloat(humInterno, 30.0f, 85.0f);
  pressInterno = clampFloat(pressInterno, 980.0f, 1040.0f);
  vocInternoReal = clampFloat(vocInternoReal, 10.0f, 100.0f);
  vocInternoCorrigido = clampFloat(vocInternoCorrigido, 10.0f, 100.0f);

  tempExterno = clampFloat(tempExterno, 18.0f, 40.0f);
  humExterno = clampFloat(humExterno, 20.0f, 95.0f);
  pressExterno = clampFloat(pressExterno, 980.0f, 1040.0f);
  vocExternoReal = clampFloat(vocExternoReal, 10.0f, 100.0f);
  vocExternoCorrigido = clampFloat(vocExternoCorrigido, 10.0f, 100.0f);

  Serial.print(tempInterno, 1);
  Serial.print(",");
  Serial.print(humInterno, 0);
  Serial.print(",");
  Serial.print(pressInterno, 0);
  Serial.print(",");
  Serial.print(vocInternoReal, 1);
  Serial.print(",");
  Serial.print(vocInternoCorrigido, 1);
  Serial.print(",");
  Serial.print(tempExterno, 1);
  Serial.print(",");
  Serial.print(humExterno, 0);
  Serial.print(",");
  Serial.print(pressExterno, 0);
  Serial.print(",");
  Serial.print(vocExternoReal, 1);
  Serial.print(",");
  Serial.println(vocExternoCorrigido, 1);

  sampleIndex++;
}

void setup() {
  Serial.begin(9600);
  while (!Serial) {
    ; // Aguarda apenas em placas que suportam USB serial nativa.
  }

  randomSeed(analogRead(A0));
  delay(1200);
  Serial.println("EVA Dashboard - gerador de dados de teste iniciado");
}

void loop() {
  unsigned long now = millis();
  if (now - lastSendAt >= SEND_INTERVAL_MS) {
    lastSendAt = now;
    sendFrame();
  }
}
