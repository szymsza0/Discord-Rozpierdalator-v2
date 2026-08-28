import { EmbedBuilder } from "discord.js";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { WP_BASE_URL } from "../config.js";
import { wpUpsertSnippet } from "../utils/wordpressClient.js";

/**
 * !webhook - wstawia (lub aktualizuje) skrypt webhooka formularza CF7 jako
 * fragment HTML we wtyczce "Code Snippets" (scope: site-footer), przez jej
 * REST API. Skrypt: 1 wysylka na wypelnienie, dynamiczne pola, rozroznienie
 * instancji formularza. Fragment jest identyfikowany po nazwie-markerze, wiec
 * ponowne uruchomienie z tym samym `slug` nadpisuje istniejacy, nie mnozy.
 *
 * Skladnia (inline, wszystko opcjonalne - reszte bot dopyta):
 *   !webhook
 *   webhook: https://hook.eu2.make.com/xxxxx
 *   formularz: zt-geneo
 *   slug: zt-ganeo-oferta-specjalna/
 *   nazwa: ZT Geneo            (opcjonalny override markera)
 */

const TEXT_PROMPT_TIMEOUT_MS = 90000;
const TEMPLATE_PATH = fileURLToPath(new URL("../templates/webhook-cf7.tmpl.js", import.meta.url));

function errorEmbed(desc) {
  return new EmbedBuilder().setColor("#FF0000").setDescription(`❌ ${String(desc || "błąd").slice(0, 4000)}`);
}
function infoEmbed(desc) {
  return new EmbedBuilder().setColor("#0079BF").setDescription(String(desc || "…").slice(0, 4000));
}

// Bezpieczna wartość pola embeda (Discord: 1-1024 znaków).
function fv(value) {
  const s = String(value ?? "").trim();
  return (s || "—").slice(0, 1024);
}

function errDetail(error) {
  const subs = Array.isArray(error?.errors) ? error.errors.map((e) => e?.message ?? String(e)) : [];
  const base = error?.message || String(error);
  return (subs.length ? `${base} — ${subs.join(" | ")}` : base).slice(0, 1500);
}

async function askText(message, promptText) {
  await message.channel.send({ embeds: [infoEmbed(promptText)] });
  try {
    const collected = await message.channel.awaitMessages({
      filter: (m) => m.author.id === message.author.id,
      max: 1,
      time: TEXT_PROMPT_TIMEOUT_MS,
      errors: ["time"],
    });
    return collected.first().content.trim();
  } catch {
    await message.channel.send({ embeds: [errorEmbed("Czas minął. Zacznij od nowa: `!webhook`.")] });
    return null;
  }
}

function parseInlineArgs(content) {
  const out = { webhook: null, formularz: null, slug: null, nazwa: null };
  for (const line of (content || "").split("\n")) {
    const m = line.match(/^\s*(webhook|formularz|nazwa|slug)\s*:\s*(.+)$/i);
    if (m) out[m[1].toLowerCase()] = m[2].trim();
  }
  return out;
}

export function slugify(text) {
  return (text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/gi, "l")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Sentinele w templates/webhook-cf7.tmpl.js -> realne wartosci.
// Wartosci sa wstrzykiwane do literalow stringowych JS, wiec chronimy
// przed zamknieciem stringa / wstrzyknieciem.
function safeJsString(value) {
  return String(value || "").replace(/[\\'"<]/g, "").replace(/\r?\n/g, " ").trim();
}

/**
 * Buduje gotowy blok <script>...</script> z webhookiem CF7 z szablonu
 * templates/webhook-cf7.tmpl.js. Wspoldzielone przez komende !webhook i
 * opcjonalny krok w !lp (nowy szablon).
 */
export async function buildWebhookSnippetCode({ webhookUrl, formName, pageSlug = "" }) {
  const tmpl = await readFile(TEMPLATE_PATH, "utf8");
  const js = tmpl
    .replace(/__WEBHOOK_URL__/g, safeJsString(webhookUrl))
    .replace(/__FORM_NAME__/g, safeJsString(formName))
    .replace(/__PAGE_SLUG__/g, safeJsString(pageSlug));
  return `<script>\n${js}\n</script>`;
}

export async function processWebhookCommand(message) {
  try {
    const content = message.content.slice("!webhook".length).trim();

    if (/^help$|^\?$/i.test(content)) {
      return message.channel.send({
        embeds: [
          infoEmbed(
            "`!webhook` wstawia skrypt webhooka CF7 jako fragment HTML w Code Snippets (stopka).\n\n" +
              "Inline (opcjonalnie):\n```\n!webhook\nwebhook: https://hook.eu2.make.com/xxxxx\nformularz: zt-geneo\nslug: zt-ganeo-oferta-specjalna/\n```\n" +
              "Puste `slug` = skrypt działa na każdej stronie (i tak ma dedup + guard)."
          ),
        ],
      });
    }

    const inline = parseInlineArgs(content);

    let webhookUrl = inline.webhook;
    if (!webhookUrl) {
      webhookUrl = await askText(message, "Podaj **URL webhooka** (Make / Zapier / n8n):");
      if (!webhookUrl) return;
    }
    if (!/^https?:\/\/\S+$/i.test(webhookUrl)) {
      return message.channel.send({ embeds: [errorEmbed(`To nie wygląda na URL: \`${webhookUrl}\``)] });
    }

    let formName = inline.formularz;
    if (!formName) {
      formName = await askText(
        message,
        "Podaj **nazwę formularza** (trafia do payloadu jako pole `_formularz`, np. `zt-geneo`):"
      );
      if (!formName) return;
    }

    // slug jest opcjonalny; jesli nie podano inline, dopytaj (mozna odpowiedziec "brak")
    let pageSlug = inline.slug;
    if (pageSlug === null) {
      const raw = await askText(
        message,
        "Podaj **slug strony** dla ograniczenia skryptu (np. `zt-ganeo-oferta-specjalna/`). " +
          "Jeśli ma działać wszędzie - napisz `brak`:"
      );
      if (raw === null) return;
      pageSlug = /^\s*brak\s*$/i.test(raw) ? "" : raw;
    }

    const markerKey = slugify(inline.nazwa || pageSlug || formName || "global") || "global";
    const snippetName = `ITM webhook :: ${markerKey}`;

    const processing = await message.channel.send({
      embeds: [infoEmbed("⏳ Buduję skrypt i zapisuję fragment w Code Snippets...")],
    });

    let code;
    try {
      code = await buildWebhookSnippetCode({ webhookUrl, formName, pageSlug });
    } catch (err) {
      return processing.edit({ embeds: [errorEmbed(`Nie znaleziono szablonu webhooka: ${err.message}`)] });
    }

    let result;
    try {
      result = await wpUpsertSnippet({
        name: snippetName,
        code,
        scope: "site-footer",
        description: `Webhook CF7 -> ${webhookUrl} (formularz: ${formName}${pageSlug ? `, slug: ${pageSlug}` : ""})`,
        tags: ["itm", "webhook", "cf7"],
        active: true,
      });
    } catch (err) {
      console.error("Error upserting Code Snippet:", err);
      return processing.edit({
        embeds: [
          errorEmbed(
            `Nie udało się zapisać fragmentu: ${err.message}\n\n` +
              "Sprawdź czy wtyczka **Code Snippets** ma włączone REST API i czy konto WP z Application Password jest administratorem."
          ),
        ],
      });
    }

    const embed = new EmbedBuilder()
      .setColor("#00FF00")
      .setTitle(result.created ? "🎣 Webhook: fragment utworzony" : "🎣 Webhook: fragment zaktualizowany")
      .addFields(
        { name: "Fragment", value: fv(`${snippetName} (#${result.id})`) },
        { name: "Webhook", value: fv(webhookUrl) },
        { name: "Pole _formularz", value: fv(formName), inline: true },
        { name: "Slug", value: fv(pageSlug || "(wszędzie)"), inline: true },
        { name: "Scope", value: "site-footer (HTML)", inline: true },
        { name: "🔗 Linki", value: fv(`[Edytuj fragment](${result.editLink})`) }
      )
      .setFooter({ text: "1x na wypełnienie · dynamiczne pola · _formularz_nr / _formularz_sekcja" });

    await processing.edit({ embeds: [embed] });
  } catch (error) {
    console.error("Error processing webhook command:", error);
    try {
      await message.channel.send({ embeds: [errorEmbed(`Wystąpił błąd: ${errDetail(error)}`)] });
    } catch (sendError) {
      console.error("Failed to send error message:", sendError);
    }
  }
}
