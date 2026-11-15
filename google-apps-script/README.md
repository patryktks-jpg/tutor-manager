# Tutor Manager – Instrukcja instalacji Arkusza Google i Apps Script

## Krok 1. Utworzenie nowego Arkusza Google
1. Wejdź na [Google Sheets](https://sheets.google.com) na swoim prywatnym koncie Google i utwórz czysty arkusz.
2. Nadaj mu nazwę, np. **Tutor Manager - Baza Danych**.

## Krok 2. Dodanie kodu Apps Script
1. W menu górnym wybierz: **Rozszerzenia** (Extensions) ➔ **Apps Script**.
2. Wklej zawartość pliku `SetupSheet.gs` do edytora skryptu.
3. Utwórz drugi plik o nazwie `Code.gs` i wklej do niego zawartość pliku `Code.gs`.
4. W pliku `Code.gs` możesz zmienić wartość stałej `SECRET_TOKEN` na własny tajny ciąg znaków (np. `moj_super_tajny_token_2026`).

## Krok 3. Jednorazowa inicjalizacja zakładek
1. W górnym pasku edytora Apps Script wybierz funkcję `initializeAllSheets` z listy rozwijanej i kliknij **Uruchom** (Run).
2. Google poprosi o jednorazowe przyznanie uprawnień do edycji Twojego arkusza i tworzenia kopii na Dysku Google – zatwierdź je.
3. W Twoim arkuszu automatycznie powstaną wszystkie zakładki tabel: `students`, `guardians`, `rate_history`, `lesson_series`, `lessons`, `charges`, `payments`, `income_entries`, itd., a także włączy się codzienny wyzwalacz kopii zapasowej o godz. 02:00.

## Krok 4. Wdrożenie jako aplikacja internetowa (Web App)
1. W prawym górnym rogu kliknij niebieski przycisk **Wdróż** (Deploy) ➔ **Nowe wdrożenie** (New deployment).
2. Wybierz typ: **Aplikacja internetowa** (Web app).
3. W konfiguracji ustaw:
   - **Opis**: Wersja produkcyjna Tutor Manager
   - **Wykonaj jako**: Ja (*Twój adres e-mail*)
   - **Kto ma dostęp**: Każdy (*Anyone*) – dostęp zabezpiecza Twój tajny token `SECRET_TOKEN`.
4. Kliknij **Wdróż** (Deploy) i skopiuj wygenerowany **Adres URL aplikacji internetowej** (kończący się na `/exec`).

## Krok 5. Połączenie w aplikacji Tutor Manager (PWA)
1. Otwórz aplikację Tutor Manager na iPhonie lub w przeglądarce.
2. Przejdź do **Ustawienia** (ikona zębatki w prawym górnym rogu ekranu Start).
3. W sekcji **Arkusz Google** wklej:
   - Skopiowany **Web App URL**
   - Twój **Tajny Token** (`SECRET_TOKEN`)
4. Kliknij **Testuj połączenie** – pojawi się zielony komunikat o sukcesie.
5. Kliknij **Zapisz URL**.

Od tej chwili każde kliknięcie po lekcji, dodanie ucznia i zmiana automatycznie zapisują się w Twoim prywatnym Arkuszu Google, a w razie braku zasięgu kolejka offline synchronizuje się natychmiast po powrocie internetu!
