import * as fs from "fs";
import * as path from "path";

/** Типы элементов для поиска в библиотеке (совпадают с промптами для LLM). */
export const ELEMENT_TYPES = [
  "window",
  "door",
  "tree",
  "lamp",
  "sign",
  "character",
  "prop",
  "other",
] as const;

export type ElementType = (typeof ELEMENT_TYPES)[number];

export interface LibraryEntry {
  id: string;
  type: ElementType;
  description: string;
  width: number;
  height: number;
  style: "pixelart" | "detailed";
  createdAt: string;
  tags?: string[];
}

const LIBRARY_DIR = path.join(process.cwd(), "library");
const ELEMENTS_DIR = path.join(LIBRARY_DIR, "elements");
const INDEX_PATH = path.join(LIBRARY_DIR, "index.json");

function ensureLibraryDirs(): void {
  if (!fs.existsSync(LIBRARY_DIR)) {
    fs.mkdirSync(LIBRARY_DIR, { recursive: true });
  }
  if (!fs.existsSync(ELEMENTS_DIR)) {
    fs.mkdirSync(ELEMENTS_DIR, { recursive: true });
  }
  if (!fs.existsSync(INDEX_PATH)) {
    fs.writeFileSync(INDEX_PATH, "[]", "utf-8");
  }
}

function readIndex(): LibraryEntry[] {
  ensureLibraryDirs();
  if (!fs.existsSync(INDEX_PATH)) {
    return [];
  }
  const raw = fs.readFileSync(INDEX_PATH, "utf-8");
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeIndex(entries: LibraryEntry[]): void {
  ensureLibraryDirs();
  fs.writeFileSync(INDEX_PATH, JSON.stringify(entries, null, 2), "utf-8");
}

/**
 * Загружает библиотеку: читает index.json и возвращает только записи, у которых есть файл SVG.
 */
export async function loadLibrary(): Promise<LibraryEntry[]> {
  const entries = readIndex();
  const existing: LibraryEntry[] = [];
  for (const e of entries) {
    const svgPath = path.join(ELEMENTS_DIR, `${e.id}.svg`);
    if (fs.existsSync(svgPath)) {
      existing.push(e);
    }
  }
  return existing;
}

/**
 * Сохраняет элемент в библиотеку: запись в index и SVG в library/elements/{id}.svg.
 */
export async function saveLibraryEntry(
  entry: LibraryEntry,
  svgContent: string,
): Promise<void> {
  ensureLibraryDirs();
  const entries = readIndex();
  const idx = entries.findIndex((e) => e.id === entry.id);
  if (idx >= 0) {
    entries[idx] = entry;
  } else {
    entries.push(entry);
  }
  writeIndex(entries);
  const svgPath = path.join(ELEMENTS_DIR, `${entry.id}.svg`);
  await fs.promises.writeFile(svgPath, svgContent, "utf-8");
}

/**
 * Ищет элементы по типу и опционально по стилю.
 */
export function findByType(
  type: string,
  style?: string,
  entries?: LibraryEntry[],
): LibraryEntry[] {
  const list = entries ?? readIndex();
  let out = list.filter((e) => e.type === type);
  if (style) {
    out = out.filter((e) => e.style === style);
  }
  return out;
}

/**
 * Читает содержимое SVG элемента по id.
 */
export async function getElementSvg(id: string): Promise<string> {
  const svgPath = path.join(ELEMENTS_DIR, `${id}.svg`);
  const content = await fs.promises.readFile(svgPath, "utf-8");
  return content;
}

/**
 * Генерирует уникальный id для нового элемента (type_timestamp).
 */
export function generateElementId(type: ElementType): string {
  const safe = type.replace(/\s+/g, "_");
  return `${safe}_${Date.now()}`;
}
