let counter = 0;
export function v4() {
  counter++;
  return `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`;
}
export const NIL = '00000000-0000-0000-0000-000000000000';
