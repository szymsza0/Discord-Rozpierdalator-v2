# Discord-Rozpierdalator-v2 (bot ITM)

## Deploy / workflow gita

Ten projekt **auto-deployuje się na Railway z brancha `main`** (serwis podpięty do
GitHuba). Dlatego po skończonej zmianie:

1. Zrób zmianę na branchu roboczym (`feat/...`), commit + push brancha.
2. **Zmerguj branch do `main` i wypchnij `main`** (`git checkout main && git merge --ff-only <branch> && git push origin main`).
   To jest oczekiwane domyślnie po każdej skończonej zmianie w tym repo -
   nie zostawiaj gotowej pracy tylko na branchu roboczym.
3. Push na `main` = deploy na Railway. Jeśli Railway MCP jest zalogowany,
   sprawdź status ostatniego deploya; jeśli nie - powiedz userowi, żeby
   zerknął w dashboard (albo `railway login`).

**Railway buduje przez `npm ci`** - `package.json` i `package-lock.json` MUSZĄ
być zsynchronizowane. Po dodaniu/zmianie zależności zawsze zrób
`npm install` w `Bot Ani/discord-bot-master/` i **zacommituj `package-lock.json`
razem** ze zmianą, inaczej build pada na "Missing: <pkg> from lock file".

Nadal obowiązuje reszta zasad bezpieczeństwa: bez `--force`, bez `--amend`
cudzych commitów, nie wciągaj niepowiązanych zmian do commita.
Pliki `LP_COMMAND_SPEC.md` i `lp-system/` w repo są nieśledzone (scratch z
wcześniejszej sesji) - nie commitować ich.

## Kod bota

`Bot Ani/discord-bot-master/` - `npm start` (`node src/index.js`), ESM.
Komendy w `src/commands/`, narzędzia w `src/utils/`, routing w `src/index.js`.
Wzorzec generacji AI: tool-use + walidacja zod + jedna runda naprawy
(patrz `scriptGenerator.js`, `lpGenerator.js`, `lpNewGenerator.js`).
ENV: patrz `Bot Ani/discord-bot-master/.env.example` + `src/config.js`.
