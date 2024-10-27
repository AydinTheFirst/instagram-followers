(async () => {
  const following = [];
  const followers = [];
  const default_count = 5;
  const following_count = document
    .querySelector('a[role="link"][href$="/following/"] .html-span')
    ?.textContent.trim();
  const followers_count = document
    .querySelector('a[role="link"][href$="/followers/"] .html-span')
    ?.textContent.trim();
  const appId = document.body.innerHTML.match(/"APP_ID":"(\d+)"/)[1];
  const myId = document.cookie.match(/ds_user_id=(\d+)/)[1];
  const headers = {
    "x-ig-app-id": appId,
  };
  const getFollowing = (count = default_count, maxId = 0) =>
    fetch(
      `https://www.instagram.com/api/v1/friendships/${myId}/following/?count=${count}${
        maxId && `&max_id=${maxId}`
      }`,
      {
        headers,
      }
    )
      .then((res) => res.json())
      .then((body) => {
        const { status, users, next_max_id } = body;
        if (status !== "ok") return Promise.reject(new Error(status));
        following.push(...users);
        console.log(`Fetched ${following.length}/${following_count} following`);
        if (!next_max_id) return Promise.reject(new Error("finished"));
        return next_max_id;
      })
      .then((nextMaxId) => getFollowing(count, nextMaxId));
  const getFollowers = (count = default_count, maxId = 0) =>
    fetch(
      `https://www.instagram.com/api/v1/friendships/${myId}/followers/?count=${count}${
        maxId && `&max_id=${maxId}`
      }`,
      {
        headers,
      }
    )
      .then((res) => res.json())
      .then((body) => {
        const { status, users, next_max_id } = body;
        if (status !== "ok") return Promise.reject(new Error(status));
        followers.push(...users);
        console.log(`Fetched ${followers.length}/${followers_count} followers`);
        if (!next_max_id) return Promise.reject(new Error("finished"));
        return next_max_id;
      })
      .then((nextMaxId) => getFollowers(count, nextMaxId));
  await getFollowing().catch((error) =>
    console.warn(
      error.message === "finished" ? "Finished fetching following" : error
    )
  );
  await getFollowers().catch((error) =>
    console.warn(
      error.message === "finished" ? "Finished fetching followers" : error
    )
  );
  const followers_ids = followers.map((user) => user.pk);
  const not_following_back = following
    .filter((user) => !followers_ids.includes(user.pk))
    .map((user) => ({
      id: user.pk,
      username: user.username,
      full_name: user.full_name,
      profile_url: `https://www.instagram.com/${user.username}/`,
      profile_pic_url: user.profile_pic_url,
    }));
  console.log("Not following back:");
  console.table(not_following_back, [
    "id",
    "username",
    "full_name",
    "profile_url",
    "profile_pic_url",
  ]);
})();
