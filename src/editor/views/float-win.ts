export class FloatWin {
  private el: HTMLElement;
  public closeBtn: HTMLElement;
  public visible: boolean;

  constructor(win: HTMLElement) {
    if (!win) {
      return;
    }

    /** @type {HTMLDivElement} */
    const titlebar = win.querySelector(".float-win-title") as HTMLElement;
    titlebar.addEventListener(
      "selectstart",
      function () {
        return false;
      },
      false,
    );

    /** @type {HTMLButtonElement} */
    const closeBtn = win.querySelector(".float-win-close") as HTMLElement;
    if (closeBtn) {
      closeBtn.addEventListener(
        "click",
        () => {
          this.hide();
        },
        false,
      );
      win.addEventListener(
        "keyup",
        (ev) => {
          if (ev.keyCode === 27) this.hide(); // ESC
        },
        false,
      );
    }

    let boxX: number,
      boxY: number,
      mouseX: number,
      mouseY: number,
      offsetX: number,
      offsetY: number;

    titlebar.addEventListener(
      "mousedown",
      function (e) {
        if (e.target === closeBtn) return;

        boxX = win.offsetLeft;
        boxY = win.offsetTop;
        mouseX = getMouseXY(e).x;
        mouseY = getMouseXY(e).y;
        offsetX = mouseX - boxX;
        offsetY = mouseY - boxY;

        document.addEventListener("mousemove", move, false);
        document.addEventListener("mouseup", up, false);
      },
      false,
    );

    function move(e: any) {
      var x = getMouseXY(e).x - offsetX;
      var y = getMouseXY(e).y - offsetY;
      var width = document.documentElement.clientWidth - titlebar.offsetWidth;
      var height =
        document.documentElement.clientHeight - titlebar.offsetHeight;

      x = Math.min(Math.max(0, x), width);
      y = Math.min(Math.max(0, y), height);

      win.style.left = x + "px";
      win.style.top = y + "px";
    }

    function up(e: any) {
      document.removeEventListener("mousemove", move, false);
      document.removeEventListener("mouseup", up, false);
    }

    function getMouseXY(e: any) {
      var x = 0,
        y = 0;
      e = e || window.event;
      if (e.pageX) {
        x = e.pageX;
        y = e.pageY;
      } else {
        x = e.clientX + document.body.scrollLeft - document.body.clientLeft;
        y = e.clientY + document.body.scrollTop - document.body.clientTop;
      }
      return {
        x: x,
        y: y,
      };
    }

    this.el = win;
    this.closeBtn = closeBtn;
    this.visible = !/float-win-hidden/.test(win.className);
  }

  public show(moveToCenter?: boolean) {
    if (this.visible) return;
    var el = this.el;

    this.visible = true;
    el.className = this.el.className.replace(/\s*(float-win-hidden\s*)+/g, " ");
    el.style.display = "block";

    if (moveToCenter) {
      setTimeout(() => {
        this.moveTo(
          (window.innerWidth - el.offsetWidth) / 2,
          (window.innerHeight - el.offsetHeight) / 2,
        );
      }, 0);
    }
  }

  public hide() {
    if (!this.visible) return;
    this.visible = false;
    this.el.className += " float-win-hidden";
    this.el.style.display = "none";
  }

  public moveTo(x: number, y: number) {
    var s = this.el.style;
    s.left = x + "px";
    s.top = y + "px";
  }
}
