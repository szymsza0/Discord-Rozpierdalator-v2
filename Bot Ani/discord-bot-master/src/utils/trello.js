import fetch from "node-fetch";
import {
  TRELLO_API_BASE,
  TRELLO_KEY,
  TRELLO_TOKEN,
  ALLOWED_GUILD_ID,
} from "../config.js";
import { findSimilarNames } from "../utils/helpers.js";
import dayjs from "dayjs";
import weekOfYear from "dayjs/plugin/weekOfYear.js";
import isoWeek from "dayjs/plugin/isoWeek.js";

// Konfiguracja dayjs na górze pliku
dayjs.extend(weekOfYear);
dayjs.extend(isoWeek);

export async function fetchTrelloBoardDetails(boardId) {
  try {
    const response = await fetch(
      `${TRELLO_API_BASE}/boards/${boardId}?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`
    );
    const boardData = await response.json();

    if (!response.ok) {
      console.error(
        `❌ Trello API error fetching board details: ${
          response.status
        } - ${JSON.stringify(boardData)}`
      );
      return null;
    }

    return boardData;
  } catch (error) {
    console.error("🚨 Error fetching Trello board details:", error);
    return null;
  }
}

export async function fetchTrelloLists(boardId) {
  try {
    const url = `${TRELLO_API_BASE}/boards/${boardId}/lists?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;

    const response = await fetch(url);
    const lists = await response.json();

    if (!response.ok) {
      console.error("Failed to fetch Trello lists:", lists);
      throw new Error(
        `Trello API error: ${response.status} - ${response.statusText}`
      );
    }

    return lists;
  } catch (error) {
    console.error("Error fetching Trello lists:", error);
    throw error;
  }
}

export async function fetchBoards(forceRefresh = false) {
  try {
    const url = `https://api.trello.com/1/members/me/boards?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;

    if (!forceRefresh && global.trelloBoardsCache) {
      return global.trelloBoardsCache;
    }

    const response = await fetch(url);
    const text = await response.text();

    if (!response.ok || text.includes("Invalid") || text.includes("Error")) {
      console.error("🚨 Invalid response from Trello API:", text);
      return null;
    }

    const boards = JSON.parse(text);

    const filteredBoards = boards.filter(
      (board) => board.idOrganization === ALLOWED_GUILD_ID
    );

    if (filteredBoards.length === 0) {
      console.warn("🚫 No boards found in the allowed workspace.");
    }

    global.trelloBoardsCache = filteredBoards;
    return filteredBoards;
  } catch (error) {
    console.error("🚨 Error fetching Trello boards:", error);
    return null;
  }
}

/**
 * Calculate Levenshtein distance between two strings
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} - Distance score (lower means more similar)
 */
function levenshteinDistance(a, b) {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];

  // Initialize matrix
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[b.length][a.length];
}

export async function getBoardIdByName(name, exactMatch = false) {
  try {
    const response = await fetch(
      `${TRELLO_API_BASE}/organizations/${ALLOWED_GUILD_ID}/boards?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch boards: ${response.status}`);
    }

    const boards = await response.json();
    const activeBoards = boards.filter((board) => !board.closed);

    // Remove prefixes for matching (e.g., "[OZ] 1 - ")
    const normalizedName = name
      .replace(/^\s*\[[^\]]+\]\s*\d+\s*-\s*/, "")
      .trim();

    // First try exact matching if requested
    if (exactMatch) {
      // Look for exact match
      const exactMatches = activeBoards.filter(
        (board) =>
          board.name.toLowerCase() === name.toLowerCase() ||
          board.name
            .replace(/^\s*\[[^\]]+\]\s*\d+\s*-\s*/, "")
            .trim()
            .toLowerCase() === normalizedName.toLowerCase()
      );

      if (exactMatches.length === 1) {
        return exactMatches[0].id;
      } else if (exactMatches.length > 1) {
        return { multiple: true, boards: exactMatches };
      }

      // No exact matches found
      return null;
    }

    // Fuzzy matching for non-exact search
    // Filter boards that might match the normalized name
    const matchingBoards = activeBoards.filter((board) => {
      const boardNormalizedName = board.name
        .replace(/^\s*\[[^\]]+\]\s*\d+\s*-\s*/, "")
        .trim();

      // Case insensitive comparison
      const boardNameLower = boardNormalizedName.toLowerCase();
      const searchNameLower = normalizedName.toLowerCase();

      // Check if one includes the other
      const includesMatch =
        boardNameLower.includes(searchNameLower) ||
        searchNameLower.includes(boardNameLower);

      // Check for very similar names with small differences
      // Convert both names to lowercase and remove spaces for comparison
      const cleanBoardName = boardNameLower.replace(/\s+/g, "");
      const cleanSearchName = searchNameLower.replace(/\s+/g, "");

      // Check if the names are almost the same
      const similarityMatch =
        // One is a substring of the other
        cleanBoardName.includes(cleanSearchName) ||
        cleanSearchName.includes(cleanBoardName) ||
        // Or they differ by very few characters
        levenshteinDistance(cleanBoardName, cleanSearchName) <= 2;

      return includesMatch || similarityMatch;
    });

    if (matchingBoards.length === 0) {
      // Try finding similar names using Levenshtein distance
      const similarBoards = findSimilarNames(
        activeBoards.map((b) => ({
          id: b.id,
          name: b.name,
          normalizedName: b.name
            .replace(/^\s*\[[^\]]+\]\s*\d+\s*-\s*/, "")
            .trim(),
        })),
        normalizedName
      );

      if (similarBoards.length === 0) {
        return null;
      }

      if (similarBoards.length === 1) {
        return similarBoards[0].id;
      }

      return {
        multiple: true,
        boards: similarBoards.map((b) => ({
          id: b.id,
          name: b.name,
        })),
      };
    }

    if (matchingBoards.length === 1) {
      return matchingBoards[0].id;
    }

    return {
      multiple: true,
      boards: matchingBoards,
    };
  } catch (error) {
    console.error("Error fetching board ID by name:", error);
    return null;
  }
}

export async function getListIdByName(boardId, listName) {
  try {
    const lists = await fetchTrelloLists(boardId);
    if (!lists || lists.length === 0) {
      console.error(`❌ No lists found for board: ${boardId}`);
      return null;
    }

    const normalizedListName = listName.toLowerCase().trim();

    const exactMatch = lists.find(
      (l) => l.name.toLowerCase().trim() === normalizedListName
    );
    if (exactMatch) {
      return exactMatch.id;
    }

    const strictLooseMatch = lists.find(
      (l) =>
        l.name.toLowerCase().includes(normalizedListName) &&
        normalizedListName.includes(l.name.toLowerCase())
    );
    if (strictLooseMatch) {
      return strictLooseMatch.id;
    }

    const similarLists = findSimilarNames(normalizedListName, lists);

    if (similarLists.length === 1) {
      return lists.find((l) => l.name === similarLists[0]).id;
    } else if (similarLists.length > 1) {
      return { multiple: true, lists: similarLists };
    }

    return null;
  } catch (error) {
    return null;
  }
}

export async function getTrelloMemberId(username) {
  try {
    const url = `https://api.trello.com/1/members/${username}?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
    console.log(`🌍 Fetching Trello Member ID from: ${url}`);

    const response = await fetch(url);
    const responseText = await response.text();

    if (!response.ok) {
      console.error(
        `❌ Trello API error fetching user ID for ${username}: ${response.status} - ${responseText}`
      );

      if (response.status === 404) {
        console.warn(
          `⚠️ User "${username}" not found in Trello. Skipping assignment.`
        );
      }

      return null;
    }

    try {
      const data = JSON.parse(responseText);
      return data.id || null;
    } catch (jsonError) {
      console.error("🚨 Trello API returned invalid JSON:", responseText);
      return null;
    }
  } catch (error) {
    console.error(
      `🚨 Error fetching Trello Member ID for "${username}":`,
      error
    );
    return null;
  }
}

/**
 * ZAKTUALIZOWANA funkcja fetchInvoiceCards z ulepszonym filtrowaniem
 */
export async function fetchInvoiceCards(period, memberName = null) {
  try {
    const INVOICE_BOARD_NAME = "[[ C-Level ]] Szymon";
    
    console.log(`🔍 Szukam board'a: "${INVOICE_BOARD_NAME}"`);
    
    // Znajdź board ID
    const boardId = await getBoardIdByName(INVOICE_BOARD_NAME, true);
    
    if (!boardId) {
      throw new Error(`Nie znaleziono board'a: "${INVOICE_BOARD_NAME}"`);
    }
    
    console.log(`✅ Znaleziono board ID: ${boardId}`);
    
    // Pobierz custom fields dla board'a
    const boardCustomFields = await getBoardCustomFields(boardId);
    
    // Pobierz wszystkie listy z board'a
    const lists = await fetchTrelloLists(boardId);
    
    if (!lists || lists.length === 0) {
      throw new Error("Nie znaleziono list w board'zie");
    }
    
    console.log(`📋 Znaleziono ${lists.length} list w board'zie`);
    
    // Pobierz wszystkie karty ze wszystkich list z custom fields
    let allCards = [];
    
    for (const list of lists) {
      try {
        const cardsUrl = `${TRELLO_API_BASE}/lists/${list.id}/cards?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}&members=true&labels=true&customFieldItems=true`;
        const cardsResponse = await fetch(cardsUrl);
        
        if (!cardsResponse.ok) {
          console.warn(`⚠️ Nie udało się pobrać kart z listy: ${list.name}`);
          continue;
        }
        
        const cards = await cardsResponse.json();
        
        // Dodaj informację o liście i custom fields do każdej karty
        const cardsWithListInfo = cards.map(card => ({
          ...card,
          listName: list.name,
          listId: list.id,
          boardCustomFields: boardCustomFields
        }));
        
        allCards = allCards.concat(cardsWithListInfo);
        
      } catch (error) {
        console.error(`🚨 Błąd przy pobieraniu kart z listy ${list.name}:`, error);
      }
    }
    
    console.log(`🃏 Pobrano łącznie ${allCards.length} kart`);
    
    // Filtruj karty według labeli faktury
    const invoiceCards = filterCardsByInvoiceLabels(allCards);
    console.log(`💼 Znaleziono ${invoiceCards.length} kart z labelami faktury`);
    
    // Filtruj karty według deadline'a
    const cardsInPeriod = filterCardsByDateRange(invoiceCards, period);
    console.log(`📅 Znaleziono ${cardsInPeriod.length} kart w okresie ${period}`);
    
    // ULEPSZONE filtrowanie według użytkownika (karty + listy)
    let finalCards = cardsInPeriod;
    if (memberName) {
      finalCards = filterCardsByMember(cardsInPeriod, memberName);
      console.log(`👤 Po ulepszonym filtrowaniu użytkownika "${memberName}": ${finalCards.length} kart`);
    }
    
    return finalCards;
    
  } catch (error) {
    console.error("🚨 Błąd w fetchInvoiceCards:", error);
    throw error;
  }
}


/**
 * Filtruje karty według labeli związanych z fakturowaniem
 * @param {Array} cards - Array wszystkich kart
 * @returns {Array} - Karty z odpowiednimi labelami
 */
function filterCardsByInvoiceLabels(cards) {
  const invoiceLabels = [
    "[Klient] Trwająca kampania",
    "[Klient] Kampania bliska końcowi (2 tyg. przed)",
    "[Klient] Przypisany",
    "[Klient] Oczekuje na płatność",
    "przed startem"
  ];
  
  return cards.filter(card => {
    if (!card.labels || card.labels.length === 0) {
      return false;
    }
    
    // Sprawdź czy karta ma którykolwiek z labelów faktury
    return card.labels.some(label => 
      invoiceLabels.some(invoiceLabel => 
        label.name.toLowerCase().includes(invoiceLabel.toLowerCase()) ||
        invoiceLabel.toLowerCase().includes(label.name.toLowerCase())
      )
    );
  });
}

/**
 * Filtruje karty według zakresu dat
 * @param {Array} cards - Array kart
 * @param {string} period - "week", "month", "7days"
 * @returns {Array} - Karty w określonym okresie
 */
function filterCardsByDateRange(cards, period) {
  const now = dayjs().tz("Europe/Warsaw");
  let endDate;
  
  switch (period) {
    case "week":
      // Do końca tego tygodnia (niedziela)
      endDate = now.endOf('isoWeek');
      break;
    case "month":
      // Do końca tego miesiąca
      endDate = now.endOf('month');
      break;
    case "7days":
      // Następne 7 dni
      endDate = now.add(7, 'days').endOf('day');
      break;
    default:
      throw new Error(`Nieznany okres: ${period}`);
  }
  
  console.log(`📅 Filtrowanie kart do daty: ${endDate.format('YYYY-MM-DD HH:mm')}`);
  
  return cards.filter(card => {
    // Jeśli karta nie ma deadline'a, pomijamy ją
    if (!card.due) {
      return false;
    }
    
    const cardDue = dayjs(card.due).tz("Europe/Warsaw");
    
    // Sprawdź czy deadline jest między teraz a końcem okresu
    return cardDue.isAfter(now) && cardDue.isBefore(endDate);
  });
}

/**
 * Ulepszona funkcja filtrująca karty według użytkownika
 * Sprawdza zarówno przypisanych członków karty JAK I nazwę listy
 * @param {Array} cards - Array kart
 * @param {string} memberName - Nazwa użytkownika (np. "Agnieszka", "Aga")
 * @returns {Array} - Karty przypisane do użytkownika lub na jego liście
 */
function filterCardsByMember(cards, memberName) {
  if (!memberName) return cards;
  
  const searchName = memberName.toLowerCase().trim();
  
  // Normalizacja nazw (dla lepszego dopasowania)
  const normalizedSearchName = normalizeName(searchName);
  
  console.log(`🔍 Szukam kart dla: "${memberName}" (znormalizowane: "${normalizedSearchName}")`);
  
  return cards.filter(card => {
    // WARUNEK 1: Sprawdź przypisanych członków karty
    const memberMatch = card.members && card.members.length > 0 && 
      card.members.some(member => {
        const fullName = (member.fullName || "").toLowerCase();
        const username = (member.username || "").toLowerCase();
        const normalizedFullName = normalizeName(fullName);
        const normalizedUsername = normalizeName(username);
        
        return normalizedFullName.includes(normalizedSearchName) || 
               normalizedUsername.includes(normalizedSearchName) ||
               normalizedSearchName.includes(normalizedFullName) ||
               normalizedSearchName.includes(normalizedUsername);
      });
    
    // WARUNEK 2: Sprawdź nazwę listy
    const listName = (card.listName || "").toLowerCase();
    const normalizedListName = normalizeName(listName);
    
    // Sprawdź czy lista zawiera imię osoby
    const listMatch = normalizedListName.includes(normalizedSearchName) ||
                     normalizedSearchName.includes(normalizedListName) ||
                     // Sprawdź konkretne wzorce list
                     listName.includes(`przydzielone – ${searchName}`) ||
                     listName.includes(`przypisane – ${searchName}`) ||
                     listName.includes(`${searchName} –`) ||
                     listName.includes(`– ${searchName}`);
    
    const matches = memberMatch || listMatch;
    
    if (matches) {
      console.log(`✅ Karta "${card.name}" pasuje dla "${memberName}" (członek: ${memberMatch}, lista: ${listMatch})`);
    }
    
    return matches;
  });
}

/**
 * Normalizuje nazwę do porównywania (usuwa akcenty, spacje, specjalne znaki)
 * @param {string} name - Nazwa do normalizacji
 * @returns {string} - Znormalizowana nazwa
 */
function normalizeName(name) {
  if (!name) return "";
  
  return name
    .toLowerCase()
    .trim()
    .normalize("NFD") // Usuń akcenty
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, "") // Usuń znaki specjalne
    .replace(/\s+/g, " "); // Normalizuj spacje
}


/**
 * Grupuje karty według labeli dla czytelnego wyświetlenia
 * @param {Array} cards - Array kart
 * @returns {Object} - Karty pogrupowane według labeli
 */
export function groupCardsByInvoiceLabels(cards) {
  const groups = {
    "[Klient] Trwająca kampania": [],
    "[Klient] Kampania bliska końcowi (2 tyg. przed)": [],
    "[Klient] Przypisany": [],
    "[Klient] Oczekuje na płatność": [],
    "przed startem": [],
    "inne": []
  };
  
  cards.forEach(card => {
    let assigned = false;
    
    if (card.labels && card.labels.length > 0) {
      for (const label of card.labels) {
        for (const groupName of Object.keys(groups)) {
          if (groupName !== "inne" && 
              (label.name.toLowerCase().includes(groupName.toLowerCase()) ||
               groupName.toLowerCase().includes(label.name.toLowerCase()))) {
            groups[groupName].push(card);
            assigned = true;
            break;
          }
        }
        if (assigned) break;
      }
    }
    
    if (!assigned) {
      groups["inne"].push(card);
    }
  });
  
  return groups;
}/**
 * Parsuje nazwę listy żeby wyciągnąć imię osoby
 * @param {string} listName - Nazwa listy (np. "Przydzielone - Agnieszka")
 * @returns {string} - Imię osoby lub oryginalna nazwa
 */
function parsePersonFromListName(listName) {
  // Wzorce do parsowania
  const patterns = [
    /Przydzielone?\s*[-–]\s*(.+)$/i,     // "Przydzielone - Agnieszka"
    /Przypisane?\s*[-–]\s*(.+)$/i,      // "Przypisane – Olga"
    /(.+)\s*[-–]\s*Przydzielone?$/i,    // "Agnieszka - Przydzielone"
    /(.+)\s*[-–]\s*Przypisane?$/i,      // "Olga – Przypisane"
  ];
  
  for (const pattern of patterns) {
    const match = listName.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  
  // Jeśli nie pasuje do wzorców, zwróć oryginalną nazwę
  return listName;
}

/**
 * Grupuje karty według osób (na podstawie nazw list) dla czytelnego wyświetlenia
 * @param {Array} cards - Array kart
 * @returns {Object} - Karty pogrupowane według osób
 */
export function groupCardsByPerson(cards) {
  const groups = {};
  
  cards.forEach(card => {
    // Wyciągnij imię osoby z nazwy listy
    const personName = parsePersonFromListName(card.listName || "Nieznana lista");
    
    // Jeśli grupa dla tej osoby nie istnieje, stwórz ją
    if (!groups[personName]) {
      groups[personName] = [];
    }
    
    // Dodaj kartę do grupy osoby
    groups[personName].push(card);
  });
  
  return groups;
}
/**
 * Pobiera definicje custom fields dla board'a
 * @param {string} boardId - ID board'a
 * @returns {Promise<Array>} - Array z definicjami custom fields
 */
async function getBoardCustomFields(boardId) {
  try {
    const url = `${TRELLO_API_BASE}/boards/${boardId}/customFields?key=${TRELLO_KEY}&token=${TRELLO_TOKEN}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.warn(`⚠️ Nie udało się pobrać custom fields: ${response.status}`);
      return [];
    }
    
    const customFields = await response.json();
    console.log(`📋 Pobrano ${customFields.length} custom fields z board'a`);
    
    return customFields;
  } catch (error) {
    console.error("🚨 Błąd przy pobieraniu custom fields:", error);
    return [];
  }
}

/**
 * Pobiera wartość custom field "Stawka" z karty
 * @param {Object} card - Karta Trello z custom fields
 * @param {Array} boardCustomFields - Definicje custom fields z board'a
 * @returns {string} - Wartość stawki lub "Brak"
 */
export function getStawkaFromCard(card, boardCustomFields) {
  if (!card.customFieldItems || card.customFieldItems.length === 0) {
    return "Brak";
  }
  
  if (!boardCustomFields || boardCustomFields.length === 0) {
    return "Brak";
  }
  
  // Znajdź definicję custom field "Stawka"
  const stawkaFieldDef = boardCustomFields.find(field => 
    field.name && field.name.toLowerCase().includes('stawka')
  );
  
  if (!stawkaFieldDef) {
    return "Brak";
  }
  
  // Znajdź wartość tego custom field w karcie
  const stawkaValue = card.customFieldItems.find(item => 
    item.idCustomField === stawkaFieldDef.id
  );
  
  if (!stawkaValue || !stawkaValue.value) {
    return "Brak";
  }
  
  // Wyciągnij wartość w zależności od typu
  if (stawkaValue.value.text) {
    return stawkaValue.value.text;
  }
  
  if (stawkaValue.value.number !== undefined) {
    return stawkaValue.value.number.toString() + " zł";
  }
  
  if (stawkaValue.value.date) {
    return stawkaValue.value.date;
  }
  
  return "Brak";
}
