import { uslug } from "@0xgg/echomd/preview/heading-id-generator";
import MiniSearch, { SearchOptions, SearchResult } from "minisearch";

export interface SearchDoc {
  id: string;
  title: string;
  filePath: string;
  aliases: string[];
}

export default class Search {
  public miniSearch: MiniSearch<SearchDoc>;

  /**
   * filePath -> SearchDoc
   */
  private _cache: { [key: string]: SearchDoc };
  constructor() {
    this.miniSearch = new MiniSearch<SearchDoc>({
      fields: ["title", "aliases", "filePath"],
      storeFields: ["title", "aliases", "filePath"],
      extractField: (document, fieldName) => {
        if (fieldName === "aliases") {
          return document["aliases"].join("|");
        } else {
          return (document as any)[fieldName];
        }
      },
      tokenize: (string) => {
        return uslug(string, " ").match(/([^\x00-\x7F]|\w+)/g) || [];
      },
    });
    this._cache = {};
  }

  add(filePath: string, title: string, aliases: string[]) {
    if (!(filePath in this._cache)) {
      const searchDoc = {
        id: filePath + "#" + title,
        filePath,
        title,
        aliases,
      };
      this.miniSearch.add(searchDoc);
      this._cache[filePath] = searchDoc;
    } else {
      return;
    }
  }

  remove(filePath: string) {
    if (filePath in this._cache) {
      const doc = this._cache[filePath];
      if (doc) {
        this.miniSearch.remove(doc);
      }
      delete this._cache[filePath];
    }
  }

  search(queryString: string, options?: SearchOptions): SearchResult[] {
    return this.miniSearch.search(queryString, options);
  }

  addAlias(filePath: string, alias: string) {
    const searchDoc = this._cache[filePath];
    if (!searchDoc) {
      return;
    }
    this.remove(filePath);
    this.add(filePath, searchDoc.title, searchDoc.aliases.concat(alias));
  }

  deleteAlias(filePath: string, alias: string) {
    const searchDoc = this._cache[filePath];
    if (!searchDoc) {
      return;
    }
    this.remove(filePath);
    this.add(
      filePath,
      searchDoc.title,
      searchDoc.aliases.filter((a) => a !== alias),
    );
  }
}
