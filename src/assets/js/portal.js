/* ============================================================
   My Pet Mangrove: teacher portal
   Runs on Supabase when keys are set in Site settings.
   Without keys it runs as a preview with sample data.
   ============================================================ */
(function () {
  "use strict";

  var cfg = window.MPM || {};
  var LIVE = Boolean(cfg.supabaseUrl && cfg.supabaseKey && window.supabase);
  var root = document.querySelector("[data-portal]");
  if (!root) return;

  var SPECIES = { red: "Red mangrove", black: "Black mangrove", white: "White mangrove", unknown: "Not sure yet" };
  var STATUS = { growing: "Growing", planted: "Planted", lost: "Didn't make it" };
  var GRADES = ["Pre-K", "K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "Mixed"];
  var KINDS = { general: "General", school: "School program", visit: "Classroom visit", volunteer: "Volunteer", partner: "Partner", support: "Support", lesson: "Lesson request" };

  /* ---------- Small helpers ---------- */
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function fmtDate(v, opts) {
    if (!v) return "";
    var d = new Date(String(v).length === 10 ? v + "T12:00:00" : v);
    if (isNaN(d)) return "";
    return d.toLocaleDateString("en-US", opts || { month: "short", day: "numeric", year: "numeric" });
  }
  function daysSince(v) {
    if (!v) return 0;
    var ms = Date.now() - new Date(v + "T12:00:00").getTime();
    return Math.max(0, Math.floor(ms / 86400000));
  }
  function schoolYear() {
    var d = new Date();
    var y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
    return y + "–" + String((y + 1) % 100).padStart(2, "0");
  }
  function fe(form, name) {
    return form.querySelector('[name="' + name + '"]');
  }
  function firstName(n) {
    return String(n || "").trim().split(/\s+/)[0] || "there";
  }
  function plural(n, one, many) {
    return n + " " + (n === 1 ? one : many || one + "s");
  }
  function uid() {
    return (crypto.randomUUID && crypto.randomUUID()) || "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
  function errText(e) {
    var m = (e && (e.message || e.error_description)) || String(e || "Something went wrong.");
    if (/Invalid login credentials/i.test(m)) return "That email and password don't match an account. Check them, or reset your password.";
    if (/Email not confirmed/i.test(m)) return "Confirm your email first: open the link we sent when you created your account.";
    if (/already registered|already exists/i.test(m)) return "There's already an account with that email. Sign in instead, or reset your password.";
    if (/Password should be/i.test(m)) return "Use a password with at least 8 characters.";
    if (/rate limit|too many/i.test(m)) return "Too many tries in a short time. Wait a minute, then try again.";
    if (/not authorized/i.test(m)) return "We couldn't send that email yet. Ask My Pet Mangrove to finish the email setup (README step 5).";
    if (/Failed to fetch|NetworkError/i.test(m)) return "Can't reach the server. Check your internet connection and try again.";
    return m;
  }

  /* Shorten "Maya Rodriguez" or "Rodriguez, Maya" to "Maya R." */
  function rosterName(raw, shorten) {
    var s = String(raw || "").replace(/\s+/g, " ").trim();
    if (!s) return "";
    if (s.indexOf(",") > 0) {
      var parts = s.split(",");
      s = (parts.slice(1).join(" ").trim() + " " + parts[0].trim()).trim();
    }
    if (!shorten) return s.slice(0, 60);
    var words = s.split(" ");
    if (words.length === 1) return words[0].slice(0, 60);
    return (words[0] + " " + words[words.length - 1].charAt(0).toUpperCase() + ".").slice(0, 60);
  }

  /* Read a CSV or pasted list into full names. */
  function parseRoster(text) {
    var lines = String(text || "").split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    if (!lines.length) return [];
    function cells(line) {
      var out = [], cur = "", q = false;
      for (var i = 0; i < line.length; i++) {
        var ch = line[i];
        if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
        else if ((ch === "," || ch === "\t" || ch === ";") && !q) { out.push(cur.trim()); cur = ""; }
        else cur += ch;
      }
      out.push(cur.trim());
      return out;
    }
    var header = cells(lines[0]).map(function (h) { return h.toLowerCase(); });
    var fi = header.findIndex(function (h) { return /first/.test(h); });
    var li = header.findIndex(function (h) { return /last|surname|family/.test(h); });
    var ni = header.findIndex(function (h) { return /^(student )?(full )?name$|^student$/.test(h); });
    if (fi !== -1 || ni !== -1) {
      return lines.slice(1).map(function (line) {
        var c = cells(line);
        if (fi !== -1) return ((c[fi] || "") + " " + (li !== -1 ? c[li] || "" : "")).trim();
        return c[ni] || "";
      }).filter(Boolean);
    }
    return lines; // one name per line; "Last, First" is handled by rosterName
  }

  /* Resize photos in the browser before upload (also strips location data). */
  function shrinkImage(file, max, quality) {
    max = max || 1600;
    quality = quality || 0.82;
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        var w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
        var canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        canvas.toBlob(function (b) { b ? resolve(b) : reject(new Error("Couldn't read that image.")); }, "image/jpeg", quality);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error(file.name + " isn't a photo this browser can open. Try a JPG or PNG.")); };
      img.src = url;
    });
  }

  function sparkline(logs) {
    var pts = logs.filter(function (l) { return l.height_cm != null && l.height_cm !== ""; });
    if (pts.length < 2) return "";
    var w = 120, h = 32, vals = pts.map(function (l) { return Number(l.height_cm); });
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals), span = max - min || 1;
    var coords = vals.map(function (v, i) {
      return (i * (w / (vals.length - 1))).toFixed(1) + "," + (h - 3 - ((v - min) / span) * (h - 6)).toFixed(1);
    }).join(" ");
    return '<svg class="spark" viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h + '" role="img" aria-label="Height from ' + min + " to " + max + ' cm"><polyline points="' + coords + '"/></svg>';
  }

  /* ============================================================
     Data layer: Supabase
     ============================================================ */
  function supabaseApi() {
    var sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });
    var me = null;
    function q(p) {
      return p.then(function (r) { if (r.error) throw r.error; return r.data; });
    }
    function count(arr) { return arr && arr[0] ? arr[0].count : 0; }

    return {
      live: true,
      init: function () {
        return sb.auth.getSession().then(function (r) { me = r.data.session ? r.data.session.user : null; return me; });
      },
      onAuth: function (cb) {
        sb.auth.onAuthStateChange(function (event, session) { me = session ? session.user : null; cb(event, me); });
      },
      user: function () { return me; },
      signIn: function (email, password) { return q(sb.auth.signInWithPassword({ email: email, password: password })); },
      signUp: function (email, password, meta) {
        return q(sb.auth.signUp({ email: email, password: password, options: { data: meta, emailRedirectTo: location.origin + "/teacher-portal/" } }));
      },
      signOut: function () { return sb.auth.signOut(); },
      sendReset: function (email) { return q(sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + "/teacher-portal/" })); },
      setPassword: function (pw) { return q(sb.auth.updateUser({ password: pw })); },

      getProfile: function () {
        return q(sb.from("profiles").select("*").eq("id", me.id).maybeSingle()).then(function (p) {
          return Object.assign({ full_name: "", school: "", county: "", role: "teacher" }, p || {}, { email: me.email });
        });
      },
      saveProfile: function (f) { return q(sb.from("profiles").update(f).eq("id", me.id)); },

      listClasses: function () {
        return q(sb.from("classes").select("*, students(count), seedlings(status), photos(count)").eq("teacher_id", me.id).order("created_at", { ascending: false }))
          .then(function (rows) {
            return rows.map(function (c) {
              var s = c.seedlings || [];
              return Object.assign(c, {
                student_count: count(c.students),
                photo_count: count(c.photos),
                seedling_count: s.length,
                growing: s.filter(function (x) { return x.status === "growing"; }).length,
                planted: s.filter(function (x) { return x.status === "planted"; }).length,
              });
            });
          });
      },
      createClass: function (f) { return q(sb.from("classes").insert(f).select().single()); },
      updateClass: function (id, f) { return q(sb.from("classes").update(f).eq("id", id)); },
      deleteClass: function (id) {
        return q(sb.from("photos").select("storage_path").eq("class_id", id)).then(function (ph) {
          var paths = ph.map(function (p) { return p.storage_path; });
          return (paths.length ? sb.storage.from("class-photos").remove(paths) : Promise.resolve()).then(function () {
            return q(sb.from("classes").delete().eq("id", id));
          });
        });
      },
      getClass: function (id) {
        return Promise.all([
          q(sb.from("classes").select("*").eq("id", id).maybeSingle()),
          q(sb.from("students").select("*").eq("class_id", id).order("display_name")),
          q(sb.from("seedlings").select("*").eq("class_id", id).order("created_at")),
          q(sb.from("photos").select("*").eq("class_id", id).order("created_at", { ascending: false })),
        ]).then(function (r) {
          var ids = r[2].map(function (s) { return s.id; });
          return (ids.length ? q(sb.from("growth_logs").select("*").in("seedling_id", ids).order("logged_on")) : Promise.resolve([]))
            .then(function (logs) { return { cls: r[0], students: r[1], seedlings: r[2], photos: r[3], logs: logs }; });
        });
      },
      addStudents: function (classId, names) {
        return q(sb.from("students").insert(names.map(function (n) { return { class_id: classId, display_name: n }; })).select());
      },
      updateStudent: function (id, name) { return q(sb.from("students").update({ display_name: name }).eq("id", id)); },
      deleteStudent: function (id) { return q(sb.from("students").delete().eq("id", id)); },
      addSeedling: function (f) { return q(sb.from("seedlings").insert(f).select().single()); },
      updateSeedling: function (id, f) { return q(sb.from("seedlings").update(f).eq("id", id)); },
      deleteSeedling: function (id) { return q(sb.from("seedlings").delete().eq("id", id)); },
      addLog: function (f) { return q(sb.from("growth_logs").insert(f).select().single()); },
      deleteLog: function (id) { return q(sb.from("growth_logs").delete().eq("id", id)); },
      uploadPhoto: function (classId, blob, meta) {
        var path = me.id + "/" + classId + "/" + uid() + ".jpg";
        return q(sb.storage.from("class-photos").upload(path, blob, { contentType: "image/jpeg", upsert: false })).then(function () {
          return q(sb.from("photos").insert(Object.assign({ class_id: classId, storage_path: path }, meta)).select().single())
            .catch(function (e) { sb.storage.from("class-photos").remove([path]); throw e; });
        });
      },
      updatePhoto: function (id, f) { return q(sb.from("photos").update(f).eq("id", id)); },
      deletePhoto: function (photo) {
        return sb.storage.from("class-photos").remove([photo.storage_path]).then(function () {
          return q(sb.from("photos").delete().eq("id", photo.id));
        });
      },
      photoUrls: function (paths) {
        if (!paths.length) return Promise.resolve({});
        return q(sb.storage.from("class-photos").createSignedUrls(paths, 3600)).then(function (rows) {
          var map = {};
          rows.forEach(function (r) { if (r.signedUrl) map[r.path] = r.signedUrl; });
          return map;
        });
      },

      /* Admin */
      adminData: function () {
        return Promise.all([
          q(sb.from("profiles").select("*").order("created_at", { ascending: false })),
          q(sb.from("classes").select("id, teacher_id, students(count), seedlings(status)")),
          q(sb.from("photos").select("id, share_ok, approved")),
        ]).then(function (r) {
          return { profiles: r[0], classes: r[1].map(function (c) { return { teacher_id: c.teacher_id, students: count(c.students), seedlings: c.seedlings || [] }; }), photos: r[2] };
        });
      },
      listInquiries: function () { return q(sb.from("inquiries").select("*").order("created_at", { ascending: false }).limit(300)); },
      setInquiryHandled: function (id, v) { return q(sb.from("inquiries").update({ handled: v }).eq("id", id)); },
      deleteInquiry: function (id) { return q(sb.from("inquiries").delete().eq("id", id)); },
      listSubscribers: function () { return q(sb.from("subscribers").select("*").order("created_at", { ascending: false })); },
      deleteSubscriber: function (email) { return q(sb.from("subscribers").delete().eq("email", email)); },
      photoQueue: function () {
        return q(sb.from("photos").select("*, classes(name, grade_level), profiles(full_name, school)").eq("share_ok", true).order("created_at", { ascending: false }).limit(200));
      },
      approvePhoto: function (photo) {
        var name = photo.id + ".jpg";
        return q(sb.storage.from("class-photos").download(photo.storage_path)).then(function (blob) {
          return q(sb.storage.from("gallery").upload(name, blob, { contentType: "image/jpeg", upsert: true }));
        }).then(function () {
          return q(sb.from("photos").update({ approved: true, public_path: name }).eq("id", photo.id));
        });
      },
      unapprovePhoto: function (photo) {
        return (photo.public_path ? sb.storage.from("gallery").remove([photo.public_path]) : Promise.resolve()).then(function () {
          return q(sb.from("photos").update({ approved: false, public_path: null }).eq("id", photo.id));
        });
      },
      publicPhotoUrl: function (path) { return cfg.supabaseUrl.replace(/\/$/, "") + "/storage/v1/object/public/gallery/" + path; },
    };
  }

  /* ============================================================
     Data layer: preview with sample data (nothing is saved)
     ============================================================ */
  function demoApi() {
    var me = null;
    var listeners = [];
    var T1 = "demo-teacher", T2 = "demo-teacher-2";
    var db = {
      profiles: [
        { id: T1, email: "teacher@example.org", full_name: "Jordan Rivera", school: "Lagoon View Elementary", county: "Indian River", role: "admin", created_at: "2026-08-20T14:00:00Z" },
        { id: T2, email: "science@example.org", full_name: "Sam Okafor", school: "Riverside Middle School", county: "Brevard", role: "teacher", created_at: "2026-09-02T14:00:00Z" },
      ],
      classes: [
        { id: "c1", teacher_id: T1, name: "Room 12 Science", grade_level: "4", school_year: schoolYear(), archived: false, created_at: "2026-09-01T12:00:00Z" },
        { id: "c2", teacher_id: T2, name: "Marine Biology Club", grade_level: "7", school_year: schoolYear(), archived: false, created_at: "2026-09-05T12:00:00Z" },
      ],
      students: [],
      seedlings: [],
      growth_logs: [],
      photos: [],
      inquiries: [
        { id: "i1", kind: "school", name: "Pat Lee", email: "plee@example.org", organization: "Sunrise Elementary", message: "We'd love to start this spring with two 3rd grade classes.", details: { grade: "3", students: "44", county: "St. Lucie", start: "Next semester" }, handled: false, created_at: "2026-11-08T15:20:00Z" },
        { id: "i2", kind: "volunteer", name: "Chris Diaz", email: "cdiaz@example.org", organization: "", message: "Happy to help on planting days.", details: { help: "Planting days, Propagule collection", adult: "yes" }, handled: true, created_at: "2026-11-02T10:05:00Z" },
      ],
      subscribers: [
        { email: "fan@example.org", created_at: "2026-10-30T12:00:00Z" },
        { email: "parent@example.org", created_at: "2026-11-01T12:00:00Z" },
      ],
    };
    ["Maya R.", "Jonah K.", "Ava T.", "Leo M.", "Priya S.", "Sam W."].forEach(function (n, i) {
      db.students.push({ id: "s" + i, class_id: "c1", teacher_id: T1, display_name: n, created_at: "2026-09-02T12:00:00Z" });
    });
    db.students.push({ id: "s9", class_id: "c2", teacher_id: T2, display_name: "Elena V.", created_at: "2026-09-06T12:00:00Z" });
    db.seedlings = [
      { id: "g1", class_id: "c1", teacher_id: T1, student_id: "s0", nickname: "Sprout", species: "red", started_on: "2026-09-15", status: "growing", planted_on: null, planting_site: "", notes: "", created_at: "2026-09-15T12:00:00Z" },
      { id: "g2", class_id: "c1", teacher_id: T1, student_id: "s1", nickname: "Captain Roots", species: "red", started_on: "2026-09-15", status: "planted", planted_on: "2026-11-07", planting_site: "Partner site, Indian River Lagoon", notes: "", created_at: "2026-09-15T12:00:00Z" },
      { id: "g3", class_id: "c1", teacher_id: T1, student_id: "s2", nickname: "Mango", species: "black", started_on: "2026-09-22", status: "growing", planted_on: null, planting_site: "", notes: "", created_at: "2026-09-22T12:00:00Z" },
      { id: "g4", class_id: "c1", teacher_id: T1, student_id: null, nickname: "Walker", species: "red", started_on: "2026-10-01", status: "growing", planted_on: null, planting_site: "", notes: "Our whole-class seedling.", created_at: "2026-10-01T12:00:00Z" },
      { id: "g5", class_id: "c2", teacher_id: T2, student_id: "s9", nickname: "Tide", species: "white", started_on: "2026-09-20", status: "growing", planted_on: null, planting_site: "", notes: "", created_at: "2026-09-20T12:00:00Z" },
    ];
    [["g1", "2026-09-29", 4.5, 0], ["g1", "2026-10-13", 7.2, 2], ["g1", "2026-10-27", 10.4, 4], ["g1", "2026-11-09", 13.1, 6],
     ["g2", "2026-09-29", 5.1, 1], ["g2", "2026-10-20", 11.8, 4], ["g3", "2026-10-06", 2.0, 0], ["g3", "2026-10-30", 5.5, 2]]
      .forEach(function (l, i) { db.growth_logs.push({ id: "l" + i, seedling_id: l[0], teacher_id: T1, logged_on: l[1], height_cm: l[2], leaf_count: l[3], note: "", created_at: l[1] + "T12:00:00Z" }); });
    db.photos = [
      { id: "p1", class_id: "c1", teacher_id: T1, seedling_id: "g1", storage_path: "/images/site/step-grow.jpg", caption: "Sprout's first leaves", share_ok: true, approved: false, public_path: null, created_at: "2026-10-27T12:00:00Z" },
      { id: "p2", class_id: "c1", teacher_id: T1, seedling_id: "g2", storage_path: "/images/site/step-collect.jpg", caption: "Captain Roots on day one", share_ok: false, approved: false, public_path: null, created_at: "2026-09-15T12:00:00Z" },
    ];
    var blobs = {};
    function wait(v) { return new Promise(function (r) { setTimeout(function () { r(v); }, 120); }); }
    function mine(t) { return db[t].filter(function (r) { return r.teacher_id === me.id; }); }
    function find(t, id) { return db[t].find(function (r) { return r.id === id; }); }
    function remove(t, pred) { db[t] = db[t].filter(function (r) { return !pred(r); }); }

    return {
      live: false,
      init: function () { return wait(me); },
      onAuth: function (cb) { listeners.push(cb); },
      user: function () { return me; },
      signIn: function () {
        me = { id: T1, email: "teacher@example.org" };
        listeners.forEach(function (cb) { cb("SIGNED_IN", me); });
        return wait({});
      },
      signUp: function () { return this.signIn(); },
      signOut: function () { me = null; listeners.forEach(function (cb) { cb("SIGNED_OUT", null); }); return wait(); },
      sendReset: function () { return wait({}); },
      setPassword: function () { return wait({}); },
      getProfile: function () { return wait(Object.assign({}, find("profiles", me.id))); },
      saveProfile: function (f) { Object.assign(find("profiles", me.id), f); return wait(); },
      listClasses: function () {
        return wait(mine("classes").slice().reverse().map(function (c) {
          var s = db.seedlings.filter(function (x) { return x.class_id === c.id; });
          return Object.assign({}, c, {
            student_count: db.students.filter(function (x) { return x.class_id === c.id; }).length,
            photo_count: db.photos.filter(function (x) { return x.class_id === c.id; }).length,
            seedling_count: s.length,
            growing: s.filter(function (x) { return x.status === "growing"; }).length,
            planted: s.filter(function (x) { return x.status === "planted"; }).length,
          });
        }));
      },
      createClass: function (f) {
        var row = Object.assign({ id: uid(), teacher_id: me.id, archived: false, created_at: new Date().toISOString() }, f);
        db.classes.push(row);
        return wait(row);
      },
      updateClass: function (id, f) { Object.assign(find("classes", id), f); return wait(); },
      deleteClass: function (id) {
        var seeds = db.seedlings.filter(function (s) { return s.class_id === id; }).map(function (s) { return s.id; });
        remove("growth_logs", function (l) { return seeds.indexOf(l.seedling_id) !== -1; });
        ["students", "seedlings", "photos"].forEach(function (t) { remove(t, function (r) { return r.class_id === id; }); });
        remove("classes", function (r) { return r.id === id; });
        return wait();
      },
      getClass: function (id) {
        var cls = find("classes", id);
        if (!cls || cls.teacher_id !== me.id) return wait({ cls: null });
        var seeds = db.seedlings.filter(function (s) { return s.class_id === id; });
        var ids = seeds.map(function (s) { return s.id; });
        return wait({
          cls: Object.assign({}, cls),
          students: db.students.filter(function (s) { return s.class_id === id; }).sort(function (a, b) { return a.display_name.localeCompare(b.display_name); }),
          seedlings: seeds.map(function (s) { return Object.assign({}, s); }),
          logs: db.growth_logs.filter(function (l) { return ids.indexOf(l.seedling_id) !== -1; }).sort(function (a, b) { return a.logged_on < b.logged_on ? -1 : 1; }),
          photos: db.photos.filter(function (p) { return p.class_id === id; }).slice().reverse(),
        });
      },
      addStudents: function (classId, names) {
        var rows = names.map(function (n) { return { id: uid(), class_id: classId, teacher_id: me.id, display_name: n, created_at: new Date().toISOString() }; });
        db.students = db.students.concat(rows);
        return wait(rows);
      },
      updateStudent: function (id, name) { find("students", id).display_name = name; return wait(); },
      deleteStudent: function (id) {
        remove("students", function (r) { return r.id === id; });
        db.seedlings.forEach(function (s) { if (s.student_id === id) s.student_id = null; });
        return wait();
      },
      addSeedling: function (f) {
        var row = Object.assign({ id: uid(), teacher_id: me.id, status: "growing", planted_on: null, planting_site: "", notes: "", created_at: new Date().toISOString() }, f);
        db.seedlings.push(row);
        return wait(row);
      },
      updateSeedling: function (id, f) { Object.assign(find("seedlings", id), f); return wait(); },
      deleteSeedling: function (id) {
        remove("seedlings", function (r) { return r.id === id; });
        remove("growth_logs", function (r) { return r.seedling_id === id; });
        db.photos.forEach(function (p) { if (p.seedling_id === id) p.seedling_id = null; });
        return wait();
      },
      addLog: function (f) {
        var row = Object.assign({ id: uid(), teacher_id: me.id, created_at: new Date().toISOString() }, f);
        db.growth_logs.push(row);
        return wait(row);
      },
      deleteLog: function (id) { remove("growth_logs", function (r) { return r.id === id; }); return wait(); },
      uploadPhoto: function (classId, blob, meta) {
        var path = "demo/" + uid() + ".jpg";
        blobs[path] = URL.createObjectURL(blob);
        var row = Object.assign({ id: uid(), class_id: classId, teacher_id: me.id, storage_path: path, approved: false, public_path: null, created_at: new Date().toISOString() }, meta);
        db.photos.push(row);
        return wait(row);
      },
      updatePhoto: function (id, f) {
        var p = find("photos", id);
        Object.assign(p, f);
        if (p.share_ok === false) p.approved = false;
        return wait();
      },
      deletePhoto: function (photo) { remove("photos", function (r) { return r.id === photo.id; }); return wait(); },
      photoUrls: function (paths) {
        var map = {};
        paths.forEach(function (p) { map[p] = blobs[p] || p; });
        return wait(map);
      },
      adminData: function () {
        return wait({
          profiles: db.profiles.slice(),
          classes: db.classes.map(function (c) {
            return {
              teacher_id: c.teacher_id,
              students: db.students.filter(function (s) { return s.class_id === c.id; }).length,
              seedlings: db.seedlings.filter(function (s) { return s.class_id === c.id; }),
            };
          }),
          photos: db.photos.slice(),
        });
      },
      listInquiries: function () { return wait(db.inquiries.slice()); },
      setInquiryHandled: function (id, v) { find("inquiries", id).handled = v; return wait(); },
      deleteInquiry: function (id) { remove("inquiries", function (r) { return r.id === id; }); return wait(); },
      listSubscribers: function () { return wait(db.subscribers.slice()); },
      deleteSubscriber: function (email) { remove("subscribers", function (r) { return r.email === email; }); return wait(); },
      photoQueue: function () {
        return wait(db.photos.filter(function (p) { return p.share_ok; }).map(function (p) {
          var c = find("classes", p.class_id), t = find("profiles", p.teacher_id);
          return Object.assign({}, p, { classes: { name: c.name, grade_level: c.grade_level }, profiles: { full_name: t.full_name, school: t.school } });
        }));
      },
      approvePhoto: function (photo) { var p = find("photos", photo.id); p.approved = true; p.public_path = photo.storage_path; return wait(); },
      unapprovePhoto: function (photo) { var p = find("photos", photo.id); p.approved = false; p.public_path = null; return wait(); },
      publicPhotoUrl: function (path) { return blobs[path] || path; },
    };
  }

  var api = LIVE ? supabaseApi() : demoApi();
  var state = { user: null, profile: null, recovering: false, flash: null };

  /* ============================================================
     Shell, toasts, dialog
     ============================================================ */
  var toastRegion = document.createElement("div");
  toastRegion.className = "toasts";
  toastRegion.setAttribute("role", "status");
  toastRegion.setAttribute("aria-live", "polite");
  document.body.appendChild(toastRegion);
  function toast(msg, kind) {
    var t = document.createElement("p");
    t.className = "toast" + (kind === "error" ? " toast--error" : "");
    t.textContent = msg;
    toastRegion.appendChild(t);
    setTimeout(function () { t.remove(); }, kind === "error" ? 7000 : 3500);
  }

  var dialog = document.createElement("dialog");
  dialog.className = "p-dialog";
  document.body.appendChild(dialog);
  var dialogSubmit = null;
  function openDialog(title, bodyHtml, submitLabel, onSubmit) {
    dialog.innerHTML =
      '<form method="dialog" class="p-dialog__form" novalidate>' +
      '<div class="p-dialog__head"><h2 class="p-dialog__title">' + esc(title) + '</h2>' +
      '<button type="button" class="icon-btn" data-close aria-label="Close">×</button></div>' +
      '<div class="p-dialog__body">' + bodyHtml + "</div>" +
      '<p class="form-status" role="status"></p>' +
      '<div class="p-dialog__foot"><button type="button" class="btn btn--outline" data-close>Cancel</button>' +
      '<button type="submit" class="btn btn--blue" value="ok">' + esc(submitLabel || "Save") + "</button></div></form>";
    dialogSubmit = onSubmit;
    dialog.showModal();
    var first = dialog.querySelector("input:not([type=hidden]), select, textarea");
    if (first) first.focus();
    return dialog;
  }
  dialog.addEventListener("click", function (e) {
    if (e.target.closest("[data-close]") || e.target === dialog) dialog.close();
  });
  dialog.addEventListener("submit", function (e) {
    e.preventDefault();
    var form = e.target;
    var status = form.querySelector(".form-status");
    var invalid = Array.prototype.find.call(form.elements, function (el) { return el.willValidate && !el.checkValidity(); });
    if (invalid) {
      status.className = "form-status is-error";
      status.textContent = invalid.validationMessage;
      invalid.focus();
      return;
    }
    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    status.className = "form-status";
    status.textContent = "Saving…";
    Promise.resolve(dialogSubmit && dialogSubmit(form))
      .then(function (keepOpen) { if (keepOpen !== true) dialog.close(); })
      .catch(function (err) {
        status.className = "form-status is-error";
        status.textContent = errText(err);
      })
      .finally(function () { btn.disabled = false; });
  });

  function shell(inner, active) {
    var isAdmin = state.profile && state.profile.role === "admin";
    var demo = !api.live
      ? '<div class="demo-banner"><div class="wrap"><strong>Preview mode.</strong> You\'re looking at sample data and nothing is saved. Connect Supabase in Site settings to turn on real teacher accounts.</div></div>'
      : "";
    return demo +
      '<div class="portal-bar"><div class="wrap portal-bar__inner">' +
      '<p class="portal-bar__title">Teacher portal</p>' +
      '<nav aria-label="Portal"><ul class="portal-tabs">' +
      '<li><a href="#/" ' + (active === "home" ? 'aria-current="page"' : "") + ">My classes</a></li>" +
      (isAdmin ? '<li><a href="#/admin" ' + (active === "admin" ? 'aria-current="page"' : "") + ">Admin</a></li>" : "") +
      '<li><a href="#/account" ' + (active === "account" ? 'aria-current="page"' : "") + ">Account</a></li>" +
      '<li><button type="button" class="linkish" data-action="sign-out">Sign out</button></li>' +
      "</ul></nav></div></div>" +
      '<div class="wrap portal-main">' + inner + "</div>";
  }
  function render(html) {
    root.innerHTML = html;
    var h = root.querySelector("h1");
    if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
  }
  function loading(active) {
    render(shell('<p class="p-loading">Loading…</p>', active));
  }
  function failed(err, active) {
    render(shell('<div class="p-empty"><h1 class="h3">That didn\'t load</h1><p>' + esc(errText(err)) + '</p><button class="btn btn--blue" data-action="reload">Try again</button></div>', active));
  }

  /* ============================================================
     Sign in, create account, reset password
     ============================================================ */
  function authView(mode, notice) {
    var title = { signin: "Teacher login", signup: "Create a teacher account", reset: "Reset your password", newpw: "Choose a new password" }[mode];
    var intro = {
      signin: "Track your class's seedlings, keep your roster, add growth photos, and print certificates.",
      signup: "Free for any teacher running My Pet Mangrove with their class.",
      reset: "Enter the email you signed up with and we'll send you a link to choose a new password.",
      newpw: "Pick a new password for your account.",
    }[mode];
    var fields = "";
    if (mode === "signup") {
      fields +=
        field("full_name", "Your name", "text", 'autocomplete="name" required maxlength="120"') +
        field("school", "School", "text", 'autocomplete="organization" required maxlength="160"') +
        field("county", "County", "text", 'maxlength="80"');
    }
    if (mode !== "newpw") fields += field("email", "Email", "email", 'autocomplete="email" required');
    if (mode === "signin") fields += field("password", "Password", "password", 'autocomplete="current-password" required');
    if (mode === "signup" || mode === "newpw") fields += field("password", mode === "newpw" ? "New password" : "Password", "password", 'autocomplete="new-password" required minlength="8"', "At least 8 characters.");

    var submit = { signin: "Log in", signup: "Create account", reset: "Send reset link", newpw: "Save new password" }[mode];
    var links = {
      signin: '<p>New here? <a href="#/signup">Create a teacher account</a></p><p><a href="#/reset">Forgot your password?</a></p>',
      signup: '<p>Already have an account? <a href="#/signin">Log in</a></p>',
      reset: '<p><a href="#/signin">Back to login</a></p>',
      newpw: "",
    }[mode];
    var demoNote = !api.live
      ? '<div class="demo-note"><p><strong>Preview mode.</strong> Real accounts turn on once Supabase is connected. For now you can explore with sample data.</p><button type="button" class="btn btn--navy" data-action="demo-login">Explore the preview</button></div>'
      : "";

    render(
      '<div class="auth">' +
      '<div class="auth__panel">' +
      '<h1 class="auth__title">' + title + "</h1>" +
      '<p class="auth__intro">' + intro + "</p>" +
      (notice ? '<p class="notice">' + esc(notice) + "</p>" : "") +
      demoNote +
      '<form class="auth__form" data-form="' + mode + '" novalidate>' + fields +
      '<button class="btn btn--blue btn--block" type="submit">' + submit + "</button>" +
      '<p class="form-status" role="status" aria-live="polite"></p></form>' +
      '<div class="auth__links">' + links + "</div>" +
      "</div>" +
      '<div class="auth__aside" aria-hidden="true"><img src="/images/site/step-grow.jpg" alt=""><p>Every seedling has a caretaker.</p></div>' +
      "</div>"
    );
  }
  function field(name, label, type, attrs, hint) {
    var id = "f-" + name + "-" + Math.random().toString(36).slice(2, 7);
    return '<div class="field"><label for="' + id + '">' + esc(label) + "</label>" +
      '<input id="' + id + '" name="' + name + '" type="' + type + '" ' + (attrs || "") + (hint ? ' aria-describedby="' + id + '-h"' : "") + ">" +
      (hint ? '<p class="hint" id="' + id + '-h">' + esc(hint) + "</p>" : "") + "</div>";
  }

  /* ============================================================
     Dashboard: my classes
     ============================================================ */
  function dashboardView() {
    loading("home");
    api.listClasses().then(function (classes) {
      var p = state.profile || {};
      var active = classes.filter(function (c) { return !c.archived; });
      var archived = classes.filter(function (c) { return c.archived; });
      var sum = function (k) { return active.reduce(function (a, c) { return a + (c[k] || 0); }, 0); };
      var stats = active.length
        ? '<dl class="p-stats">' +
          stat(sum("student_count"), "Students") +
          stat(sum("growing"), "Seedlings growing") +
          stat(sum("planted"), "Replanted") +
          stat(sum("photo_count"), "Photos") + "</dl>"
        : "";
      var cards = active.map(classCard).join("");
      var html =
        '<div class="p-head"><div><h1 class="p-title">Welcome, ' + esc(firstName(p.full_name)) + "</h1>" +
        '<p class="p-sub">' + esc(p.school || "Add your school on the Account page.") + "</p></div>" +
        '<button class="btn btn--blue" data-action="new-class">New class</button></div>' +
        stats +
        (active.length
          ? '<ul class="class-grid">' + cards + "</ul>"
          : '<div class="p-empty"><h2 class="h3">Start with your first class</h2><p>Create a class, add your students, then give every seedling a name and a caretaker.</p><button class="btn btn--blue" data-action="new-class">Create a class</button></div>') +
        (archived.length ? '<details class="archived"><summary>Archived classes (' + archived.length + ")</summary><ul class=\"class-grid\">" + archived.map(classCard).join("") + "</ul></details>" : "") +
        '<section class="p-help"><h2 class="h4">Teaching resources</h2><ul>' +
        '<li><a href="/teacher-resources/">Lesson library, Pre-K to grade 12</a></li>' +
        '<li><a href="/contact/?topic=visit">Request a classroom visit</a></li>' +
        '<li><a href="/how-it-works/">The four-step program</a></li></ul></section>';
      render(shell(html, "home"));
    }).catch(function (e) { failed(e, "home"); });
  }
  function stat(n, label) {
    return '<div class="p-stat"><dt>' + esc(label) + "</dt><dd>" + n + "</dd></div>";
  }
  function classCard(c) {
    return '<li class="class-card"><a href="#/class/' + esc(c.id) + '">' +
      '<p class="class-card__grade">' + esc(c.grade_level ? (/^\d+$/.test(c.grade_level) ? "Grade " + c.grade_level : c.grade_level) : "Class") + (c.school_year ? ", " + esc(c.school_year) : "") + "</p>" +
      '<h2 class="class-card__name">' + esc(c.name) + "</h2>" +
      '<ul class="class-card__meta"><li>' + plural(c.student_count, "student") + "</li><li>" + c.growing + " growing</li><li>" + c.planted + " replanted</li></ul>" +
      "</a></li>";
  }
  function classForm(c) {
    c = c || { grade_level: "", school_year: schoolYear(), name: "" };
    return '<div class="field"><label for="cf-name">Class name</label><input id="cf-name" name="name" required maxlength="120" value="' + esc(c.name) + '" placeholder="Room 12 Science"></div>' +
      '<div class="field-row"><div class="field"><label for="cf-grade">Grade</label><select id="cf-grade" name="grade_level"><option value="">Choose…</option>' +
      GRADES.map(function (g) { return "<option" + (g === c.grade_level ? " selected" : "") + ">" + g + "</option>"; }).join("") +
      '</select></div><div class="field"><label for="cf-year">School year</label><input id="cf-year" name="school_year" maxlength="20" value="' + esc(c.school_year) + '"></div></div>';
  }

  /* ============================================================
     Class page
     ============================================================ */
  var current = null; // the class bundle on screen
  var photoUrlCache = {};

  function classView(id, tab) {
    tab = tab || "seedlings";
    loading("home");
    api.getClass(id).then(function (bundle) {
      if (!bundle.cls) {
        render(shell('<div class="p-empty"><h1 class="h3">Class not found</h1><p>It may have been deleted, or it belongs to another teacher.</p><a class="btn btn--blue" href="#/">Back to my classes</a></div>', "home"));
        return;
      }
      current = bundle;
      var paths = bundle.photos.map(function (p) { return p.storage_path; }).filter(function (p) { return !photoUrlCache[p]; });
      return api.photoUrls(paths).then(function (map) {
        Object.assign(photoUrlCache, map);
        drawClass(tab);
      });
    }).catch(function (e) { failed(e, "home"); });
  }

  function drawClass(tab) {
    var b = current, c = b.cls;
    var tabs = [["seedlings", "Seedlings", b.seedlings.length], ["roster", "Roster", b.students.length], ["photos", "Photos", b.photos.length], ["certificates", "Certificates"]];
    var growing = b.seedlings.filter(function (s) { return s.status === "growing"; }).length;
    var planted = b.seedlings.filter(function (s) { return s.status === "planted"; }).length;
    var head =
      '<p class="crumbs-p"><a href="#/">My classes</a></p>' +
      '<div class="p-head"><div><h1 class="p-title">' + esc(c.name) + "</h1>" +
      '<p class="p-sub">' + esc([c.grade_level ? (/^\d+$/.test(c.grade_level) ? "Grade " + c.grade_level : c.grade_level) : "", c.school_year].filter(Boolean).join(", ")) +
      (c.archived ? ' <span class="chip">Archived</span>' : "") + "</p></div>" +
      '<div class="p-head__actions"><button class="btn btn--outline" data-action="edit-class">Edit class</button></div></div>' +
      '<dl class="p-stats p-stats--small">' + stat(b.students.length, "Students") + stat(growing, "Growing") + stat(planted, "Replanted") + stat(b.logs.length, "Check-ins") + "</dl>" +
      '<nav class="p-tabs" aria-label="Class sections">' +
      tabs.map(function (t) {
        return '<a href="#/class/' + esc(c.id) + "/" + t[0] + '"' + (t[0] === tab ? ' aria-current="page"' : "") + ">" + t[1] + (t[2] != null ? ' <span class="count">' + t[2] + "</span>" : "") + "</a>";
      }).join("") + "</nav>";
    var body = { seedlings: seedlingsTab, roster: rosterTab, photos: photosTab, certificates: certificatesTab }[tab] || seedlingsTab;
    render(shell(head + '<div class="p-panel">' + body() + "</div>", "home"));
  }

  function studentName(id) {
    var s = current.students.find(function (x) { return x.id === id; });
    return s ? s.display_name : "";
  }

  /* ----- Seedlings tab ----- */
  function seedlingsTab() {
    var b = current;
    if (!b.seedlings.length) {
      return '<div class="p-empty"><h2 class="h3">No seedlings yet</h2><p>Add each propagule as it arrives. Give it a name and, if you like, a student caretaker.</p>' +
        '<button class="btn btn--blue" data-action="new-seedling">Add a seedling</button></div>';
    }
    var order = { growing: 0, planted: 1, lost: 2 };
    var list = b.seedlings.slice().sort(function (a, z) { return order[a.status] - order[z.status] || a.nickname.localeCompare(z.nickname); });
    return '<div class="p-toolbar"><p>' + plural(b.seedlings.length, "seedling") + '</p><button class="btn btn--blue" data-action="new-seedling">Add a seedling</button></div>' +
      '<ul class="seedlings">' + list.map(seedlingCard).join("") + "</ul>";
  }
  function seedlingCard(s) {
    var logs = current.logs.filter(function (l) { return l.seedling_id === s.id; });
    var last = logs[logs.length - 1];
    var photo = current.photos.find(function (p) { return p.seedling_id === s.id; });
    var img = photo && photoUrlCache[photo.storage_path];
    var caretaker = s.student_id ? studentName(s.student_id) : "Whole class";
    var facts = [];
    facts.push("<li><span>Caretaker</span>" + esc(caretaker) + "</li>");
    facts.push("<li><span>Started</span>" + fmtDate(s.started_on) + "</li>");
    if (s.status === "planted") facts.push("<li><span>Planted</span>" + fmtDate(s.planted_on) + (s.planting_site ? ", " + esc(s.planting_site) : "") + "</li>");
    else if (s.status === "growing") facts.push("<li><span>Growing for</span>" + plural(daysSince(s.started_on), "day") + "</li>");
    if (last) facts.push("<li><span>Last check-in</span>" + fmtDate(last.logged_on, { month: "short", day: "numeric" }) + (last.height_cm != null ? ", " + esc(last.height_cm) + " cm" : "") + (last.leaf_count != null ? ", " + plural(Number(last.leaf_count), "leaf", "leaves") : "") + "</li>");

    return '<li class="seedling seedling--' + s.status + '">' +
      '<div class="seedling__media">' + (img ? '<img src="' + esc(img) + '" alt="' + esc(s.nickname) + '">' : '<span class="seedling__placeholder" aria-hidden="true"></span>') + "</div>" +
      '<div class="seedling__body">' +
      '<div class="seedling__top"><h2 class="seedling__name">' + esc(s.nickname) + '</h2><span class="chip chip--' + s.status + '">' + STATUS[s.status] + "</span></div>" +
      '<p class="seedling__species">' + esc(SPECIES[s.species] || "") + "</p>" +
      '<ul class="seedling__facts">' + facts.join("") + "</ul>" +
      (logs.length > 1 ? '<div class="seedling__chart">' + sparkline(logs) + "<span>Height over " + plural(logs.length, "check-in") + "</span></div>" : "") +
      (s.notes ? '<p class="seedling__notes">' + esc(s.notes) + "</p>" : "") +
      '<div class="seedling__actions">' +
      (s.status === "growing" ? '<button class="btn btn--blue btn--sm" data-action="log" data-id="' + s.id + '">Log a check-in</button>' : "") +
      (s.status === "growing" ? '<button class="btn btn--outline btn--sm" data-action="plant" data-id="' + s.id + '">Mark planted</button>' : "") +
      '<button class="btn btn--outline btn--sm" data-action="history" data-id="' + s.id + '">History</button>' +
      '<button class="btn btn--outline btn--sm" data-action="edit-seedling" data-id="' + s.id + '">Edit</button>' +
      "</div></div></li>";
  }
  function seedlingForm(s) {
    s = s || { nickname: "", species: "red", student_id: null, started_on: today(), notes: "", status: "growing" };
    return '<div class="field"><label for="sf-name">Seedling name</label><input id="sf-name" name="nickname" required maxlength="60" value="' + esc(s.nickname) + '" placeholder="Sprout"></div>' +
      '<div class="field-row"><div class="field"><label for="sf-species">Species</label><select id="sf-species" name="species">' +
      Object.keys(SPECIES).map(function (k) { return '<option value="' + k + '"' + (k === s.species ? " selected" : "") + ">" + SPECIES[k] + "</option>"; }).join("") +
      '</select></div><div class="field"><label for="sf-student">Caretaker</label><select id="sf-student" name="student_id"><option value="">Whole class</option>' +
      current.students.map(function (st) { return '<option value="' + st.id + '"' + (st.id === s.student_id ? " selected" : "") + ">" + esc(st.display_name) + "</option>"; }).join("") +
      "</select></div></div>" +
      '<div class="field-row"><div class="field"><label for="sf-start">Started growing</label><input id="sf-start" name="started_on" type="date" required value="' + esc(s.started_on) + '"></div>' +
      (s.id ? '<div class="field"><label for="sf-status">Status</label><select id="sf-status" name="status">' + Object.keys(STATUS).map(function (k) { return '<option value="' + k + '"' + (k === s.status ? " selected" : "") + ">" + STATUS[k] + "</option>"; }).join("") + "</select></div>" : "") +
      "</div>" +
      '<div class="field"><label for="sf-notes">Notes</label><textarea id="sf-notes" name="notes" rows="3" maxlength="1000">' + esc(s.notes) + "</textarea></div>";
  }

  /* ----- Roster tab ----- */
  function rosterTab() {
    var b = current;
    var seedsBy = {};
    b.seedlings.forEach(function (s) { if (s.student_id) (seedsBy[s.student_id] = seedsBy[s.student_id] || []).push(s.nickname); });
    var rows = b.students.map(function (st) {
      return "<tr><th scope=\"row\">" + esc(st.display_name) + "</th><td>" + esc((seedsBy[st.id] || []).join(", ") || "None yet") + "</td>" +
        '<td class="t-actions"><button class="linkish" data-action="rename-student" data-id="' + st.id + '">Rename</button>' +
        '<button class="linkish linkish--danger" data-action="delete-student" data-id="' + st.id + '">Remove</button></td></tr>';
    }).join("");
    return '<div class="p-toolbar"><p>' + plural(b.students.length, "student") + "</p>" +
      '<div class="p-toolbar__actions"><button class="btn btn--outline" data-action="import-roster">Import a roster</button></div></div>' +
      '<form class="inline-add" data-form="add-student" novalidate><label for="add-st">Add a student</label>' +
      '<div class="inline-add__row"><input id="add-st" name="name" maxlength="60" placeholder="First name and last initial" required><button class="btn btn--blue" type="submit">Add</button></div></form>' +
      (b.students.length
        ? '<div class="table-wrap"><table class="p-table"><thead><tr><th scope="col">Student</th><th scope="col">Caring for</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead><tbody>' + rows + "</tbody></table></div>"
        : '<div class="p-empty p-empty--quiet"><p>Add students one at a time above, or import a list from a spreadsheet.</p></div>') +
      '<p class="privacy-note">For student privacy, use first names and last initials only. Only you and the My Pet Mangrove team can see this roster.</p>';
  }

  /* ----- Photos tab ----- */
  function photosTab() {
    var b = current;
    var opts = '<option value="">The whole class</option>' + b.seedlings.map(function (s) { return '<option value="' + s.id + '">' + esc(s.nickname) + "</option>"; }).join("");
    var upload =
      '<form class="upload" data-form="upload" novalidate>' +
      '<div class="upload__drop"><label for="up-files"><strong>Add photos</strong><span>JPG or PNG. Seedlings only, please: no student faces.</span></label>' +
      '<input id="up-files" name="files" type="file" accept="image/*" multiple required></div>' +
      '<div class="field-row"><div class="field"><label for="up-seed">Which seedling?</label><select id="up-seed" name="seedling_id">' + opts + "</select></div>" +
      '<div class="field"><label for="up-cap">Caption</label><input id="up-cap" name="caption" maxlength="200" placeholder="First new leaf!"></div></div>' +
      '<label class="check"><input type="checkbox" name="share_ok"> OK for My Pet Mangrove to feature on the website</label>' +
      '<button class="btn btn--blue" type="submit">Upload</button><p class="form-status" role="status" aria-live="polite"></p></form>';
    var grid = b.photos.length
      ? '<ul class="photo-grid">' + b.photos.map(function (p) {
          var url = photoUrlCache[p.storage_path];
          var seed = b.seedlings.find(function (s) { return s.id === p.seedling_id; });
          var badge = p.approved ? '<span class="chip chip--planted">On the website</span>' : p.share_ok ? '<span class="chip">Shared, awaiting review</span>' : '<span class="chip chip--muted">Private</span>';
          return '<li class="photo">' + (url ? '<img src="' + esc(url) + '" alt="' + esc(p.caption || (seed ? seed.nickname : "Class photo")) + '" loading="lazy">' : '<span class="seedling__placeholder"></span>') +
            '<div class="photo__body"><p class="photo__cap">' + esc(p.caption || "No caption") + "</p>" +
            '<p class="photo__meta">' + esc(seed ? seed.nickname : "Whole class") + ", " + fmtDate(p.created_at, { month: "short", day: "numeric" }) + "</p>" + badge +
            '<div class="photo__actions"><label class="check check--sm"><input type="checkbox" data-action="toggle-share" data-id="' + p.id + '"' + (p.share_ok ? " checked" : "") + "> OK to feature</label>" +
            '<button class="linkish linkish--danger" data-action="delete-photo" data-id="' + p.id + '">Delete</button></div></div></li>';
        }).join("") + "</ul>"
      : '<div class="p-empty p-empty--quiet"><p>No photos yet. A photo every week or two makes a great growth record.</p></div>';
    return upload + grid;
  }

  /* ----- Certificates tab ----- */
  function certificatesTab() {
    var b = current;
    if (!b.students.length) {
      return '<div class="p-empty"><h2 class="h3">Add your roster first</h2><p>Certificates are made for each student on your roster.</p><a class="btn btn--blue" href="#/class/' + esc(b.cls.id) + '/roster">Go to roster</a></div>';
    }
    var list = b.students.map(function (st) {
      var seeds = b.seedlings.filter(function (s) { return s.student_id === st.id; });
      var planted = seeds.some(function (s) { return s.status === "planted"; });
      return '<li><label class="check"><input type="checkbox" name="students" value="' + st.id + '" checked> ' + esc(st.display_name) +
        ' <span class="muted">' + (seeds.length ? esc(seeds.map(function (s) { return s.nickname; }).join(", ")) + (planted ? ", planted" : "") : "class seedlings") + "</span></label></li>";
    }).join("");
    return '<form class="cert-form" data-form="certificates" novalidate>' +
      '<div class="cert-form__options"><fieldset><legend>Certificate</legend>' +
      '<label class="check"><input type="radio" name="kind" value="caretaker" checked> Mangrove caretaker <span class="muted">for raising a seedling in class</span></label>' +
      '<label class="check"><input type="radio" name="kind" value="restorer"> Mangrove restorer <span class="muted">for seedlings that were planted</span></label></fieldset>' +
      '<div class="field"><label for="cert-date">Date on certificate</label><input id="cert-date" name="date" type="date" value="' + today() + '"></div>' +
      '<div class="field"><label for="cert-teacher">Teacher name to print</label><input id="cert-teacher" name="teacher" maxlength="80" value="' + esc((state.profile && state.profile.full_name) || "") + '"></div></div>' +
      '<fieldset class="cert-form__students"><legend>Students <button type="button" class="linkish" data-action="cert-all">Select all</button> <button type="button" class="linkish" data-action="cert-none">Clear</button></legend><ul class="check-list">' + list + "</ul></fieldset>" +
      '<button class="btn btn--blue" type="submit">Preview and print</button></form>' +
      '<div class="cert-preview" data-cert-preview></div>';
  }
  function buildCertificates(form) {
    var b = current;
    var kind = form.querySelector('[name="kind"]:checked').value;
    var date = form.querySelector('[name="date"]').value || today();
    var teacher = form.querySelector('[name="teacher"]').value.trim();
    var school = (state.profile && state.profile.school) || "";
    var chosen = Array.prototype.map.call(form.querySelectorAll('[name="students"]:checked'), function (i) { return i.value; });
    var classSeeds = b.seedlings.filter(function (s) { return !s.student_id; });
    var certs = [];
    chosen.forEach(function (sid) {
      var st = b.students.find(function (x) { return x.id === sid; });
      var seeds = b.seedlings.filter(function (s) { return s.student_id === sid; });
      var plantedSeed = seeds.find(function (s) { return s.status === "planted"; }) || (seeds.length ? null : classSeeds.find(function (s) { return s.status === "planted"; }));
      if (kind === "restorer" && !plantedSeed) return;
      var seed = plantedSeed || seeds[0];
      var where = esc(b.cls.name) + (school ? " at " + esc(school) : "");
      var line;
      if (kind === "restorer") {
        line = "raised <strong>" + esc(seed.nickname) + "</strong>, a " + esc((SPECIES[seed.species] || "mangrove").toLowerCase()) + " seedling, in " + where +
          " and helped return it to the Indian River Lagoon" + (seed.planted_on ? " on " + fmtDate(seed.planted_on, { month: "long", day: "numeric", year: "numeric" }) : "") + ".";
      } else if (seed) {
        line = "cared for <strong>" + esc(seed.nickname) + "</strong>, a " + esc((SPECIES[seed.species] || "mangrove").toLowerCase()) + " seedling, as a class pet in " + where + ", helping grow Florida's next mangrove forest.";
      } else {
        line = "helped raise our class's mangrove seedlings in " + where + ", helping grow Florida's next mangrove forest.";
      }
      certs.push(
        '<article class="certificate">' +
        '<div class="certificate__frame">' +
        '<img class="certificate__logo" src="/images/site/logo-emblem.png" alt="">' +
        '<p class="certificate__org">My Pet Mangrove</p>' +
        '<h2 class="certificate__title">' + (kind === "restorer" ? "Certified Mangrove Restorer" : "Certified Mangrove Caretaker") + "</h2>" +
        '<p class="certificate__lede">This certifies that</p>' +
        '<p class="certificate__name">' + esc(st.display_name) + "</p>" +
        '<p class="certificate__line">' + line + "</p>" +
        '<div class="certificate__sigs">' +
        '<div><span class="sig">' + esc(teacher) + "</span><span>Teacher</span></div>" +
        "<div><span class=\"sig\">" + fmtDate(date, { month: "long", day: "numeric", year: "numeric" }) + "</span><span>Date</span></div>" +
        '<div><span class="sig">Alex Webster</span><span>Founder and CEO, My Pet Mangrove</span></div>' +
        "</div>" +
        '<p class="certificate__slogan">Adopt a Mangrove, Save the Planet.</p>' +
        "</div></article>"
      );
    });
    return certs;
  }

  /* ============================================================
     Account
     ============================================================ */
  function accountView() {
    var p = state.profile || {};
    render(shell(
      '<div class="p-head"><div><h1 class="p-title">Account</h1><p class="p-sub">' + esc(p.email || "") + "</p></div></div>" +
      '<div class="account-grid">' +
      '<form class="p-card" data-form="profile" novalidate><h2 class="h4">Your details</h2>' +
      '<div class="field"><label for="pf-name">Your name</label><input id="pf-name" name="full_name" required maxlength="120" value="' + esc(p.full_name) + '"></div>' +
      '<div class="field"><label for="pf-school">School</label><input id="pf-school" name="school" maxlength="160" value="' + esc(p.school) + '"></div>' +
      '<div class="field"><label for="pf-county">County</label><input id="pf-county" name="county" maxlength="80" value="' + esc(p.county) + '"></div>' +
      '<button class="btn btn--blue" type="submit">Save details</button><p class="form-status" role="status"></p></form>' +
      '<form class="p-card" data-form="password" novalidate><h2 class="h4">Change password</h2>' +
      field("password", "New password", "password", 'autocomplete="new-password" required minlength="8"', "At least 8 characters.") +
      '<button class="btn btn--blue" type="submit">Change password</button><p class="form-status" role="status"></p></form>' +
      "</div>" +
      '<p class="privacy-note">Want your account and class data deleted? Email <a href="mailto:' + esc(cfg.email) + '">' + esc(cfg.email) + "</a>.</p>",
      "account"
    ));
  }

  /* ============================================================
     Admin
     ============================================================ */
  var adminCache = {};
  function adminView(tab) {
    tab = tab || "overview";
    if (!state.profile || state.profile.role !== "admin") { location.hash = "#/"; return; }
    loading("admin");
    var loaders = {
      overview: function () { return api.adminData(); },
      messages: function () { return api.listInquiries(); },
      photos: function () {
        return api.photoQueue().then(function (rows) {
          return api.photoUrls(rows.map(function (r) { return r.storage_path; })).then(function (map) { Object.assign(photoUrlCache, map); return rows; });
        });
      },
      newsletter: function () { return api.listSubscribers(); },
    };
    (loaders[tab] || loaders.overview)().then(function (data) {
      adminCache[tab] = data;
      var tabs = [["overview", "Overview"], ["messages", "Messages"], ["photos", "Photo review"], ["newsletter", "Email list"]];
      var head = '<div class="p-head"><div><h1 class="p-title">Admin</h1><p class="p-sub">Everything across all teachers and website forms.</p></div></div>' +
        '<nav class="p-tabs" aria-label="Admin sections">' + tabs.map(function (t) { return '<a href="#/admin/' + t[0] + '"' + (t[0] === tab ? ' aria-current="page"' : "") + ">" + t[1] + "</a>"; }).join("") + "</nav>";
      var body = { overview: adminOverview, messages: adminMessages, photos: adminPhotos, newsletter: adminNewsletter }[tab](data);
      render(shell(head + '<div class="p-panel">' + body + "</div>", "admin"));
    }).catch(function (e) { failed(e, "admin"); });
  }
  function adminOverview(d) {
    var byTeacher = {};
    d.classes.forEach(function (c) {
      var t = (byTeacher[c.teacher_id] = byTeacher[c.teacher_id] || { classes: 0, students: 0, seedlings: 0, planted: 0 });
      t.classes++; t.students += c.students; t.seedlings += c.seedlings.length;
      t.planted += c.seedlings.filter(function (s) { return s.status === "planted"; }).length;
    });
    var all = d.classes.reduce(function (a, c) { return a.concat(c.seedlings); }, []);
    var waiting = d.photos.filter(function (p) { return p.share_ok && !p.approved; }).length;
    var stats = '<dl class="p-stats">' +
      stat(d.profiles.length, "Teachers") +
      stat(d.classes.length, "Classes") +
      stat(d.classes.reduce(function (a, c) { return a + c.students; }, 0), "Students") +
      stat(all.filter(function (s) { return s.status === "growing"; }).length, "Seedlings growing") +
      stat(all.filter(function (s) { return s.status === "planted"; }).length, "Replanted") +
      stat(waiting, "Photos to review") + "</dl>";
    var rows = d.profiles.map(function (p) {
      var t = byTeacher[p.id] || { classes: 0, students: 0, seedlings: 0, planted: 0 };
      return "<tr><th scope=\"row\">" + esc(p.full_name || "(no name)") + (p.role === "admin" ? ' <span class="chip">Admin</span>' : "") + "<br><a href=\"mailto:" + esc(p.email) + '">' + esc(p.email) + "</a></td>" +
        "<td>" + esc(p.school) + (p.county ? "<br><span class=\"muted\">" + esc(p.county) + " County</span>" : "") + "</td>" +
        '<td class="num">' + t.classes + '</td><td class="num">' + t.students + '</td><td class="num">' + t.seedlings + '</td><td class="num">' + t.planted + "</td>" +
        "<td>" + fmtDate(p.created_at) + "</td></tr>";
    }).join("");
    return stats + '<h2 class="h4">Teachers</h2><div class="table-wrap"><table class="p-table"><thead><tr><th scope="col">Teacher</th><th scope="col">School</th><th scope="col" class="num">Classes</th><th scope="col" class="num">Students</th><th scope="col" class="num">Seedlings</th><th scope="col" class="num">Planted</th><th scope="col">Joined</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
      '<p class="privacy-note">The homepage shows the live totals for growing, replanted, students and schools automatically.</p>';
  }
  function adminMessages(rows) {
    if (!rows.length) return '<div class="p-empty p-empty--quiet"><p>No messages yet. Website form messages land here.</p></div>';
    var open = rows.filter(function (r) { return !r.handled; }).length;
    return '<p class="p-toolbar">' + plural(open, "message") + " waiting for a reply</p>" +
      '<ul class="messages">' + rows.map(function (m) {
        var details = Object.keys(m.details || {}).map(function (k) { return "<li><span>" + esc(k.replace(/_/g, " ")) + "</span> " + esc(m.details[k]) + "</li>"; }).join("");
        return '<li class="message' + (m.handled ? " is-handled" : "") + '">' +
          '<div class="message__top"><span class="chip">' + esc(KINDS[m.kind] || m.kind) + "</span><time>" + fmtDate(m.created_at) + "</time></div>" +
          '<p class="message__from"><strong>' + esc(m.name) + "</strong>" + (m.organization ? ", " + esc(m.organization) : "") + ' <a href="mailto:' + esc(m.email) + "?subject=" + encodeURIComponent("Re: My Pet Mangrove") + '">' + esc(m.email) + "</a></p>" +
          (m.message ? '<p class="message__body">' + esc(m.message) + "</p>" : "") +
          (details ? '<ul class="message__details">' + details + "</ul>" : "") +
          '<div class="message__actions"><label class="check check--sm"><input type="checkbox" data-action="toggle-handled" data-id="' + m.id + '"' + (m.handled ? " checked" : "") + "> Replied</label>" +
          '<button class="linkish linkish--danger" data-action="delete-message" data-id="' + m.id + '">Delete</button></div></li>';
      }).join("") + "</ul>";
  }
  function adminPhotos(rows) {
    if (!rows.length) return '<div class="p-empty p-empty--quiet"><p>No shared photos yet. When a teacher marks a photo as OK to feature, it shows up here for you to approve.</p></div>';
    rows = rows.slice().sort(function (a, b) { return a.approved - b.approved; });
    return '<p class="p-toolbar">Approved photos appear in “From our classrooms” on the homepage.</p><ul class="photo-grid">' + rows.map(function (p) {
      var url = photoUrlCache[p.storage_path];
      return '<li class="photo">' + (url ? '<img src="' + esc(url) + '" alt="' + esc(p.caption || "Classroom photo") + '" loading="lazy">' : "") +
        '<div class="photo__body"><p class="photo__cap">' + esc(p.caption || "No caption") + "</p>" +
        '<p class="photo__meta">' + esc((p.profiles && p.profiles.full_name) || "") + ", " + esc((p.profiles && p.profiles.school) || "") + "</p>" +
        (p.approved ? '<span class="chip chip--planted">On the website</span>' : '<span class="chip">Waiting</span>') +
        '<div class="photo__actions">' + (p.approved
          ? '<button class="btn btn--outline btn--sm" data-action="unapprove" data-id="' + p.id + '">Take down</button>'
          : '<button class="btn btn--blue btn--sm" data-action="approve" data-id="' + p.id + '">Approve</button>') +
        "</div></div></li>";
    }).join("") + "</ul>";
  }
  function adminNewsletter(rows) {
    if (!rows.length) return '<div class="p-empty p-empty--quiet"><p>No sign-ups yet. The footer form on every page adds people here.</p></div>';
    return '<div class="p-toolbar"><p>' + plural(rows.length, "person", "people") + ' on the list</p><div class="p-toolbar__actions"><button class="btn btn--outline" data-action="copy-emails">Copy all emails</button><button class="btn btn--blue" data-action="download-emails">Download CSV</button></div></div>' +
      '<div class="table-wrap"><table class="p-table"><thead><tr><th scope="col">Email</th><th scope="col">Joined</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead><tbody>' +
      rows.map(function (r) { return "<tr><td>" + esc(r.email) + "</td><td>" + fmtDate(r.created_at) + '</td><td class="t-actions"><button class="linkish linkish--danger" data-action="delete-subscriber" data-email="' + esc(r.email) + '">Remove</button></td></tr>'; }).join("") +
      "</tbody></table></div>";
  }

  /* ============================================================
     Router
     ============================================================ */
  function route() {
    var hash = location.hash || "#/";
    if (/access_token|type=recovery/.test(hash)) {
      if (!state.user) return; // Supabase is still reading the email link
      history.replaceState(null, "", location.pathname + "#/");
      hash = "#/";
    }
    var parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    if (state.recovering) return authView("newpw");
    if (!state.user) {
      var mode = { signup: "signup", reset: "reset" }[parts[0]] || "signin";
      var notice = state.flash; state.flash = null;
      return authView(mode, notice);
    }
    if (parts[0] === "class" && parts[1]) return classView(parts[1], parts[2]);
    if (parts[0] === "admin") return adminView(parts[1]);
    if (parts[0] === "account") return accountView();
    if (["signin", "signup", "reset"].indexOf(parts[0]) !== -1) { location.replace("#/"); return; }
    dashboardView();
  }
  function refreshClass() {
    var parts = (location.hash || "").replace(/^#\/?/, "").split("/");
    classView(parts[1], parts[2]);
  }

  /* ============================================================
     Events
     ============================================================ */
  root.addEventListener("submit", function (e) {
    var form = e.target.closest("[data-form]");
    if (!form) return;
    e.preventDefault();
    var kind = form.getAttribute("data-form");
    var status = form.querySelector(".form-status");
    function say(msg, ok) { if (status) { status.className = "form-status " + (ok ? "is-ok" : "is-error"); status.textContent = msg; } }
    var invalid = Array.prototype.find.call(form.elements, function (el) { return el.willValidate && !el.checkValidity(); });
    if (invalid && kind !== "certificates") {
      var label = form.querySelector('label[for="' + invalid.id + '"]');
      say((label ? label.textContent + ": " : "") + invalid.validationMessage);
      invalid.focus();
      return;
    }
    var v = function (n) { var el = form.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ""; };
    var btn = form.querySelector('button[type="submit"]');
    function busy(on) { if (btn) { btn.disabled = on; btn.setAttribute("aria-busy", String(on)); } }

    var handlers = {
      signin: function () {
        return api.signIn(v("email"), form.querySelector('[name="password"]').value);
      },
      signup: function () {
        return api.signUp(v("email"), form.querySelector('[name="password"]').value, { full_name: v("full_name"), school: v("school"), county: v("county") })
          .then(function (r) {
            if (api.live && r && !r.session) {
              form.reset();
              say("Almost done: check your email and open the confirmation link, then log in here.", true);
            }
          });
      },
      reset: function () {
        return api.sendReset(v("email")).then(function () { say("If that email has an account, a reset link is on its way. Open it on this device.", true); });
      },
      newpw: function () {
        return api.setPassword(form.querySelector('[name="password"]').value).then(function () {
          state.recovering = false;
          toast("Password saved. You're logged in.");
          location.hash = "#/";
          route();
        });
      },
      profile: function () {
        var f = { full_name: v("full_name"), school: v("school"), county: v("county") };
        return api.saveProfile(f).then(function () { Object.assign(state.profile, f); say("Saved.", true); });
      },
      password: function () {
        return api.setPassword(form.querySelector('[name="password"]').value).then(function () { form.reset(); say("Password changed.", true); });
      },
      "add-student": function () {
        var name = rosterName(v("name"), false);
        return api.addStudents(current.cls.id, [name]).then(function (rows) {
          current.students = current.students.concat(rows).sort(function (a, b) { return a.display_name.localeCompare(b.display_name); });
          drawClass("roster");
          var input = root.querySelector("#add-st");
          if (input) input.focus();
          toast(name + " added.");
        });
      },
      upload: function () {
        var files = Array.prototype.slice.call(form.querySelector('[name="files"]').files || []);
        if (!files.length) { say("Choose at least one photo."); return Promise.resolve(); }
        var meta = { seedling_id: v("seedling_id") || null, caption: v("caption"), share_ok: form.querySelector('[name="share_ok"]').checked };
        var done = 0;
        say("Uploading 1 of " + files.length + "…", true);
        return files.reduce(function (chain, file) {
          return chain.then(function () {
            return shrinkImage(file).then(function (blob) { return api.uploadPhoto(current.cls.id, blob, meta); }).then(function (row) {
              current.photos.unshift(row);
              done++;
              if (done < files.length) say("Uploading " + (done + 1) + " of " + files.length + "…", true);
            });
          });
        }, Promise.resolve()).then(function () {
          return api.photoUrls(current.photos.map(function (p) { return p.storage_path; }).filter(function (p) { return !photoUrlCache[p]; }));
        }).then(function (map) {
          Object.assign(photoUrlCache, map);
          drawClass("photos");
          toast(plural(done, "photo") + " uploaded.");
        });
      },
      certificates: function () {
        var certs = buildCertificates(form);
        var preview = root.querySelector("[data-cert-preview]");
        if (!certs.length) {
          preview.innerHTML = '<p class="notice">' + (form.querySelector('[name="kind"]:checked').value === "restorer"
            ? "None of the selected students have a planted seedling yet. Mark seedlings as planted on the Seedlings tab, or choose the caretaker certificate."
            : "Select at least one student.") + "</p>";
          return Promise.resolve();
        }
        preview.innerHTML = '<div class="p-toolbar"><p>' + plural(certs.length, "certificate") + ' ready. Print on letter paper, landscape.</p><button class="btn btn--blue" type="button" data-action="print">Print certificates</button></div><div class="cert-sheet">' + certs.join("") + "</div>";
        preview.scrollIntoView({ behavior: "smooth", block: "start" });
        return Promise.resolve();
      },
    };
    if (!handlers[kind]) return;
    if (status) { status.className = "form-status"; status.textContent = ""; }
    busy(true);
    Promise.resolve().then(handlers[kind]).catch(function (err) { say(errText(err)); }).finally(function () { busy(false); });
  });

  root.addEventListener("click", function (e) {
    var el = e.target.closest("[data-action]");
    if (!el || el.type === "checkbox") return;
    var action = el.getAttribute("data-action");
    var id = el.getAttribute("data-id");
    var seed = id && current && current.seedlings.find(function (s) { return s.id === id; });

    var actions = {
      "demo-login": function () { api.signIn(); },
      "sign-out": function () { api.signOut(); },
      reload: function () { route(); },
      print: function () { window.print(); },
      "new-class": function () {
        openDialog("New class", classForm(), "Create class", function (f) {
          return api.createClass({ name: fe(f, "name").value.trim(), grade_level: fe(f, "grade_level").value, school_year: fe(f, "school_year").value.trim() }).then(function (row) {
            location.hash = "#/class/" + row.id + "/roster";
            toast("Class created. Add your students next.");
          });
        });
      },
      "edit-class": function () {
        var c = current.cls;
        openDialog("Edit class", classForm(c) +
          '<label class="check"><input type="checkbox" name="archived"' + (c.archived ? " checked" : "") + "> Archive this class (hide it from your dashboard)</label>" +
          '<div class="danger-zone"><p>Deleting a class removes its roster, seedlings, check-ins and photos for good.</p><button type="button" class="btn btn--danger btn--sm" data-dialog-action="delete-class">Delete class</button></div>',
          "Save", function (f) {
            var upd = { name: fe(f, "name").value.trim(), grade_level: fe(f, "grade_level").value, school_year: fe(f, "school_year").value.trim(), archived: fe(f, "archived").checked };
            return api.updateClass(c.id, upd).then(function () { Object.assign(current.cls, upd); drawClass("seedlings"); toast("Class saved."); });
          });
      },
      "new-seedling": function () {
        openDialog("Add a seedling", seedlingForm(), "Add seedling", function (f) {
          return api.addSeedling({ class_id: current.cls.id, nickname: fe(f, "nickname").value.trim(), species: fe(f, "species").value, student_id: fe(f, "student_id").value || null, started_on: fe(f, "started_on").value, notes: fe(f, "notes").value.trim() })
            .then(function (row) { current.seedlings.push(row); drawClass("seedlings"); toast(row.nickname + " added."); });
        });
      },
      "edit-seedling": function () {
        openDialog("Edit " + seed.nickname, seedlingForm(seed) +
          '<div class="danger-zone"><button type="button" class="btn btn--danger btn--sm" data-dialog-action="delete-seedling" data-id="' + seed.id + '">Delete seedling</button></div>',
          "Save", function (f) {
            var upd = { nickname: fe(f, "nickname").value.trim(), species: fe(f, "species").value, student_id: fe(f, "student_id").value || null, started_on: fe(f, "started_on").value, status: fe(f, "status").value, notes: fe(f, "notes").value.trim() };
            if (upd.status !== "planted") { upd.planted_on = null; }
            else if (!seed.planted_on) { upd.planted_on = today(); }
            return api.updateSeedling(seed.id, upd).then(function () { Object.assign(seed, upd); drawClass("seedlings"); toast("Saved."); });
          });
      },
      log: function () {
        openDialog("Check-in for " + seed.nickname,
          '<div class="field-row"><div class="field"><label for="lg-date">Date</label><input id="lg-date" name="logged_on" type="date" required value="' + today() + '"></div>' +
          '<div class="field"><label for="lg-h">Height (cm)</label><input id="lg-h" name="height_cm" type="number" min="0" max="999" step="0.1" inputmode="decimal"></div></div>' +
          '<div class="field"><label for="lg-l">Number of leaves</label><input id="lg-l" name="leaf_count" type="number" min="0" max="999" step="1" inputmode="numeric"></div>' +
          '<div class="field"><label for="lg-n">What did students notice?</label><textarea id="lg-n" name="note" rows="3" maxlength="500" placeholder="New root at the bottom, water topped up"></textarea></div>',
          "Save check-in", function (f) {
            return api.addLog({ seedling_id: seed.id, logged_on: fe(f, "logged_on").value, height_cm: fe(f, "height_cm").value === "" ? null : Number(fe(f, "height_cm").value), leaf_count: fe(f, "leaf_count").value === "" ? null : Number(fe(f, "leaf_count").value), note: fe(f, "note").value.trim() })
              .then(function (row) { current.logs.push(row); current.logs.sort(function (a, b) { return a.logged_on < b.logged_on ? -1 : 1; }); drawClass("seedlings"); toast("Check-in saved."); });
          });
      },
      plant: function () {
        openDialog("Mark " + seed.nickname + " as planted",
          '<div class="field"><label for="pl-date">Planting date</label><input id="pl-date" name="planted_on" type="date" required value="' + today() + '"></div>' +
          '<div class="field"><label for="pl-site">Where was it planted?</label><input id="pl-site" name="planting_site" maxlength="160" placeholder="Partner site, Indian River Lagoon"></div>',
          "Mark planted", function (f) {
            var upd = { status: "planted", planted_on: fe(f, "planted_on").value, planting_site: fe(f, "planting_site").value.trim() };
            return api.updateSeedling(seed.id, upd).then(function () { Object.assign(seed, upd); drawClass("seedlings"); toast(seed.nickname + " is back in the lagoon."); });
          });
      },
      history: function () {
        var logs = current.logs.filter(function (l) { return l.seedling_id === seed.id; }).slice().reverse();
        var html = logs.length
          ? '<div class="table-wrap"><table class="p-table"><thead><tr><th scope="col">Date</th><th scope="col" class="num">Height</th><th scope="col" class="num">Leaves</th><th scope="col">Notes</th><th scope="col"><span class="visually-hidden">Actions</span></th></tr></thead><tbody>' +
            logs.map(function (l) {
              return "<tr><td>" + fmtDate(l.logged_on) + '</td><td class="num">' + (l.height_cm != null ? esc(l.height_cm) + " cm" : "") + '</td><td class="num">' + (l.leaf_count != null ? esc(l.leaf_count) : "") + "</td><td>" + esc(l.note) + '</td><td class="t-actions"><button type="button" class="linkish linkish--danger" data-dialog-action="delete-log" data-id="' + l.id + '">Delete</button></td></tr>';
            }).join("") + "</tbody></table></div>"
          : "<p>No check-ins yet.</p>";
        openDialog(seed.nickname + ": growth history", html + '<p><button type="button" class="linkish" data-dialog-action="export-log" data-id="' + seed.id + '">Download as CSV</button></p>', "Done", function () {});
      },
      "rename-student": function () {
        var st = current.students.find(function (x) { return x.id === id; });
        openDialog("Rename student", '<div class="field"><label for="rn">Name</label><input id="rn" name="name" required maxlength="60" value="' + esc(st.display_name) + '"></div>', "Save", function (f) {
          var n = fe(f, "name").value.trim();
          return api.updateStudent(id, n).then(function () { st.display_name = n; drawClass("roster"); });
        });
      },
      "delete-student": function () {
        var st = current.students.find(function (x) { return x.id === id; });
        if (!confirm("Remove " + st.display_name + " from this class? Their seedlings stay, cared for by the whole class.")) return;
        api.deleteStudent(id).then(function () {
          current.students = current.students.filter(function (x) { return x.id !== id; });
          current.seedlings.forEach(function (s) { if (s.student_id === id) s.student_id = null; });
          drawClass("roster");
          toast(st.display_name + " removed.");
        }).catch(function (err) { toast(errText(err), "error"); });
      },
      "import-roster": function () {
        openDialog("Import a roster",
          '<p>Paste names, one per line, or choose a CSV exported from your gradebook. Columns named “First name” and “Last name” (or “Name”) are picked up automatically.</p>' +
          '<div class="field"><label for="ir-file">CSV file</label><input id="ir-file" name="file" type="file" accept=".csv,.txt,text/csv,text/plain" data-roster-file></div>' +
          '<div class="field"><label for="ir-text">Or paste names</label><textarea id="ir-text" name="text" rows="7" placeholder="Maya Rodriguez&#10;Jonah Kim&#10;Taylor, Ava" data-roster-text></textarea></div>' +
          '<label class="check"><input type="checkbox" name="shorten" checked data-roster-shorten> Shorten last names to an initial (recommended)</label>' +
          '<div class="roster-preview" data-roster-preview></div>',
          "Add students", function (f) {
            var names = parseRoster(fe(f, "text").value).map(function (n) { return rosterName(n, fe(f, "shorten").checked); }).filter(Boolean);
            var existing = current.students.map(function (s) { return s.display_name.toLowerCase(); });
            names = names.filter(function (n, i) { return names.indexOf(n) === i && existing.indexOf(n.toLowerCase()) === -1; });
            if (!names.length) throw new Error("No new names found. Paste a list or choose a CSV file.");
            return api.addStudents(current.cls.id, names).then(function (rows) {
              current.students = current.students.concat(rows).sort(function (a, b) { return a.display_name.localeCompare(b.display_name); });
              drawClass("roster");
              toast(plural(rows.length, "student") + " added.");
            });
          });
      },
      "delete-photo": function () {
        var p = current.photos.find(function (x) { return x.id === id; });
        if (!confirm("Delete this photo? This can't be undone.")) return;
        api.deletePhoto(p).then(function () {
          current.photos = current.photos.filter(function (x) { return x.id !== id; });
          drawClass("photos");
          toast("Photo deleted.");
        }).catch(function (err) { toast(errText(err), "error"); });
      },
      "cert-all": function () { root.querySelectorAll('[name="students"]').forEach(function (i) { i.checked = true; }); },
      "cert-none": function () { root.querySelectorAll('[name="students"]').forEach(function (i) { i.checked = false; }); },
      "delete-message": function () {
        if (!confirm("Delete this message?")) return;
        api.deleteInquiry(id).then(function () { adminView("messages"); });
      },
      approve: function () {
        var p = adminCache.photos.find(function (x) { return x.id === id; });
        el.disabled = true;
        api.approvePhoto(p).then(function () { toast("Approved. It's now on the homepage."); adminView("photos"); }).catch(function (err) { el.disabled = false; toast(errText(err), "error"); });
      },
      unapprove: function () {
        var p = adminCache.photos.find(function (x) { return x.id === id; });
        api.unapprovePhoto(p).then(function () { toast("Taken down from the website."); adminView("photos"); }).catch(function (err) { toast(errText(err), "error"); });
      },
      "copy-emails": function () {
        var list = (adminCache.newsletter || []).map(function (r) { return r.email; }).join(", ");
        navigator.clipboard.writeText(list).then(function () { toast("Emails copied. Paste them into the BCC line."); }, function () { toast("Couldn't copy. Use Download CSV instead.", "error"); });
      },
      "download-emails": function () {
        var rows = [["email", "joined"]].concat((adminCache.newsletter || []).map(function (r) { return [r.email, r.created_at.slice(0, 10)]; }));
        downloadCsv("planting-day-news.csv", rows);
      },
      "delete-subscriber": function () {
        var email = el.getAttribute("data-email");
        if (!confirm("Remove " + email + " from the email list?")) return;
        api.deleteSubscriber(email).then(function () { adminView("newsletter"); });
      },
    };
    if (actions[action]) { e.preventDefault(); actions[action](); }
  });

  // Checkbox toggles
  root.addEventListener("change", function (e) {
    var el = e.target;
    var action = el.getAttribute && el.getAttribute("data-action");
    var id = el.getAttribute && el.getAttribute("data-id");
    if (action === "toggle-share") {
      api.updatePhoto(id, { share_ok: el.checked }).then(function () {
        var p = current.photos.find(function (x) { return x.id === id; });
        p.share_ok = el.checked;
        if (!el.checked) p.approved = false;
        drawClass("photos");
        toast(el.checked ? "Shared with My Pet Mangrove for review." : "Photo is private again.");
      }).catch(function (err) { el.checked = !el.checked; toast(errText(err), "error"); });
    }
    if (action === "toggle-handled") {
      api.setInquiryHandled(id, el.checked).then(function () {
        el.closest(".message").classList.toggle("is-handled", el.checked);
      }).catch(function (err) { el.checked = !el.checked; toast(errText(err), "error"); });
    }
  });

  // Actions inside the dialog
  dialog.addEventListener("click", function (e) {
    var el = e.target.closest("[data-dialog-action]");
    if (!el) return;
    var action = el.getAttribute("data-dialog-action");
    var id = el.getAttribute("data-id");
    if (action === "delete-class") {
      if (!confirm("Delete " + current.cls.name + " and everything in it? This can't be undone.")) return;
      api.deleteClass(current.cls.id).then(function () { dialog.close(); toast("Class deleted."); location.hash = "#/"; })
        .catch(function (err) { toast(errText(err), "error"); });
    }
    if (action === "delete-seedling") {
      var s = current.seedlings.find(function (x) { return x.id === id; });
      if (!confirm("Delete " + s.nickname + " and its check-ins? Photos stay in the class.")) return;
      api.deleteSeedling(id).then(function () {
        current.seedlings = current.seedlings.filter(function (x) { return x.id !== id; });
        current.logs = current.logs.filter(function (l) { return l.seedling_id !== id; });
        current.photos.forEach(function (p) { if (p.seedling_id === id) p.seedling_id = null; });
        dialog.close();
        drawClass("seedlings");
        toast("Seedling deleted.");
      }).catch(function (err) { toast(errText(err), "error"); });
    }
    if (action === "delete-log") {
      api.deleteLog(id).then(function () {
        current.logs = current.logs.filter(function (l) { return l.id !== id; });
        el.closest("tr").remove();
        drawClass("seedlings");
      }).catch(function (err) { toast(errText(err), "error"); });
    }
    if (action === "export-log") {
      var seed = current.seedlings.find(function (x) { return x.id === id; });
      var rows = [["date", "height_cm", "leaves", "note"]].concat(current.logs.filter(function (l) { return l.seedling_id === id; }).map(function (l) { return [l.logged_on, l.height_cm == null ? "" : l.height_cm, l.leaf_count == null ? "" : l.leaf_count, l.note || ""]; }));
      downloadCsv(seed.nickname.replace(/[^\w-]+/g, "-").toLowerCase() + "-growth.csv", rows);
    }
  });

  // Roster import: live preview of the names that will be added
  dialog.addEventListener("input", rosterPreview);
  dialog.addEventListener("change", function (e) {
    if (e.target.matches("[data-roster-file]") && e.target.files[0]) {
      e.target.files[0].text().then(function (t) {
        dialog.querySelector("[data-roster-text]").value = t;
        rosterPreview();
      });
    } else rosterPreview();
  });
  function rosterPreview() {
    var box = dialog.querySelector("[data-roster-preview]");
    if (!box) return;
    var shorten = dialog.querySelector("[data-roster-shorten]").checked;
    var names = parseRoster(dialog.querySelector("[data-roster-text]").value).map(function (n) { return rosterName(n, shorten); }).filter(Boolean);
    box.innerHTML = names.length
      ? "<p><strong>" + plural(names.length, "student") + " will be added:</strong></p><ul>" + names.slice(0, 40).map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("") + (names.length > 40 ? "<li>…and " + (names.length - 40) + " more</li>" : "") + "</ul>"
      : "";
  }

  function downloadCsv(name, rows) {
    var csv = rows.map(function (r) { return r.map(function (c) { var s = String(c); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(","); }).join("\n");
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ============================================================
     Start
     ============================================================ */
  function loadProfile() {
    return api.getProfile().then(function (p) { state.profile = p; }).catch(function () { state.profile = { full_name: "", role: "teacher", email: state.user.email }; });
  }

  api.onAuth(function (event, user) {
    if (event === "PASSWORD_RECOVERY") { state.user = user; state.recovering = true; history.replaceState(null, "", location.pathname + "#/"); route(); return; }
    if (event === "SIGNED_IN" && (!state.user || state.user.id !== (user && user.id))) {
      state.user = user;
      loadProfile().then(function () {
        if (/access_token|type=/.test(location.hash)) history.replaceState(null, "", location.pathname + "#/");
        route();
      });
      return;
    }
    if (event === "SIGNED_OUT") { state.user = null; state.profile = null; current = null; location.hash = "#/signin"; route(); }
  });
  window.addEventListener("hashchange", route);

  // Arriving from a "reset your password" email
  if (/type=recovery/.test(location.hash)) state.recovering = true;

  // Errors Supabase puts in the address bar (for example an expired email link)
  var hashParams = new URLSearchParams((location.hash || "").replace(/^#\/?/, ""));
  if (hashParams.get("error_description")) {
    state.flash = hashParams.get("error_description").replace(/\+/g, " ") + ". You can request a new link below.";
    history.replaceState(null, "", location.pathname + "#/signin");
  }

  api.init().then(function (user) {
    state.user = user;
    return user ? loadProfile() : null;
  }).then(route).catch(function (e) {
    root.innerHTML = '<div class="wrap portal-main"><div class="p-empty"><h1 class="h3">The portal couldn\'t start</h1><p>' + esc(errText(e)) + "</p></div></div>";
  });
})();
