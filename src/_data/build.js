export default function () {
  return { year: new Date().getFullYear(), time: new Date().toISOString() };
}
