# Discord-Rozpierdalator-v2 - Status

## 2026-08-28

- [x] `!lp` - automatyczna konwersja zdjęć do **WebP** + limit szerokości
  (domyślnie 1800 px) przed wgraniem do WP Media Library. Cel: szybkie strony.
  - `src/utils/imageOptimize.js` (`optimizeToWebp`) - `sharp` ładowany
    dynamicznie w try/catch: brak natywnej zależności = wgrywamy oryginał,
    bot nie pada. SVG/GIF/animacje pomijane. EXIF orientacja wypalana.
  - Nowa ścieżka: każdy podany link (fileuploader **i** dowolny http[s]) jest
    pobierany, konwertowany i wgrywany; wyjątek - obrazek już na naszym WP
    i już `.webp` idzie wprost (bez duplikatu). Fallback do oryginału gdy WP
    odrzuci webp.
  - Stara ścieżka: `optimizeToWebp` wpięte w pętlę wgrywania mediów
    (nazwa pliku wymuszana na `.webp`).
  - Szablon `lp-new-v1.html`: HERO `fetchpriority="high"`, obrazy poniżej
    zgięcia `decoding="async"` (dalej `loading="lazy"`).
  - Nowa zależność: `sharp` (`npm install` na deployu Railway zaciąga sam).

- [x] `!lp` - wybór szablonu na starcie (select menu: **Nowy** / **Stary**);
  można pominąć inline: `!lp szablon: nowy`.
  - **Stary szablon**: przepływ bez zmian (strona-wzorzec WP `WP_LP_TEMPLATE_PAGE_ID`
    + tokeny `{{...}}` + `!lp materialy:` z fileuploadera).
  - **Nowy szablon** (`src/templates/lp-new-v1.html`, oparty na LP Zalootka GeneO):
    cała strona = jeden plik HTML wstawiany w **jeden blok `wp:html`**. Kolejna strona
    = ten sam plik z podmienioną treścią / mediami / formularzem.
    - Bot pyta osobno o media per sekcja: **HERO (1 link)**, **przed/po (wiele)**,
      **opinie (wiele, kolejność = kolejność cytatów)** oraz o **shortcode CF7**
      (cały `[contact-form-7 id=... title=...]` lub sama nazwa).
    - Linki fileuploadera `/view/` są pobierane i wgrywane do WP Media Library;
      inne URL-e (np. `/wp-content/...`) używane wprost.
    - Copy: `src/utils/lpNewGenerator.js` (osobny tool-schema od starego, ten sam
      wzorzec tool-use + zod + 1 runda naprawy; wytyczne z `GOOGLE_LP_TEMPLATE_DOC_ID`
      jako cache_control). Sekcje: hero -> pasek zaufania -> "To dla Ciebie" ->
      efekty -> oferta+formularz -> opinie -> dlaczego my -> jak działa ->
      metamorfozy -> mid CTA -> FAQ (obiekcje) -> final+formularz.
    - Render: `src/utils/lpNewTemplate.js` (`{{TOKEN}}`, `{{MEDIA:hero_image}}`,
      `{{FORM_SHORTCODE}}`, regiony powtarzalne `BEGIN:/END:`). Braki lądują w
      raporcie "⚠️ do uzupełnienia" tak jak w starym przepływie.
    - **Formularz = szkielet**: w CF7 goły formularz bez stylów; całą stylizację
      (`.zl-form-box .wpcf7-form ...`) niesie `<style>` w szablonie.
  - Bez nowych ENV. Nowy szablon nie wymaga `WP_LP_TEMPLATE_PAGE_ID`.

- [x] Nowa komenda `!webhook` - wstawia/aktualizuje skrypt webhooka Contact Form 7
  jako **fragment HTML we wtyczce "Code Snippets"** (pl. "Fragmenty kodu"),
  przez jej REST API `code-snippets/v1` (to samo Application Password; konto WP
  musi mieć `manage_options`).
  - Fragment: `scope: site-footer`, aktywny, identyfikowany po nazwie-markerze
    `ITM webhook :: <klucz>` (ponowne uruchomienie z tym samym `slug` nadpisuje,
    nie mnoży).
  - Skrypt (`src/templates/webhook-cf7.tmpl.js`): 1 wysyłka na wypełnienie
    (guard + dedup 8 s + tylko `wpcf7mailsent`), payload w 100% dynamiczny ze
    wszystkich pól, `_formularz` / `_formularz_nr` / `_formularz_sekcja` /
    `_page_url` / `_timestamp`.
  - Składnia inline: `!webhook` + `webhook:` / `formularz:` / `slug:` / `nazwa:`
    (reszta dopytywana interaktywnie). `!webhook help` - podpowiedź.
  - `!lp` (nowy szablon) na końcu pyta opcjonalnie o URL webhooka i robi to samo
    (współdzielony `buildWebhookSnippetCode` + `wpUpsertSnippet`).
  - `wordpressClient.js`: `wpListSnippets()`, `wpUpsertSnippet()`.

## 2026-07-04

- [x] Nowa komenda `!skrypt` - generator skryptów reklamowych AI:
  - baza kategorii zabiegów i skrypt referencyjny czytane z Google Sheets,
  - ogólny wzór/wytyczne + wskazówki nagraniowe czytane z Google Docs (cache w pamięci),
  - brief per zabieg podawany przez operatora (link do Google Doc),
  - generowanie przez Claude (tool-use + walidacja zod + jedna runda naprawy błędów schematu),
  - zapis nowego skryptu jako Google Doc w folderze Drive + nowy wiersz w arkuszu bazy,
  - prompt caching (Anthropic `cache_control`) na statycznym bloku wytycznych.
  - Wymaga nowych ENV: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`,
    `GOOGLE_SCRIPTS_SHEET_ID`, `GOOGLE_SCRIPT_TEMPLATE_DOC_ID`, `GOOGLE_SCRIPTS_DRIVE_FOLDER_ID`
    (patrz `.env.example`) - do ustawienia lokalnie i w Railway.

## 2026-05-05

- [x] Hardening integracji SOWA w adapterze bota:
  - wykrywanie odpowiedzi nie-JSON (np. HTML po Cloudflare Access redirect),
  - walidacja `payload.ok === true` po stronie klienta SOWA,
  - jawny błąd zamiast fałszywego sukcesu komendy `!sowa`.
- [x] Rozszerzenie komend bota o obsługę PM:
  - `!sowa pm` - lista aktywnych PM-ów z SOWA,
  - `!sowa przypisz <NIP lub nazwa klienta> | <Imię Nazwisko PM>` - przypisanie klienta do PM.
- [x] Rozszerzenie podpowiedzi `!sowa faktury` o składnię filtrów:
  - `!sowa faktury --pm <PM> --klient <NIP/nazwa>`.
