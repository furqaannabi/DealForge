const memoryStorage = new Map<string, string>();

const asyncStorage = {
  async getItem(key: string) {
    return memoryStorage.get(key) ?? null;
  },
  async setItem(key: string, value: string) {
    memoryStorage.set(key, value);
  },
  async removeItem(key: string) {
    memoryStorage.delete(key);
  },
  async clear() {
    memoryStorage.clear();
  },
  async getAllKeys() {
    return Array.from(memoryStorage.keys());
  },
  async multiGet(keys: string[]) {
    return keys.map((key) => [key, memoryStorage.get(key) ?? null] as const);
  },
  async multiSet(entries: Array<readonly [string, string]>) {
    entries.forEach(([key, value]) => memoryStorage.set(key, value));
  },
  async multiRemove(keys: string[]) {
    keys.forEach((key) => memoryStorage.delete(key));
  },
};

export default asyncStorage;
