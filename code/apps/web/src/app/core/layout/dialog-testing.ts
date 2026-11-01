/**
 * jsdom has no modal dialogs. One polyfill for every spec, as a browser behaves: `close()` fires
 * the `close` event. Specs share their globals per worker (`ng test` runs without isolation), so a
 * spec-local variant would decide for the others depending on the order the files run in. Only
 * imported by specs.
 */
export function polyfillDialog(): void {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
}
