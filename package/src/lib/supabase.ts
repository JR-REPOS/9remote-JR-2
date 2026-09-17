import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const isConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl.startsWith("http")
);

// Fallback in-memory & localStorage mock for chat messages when Supabase is not configured
interface MockRecord {
  id: string;
  [key: string]: any;
}

const STORAGE_KEY = "9remote_chat_messages";

function getStoredMessages(): MockRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveStoredMessages(messages: MockRecord[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-500)));
  } catch {}
}

class MockQueryBuilder {
  private tableName: string;
  private filters: Array<(row: MockRecord) => boolean> = [];
  private limitCount?: number;
  private sortFn?: (a: MockRecord, b: MockRecord) => number;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select(_cols = "*") {
    return this;
  }

  eq(column: string, value: any) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }) {
    const ascending = opts?.ascending !== false;
    this.sortFn = (a, b) => {
      const valA = a[column];
      const valB = b[column];
      if (valA < valB) return ascending ? -1 : 1;
      if (valA > valB) return ascending ? 1 : -1;
      return 0;
    };
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  async then(resolve: (val: { data: MockRecord[] | null; error: any }) => void) {
    let rows = getStoredMessages();
    for (const filter of this.filters) {
      rows = rows.filter(filter);
    }
    if (this.sortFn) {
      rows.sort(this.sortFn);
    }
    if (this.limitCount !== undefined) {
      rows = rows.slice(0, this.limitCount);
    }
    resolve({ data: rows, error: null });
  }

  async insert(entry: any) {
    const rows = getStoredMessages();
    const newItems = Array.isArray(entry) ? entry : [entry];
    const created = newItems.map((item) => ({
      id: item.id || crypto.randomUUID(),
      created_at: item.created_at || new Date().toISOString(),
      ...item,
    }));
    rows.push(...created);
    saveStoredMessages(rows);
    return { data: created, error: null };
  }

  update(values: any) {
    return {
      eq: async (column: string, value: any) => {
        const rows = getStoredMessages();
        const updated = rows.map((row) => {
          if (row[column] === value) {
            return { ...row, ...values };
          }
          return row;
        });
        saveStoredMessages(updated);
        return { data: updated.filter((r) => r[column] === value), error: null };
      },
    };
  }

  delete() {
    return {
      eq: async (column: string, value: any) => {
        let rows = getStoredMessages();
        rows = rows.filter((row) => row[column] !== value);
        saveStoredMessages(rows);
        return { data: null, error: null };
      },
    };
  }
}

const mockSupabase = {
  from(tableName: string) {
    return new MockQueryBuilder(tableName);
  },
};

export const supabase = isConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : (mockSupabase as unknown as ReturnType<typeof createClient>);
