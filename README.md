# Tutor Manager (PWA) – Wersja 2.1 (listopad 2026)

Prywatna aplikacja webowa (Progressive Web App) zoptymalizowana dla Safari na iPhone (iOS 18–26, referencyjny iPhone 17) dla korepetytora matematyki, współpracująca z Arkuszem Google za pośrednictwem Google Apps Script Web App.

---

## 🌟 Kluczowe funkcjonalności

1. **Błyskawiczne rozliczanie lekcji (1 stuknięcie / swipe)**:
   - Przeciągnięcie karty lekcji w prawo natychmiast oznacza lekcję jako zrealizowaną i opłaconą BLIK-iem.
   - Automatycznie aktualizuje grafik, saldo ucznia, ewidencję przychodów i pasek limitu.
2. **Kontrola limitu działalności nierejestrowanej (2026)**:
   - Obliczenia kwartalne: limit **10 813,50 zł** (225% z płacy minimalnej 4 806,00 zł).
   - Dynamiczny kolorowy pasek postępu (progi 70%, 85%, 95%, 100%).
   - Wyliczanie dnia przekroczenia co do grosza (równo z limitem = nieprzekroczono).
   - Alert krytyczny z 7-dniowym odliczaniem na złożenie wniosku do CEIDG.
   - Symulator „co jeśli” przy planowaniu nowych lekcji lub pakietów.
3. **Data powstania przychodu (Rozdział 4.2)**:
   - Ścisła reguła: do limitu liczy się data świadczenia usługi (`accrual_date`), a nie data otrzymania wpłaty.
   - Automatyczne ostrzeżenie przy wpłatach z góry z innego kwartału („do potwierdzenia z księgowym”).
   - Rozliczenie roczne PIT na podstawie daty faktycznego otrzymania środków (`payment.received_date`).
4. **Bezpieczeństwo finansowe (Zero Float)**:
   - Wszystkie kwoty przechowywane wyłącznie jako liczby całkowite w groszach (`grosze: number`).
   - Brak błędów zaokrągleń IEEE-754.
5. **Działanie Offline i synchronizacja (IndexedDB + LockService)**:
   - Błyskawiczny start poniżej 1 sekundy z pamięci podręcznej IndexedDB.
   - Kolejka operacji offline (`op_id`, brak duplikatów).
   - Zabezpieczenie przed zamknięciem miesiąca przy niepustej kolejce offline.
6. **Raporty, okresy i snapshoty**:
   - Nienaruszalne snapshoty miesięczne i kwartalne (hash SHA-256).
   - Korekta po zamknięciu tworzy wersję `v2`, `v3` z zarejestrowanym powodem, nie niszcząc archiwum.
   - Eksport do CSV (UTF-8 z BOM i średnikiem `;` pod polskiego Excela) oraz JSON.
7. **Prywatność i RODO**:
   - Anonimizacja ucznia jednym kliknięciem z zachowaniem sum finansowych i numeracji ewidencji (RRRR/NNN).
   - Blokada kodem PIN (4 cyfry) z automatycznym wygaszaniem po 5 minutach bezczynności.

---

## 🚀 Uruchomienie lokalne

Wymagany Node.js (wersja 20 lub nowsza):

```bash
# Instalacja zależności
npm install

# Uruchomienie serwera deweloperskiego
npm run dev

# Uruchomienie testów jednostkowych (100% testów finansowych i 12 przypadków brzegowych)
npm test

# Budowa produkcyjna
npm run build
```

---

## 📱 Dodanie do ekranu początkowego na iPhonie

1. Wdróż aplikację na GitHub Pages lub uruchom serwer produkcyjny przez HTTPS.
2. Otwórz adres strony w **Safari** na iPhonie.
3. Kliknij ikonę udostępniania na dole ekranu (kwadrat ze strzałką w górę).
4. Wybierz opcję **„Do ekranu początkowego”** (Add to Home Screen).
5. Aplikacja uruchomi się w trybie pełnoekranowym (`standalone`) z obsługą Dynamic Island i bezpiecznych marginesów Safe Area (`env(safe-area-inset-*)`).

---

## ☁️ Integracja z Arkuszem Google (Google Apps Script)

Szczegółowa instrukcja krok po kroku znajduje się w pliku [`google-apps-script/README.md`](google-apps-script/README.md).

- **`google-apps-script/SetupSheet.gs`**: uruchomienie funkcji `initializeAllSheets()` tworzy wszystkie 16 zakładek w Arkuszu Google, nagłówki i wyzwalacz codziennej kopii zapasowej na Dysku o 02:00 w nocy.
- **`google-apps-script/Code.gs`**: kod Web App obsługujący `doGet` (pobieranie przyrostowe wg `updated_at`) oraz `doPost` (zapis z `LockService` przeciwko wyścigom).

---

## 🧪 Pokrycie testami

Uruchomienie `npm test` weryfikuje 22 testy jednostkowe, w tym:
- Testy modułu `Money` (liczby całkowite w groszach, formatowanie `70,00 zł`, ułamki, mnożenie procentowe).
- Testy progów limitu i odliczania 7 dni na CEIDG.
- Wszystkie 12 obowiązkowych testów brzegowych z Rozdziału 9 specyfikacji.
