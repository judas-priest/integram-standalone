/**
 * @integram/common - Russian Locale Functions Tests
 *
 * Tests for Russian language formatting utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  dateToRussianString,
  abn_DATE2STR,
  numberToRussianWords,
  abn_NUM2STR,
  rublesToRussianWords,
  abn_RUB2STR,
  transliterate,
  abn_Translit,
} from '../utils/russian-locale.js';

// ============================================================================
// Date Formatting Tests
// ============================================================================

describe('dateToRussianString / abn_DATE2STR', () => {
  it('should format YYYYMMDD string to Russian date', () => {
    expect(dateToRussianString('20250125')).toBe('25 января 2025 г.');
    expect(dateToRussianString('20240315')).toBe('15 марта 2024 г.');
    expect(dateToRussianString('20231207')).toBe('7 декабря 2023 г.');
  });

  it('should format Date object to Russian date', () => {
    const date = new Date(2025, 0, 25); // January 25, 2025
    expect(dateToRussianString(date)).toBe('25 января 2025 г.');
  });

  it('should handle all months correctly', () => {
    expect(dateToRussianString('20250101')).toBe('1 января 2025 г.');
    expect(dateToRussianString('20250201')).toBe('1 февраля 2025 г.');
    expect(dateToRussianString('20250301')).toBe('1 марта 2025 г.');
    expect(dateToRussianString('20250401')).toBe('1 апреля 2025 г.');
    expect(dateToRussianString('20250501')).toBe('1 мая 2025 г.');
    expect(dateToRussianString('20250601')).toBe('1 июня 2025 г.');
    expect(dateToRussianString('20250701')).toBe('1 июля 2025 г.');
    expect(dateToRussianString('20250801')).toBe('1 августа 2025 г.');
    expect(dateToRussianString('20250901')).toBe('1 сентября 2025 г.');
    expect(dateToRussianString('20251001')).toBe('1 октября 2025 г.');
    expect(dateToRussianString('20251101')).toBe('1 ноября 2025 г.');
    expect(dateToRussianString('20251201')).toBe('1 декабря 2025 г.');
  });

  it('should return original string for invalid format', () => {
    expect(dateToRussianString('invalid')).toBe('invalid');
    expect(dateToRussianString('2025')).toBe('2025');
  });

  it('should be aliased as abn_DATE2STR', () => {
    expect(abn_DATE2STR).toBe(dateToRussianString);
  });
});

// ============================================================================
// Number to Words Tests
// ============================================================================

describe('numberToRussianWords / abn_NUM2STR', () => {
  it('should convert single digit numbers', () => {
    expect(numberToRussianWords(0)).toBe('Ноль');
    expect(numberToRussianWords(1)).toBe('Один');
    expect(numberToRussianWords(5)).toBe('Пять');
    expect(numberToRussianWords(9)).toBe('Девять');
  });

  it('should convert teens correctly', () => {
    expect(numberToRussianWords(11)).toBe('Одиннадцать');
    expect(numberToRussianWords(15)).toBe('Пятнадцать');
    expect(numberToRussianWords(19)).toBe('Девятнадцать');
  });

  it('should convert tens correctly', () => {
    expect(numberToRussianWords(20)).toBe('Двадцать');
    expect(numberToRussianWords(25)).toBe('Двадцать пять');
    expect(numberToRussianWords(50)).toBe('Пятьдесят');
    expect(numberToRussianWords(99)).toBe('Девяносто девять');
  });

  it('should convert hundreds correctly', () => {
    expect(numberToRussianWords(100)).toBe('Сто');
    expect(numberToRussianWords(200)).toBe('Двести');
    expect(numberToRussianWords(500)).toBe('Пятьсот');
    expect(numberToRussianWords(999)).toBe('Девятьсот девяносто девять');
  });

  it('should convert thousands with feminine forms', () => {
    expect(numberToRussianWords(1000)).toBe('Одна тысяча');
    expect(numberToRussianWords(2000)).toBe('Две тысячи');
    expect(numberToRussianWords(5000)).toBe('Пять тысяч');
    expect(numberToRussianWords(21000)).toBe('Двадцать одна тысяча');
  });

  it('should convert millions correctly', () => {
    expect(numberToRussianWords(1000000)).toBe('Один миллион');
    expect(numberToRussianWords(2000000)).toBe('Два миллиона');
    expect(numberToRussianWords(5000000)).toBe('Пять миллионов');
  });

  it('should convert billions correctly', () => {
    expect(numberToRussianWords(1000000000)).toBe('Один миллиард');
    expect(numberToRussianWords(2000000000)).toBe('Два миллиарда');
  });

  it('should convert complex numbers correctly', () => {
    expect(numberToRussianWords(1234)).toBe('Одна тысяча двести тридцать четыре');
    expect(numberToRussianWords(12345)).toBe('Двенадцать тысяч триста сорок пять');
  });

  it('should be aliased as abn_NUM2STR', () => {
    expect(abn_NUM2STR).toBe(numberToRussianWords);
  });
});

// ============================================================================
// Rubles to Words Tests
// ============================================================================

describe('rublesToRussianWords / abn_RUB2STR', () => {
  it('should convert rubles with correct plural forms', () => {
    expect(rublesToRussianWords(1)).toBe('Один рубль 00 копеек');
    expect(rublesToRussianWords(2)).toBe('Два рубля 00 копеек');
    expect(rublesToRussianWords(5)).toBe('Пять рублей 00 копеек');
    expect(rublesToRussianWords(21)).toBe('Двадцать один рубль 00 копеек');
    expect(rublesToRussianWords(22)).toBe('Двадцать два рубля 00 копеек');
  });

  it('should handle kopeks correctly', () => {
    expect(rublesToRussianWords(1.50)).toBe('Один рубль 50 копеек');
    expect(rublesToRussianWords(0.01)).toBe('Ноль рублей 1 копейка');
    expect(rublesToRussianWords(0.02)).toBe('Ноль рублей 2 копейки');
    expect(rublesToRussianWords(0.05)).toBe('Ноль рублей 5 копеек');
  });

  it('should handle thousands of rubles', () => {
    expect(rublesToRussianWords(1000)).toBe('Одна тысяча рублей 00 копеек');
    expect(rublesToRussianWords(2000)).toBe('Две тысячи рублей 00 копеек');
    expect(rublesToRussianWords(5000)).toBe('Пять тысяч рублей 00 копеек');
  });

  it('should handle millions of rubles', () => {
    expect(rublesToRussianWords(1000000)).toBe('Один миллион рублей 00 копеек');
  });

  it('should handle complex amounts', () => {
    expect(rublesToRussianWords(1234.56)).toBe('Одна тысяча двести тридцать четыре рубля 56 копеек');
  });

  it('should be aliased as abn_RUB2STR', () => {
    expect(abn_RUB2STR).toBe(rublesToRussianWords);
  });
});

// ============================================================================
// Transliteration Tests
// ============================================================================

describe('transliterate / abn_Translit', () => {
  it('should transliterate Russian to Latin', () => {
    expect(transliterate('Привет')).toBe('privet');
    expect(transliterate('Москва')).toBe('moskva');
    expect(transliterate('Тест')).toBe('test');
  });

  it('should handle special characters', () => {
    expect(transliterate('Щука')).toBe('shuka');
    expect(transliterate('Чай')).toBe('chay');
    expect(transliterate('Юла')).toBe('yula');
    expect(transliterate('Яблоко')).toBe('yabloko');
  });

  it('should remove soft and hard signs', () => {
    expect(transliterate('Объект')).toBe('obekt');
    expect(transliterate('Мальчик')).toBe('malchik');
  });

  it('should replace spaces with underscores', () => {
    expect(transliterate('Привет мир')).toBe('privet_mir');
  });

  it('should remove illegal characters', () => {
    expect(transliterate('Тест!@#$%')).toBe('test');
  });

  it('should handle HTML tags', () => {
    expect(transliterate('<b>Тест</b>')).toBe('test');
  });

  it('should handle empty input', () => {
    expect(transliterate('')).toBe('');
    expect(transliterate(null)).toBe('');
    expect(transliterate(undefined)).toBe('');
  });

  it('should preserve numbers', () => {
    expect(transliterate('Тест123')).toBe('test123');
  });

  it('should be aliased as abn_Translit', () => {
    expect(abn_Translit).toBe(transliterate);
  });
});
