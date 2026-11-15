# Tutor Manager – Instrukcja instalacji Arkusza Google i Apps Script (v2.2)

## Krok 1. Utworzenie nowego Arkusza Google
1. Wejdź na [Google Sheets](https://sheets.google.com) na swoim prywatnym koncie Google i utwórz czysty arkusz.
2. Nadaj mu nazwę, np. **Tutor Manager - Baza Danych**.

## Krok 2. Dodanie kodu Apps Script
1. W menu górnym wybierz: **Rozszerzenia** (Extensions) ➔ **Apps Script**.
2. Wklej zawartość pliku `SetupSheet.gs` do edytora skryptu.
3. Utwórz drugi plik o nazwie `Code.gs` i wklej do niego zawartość pliku `Code.gs`.

## Krok 3. Bezpieczny token (Script Properties)
Zgodnie z zasadami bezpieczeństwa, tajny token nie jest trzymany jawnie w kodzie:
1. W edytorze Apps Script po lewej stronie kliknij ikonę **Ustawienia projektu** (zębatka ⚙️).
2. Przewiń w dół do sekcji **Właściwości skryptu** (Script properties) i kliknij **Dodaj właściwość skryptu**:
   - **Właściwość**: `SECRET_TOKEN`
   - **Wartość**: Wpisz własny, długi, tajny ciąg znaków (np. `Korki2026_Matematyka_!SekretnyToken#99`)
3. Kliknij **Zapisz właściwości skryptu**.
*(Ten sam token wpiszesz w aplikacji w telefonie w Ustawienia ➔ Arkusz Google)*.

## Krok 4. Inicjalizacja zakładek i tabel
1. W górnym pasku edytora Apps Script wybierz funkcję `initializeAllSheets` z listy rozwijanej i kliknij **Uruchom** (Run).
2. Zatwierdź jednorazowe uprawnienia do edycji Twojego arkusza i Dysku Google.
3. W arkuszu powstaną wszystkie zakładki tabel: `students`, `guardians`, `rate_history`, `lesson_series`, `lessons`, `charges`, `payments`, `income_entries`, `processed_ops`, itd., a także codzienny wyzwalacz kopii zapasowej o godz. 02:00.

## Krok 5. Wdrożenie jako aplikacja internetowa (Web App)
1. W prawym górnym rogu kliknij **Wdróż** (Deploy) ➔ **Nowe wdrożenie** (New deployment).
2. Wybierz typ: **Aplikacja internetowa** (Web app).
3. Ustaw:
   - **Wykonaj jako**: Ja (*Twój adres e-mail*)
   - **Kto ma dostęp**: Każdy (*Anyone*) – dostęp jest w 100% chroniony przez Twój `SECRET_TOKEN`.
4. Kliknij **Wdróż** (Deploy) i skopiuj wygenerowany **Adres URL aplikacji internetowej** (kończący się na `/exec`).

## Krok 6. Połączenie w aplikacji Tutor Manager
1. Otwórz aplikację Tutor Manager na iPhonie lub w przeglądarce.
2. Przejdź do **Ustawienia** ➔ sekcja **Arkusz Google**.
3. Wklej:
   - **Web App URL**
   - **SECRET_TOKEN** (ten sam, który podałeś we Właściwościach skryptu)
4. Kliknij **Testuj połączenie** (zielony komunikat potwierdza działanie bez problemów z CORS).
5. Kliknij **Zapisz URL**.
