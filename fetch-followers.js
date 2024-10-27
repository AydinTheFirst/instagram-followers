(async () => {
  const followers = [];
  const default_count = 12;
  const followers_count = document
    .querySelector('a[role="link"][href$="/followers/"] .html-span')
    ?.textContent.trim();
  const appId = document.body.innerHTML.match(/"APP_ID":"(\d+)"/)[1];
  const myId = document.cookie.match(/ds_user_id=(\d+)/)[1];
  const headers = {
    "x-ig-app-id": appId,
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

  await getFollowers().catch((error) =>
    console.warn(
      error.message === "finished" ? "Finished fetching followers" : error
    )
  );

  const followers_data = followers.map((user) => {
    return {
      id: user.pk,
      username: user.username,
      full_name: user.full_name,
      profile_url: `https://www.instagram.com/${user.username}/`,
      profile_pic_url: user.profile_pic_url,
    };
  });

  // Add a button to copy the data to the clipboard
  const button = document.createElement("button");
  button.textContent = "Copy Followers Data";
  button.style.position = "fixed";
  button.style.top = "10px";
  button.style.left = "10px";
  button.addEventListener("click", () => {
    navigator.clipboard
      .writeText(JSON.stringify(followers_data))
      .then(() => {
        console.log("Copied followers data to clipboard");
        alert("Followers data copied to clipboard!");
      })
      .catch((err) => {
        console.error("Failed to copy data to clipboard:", err);
      });
  });
  document.body.appendChild(button);

  alert(
    "Fetching followers data completed! Click the button to copy the data."
  );
})();
