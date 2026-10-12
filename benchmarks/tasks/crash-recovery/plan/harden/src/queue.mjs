export const QUEUE = ["harden", "resume", "finish"];

export function pending(recorded, queue = QUEUE) {
  return queue.filter((id) => !recorded.includes(id));
}
