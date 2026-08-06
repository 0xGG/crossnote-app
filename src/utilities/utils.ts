import moment from "moment";

export function waitForTimeout(timeout: number): Promise<void> {
  return new Promise((resolve, reject) => {
    return setTimeout(() => {
      return resolve();
    }, timeout);
  });
}

export const UUIDNil = "00000000-0000-0000-0000-000000000000";

export const OneDay = 1000 * 60 * 60 * 24;

export function formatDate(dateString: string) {
  if (!dateString) return "";
  const date = new Date(dateString);
  const diff = Date.now() - date.getTime();
  const passedTime = Math.abs(diff);

  if (passedTime <= 1000 * 60 * 60 * 24) {
    // within 24h
    if (passedTime <= 1000 * 60 * 60) {
      // within 1 hour
      return (
        (diff < 0 ? "future " : "") + Math.ceil(passedTime / (1000 * 60)) + "m"
      );
    } else {
      return (
        (diff < 0 ? "future " : "") +
        Math.floor(passedTime / (1000 * 60 * 60)) +
        "h"
      );
    }
  } else {
    const monthNamesShort = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    return (
      monthNamesShort[date.getMonth()] +
      " " +
      date.getDate() +
      " " +
      date.getFullYear()
    );
  }
}

// https://stackoverflow.com/questions/400212/how-do-i-copy-to-the-clipboard-in-javascript
export function copyToClipboard(text: string) {
  if ("clipboardData" in window && (window as any).clipboardData.setData) {
    // Internet Explorer-specific code path to prevent textarea being shown while dialog is visible.
    return (window as any).setData("Text", text);
  } else if (
    document.queryCommandSupported &&
    document.queryCommandSupported("copy")
  ) {
    var textarea = document.createElement("textarea");
    textarea.textContent = text;
    textarea.style.position = "fixed"; // Prevent scrolling to bottom of page in Microsoft Edge.
    document.body.appendChild(textarea);
    textarea.select();
    try {
      return document.execCommand("copy"); // Security exception may be thrown by some browsers.
    } catch (ex) {
      console.warn("Copy to clipboard failed.", ex);
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }
}

export function generateUUID() {
  // Public Domain/MIT
  var d = new Date().getTime(); //Timestamp
  var d2 = (performance && performance.now && performance.now() * 1000) || 0; //Time in microseconds since page-load or 0 if unsupported
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = Math.random() * 16; //random number between 0 and 16
    if (d > 0) {
      //Use timestamp until depleted
      r = ((d + r) % 16) | 0;
      d = Math.floor(d / 16);
    } else {
      //Use microseconds since page-load if supported
      r = ((d2 + r) % 16) | 0;
      d2 = Math.floor(d2 / 16);
    }
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export class RandomColorGenerator {
  private cache: { [key: string]: string } = {};
  private hashCode(s: string): number {
    let n = s.split("").reduce(function (a, b) {
      a = (a << 5) - a + b.charCodeAt(0);
      return a & a;
    }, 0);
    n = Math.abs(n);
    const x = "0." + n.toString();
    return parseFloat(x);
  }
  public generateColor(key: string): string {
    if (key in this.cache) {
      return this.cache[key];
    } else {
      const color =
        "#" +
        (((1 << 24) * /* Math.random() */ this.hashCode(key)) | 0).toString(16);
      this.cache[key] = color;
      return color;
    }
  }
}

export const randomColorGenerator = new RandomColorGenerator();

export function randomID() {
  return Math.random().toString(36).substr(2, 9);
}

export function getTodayName() {
  let today = moment().format("YYYY-MM-DD");
  const momentFormat = localStorage.getItem("settings/moment-format");
  if (momentFormat) {
    try {
      today = moment().format(momentFormat);
    } catch (error) {
      today = moment().format("YYYY-MM-DD");
    }
  }
  return today;
}
