import MiniSearch, { SearchOptions, SearchResult } from "minisearch";

export interface SearchDoc {
  id: string;
  title: string;
  filePath: string;
}

export default class Search {
  public miniSearch: MiniSearch<SearchDoc>;

  /**
   * filePath -> title -> SearchDoc
   */
  private _cache: { [key: string]: { [key: string]: SearchDoc } };
  constructor() {
    this.miniSearch = new MiniSearch<SearchDoc>({
      fields: ["title", "filePath"],
      storeFields: ["title", "filePath"],
      tokenize: (string) => {
        return (
          string
            .replace(/[!@#$%^&*()[\]{},.?/\\=+\-_，。=（）【】]/g, " ")
            .match(/([^\x00-\x7F]|\w+)/g) || []
        );
      },
    });
    this._cache = {};
  }

  add(filePath: string, title: string) {
    if (!(filePath in this._cache)) {
      this._cache[filePath] = {};
    }
    if (title in this._cache[filePath]) {
      return;
    }

    const searchDoc = {
      id: filePath + "#" + title,
      filePath,
      title,
    };
    this.miniSearch.add(searchDoc);
    this._cache[filePath][title] = searchDoc;
  }

  remove(filePath: string, title: string) {
    if (filePath in this._cache) {
      const c = this._cache[filePath];
      const doc = c[title];
      if (doc) {
        this.miniSearch.remove(doc);
      }
      delete c[title];
    }
  }

  removeAll(filePath: string) {
    if (filePath in this._cache) {
      const docs: SearchDoc[] = [];
      const c = this._cache[filePath];
      for (const title in c) {
        const doc = c[title];
        if (doc) {
          docs.push(doc);
        }
        delete c[title];
      }
      this.miniSearch.removeAll(docs);
    }
  }

  search(queryString: string, options?: SearchOptions): SearchResult[] {
    return this.miniSearch.search(queryString, options);
  }
}
