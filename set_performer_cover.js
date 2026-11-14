// Set Performer Cover - Stash UI plugin
// Adds a button beside the Details / File Info / Edit tabs on an image page.
// Clicking it makes the current image the cover of the image's performer.
// With several performers on the image, it asks which one.
(function () {
  "use strict";

  const WRAP_ID = "spc-set-cover";

  // ------------------------------------------------------------ helpers ---
  async function gql(query, variables) {
    const res = await fetch(new URL("graphql", document.baseURI), {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    const json = await res.json();
    if (json.errors) throw new Error(json.errors.map((e) => e.message).join("; "));
    return json.data;
  }

  function currentImageId() {
    const m = window.location.pathname.match(/\/images\/(\d+)(?:\/|$)/);
    return m ? m[1] : null;
  }

  function findTabNav() {
    for (const nav of document.querySelectorAll(".nav-tabs, [role='tablist']")) {
      const t = nav.textContent || "";
      if (t.includes("Details") && t.includes("File Info")) return nav;
    }
    return null;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }

  // --------------------------------------------------------------- core ---
  async function loadImage(imageId) {
    const data = await gql(
      `query($id: ID!) { findImage(id: $id) { id paths { image } performers { id name } } }`,
      { id: imageId }
    );
    if (!data.findImage) throw new Error("Image not found");
    return data.findImage;
  }

  async function setCover(image, performer) {
    // Fetch the full image in the browser and send it as base64, so this works
    // even when Stash requires a login.
    const res = await fetch(image.paths.image, { credentials: "same-origin" });
    if (!res.ok) throw new Error(`Could not load image (${res.status})`);
    const dataUrl = await blobToDataUrl(await res.blob());
    await gql(
      `mutation($i: PerformerUpdateInput!) { performerUpdate(input: $i) { id } }`,
      { i: { id: performer.id, image: dataUrl } }
    );
  }

  // ----------------------------------------------------------------- UI ---
  function flash(btn, text, cls, ms = 2500) {
    btn.textContent = text;
    btn.className = `btn btn-sm ${cls}`;
    clearTimeout(btn._spcTimer);
    btn._spcTimer = setTimeout(() => {
      btn.textContent = "Set as performer cover";
      btn.className = "btn btn-sm btn-secondary";
      btn.disabled = false;
    }, ms);
  }

  function closeMenu(wrap) {
    const m = wrap.querySelector(".spc-menu");
    if (m) m.remove();
  }

  function showMenu(wrap, btn, image) {
    closeMenu(wrap);
    const menu = document.createElement("div");
    menu.className = "spc-menu dropdown-menu show";
    Object.assign(menu.style, { position: "absolute", top: "100%", left: "0", zIndex: 1050 });
    const header = document.createElement("h6");
    header.className = "dropdown-header";
    header.textContent = "Set cover for…";
    menu.appendChild(header);
    for (const p of image.performers) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "dropdown-item";
      item.textContent = p.name;
      item.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeMenu(wrap);
        run(btn, image, p);
      });
      menu.appendChild(item);
    }
    wrap.appendChild(menu);
    setTimeout(() => {
      document.addEventListener("click", () => closeMenu(wrap), { once: true });
    });
  }

  async function run(btn, image, performer) {
    btn.disabled = true;
    btn.textContent = "Setting cover…";
    try {
      await setCover(image, performer);
      flash(btn, `✓ Cover set for ${performer.name}`, "btn-success");
    } catch (err) {
      console.error("[Set Performer Cover]", err);
      btn.title = String(err.message || err);
      flash(btn, "Failed – see console", "btn-danger", 4000);
    }
  }

  function makeButton(imageId) {
    const wrap = document.createElement("div");
    wrap.id = WRAP_ID;
    wrap.dataset.imageId = imageId;
    wrap.className = "nav-item ml-3 d-flex align-items-center";
    wrap.style.position = "relative";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn btn-sm btn-secondary";
    btn.textContent = "Set as performer cover";
    btn.title = "Use this image as the performer's cover image";

    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (btn.disabled) return;
      try {
        const image = await loadImage(imageId); // fresh, in case performers were just edited
        if (!image.performers.length) {
          flash(btn, "No performer on this image", "btn-warning");
        } else if (image.performers.length === 1) {
          run(btn, image, image.performers[0]);
        } else {
          showMenu(wrap, btn, image);
        }
      } catch (err) {
        console.error("[Set Performer Cover]", err);
        flash(btn, "Failed – see console", "btn-danger", 4000);
      }
    });

    wrap.appendChild(btn);
    return wrap;
  }

  // Keep the button in place as Stash (React) re-renders and navigates.
  function ensure() {
    const id = currentImageId();
    const existing = document.getElementById(WRAP_ID);
    if (!id) {
      if (existing) existing.remove();
      return;
    }
    const nav = findTabNav();
    if (!nav) return;
    if (existing && existing.dataset.imageId === id && nav.contains(existing)) return;
    if (existing) existing.remove();
    nav.appendChild(makeButton(id));
  }

  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      ensure();
    });
  }).observe(document.body, { childList: true, subtree: true });

  ensure();
})();