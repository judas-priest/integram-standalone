/**
 * @integram/common - Russian Locale Functions
 *
 * These utilities provide Russian language formatting for dates, numbers, and text.
 * Maps to PHP functions in integram-server/include/funcs.php
 */

// ============================================================================
// Russian Month Names
// ============================================================================

const RUSSIAN_MONTHS = {
  '01': 'января',
  '02': 'февраля',
  '03': 'марта',
  '04': 'апреля',
  '05': 'мая',
  '06': 'июня',
  '07': 'июля',
  '08': 'августа',
  '09': 'сентября',
  '10': 'октября',
  '11': 'ноября',
  '12': 'декабря',
};

// ============================================================================
// Russian Number Words (1-19)
// ============================================================================

const NUMBERS_1_19 = {
  1: 'один ',
  2: 'два ',
  3: 'три ',
  4: 'четыре ',
  5: 'пять ',
  6: 'шесть ',
  7: 'семь ',
  8: 'восемь ',
  9: 'девять ',
  10: 'десять ',
  11: 'одиннадцать ',
  12: 'двенадцать ',
  13: 'тринадцать ',
  14: 'четырнадцать ',
  15: 'пятнадцать ',
  16: 'шестнадцать ',
  17: 'семнадцать ',
  18: 'восемнадцать ',
  19: 'девятнадцать ',
};

// Feminine forms for 1 and 2 (used with thousands)
const NUMBERS_1_2_FEM = {
  1: 'одна ',
  2: 'две ',
};

// ============================================================================
// Russian Tens
// ============================================================================

const TENS = {
  2: 'двадцать ',
  3: 'тридцать ',
  4: 'сорок ',
  5: 'пятьдесят ',
  6: 'шестьдесят ',
  7: 'семьдесят ',
  8: 'восемьдесят ',
  9: 'девяносто ',
};

// ============================================================================
// Russian Hundreds
// ============================================================================

const HUNDREDS = {
  1: 'сто ',
  2: 'двести ',
  3: 'триста ',
  4: 'четыреста ',
  5: 'пятьсот ',
  6: 'шестьсот ',
  7: 'семьсот ',
  8: 'восемьсот ',
  9: 'девятьсот ',
};

// ============================================================================
// Russian Plural Forms
// ============================================================================

const RUBLES = ['рубль ', 'рубля ', 'рублей '];
const THOUSANDS = ['тысяча ', 'тысячи ', 'тысяч '];
const MILLIONS = ['миллион ', 'миллиона ', 'миллионов '];
const BILLIONS = ['миллиард ', 'миллиарда ', 'миллиардов '];
const KOPEKS = ['копейка', 'копейки', 'копеек'];

// ============================================================================
// Transliteration Map (Russian to Latin)
// ============================================================================

const TRANSLIT_MAP = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd',
  'е': 'e', 'ё': 'e', 'ж': 'j', 'з': 'z', 'и': 'i',
  'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n',
  'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't',
  'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'c', 'ч': 'ch',
  'ш': 'sh', 'щ': 'sh', 'ы': 'y', 'э': 'e', 'ю': 'yu',
  'я': 'ya', 'ъ': '', 'ь': '',
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get Russian plural form index based on number.
 * Russian has 3 plural forms:
 * - 0: 1, 21, 31, ... (singular)
 * - 1: 2-4, 22-24, ... (few)
 * - 2: 0, 5-20, 25-30, ... (many)
 *
 * @param {number} n - Number to determine plural form for
 * @returns {number} Plural form index (0, 1, or 2)
 */
function getPluralForm(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return 0; // singular
  } else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return 1; // few
  } else {
    return 2; // many
  }
}

/**
 * Convert a 3-digit number segment to Russian words.
 *
 * @param {number} num - Number (0-999)
 * @param {boolean} feminine - Use feminine forms for 1 and 2
 * @returns {{ words: string, pluralForm: number }} Words and plural form
 */
function segmentToWords(num, feminine = false) {
  let words = '';
  let n = num;
  let pluralForm = 2; // Default to "many" form

  // Hundreds
  if (n >= 100) {
    words += HUNDREDS[Math.floor(n / 100)];
    n %= 100;
  }

  // Tens and ones
  if (n >= 20) {
    words += TENS[Math.floor(n / 10)];
    n %= 10;
  }

  // Handle teens (11-19)
  if (num % 100 >= 11 && num % 100 <= 19) {
    words += NUMBERS_1_19[num % 100];
    pluralForm = 2; // teens always use "many" form
  } else if (n > 0) {
    // Handle 1-9 (or remainder after tens)
    if (feminine && (n === 1 || n === 2)) {
      words += NUMBERS_1_2_FEM[n];
    } else {
      words += NUMBERS_1_19[n];
    }
    pluralForm = getPluralForm(n);
  }

  return { words, pluralForm };
}

// ============================================================================
// Date Formatting
// ============================================================================

/**
 * Convert date to Russian format.
 * Maps to PHP: abn_DATE2STR()
 *
 * @param {string|Date} value - Date in YYYYMMDD format or Date object
 * @returns {string} Formatted date string (e.g., "25 января 2025 г.")
 */
export function dateToRussianString(value) {
  let dateStr;

  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    dateStr = `${year}${month}${day}`;
  } else {
    dateStr = String(value);
  }

  // Ensure format is YYYYMMDD
  if (dateStr.length !== 8) {
    return dateStr;
  }

  const year = dateStr.substring(0, 4);
  const month = dateStr.substring(4, 6);
  const day = dateStr.substring(6, 8);

  const monthName = RUSSIAN_MONTHS[month] || month;

  // Remove leading zero from day
  const dayNum = parseInt(day, 10);

  return `${dayNum} ${monthName} ${year} г.`;
}

/**
 * Alias for dateToRussianString (matches PHP function naming).
 */
export const abn_DATE2STR = dateToRussianString;

// ============================================================================
// Number to Words Conversion
// ============================================================================

/**
 * Convert number to Russian words.
 * Maps to PHP: abn_NUM2STR()
 *
 * @param {number} value - Number to convert
 * @returns {string} Number in Russian words (capitalized)
 */
export function numberToRussianWords(value) {
  let n = Math.floor(value);
  let result = '';

  if (n === 0) {
    return 'Ноль';
  }

  // Handle negative numbers
  if (n < 0) {
    result += 'минус ';
    n = Math.abs(n);
  }

  // Billions
  if (n >= 1000000000) {
    const billions = Math.floor(n / 1000000000);
    const { words, pluralForm } = segmentToWords(billions, false);
    result += words + BILLIONS[pluralForm];
    n %= 1000000000;
  }

  // Millions
  if (n >= 1000000) {
    const millions = Math.floor(n / 1000000);
    const { words, pluralForm } = segmentToWords(millions, false);
    result += words + MILLIONS[pluralForm];
    n %= 1000000;
  }

  // Thousands
  if (n >= 1000) {
    const thousands = Math.floor(n / 1000);
    const { words, pluralForm } = segmentToWords(thousands, true); // feminine
    result += words + THOUSANDS[pluralForm];
    n %= 1000;
  }

  // Remainder (0-999)
  if (n > 0) {
    const { words } = segmentToWords(n, false);
    result += words;
  }

  // Capitalize first letter
  result = result.trim();
  return result.charAt(0).toUpperCase() + result.slice(1);
}

/**
 * Alias for numberToRussianWords (matches PHP function naming).
 */
export const abn_NUM2STR = numberToRussianWords;

// ============================================================================
// Currency to Words Conversion
// ============================================================================

/**
 * Convert amount to Russian rubles in words.
 * Maps to PHP: abn_RUB2STR()
 *
 * @param {number} value - Amount in rubles (can include kopeks as decimal)
 * @returns {string} Amount in Russian words with rubles and kopeks
 */
export function rublesToRussianWords(value) {
  const intPart = Math.floor(value);
  const kopeks = Math.round((value - intPart) * 100);

  let result = '';
  let n = intPart;

  // Handle billions
  if (n >= 1000000000) {
    const billions = Math.floor(n / 1000000000);
    const { words, pluralForm } = segmentToWords(billions, false);
    result += words + BILLIONS[pluralForm];
    n %= 1000000000;
  }

  // Handle millions
  if (n >= 1000000) {
    const millions = Math.floor(n / 1000000);
    const { words, pluralForm } = segmentToWords(millions, false);
    result += words + MILLIONS[pluralForm];
    n %= 1000000;
    if (n === 0) {
      result += 'рублей ';
    }
  }

  // Handle thousands
  if (n >= 1000) {
    const thousands = Math.floor(n / 1000);
    const { words, pluralForm } = segmentToWords(thousands, true); // feminine
    result += words + THOUSANDS[pluralForm];
    n %= 1000;
    if (n === 0) {
      result += 'рублей ';
    }
  }

  // Handle remainder (0-999)
  if (n > 0) {
    const { words, pluralForm } = segmentToWords(n, false);
    result += words + RUBLES[pluralForm];
  } else if (intPart === 0) {
    result = 'ноль рублей ';
  }

  // Handle kopeks
  if (kopeks > 0) {
    const { pluralForm } = segmentToWords(kopeks, true);
    result += `${kopeks} ${KOPEKS[pluralForm]}`;
  } else {
    result += '00 копеек';
  }

  // Capitalize first letter
  result = result.trim();
  return result.charAt(0).toUpperCase() + result.slice(1);
}

/**
 * Alias for rublesToRussianWords (matches PHP function naming).
 */
export const abn_RUB2STR = rublesToRussianWords;

// ============================================================================
// Transliteration
// ============================================================================

/**
 * Transliterate Russian text to Latin characters and create URL-friendly slug.
 * Maps to PHP: abn_Translit()
 *
 * @param {string} text - Russian text to transliterate
 * @returns {string} Transliterated URL-friendly string
 */
export function transliterate(text) {
  if (!text || typeof text !== 'string') return '';

  // Convert to lowercase and remove HTML tags
  let result = text.toLowerCase().replace(/<[^>]*>/g, '');

  // Replace newlines and spaces with underscores
  result = result.replace(/[\n\r\s]+/g, '_');

  // Apply transliteration
  let transliterated = '';
  for (const char of result) {
    if (TRANSLIT_MAP[char] !== undefined) {
      transliterated += TRANSLIT_MAP[char];
    } else {
      transliterated += char;
    }
  }

  // Remove illegal characters (keep only alphanumeric, hyphen, underscore)
  return transliterated.replace(/[^0-9a-z_-]/gi, '');
}

/**
 * Alias for transliterate (matches PHP function naming).
 */
export const abn_Translit = transliterate;

// ============================================================================
// Export default object with all functions
// ============================================================================

export default {
  // Date formatting
  dateToRussianString,
  abn_DATE2STR,

  // Number to words
  numberToRussianWords,
  abn_NUM2STR,

  // Currency to words
  rublesToRussianWords,
  abn_RUB2STR,

  // Transliteration
  transliterate,
  abn_Translit,

  // Helper
  getPluralForm,
};
