/**
 * Fetches the list of users who don't follow you back on Instagram.
 */

/**
 * Instructions:
 * Navigate to your Instagram profile
 * Open the browser console (F12 or Ctrl+Shift+I)
 * Open the "Console" tab
 * Paste this script and press Enter
 * Wait for the script to finish
 * The list of users who don't follow you back will be logged in the console
 * Note: This script uses the Instagram API, which may change or be restricted by Instagram.
 */

(async () => {
  const following = [];
  const followers = [];
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

  const default_count = 20;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const getFollowing = async (maxId = 0) => {
    const res = await fetch(
      `https://www.instagram.com/api/v1/friendships/${myId}/following/?count=${default_count}${
        maxId && `&max_id=${maxId}`
      }`,
      {
        headers,
      }
    );

    const body = await res.json();
    const { status, users, next_max_id } = body;

    if (status !== "ok") return Promise.reject(new Error(status));

    following.push(...users);

    console.log(`Fetched ${following.length}/${following_count} following`);

    if (!next_max_id) return Promise.reject(new Error("finished"));

    const randomDelay = Math.floor(Math.random() * 5) + 1;
    await sleep(randomDelay * 1000);
    await getFollowing(next_max_id);
  };

  const getFollowers = async (maxId = 0) => {
    const res = await fetch(
      `https://www.instagram.com/api/v1/friendships/${myId}/followers/?count=${default_count}${
        maxId && `&max_id=${maxId}`
      }`,
      {
        headers,
      }
    );

    const body = await res.json();
    const { status, users, next_max_id } = body;

    if (status !== "ok") return Promise.reject(new Error(status));

    followers.push(...users);

    console.log(`Fetched ${followers.length}/${followers_count} followers`);

    if (!next_max_id) return Promise.reject(new Error("finished"));

    const randomDelay = Math.floor(Math.random() * 5) + 1;
    await sleep(randomDelay * 1000);

    await getFollowers(next_max_id);
  };

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
