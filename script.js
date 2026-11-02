// ================= CONFIG =================
const API_KEY = "AIzaSyCDzNdqidGRxlo8wWuUfrvlzxcK19NzeEw";
const YT_BASE = "https://www.googleapis.com/youtube/v3";

const RATES = { views: 0.05, likes: 0.30, subscribers: 2.00 };

const MONETIZATION = {
  subsReq: 1000,
  hoursReq: 4000,
  shortsViewsReq: 10_000_000,
  shortsWindowDays: 90,
  shortsMaxDuration: 60,
};

// ================= STATE =================
let currentChannel = null;
let currentVideos = [];
let selectedVideo = null;
let cart = JSON.parse(localStorage.getItem("tubeyCart")) || [];
let lastOrderBill = null;
let logoDataURL = null;

// Backwards compat: old cart items without scope
cart = cart.map(i => ({ ...i, scope: i.scope || "channel", meta: i.meta || "" }));

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 0 && /Mac/.test(navigator.platform));

// ================= LOGO PRELOAD (FIXED) =================
async function preloadLogo() {
  if (logoDataURL) return logoDataURL;

  try {
    // Fetch API ব্যবহার করে ইমেজ লোড করা হচ্ছে (CORS এরর এড়াতে)
    const response = await fetch("logo.jpg");
    if (!response.ok) throw new Error("Image not found");
    
    const blob = await response.blob();
    
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        logoDataURL = reader.result; // Base64 Data URL
        console.log("✅ Logo successfully converted to Base64");
        resolve(logoDataURL);
      };
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn("⚠️ Could not load logo.jpg — bill will show fallback 'T'");
    logoDataURL = null;
    return null;
  }
}

// ================= NAV =================
$$(".nav-pill").forEach(btn => {
  btn.addEventListener("click", () => {
    $$(".nav-pill").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    $$(".page").forEach(p => p.classList.remove("active"));
    $(`#${btn.dataset.page}-page`).classList.add("active");
  });
});

// ================= TOASTS =================
function showToast(message, type = "info") {
  const container = $("#toastContainer");
  const icons = {
    success: "fa-circle-check", error: "fa-circle-exclamation",
    info: "fa-circle-info", warning: "fa-triangle-exclamation",
  };
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fa-solid ${icons[type]}"></i> <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ================= ANIMATED COUNTER =================
function animateValue(el, start, end, duration = 900, formatter = fmt) {
  const startTime = performance.now();
  const step = (now) => {
    const progress = Math.min((now - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    el.textContent = formatter(Math.round(start + (end - start) * ease));
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ================= CART =================
function saveCart() { localStorage.setItem("tubeyCart", JSON.stringify(cart)); }

function updateCartUI() {
  const totalQty = cart.reduce((s, i) => s + i.qty, 0);
  const badge = $("#cartCount");
  badge.textContent = totalQty;
  badge.classList.remove("bump");
  void badge.offsetWidth;
  badge.classList.add("bump");

  const list = $("#cartItems");
  const totalEl = $("#cartTotal");
  list.innerHTML = "";

  if (cart.length === 0) {
    list.innerHTML = `<div class="cart-empty"><i class="fa-solid fa-cart-shopping"></i><p>Your cart is empty</p></div>`;
    totalEl.textContent = "0.00";
    return;
  }

  let total = 0;
  cart.forEach((item, idx) => {
    total += item.price * item.qty;
    const tag = item.scope === "video"
      ? `<span class="cart-item-tag video"><i class="fa-solid fa-film"></i> ${item.meta ? truncate(item.meta, 24) : "Video"}</span>`
      : `<span class="cart-item-tag channel"><i class="fa-brands fa-youtube"></i> ${item.meta ? truncate(item.meta, 24) : "Channel"}</span>`;

    const div = document.createElement("div");
    div.className = "cart-item";
    div.innerHTML = `
      <div class="cart-item-info">
        <span class="cart-item-name">${item.name}</span>
        ${tag}
      </div>
      <span class="cart-item-qty">×${item.qty}</span>
      <span class="cart-item-price">Tk ${(item.price * item.qty).toFixed(2)}</span>
      <button class="cart-item-remove" data-idx="${idx}"><i class="fa-solid fa-trash"></i></button>`;
    list.appendChild(div);
  });
  totalEl.textContent = total.toFixed(2);

  $$(".cart-item-remove").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const i = +e.currentTarget.dataset.idx;
      const removed = cart[i].name;
      cart.splice(i, 1);
      saveCart();
      updateCartUI();
      showToast(`Removed "${truncate(removed, 30)}"`, "info");
    });
  });
}

function addToCart(name, price, scope, meta) {
  const existing = cart.find(i =>
    i.name === name && i.scope === scope && i.meta === meta
  );
  if (existing) existing.qty++;
  else cart.push({ name, price, qty: 1, scope, meta });
  saveCart();
  updateCartUI();
  showToast(`Added to cart`, "success");
}

$("#cartBtn").addEventListener("click", () => {
  $("#cartModal").classList.remove("hidden");
  updateCartUI();
});
$("#modalClose").addEventListener("click", () => $("#cartModal").classList.add("hidden"));
$("#cartModal").addEventListener("click", (e) => {
  if (e.target.id === "cartModal") $("#cartModal").classList.add("hidden");
});

// ================= PACKS (channel-scope) =================
const packs = [
  { name: "500 Subscribers", price: 999, icon: "fa-users" },
  { name: "1,000 Subscribers", price: 1799, icon: "fa-users" },
  { name: "5,000 Views", price: 249, icon: "fa-eye" },
  { name: "20,000 Views", price: 899, icon: "fa-eye" },
  { name: "100 Likes", price: 29, icon: "fa-thumbs-up" },
  { name: "1,000 Likes", price: 249, icon: "fa-thumbs-up" },
  { name: "500 Watch Hours", price: 999, icon: "fa-clock" },
  { name: "1,000 Watch Hours", price: 1799, icon: "fa-clock" },
];

function renderPacks() {
  const grid = $("#packsGrid");
  grid.innerHTML = "";
  packs.forEach((p, i) => {
    const card = document.createElement("div");
    card.className = "pack-card";
    card.style.animation = `fadeIn 0.4s ease ${i * 0.05}s backwards`;
    card.innerHTML = `
      <div class="pack-icon"><i class="fa-solid ${p.icon}"></i></div>
      <div class="pack-name">${p.name}</div>
      <div class="pack-price">Tk ${p.price.toLocaleString()} <small>BDT</small></div>
      <button class="pack-btn" data-name="${p.name}" data-price="${p.price}">
        <i class="fa-solid fa-plus"></i> Add to Cart
      </button>`;
    grid.appendChild(card);
  });
  $$(".pack-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      addToCart(
        btn.dataset.name,
        +btn.dataset.price,
        "channel",
        currentChannel?.title || "Unbound Channel"
      );
    });
  });
}
renderPacks();

// ================= YOUTUBE API =================
async function ytFetch(endpoint, params) {
  const url = new URL(`${YT_BASE}/${endpoint}`);
  url.searchParams.set("key", API_KEY);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message || "API error");
  }
  return res.json();
}

function parseDuration(iso) {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
}

// ================= BIND =================
async function bindChannel() {
  const status = $("#bindStatus");
  const btn = $("#bindBtn");
  let handle = $("#handleInput").value.trim();
  if (!handle) handle = "@";

  status.textContent = "";
  status.className = "status-msg loading";
  status.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Fetching channel data…`;
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Binding…`;

  try {
    const chRes = await ytFetch("channels", {
      part: "snippet,statistics,brandingSettings",
      forHandle: handle,
    });
    if (!chRes.items || chRes.items.length === 0) throw new Error("Channel not found.");

    const ch = chRes.items[0];
    currentChannel = {
      id: ch.id,
      title: ch.snippet.title,
      description: ch.snippet.description || "",
      subscribers: +ch.statistics.subscriberCount,
      views: +ch.statistics.viewCount,
      videos: +ch.statistics.videoCount,
      avatar: ch.snippet.thumbnails?.high?.url || ch.snippet.thumbnails?.default?.url || "",
      banner: ch.brandingSettings?.image?.bannerExternalUrl || "",
    };

    const searchRes = await ytFetch("search", {
      part: "snippet",
      channelId: currentChannel.id,
      order: "date",
      maxResults: 25,
      type: "video",
    });
    const videoIds = searchRes.items.map(i => i.id.videoId).filter(Boolean).join(",");
    if (videoIds) {
      const vidRes = await ytFetch("videos", {
        part: "snippet,statistics,contentDetails",
        id: videoIds,
      });
      currentVideos = vidRes.items.map(v => {
        const dur = parseDuration(v.contentDetails.duration);
        return {
          id: v.id,
          title: v.snippet.title,
          published: v.snippet.publishedAt,
          thumbnail: v.snippet.thumbnails?.medium?.url || v.snippet.thumbnails?.default?.url || "",
          views: +v.statistics.viewCount,
          likes: +v.statistics.likeCount || 0,
          comments: +v.statistics.commentCount || 0,
          duration: dur,
          isShort: dur > 0 && dur <= MONETIZATION.shortsMaxDuration,
        };
      });
    } else {
      currentVideos = [];
    }

    status.className = "status-msg success";
    status.innerHTML = `<i class="fa-solid fa-circle-check"></i> Bound to <b>${currentChannel.title}</b>`;
    showToast(`Channel bound: ${currentChannel.title}`, "success");

    selectedVideo = null;
    $("#customBuySection").classList.add("hidden");

    renderChannelCard();
    renderVideoList();
    renderAnalysis();
    renderPrediction();
  } catch (err) {
    status.className = "status-msg error";
    status.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${err.message}`;
    showToast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.innerHTML = `<i class="fa-solid fa-link"></i> Bind Channel`;
  }
}

$("#bindBtn").addEventListener("click", bindChannel);
$("#handleInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); $("#bindBtn").click(); }
});

// ================= CHANNEL CARD =================
function renderChannelCard() {
  if (!currentChannel) return;

  const bannerImg = $("#bannerImg");
  if (currentChannel.banner) {
    bannerImg.src = currentChannel.banner;
    bannerImg.onerror = () => { bannerImg.style.display = "none"; };
    bannerImg.style.display = "block";
  } else {
    bannerImg.style.display = "none";
  }

  $("#channelAvatar").src = currentChannel.avatar;
  $("#channelAvatar").onerror = () => {
    const initial = currentChannel.title.charAt(0).toUpperCase();
    $("#channelAvatar").src = "data:image/svg+xml;utf8," + encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect fill='#8B5CF6' width='100' height='100'/><text x='50' y='68' font-size='52' text-anchor='middle' fill='white' font-family='sans-serif' font-weight='bold'>${initial}</text></svg>`
    );
  };

  $("#channelTitle").textContent = currentChannel.title;
  $("#channelDesc").textContent = currentChannel.description || "";

  animateValue($("#statSubs"), 0, currentChannel.subscribers);
  animateValue($("#statViews"), 0, currentChannel.views);
  animateValue($("#statVideos"), 0, currentChannel.videos);

  $("#channelStats").classList.remove("hidden");
}

// ================= VIDEO LIST (toggle select) =================
function renderVideoList() {
  if (currentVideos.length === 0) {
    $("#videoSection").classList.add("hidden");
    return;
  }
  $("#videoSection").classList.remove("hidden");
  const list = $("#videoList");
  list.innerHTML = "";

  currentVideos.forEach(v => {
    const item = document.createElement("div");
    item.className = "video-item";
    item.dataset.id = v.id;
    const thumbHTML = v.thumbnail
      ? `<img src="${v.thumbnail}" alt="" />`
      : `<i class="fa-brands fa-youtube"></i>`;
    const shortBadge = v.isShort ? ` <span style="color:var(--primary-light);font-weight:700;font-size:0.7rem;">· SHORT</span>` : "";
    item.innerHTML = `
      <div class="video-thumb">${thumbHTML}</div>
      <div class="video-info">
        <div class="video-title">${v.title}</div>
        <div class="video-meta">
          <i class="fa-solid fa-eye"></i> ${fmt(v.views)} ·
          <i class="fa-solid fa-thumbs-up"></i> ${fmt(v.likes)}${shortBadge}
        </div>
      </div>
      <i class="fa-solid fa-circle-check select-indicator"></i>
    `;

    item.addEventListener("click", () => {
      if (item.classList.contains("selected")) {
        item.classList.remove("selected");
        selectedVideo = null;
        $("#customBuySection").classList.add("hidden");
        showToast("Video deselected", "info");
      } else {
        $$(".video-item").forEach(i => i.classList.remove("selected"));
        item.classList.add("selected");
        selectedVideo = v;
        $("#customVideoLabel").textContent = truncate(v.title, 30);
        $("#customBuySection").classList.remove("hidden");
        showToast(`Selected: ${truncate(v.title, 40)}`, "info");
        setTimeout(() => {
          $("#customBuySection").scrollIntoView({ behavior: "smooth", block: "center" });
        }, 100);
      }
    });
    list.appendChild(item);
  });
}

// ================= CUSTOM BUY =================
function calcCustomTotal() {
  const views = +$("#customViews").value || 0;
  const likes = +$("#customLikes").value || 0;
  const subs = +$("#customSubs").value || 0;
  return views * RATES.views + likes * RATES.likes + subs * RATES.subscribers;
}

function updateCustomTotal() {
  $("#customTotal").textContent = calcCustomTotal().toFixed(2);
}
["#customViews", "#customLikes", "#customSubs"].forEach(sel => {
  $(sel).addEventListener("input", updateCustomTotal);
});

$("#addCustomBtn").addEventListener("click", () => {
  const views = +$("#customViews").value || 0;
  const likes = +$("#customLikes").value || 0;
  const subs = +$("#customSubs").value || 0;

  if (views === 0 && likes === 0 && subs === 0) {
    showToast("Please enter at least one quantity", "warning");
    return;
  }

  if (subs > 0) {
    addToCart(
      `Custom ${subs.toLocaleString()} Subscribers`,
      subs * RATES.subscribers,
      "channel",
      currentChannel?.title || "Unbound Channel"
    );
  }

  if (views > 0 || likes > 0) {
    if (!selectedVideo) {
      showToast("Select a video for views/likes", "warning");
      return;
    }
    const parts = [];
    if (views) parts.push(`${views.toLocaleString()} views`);
    if (likes) parts.push(`${likes.toLocaleString()} likes`);
    addToCart(
      `Custom ${parts.join(" + ")}`,
      views * RATES.views + likes * RATES.likes,
      "video",
      selectedVideo.title
    );
  }

  $("#customViews").value = 0;
  $("#customLikes").value = 0;
  $("#customSubs").value = 0;
  updateCustomTotal();
});

// ================= ANALYSIS =================
function renderAnalysis() {
  if (!currentChannel) return;
  $("#analysisEmpty").classList.add("hidden");
  $("#analysisContent").classList.remove("hidden");

  animateValue($("#anaSubs"), 0, currentChannel.subscribers);
  animateValue($("#anaViews"), 0, currentChannel.views);
  animateValue($("#anaVideos"), 0, currentChannel.videos);

  const feed = $("#recentVideos");
  feed.innerHTML = "";
  currentVideos.slice(0, 8).forEach(v => {
    const div = document.createElement("div");
    div.className = "feed-item";
    div.innerHTML = `
      <div class="feed-item-title">${v.title}</div>
      <div class="feed-item-stats">
        <span><i class="fa-solid fa-eye"></i> ${fmt(v.views)}</span>
        <span><i class="fa-solid fa-thumbs-up"></i> ${fmt(v.likes)}</span>
        <span><i class="fa-solid fa-comment"></i> ${fmt(v.comments)}</span>
      </div>`;
    feed.appendChild(div);
  });
}

// ================= PREDICTION =================
function estimateWatchHours() {
  if (currentVideos.length === 0) return 0;
  const totalViews = currentVideos.reduce((s, v) => s + v.views, 0);
  const avgViews = totalViews / currentVideos.length;
  return Math.round((avgViews * 5 * currentVideos.length) / 60);
}

function calculateShortsViews() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MONETIZATION.shortsWindowDays);
  return currentVideos
    .filter(v => v.isShort && new Date(v.published) >= cutoff)
    .reduce((s, v) => s + v.views, 0);
}

function renderPrediction() {
  if (!currentChannel) return;
  $("#predictionEmpty").classList.add("hidden");
  $("#predictionContent").classList.remove("hidden");

  const subs = currentChannel.subscribers;
  const watchHours = estimateWatchHours();
  const shortsViews = calculateShortsViews();

  const subsOk = subs >= MONETIZATION.subsReq;
  const hoursOk = watchHours >= MONETIZATION.hoursReq;
  const shortsOk = shortsViews >= MONETIZATION.shortsViewsReq;

  const pathA = subsOk && hoursOk;
  const pathB = subsOk && shortsOk;
  const monetized = pathA || pathB;

  const monText = $("#monetizationText");
  if (monetized) {
    const via = pathA ? "Path A (watch hours)" : "Path B (shorts views)";
    monText.innerHTML = `<i class="fa-solid fa-trophy" style="color: var(--success);"></i> <b>Monetized!</b> You've met the requirements via <b>${via}</b>.`;
  } else {
    const mSubsRate = 0.05;
    const mHoursRate = 0.03;
    const mShortsRate = 0.03;

    const subsNeeded = Math.max(0, MONETIZATION.subsReq - subs);
    const hoursNeeded = Math.max(0, MONETIZATION.hoursReq - watchHours);
    const shortsNeeded = Math.max(0, MONETIZATION.shortsViewsReq - shortsViews);

    const mSubs = Math.max(1, subs * mSubsRate);
    const mHours = Math.max(1, watchHours * mHoursRate);
    const mShorts = Math.max(1, shortsViews * mShortsRate);

    const monthsA = Math.max(subsNeeded / mSubs, hoursNeeded / mHours);
    const monthsB = Math.max(subsNeeded / mSubs, shortsNeeded / mShorts);
    const fastest = Math.min(monthsA, monthsB);
    const fastestPath = monthsA <= monthsB ? "Path A" : "Path B";

    if (!isFinite(fastest) || fastest > 60) {
      monText.innerHTML = `<i class="fa-solid fa-hourglass-half"></i> Not enough data to predict monetization reliably.`;
    } else {
      const days = Math.ceil(fastest * 30);
      const target = new Date();
      target.setDate(target.getDate() + days);
      monText.innerHTML = `<i class="fa-solid fa-calendar-check"></i> Estimated monetization in ~<b>${days} days</b> via <b>${fastestPath}</b> (around ${target.toDateString()}).`;
    }
  }

  const subsPct = Math.min(100, (subs / MONETIZATION.subsReq) * 100);
  const hoursPct = Math.min(100, (watchHours / MONETIZATION.hoursReq) * 100);
  const shortsPct = Math.min(100, (shortsViews / MONETIZATION.shortsViewsReq) * 100);

  setTimeout(() => {
    $("#subsProgress").style.width = subsPct + "%";
    $("#hoursProgress").style.width = hoursPct + "%";
    $("#subsProgress2").style.width = subsPct + "%";
    $("#shortsProgress").style.width = shortsPct + "%";
  }, 100);

  $("#subsProgressLabel").textContent = `${fmt(subs)} / 1,000`;
  $("#hoursProgressLabel").textContent = `${fmt(watchHours)} / 4,000`;
  $("#subsProgressLabel2").textContent = `${fmt(subs)} / 1,000`;
  $("#shortsProgressLabel").textContent = `${fmt(shortsViews)} / 10M`;

  const mSubsRate = 0.05, mViewsRate = 0.03;
  const sub1M = Math.round(subs * (1 + mSubsRate));
  const sub1Y = Math.round(subs * Math.pow(1 + mSubsRate, 12));
  const view1M = Math.round(currentChannel.views * (1 + mViewsRate));
  const view1Y = Math.round(currentChannel.views * Math.pow(1 + mViewsRate, 12));

  animateValue($("#pred1MSubs"), subs, sub1M);
  animateValue($("#pred1MViews"), currentChannel.views, view1M);
  animateValue($("#pred1YSubs"), subs, sub1Y);
  animateValue($("#pred1YViews"), currentChannel.views, view1Y);
}

// ================= BILL =================
function buildBillHTML(orderId, total, dateStr) {
  const rows = cart.map(item => {
    const scopeLabel = item.scope === "video"
      ? `Video: ${item.meta || "—"}`
      : `Channel: ${item.meta || "—"}`;
    return `
      <tr style="border-bottom: 1px solid #eee;">
        <td style="padding: 12px 10px; color:#111;">
          <div style="font-size: 14px;">${item.name}</div>
          <div style="font-size: 10px; color: #8B5CF6; margin-top: 3px; font-weight: 600;">${scopeLabel}</div>
        </td>
        <td style="padding: 12px 10px; text-align: center; font-size: 14px; color:#111;">${item.qty}</td>
        <td style="padding: 12px 10px; text-align: right; font-size: 14px; font-weight: 600; color:#111;">Tk ${(item.price * item.qty).toFixed(2)}</td>
      </tr>`;
  }).join("");

  // Logo block setup (Base64 Safe)
  const logoBlock = logoDataURL
    ? `<div style="
         width: 88px; height: 88px; flex-shrink: 0;
         border-radius: 20px;
         background: #ffffff;
         border: 2px solid #e5e7eb;
         box-shadow: 0 6px 22px rgba(139, 92, 246, 0.28);
         display: flex; align-items: center; justify-content: center;
         overflow: hidden;
         padding: 6px; box-sizing: border-box;
       ">
         <img src="${logoDataURL}"
              style="width: 100%; height: 100%; object-fit: contain; display: block;" />
       </div>`
    : `<div style="
         width: 88px; height: 88px; flex-shrink: 0;
         border-radius: 20px;
         background: linear-gradient(135deg, #8B5CF6, #6366F1);
         box-shadow: 0 6px 22px rgba(139, 92, 246, 0.35);
         display: flex; align-items: center; justify-content: center;
         color: #ffffff; font-size: 42px; font-weight: 800;
         font-family: 'Inter', Arial, sans-serif;
       ">T</div>`;

  const channelBlock = currentChannel ? `
    <div style="background: #f5f3ff; padding: 14px; border-radius: 10px; margin-bottom: 20px; border-left: 4px solid #8B5CF6;">
      <p style="margin: 0; color: #666; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">Channel</p>
      <p style="margin: 5px 0 0 0; font-weight: 700; font-size: 15px; color:#111;">${currentChannel.title}</p>
    </div>` : "";

  return `
    <div style="font-family: 'Inter', Arial, sans-serif; color: #111; background: #ffffff;">
      <div style="display: flex; align-items: center; gap: 16px; border-bottom: 3px solid #8B5CF6; padding-bottom: 18px; margin-bottom: 20px;">
        ${logoBlock}
        <div>
          <h1 style="margin: 0; font-size: 28px; color: #0B1020; letter-spacing: -0.02em; font-weight: 800;">Tubey Shop</h1>
          <p style="margin: 5px 0 0 0; color: #6b7280; font-size: 13px;">YouTube Growth SaaS · Official Receipt</p>
        </div>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
        <div>
          <p style="margin: 0; color: #666; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">Order ID</p>
          <p style="margin: 4px 0 0 0; font-weight: 700; font-size: 13px; color:#111;">${orderId}</p>
        </div>
        <div style="text-align: right;">
          <p style="margin: 0; color: #666; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700;">Date</p>
          <p style="margin: 4px 0 0 0; font-weight: 700; font-size: 13px; color:#111;">${dateStr}</p>
        </div>
      </div>
      ${channelBlock}
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background: #8B5CF6; color: white;">
            <th style="text-align: left; padding: 10px; font-size: 12px; font-weight: 700;">Item</th>
            <th style="text-align: center; padding: 10px; font-size: 12px; font-weight: 700;">Qty</th>
            <th style="text-align: right; padding: 10px; font-size: 12px; font-weight: 700;">Price</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr style="background: #f5f3ff;">
            <td colspan="2" style="padding: 14px 10px; font-weight: 700; font-size: 14px; color:#111;">Total</td>
            <td style="padding: 14px 10px; text-align: right; font-weight: 800; font-size: 20px; color: #8B5CF6;">Tk ${total}</td>
          </tr>
        </tfoot>
      </table>
      <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 12px;">
        <p style="margin: 0; font-size: 12px; color: #92400e; line-height: 1.5;">
          <strong>Status: Processing</strong> — Please wait a few minutes to update order status.
        </p>
      </div>
      <p style="text-align: center; color: #999; font-size: 11px; margin-top: 28px;">
        Thank you for choosing Tubey Shop · tubey.shop
      </p>
    </div>`;
}

async function generateBillJPG() {
  // ১. লোগো প্রি-লোড করা (ফেচ এপিআই দিয়ে)
  if (!logoDataURL) {
    await preloadLogo();
  }

  const orderId = "TB-" + Date.now().toString().slice(-8);
  const dateStr = new Date().toLocaleString("en-BD", { dateStyle: "medium", timeStyle: "short" });
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0).toFixed(2);

  let iosWin = null;
  if (isIOS) {
    iosWin = window.open("", "_blank");
    if (iosWin) {
      iosWin.document.write(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Generating...</title><style>body{margin:0;background:#0B1020;color:#fff;font-family:-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;}</style></head><body><p>Generating your bill...</p></body></html>`);
    }
  }

  const billEl = document.createElement("div");
  billEl.innerHTML = buildBillHTML(orderId, total, dateStr);
  billEl.style.cssText = "position:fixed;left:-9999px;top:0;width:640px;background:#fff;padding:36px;box-sizing:border-box;";
  document.body.appendChild(billEl);

  let dataURL;
  try {
    const canvas = await html2canvas(billEl, { 
      backgroundColor: "#ffffff", 
      scale: 2, 
      useCORS: true, 
      allowTaint: false, // Tainted Canvas প্রতিরোধ করতে
      logging: false 
    });
    dataURL = canvas.toDataURL("image/jpeg", 0.95);
  } catch (err) {
    console.error("Bill Render Error:", err);
    showToast("Logo rendering failed. Generating plain bill...", "warning");
    // ফলব্যাক বিল (লোগো ছাড়া)
    billEl.innerHTML = buildBillHTML(orderId, total, dateStr);
    const fallbackCanvas = await html2canvas(billEl, { backgroundColor: "#ffffff", scale: 2 });
    dataURL = fallbackCanvas.toDataURL("image/jpeg", 0.95);
  } finally {
    document.body.removeChild(billEl);
  }

  lastOrderBill = { dataURL, orderId };

  if (isIOS && iosWin) {
    iosWin.document.open();
    iosWin.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your Bill</title><style>body{margin:0;background:#0B1020;font-family:-apple-system,sans-serif;display:flex;flex-direction:column;align-items:center;padding:20px;min-height:100vh;}.hint{background:#8B5CF6;color:white;padding:14px 20px;border-radius:10px;margin-bottom:20px;text-align:center;font-weight:600;font-size:15px;box-shadow:0 4px 20px rgba(139,92,246,0.4);}img{max-width:100%;height:auto;border-radius:10px;box-shadow:0 10px 40px rgba(0,0,0,0.5);}</style></head><body><div class="hint">Long-press the image and tap "Save to Photos"</div><img src="${dataURL}" alt="Bill" /></body></html>`);
    iosWin.document.close();
  } else {
    const link = document.createElement("a");
    link.download = `tubey-bill-${orderId}.jpg`;
    link.href = dataURL;
    link.click();
  }
  return dataURL;
}

// ================= CHECKOUT =================
$("#checkoutBtn").addEventListener("click", async () => {
  if (cart.length === 0) { showToast("Cart is empty!", "warning"); return; }
  const btn = $("#checkoutBtn");
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing…`;

  $("#orderSuccessModal").classList.remove("hidden");
  try { await generateBillJPG(); }
  catch (err) { console.error(err); showToast("Bill generation failed", "error"); }

  cart = [];
  saveCart();
  updateCartUI();
  $("#cartModal").classList.add("hidden");
  btn.disabled = false;
  btn.innerHTML = `<i class="fa-solid fa-lock"></i> Checkout`;
});

$("#closeSuccessBtn").addEventListener("click", () => $("#orderSuccessModal").classList.add("hidden"));
$("#downloadBillBtn").addEventListener("click", () => {
  if (!lastOrderBill) { showToast("No bill available", "warning"); return; }
  if (isIOS) {
    const win = window.open("");
    if (win) {
      win.document.write(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your Bill</title><style>body{margin:0;background:#0B1020;display:flex;flex-direction:column;align-items:center;padding:20px;font-family:-apple-system,sans-serif;}.hint{background:#8B5CF6;color:#fff;padding:14px 20px;border-radius:10px;margin-bottom:20px;text-align:center;font-weight:600;}img{max-width:100%;height:auto;border-radius:10px;}</style></head><body><div class="hint">Long-press the image and tap "Save to Photos"</div><img src="${lastOrderBill.dataURL}" /></body></html>`);
      win.document.close();
    }
  } else {
    const link = document.createElement("a");
    link.download = `tubey-bill-${lastOrderBill.orderId}.jpg`;
    link.href = lastOrderBill.dataURL;
    link.click();
  }
});

// ================= HELPERS =================
function fmt(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n;
}
function truncate(str, len) {
  return str.length > len ? str.slice(0, len) + "…" : str;
}

// ================= INIT =================
preloadLogo();
updateCartUI();