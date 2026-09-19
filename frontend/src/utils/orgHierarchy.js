// Client-side mirror of taskController's canAssign hierarchy check — used
// only to decide what to show (a button, a dropdown option); the backend
// is what actually enforces it. `employees` is the /lookups/employees
// list, each with an `id` and `reporting_to`.

// True if `ancestorId` is anywhere above `targetId` in the reporting
// chain (direct manager, their manager, and so on) — not just directly
// above them.
export function isAncestor(employees, ancestorId, targetId) {
  const byId = new Map(employees.map((e) => [String(e.id), e]));
  let current = byId.get(String(targetId));
  const seen = new Set();
  while (current && current.reporting_to != null) {
    if (seen.has(current.id)) return false; // guard against a reporting_to cycle
    seen.add(current.id);
    if (String(current.reporting_to) === String(ancestorId)) return true;
    current = byId.get(String(current.reporting_to));
  }
  return false;
}

// Every employee below `managerId` in the chain, at any depth.
export function getDescendantIds(employees, managerId) {
  const result = new Set();
  let frontier = [String(managerId)];
  while (frontier.length > 0) {
    const next = [];
    for (const id of frontier) {
      for (const e of employees) {
        if (String(e.reporting_to) === id && !result.has(e.id)) {
          result.add(e.id);
          next.push(String(e.id));
        }
      }
    }
    frontier = next;
  }
  return result;
}
