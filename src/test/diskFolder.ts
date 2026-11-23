// An in-memory directory with the File System Access behavior our disk tests use.
export class Folder {
  readonly kind = "directory";

  constructor(
    readonly entries = new Map<string, Folder | string>(),
    private readonly caseSensitive = true,
  ) {}

  private entryName(name: string) {
    if (this.caseSensitive || this.entries.has(name)) return name;
    const folded = name.toUpperCase();
    return (
      [...this.entries.keys()].find((key) => key.toUpperCase() === folded) ??
      name
    );
  }

  async isSameEntry(other: Folder) {
    return this.entries === other.entries;
  }

  async resolve(other: Folder): Promise<string[] | null> {
    if (await this.isSameEntry(other)) return [];
    for (const [name, entry] of this.entries) {
      if (entry instanceof Folder) {
        const relative = await entry.resolve(other);
        if (relative) return [name, ...relative];
      }
    }
    return null;
  }

  async *values() {
    for (const name of this.entries.keys()) yield { name };
  }

  async queryPermission() {
    return "granted";
  }

  async requestPermission() {
    return "denied";
  }

  async getDirectoryHandle(name: string, { create = false } = {}) {
    name = this.entryName(name);
    const entry = this.entries.get(name);
    if (typeof entry === "string") {
      throw new DOMException("A file is in the way.", "TypeMismatchError");
    }
    if (entry) {
      return entry;
    }
    if (!create) {
      throw new DOMException("Not there.", "NotFoundError");
    }
    const folder = new Folder(undefined, this.caseSensitive);
    this.entries.set(name, folder);
    return folder;
  }

  async getFileHandle(name: string, { create = false } = {}) {
    name = this.entryName(name);
    const entry = this.entries.get(name);
    if (entry instanceof Folder) {
      throw new DOMException("A folder is in the way.", "TypeMismatchError");
    }
    if (entry === undefined && !create) {
      throw new DOMException("Not there.", "NotFoundError");
    }
    if (entry === undefined) {
      this.entries.set(name, "");
    }
    return {
      getFile: async () => ({
        lastModified: Date.now(),
        text: async () => this.entries.get(name) as string,
      }),
      createWritable: async () => {
        let written = "";
        return {
          write: async (data: string) => {
            written += data;
          },
          close: async () => {
            this.entries.set(name, written);
          },
        };
      },
    };
  }
}
