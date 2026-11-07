// Completion/error announcements must not interrupt a user who has already
// returned to editing while an asynchronous response or frame was pending.
export function focusAfterAction(
  target: () => HTMLElement | null,
  origin: Element | null,
) {
  let interacted = false;
  const track = () => {
    interacted = true;
  };
  const events = ["beforeinput", "keydown", "pointerdown"] as const;
  for (const event of events) document.addEventListener(event, track, true);
  requestAnimationFrame(() => {
    for (const event of events)
      document.removeEventListener(event, track, true);
    if (interacted) return;
    const active = document.activeElement;
    if (active === origin || active === document.body) target()?.focus();
  });
}
