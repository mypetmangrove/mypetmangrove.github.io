// Each lesson file becomes a page at /teacher-resources/<file-name>/.
export default {
  layout: "layouts/lesson.njk",
  permalink: (data) =>
    data.published === false ? false : `/teacher-resources/${data.page.fileSlug}/`,
};
