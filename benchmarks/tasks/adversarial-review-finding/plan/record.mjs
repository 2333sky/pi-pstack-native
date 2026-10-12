export async function apply({ write, findings }) {
  write("review/findings.json", `${JSON.stringify(findings(), null, 2)}\n`);
}
