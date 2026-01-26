﻿import { importTriviaItems, TriviaDatasetItem } from './dbManager.js';
import { timeLog } from '../utils.js';
import * as path from 'node:path';
import { readFileSync } from 'node:fs';
import { parse } from 'csv-parse/sync';
import he from 'he';

function decodeHtml(input: unknown): string {
  return he.decode(String(input ?? '').trim());
}

export function importTriviaFromCsv(datasetPath = path.join(process.cwd(), 'data', 'trivia.csv')) {
  const resolved = path.resolve(datasetPath);
  const raw = readFileSync(resolved, 'utf8');
  const records = parse(raw, { columns: true, skip_empty_lines: true }) as Record<string, string>[];

  const items: TriviaDatasetItem[] = records.map((row) => {
    const incorrectRaw = row.incorrect_answers ? String(row.incorrect_answers).split('|') : [];
    const choices = [decodeHtml(row.correct_answer), ...incorrectRaw.map(decodeHtml)].filter((c) => c.length > 0);

    return {
      category: decodeHtml(row.category),
      question: decodeHtml(row.question),
      answer: decodeHtml(row.correct_answer),
      aliases: undefined,
      choices,
      difficulty: row.difficulty ? decodeHtml(row.difficulty) : null,
      source: row.type ? decodeHtml(row.type) : null
    };
  });

  const count = importTriviaItems(items);
  timeLog(`Imported ${count} trivia questions from ${resolved}`);
  return count;
}
