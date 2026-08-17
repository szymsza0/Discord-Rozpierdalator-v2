import { GOOGLE_SCRIPT_TEMPLATE_DOC_ID } from "../config.js";
import { fetchGoogleDocPlainText } from "./googleDocs.js";

const INSTRUCTIONS_MARKER = "Zalacznik: wskazowki nagraniowe dla klienta";
// Kept as a fixed placeholder heading only - the template doc is a
// work-in-progress style guide, and the "Zalacznik" section it contains today
// runs straight into an unrelated worked example + duplicate rules list with
// no clean end marker, so pulling everything after "Zalacznik" verbatim into
// every generated script also pulled in that unrelated content. Until the
// client-facing recording instructions are finalized as their own
// self-contained section, only the heading is appended to generated docs.
const RECORDING_INSTRUCTIONS_PLACEHOLDER = "Załącznik: wskazówki nagraniowe dla klienta";

// Feedback (see feedbackIntegrator.js) is journaled under this heading at the
// very end of the template doc, and its content is folded back into
// rulesText below so future generations immediately account for it.
export const FEEDBACK_SECTION_HEADING = "Uwagi z feedbacku (na bieżąco)";

// !skrypt lets the operator paste a treatment description + USP instead of a
// brief link. For a brand-new client (no prior rows in the scripts sheet) the
// bot then asks this bank of key questions to fill the gaps. Kept editable in
// the template doc (as a numbered list right after this heading) so
// non-devs can tweak the questions without a redeploy; DEFAULT_BRIEF_QUESTIONS
// below is only the fallback used before that section exists in the doc.
export const BRIEF_QUESTIONS_HEADING = "Kluczowe pytania briefowe (nowy klient)";

const DEFAULT_BRIEF_QUESTIONS = [
  "Na czym dokładnie polega zabieg/usługa i jaki problem klienta rozwiązuje?",
  "Co wyróżnia tę ofertę na tle konkurencji (USP)?",
  "Jakie są główne efekty/rezultaty i po jakim czasie widoczne?",
  "Jaka jest cena regularna i promocyjna (jeśli dotyczy)?",
  "Czy oferta jest ograniczona czasowo/ilościowo (np. \"do końca miesiąca\", \"pierwsze 20 osób\")?",
  "Czy mamy dodatkowe dowody wiarygodności oprócz bycia ekspertem / autorskiego programu (lata doświadczenia, liczba klientów, opinie, certyfikaty)?",
];

// CTA is a fixed business rule, not something worth asking about per-brief -
// always injected into the generated brief context instead of a question.
export const FIXED_CTA_NOTE =
  "CTA zawsze: wypełnienie formularza kontaktowego (nie zmieniaj tego, chyba że operator jawnie napisał inaczej).";

/**
 * Reads the numbered list right after BRIEF_QUESTIONS_HEADING in the raw doc
 * text. Falls back to DEFAULT_BRIEF_QUESTIONS if the section hasn't been
 * added to the doc yet, so the feature works before anyone edits the doc.
 */
function extractBriefQuestions(fullText) {
  const normalizedFull = stripPolishDiacritics(fullText);
  const headingIndex = findMarker(normalizedFull, BRIEF_QUESTIONS_HEADING);
  if (headingIndex === -1) return DEFAULT_BRIEF_QUESTIONS;

  const afterHeading = fullText.slice(headingIndex + BRIEF_QUESTIONS_HEADING.length);
  const lines = afterHeading.split("\n").map((l) => l.trim());
  const questions = [];
  for (const line of lines) {
    if (line === "") {
      if (questions.length) break;
      continue;
    }
    const match = line.match(/^\d+[.)]\s*(.+)$/);
    if (match) questions.push(match[1].trim());
    else if (questions.length) break;
  }
  return questions.length ? questions : DEFAULT_BRIEF_QUESTIONS;
}

function stripPolishDiacritics(str) {
  return str
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L");
}

function findMarker(normalizedText, marker) {
  return normalizedText.toLowerCase().indexOf(stripPolishDiacritics(marker).toLowerCase());
}

let cachedTemplate = null;

/**
 * Fetches and caches the ITM script style-guide doc once per process
 * lifetime (network + generation-prompt tokens are only spent once, not on
 * every !skrypt invocation). The doc is split into:
 *  - rulesText: structure/style rules fed to Claude as the (cached) system
 *    prompt, with any accumulated feedback-journal entries folded in at the end
 *  - recordingInstructionsText: a fixed placeholder heading appended to every
 *    generated doc (see comment above)
 * Pass forceRefresh: true (via an admin subcommand, or after integrating new
 * feedback) to pick up doc changes.
 */
export async function getScriptTemplate({ forceRefresh = false } = {}) {
  if (cachedTemplate && !forceRefresh) return cachedTemplate;

  const fullText = await fetchGoogleDocPlainText(GOOGLE_SCRIPT_TEMPLATE_DOC_ID);
  const normalizedFull = stripPolishDiacritics(fullText);

  const instructionsIndex = findMarker(normalizedFull, INSTRUCTIONS_MARKER);
  if (instructionsIndex === -1) {
    throw new Error(`Nie znaleziono sekcji "${INSTRUCTIONS_MARKER}" w dokumencie szablonu skryptow.`);
  }

  let rulesText = fullText.slice(0, instructionsIndex).trim();

  const feedbackIndex = findMarker(normalizedFull, FEEDBACK_SECTION_HEADING);
  if (feedbackIndex !== -1) {
    rulesText += "\n\n" + fullText.slice(feedbackIndex).trim();
  }

  cachedTemplate = {
    rulesText,
    recordingInstructionsText: RECORDING_INSTRUCTIONS_PLACEHOLDER,
    briefQuestions: extractBriefQuestions(fullText),
    fetchedAt: new Date(),
  };

  return cachedTemplate;
}
