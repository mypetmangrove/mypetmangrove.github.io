// Each file in src/pages becomes a page at /<file-name>/ (home.md becomes the homepage).
export default {
  layout: "layouts/page.njk",
  permalink: (data) => {
    if (data.published === false) return false;
    if (data.slug) return data.slug === "/" ? "/" : `/${String(data.slug).replace(/^\/|\/$/g, "")}/`;
    return data.page.fileSlug === "home" ? "/" : `/${data.page.fileSlug}/`;
  },
};
