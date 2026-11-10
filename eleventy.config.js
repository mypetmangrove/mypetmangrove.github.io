import markdownIt from "markdown-it";

const md = markdownIt({ html: true, linkify: true, typographer: true });

// Grade order used everywhere lessons and classes are sorted.
export const GRADES = ["Pre-K", "K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
export const GRADE_BANDS = [
  { id: "pre-k", label: "Pre-K", grades: ["Pre-K"] },
  { id: "k-2", label: "Grades K–2", grades: ["K", "1", "2"] },
  { id: "3-5", label: "Grades 3–5", grades: ["3", "4", "5"] },
  { id: "6-8", label: "Grades 6–8", grades: ["6", "7", "8"] },
  { id: "9-12", label: "Grades 9–12", grades: ["9", "10", "11", "12"] },
];

const gradeIndex = (g) => {
  const i = GRADES.indexOf(String(g).trim());
  return i === -1 ? 99 : i;
};

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  const d = new Date(String(value).length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(d.getTime()) ? null : d;
};

export default function (eleventyConfig) {
  eleventyConfig.setLibrary("md", md);

  // Files copied as-is.
  eleventyConfig.addPassthroughCopy("src/images");
  eleventyConfig.addPassthroughCopy("src/assets");
  eleventyConfig.addPassthroughCopy({ "src/files": "files" });
  eleventyConfig.addPassthroughCopy({
    "node_modules/@supabase/supabase-js/dist/umd/supabase.js": "assets/vendor/supabase.js",
  });

  // ---------- Filters ----------
  eleventyConfig.addFilter("md", (s) => (s ? md.render(String(s)) : ""));
  eleventyConfig.addFilter("mdInline", (s) => (s ? md.renderInline(String(s)) : ""));
  eleventyConfig.addFilter("json", (v) => JSON.stringify(v ?? null));
  eleventyConfig.addFilter("readableDate", (v) => {
    const d = toDate(v);
    return d ? d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";
  });
  eleventyConfig.addFilter("shortDate", (v) => {
    const d = toDate(v);
    return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
  });
  eleventyConfig.addFilter("isoDate", (v) => {
    const d = toDate(v);
    return d ? d.toISOString().slice(0, 10) : "";
  });
  eleventyConfig.addFilter("youtubeId", (v) => {
    if (!v) return "";
    const s = String(v).trim();
    const m = s.match(/(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/);
    return m ? m[1] : s;
  });
  eleventyConfig.addFilter("sortGrades", (list) =>
    [...(list || [])].map(String).sort((a, b) => gradeIndex(a) - gradeIndex(b)),
  );
  eleventyConfig.addFilter("gradeRange", (list) => {
    const g = [...(list || [])].map(String).sort((a, b) => gradeIndex(a) - gradeIndex(b));
    if (!g.length) return "All grades";
    if (g.length === 1) return g[0] === "Pre-K" || g[0] === "K" ? g[0] : `Grade ${g[0]}`;
    const first = g[0];
    const last = g[g.length - 1];
    const contiguous = gradeIndex(last) - gradeIndex(first) === g.length - 1;
    if (contiguous) return `${first === "Pre-K" || first === "K" ? first : "Grades " + first}–${last}`;
    return `Grades ${g.join(", ")}`;
  });
  // Lessons with no grades chosen count as "all grades".
  const bandIdsFor = (list) =>
    !list || !list.length
      ? GRADE_BANDS.map((b) => b.id)
      : GRADE_BANDS.filter((b) => list.some((g) => b.grades.includes(String(g)))).map((b) => b.id);
  eleventyConfig.addFilter("bandIds", bandIdsFor);
  eleventyConfig.addFilter("lessonsInBand", (lessons, bandId) =>
    (lessons || []).filter((l) => bandIdsFor(l.data.grades).includes(bandId)),
  );
  eleventyConfig.addFilter("absoluteUrl", (path, base) => {
    try {
      return new URL(path || "/", base).href;
    } catch {
      return path;
    }
  });
  eleventyConfig.addFilter("isExternal", (url) => /^https?:\/\//.test(String(url || "")));
  eleventyConfig.addFilter("upcoming", (events) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return (events || []).filter((e) => (toDate(e.data.date) || 0) >= today);
  });
  eleventyConfig.addFilter("past", (events) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return (events || []).filter((e) => (toDate(e.data.date) || 0) < today).reverse();
  });

  // ---------- Collections ----------
  const published = (item) => item.data.published !== false && item.data.draft !== true;

  eleventyConfig.addCollection("lessons", (api) =>
    api
      .getFilteredByGlob("src/lessons/*.md")
      .filter(published)
      .sort((a, b) => {
        const ga = Math.min(...(a.data.grades || ["99"]).map(gradeIndex));
        const gb = Math.min(...(b.data.grades || ["99"]).map(gradeIndex));
        return ga - gb || String(a.data.title).localeCompare(String(b.data.title));
      }),
  );
  eleventyConfig.addCollection("news", (api) =>
    api
      .getFilteredByGlob("src/news/*.md")
      .filter(published)
      .sort((a, b) => (toDate(b.data.date) || 0) - (toDate(a.data.date) || 0)),
  );
  eleventyConfig.addCollection("events", (api) =>
    api
      .getFilteredByGlob("src/events/*.md")
      .filter(published)
      .sort((a, b) => (toDate(a.data.date) || 0) - (toDate(b.data.date) || 0)),
  );
  eleventyConfig.addCollection("sitePages", (api) =>
    api.getFilteredByGlob("src/pages/*.md").filter(published),
  );

  eleventyConfig.addGlobalData("gradeList", GRADES);
  eleventyConfig.addGlobalData("gradeBands", GRADE_BANDS);

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    markdownTemplateEngine: false,
    htmlTemplateEngine: "njk",
    templateFormats: ["njk", "md", "html"],
  };
}
