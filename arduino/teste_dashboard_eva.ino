// Sketch de teste para o app EVA Dashboard Qualidade do Ar
// Formato serial NOVO (5 campos pt-BR):
//   LOCAL;TEMPERATURA;UMIDADE;PRESSAO;VOC_KOHM
// Decimal VÍRGULA (pt-BR) · delimitador PONTO E VÍRGULA
//
// Exemplo:
//   INTERNO;25,60;61,30;955,40;54,20
//   EXTERNO;28,40;68,10;1008,20;58,70
//
// COMUNICAÇÃO BIDIRECIONAL (todas as linhas terminam com \n):
//   Dashboard -> Arduino:  SET_LOCAL:INTERNO / SET_LOCAL:EXTERNO / STATUS / PING
//   Arduino -> Dashboard:  ACK:INTERNO    / ACK:EXTERNO
//                          STATUS:INTERNO / STATUS:EXTERNO
//                          PONG
// Estado inicial: INTERNO. Sem ciclo automático; só troca via SET_LOCAL.

enum LocalAtual { INTERNO, EXTERNO };

const unsigned long SEND_INTERVAL_MS = 2000;

unsigned long lastSendAt = 0;
unsigned long sampleIndex = 0;
LocalAtual currentLocal = INTERNO;

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

void printPtBr(float value, int decimals) {
  long whole = (long)value;
  float frac = value - (float)whole;
  if (frac < 0) {
    whole -= 1;
    frac += 1.0f;
  }
  long factor = 1;
  for (int i = 0; i < decimals; i++) factor *= 10;
  long fracInt = (long)(frac * factor + 0.5f);
  if (fracInt >= factor) {
    whole += 1;
    fracInt -= factor;
  }
  Serial.print(whole);
  Serial.print(',');
  long pad = factor / 10;
  while (pad > 0 && fracInt < pad) {
    Serial.print('0');
    pad /= 10;
  }
  if (fracInt > 0 || decimals > 0) {
    Serial.print(fracInt);
  }
}

void printLocal(LocalAtual loc) {
  Serial.print(loc == INTERNO ? F("INTERNO") : F("EXTERNO"));
}

void sendFrame() {
  float temp, hum, press, vocReal;

  if (currentLocal == INTERNO) {
    temp = 24.0f + triangleWave(sampleIndex, 26.0f, 2.8f);
    hum = 56.0f + triangleWave(sampleIndex + 4, 20.0f, 9.0f);
    press = 1012.0f + triangleWave(sampleIndex + 8, 32.0f, 6.0f);
    vocReal = 42.0f + triangleWave(sampleIndex + 2, 18.0f, 18.0f);
  } else {
    temp = 29.0f + triangleWave(sampleIndex + 7, 24.0f, 4.5f);
    hum = 64.0f + triangleWave(sampleIndex + 10, 22.0f, 12.0f);
    press = 1008.0f + triangleWave(sampleIndex + 12, 34.0f, 7.0f);
    vocReal = 58.0f + triangleWave(sampleIndex + 3, 16.0f, 24.0f);
  }

  temp = clampFloat(temp, 18.0f, 40.0f);
  hum = clampFloat(hum, 20.0f, 95.0f);
  press = clampFloat(press, 980.0f, 1040.0f);
  vocReal = clampFloat(vocReal, 10.0f, 100.0f);

  printLocal(currentLocal);
  Serial.print(';');
  printPtBr(temp, 2);
  Serial.print(';');
  printPtBr(hum, 2);
  Serial.print(';');
  printPtBr(press, 2);
  Serial.print(';');
  printPtBr(vocReal, 2);
  Serial.println();

  sampleIndex++;
}

void handleCommand(const String& cmd) {
  String trimmed = cmd;
  trimmed.trim();

  if (trimmed.length() == 0) return;

  if (trimmed == F("PING")) {
    Serial.println(F("PONG"));
    return;
  }

  if (trimmed == F("STATUS")) {
    Serial.print(F("STATUS:"));
    printLocal(currentLocal);
    Serial.println();
    return;
  }

  if (trimmed.startsWith(F("SET_LOCAL:"))) {
    String locStr = trimmed.substring(10);
    locStr.trim();
    if (locStr == F("INTERNO")) {
      currentLocal = INTERNO;
      sampleIndex = 0;
      Serial.print(F("ACK:"));
      printLocal(currentLocal);
      Serial.println();
    } else if (locStr == F("EXTERNO")) {
      currentLocal = EXTERNO;
      sampleIndex = 0;
      Serial.print(F("ACK:"));
      printLocal(currentLocal);
      Serial.println();
    }
    return;
  }
}

void setup() {
  Serial.begin(9600);
  while (!Serial) {
    ;
  }

  randomSeed(analogRead(A0));
  delay(1200);
  Serial.println(F("EVA Dashboard - gerador formato NOVO 5 campos (pt-BR) iniciado"));
  Serial.println(F("Comandos: SET_LOCAL:INTERNO / SET_LOCAL:EXTERNO / STATUS / PING"));
}

void loop() {
  unsigned long now = millis();

  while (Serial.available() > 0) {
    String line = Serial.readStringUntil('\n');
    handleCommand(line);
  }

  if (now - lastSendAt >= SEND_INTERVAL_MS) {
    lastSendAt = now;
    sendFrame();
  }
}
