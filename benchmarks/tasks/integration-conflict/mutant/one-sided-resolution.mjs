export async function apply({ copy, git }) {
  git("merge", "--no-edit", "feature/bulk");
  const merged = git("merge", "--no-edit", "feature/loyalty");
  if (merged.status === 0) throw new Error("fixture expected a merge conflict from feature/loyalty");
  copy("mutant/one-sided-resolution");
}
