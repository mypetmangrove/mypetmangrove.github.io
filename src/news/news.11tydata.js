export default {
  layout: "layouts/post.njk",
  permalink: (data) => (data.published === false ? false : `/news/${data.page.fileSlug}/`),
};
