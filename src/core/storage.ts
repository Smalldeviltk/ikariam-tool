/**
 * Typed localStorage access.
 *
 * The original scripts used two incompatible key schemes side by side, which
 * is easy to mix up:
 *
 *  - Send Resources: `getVar(name, def, isGlobal)` — key is `accountName + name`
 *    when `isGlobal` is falsy, and the bare `name` when it is true.
 *  - Empire Overview: `empire.getVar(name)` — key is `"***" + accountName + "***" + name`.
 *
 * Both are preserved so existing users do not lose stored data. Only unify the
 * schemes together with a migration.
 */

export interface Store {
  get(key: string): string | null;
  get(key: string, fallback: string): string;
  set(key: string, value: string): void;
  remove(key: string): void;
  getJSON<T>(key: string, fallback: T): T;
  setJSON(key: string, value: unknown): void;
}

function makeStore(prefix: string): Store {
  const fullKey = (key: string) => prefix + key;

  function get(key: string): string | null;
  function get(key: string, fallback: string): string;
  function get(key: string, fallback?: string): string | null {
    const raw = localStorage.getItem(fullKey(key));
    if (raw === null && fallback !== undefined) return fallback;
    return raw;
  }

  return {
    get,
    set(key, value) {
      localStorage.setItem(fullKey(key), value);
    },
    remove(key) {
      localStorage.removeItem(fullKey(key));
    },
    getJSON<T>(key: string, fallback: T): T {
      const raw = localStorage.getItem(fullKey(key));
      if (raw === null) return fallback;
      try {
        return JSON.parse(raw) as T;
      } catch {
        // The old code let a malformed payload throw; the outer try/catch
        // swallowed it and reloaded the page. Returning the fallback is far
        // easier to diagnose.
        console.warn(`[ika] Corrupt JSON at "${fullKey(key)}", using default`);
        return fallback;
      }
    },
    setJSON(key, value) {
      localStorage.setItem(fullKey(key), JSON.stringify(value));
    },
  };
}

/** Unprefixed store, shared by every account on the same server. */
export const globalStore: Store = makeStore("");

/**
 * Per-account store using the Send Resources scheme (`accountName + key`).
 * The account name comes from `.avatarName > a.noViewParameters`.
 */
export function accountStore(accountName: string): Store {
  return makeStore(accountName);
}

/**
 * Per-account store using the Empire Overview scheme: `***<accountName>***<key>`.
 * The original built this prefix with `["", accountName, ""].join("***")`.
 */
export function empireStore(accountName: string): Store {
  return makeStore(["", accountName, ""].join("***"));
}
