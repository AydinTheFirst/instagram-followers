(async () => {
  // ====== Ayarlar ======
  const DEFAULT_COUNT = 50; // her istekte kaç kullanıcı çekilsin (10-100 arası deneyebilirsin)
  const MIN_DELAY_MS = 300; // her istek sonrası minimum gecikme
  const MAX_DELAY_MS = 1200; // maksimum gecikme (rastgele)
  const AUTO_DOWNLOAD_CSV = true; // sonuç CSV olarak otomatik indirilsin mi?
  const AUTO_DOWNLOAD_JSON = false; // sonuç JSON olarak otomatik indirilsin mi?

  // ====== Yardımcılar ======
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const randDelay = () =>
    MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1));

  function safeQuerySelectorText(selector) {
    const el = document.querySelector(selector);
    return el ? el.textContent.trim() : null;
  }

  function downloadFile(filename, content, mime = "text/plain") {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function toCSV(arr) {
    if (!arr.length) return "";
    const keys = Object.keys(arr[0]);
    const rows = arr.map((o) =>
      keys
        .map((k) => {
          const val = o[k] == null ? "" : String(o[k]);
          // basit CSV escape
          return `"${val.replace(/"/g, '""')}"`;
        })
        .join(",")
    );
    return [keys.join(","), ...rows].join("\n");
  }

  // ====== Başlangıç bilgileri ======
  try {
    const followingCountText = safeQuerySelectorText(
      'a[role="link"][href$="/following/"] span'
    );
    const followersCountText = safeQuerySelectorText(
      'a[role="link"][href$="/followers/"] span'
    );

    const followingCount = followingCountText
      ? parseInt(followingCountText.replace(/\D/g, ""), 10)
      : null;
    const followersCount = followersCountText
      ? parseInt(followersCountText.replace(/\D/g, ""), 10)
      : null;

    console.log("Detected counts -> following:", followingCount, "followers:", followersCount);

    // app id ve user id çıkarma (farklı Instagram sürümlerinde farklı olabilir)
    let appId = null;
    try {
      const bodyHTML = document.body.innerHTML;
      const matchApp = bodyHTML.match(/"app_id"\s*:\s*"(\d+)"/i) || bodyHTML.match(/"APP_ID":"(\d+)"/);
      if (matchApp) appId = matchApp[1];
    } catch (e) {
      // ignore
    }
    if (!appId) {
      // bazen window._sharedData içinde olur veya meta tag
      appId = window._sharedData && window._sharedData?.config?.viewer?.id ? null : appId;
    }

    let myId = null;
    try {
      const cookieMatch = document.cookie.match(/ds_user_id=(\d+)/);
      if (cookieMatch) myId = cookieMatch[1];
    } catch (e) {}

    if (!myId) {
      console.warn("Kullanıcı ID'si (ds_user_id) cookie'sinden alınamadı. Bazı endpoint'ler çalışmayabilir.");
    }

    // headers
    const headers = {};
    if (appId) headers["x-ig-app-id"] = appId;

    // ====== Çekme fonksiyonu (robust) ======
    async function fetchPaginated(kind = "following", count = DEFAULT_COUNT) {
      // kind: 'following' veya 'followers'
      console.log(`Fetching ${kind}...`);
      const results = [];
      let gotGraphQL = false;

      // İlk deneme: API v1 friendships (myId gerektirir)
      if (myId) {
        try {
          let maxId = null;
          let page = 0;
          while (true) {
            page++;
            const url =
              `https://www.instagram.com/api/v1/friendships/${myId}/${kind}/?count=${count}` +
              (maxId ? `&max_id=${encodeURIComponent(maxId)}` : "");
            const res = await fetch(url, { headers, credentials: "same-origin" });
            if (!res.ok) {
              console.warn(`${kind} v1 endpoint returned ${res.status} - ${res.statusText}`);
              break;
            }
            const json = await res.json();
            if (json.users && Array.isArray(json.users)) {
              results.push(...json.users);
              console.log(`[v1][page ${page}] fetched ${results.length}${followingCount ? `/${followingCount}` : ""} ${kind}`);
            } else {
              // beklenmeyen yapı
              console.warn("v1 endpoint unexpected response shape, falling back to GraphQL if possible.");
              break;
            }
            if (!json.next_max_id) {
              console.log(`Finished v1 ${kind} (no next_max_id).`);
              return results;
            }
            maxId = json.next_max_id;
            await sleep(randDelay());
          }
        } catch (err) {
          console.warn("v1 fetch error:", err);
        }
      }

      // GraphQL fallback (kullanıcı adı üzerinden)
      try {
        // kullanıcı adını DOM'dan al
        const usernameEl = document.querySelector('header section h2') || document.querySelector('header h1') || document.querySelector('header div > div > h1');
        let username = null;
        if (usernameEl) username = usernameEl.textContent.trim();
        if (!username) {
          // başka yöntem: url path
          const pathParts = location.pathname.split("/").filter(Boolean);
          username = pathParts.length ? pathParts[0] : null;
        }

        if (!username) {
          console.warn("GrafQL için kullanıcı adı alınamadı. GraphQL fallback atlandı.");
          return results;
        }

        // GraphQL query id veya query_hash bazen değişir; burada dinamik olarak pageInfo kullanıp edge'i çekmeye çalışacağız.
        // İlk önce kullanıcı id'sini al
        const userInfoRes = await fetch(`https://www.instagram.com/${username}/?__a=1`, { headers, credentials: "same-origin" });
        if (!userInfoRes.ok) {
          console.warn("Could not fetch user JSON via __a=1", userInfoRes.status);
          return results;
        }
        const userJson = await userInfoRes.json();
        // farklı yapılar olabilir
        let userId = null;
        try {
          userId = userJson?.graphql?.user?.id || userJson?.logging_page_id?.split(":").pop();
        } catch (e) {}
        if (!userId) {
          console.warn("GraphQL: userId bulunamadı.");
          return results;
        }

        // edgeName
        const edge = kind === "followers" ? "edge_followed_by" : "edge_follow";
        let hasNextPage = true;
        let endCursor = null;
        let page = 0;

        while (hasNextPage) {
          page++;
          // GraphQL query kullanımı (query_hash değişebildiği için parameter olarak only variables ile çağırıyoruz)
          const variables = {
            id: userId,
            include_reel: false,
            fetch_mutual: false,
            first: count,
            after: endCursor,
          };
          const params = new URLSearchParams({ variables: JSON.stringify(variables) });
          // GraphQL endpoint (genelde /graphql/query/?) kullanılıyor
          const url = `https://www.instagram.com/graphql/query/?query_id=17851374694183129&${params.toString()}`;
          // Not: query_id farklı olabilir; sunucu 404 dönerse diğer yaygın query_hash'leri deneyebiliriz.
          const res = await fetch(url, { headers, credentials: "same-origin" });
          if (!res.ok) {
            console.warn(`[GraphQL] ${kind} request returned ${res.status}. Aborting GraphQL loop.`);
            break;
          }
          const j = await res.json();
          // deep path may vary
          const edges =
            j?.data?.user?.[edge]?.edges ||
            j?.data?.user?.[edge]?.edges ||
            j?.data?.user?.[edge]?.edges ||
            (Array.isArray(j?.data?.user?.[edge]) && j?.data?.user?.[edge]);

          // Different shapes: sometimes items are inside node
          if (j?.data?.user?.[edge]?.edges) {
            const items = j.data.user[edge].edges.map((e) => e.node || e);
            results.push(...items);
            hasNextPage = j.data.user[edge].page_info?.has_next_page ?? false;
            endCursor = j.data.user[edge].page_info?.end_cursor ?? null;
            console.log(`[graph][page ${page}] fetched ${results.length}${followingCount ? `/${followingCount}` : ""} ${kind}`);
          } else if (Array.isArray(edges)) {
            // fallback
            results.push(...edges);
            hasNextPage = false;
            endCursor = null;
            console.log(`[graph][page ${page}] fallback fetched ${results.length} ${kind}`);
          } else {
            console.warn("GraphQL response shape unexpected, breaking.");
            break;
          }

          if (!hasNextPage) break;
          await sleep(randDelay());
        }

        return results;
      } catch (err) {
        console.warn("GraphQL fallback hata:", err);
        return results;
      }
    }

    // ====== Çalıştırma ======
    const following = await fetchPaginated("following", DEFAULT_COUNT);
    console.log(`Finished fetching following: ${following.length} items.`);
    const followers = await fetchPaginated("followers", DEFAULT_COUNT);
    console.log(`Finished fetching followers: ${followers.length} items.`);

    // Normalize: bazı endpoint'ler user objelerini 'node' içinde verir
    const normalize = (arr) =>
      arr.map((u) => (u.node ? u.node : u)).map((u) => ({
        id: u.pk || u.id || u.pk_id || u.user_id || (u.owner && u.owner.pk) || null,
        username: u.username || u.user?.username || (u.owner && u.owner.username) || null,
        full_name: u.full_name || u.fullname || u.user?.full_name || "",
        profile_url: (u.username && `https://www.instagram.com/${u.username}/`) || "",
        profile_pic_url:
          u.profile_pic_url ||
          u.profile_pic_url_hd ||
          (u.user && (u.user.profile_pic_url_hd || u.user.profile_pic_url)) ||
          "",
      }));

    const normFollowing = normalize(following);
    const normFollowers = normalize(followers);

    const followerIds = new Set(normFollowers.map((f) => String(f.id)));
    const notFollowingBack = normFollowing.filter((f) => !followerIds.has(String(f.id)));

    console.log("Summary:");
    console.log("Following:", normFollowing.length);
    console.log("Followers:", normFollowers.length);
    console.log("Not following back:", notFollowingBack.length);
    console.table(notFollowingBack, ["id", "username", "full_name", "profile_url", "profile_pic_url"]);

    // Export
    if (AUTO_DOWNLOAD_JSON) {
      downloadFile("not_following_back.json", JSON.stringify(notFollowingBack, null, 2), "application/json");
    }
    if (AUTO_DOWNLOAD_CSV) {
      const csv = toCSV(notFollowingBack);
      if (csv) downloadFile("not_following_back.csv", csv, "text/csv");
    }

    // Return data so caller (console) can access via promise resolution if needed
    return { following: normFollowing, followers: normFollowers, not_following_back: notFollowingBack };
  } catch (err) {
    console.error("Beklenmeyen hata:", err);
    throw err;
  }
})();
