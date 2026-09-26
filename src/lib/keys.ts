// Whether a keydown is an Enter that finishes what was typed, rather than one
// that confirms an input method's candidate or repeats while the key is held.
// Chromium marks the candidate's keydown as composing; Safari reports it with
// keyCode 229, the input method's key code, which MUI checks for the same
// reason.
export function isFinishingEnter(event: KeyboardEvent): boolean {
  return (
    event.key === "Enter" &&
    !event.isComposing &&
    event.keyCode !== 229 &&
    !event.repeat
  );
}
