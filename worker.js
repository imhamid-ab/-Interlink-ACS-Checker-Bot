const TELEGRAM_API = (token) => `https://api.telegram.org/bot${token}`;
const INTERLINK_API = (id) =>
  `https://prod.interlinklabs.ai/api/v1/ambassador-profile/get-profile/${id}`;
const PROFILE_URL = (id) => `https://ambassador.interlinklabs.ai/en/${id}`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/setup") {
      return await setupWebhook(request, env);
    }

    if (
      request.method === "POST" &&
      url.pathname === `/webhook/${env.SECRET}`
    ) {
      const update = await request.json();
      await handleUpdate(update, env);
      return new Response("OK", { status: 200 });
    }

    return new Response("Interlink ACS Bot is running!", { status: 200 });
  },
};

async function setupWebhook(request, env) {
  const workerUrl = new URL(request.url).origin;
  const webhookUrl = `${workerUrl}/webhook/${env.SECRET}`;

  const res = await fetch(`${TELEGRAM_API(env.BOT_TOKEN)}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl }),
  });

  const data = await res.json();
  return new Response(JSON.stringify(data, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}

async function handleUpdate(update, env) {
  const message = update?.message;
  if (!message || !message.text) return;

  const chatId = message.chat.id;
  const text = message.text.trim();
  const threadId = message.message_thread_id ?? null;

  // /start command
  if (text === "/start") {
    await sendMessage(
      env.BOT_TOKEN,
      chatId,
      `👋 Hello! Welcome to the ACS Checker bot.\n\n` +
        `To view the ACS score, send the following command:\n\n` +
        `<code>/ACS [Numeric ID]</code>\n\n` +
        `Example:\n<code>/ACS 000000</code>`,
      threadId,
    );
    return;
  }

  const acsMatch = text.match(/^\/ACS\s+(\d+)$/i);
  if (acsMatch) {
    const userId = acsMatch[1];
    try {
      const res = await fetch(INTERLINK_API(userId));
      const data = await res.json();
      if (!res.ok || !data?.data?.haveProfile) {
        await sendMessage(
          env.BOT_TOKEN,
          chatId,
          `❌ No profile found with ID <code>${userId}</code>.\n\nPlease check the ID.`,
          threadId,
        );
        return;
      }
      const profile = data.data;
      const acs = profile.acs ?? "N/A";
      const firstName = profile.firstName ?? "";
      const lastName = profile.lastName ?? "";
      const tier = profile.userMetadata?.tierNameAmbassador ?? "N/A";
      const tierLevel = profile.userMetadata?.tierLevel ?? "";
      const country = profile.country ?? "N/A";
      const avatar = profile.avatar ?? null;
      const responseText =
        `<b>Here you go, this is the ambassador's info ✅</b>\n\n` +
        `👤 <b>Name:</b> ${firstName} ${lastName}\n` +
        `🆔 <b>ID:</b> <code>${userId}</code>\n` +
        `🌍 <b>Region:</b> ${country}\n` +
        `🏅 <b>Level:</b> ${tier} (Level${tierLevel})\n` +
        `⭐ <b>ACS Score:</b> ${acs}`;

      const buttons = [
        [
          {
            text: "Profile",
            url: PROFILE_URL(userId),
            style: "primary",
          },
        ],
      ];

      if (Array.isArray(profile.socialLinks)) {
        let row = [];

        profile.socialLinks.forEach((item, index) => {
          if (item?.link && item?.social) {
            row.push({
              text: item.social.toUpperCase(),
              url: item.link,
              style: "danger",
            });

            if (row.length === 2) {
              buttons.push(row);
              row = [];
            }
          }
        });

        if (row.length > 0) {
          buttons.push(row);
        }
      }

      const inlineKeyboard = {
        inline_keyboard: buttons,
      };

      if (avatar) {
        await fetch(`${TELEGRAM_API(env.BOT_TOKEN)}/sendPhoto`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            photo: avatar,
            caption: responseText,
            parse_mode: "HTML",
            reply_markup: inlineKeyboard,
            ...(threadId && { message_thread_id: threadId }),
          }),
        });
      } else {
        await sendMessage(
          env.BOT_TOKEN,
          chatId,
          responseText,
          threadId,
          inlineKeyboard,
        );
      }
    } catch (err) {
      await sendMessage(
        env.BOT_TOKEN,
        chatId,
        `Error - Try again ⚠️`,
        threadId,
      );
    }
    return;
  }

  await sendMessage(
    env.BOT_TOKEN,
    chatId,
    `❓ Unknown command.\n\nUse the following command:\n<code>/ACS [ID]</code>`,
    threadId,
  );
}

async function sendMessageAndGetId(token, chatId, text, threadId = null) {
  const body = {
    chat_id: chatId,
    text: text,
    parse_mode: "HTML",
  };
  if (threadId) body.message_thread_id = threadId;

  const res = await fetch(`${TELEGRAM_API(token)}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return await res.json();
}

async function editMessage(token, chatId, messageId, text, replyMarkup = null) {
  const body = {
    chat_id: chatId,
    message_id: messageId,
    text: text,
    parse_mode: "HTML",
  };
  if (replyMarkup) body.reply_markup = replyMarkup;

  await fetch(`${TELEGRAM_API(token)}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function sendPhoto(token, chatId, photoUrl, threadId = null) {
  const body = {
    chat_id: chatId,
    photo: photoUrl,
  };
  if (threadId) body.message_thread_id = threadId;

  await fetch(`${TELEGRAM_API(token)}/sendPhoto`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function sendMessage(
  token,
  chatId,
  text,
  threadId = null,
  replyMarkup = null,
) {
  const body = {
    chat_id: chatId,
    text: text,
    parse_mode: "HTML",
  };
  if (threadId) body.message_thread_id = threadId;
  if (replyMarkup) body.reply_markup = replyMarkup;

  await fetch(`${TELEGRAM_API(token)}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
