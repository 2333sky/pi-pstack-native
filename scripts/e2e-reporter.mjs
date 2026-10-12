/**
 * Emits one JSON line per top level test result to the file named by E2E_EVENTS, so the caller can
 * bind each result to the file that actually ran it instead of inferring ownership from source text.
 */
export default async function* reporter(source) {
  const { appendFileSync } = await import('node:fs');
  const target = process.env.E2E_EVENTS;
  for await (const event of source) {
    if (event.type !== 'test:pass' && event.type !== 'test:fail') continue;
    const data = event.data ?? {};
    if (data.nesting !== 0 || !data.file) continue;
    if (data.name === data.file || data.name === data.file.split('/').pop()) continue;
    if (target) {
      appendFileSync(target, `${JSON.stringify({ status: event.type === 'test:pass' ? 'pass' : 'fail', name: data.name, file: data.file, todo: Boolean(data.todo), skip: Boolean(data.skip) })}\n`);
    }
  }
}
