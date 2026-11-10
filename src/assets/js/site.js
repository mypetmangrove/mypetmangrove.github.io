/* My Pet Mangrove: public site behavior */
(function () {
  "use strict";

  var cfg = window.MPM || {};
  var hasBackend = Boolean(cfg.supabaseUrl && cfg.supabaseKey);

  /* ---------- Talking to Supabase without the full library ---------- */
  function apiHeaders() {
    var h = { "Content-Type": "application/json", apikey: cfg.supabaseKey };
    // Legacy anon keys are JWTs and also go in the Authorization header.
    if (/^eyJ/.test(cfg.supabaseKey)) h.Authorization = "Bearer " + cfg.supabaseKey;
    return h;
  }
  function api(path, body, extraHeaders) {
    var headers = apiHeaders();
    if (extraHeaders) Object.keys(extraHeaders).forEach(function (k) { headers[k] = extraHeaders[k]; });
    return fetch(cfg.supabaseUrl.replace(/\/$/, "") + path, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body || {}),
    });
  }

  /* ---------- Navigation ---------- */
  var toggle = document.querySelector("[data-nav-toggle]");
  var nav = document.querySelector("[data-nav]");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") !== "true";
      toggle.setAttribute("aria-expanded", String(open));
      nav.classList.toggle("is-open", open);
      document.body.classList.toggle("nav-open", open);
    });
  }
  var submenuButtons = document.querySelectorAll("[data-submenu-toggle]");
  function closeSubmenus(except) {
    submenuButtons.forEach(function (b) {
      if (b === except) return;
      b.setAttribute("aria-expanded", "false");
      b.parentElement.classList.remove("is-open");
    });
  }
  submenuButtons.forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = btn.getAttribute("aria-expanded") !== "true";
      closeSubmenus(btn);
      btn.setAttribute("aria-expanded", String(open));
      btn.parentElement.classList.toggle("is-open", open);
    });
  });
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".site-nav__item")) closeSubmenus();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    var openBtn = document.querySelector('[data-submenu-toggle][aria-expanded="true"]');
    closeSubmenus();
    if (openBtn) openBtn.focus();
  });

  /* ---------- Video: load YouTube only when someone presses play ---------- */
  document.querySelectorAll("[data-video]").forEach(function (frame) {
    var btn = frame.querySelector(".video__play");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var id = frame.getAttribute("data-video");
      var iframe = document.createElement("iframe");
      iframe.src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(id) + "?autoplay=1&rel=0";
      iframe.title = btn.getAttribute("aria-label") || "Video";
      iframe.allow = "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture";
      iframe.allowFullscreen = true;
      frame.innerHTML = "";
      frame.appendChild(iframe);
      iframe.focus();
    });
  });

  /* ---------- Inquiry forms ---------- */
  var params = new URLSearchParams(location.search);
  document.querySelectorAll("[data-inquiry-form]").forEach(function (form) {
    var select = form.querySelector("[data-topic-select]");
    var status = form.querySelector(".form-status");
    var fixed = form.getAttribute("data-fixed-topic") === "true";

    if (select && !fixed && params.get("topic")) {
      var wanted = params.get("topic");
      if (select.querySelector('option[value="' + wanted + '"]')) select.value = wanted;
    }
    if (params.get("event")) {
      var msg = form.querySelector('[name="message"]');
      if (msg && !msg.value) msg.value = "I'd like to RSVP for: " + params.get("event");
    }

    function showTopicFields() {
      var topic = select ? select.value : "general";
      form.querySelectorAll("[data-topic-fields]").forEach(function (fs) {
        var on = fs.getAttribute("data-topic-fields").split(" ").indexOf(topic) !== -1;
        fs.classList.toggle("is-active", on);
        fs.disabled = !on;
      });
    }
    if (select) select.addEventListener("change", showTopicFields);
    showTopicFields();

    form.querySelectorAll("[data-adult]").forEach(function (r) {
      r.addEventListener("change", function () {
        var minor = form.querySelector('[data-adult][value="no"]').checked;
        var g = form.querySelector("[data-guardian]");
        if (g) {
          g.hidden = !minor;
          g.querySelectorAll("input").forEach(function (i) { i.required = minor; });
        }
      });
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      status.className = "form-status";
      status.textContent = "";

      if (form.querySelector('[name="website"]').value) return; // spam trap
      var invalid = Array.prototype.find.call(form.elements, function (el) {
        return !el.disabled && el.willValidate && !el.checkValidity();
      });
      if (invalid) {
        status.className = "form-status is-error";
        var label = form.querySelector('label[for="' + invalid.id + '"]');
        status.textContent = "Please check " + (label ? label.textContent.replace("(required)", "").trim().toLowerCase() : "the highlighted field") + ".";
        invalid.focus();
        return;
      }

      var data = new FormData(form);
      var details = {};
      var skip = ["kind", "name", "email", "organization", "message", "website"];
      Array.prototype.forEach.call(form.elements, function (el) {
        if (!el.name || el.disabled || skip.indexOf(el.name) !== -1) return;
        if ((el.type === "checkbox" || el.type === "radio") && !el.checked) return;
        if (!el.value) return;
        details[el.name] = details[el.name] ? details[el.name] + ", " + el.value : el.value;
      });
      var record = {
        kind: data.get("kind") || "general",
        name: String(data.get("name") || "").trim(),
        email: String(data.get("email") || "").trim(),
        organization: String(data.get("organization") || "").trim(),
        message: String(data.get("message") || "").trim(),
        details: details,
      };

      if (!hasBackend) {
        // No database connected yet: open the visitor's email app instead.
        var lines = [record.message, ""];
        Object.keys(details).forEach(function (k) { lines.push(k.replace(/_/g, " ") + ": " + details[k]); });
        lines.push("", record.name, record.organization);
        location.href = "mailto:" + (cfg.email || "") + "?subject=" + encodeURIComponent("Website: " + record.kind) + "&body=" + encodeURIComponent(lines.join("\n"));
        status.className = "form-status is-ok";
        status.textContent = "Your email app should open with your message ready to send.";
        return;
      }

      var btn = form.querySelector('button[type="submit"]');
      btn.setAttribute("aria-busy", "true");
      btn.disabled = true;
      api("/rest/v1/inquiries", record, { Prefer: "return=minimal" })
        .then(function (res) {
          if (!res.ok) throw new Error(String(res.status));
          form.reset();
          showTopicFields();
          status.className = "form-status is-ok";
          status.textContent = "Thanks, " + record.name.split(" ")[0] + ". Your message was sent and we'll reply by email.";
        })
        .catch(function () {
          status.className = "form-status is-error";
          status.innerHTML = 'Your message didn\'t send. Please try again, or email us at <a href="mailto:' + cfg.email + '">' + cfg.email + "</a>.";
        })
        .finally(function () {
          btn.removeAttribute("aria-busy");
          btn.disabled = false;
        });
    });
  });

  /* ---------- Newsletter ---------- */
  document.querySelectorAll("[data-newsletter]").forEach(function (form) {
    var status = form.querySelector(".form-status");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var input = form.querySelector('input[type="email"]');
      status.className = "form-status";
      if (!input.checkValidity()) {
        status.className = "form-status is-error";
        status.textContent = "Enter an email address like name@example.com.";
        input.focus();
        return;
      }
      if (!hasBackend) {
        location.href = "mailto:" + cfg.email + "?subject=" + encodeURIComponent("Add me to planting day news") + "&body=" + encodeURIComponent(input.value);
        return;
      }
      api("/rest/v1/subscribers", { email: input.value.trim().toLowerCase() }, { Prefer: "return=minimal" })
        .then(function (res) {
          if (!res.ok && res.status !== 409) throw new Error(String(res.status));
          form.reset();
          status.className = "form-status is-ok";
          status.textContent = "You're on the list. We'll email you before the next planting day.";
        })
        .catch(function () {
          status.className = "form-status is-error";
          status.textContent = "That didn't go through. Please try again in a moment.";
        });
    });
  });

  /* ---------- Live impact numbers from the teacher portal ---------- */
  var liveStats = document.querySelectorAll("[data-live-stat]");
  if (liveStats.length && hasBackend) {
    api("/rest/v1/rpc/impact_totals", {})
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (totals) {
        if (!totals) return;
        liveStats.forEach(function (el) {
          var n = totals[el.getAttribute("data-live-stat")];
          if (typeof n === "number" && n > 0) {
            el.querySelector("[data-stat-value]").textContent = n.toLocaleString("en-US");
            el.hidden = false;
            el.closest(".block--stats").classList.add("has-stats");
          }
        });
      })
      .catch(function () {});
  }

  /* ---------- Classroom photos approved for the website ---------- */
  document.querySelectorAll("[data-live-gallery]").forEach(function (list) {
    if (!hasBackend) return;
    var max = parseInt(list.getAttribute("data-live-gallery"), 10) || 8;
    api("/rest/v1/rpc/public_gallery", { max_items: max })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        (rows || []).forEach(function (row) {
          var li = document.createElement("li");
          li.className = "gallery__item";
          var img = document.createElement("img");
          img.loading = "lazy";
          img.src = cfg.supabaseUrl.replace(/\/$/, "") + "/storage/v1/object/public/gallery/" + row.public_path;
          img.alt = row.caption || "A classroom mangrove seedling";
          li.appendChild(img);
          if (row.caption) {
            var p = document.createElement("p");
            p.className = "gallery__caption";
            p.textContent = row.caption;
            li.appendChild(p);
          }
          list.appendChild(li);
        });
        if (list.children.length) list.closest(".block--gallery").classList.remove("is-empty");
      })
      .catch(function () {});
  });

  /* ---------- Lesson library filters ---------- */
  var library = document.querySelector("[data-library]");
  if (library) {
    var topicSel = library.querySelector("[data-topic]");
    var search = library.querySelector("[data-search]");
    var bands = library.querySelectorAll("[data-band]");

    function currentGrade() {
      var r = library.querySelector('input[name="grade"]:checked');
      return r ? r.value : "all";
    }
    function apply() {
      var grade = currentGrade();
      var topic = topicSel.value;
      var q = search.value.trim().toLowerCase();
      bands.forEach(function (band) {
        var bandGrades = band.getAttribute("data-band").split(" ");
        var bandMatches = grade === "all" || bandGrades.indexOf(grade) !== -1;
        band.hidden = !bandMatches;
        var shown = 0;
        band.querySelectorAll(".lesson-card").forEach(function (card) {
          var g = card.getAttribute("data-grades");
          var grades = g ? g.split(" ") : [];
          var ok = (grade === "all" || !grades.length || grades.indexOf(grade) !== -1) &&
            (!topic || card.getAttribute("data-topic-value") === topic) &&
            (!q || card.getAttribute("data-text").indexOf(q) !== -1);
          card.hidden = !ok;
          if (ok) shown++;
        });
        var empty = band.querySelector(".lesson-band__empty");
        if (empty) empty.hidden = shown > 0;
      });
    }
    library.addEventListener("change", apply);
    search.addEventListener("input", apply);

    apply();
  }
})();
