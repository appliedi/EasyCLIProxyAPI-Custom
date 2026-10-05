export type StorageMode = 'portable' | 'user' | 'custom';
export type StorageOperation =
  | { kind: 'move'; mode: StorageMode; destination: string }
  | { kind: 'backup'; destination: string }
  | { kind: 'restore'; backup: string; destination: string };
export type DataStorageSettings = {
  mode: StorageMode;
  directory: string;
  userDirectory: string;
  applicationDirectory: string;
  locator: string;
  pending: StorageOperation | null;
  lastResult: string | null;
  lastError: string | null;
};
export type UsageStorageSettings = {
  maxDatabaseSizeMb: number;
  databaseSizeBytes: number;
  totalRecords: number;
  deletedRecords: number;
};
export function childDirectory(parent: string, name: string): string {
  return `${parent.replace(/[\\/]+$/, '')}${parent.includes('\\') ? '\\' : '/'}${name}`;
}
export function sameDirectory(left: string, right: string): boolean {
  const normalize = (path: string) => {
    const cleaned = path.replace(/^\\\\\?\\/, '').replace(/\\/g, '/').replace(/\/+$/, '');
    return /^[a-z]:/i.test(cleaned) || cleaned.startsWith('//') ? cleaned.toLowerCase() : cleaned;
  };
  return normalize(left) === normalize(right);
}
